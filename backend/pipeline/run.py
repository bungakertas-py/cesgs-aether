"""
Orchestrator CESGS Aether (turunan Kertas Emisi): ambil run CAMS terbaru -> render tiap langkah ->
rekonsiliasi (retensi window) -> tulis catalog.json untuk frontend.

Jalankan: python run.py
Struktur keluarannya SAMA PERSIS dengan Kertas Cuaca, jadi frontend yang diwarisi
bisa membacanya tanpa diubah.
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os
from pathlib import Path

import numpy as np

import config as C
from config import KEEP_PAST_HOURS, LAYERS, OUTPUT_DIR
import cams
import firms
from process import (CITY_PLACES, _export_velocity_json, hitung_aqi,
                     hitung_ispu, sampel_kota,
                     write_city_data, write_point_series, write_scalar_frame)

# Parameter yang diarsipkan tiap hari: tujuh polutan + ISPU. Format berkas harian
# ini SUSAH diubah setelah riwayat menumpuk, jadi daftar dan urutannya dipatok.
ARSIP_PARAM = ["ispu", "pm25", "pm10", "co", "no2", "so2", "o3", "aod"]
ARSIP_DIR = C.BACKEND_DIR.parent / "frontend" / "data" / "arsip"


def _parse(ts: str) -> dt.datetime:
    return dt.datetime.strptime(ts, "%Y-%m-%dT%H:00:00Z").replace(tzinfo=dt.timezone.utc)


def _frame_files(m: dict) -> list[str]:
    """Berkas milik satu frame, untuk dihapus saat frame itu dibuang.

    Velocity JSON sengaja TIDAK ikut. Di Kertas Emisi satu berkas velocity dipakai
    bersama oleh SEMUA layer pada langkah yang sama, jadi menghapusnya waktu satu
    frame dibuang akan melumpuhkan layer lain di langkah itu."""
    out = [m["_path"]]
    for k in ("preview_image", "data_image"):
        nama = m.get(k)
        if nama:
            out.append(str(OUTPUT_DIR / nama))
    return out

def reconcile_and_catalog(run: dt.datetime) -> tuple[dict, int]:
    """Kumpulkan SEMUA frame di disk (lintas run), buang yang lebih tua dari
    (run - KEEP_PAST_HOURS), dedup per (layer, valid_time) pilih run terbaru,
    lalu susun catalog. Mengembalikan (catalog, jumlah_frame)."""
    cutoff = run - dt.timedelta(hours=KEEP_PAST_HOURS)

    metas: list[dict] = []
    for mp in glob.glob(str(OUTPUT_DIR / "*.json")):
        p = Path(mp)
        if p.name == "catalog.json" or p.name.endswith("_velocity.json"):
            continue
        try:
            m = json.loads(p.read_text())
        except Exception:
            continue
        if "valid_time" not in m or "layer" not in m:
            continue
        m["_path"] = mp
        metas.append(m)

    # 1) buang frame lebih tua dari cutoff (-24 jam)
    kept: list[dict] = []
    for m in metas:
        if _parse(m["valid_time"]) < cutoff:
            for f in _frame_files(m):
                Path(f).unlink(missing_ok=True)
        else:
            kept.append(m)

    # 2) dedup per (layer, valid_time) -> run_time terbaru menang; sisanya dihapus
    best: dict[tuple, dict] = {}
    losers: list[dict] = []
    for m in kept:
        k = (m["layer"], m["valid_time"])
        cur = best.get(k)
        if cur is None or _parse(m["run_time"]) > _parse(cur["run_time"]):
            if cur is not None:
                losers.append(cur)
            best[k] = m
        else:
            losers.append(m)
    for m in losers:
        for f in _frame_files(m):
            Path(f).unlink(missing_ok=True)

    # 3) susun catalog dari frame pemenang
    by_layer: dict[str, list[dict]] = {}
    for m in best.values():
        by_layer.setdefault(m["layer"], []).append(m)

    catalog = {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": "GFS",
        "run_time": run.strftime("%Y-%m-%dT%H:00:00Z"),
        "region": None,
        "layers": {},
    }
    total = 0
    for layer_key in LAYERS:  # jaga urutan definisi (angin dulu, lalu hujan)
        frames = by_layer.get(layer_key)
        if not frames:
            continue
        frames.sort(key=lambda m: _parse(m["valid_time"]))
        if catalog["region"] is None:
            catalog["region"] = {"bounds": frames[0]["bounds"]}
            if frames[0].get("image_bounds"):
                catalog["region"]["image_bounds"] = frames[0]["image_bounds"]
        entry = {
            "kind": frames[0]["kind"],
            "level": frames[0]["level"],
            "units": frames[0]["units"],
            "frames": [],
        }
        if frames[0].get("unscale") is not None:
            entry["unscale"] = frames[0]["unscale"]
        for m in frames:
            fr = {
                "valid_time": m["valid_time"],
                "forecast_step_hours": m["forecast_step_hours"],
                "preview_image": m["preview_image"],
            }
            for key in ("data_image", "velocity_json", "speed_knots_max", "value_max"):
                if m.get(key) is not None:
                    fr[key] = m[key]
            entry["frames"].append(fr)
        catalog["layers"][layer_key] = entry
        total += len(frames)
    return catalog, total


def _buka(nc):
    import xarray as xr
    ds = xr.open_dataset(nc)
    lat = np.asarray(ds["latitude"].values, dtype="f8")
    lon = np.asarray(ds["longitude"].values, dtype="f8")
    utara_dulu = lat[0] > lat[-1]                 # render butuh baris-0 = utara
    latN = lat if utara_dulu else lat[::-1]
    grid = {"west": float(lon[0]), "east": float(lon[-1]),
            "north": float(latN[0]), "south": float(latN[-1]),
            "width": int(lon.size), "height": int(latN.size)}
    jam = [int(x / 3600e9) for x in ds["forecast_period"].values.astype("int64")]
    return ds, grid, utara_dulu, jam


def _ambil(ds, nama, i, utara_dulu):
    a = np.asarray(ds[nama].isel(forecast_period=i).squeeze().values, dtype="f8")
    return a if utara_dulu else a[::-1]


def _run_paksa():
    """CAMS_RUN=20260819-12 memaksa satu run tertentu, melewati penjajakan ke ADS.

    Gunanya untuk render ulang di lokal: berkas mentahnya sudah ada di cache, jadi
    perubahan palet atau perhitungan bisa diuji tanpa menunggu antrean ADS."""
    v = os.environ.get("CAMS_RUN", "").strip()
    if not v:
        return None
    tgl, jam = v.split("-")
    return dt.datetime.strptime(tgl, "%Y%m%d").date(), f"{int(jam):02d}:00"


def main() -> None:
    single = [v["cams_var"] for v in LAYERS.values() if v["src"] == "single"]
    model = [v["cams_var"] for v in LAYERS.values() if v["src"] == "model"]
    sfc = single + [C.WIND["cams_u"], C.WIND["cams_v"]] + C.UDARA["cams"]

    # Daftar variabel permukaan diserahkan ke penjajak run supaya yang diuji itu
    # persis permintaan yang nanti dikirim, cuma langkah terakhirnya saja. Run yang
    # baru separuh terbit jadi ketahuan di sini, bukan setelah lima menit.
    hari, jam_run = _run_paksa() or cams.latest_available_run(sfc)
    run = dt.datetime.combine(hari, dt.time(int(jam_run[:2])), tzinfo=dt.timezone.utc)
    print(f"Run CAMS terpilih: {run:%Y-%m-%d %H}Z")

    # DUA permintaan terpisah. Variabel permukaan dan variabel 3D tak bisa digabung,
    # yang 3D butuh model_level dan ADS menolak kalau dicampur.
    print("\n[1/2] variabel permukaan + angin + suhu/tekanan")
    nc_s = cams.fetch(hari, jam_run, sfc,
                      dest=C.RAW_DIR / f"cams_sfc_{hari:%Y%m%d}_{jam_run[:2]}.nc")
    print("[2/2] gas di model_level 137 (lapisan paling bawah)")
    nc_m = cams.fetch(hari, jam_run, model, dest=C.RAW_DIR / f"cams_ml_{hari:%Y%m%d}_{jam_run[:2]}.nc",
                      model_level=["137"])

    ds_s, grid, up, jam_lead = _buka(nc_s)
    ds_m, _, up_m, _ = _buka(nc_m)
    print(f"\ngrid {grid['width']}x{grid['height']}  "
          f"bujur {grid['west']:.1f}..{grid['east']:.1f}  lintang {grid['south']:.1f}..{grid['north']:.1f}")
    print(f"{len(jam_lead)} langkah, tiap {C.CAMS['leadtime_step']} jam sampai {jam_lead[-1]} jam")

    # Velocity angin: satu per langkah, ditempel ke SEMUA frame parameter apa pun.
    vel_nama = {}
    seri_u, seri_v = [], []          # deret angin padat untuk fitur Arah Asap
    for i, fstep in enumerate(jam_lead):
        u = _ambil(ds_s, C.WIND["nc_u"], i, up)
        v = _ambil(ds_s, C.WIND["nc_v"], i, up)
        seri_u.append(u); seri_v.append(v)
        nama = f"wind_{run:%Y%m%d_%H}_f{fstep:03d}_velocity.json"
        _export_velocity_json(u, v, grid, run, fstep, OUTPUT_DIR / nama)
        vel_nama[fstep] = nama
    print(f"velocity angin: {len(vel_nama)} berkas")

    # Kerapatan udara per langkah, untuk mengubah rasio campuran gas jadi ug/m3.
    rho = [_ambil(ds_s, C.UDARA["nc_p"], i, up) / (C.R_UDARA * _ambil(ds_s, C.UDARA["nc_t"], i, up))
           for i in range(len(jam_lead))]
    print(f"kerapatan udara: rata {np.mean([r.mean() for r in rho]):.3f} kg/m3")

    point_meta = {}

    # Angin 10 m sebagai DERET TITIK, untuk fitur Arah Asap di frontend. Berkas
    # velocity JSON di atas 1,8 MB PER JAM, jadi lintasan 48 jam lewat berkas
    # itu berarti 86 MB. Dalam format deret int16 bergzip, 5 hari penuh cuma
    # beberapa MB, dan frontend baru memuatnya waktu fitur itu dipakai.
    # Dipotong ke wilayah yang mungkin dilewati asap dari Indonesia dalam 48 jam,
    # 80-160 BT dan 25 LS sampai 22 LU. Domain penuh CAMS di sini 62-180 BT, dan
    # potongan ini memangkas berkasnya jadi sekitar 2 MB per komponen.
    waktu_angin = [(run + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:00:00Z") for h in jam_lead]
    g_angin, iris = _potong_grid(grid, 80.0, 160.0, -25.0, 22.0)
    for key, seri in (("angin_u", seri_u), ("angin_v", seri_v)):
        pm = write_point_series(key, [m[iris] for m in seri], waktu_angin, g_angin)
        pm.update({"units": "m/s", "daily": False})
        point_meta[key] = pm
    print(f"deret angin: {len(seri_u)} langkah -> pd_angin_u, pd_angin_v")
    medan_semua = {}
    kota_medan = {}      # semua parameter di SATU sumbu waktu, untuk label kota
    for key, lay in LAYERS.items():
        if lay["src"] == "turunan":
            continue                          # ISPU dihitung setelah semua parameter siap
        ds = ds_s if lay["src"] == "single" else ds_m
        uu = up if lay["src"] == "single" else up_m
        medan = []
        for i in range(len(jam_lead)):
            a = _ambil(ds, lay["nc_var"], i, uu)
            if lay["conv"] == "massa":
                a = a * 1e9                       # kg/m3 -> ug/m3
            elif lay["conv"] == "rasio":
                a = a * rho[i] * 1e9              # kg/kg * kg/m3 -> ug/m3
            medan.append(a)
        medan_semua[key] = medan

        if lay["daily"]:
            n, seri, waktu = _tulis_harian(key, lay, medan, jam_lead, run, grid, vel_nama)
            # Label kota memakai satu sumbu waktu untuk semua parameter. Rata-rata
            # harian dikembalikan ke tiap langkah di hari yang sama, jadi label PM
            # menampilkan rata 24 jam hari itu, bukan angka sesaat.
            kota_medan[key] = _sebar_harian(seri, waktu, jam_lead, run)
        else:
            n = _tulis_per_langkah(key, lay, medan, jam_lead, run, grid, vel_nama)
            seri, waktu = medan, [(run + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:00:00Z")
                                  for h in jam_lead]
            kota_medan[key] = medan
        pm = write_point_series(key, seri, waktu, grid)
        pm["units"] = lay["units"]
        pm["daily"] = bool(lay["daily"])
        point_meta[key] = pm
        rata = np.nanmean([m.mean() for m in medan])
        maks = np.nanmax([np.nanmax(m) for m in medan])
        sat = lay["units"] or "tanpa satuan"
        print(f"  {key:5} {n:>3} frame  rata {rata:9.3f}  maks {maks:10.2f}  {sat}")

    # ISPU, turunan dari enam parameter di atas. Harus SETELAH loop, karena butuh
    # semuanya sekaligus untuk mengambil yang tertinggi.
    try:
        pra = _pemanasan_ispu(hari, jam_run)
        print(f"  pemanasan ISPU: {len(pra['pm25'])} langkah dari run "
              f"{hari - dt.timedelta(days=1):%Y-%m-%d} {jam_run[:2]}Z")
    except Exception as e:
        pra = None
        print(f"  pemanasan ISPU GAGAL ({e}); ISPU mulai 24 jam setelah waktu run")
    seri_i, seri_k, waktu_i = _tulis_ispu(medan_semua, jam_lead, run, grid, vel_nama, pra)
    pm = write_point_series("ispu", seri_i, waktu_i, grid)
    pm.update({"units": "", "daily": False, "window_hours": C.ISPU_WINDOW_HOURS})
    pmk = write_point_series("ispu_kritis", seri_k, waktu_i, grid)
    pmk.update({"units": "", "daily": False})
    pm["kritis_file"] = pmk["file"]
    pm["kritis_param"] = C.ISPU_PARAM
    point_meta["ispu"] = pm
    point_meta["ispu_kritis"] = pmk
    kota_medan["ispu"] = seri_i
    rata_i = np.nanmean([m.mean() for m in seri_i])
    maks_i = np.nanmax([np.nanmax(m) for m in seri_i])
    print(f"  {'ispu':5} {len(seri_i):>3} frame  rata {rata_i:9.3f}  maks {maks_i:10.2f}  "
          f"indeks (jendela {C.ISPU_WINDOW_HOURS} jam bergulir)")
    _ringkas_kritis(seri_i, seri_k)

    # AQI (US EPA), PEMBANDING ISPU. Basis rata bergulir yang sama, tapi jendela
    # per polutan gaya EPA dan skala indeks berbeda. Pakai pemanasan yang sama.
    seri_a, seri_ak, waktu_a = _tulis_aqi(medan_semua, jam_lead, run, grid, vel_nama, pra)
    pm = write_point_series("aqi", seri_a, waktu_a, grid)
    pm.update({"units": "", "daily": False})
    pmak = write_point_series("aqi_kritis", seri_ak, waktu_a, grid)
    pmak.update({"units": "", "daily": False})
    pm["kritis_file"] = pmak["file"]
    pm["kritis_param"] = C.AQI_PARAM
    point_meta["aqi"] = pm
    point_meta["aqi_kritis"] = pmak
    rata_a = np.nanmean([m.mean() for m in seri_a])
    maks_a = np.nanmax([np.nanmax(m) for m in seri_a])
    print(f"  {'aqi':5} {len(seri_a):>3} frame  rata {rata_a:9.3f}  maks {maks_a:10.2f}  "
          f"indeks EPA (pembanding ISPU)")

    waktu_penuh = [(run + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:00:00Z") for h in jam_lead]
    ukuran = write_city_data(kota_medan, waktu_penuh, grid)
    print(f"  nilai per kota: {len(kota_medan)} parameter, {ukuran/1e6:.2f} MB")

    # Arsip harian (riwayat), diturunkan dari nilai per kota.
    places_k, kota_k = _kota_arsip(kota_medan, grid, waktu_penuh)
    _tulis_arsip(places_k, kota_k, waktu_penuh, run)

    # Overlay titik panas VIIRS (pengamatan, bukan ramalan). Berdiri sendiri, tak
    # tergantung grid/forecast, jadi kalau gagal pun sisa pipeline tetap terbit.
    _tulis_titik_api()

    ds_s.close(); ds_m.close()
    (OUTPUT_DIR / "point_meta.json").write_text(json.dumps(point_meta, indent=2))
    tot = sum((OUTPUT_DIR / v["file"]).stat().st_size for v in point_meta.values())
    print(f"deret titik: {len(point_meta)} berkas, {tot/1e6:.1f} MB")

    catalog, total = reconcile_and_catalog(run)
    (OUTPUT_DIR / "catalog.json").write_text(json.dumps(catalog, indent=2))
    print(f"\nSelesai. {total} frame, {len(catalog['layers'])} layer -> catalog.json")


def _potong_grid(grid: dict, barat: float, timur: float, selatan: float, utara: float):
    """Grid dan irisan numpy untuk memotong medan (baris-0 utara) ke satu kotak.
    Tepinya dijepit ke domain yang ada dan jatuh tepat di titik grid."""
    nx, ny = grid["width"], grid["height"]
    dx = (grid["east"] - grid["west"]) / (nx - 1)
    dy = (grid["north"] - grid["south"]) / (ny - 1)
    x0 = max(0, int(round((barat - grid["west"]) / dx)))
    x1 = min(nx - 1, int(round((timur - grid["west"]) / dx)))
    y0 = max(0, int(round((grid["north"] - utara) / dy)))
    y1 = min(ny - 1, int(round((grid["north"] - selatan) / dy)))
    g = {"width": x1 - x0 + 1, "height": y1 - y0 + 1,
         "west": grid["west"] + x0 * dx, "east": grid["west"] + x1 * dx,
         "north": grid["north"] - y0 * dy, "south": grid["north"] - y1 * dy}
    return g, (slice(y0, y1 + 1), slice(x0, x1 + 1))


def _pemanasan_ispu(hari_run, jam_run):
    """Ambil 24 jam pertama dari run KEMARIN, khusus mengisi jendela ISPU.

    Run hari ini mulai di langkah 0, sedangkan ISPU butuh rata-rata 24 jam KE
    BELAKANG. Tanpa ini, ISPU baru punya angka 24 jam setelah waktu run, dan layer
    utama aplikasi jadi kosong untuk "sekarang".

    Frame run kemarin TIDAK bisa diandalkan sebagai gantinya: `backend/data/output`
    ada di .gitignore dan GitHub Actions selalu checkout bersih, jadi di situs live
    folder itu selalu mulai kosong dan retensi KEEP_PAST_HOURS tak pernah terpakai.

    Run kemarin jam yang sama, langkah 0..21, memberi waktu berlaku T-24 sampai T-3.
    Langkah T sendiri diambil dari run hari ini yang lebih segar."""
    hari = hari_run - dt.timedelta(days=1)
    lead = [str(h) for h in range(0, C.ISPU_WINDOW_HOURS, C.CAMS["leadtime_step"])]
    perlu = C.ISPU_PARAM + ["pbl"]
    single = [C.LAYERS[k]["cams_var"] for k in perlu if C.LAYERS[k]["src"] == "single"]
    model = [C.LAYERS[k]["cams_var"] for k in perlu if C.LAYERS[k]["src"] == "model"]
    nc_s = cams.fetch(hari, jam_run, single + C.UDARA["cams"], lead=lead,
                      dest=C.RAW_DIR / f"cams_pra_sfc_{hari:%Y%m%d}_{jam_run[:2]}.nc")
    nc_m = cams.fetch(hari, jam_run, model, lead=lead, model_level=["137"],
                      dest=C.RAW_DIR / f"cams_pra_ml_{hari:%Y%m%d}_{jam_run[:2]}.nc")
    ds_s, _, up, jam_l = _buka(nc_s)
    ds_m, _, up_m, _ = _buka(nc_m)
    rho = [_ambil(ds_s, C.UDARA["nc_p"], i, up) / (C.R_UDARA * _ambil(ds_s, C.UDARA["nc_t"], i, up))
           for i in range(len(jam_l))]
    out = {}
    for key in perlu:
        lay = C.LAYERS[key]
        ds, uu = (ds_s, up) if lay["src"] == "single" else (ds_m, up_m)
        arr = []
        for i in range(len(jam_l)):
            a = _ambil(ds, lay["nc_var"], i, uu)
            if lay["conv"] == "massa":
                a = a * 1e9
            elif lay["conv"] == "rasio":
                a = a * rho[i] * 1e9
            arr.append(a)
        out[key] = arr
    ds_s.close(); ds_m.close()
    return out


def _tulis_ispu(medan_semua, jam_lead, run, grid, vel_nama, pemanasan=None):
    """ISPU dari jendela BERGULIR 24 jam, bukan blok harian.

    Pasal 6 ayat 1 Permen LHK 14/2020: ISPU dihitung tiap jam dari data pemantauan
    24 jam secara terus-menerus. Jumlah langkah per jendela = ISPU_WINDOW_HOURS //
    leadtime_step, jadi ikut cadence. Langkah paling awal tiap run bisa TIDAK punya
    ISPU kalau jendelanya belum penuh. Lubang itu ditambal oleh langkah pemanasan
    dari run kemarin (di frontend juga oleh frame run sebelumnya dalam retensi)."""
    nwin = C.ISPU_WINDOW_HOURS // C.CAMS["leadtime_step"]
    pakai = [p for p in C.ISPU_PARAM if p in medan_semua]
    # Deret gabungan: langkah pemanasan dari run kemarin di depan, run ini di belakang.
    gab = {p: list((pemanasan or {}).get(p, [])) + list(medan_semua[p]) for p in pakai}
    geser = len(gab[pakai[0]]) - len(jam_lead)     # berapa langkah pemanasan yang ada
    # Kalau pemanasannya kurang, langkah paling awal terpaksa dilewati daripada
    # menyajikan rata-rata jendela yang belum genap 24 jam sebagai kalau-kalau genap.
    mulai = 0 if geser >= nwin else nwin - geser
    seri, seri_kritis, waktu = [], [], []
    for i in range(mulai, len(jam_lead)):
        j = geser + i
        jendela = slice(j - nwin, j + 1)
        rata = {par: np.nanmean(np.stack(gab[par][jendela]), axis=0) for par in pakai}
        ispu, kritis = hitung_ispu(rata)
        fstep = jam_lead[i]
        valid = run + dt.timedelta(hours=fstep)
        write_scalar_frame(ispu, grid, "ispu", run, valid, "", f"f{fstep:03d}",
                           extra={"model": "CAMS", "velocity_json": vel_nama[fstep],
                                  "window_hours": C.ISPU_WINDOW_HOURS})
        seri.append(ispu)
        seri_kritis.append(kritis)
        waktu.append(valid.strftime("%Y-%m-%dT%H:00:00Z"))
    return seri, seri_kritis, waktu


def _tulis_aqi(medan_semua, jam_lead, run, grid, vel_nama, pemanasan=None):
    """AQI (US EPA), pembanding ISPU. Jendela rata-rata BEDA per polutan sesuai EPA:
    PM 24 jam, O3 dan CO 8 jam, SO2 dan NO2 1 jam. Selebihnya seperti _tulis_ispu:
    langkah pemanasan run kemarin ditaruh di depan untuk mengisi jendela awal.

    Jendela terpanjang (PM 24 jam) yang menentukan mulai dari langkah mana AQI
    punya angka; itu sama dengan jendela ISPU, jadi pemanasan yang sama cukup."""
    step = C.CAMS["leadtime_step"]
    nmax = C.ISPU_WINDOW_HOURS // step        # jendela terpanjang = PM 24 jam
    pakai = [p for p in C.AQI_PARAM if p in medan_semua]
    gab = {p: list((pemanasan or {}).get(p, [])) + list(medan_semua[p]) for p in pakai}
    geser = len(gab[pakai[0]]) - len(jam_lead)
    mulai = 0 if geser >= nmax else nmax - geser
    seri, seri_kritis, waktu = [], [], []
    for i in range(mulai, len(jam_lead)):
        j = geser + i
        rata = {}
        for par in pakai:
            w = max(1, C.AQI_WINDOW_HOURS[par] // step)
            rata[par] = np.nanmean(np.stack(gab[par][slice(j - w + 1, j + 1)]), axis=0)
        aqi, kritis = hitung_aqi(rata)
        fstep = jam_lead[i]
        valid = run + dt.timedelta(hours=fstep)
        write_scalar_frame(aqi, grid, "aqi", run, valid, "", f"f{fstep:03d}",
                           extra={"model": "CAMS", "velocity_json": vel_nama[fstep]})
        seri.append(aqi)
        seri_kritis.append(kritis)
        waktu.append(valid.strftime("%Y-%m-%dT%H:00:00Z"))
    return seri, seri_kritis, waktu


def _ringkas_kritis(seri_i, seri_k) -> None:
    """Cetak sebaran pencemar kritis. Berguna untuk memeriksa kewajaran: di
    Indonesia PM2.5 memang biasanya yang menentukan, kalau bukan itu curigai
    konversi satuannya."""
    kode = np.stack(seri_k).ravel()
    n = kode.size
    bagian = [(C.ISPU_PARAM[k], int((kode == k).sum())) for k in range(len(C.ISPU_PARAM))]
    bagian = [(nama, c) for nama, c in bagian if c]
    bagian.sort(key=lambda x: -x[1])
    txt = ", ".join(f"{nama} {100 * c / n:.1f}%" for nama, c in bagian)
    print(f"  pencemar kritis: {txt}")


def _sebar_harian(seri, waktu, jam_lead, run):
    """Kembalikan rata-rata harian ke sumbu langkah penuh: tiap langkah memakai
    rata-rata hari WIB tempat langkah itu jatuh."""
    per_tgl = {w[:10]: a for w, a in zip(waktu, seri)}
    keluar = []
    for h in jam_lead:
        vt = run + dt.timedelta(hours=h)
        tgl = dt.datetime.combine((vt + dt.timedelta(hours=C.WIB)).date(), dt.time(12),
                                  tzinfo=dt.timezone.utc) - dt.timedelta(hours=C.WIB)
        keluar.append(per_tgl.get(tgl.strftime("%Y-%m-%d"), None))
    # hari yang tak punya rata-rata (kepotong di ujung) diisi NaN, bukan diulang
    contoh = next(a for a in keluar if a is not None) if any(a is not None for a in keluar) else None
    if contoh is None:
        return []
    return [a if a is not None else np.full_like(contoh, np.nan) for a in keluar]


def _tulis_per_langkah(key, lay, medan, jam_lead, run, grid, vel_nama) -> int:
    for i, fstep in enumerate(jam_lead):
        valid = run + dt.timedelta(hours=fstep)
        write_scalar_frame(medan[i], grid, key, run, valid, lay["units"], f"f{fstep:03d}",
                           extra={"model": "CAMS", "velocity_json": vel_nama[fstep]})
    return len(jam_lead)


def _tulis_harian(key, lay, medan, jam_lead, run, grid, vel_nama) -> int:
    """Rata-rata 24 jam per TANGGAL WIB. Baku mutu partikel memang rata-rata harian,
    dan fluktuasi per jam untuk PM lebih banyak derau daripada informasi."""
    hari = {}
    for i, fstep in enumerate(jam_lead):
        vt = run + dt.timedelta(hours=fstep)
        tgl = (vt + dt.timedelta(hours=C.WIB)).date()      # kelompokkan menurut hari WIB
        hari.setdefault(tgl, []).append(i)
    n, seri, waktu = 0, [], []
    for tgl, idx in sorted(hari.items()):
        if len(idx) < 4:            # hari yang cuma kepotong sedikit -> lewati
            continue
        rerata = np.nanmean(np.stack([medan[i] for i in idx]), axis=0)
        seri.append(rerata)
        # Waktu berlaku = tengah hari WIB, dalam UTC. Slider hanya menampilkan tanggal.
        valid = dt.datetime.combine(tgl, dt.time(12), tzinfo=dt.timezone.utc) - dt.timedelta(hours=C.WIB)
        tengah = idx[len(idx) // 2]
        write_scalar_frame(rerata, grid, key, run, valid, lay["units"], f"d{tgl:%Y%m%d}",
                           extra={"model": "CAMS", "daily": True,
                                  "n_langkah": len(idx),
                                  "velocity_json": vel_nama[jam_lead[tengah]]})
        waktu.append(valid.strftime("%Y-%m-%dT%H:00:00Z"))
        n += 1
    return n, seri, waktu


def _kategori_ispu(v: float) -> str:
    for batas, nama in C.ISPU_KATEGORI:
        if v <= batas:
            return nama
    return C.ISPU_KATEGORI[-1][1]


def _kota_arsip(kota_medan, grid, waktu_penuh):
    """Sampel 7 polutan + ISPU di titik kota, sekali. Deret yang lebih pendek dari
    sumbu waktu penuh (mis. ISPU saat jendela belum penuh) DI-KIRI-pad NaN supaya
    sejajar di ujung, sama seperti city_data."""
    nt = len(waktu_penuh)
    src = {k: kota_medan[k] for k in ARSIP_PARAM if kota_medan.get(k)}
    places, kota = sampel_kota(src, grid)
    for k, a in list(kota.items()):
        if a.shape[1] < nt:
            pad = np.full((a.shape[0], nt - a.shape[1]), np.nan)
            kota[k] = np.concatenate([pad, a], axis=1)
    return places, kota


# Pembulatan per parameter di arsip: indeks & CO bilangan bulat, PM & O3 satu
# desimal, gas kecil (NO2/SO2) dan AOD dua desimal.
_ARSIP_DESIMAL = {"ispu": 0, "co": 0, "pm25": 1, "pm10": 1, "o3": 1,
                  "no2": 2, "so2": 2, "aod": 2}


def _tulis_arsip(places, kota, waktu_penuh, run) -> None:
    """Simpan rata-rata harian per kota (7 polutan + ISPU) untuk SATU tanggal WIB,
    lalu bangun ulang harian.json (gabungan) untuk grafik tren di frontend.

    Tiap hari nyata menyumbang satu entri. Berkas per-tanggal bersifat TAMBAH-SAJA,
    tak pernah ditulis ulang, jadi riwayat menumpuk aman lintas run di Actions yang
    selalu checkout bersih. Gabungannya diturunkan ulang tiap kali dari semua
    berkas per-tanggal yang tersedia di checkout."""
    if not places:
        print("  arsip dilewati: titik kota tak ada")
        return
    tgl = [(_parse(w) + dt.timedelta(hours=C.WIB)).strftime("%Y-%m-%d") for w in waktu_penuh]
    urut = list(dict.fromkeys(tgl))

    def idx(t):
        return [k for k, x in enumerate(tgl) if x == t]

    # Ambil hari WIB pertama yang HAMPIR PENUH (>=20 dari 24 jam), supaya rata-rata
    # harian yang ditabung selalu satu hari genap dan sebanding antar tanggal, tak
    # tergantung run itu jam 00 atau 12 UTC. Run 12Z membuat "hari ini" WIB cuma
    # berisi jam sore (~5 jam), rata-ratanya akan menyesatkan.
    target = next((t for t in urut if len(idx(t)) >= 20), None)
    if target is None:                       # forecast terlalu pendek, pakai yang terpanjang
        target = max(urut, key=lambda t: len(idx(t))) if urut else None
    if target is None:
        print("  arsip dilewati: tak ada tanggal")
        return
    sel = idx(target)
    nkota = len(places)
    nilai = {}
    for par in ARSIP_PARAM:
        a = kota.get(par)
        if a is None or a.shape[1] != len(waktu_penuh):
            nilai[par] = [None] * nkota
            continue
        rata = np.nanmean(a[:, sel], axis=1)
        nd = _ARSIP_DESIMAL[par]
        nilai[par] = [None if not np.isfinite(x) else round(float(x), nd) for x in rata]

    ARSIP_DIR.mkdir(parents=True, exist_ok=True)
    doc = {"date": target, "run": run.strftime("%Y-%m-%dT%H:00:00Z"),
           "params": ARSIP_PARAM, "places": [p["n"] for p in places], "nilai": nilai}
    (ARSIP_DIR / f"{target}.json").write_text(json.dumps(doc, separators=(",", ":")),
                                              encoding="utf-8")
    _bangun_arsip_gabungan(places)
    print(f"  arsip harian: {target} ({len(sel)} langkah) -> {target}.json")


def _bangun_arsip_gabungan(places) -> None:
    """Kumpulkan semua berkas per-tanggal jadi satu harian.json untuk frontend.

    Berkas dengan daftar kota berbeda (mis. dari versi lama) dilewati, supaya
    kolomnya tak bergeser saat daftar kota berubah."""
    nama_kota = [p["n"] for p in places]
    per = {}
    for f in sorted(glob.glob(str(ARSIP_DIR / "20*-*-*.json"))):
        try:
            d = json.loads(Path(f).read_text(encoding="utf-8"))
        except Exception:
            continue
        if d.get("places") != nama_kota or "date" not in d:
            continue
        per[d["date"]] = d["nilai"]
    dates = sorted(per)
    data = {par: [per[dd].get(par, [None] * len(nama_kota)) for dd in dates]
            for par in ARSIP_PARAM}
    doc = {"params": ARSIP_PARAM, "places": nama_kota, "dates": dates, "data": data,
           "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    (ARSIP_DIR / "harian.json").write_text(json.dumps(doc, separators=(",", ":")),
                                           encoding="utf-8")


# Urutan keyakinan VIIRS: low < nominal < high.
_CONF_URUT = {"l": 0, "n": 1, "h": 2}


def _tulis_titik_api() -> None:
    """Overlay titik panas VIIRS (FIRMS) 48 jam terakhir -> titik_api.json.

    PENGAMATAN satelit, BUKAN ramalan, jadi berdiri lepas dari sumbu waktu forecast.
    Kalau MAP_KEY tak ada atau unduhan gagal, DILEWATI tanpa mematikan pipeline:
    layer asap tetap terbit walau overlay api absen."""
    try:
        baris = firms.ambil()
    except Exception as ex:
        print(f"  titik api dilewati: {ex}")
        return
    minc = _CONF_URUT.get(C.FIRMS["min_confidence"], 1)
    minfrp = C.FIRMS.get("min_frp", 0)
    titik = []
    for b in baris:
        conf = (b.get("confidence") or "").strip().lower()
        if _CONF_URUT.get(conf, 1) < minc:
            continue
        try:
            la = round(float(b["latitude"]), 4)
            lo = round(float(b["longitude"]), 4)
            frp = round(float(b.get("frp") or 0), 1)
        except (KeyError, ValueError):
            continue
        if frp < minfrp:                       # hanya api kuat (lihat config.min_frp)
            continue
        hhmm = (b.get("acq_time") or "0000").strip().zfill(4)
        waktu = f"{b.get('acq_date', '')}T{hhmm[:2]}:{hhmm[2:4]}:00Z"
        titik.append({"la": la, "lo": lo, "f": frp, "c": conf, "t": waktu,
                      "s": (b.get("satellite") or "").strip()})

    # Gabung titik rangkap ke sel grid, diwakili FRP TERTINGGI per sel. Alasannya di
    # config.FIRMS["dedup_deg"]. Dicatat berapa yang digabung, bukan dipotong diam-diam.
    sel = C.FIRMS.get("dedup_deg", 0)
    kasar = len(titik)
    if sel:
        terbaik = {}
        for p in titik:
            k = (round(p["la"] / sel), round(p["lo"] / sel))
            if k not in terbaik or p["f"] > terbaik[k]["f"]:
                terbaik[k] = p
        titik = list(terbaik.values())
        print(f"  titik api: {kasar} -> {len(titik)} setelah gabung sel ~{sel*111:.0f} km")

    # Terpanas duluan: saat digambar, titik ber-FRP besar ada di urutan akhir array
    # sehingga tumpang di ATAS titik kecil. (Leaflet menggambar sesuai urutan tambah.)
    titik.sort(key=lambda d: d["f"])
    doc = {"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "hari": C.FIRMS["hari"], "sumber": "VIIRS 375 m, NASA FIRMS (LANCE)",
           "titik": titik}
    (OUTPUT_DIR / "titik_api.json").write_text(json.dumps(doc, separators=(",", ":")),
                                               encoding="utf-8")
    print(f"  titik api: {len(titik)} hotspot -> titik_api.json")


if __name__ == "__main__":
    main()
