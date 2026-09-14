/* kota.js -- Bilah Kartu Kota, berita udara per kota yang berjalan di bawah
 * slider dan legenda, kanan ke kiri seperti running text berita.
 *
 * Satu kartu untuk TIAP kota/kabupaten di id_places.json (514 buah). Isinya
 * ISPU dan AQI beserta kategorinya, pencemar utama, setara berapa batang rokok,
 * jarak ke titik api terdekat plus apakah anginnya menuju kota itu, gas belerang
 * gunung api, status gunung terpantau terdekat, dan ke mana ISPU bergerak enam
 * jam lagi.
 *
 * Semuanya dihitung DI BROWSER dari berkas yang sudah ada, deret titik
 * pd_*.bin.gz, titik_api.json, dan gunung_api.json. Tidak ada berkas baru yang
 * harus dibuat pipeline.
 *
 * Urutan kartu bukan abjad tapi seberapa ada kabarnya, lihat skorKabar(). Dengan
 * 514 kota satu putaran penuh makan puluhan menit, jadi yang paling parah harus
 * lewat duluan. Pengunjung yang mencari kotanya sendiri bisa pakai kotak cari
 * di pojok kanan atas bilah, atau tombol kiri kanan untuk menggeser kartu.
 *
 * Bergantung pada app.js, jadi <script> ini WAJIB dimuat SESUDAH app.js.
 * Yang dipinjam: frames, current, map, loadSeries, loadPlaces, loadFire,
 * loadGunung, timeIndexOf, ispuKategori, aqiKategori, GUNUNG_NAMA, KIMIA_TEKS,
 * pickPlace.
 */
(function () {
  "use strict";

  // ---- Tetapan tampilan ----
  // Lebar kartu TIDAK dipatok di sini. Lebarnya milik CSS (412 px desktop, 366 px
  // tablet, 268 px HP) dan diukur dari kartu pertama, lihat ukurLangkah().
  // Dulu 360 dipatok di sini untuk semua layar, padahal kartu tablet 300 px,
  // jadi di tablet kartu melompat sekitar 60 px tiap satu kartu lewat.
  const JARAK = 12;           // jarak antar kartu, cadangan kalau gap CSS tak terbaca
  const LAJU = 52;            // piksel per detik, kira kira 7 detik satu kartu lewat
  const SIMPAN = "aether-kartu-kota";

  // Ambang yang dipakai kartu. Dikumpulkan di sini supaya gampang disetel.
  // Jarak titik api dan gunung SELALU ditulis angka aslinya, tanpa batas "dekat",
  // diminta user. API_JAUH_KM cuma dipakai skorKabar untuk mengurutkan kartu.
  const API_JAUH_KM = 200;
  const API_SEARAH_DEG = 55;  // beda sudut angin dan arah kota, masih dianggap menuju
  const BELERANG_ADA = 1;     // satuan ×10⁻⁹ kg/kg, sama dengan ambang pertama legenda
  const BELERANG_PEKAT = 5;
  const ROKOK_UG = 22;        // 22 µg/m³ PM2,5 sehari setara satu batang (Berkeley Earth)
  const TREN_JAM = 6;         // ramalan sejauh ini yang dipakai kotak tren
  const TREN_BEDA = 10;       // beda ISPU di bawah ini ditulis stabil

  // Jarak pandang PERKIRAAN dari PM2,5 harian, rumus Koschmieder dengan ambang
  // kontras 5 persen seperti jarak pandang meteorologi WMO, V = 3,0 / koefisien
  // pemadaman. Pemadaman = efisiensi massa PM2,5 kali konsentrasi kali faktor
  // kelembapan, ditambah hamburan udara bersih. CAMS tidak memberi kelembapan di
  // deret titik, jadi faktornya dipatok 2, kira kira udara lembap tropis.
  // Cara dari AOD dan PBLH per jam sempat dicoba 14 Sep dan ditolak, di malam
  // hari lapisan batas yang tipis membuat kota berudara bersih tampak berkabut
  // pekat, dan unduhannya menambah sekitar 15 MB.
  const PANDANG_MEE = 3.75;       // m²/g, efisiensi pemadaman massa PM2,5 kering
  const PANDANG_F_RH = 2.0;       // faktor pertumbuhan karena kelembapan
  const PANDANG_RAYLEIGH = 1.3e-5; // m⁻¹, hamburan udara bersih

  const ARAH8 = ["utara", "timur laut", "timur", "tenggara",
                 "selatan", "barat daya", "barat", "barat laut"];

  // ---- Keadaan ----
  let bar = null, track = null, tombol = null;
  let daftar = [];            // data kartu hasil hitung(), urut paling ada kabar
  let kartu = [];             // kartu yang sedang ada di DOM, {el, w, ti}
  let geser = 0;              // pergeseran track, selalu negatif atau nol
  let indeks = 0;             // kota berikutnya yang akan dimasukkan dari kanan
  let jalan = true;           // false saat disentuh atau tab tidak terlihat
  let hidup = false;          // bilahnya menyala atau tidak
  let rafId = 0, tsLalu = 0;
  let siapInti = false;       // ispu sudah ada, kartu boleh digambar

  const S = {};               // deret titik yang sudah terunduh, key -> {meta, arr}
  let tempat = null;          // isi id_places.json
  let gunungDekat = [];       // gunung terdekat per kota, dihitung sekali saja
  let geoCache = [];          // titik sampel grid per kota, dihitung sekali per grid

  // ================= alat kecil =================

  const esc = (t) => String(t == null ? "" : t)
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Angka gaya Indonesia, koma sebagai desimal.
  const koma = (v, n) => v.toFixed(n).replace(".", ",");

  function haversine(la1, lo1, la2, lo2) {
    const R = 6371, p = Math.PI / 180;
    const a = Math.sin((la2 - la1) * p / 2) ** 2 +
      Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin((lo2 - lo1) * p / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Arah dari titik 1 ke titik 2, derajat dari utara searah jarum jam.
  function arahDerajat(la1, lo1, la2, lo2) {
    const p = Math.PI / 180;
    const y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
    const x = Math.cos(la1 * p) * Math.sin(la2 * p) -
      Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
    return (Math.atan2(y, x) / p + 360) % 360;
  }

  const arahKata = (deg) => ARAH8[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

  // Beda dua sudut, selalu 0 sampai 180.
  function bedaSudut(a, b) {
    const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
    return 180 - d;
  }

  // Nama pendek, "Kabupaten Kubu Raya" jadi "Kubu Raya". Prefiks Kota dipertahankan
  // supaya Kota Bekasi tidak tertukar dengan Kabupaten Bekasi.
  function namaPendek(n) {
    return n.startsWith("Kabupaten ") ? n.slice(10) : n;
  }

  // ================= sampel deret titik =================
  // sampleSeries di app.js mengembalikan SELURUH deret waktu satu titik. Untuk 514
  // kota kali beberapa layer itu ratusan ribu angka yang dibuang lagi. Di sini
  // cukup satu langkah waktu, jadi titik sampelnya dihitung sekali lalu dipakai
  // ulang tiap frame.

  function tandaGrid(m) {
    return m.nx + "," + m.ny + "," + m.west + "," + m.east + "," + m.north + "," + m.south;
  }

  function titikGrid(m, lat, lon) {
    const nx = m.nx, ny = m.ny;
    const dx = (m.east - m.west) / (nx - 1), dy = (m.north - m.south) / (ny - 1);
    const fx = Math.max(0, Math.min(nx - 1, (lon - m.west) / dx));
    const fy = Math.max(0, Math.min(ny - 1, (m.north - lat) / dy));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    return { nx, ny, x0, x1: Math.min(x0 + 1, nx - 1), tx: fx - x0,
             y0, y1: Math.min(y0 + 1, ny - 1), ty: fy - y0,
             xd: Math.round(fx), yd: Math.round(fy) };
  }

  // Titik sampel per kota, satu set per bentuk grid. Semua layer CAMS memakai
  // grid yang sama, tapi ini tetap dipisah per bentuk supaya tidak diam diam
  // salah kalau suatu saat ada layer dengan grid lain.
  function grid(pd, ki) {
    if (!pd) return null;
    const t = tandaGrid(pd.meta);
    let simpul = geoCache[ki];
    if (!simpul) simpul = geoCache[ki] = {};
    if (!simpul[t]) simpul[t] = titikGrid(pd.meta, tempat[ki].lat, tempat[ki].lon);
    return simpul[t];
  }

  // Bilinear, untuk besaran yang boleh dirata rata.
  function nilai(pd, g, ti) {
    if (!pd || !g) return null;
    const b = ti * g.nx * g.ny, nx = g.nx;
    const A = pd.arr[b + g.y0 * nx + g.x0], B = pd.arr[b + g.y0 * nx + g.x1];
    const C = pd.arr[b + g.y1 * nx + g.x0], D = pd.arr[b + g.y1 * nx + g.x1];
    return ((1 - g.tx) * (1 - g.ty) * A + g.tx * (1 - g.ty) * B +
            (1 - g.tx) * g.ty * C + g.tx * g.ty * D) * pd.meta.scale;
  }

  // Tetangga terdekat, untuk KODE kategori. Merata ratakan kode 0 dan 4 memberi 2,
  // yaitu polutan ketiga yang tak terlibat sama sekali. Alasan yang sama dengan
  // sampleSeriesNearest di app.js.
  function kode(pd, g, ti) {
    if (!pd || !g) return null;
    return pd.arr[ti * g.nx * g.ny + g.yd * g.nx + g.xd] * pd.meta.scale;
  }

  // Sampel satu titik bebas (bukan kota), dipakai untuk angin di titik api.
  function nilaiDi(pd, lat, lon, ti) {
    if (!pd) return null;
    return nilai(pd, titikGrid(pd.meta, lat, lon), ti);
  }

  // Waktu acuan kartu. Biasanya jam yang tampil di slider. Tapi waktu layer
  // HARIAN seperti PM2,5 tampil, frame-nya satu per hari, dan jamnya jatuh di
  // siang hari. Kalau itu yang dipakai, angka di kartu melompat tiap rotasi
  // parameter berganti. Jadi selama layer harian tampil, acuan terakhir dipegang.
  let acuanMs = null;
  function perbaruiAcuan() {
    const vt = frames[current] && frames[current].valid_time;
    const harian = typeof DAILY_LAYERS !== "undefined" && DAILY_LAYERS.has(activeLayer);
    if (vt && !harian) acuanMs = Date.parse(vt);
    else if (acuanMs === null) acuanMs = Date.now();
  }

  function waktuKe(pd) {
    if (!pd) return 0;
    const t = pd.meta.times;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < t.length; i++) {
      const d = Math.abs(Date.parse(t[i]) - acuanMs);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  // ================= unduh bahan =================

  async function ambilDeret(key) {
    try { S[key] = await loadSeries(key); }
    catch (e) { S[key] = null; console.warn("Kartu kota, deret " + key + " tidak ada:", e); }
  }

  async function siapkanBahan() {
    tempat = await loadPlaces();
    geoCache = new Array(tempat.length);

    // Inti dulu. Begitu ISPU ada, kartu sudah bisa tampil, sisanya menyusul
    // sambil jalan supaya bilahnya tidak menunggu belasan MB selesai.
    await Promise.all([ambilDeret("ispu"), ambilDeret("ispu_kritis")]);
    siapInti = true;
    hitungUlang();

    // Gunung tidak bergerak, jadi yang terdekat cukup dihitung sekali.
    loadGunung().then(() => { hitungGunungDekat(); hitungUlang(); });
    loadFire().then(() => hitungUlang());

    for (const k of ["aqi", "pm25", "vso2", "angin_u", "angin_v"]) {
      ambilDeret(k).then(() => hitungUlang());
    }
  }

  function hitungGunungDekat() {
    const gs = (typeof gunungData !== "undefined" && gunungData && gunungData.gunung) || [];
    gunungDekat = tempat.map((p) => {
      let best = null, bestKm = Infinity;
      for (const g of gs) {
        if (!isFinite(g.lat) || !isFinite(g.lon)) continue;
        const km = haversine(p.lat, p.lon, g.lat, g.lon);
        if (km < bestKm) { bestKm = km; best = g; }
      }
      return best ? { n: best.n, lvl: best.lvl || 1, km: bestKm } : null;
    });
  }

  // ================= hitung isi kartu =================

  // Titik api yang berlaku untuk jam yang sedang tampil. Jendelanya disamakan
  // PERSIS dengan drawFire di app.js, supaya kartu dan peta tidak pernah berbeda
  // cerita. Untuk jam ramalan jangkarnya pengamatan terakhir.
  function apiBerlaku() {
    const titik = (typeof fireData !== "undefined" && fireData && fireData.titik) || [];
    if (!titik.length) return [];
    const tSlider = acuanMs || 0;
    let maks = 0;
    for (const p of titik) maks = Math.max(maks, +new Date(p.t) || 0);
    const jangkar = (maks && tSlider > maks) ? maks : (tSlider || maks);
    const awal = jangkar - 24 * 3600e3;
    return titik.filter((p) => {
      const tp = +new Date(p.t) || 0;
      return tp <= jangkar && tp > awal;
    });
  }

  // Seberapa "ada kabarnya" satu kota. Ini yang menentukan urutan kartu.
  // Dasarnya ISPU, lalu ditambah kalau ada titik api dekat, gas belerang, atau
  // gunung yang sedang bergolak. Angkanya sengaja kasar, gunanya cuma mengurutkan.
  function skorKabar(k) {
    let s = k.ispu || 0;
    if (k.api) s += Math.max(0, (API_JAUH_KM - k.api.km) * 0.4) + (k.api.searah ? 40 : 0);
    if (k.belerang >= BELERANG_ADA) s += Math.min(60, k.belerang * 4);
    if (k.gunung && k.gunung.km < 100) {
      if (k.gunung.lvl >= 4) s += 120;
      else if (k.gunung.lvl >= 3) s += 60;
      else if (k.gunung.lvl >= 2 && k.gunung.km < 60) s += 25;
    }
    return s;
  }

  function hitung() {
    if (!siapInti || !tempat || !S.ispu) return [];
    perbaruiAcuan();

    const tIspu = waktuKe(S.ispu);
    const tKrit = waktuKe(S.ispu_kritis);
    const tAqi = waktuKe(S.aqi);
    const tPm = waktuKe(S.pm25);
    const tVso = waktuKe(S.vso2);
    const tAng = waktuKe(S.angin_u);
    const krit = (S.ispu_kritis && S.ispu_kritis.meta.kritis_param) ||
                 ["pm25", "pm10", "co", "no2", "so2", "o3"];

    // Tren dipakai dari frame yang sama plus enam jam. Deret ISPU per jam, jadi
    // enam langkah. Kalau ramalannya sudah habis, kotak tren menulis tak ada ramalan.
    const nt = S.ispu.meta.nt;
    const tDepan = (tIspu + TREN_JAM < nt) ? tIspu + TREN_JAM : -1;

    // Angin di TITIK APInya, bukan di kotanya. Yang menentukan asap itu terbawa
    // ke mana adalah angin di tempat asapnya keluar.
    const apis = apiBerlaku().map((p) => {
      let arah = null;
      if (S.angin_u && S.angin_v) {
        const u = nilaiDi(S.angin_u, p.la, p.lo, tAng);
        const v = nilaiDi(S.angin_v, p.la, p.lo, tAng);
        if (u != null && v != null && (u || v)) {
          // u ke timur, v ke utara. Arah TUJUAN angin, derajat dari utara.
          arah = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
        }
      }
      return { la: p.la, lo: p.lo, f: p.f, arah };
    });

    const out = [];
    for (let i = 0; i < tempat.length; i++) {
      const p = tempat[i];
      const gI = grid(S.ispu, i);
      const ispu = nilai(S.ispu, gI, tIspu);
      if (ispu == null || !isFinite(ispu)) continue;

      const k = { ki: i, n: p.n, lat: p.lat, lon: p.lon, ispu: Math.round(ispu) };

      const aqi = nilai(S.aqi, grid(S.aqi, i), tAqi);
      k.aqi = aqi == null ? null : Math.round(aqi);

      const kk = kode(S.ispu_kritis, grid(S.ispu_kritis, i), tKrit);
      k.kritis = (kk != null && krit[Math.round(kk)]) ? krit[Math.round(kk)] : null;

      const pm = nilai(S.pm25, grid(S.pm25, i), tPm);
      k.rokok = (pm != null && pm > 0) ? pm / ROKOK_UG : null;
      k.pandangM = (pm != null && pm >= 0)
        ? 3.0 / (PANDANG_MEE * PANDANG_F_RH * pm * 1e-6 + PANDANG_RAYLEIGH) : null;

      const vso = nilai(S.vso2, grid(S.vso2, i), tVso);
      k.belerang = vso == null ? 0 : vso;

      // Titik api terdekat, plus apakah anginnya membawa asap ke kota ini.
      let best = null, bestKm = Infinity;
      for (const a of apis) {
        const km = haversine(p.lat, p.lon, a.la, a.lo);
        if (km < bestKm) { bestKm = km; best = a; }
      }
      if (best) {
        const keKota = arahDerajat(best.la, best.lo, p.lat, p.lon);
        k.api = {
          km: bestKm,
          dari: arahKata(arahDerajat(p.lat, p.lon, best.la, best.lo)),
          anginAda: best.arah != null,
          searah: best.arah != null && bedaSudut(best.arah, keKota) <= API_SEARAH_DEG,
        };
      }

      k.gunung = gunungDekat[i] || null;

      // Tren ISPU enam jam ke depan.
      if (tDepan >= 0) {
        const nanti = nilai(S.ispu, gI, tDepan);
        if (nanti != null && isFinite(nanti)) {
          const beda = nanti - ispu;
          k.tren = {
            arah: Math.abs(beda) < TREN_BEDA ? "stabil" : beda > 0 ? "naik" : "turun",
            nilai: Math.round(nanti),
          };
        }
      }

      k.skor = skorKabar(k);
      out.push(k);
    }
    out.sort((a, b) => b.skor - a.skor);
    return out;
  }

  // ================= gambar kartu =================

  function isiKartu(k) {
    const kat = ispuKategori(k.ispu);
    const aqiKat = k.aqi != null ? aqiKategori(k.aqi) : null;

    // Kartu BENTO, diminta user. Tujuh kotak yang SAMA di setiap kota, di posisi
    // yang sama. Yang berubah cuma isi dan warnanya, jadi mata pengunjung tidak
    // perlu mencari ulang di tiap kartu. Kotak cuma menyala kalau ada peringatan,
    // yaitu asap menuju kota atau kota terpapar SO2 gunung api.
    const sel = (kelas, label, isi, judul) =>
      '<div class="kg ' + kelas + '"' + (judul ? ' title="' + esc(judul) + '"' : '') + '>' +
        '<span class="kg-l">' + label + '</span>' + isi + '</div>';

    // ---- ISPU, pencemar utama, tren enam jam ----
    // Angka rumus ditulis <sub>, diminta user. Karakter subskrip Unicode di huruf
    // mono tampil hampir sebesar huruf biasa. KIMIA_HTML konstanta app.js, aman.
    const kritis = k.kritis
      ? ((typeof KIMIA_HTML !== "undefined" && KIMIA_HTML[k.kritis]) || esc(k.kritis.toUpperCase()))
      : "";
    let tren = '<span class="kg-tren">Tak ada ramalan</span>';
    if (k.tren) {
      const t = k.tren;
      // Tanpa panah, diminta user. Arahnya ditulis dengan kata supaya angka
      // ramalan tidak terbaca sebagai angka sekarang.
      tren = '<span class="kg-tren kg-' + t.arah + '">' +
        (t.arah === "stabil" ? "stabil" : t.arah + " " + t.nilai) + '<br>6 jam lagi</span>';
    }
    const kIspu = sel("kg-ispu", "ISPU",
      '<b class="kg-v">' + k.ispu + '</b>' +
      (kritis ? '<span class="kg-krit">' + kritis + '</span>' : '') + tren,
      "ISPU " + k.ispu + ", " + kat[1]);

    // ---- AQI ----
    const kAqi = sel("kg-aqi", "AQI",
      '<b class="kg-v">' + (k.aqi != null ? k.aqi : "…") + '</b>',
      aqiKat ? "AQI " + k.aqi + ", " + aqiKat[1] : "AQI sedang dimuat");

    // ---- Setara rokok, dari PM2,5 harian ----
    // Satuan "batang" ditulis kecil. Ukuran penuh tidak muat di kotak selebar 85px.
    let rokok = "…";
    if (k.rokok != null) rokok = (k.rokok >= 1 ? "≈ " + Math.round(k.rokok) : "< 1") + "<small> batang</small>";
    const kRokok = sel("kg-rokok", "Setara rokok", '<b class="kg-v kg-kecil">' + rokok + '</b>',
      "Menghirup udara ini seharian kira kira setara merokok sebanyak itu");

    // ---- Jarak pandang, perkiraan dari PM2,5 harian ----
    let pandang = "…";
    if (k.pandangM != null) {
      const m = k.pandangM;
      pandang = m < 1000 ? "± " + Math.max(100, Math.round(m / 100) * 100) + " m"
        : m < 10000 ? "± " + koma(m / 1000, 1) + " km"
        : "± " + Math.round(m / 1000) + " km";
    }
    const kPandang = sel("kg-pandang", "Jarak pandang", '<b class="kg-v kg-kecil">' + pandang + '</b>',
      "Perkiraan dari PM2,5 harian, bukan pengamatan");

    // ---- Titik api terdekat, jarak asli tanpa batas ----
    let api1 = "Tidak ada titik api", api2 = "dalam 24 jam terakhir", apiNyala = false;
    if (k.api) {
      api1 = Math.round(k.api.km) + " km di " + k.api.dari;
      if (!k.api.anginAda) api2 = "Arah angin dimuat";
      else if (k.api.searah) { api2 = "Asap ke sini"; apiNyala = true; }
      else api2 = "Asap tidak ke sini";
    }
    const kApi = sel("kg-api" + (apiNyala ? " kg-nyala-api" : ""),
      '<span class="material-symbols-outlined">local_fire_department</span>Titik api',
      '<span class="kg-t">' + esc(api1) + '</span><span class="kg-t kg-t2">' + esc(api2) + '</span>',
      "Titik api terdekat, " + api1 + ", " + api2);

    // ---- Gunung terpantau terdekat dan gas SO2 ----
    // Baris pertama nama gunung dan jaraknya dipisah, supaya nama panjang seperti
    // Arjuno Welirang yang terpotong, bukan angka jaraknya.
    let gn1 = "Data gunung belum ada", gn1Html = esc(gn1), gn2 = "", gnNyala = false;
    const so2 = k.belerang >= BELERANG_PEKAT ? "SO₂ pekat"
      : k.belerang >= BELERANG_ADA ? "Terpapar SO₂" : "Tidak terpapar SO₂";
    if (k.belerang >= BELERANG_ADA) gnNyala = true;
    let segitiga = "";
    if (k.gunung) {
      const g = k.gunung;
      gn1 = g.n + " " + Math.round(g.km) + " km";
      gn1Html = '<span class="kg-nama">' + esc(g.n) + '</span><span class="kg-km">' + Math.round(g.km) + ' km</span>';
      const warna = (typeof GUNUNG_WARNA !== "undefined" && GUNUNG_WARNA[g.lvl]) || "#3fb950";
      segitiga = '<i class="kg-seg" style="--gw:' + warna + '"></i>';
      gn2 = ((typeof GUNUNG_NAMA !== "undefined" && GUNUNG_NAMA[g.lvl]) || "Normal") + " · " + so2;
    } else {
      gn2 = so2;
    }
    const kGunung = sel("kg-gunung" + (gnNyala ? " kg-nyala-gn" : ""),
      '<span class="material-symbols-outlined">landscape</span>Gunung api',
      '<span class="kg-t">' + gn1Html + '</span><span class="kg-t kg-t2">' + segitiga + esc(gn2) + '</span>',
      "Gunung api terpantau terdekat, " + gn1 + ", " + gn2);

    return '<div class="kk-atas">' +
        '<span class="kk-kat" style="--kw:' + kat[2] + ';--kt:' + (kat[3] ? "#fff" : "#10151f") + '">' +
          esc(kat[1]) + '</span>' +
        '<span class="kk-nama">' + esc(namaPendek(k.n)) + '</span>' +
      '</div>' +
      '<div class="kk-bento" style="--ki:' + kat[2] + ';--ka:' + (aqiKat ? aqiKat[2] : "transparent") + '">' +
        kIspu + kAqi + kRokok + kPandang + kApi + kGunung +
      '</div>';
  }

  function buatKartu(k) {
    const el = document.createElement("article");
    el.className = "kk";
    el.style.setProperty("--kk", ispuKategori(k.ispu)[2]);
    el.innerHTML = isiKartu(k);
    el.title = k.n + ", klik untuk membuka di peta";
    el.addEventListener("click", () => {
      if (typeof pickPlace === "function") pickPlace(k.lat, k.lon, k.n);
    });
    return el;
  }

  // Isi kartu yang sedang tampil disegarkan di tempat, tanpa memindahkannya.
  // Kalau kartu dibongkar pasang tiap slider digeser, tulisannya berkedip dan
  // posisinya melompat. Lebar kartu dipatok, jadi hitungan gulir tetap benar.
  //
  // Tiap kartu MEMEGANG KOTANYA lewat ti, indeks di id_places.json, bukan lewat
  // peringkat. Urutan daftar dihitung ulang tiap jam slider berganti, jadi kalau
  // kartu dicari lewat peringkat, kartu yang sedang dibaca bisa mendadak berganti
  // jadi kota lain yang kebetulan naik ke peringkat itu.
  function segarkanTampil() {
    for (const c of kartu) {
      const k = petaKota.get(c.ti);
      if (!k) continue;
      c.el.style.setProperty("--kk", ispuKategori(k.ispu)[2]);
      c.el.innerHTML = isiKartu(k);
    }
  }

  function hitungUlang() {
    if (!hidup) return;
    const lama = daftar.length;
    daftar = hitung();
    petaKota = new Map();
    peringkat = new Map();
    daftar.forEach((k, r) => { petaKota.set(k.ki, k); peringkat.set(k.ki, r); });
    if (!daftar.length) return;
    if (!lama) mulaiGulir();
    else segarkanTampil();
  }

  // ================= gulir =================

  let LANGKAH = 424;               // lebar satu kartu plus jaraknya, diukur ukurLangkah()
  const LAJU_DORONG = 1500;        // piksel per detik waktu tombol kiri kanan ditekan
  const TAHAN_MS = 6000;           // gulir otomatis berhenti sejenak sesudah tombol dipakai

  let dorong = 0;                  // sisa geseran dari tombol kiri kanan, bertanda
  let tahanSampai = 0;             // performance.now() sampai kapan gulir otomatis ditahan
  let petaKota = new Map();        // ti -> data kartu terbaru
  let peringkat = new Map();       // ti -> urutan di daftar terbaru

  function pasangKartu(r, diDepan) {
    const k = daftar[r];
    const el = buatKartu(k);
    const c = { el, w: LANGKAH, ti: k.ki };
    if (diDepan) { track.insertBefore(el, track.firstChild); kartu.unshift(c); }
    else { track.appendChild(el); kartu.push(c); }
    return c;
  }

  // Ukur lebar kartu dari DOM. Dipanggil sesudah kartu pertama terpasang dan
  // tiap ukuran jendela berubah, sebab lebar kartu ikut aturan CSS layar.
  function ukurLangkah() {
    const el = track && track.querySelector(".kk");
    if (!el) return false;
    const gap = parseFloat(getComputedStyle(track).columnGap) || JARAK;
    const baru = el.getBoundingClientRect().width + gap;
    if (!(baru > 0) || Math.abs(baru - LANGKAH) < 0.5) return false;
    LANGKAH = baru;
    for (const c of kartu) c.w = LANGKAH;
    return true;
  }

  function isiPenuh() {
    if (!daftar.length || !bar) return;
    const n = daftar.length;
    let total = kartu.length * LANGKAH;
    let jaga = 0;
    // Tambah di kanan sampai jendela penuh. Kota yang kartunya SUDAH tampil
    // dilewati. Urutan daftar dihitung ulang tiap deret baru selesai dimuat dan
    // tiap jam slider berganti, jadi tanpa ini satu kota bisa kebagian giliran
    // lagi dan kartunya muncul dua kali di layar.
    const tampil = new Set(kartu.map((c) => c.ti));
    while (total + geser < bar.clientWidth + LANGKAH * 2 && jaga++ < 60) {
      const r = indeks % n;
      indeks++;
      if (tampil.has(daftar[r].ki) && tampil.size < n) continue;
      tampil.add(pasangKartu(r, false).ti);
      total += LANGKAH;
      // Kartu pertama baru saja terpasang, ukur lebar sebenarnya lalu hitung ulang.
      if (kartu.length === 1 && ukurLangkah()) total = kartu.length * LANGKAH;
    }
    // Buang kelebihan di kanan, terjadi sesudah tombol kiri memasang kartu di
    // depan. indeks dimundurkan ke kota yang dibuang supaya urutannya tidak
    // melompati kota itu waktu kartunya dipasang lagi.
    while (kartu.length > 2 && total - LANGKAH + geser > bar.clientWidth + LANGKAH * 3) {
      const c = kartu.pop();
      track.removeChild(c.el);
      total -= LANGKAH;
      const r = peringkat.get(c.ti);
      if (r !== undefined) indeks = r;
    }
  }

  function terapkanGeser() {
    track.style.transform = "translate3d(" + geser.toFixed(1) + "px,0,0)";
  }

  function langkah(ts) {
    rafId = requestAnimationFrame(langkah);
    if (!tsLalu) { tsLalu = ts; return; }
    const dt = Math.min(0.08, (ts - tsLalu) / 1000);
    tsLalu = ts;
    if (!hidup || !daftar.length) return;

    let d = 0;
    if (jalan && ts >= tahanSampai) d -= LAJU * dt;
    if (dorong) {
      const l = Math.sign(dorong) * Math.min(Math.abs(dorong), LAJU_DORONG * dt);
      d += l;
      dorong -= l;
    }
    if (!d) return;

    geser += d;
    // Buang kartu yang sudah lewat tepi kiri, lalu geser dikembalikan sebesar
    // lebar kartu itu supaya kartu sisanya tidak ikut melompat. Sisa dorongan ke
    // KANAN ikut dihitung. Tombol kiri memasang kartu di luar tepi kiri lalu
    // mendorongnya masuk, dan kartu itu jangan dibuang sebelum sempat tampil.
    while (kartu.length && geser + Math.max(0, dorong) + kartu[0].w <= 0) {
      geser += kartu[0].w;
      track.removeChild(kartu[0].el);
      kartu.shift();
    }
    isiPenuh();
    terapkanGeser();
  }

  function mulaiGulir() {
    kartu.length = 0;
    if (track) track.innerHTML = "";
    geser = 0;
    dorong = 0;
    indeks = 0;
    isiPenuh();
    terapkanGeser();
    if (!rafId) rafId = requestAnimationFrame(langkah);
  }

  function tahan() { tahanSampai = performance.now() + TAHAN_MS; }

  // Tombol kanan, maju satu kartu. Tujuannya dirapatkan ke tepi kartu, jadi
  // sesudah ditekan ada kartu yang pas menempel di kiri, bukan terpotong separuh.
  function maju() {
    if (!daftar.length) return;
    tahan();
    const tujuan = LANGKAH * (Math.ceil((geser + dorong) / LANGKAH - 1e-6) - 1);
    dorong = tujuan - geser;
  }

  // Tombol kiri, mundur satu kartu. Kalau di kiri sudah tidak ada kartu, kartu
  // kota sebelumnya dipasang di depan dan geser dikurangi selebar kartu itu,
  // jadi yang kelihatan tidak berubah sebelum animasinya jalan.
  function mundur() {
    if (!daftar.length || !kartu.length) return;
    tahan();
    const n = daftar.length;
    let tujuan = LANGKAH * (Math.floor((geser + dorong) / LANGKAH + 1e-6) + 1);
    let jaga = 0;
    const tampil = new Set(kartu.map((c) => c.ti));
    while (tujuan > 0 && jaga++ < 20) {
      // Mundur dari kota paling kiri, lewati kota yang kartunya sudah tampil.
      let r = peringkat.get(kartu[0].ti);
      r = r === undefined ? 0 : r;
      let cek = 0;
      do { r = (r - 1 + n) % n; } while (tampil.has(daftar[r].ki) && ++cek < n);
      tampil.add(pasangKartu(r, true).ti);
      geser -= LANGKAH;
      tujuan -= LANGKAH;
    }
    terapkanGeser();
    dorong = tujuan - geser;
    isiPenuh();
  }

  // Lompat ke satu kota, dipakai kotak cari di bilah ini dan tombol Cari di panel
  // kanan. Kartunya dipasang paling depan, disorot, dan gulir otomatis ditahan
  // sebentar supaya sempat dibaca.
  function lompat(nama) {
    if (!hidup || !daftar.length) return;
    const r = daftar.findIndex((k) => k.n === nama);
    if (r < 0) return;
    indeks = r;
    kartu.length = 0;
    track.innerHTML = "";
    geser = 0;
    dorong = 0;
    isiPenuh();
    terapkanGeser();
    tahan();
    const pertama = kartu[0] && kartu[0].el;
    if (pertama) {
      pertama.classList.add("kk-sorot");
      setTimeout(() => pertama.classList.remove("kk-sorot"), TAHAN_MS);
    }
  }

  // ================= cari kartu kota =================
  // Sama cara mencocokkan dengan pencarian di panel kanan app.js, awalan nama
  // didahulukan lalu yang memuat. Bedanya ini CUMA memindahkan bilah kartu ke
  // kota itu, peta tidak ikut terbang.

  function cariKota(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const awal = [], muat = [];
    for (const k of daftar) {
      const f = k.n.toLowerCase(), b = namaPendek(k.n).replace(/^kota /i, "").toLowerCase();
      if (b.startsWith(q) || f.startsWith(q)) awal.push(k);
      else if (f.includes(q)) muat.push(k);
    }
    return awal.concat(muat).slice(0, 8);
  }

  function gambarHasil(q) {
    const box = document.getElementById("kb-cari-hasil");
    if (!box) return;
    if (!q.trim()) { box.innerHTML = ""; return; }
    if (!daftar.length) { box.innerHTML = '<div class="kb-cari-kosong">Data kota belum siap</div>'; return; }
    const hasil = cariKota(q);
    box.innerHTML = hasil.length
      ? hasil.map((k) => {
          const kat = ispuKategori(k.ispu);
          return '<button type="button" class="kb-cari-item" data-n="' + esc(k.n) + '">' +
            '<span class="kb-cari-n">' + esc(k.n) + '</span>' +
            '<span class="kb-cari-v" style="--kw:' + kat[2] + ';--kt:' + (kat[3] ? "#fff" : "#10151f") + '">' +
            k.ispu + '</span></button>';
        }).join("")
      : '<div class="kb-cari-kosong">Tak ada kota itu</div>';
  }

  function pasangCari() {
    const wadah = document.getElementById("kb-cari");
    const btn = document.getElementById("kb-cari-btn");
    const inp = document.getElementById("kb-cari-input");
    const box = document.getElementById("kb-cari-hasil");
    if (!wadah || !btn || !inp || !box) return;

    const tutup = () => { wadah.classList.remove("open"); inp.value = ""; box.innerHTML = ""; };
    const pilih = (nama) => { lompat(nama); tutup(); };

    btn.addEventListener("click", () => {
      if (wadah.classList.toggle("open")) inp.focus();
      else tutup();
    });
    inp.addEventListener("input", () => gambarHasil(inp.value));
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { tutup(); btn.focus(); }
      if (e.key === "Enter") {
        const satu = cariKota(inp.value)[0];
        if (satu) pilih(satu.n);
      }
    });
    box.addEventListener("click", (e) => {
      const it = e.target.closest(".kb-cari-item");
      if (it) pilih(it.dataset.n);
    });
    document.addEventListener("click", (e) => {
      if (wadah.classList.contains("open") && !wadah.contains(e.target)) tutup();
    });
  }

  // ================= rotasi parameter untuk booth =================
  // Diminta user. Selama Kabar Kota menyala, peta bergantian menampilkan
  // parameter yang ada di kartu, dengan pudar. Di booth cukup layar penuh dan
  // nyalakan Kabar Kota. Nama parameter yang sedang tampil ada di badge kiri atas
  // bilah.
  //
  // Titik api dan gunung api TIDAK ikut bergantian, diminta user. Keduanya
  // menyala menetap selama Kabar Kota menyala, beserta statusnya di samping
  // legenda. Yang bergantian cuma empat layer di bawah, urut sesuai permintaan.
  //
  // Begitu pengunjung menekan tombol parameter sendiri, rotasi berhenti, supaya
  // pilihannya tidak ditimpa. Titik api dan gunung tetap menyala. Rotasi jalan
  // lagi kalau Kabar Kota dimatikan lalu dinyalakan.
  const ROTASI = [
    { layer: "ispu", nama: "ISPU", ikon: "masks" },
    { layer: "aqi", nama: "AQI", ikon: "public" },
    { layer: "pm25", nama: "PM2.5", ikon: "blur_on" },
    { layer: "vso2", nama: "Gas Gunung Api", ikon: "volcano" },
  ];
  const ROTASI_MS = 15000;          // lama satu parameter tampil
  const PUDAR_MS = 1000;            // lama bayangan peta lama memudar
  const UI_PUDAR_MS = 350;          // lama legenda memudar keluar dan masuk

  let rotasiJalan = false;
  let rotasiIdx = -1;
  let rotasiTimer = 0;
  let rotasiToken = 0;
  let apiDariKota = false;          // titik api dinyalakan oleh Kabar Kota, bukan pengunjung

  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- Pudar silang ----
  // Versi pertama cuma memudarkan lapisan warna parameter. Hasilnya kasar, kata
  // user, sebab di tengah transisi alas peta terang dan gelap bertukar mendadak
  // (ISPU, AQI, Gas Gunung Api alas terang, PM2,5 alas gelap), garis batas dan
  // label kota membalik warna, dan legenda langsung berganti isi.
  //
  // Sekarang SELURUH peta disalin jadi bayangan diam di atas peta asli. Semua
  // pergantian dikerjakan di bawah bayangan itu sampai gambar parameter dan alas
  // baru selesai dimuat, baru bayangannya dipudarkan. Kanvas tidak ikut tersalin
  // isinya, jadi partikel angin hilang sebentar di bayangan, tak mengganggu.
  let hantuAktif = null;

  function buatHantu() {
    hapusHantu(0);
    const asli = map.getPane("mapPane");
    if (!asli) return null;
    const salinan = asli.cloneNode(true);
    salinan.classList.add("hantu-peta");
    salinan.setAttribute("aria-hidden", "true");
    map.getContainer().appendChild(salinan);
    hantuAktif = salinan;
    return salinan;
  }

  function hapusHantu(ms) {
    const h = hantuAktif;
    hantuAktif = null;
    if (!h) return;
    if (!ms) { h.remove(); return; }
    h.style.transition = "opacity " + ms + "ms ease-in-out";
    requestAnimationFrame(() => { h.style.opacity = "0"; });
    setTimeout(() => h.remove(), ms + 60);
  }

  function pudarLegenda(hilang) {
    const el = document.querySelector("#ui .legend-col");
    if (!el) return;
    el.style.transition = "opacity " + UI_PUDAR_MS + "ms ease";
    el.style.opacity = hilang ? "0" : "";
  }

  // Tunggu ubin alas selesai dimuat kalau tema peta berganti. Tanpa ini alas baru
  // masih kotak kosong waktu bayangan mulai memudar. Dibatasi 3 detik.
  function tungguAlas() {
    const light = typeof LAYER_THEME !== "undefined" && LAYER_THEME[activeLayer] === "light";
    const alas = light ? (typeof lightBase !== "undefined" && lightBase) : (typeof darkBase !== "undefined" && darkBase);
    if (!alas || !alas.isLoading) return Promise.resolve();
    return new Promise((selesai) => {
      const batas = setTimeout(selesai, 3000);
      setTimeout(() => {
        if (!alas.isLoading()) { clearTimeout(batas); selesai(); return; }
        alas.once("load", () => { clearTimeout(batas); selesai(); });
      }, 60);
    });
  }

  // Tunggu gambar heatmap layer baru selesai dimuat, supaya yang memudar masuk
  // sudah peta barunya, bukan kotak kosong. Dibatasi 4 detik untuk jaringan lambat.
  function tungguPeta() {
    return new Promise((selesai) => {
      const batas = performance.now() + 4000;
      (function cek() {
        const el = (typeof speedLayer !== "undefined" && speedLayer && speedLayer.getElement)
          ? speedLayer.getElement() : null;
        if ((el && el.complete && el.naturalWidth) || performance.now() > batas) return selesai();
        setTimeout(cek, 80);
      })();
    });
  }

  async function keLangkah(i) {
    const token = ++rotasiToken;
    clearTimeout(rotasiTimer);
    if (!rotasiJalan) return;
    // Parameter yang tidak ada di katalog dilewati, jaga jaga kiriman tak lengkap.
    let jaga = 0;
    while (!(catalog && catalog.layers[ROTASI[i].layer]) && jaga++ < ROTASI.length) i = (i + 1) % ROTASI.length;
    const L = ROTASI[i];
    rotasiIdx = i;

    if (activeLayer !== L.layer) {
      buatHantu();
      pudarLegenda(true);
      await tunggu(UI_PUDAR_MS);
      if (token !== rotasiToken || !rotasiJalan) { hapusHantu(0); pudarLegenda(false); return; }
      setActiveLayer(L.layer);
      perbaruiBadge();
      // Paling tidak 500 ms, supaya peta baru sempat digambar walau dari cache.
      await Promise.all([tungguPeta(), tungguAlas(), tunggu(500)]);
      if (token !== rotasiToken) { hapusHantu(0); pudarLegenda(false); return; }
      hapusHantu(PUDAR_MS);
      pudarLegenda(false);
    }
    perbaruiBadge();
    rotasiTimer = setTimeout(() => keLangkah((i + 1) % ROTASI.length), ROTASI_MS);
  }

  function mulaiRotasi() {
    if (rotasiJalan) return;
    rotasiJalan = true;
    // Mulai dari parameter yang sedang tampil kalau ada di daftar, supaya
    // menyalakan Kabar Kota tidak langsung mengganti peta.
    const kini = ROTASI.findIndex((L) => L.layer === activeLayer);
    keLangkah(kini >= 0 ? kini : 0);
  }

  // Titik api dan gunung menetap selama Kabar Kota menyala. Titik api yang
  // sudah dinyalakan pengunjung sebelumnya dibiarkan menyala waktu Kabar Kota
  // dimatikan, cuma yang dinyalakan Kabar Kota yang dimatikan lagi.
  function nyalakanLapisanTetap() {
    if (typeof setGunungSelalu === "function") setGunungSelalu(true);
    if (!fireOn) { toggleFire(); apiDariKota = true; }
  }
  function matikanLapisanTetap() {
    if (typeof setGunungSelalu === "function") setGunungSelalu(false);
    if (apiDariKota && fireOn) toggleFire();
    apiDariKota = false;
  }

  function hentikanRotasi() {
    rotasiJalan = false;
    rotasiIdx = -1;
    rotasiToken++;
    clearTimeout(rotasiTimer);
    hapusHantu(0);
    pudarLegenda(false);
    perbaruiBadge();
  }

  // Klik ASLI pengunjung pada tombol parameter. Rotasi sendiri memanggil
  // setActiveLayer langsung, bukan lewat klik, jadi tidak ikut tertangkap.
  // Kalau pengunjung mematikan Titik Api sendiri, anggap itu pilihannya dan
  // jangan dinyalakan balik waktu Kabar Kota dimatikan.
  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    if (rotasiJalan && e.target.closest(".layer-btn")) hentikanRotasi();
    if (e.target.closest("#api-toggle")) apiDariKota = false;
  }, true);

  // ---- badge nama parameter di kiri atas bilah ----
  const IKON_LAYER = { ispu: "masks", aqi: "public", vso2: "volcano", pm25: "blur_on", pm10: "blur_on",
    co: "local_gas_station", no2: "factory", so2: "cloud", o3: "wb_sunny", aod: "foggy", pbl: "height" };

  function namaParameter() {
    if (rotasiJalan && rotasiIdx >= 0 && ROTASI[rotasiIdx].layer === activeLayer) return ROTASI[rotasiIdx];
    const teks = (typeof KIMIA_TEKS !== "undefined" && KIMIA_TEKS[activeLayer]) ||
      String(activeLayer || "").toUpperCase();
    return { nama: teks, ikon: IKON_LAYER[activeLayer] || "layers" };
  }

  let badgeTeks = "";
  function perbaruiBadge() {
    const el = document.getElementById("kb-param");
    if (!el) return;
    const p = namaParameter();
    const teks = p.nama + "|" + p.ikon;
    if (teks === badgeTeks) return;
    const pertama = !badgeTeks;
    badgeTeks = teks;
    const isi = () => {
      el.innerHTML = '<span class="material-symbols-outlined">' + p.ikon + '</span>' +
        '<span class="kb-param-n">' +
          ((typeof KIMIA_HTML !== "undefined" && KIMIA_HTML[activeLayer]) || esc(p.nama)) + '</span>';
      el.classList.remove("pudar");
    };
    if (pertama) { isi(); return; }
    el.classList.add("pudar");
    setTimeout(isi, 250);
  }

  // ================= pasang =================

  function bangunDom() {
    const ui = document.getElementById("ui");
    const bawah = ui && ui.querySelector(".ui-bottom");
    if (!ui || !bawah) return false;

    bar = document.createElement("div");
    bar.id = "kota-bar";
    bar.className = "kota-bar";
    bar.innerHTML =
      '<div class="kb-param" id="kb-param" aria-live="polite"></div>' +
      '<div class="kb-judul">' +
        '<span class="material-symbols-outlined">newspaper</span>' +
        '<span class="kb-tl">Kabar Udara Kota</span>' +
        '<div class="kb-waktu" id="kb-waktu"></div>' +
        '<div class="kb-cari" id="kb-cari">' +
          '<input id="kb-cari-input" type="text" placeholder="Cari kota di kartu" autocomplete="off" aria-label="Cari kartu kota" />' +
          '<button type="button" id="kb-cari-btn" class="kb-cari-btn" aria-label="Cari kartu kota" title="Cari kota di kartu">' +
            '<span class="material-symbols-outlined">search</span></button>' +
          '<div class="kb-cari-hasil" id="kb-cari-hasil"></div>' +
        '</div>' +
      '</div>' +
      '<div class="kb-jendela">' +
        '<div class="kota-track" id="kota-track"></div>' +
        '<button type="button" class="kb-geser kb-kiri" aria-label="Kartu sebelumnya">' +
          '<span class="material-symbols-outlined">chevron_left</span></button>' +
        '<button type="button" class="kb-geser kb-kanan" aria-label="Kartu berikutnya">' +
          '<span class="material-symbols-outlined">chevron_right</span></button>' +
      '</div>';
    bawah.insertAdjacentElement("afterend", bar);
    track = bar.querySelector("#kota-track");

    // Berhenti saat kartunya disentuh atau ditunjuk, biar sempat dibaca. Dipasang
    // di jendela kartu saja, bukan seluruh bilah, sebab slider waktu sekarang ada
    // di kepala bilah dan menggeser slider tidak perlu menghentikan kartu.
    const jendela = bar.querySelector(".kb-jendela");
    jendela.addEventListener("mouseenter", () => { jalan = false; });
    jendela.addEventListener("mouseleave", () => { jalan = true; });
    jendela.addEventListener("touchstart", () => { jalan = false; }, { passive: true });
    jendela.addEventListener("touchend", () => { setTimeout(() => { jalan = true; }, 2500); }, { passive: true });
    // Tombol kiri kanan. Klik tidak boleh tembus ke kartu di bawahnya, sebab klik
    // kartu menerbangkan peta.
    jendela.querySelector(".kb-kiri").addEventListener("click", (e) => { e.stopPropagation(); mundur(); });
    jendela.querySelector(".kb-kanan").addEventListener("click", (e) => { e.stopPropagation(); maju(); });
    pasangCari();
    return true;
  }

  // ================= slider waktu pindah ke kepala bilah =================
  // Diminta user, slider waktu masuk ke kontainer Kabar Udara Kota, sebaris
  // dengan judulnya. Elemen ASLINYA yang dipindah, bukan salinan, jadi semua
  // pendengar di app.js (play, input slider, label jam) tetap jalan tanpa
  // disentuh. Waktu bilah dimatikan, elemennya dikembalikan ke panel timeline.
  //
  // HP TIDAK ikut. Slider sekecil tinggi huruf terlalu sulit disentuh jari, dan
  // tata letak HP punya aturan sendiri untuk panel timeline.
  const HP = window.matchMedia("(max-width: 640px)");

  function aturSlider() {
    const tl = document.querySelector(".ui-bottom .timeline");
    const slot = document.getElementById("kb-waktu");
    if (!tl || !slot) return;
    const btns = document.querySelector(".tl-btns");
    const cur = document.querySelector(".tl-cur");
    const slider = document.getElementById("time-slider");
    const main = tl.querySelector(".tl-main");
    const ticks = document.getElementById("tl-ticks");
    if (!btns || !cur || !slider || !main) return;

    const keBilah = hidup && !HP.matches;
    const ui = document.getElementById("ui");
    if (ui) ui.classList.toggle("kota-slider", keBilah);

    if (keBilah) {
      if (btns.parentElement !== slot) {
        // Slider dan titik tanggalnya dibungkus satu kolom, supaya titiknya
        // tepat di bawah jalur slider dan tidak ikut sebaris dengan judul.
        const kolom = document.createElement("div");
        kolom.className = "kb-slider";
        kolom.appendChild(slider);
        if (ticks) kolom.appendChild(ticks);
        slot.appendChild(btns);
        slot.appendChild(kolom);
        slot.appendChild(cur);
      }
    } else if (btns.parentElement === slot) {
      // Urutan asli, tombol play lalu tl-main berisi label jam, slider, ticks.
      const kolom = slider.parentElement;
      tl.insertBefore(btns, main);
      main.insertBefore(cur, main.firstChild);
      main.appendChild(slider);
      if (ticks) main.appendChild(ticks);
      if (kolom && kolom.classList.contains("kb-slider")) kolom.remove();
    }
  }
  HP.addEventListener("change", aturSlider);

  function pasangTombol() {
    const acuan = document.getElementById("api-toggle");
    if (!acuan || !acuan.parentNode) return;
    tombol = document.createElement("button");
    tombol.id = "kota-toggle";
    tombol.className = "icon-btn";
    tombol.setAttribute("aria-label", "Kabar udara tiap kota");
    tombol.setAttribute("data-tip", "Kabar Kota");
    tombol.innerHTML = '<span class="material-symbols-outlined">newspaper</span>';
    acuan.parentNode.insertBefore(tombol, acuan.nextSibling);
    tombol.addEventListener("click", () => setBilah(!hidup));
  }

  function setBilah(on) {
    hidup = !!on;
    if (bar) bar.classList.toggle("show", hidup);
    // Dipakai CSS HP untuk memindahkan jatah ruang gagang panel bawah dari
    // .ui-bottom ke bilah ini.
    const ui = document.getElementById("ui");
    if (ui) ui.classList.toggle("kota-on", hidup);
    if (tombol) tombol.classList.toggle("active", hidup);
    aturSlider();
    try { localStorage.setItem(SIMPAN, hidup ? "1" : "0"); } catch (e) { /* mode privat */ }
    if (hidup) {
      if (!tempat) siapkanBahan();
      else hitungUlang();
      nyalakanLapisanTetap();
      mulaiRotasi();
    } else {
      hentikanRotasi();
      matikanLapisanTetap();
      kartu.length = 0;
      if (track) track.innerHTML = "";
      daftar = [];
    }
  }

  // Keadaan dalam, untuk memeriksa dari konsol kalau bilahnya kosong. Ringan,
  // tidak dipanggil siapa pun kecuali kalau diminta manual.
  window.kotaInfo = () => ({
    hidup, siapInti, tempat: tempat && tempat.length,
    deret: Object.keys(S).map((k) => k + "=" + (S[k] ? "ok" : "null")).join(","),
    daftar: daftar.length, kartu: kartu.length, geser: Math.round(geser),
  });

  // Slider digeser, isi kartu ikut jamnya. Dipanggil dari showFrame di app.js.
  window.kotaTick = function () { if (hidup) { hitungUlang(); perbaruiBadge(); } };
  // Dipanggil dari pickPlace di app.js, supaya hasil pencarian ikut melompat.
  window.kotaLompat = lompat;

  window.addEventListener("resize", () => {
    if (!ukurLangkah() || !kartu.length) return;
    // Lebar kartu berubah, kartu yang sudah tampil dirapatkan ulang ke kiri.
    geser = 0; dorong = 0;
    isiPenuh();
    terapkanGeser();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { jalan = false; } else { jalan = true; tsLalu = 0; }
  });

  // app.js memuat katalog sendiri. Bilah baru boleh bekerja sesudah frames terisi,
  // sebab semua hitungan waktunya berpatokan pada frame yang sedang tampil.
  function tungguSiap() {
    if (typeof frames !== "undefined" && frames && frames.length) {
      if (!bangunDom()) return;
      pasangTombol();
      let simpan = null;
      try { simpan = localStorage.getItem(SIMPAN); } catch (e) { /* mode privat */ }
      setBilah(simpan === null ? true : simpan === "1");
      return;
    }
    setTimeout(tungguSiap, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tungguSiap);
  } else {
    tungguSiap();
  }
})();
