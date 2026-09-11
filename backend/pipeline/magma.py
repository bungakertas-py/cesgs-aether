"""Status gunung api dari MAGMA Indonesia (PVMBG, Badan Geologi ESDM).

Sumbernya halaman PUBLIK, bukan API. API resmi MAGMA meminta login, sedangkan
halaman tingkat aktivitas dan laporan per gunung terbuka untuk umum.

- Halaman tingkat aktivitas memuat nama, provinsi, level, dan tautan laporan
  terbaru tiap gunung. Satu permintaan.
- Laporan per gunung memuat koordinat, pengamatan visual, dan REKOMENDASI resmi
  (radius bahaya). Diambil cuma untuk gunung Level II ke atas, sekitar dua
  puluhan permintaan sehari. Gunung Level I cukup titiknya, koordinatnya dari
  gunung_koordinat.json yang disimpan di repo.

Kalau MAGMA tak bisa dijangkau atau susunan halamannya berubah, pemanggil
melewatinya tanpa mematikan pipeline, sama seperti titik api FIRMS.
"""
from __future__ import annotations

import html
import json
import re
import time
from pathlib import Path

import requests

TINGKAT = "https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas"
KOORDINAT = Path(__file__).resolve().parent / "gunung_koordinat.json"
_UA = {"User-Agent": "cesgs-aether/1.0 (peta kualitas udara CESGS Universitas Airlangga)"}
_LEVEL = {"IV": 4, "III": 3, "II": 2, "I": 1}
JEDA = 0.6          # detik antar permintaan laporan, supaya sopan ke server PVMBG


def _ambil(url: str) -> str:
    r = requests.get(url, headers=_UA, timeout=60)
    r.raise_for_status()
    return r.text


def daftar_tingkat() -> list[dict]:
    """Semua gunung di halaman tingkat aktivitas, urut seperti di halaman.
    Tiap butir {n, prov, lvl, url}."""
    s = _ambil(TINGKAT)
    # Potong ke tabel daftar, lalu jalan berurutan. Judul level muncul sebelum
    # nama nama gunungnya, jadi level terakhir yang terlihat adalah levelnya.
    i = s.find("Daftar Tingkat Aktivitas")
    s = s[i:] if i >= 0 else s
    pola = re.compile(
        r'>Level (IV|III|II|I) \([^)]*\)</a>'
        r'|<td>\s*([^<]+?)\s*<a href="(https://magma\.esdm\.go\.id/v1/gunung-api/laporan/[^"]+)"')
    hasil, lvl = [], None
    for m in pola.finditer(s):
        if m.group(1):
            lvl = _LEVEL[m.group(1)]
            continue
        if lvl is None:
            continue
        teks = html.unescape(m.group(2)).strip()
        nama, _, prov = teks.partition(" - ")
        hasil.append({"n": nama.strip(), "prov": prov.strip(), "lvl": lvl,
                      "url": html.unescape(m.group(3))})
    return hasil


def _bagian(baris: list[str], judul: str, berhenti: tuple[str, ...]) -> str:
    """Teks di bawah satu judul bagian laporan sampai judul berikutnya."""
    try:
        k = baris.index(judul)
    except ValueError:
        return ""
    isi = []
    for b in baris[k + 1:]:
        if b in berhenti or b.startswith("Copyright"):
            break
        isi.append(b)
    return " ".join(isi).strip()


def laporan(url: str) -> dict:
    """Koordinat, waktu laporan, pengamatan visual, dan rekomendasi satu gunung."""
    s = _ambil(url)
    out = {}
    m = re.search(r"Latitude\s*(-?\d+(?:\.\d+)?)\s*(?:&deg;|°)?\s*L[SU],?\s*Longitude\s*(-?\d+(?:\.\d+)?)", s)
    if m:
        out["lat"], out["lon"] = float(m.group(1)), float(m.group(2))
    m = re.search(r"ketinggian\s*([\d.,]+)\s*mdpl", s)
    if m:
        try:
            out["mdpl"] = int(float(m.group(1).replace(".", "").replace(",", ".")))
        except ValueError:
            pass
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    baris = [b.strip() for b in t.split("\n") if b.strip()]
    judul = next((b for b in baris if b.startswith("Laporan Aktivitas Gunung Api - ")), "")
    if judul:
        # "Laporan Aktivitas Gunung Api - Anak Krakatau, Jumat - 11 September 2026, periode 06:00-12:00 WIB"
        out["waktu"] = judul.split(", ", 1)[1] if ", " in judul else judul
    henti = ("Keterangan Lainnya", "Klimatologi", "Pengamatan Kegempaan", "Rekomendasi")
    out["visual"] = _bagian(baris, "Pengamatan Visual", henti)[:400]
    rek = re.sub(r"^Rekomendasi\s*", "", _bagian(baris, "Rekomendasi", ()))
    out["rekomendasi"] = rek[:600]
    # Radius bahaya pertama yang disebut, untuk lingkaran di peta. Rekomendasi
    # sering menyebut beberapa jarak per sektor, jadi yang diambil yang pertama
    # dan teks lengkapnya tetap ada di popup.
    m = re.search(r"radius\s*(\d+(?:[.,]\d+)?)\s*km", rek, flags=re.I)
    if m:
        out["radius_km"] = float(m.group(1).replace(",", "."))
    return out


def muat_koordinat() -> dict:
    try:
        return json.loads(KOORDINAT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def kumpulkan(min_level_laporan: int = 2) -> dict:
    """Dokumen gunung_api.json untuk frontend."""
    daftar = daftar_tingkat()
    if not daftar:
        raise RuntimeError("daftar tingkat aktivitas kosong, susunan halaman MAGMA berubah?")
    koor = muat_koordinat()
    gunung = []
    for g in daftar:
        butir = {"n": g["n"], "prov": g["prov"], "lvl": g["lvl"], "url": g["url"]}
        perlu_laporan = g["lvl"] >= min_level_laporan or g["n"] not in koor
        if perlu_laporan:
            try:
                lap = laporan(g["url"])
                time.sleep(JEDA)
            except requests.RequestException as e:
                print(f"  laporan {g['n']} gagal, {type(e).__name__}")
                lap = {}
            if "lat" in lap:
                koor.setdefault(g["n"], [lap["lat"], lap["lon"], lap.get("mdpl")])
            if g["lvl"] >= min_level_laporan:
                butir["laporan"] = {k: lap[k] for k in ("waktu", "visual", "rekomendasi", "radius_km") if k in lap}
        if g["n"] in koor:
            butir["lat"], butir["lon"] = koor[g["n"]][0], koor[g["n"]][1]
            gunung.append(butir)
        else:
            print(f"  koordinat {g['n']} tak ada, dilewati")
    return {"sumber": "MAGMA Indonesia, PVMBG Badan Geologi", "gunung": gunung}
