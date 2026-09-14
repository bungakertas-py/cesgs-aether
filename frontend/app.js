/* Peta Cuaca — frontend (angin + hujan, GFS)
 * Membaca catalog.json + aset dari pipeline backend; angin = partikel + heatmap
 * kecepatan, hujan = heatmap laju hujan. Layout & gaya ala BMKG Signature.
 */
const DATA_BASE = "../backend/data/output/";

// Definisi legend per layer: [label, warna, teksPutih?]
// Kepala legenda cukup SATUANNYA saja. Nama parameter sudah terbaca di tombol yang
// menyala, jadi mengulangnya di legenda cuma memakan lebar.
// Ambang & warnanya cermin _SCALAR_SCALES di process.py, jangan diubah sebelah pihak.
const UG = "\u00b5g/m\u00b3";
// Palet per parameter — cermin _PALET di process.py, JANGAN diubah sebelah pihak.
// Tiap polutan punya keluarga warnanya sendiri supaya bisa dikenali tanpa membaca
// label. `putih` menandai sel yang latarnya gelap, teksnya dibuat terang.
const PALET = {
  pm25: { warna: ["#fee187", "#feab49", "#fc5b2e", "#d41020", "#800026"], putih: [0, 0, 0, 1, 1] },   // YlOrRd
  pm10: { warna: ["#feeba2", "#febb47", "#f07818", "#b84203", "#662506"], putih: [0, 0, 0, 1, 1] },   // YlOrBr, krem ke coklat tua
  co:   { warna: ["#fcd0cc", "#faa3b6", "#f35f9f", "#c71d8c", "#870179", "#49006a"], putih: [0, 0, 1, 1, 1, 1] },   // RdPu (6 pita)
  no2:  { warna: ["#e2e2ef", "#b6b6d8", "#8683bd", "#61409b", "#3f007d"], putih: [0, 0, 0, 1, 1] },   // Purples
  so2:  { warna: ["#e5f5ac", "#a2d88a", "#4cb063", "#15793e", "#004529"], putih: [0, 0, 0, 1, 1] },   // YlGn
  o3:   { warna: ["#ff9933", "#e53300", "#990000", "#4c0000", "#000000"], putih: [0, 1, 1, 1, 1] },   // gist_heat dibalik
  aod:  { warna: ["#fc9f65", "#bd784c", "#7e5033", "#3f2819", "#000000"], putih: [0, 0, 1, 1, 1] },   // copper dibalik
  // PBL dibaca TERBALIK: warna pekat ada di nilai RENDAH, karena lapisan aduk yang
  // tipis mengurung emisi. Cermin _PBL_WARNA di process.py.
  pbl:  { warna: ["#76195d", "#ae4060", "#d4776a", "#e6b7a2", "#fef6f5"], putih: [1, 1, 0, 0, 0] },   // cmocean curl_pink
  // Gas belerang gunung api dekat permukaan. Cermin _PALET["vso2"] di process.py.
  vso2: { warna: ["#bfd3e6", "#8c96c6", "#8c6bb1", "#88419d", "#6e016b"], putih: [0, 0, 1, 1, 1] },   // BuPu
};

// Kategori ISPU, Lampiran II Permen LHK 14/2020. [batas atas, nama, warna, teks putih]
const ISPU_KAT = [
  [50,  "Baik",               "#35c84a", 0],
  [100, "Sedang",             "#2b83ba", 1],
  [200, "Tidak Sehat",        "#ead821", 0],
  [300, "Sangat Tidak Sehat", "#e42320", 1],
  [Infinity, "Berbahaya",     "#0d0d0d", 1],
];
function ispuKategori(v) {
  for (const k of ISPU_KAT) if (v <= k[0]) return k;
  return ISPU_KAT[ISPU_KAT.length - 1];
}

const _leg = (key, head, ambang) => ({
  head, cells: ambang.map((v, i) => [String(v), PALET[key].warna[i], PALET[key].putih[i]]),
});
// Rentang tiap kategori, ditulis apa adanya seperti Lampiran II.A.
const ISPU_RENTANG = ["1-50", "51-100", "101-200", "201-300", "\u2265301"];

// AQI (US EPA), PEMBANDING ISPU. Cermin AQI_KAT/AQI_WARNA di process.py. Warna
// resmi EPA, enam kategori. [batas atas, nama, warna, teks putih]. Nama Inggris
// karena ini indeks luar negeri.
const AQI_KAT = [
  [50,  "Good",                 "#00e400", 0],
  [100, "Moderate",             "#ffff00", 0],
  [150, "Unhealthy (Sensitif)", "#ff7e00", 0],
  [200, "Unhealthy",            "#ff0000", 1],
  [300, "Very Unhealthy",       "#8f3f97", 1],
  [Infinity, "Hazardous",       "#7e0023", 1],
];
function aqiKategori(v) {
  for (const k of AQI_KAT) if (v <= k[0]) return k;
  return AQI_KAT[AQI_KAT.length - 1];
}
const AQI_RENTANG = ["0-50", "51-100", "101-150", "151-200", "201-300", "\u2265301"];
const LEGENDS = {
  // Sel ISPU DUA BARIS: nama kategori di atas, rentang angkanya di bawah. Orang awam
  // membaca kategorinya, orang yang terbiasa dengan ISPU mencari bilangannya.
  // Nama ditulis apa adanya (satu baris). Di DESKTOP tak di-wrap: fontnya diturunkan
  // dan blok warnanya melar ikut teks (CSS .legend-words). Di HP nama boleh wrap
  // di spasi karena legenda tegak dan sempit.
  ispu: { head: "ISPU", words: 1,
          cells: ISPU_KAT.map(([, nama, warna, putih], i) =>
            [nama, warna, putih, ISPU_RENTANG[i]]) },
  // AQI pembanding: sel dua baris juga, nama kategori EPA di atas, rentang di bawah.
  aqi:  { head: "AQI", words: 1,
          cells: AQI_KAT.map(([, nama, warna, putih], i) =>
            [nama, warna, putih, AQI_RENTANG[i]]) },
  pm25: _leg("pm25", UG, [15, 20, 35, 40, 55]),
  pm10: _leg("pm10", UG, [20, 35, 40, 60, 75]),
  co:   _leg("co", UG, [500, 1000, 2000, 4000, 8000, 10000]),
  no2:  _leg("no2", UG, [10, 50, 100, 150, 200]),
  so2:  _leg("so2", UG, [5, 10, 50, 100, 150]),
  o3:   _leg("o3", UG, [5, 10, 50, 100, 150]),
  // AOD rasio pelemahan cahaya, memang tak bersatuan.
  aod:  _leg("aod", "AOD 550 nm", [0.2, 0.5, 1, 2, 3]),
  // PBL dalam meter, dibaca seperti legenda polutan. Bedanya arah: di sini yang
  // pekat justru angka KECIL. Di atas 1500 m sengaja tak berwarna, artinya lega.
  pbl:  _leg("pbl", "m", [200, 400, 700, 1000, 1500]),
  // Gas belerang gunung api di udara dekat permukaan, dalam satuan mentah CAMS,
  // rasio massa kg SO2 per kg udara. Angkanya per 10^-9 supaya terbaca.
  vso2: _leg("vso2", "\u00d710\u207b\u2079 kg/kg", [1, 2, 5, 10, 20]),
};

// Baku Mutu Udara Ambien nasional, PP No. 22 Tahun 2021 Lampiran VII. Semua ug/m3.
// Yang dipakai di plot mengikuti CADENCE layernya: layer harian (PM) memakai baku
// mutu 24 jam, layer per-3-jam (gas) memakai baku mutu 1 jam, karena nilai kita
// snapshot sesaat dan itu yang paling dekat. Nilai lain disimpan sebagai rujukan.
const BAKU_MUTU = {
  pm25: { "24 jam": 55,  "1 tahun": 15 },
  pm10: { "24 jam": 75,  "1 tahun": 40 },
  so2:  { "1 jam": 150,  "24 jam": 75, "1 tahun": 45 },
  no2:  { "1 jam": 200,  "24 jam": 65, "1 tahun": 50 },
  o3:   { "1 jam": 150,  "8 jam": 100, "1 tahun": 35 },
  co:   { "1 jam": 10000, "8 jam": 4000 },
  // Kabut Asap (AOD) dan ISPU sengaja tak punya: AOD bukan konsentrasi, ISPU indeks.
};
function bakuMutuLayer(key, harian) {
  const b = BAKU_MUTU[key];
  if (!b) return null;
  const periode = harian ? "24 jam" : "1 jam";
  return b[periode] != null ? { nilai: b[periode], periode } : null;
}

// Rumus kimia ditulis dengan angka turun. Dua bentuk: <sub> untuk tempat yang
// menerima HTML, karakter Unicode untuk atribut & teks polos (tooltip, judul, share).
const KIMIA_HTML = {
  ispu: "ISPU", aqi: "AQI", vso2: "Gas Gunung Api", pm25: "PM<sub>2.5</sub>", pm10: "PM<sub>10</sub>", co: "CO",
  no2: "NO<sub>2</sub>", so2: "SO<sub>2</sub>", o3: "O<sub>3</sub>", aod: "Kabut Asap",
  pbl: "PBLH",
};
const KIMIA_TEKS = {
  ispu: "ISPU", aqi: "AQI", vso2: "Gas Gunung Api", pm25: "PM\u2082.\u2085", pm10: "PM\u2081\u2080", co: "CO",
  no2: "NO\u2082", so2: "SO\u2082", o3: "O\u2083", aod: "Kabut Asap",
  pbl: "PBLH",
};

// Tema per-layer: "dark" = latar peta gelap (overlay putih); "light" = latar
// terang (overlay gelap). Menentukan label/batas/partikel.
const LAYER_THEME = {
  // Tiga layer pakai alas TERANG, alasannya sama: ujung palet mereka hitam atau
  // nyaris hitam, dan hitam di atas alas gelap tak terbaca sebagai bahaya.
  // ISPU dari warna resmi Lampiran II, O3 dari gist_heat dibalik, Kabut Asap dari
  // copper dibalik. Empat layer sisanya ujungnya masih cukup terang, tetap gelap.
  ispu: "light", aqi: "light", o3: "light", aod: "light",
  vso2: "light",   // gas ungu paling terbaca di alas terang, dan fokusnya ke gunung
  pm25: "dark", pm10: "dark", co: "dark", no2: "dark", so2: "dark", pbl: "dark",
  wind_surface: "dark", rain_surface: "dark", rain_accum_surface: "dark",
  temp_surface: "dark", humidity_surface: "dark", cloud_surface: "dark", pressure_surface: "dark",
  storm_potential: "dark", cin_surface: "dark", wind_strato: "dark", temp_strato: "dark",
};

// Override warna border batas administrasi per-layer (selain default tema).
const BORDER_COLOR = {
  temp_surface: "#000000",       // batas hitam di atas heatmap suhu
  humidity_surface: "#000000",   // batas hitam di atas heatmap kelembapan
  cloud_surface: "#39ff14",      // batas hijau neon di atas tutupan awan
  pressure_surface: "#6d7787",   // batas ABU (redup) di layer tekanan → isobar jadi garis utama
  temp_strato: "#000000",        // batas hitam di atas heatmap suhu stratosfer
  o3: "#ffffff",                 // batas PUTIH: tampil di atas heatmap O3 (oranye-merah-hitam) di darat
};

// --- LEVEL KETINGGIAN (dropdown LEVEL) ---
// Tombol layer memakai kunci PERMUKAAN (data-layer). Saat level "strato" dipilih,
// tombol Angin & Suhu dipetakan ke varian 70 hPa; variabel lain diredupkan.
const STRATO_OF = { wind_surface: "wind_strato", temp_surface: "temp_strato" };
const BASE_OF = { wind_strato: "wind_surface", temp_strato: "temp_surface" };
// Kunci katalog sebenarnya untuk sebuah tombol pada level aktif.
function resolveLayer(base) {
  return (mapLevel === "strato" && STRATO_OF[base]) ? STRATO_OF[base] : base;
}
// Apakah data stratosfer ada di katalog (kalau belum diregen, dropdown tetap mati).
function stratoAvailable() {
  return !!(catalog && catalog.layers && (catalog.layers.wind_strato || catalog.layers.temp_strato));
}

// Redupkan tombol yang tak tersedia di level aktif (di strato: hanya Angin & Suhu).
function applyLevelUI() {
  const strato = mapLevel === "strato";
  document.querySelectorAll(".layer-btn[data-layer]").forEach((b) => {
    const base = b.dataset.layer;
    const has = catalog && catalog.layers[resolveLayer(base)];
    const enabled = strato ? (!!STRATO_OF[base] && !!has) : !!has;
    b.classList.toggle("disabled", !enabled);
  });
}

// Samakan tampilan kontrol level: dropdown desktop + tombol level HP.
function syncLevelControls() {
  const sel = $("level-select"); if (sel) sel.value = mapLevel;
  document.querySelectorAll(".level-btn[data-level]").forEach((b) =>
    b.classList.toggle("active", b.dataset.level === mapLevel));
}

// Ganti level (dari dropdown, tombol HP, atau restore hash). Pindah ke Angin bila
// layer aktif tak punya versi di level tujuan.
function setLevel(lv) {
  if (lv === mapLevel || !catalog) return;
  mapLevel = lv;
  applyLevelUI();
  let base = activeBase;
  if (mapLevel === "strato" && !STRATO_OF[base]) base = "wind_surface";
  activeBase = base;
  setActiveLayer(resolveLayer(base));
  syncLevelControls();
}

// Hidupkan pemilih LEVEL (dropdown desktop + tombol HP) bila data strato tersedia.
function setupLevelSelect() {
  const sel = $("level-select");
  const bar = document.querySelector(".level-bar");
  if (!stratoAvailable()) {   // data strato belum ada -> matikan pemilih level
    if (sel) { sel.disabled = true; sel.innerHTML = '<option value="surface">Permukaan</option>'; }
    if (bar) bar.style.display = "none";
    return;
  }
  if (sel) {
    sel.disabled = false;
    sel.innerHTML = '<option value="surface">Permukaan</option>'
                  + '<option value="strato">Stratosfer, 70 hPa</option>';
    sel.value = mapLevel;
    sel.addEventListener("change", () => setLevel(sel.value));
  }
  // HP: tombol level + toggle buka-tutup (sama seperti dropdown Parameter)
  document.querySelectorAll(".level-btn[data-level]").forEach((b) =>
    b.addEventListener("click", () => setLevel(b.dataset.level)));
  $("level-toggle")?.addEventListener("click", () =>
    document.querySelector(".level-bar")?.classList.toggle("level-open"));
  syncLevelControls();
}

// Layer dengan data HARIAN (1 frame/hari; slider = tanggal saja, tanpa jam).
// Partikel dirata-ratakan 24 jam, jadi slidernya menampilkan tanggal, bukan jam.
const DAILY_LAYERS = new Set(["pm25", "pm10"]);

// Ibukota provinsi (nama persis di id_places.json) — TIER 0: ikon kondisi selalu
// tampil bahkan saat zoom-out penuh. Jakarta diwakili Jakarta Pusat saja.
const PROV_CAPITALS = new Set([
  "Kota Banda Aceh", "Kota Medan", "Kota Padang", "Kota Pekanbaru", "Kota Jambi",
  "Kota Palembang", "Kota Pangkal Pinang", "Kota Bengkulu", "Kota Bandar Lampung",
  "Kota Serang", "Kota Administrasi Jakarta Pusat", "Kota Bandung", "Kota Semarang",
  "Kota Yogyakarta", "Kota Surabaya", "Kota Denpasar", "Kota Mataram", "Kota Kupang",
  "Kota Pontianak", "Kota Palangka Raya", "Kota Banjarmasin", "Kota Samarinda",
  "Kabupaten Bulungan", "Kota Manado", "Kota Palu", "Kota Makassar", "Kota Kendari",
  "Kota Gorontalo", "Kabupaten Mamuju", "Kota Ambon", "Kota Ternate",
  "Kota Tidore Kepulauan", "Kota Jayapura", "Kabupaten Manokwari", "Kota Sorong",
]);

// ---- Peta dasar (gelap, ala screenshot) --------------------------------
const map = L.map("map", {
  center: [5, 116],
  zoom: 4,
  minZoom: 3,
  maxZoom: 9,
  zoomSnap: 0,             // izinkan zoom pecahan → bingkai bisa pas mengisi layar
  zoomControl: false,      // pakai tombol zoom neubrutalist sendiri
  attributionControl: false, // kredit ditaruh di footer sidebar
  maxBoundsViscosity: 1.0, // dinding keras: tak bisa geser keluar kotak
  preferCanvas: true,      // render vektor (batas) via Canvas: hanya yang masuk frame
  wheelPxPerZoomLevel: 120,// scroll-zoom lebih landai → terasa lebih mulus
  wheelDebounceTime: 30,
});

// Kotak inti yang WAJIB selalu tampak penuh: India–Pasifik Barat, Cina Selatan–
// tengah Australia. Bingkai tampilan diturunkan dari kotak ini, diperlebar
// mengikuti rasio layar. Domain DATA (dari catalog) lebih luas dari kotak ini di
// tiap sisi → tepi data tak pernah terlihat.
const VIEW_CORE = L.latLngBounds([-28, 68], [28, 174]);

// dark_NOLABELS, bukan dark_all. Alas sudah punya lapisan label sendiri di pane
// "labels"; kalau alasnya juga membawa nama, namanya muncul dua kali di tempat yang
// datanya transparan (mis. hujan saat kering).
const _alasOpts = {
  // Basemap Esri World Gray Canvas (GRATIS, tanpa API key). CARTO menghentikan
  // akses tanpa-key (tile bertempel watermark "API key required"), jadi pindah
  // ke Esri. Tanpa subdomain/{r}; nativenya sampai zoom 16.
  attribution: 'Tiles &copy; Esri | Data: CAMS (Copernicus/ECMWF)',
  maxZoom: 12, maxNativeZoom: 16,
  updateWhenZooming: false, // tunda muat tile sampai zoom selesai → animasi mulus
  keepBuffer: 4,
};
// Dua alas. Gelap untuk enam layer polutan, terang khusus ISPU yang kategori
// tertingginya berwarna hitam. Ditukar oleh applyTheme().
const darkBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", _alasOpts).addTo(map);
const lightBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", _alasOpts);

// Pane heatmap kecepatan angin: di atas peta dasar (z200), di bawah partikel
// (overlayPane z400) & label (z650). Ini "kontur warna" ala BMKG Signature.
const speedPane = map.createPane("speed");
speedPane.style.zIndex = 350;
speedPane.style.pointerEvents = "none";

// Pane batas administrasi (garis negara & provinsi): di atas partikel
// (overlayPane z400), di bawah label (z650).
const adminPane = map.createPane("admin");
adminPane.style.zIndex = 450;
adminPane.style.pointerEvents = "none";

// Label negara/laut di atas partikel supaya tetap terbaca
const labelPane = map.createPane("labels");
labelPane.style.zIndex = 650;
labelPane.style.pointerEvents = "none";
// Pane ikon kondisi cuaca per kota — di atas label, TETAP bisa diklik.
const cityPane = map.createPane("cityicons");
cityPane.style.zIndex = 660;
// Siklon: jalur (garis, non-interaktif) di bawah, ikon pusat (klik) di atas.
const cyclonePathPane = map.createPane("cyclonepath");
cyclonePathPane.style.zIndex = 655;
cyclonePathPane.style.pointerEvents = "none";
const cyclonePane = map.createPane("cyclones");
cyclonePane.style.zIndex = 664;
// ITCZ: pita zona + garis sumbu, konteks latar (non-interaktif, klik tembus ke peta).
const itczPane = map.createPane("itcz");
itczPane.style.zIndex = 459;
itczPane.style.pointerEvents = "none";
// Isobar: garis kontur tekanan + penanda H/L (otomatis di layer Tekanan).
const isobarPane = map.createPane("isobar");
isobarPane.style.zIndex = 461;
isobarPane.style.pointerEvents = "none";
// Titik panas VIIRS (FIRMS): overlay pengamatan, di atas label & di bawah ikon
// siklon. TETAP bisa diklik untuk popup detail (FRP, keyakinan, waktu).
const firePane = map.createPane("fire");
firePane.style.zIndex = 658;
// Lintasan Arah Asap, DI ATAS titik api. Di bawahnya garis tertimbun kerumunan
// titik api dan tak terbaca. Pane-nya tak menangkap tetikus, jadi titik api di
// bawahnya tetap bisa diklik.
// Titik gunung api (parameter Gas Gunung Api), di atas ikon kota dan bisa diklik.
const gunungPane = map.createPane("gunung");
gunungPane.style.zIndex = 662;
const asapPane = map.createPane("asap");
asapPane.style.zIndex = 660;
asapPane.style.pointerEvents = "none";
// Dua set label: GELAP (teks terang, utk tema gelap/angin) & TERANG (teks gelap,
// utk tema terang/hujan). Ditukar oleh applyTheme() sesuai layer aktif.
const _lblOpts = { pane: "labels", maxNativeZoom: 16, updateWhenZooming: false, keepBuffer: 4 };
const darkLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", _lblOpts).addTo(map);
const lightLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", _lblOpts);

// ---- State -------------------------------------------------------------
let frames = [];
let current = 0;
let velocityLayer = null;
let speedLayer = null;      // heatmap (imageOverlay preview PNG) — dipakai kedua layer
let dataBounds = null;      // L.latLngBounds domain data (pusat sel; utk klik & batas pan)
let imageBounds = null;     // L.latLngBounds TEPI sel — hanya untuk menempatkan pratinjau
let playing = false;
let playTimer = null;
let activeLayer = "ispu";
let activeBase = "pm25";   // tombol layer aktif (kunci PERMUKAAN); di strato dipetakan ke varian _strato
let mapLevel = "surface";          // "surface" | "strato" (70 hPa) — dari dropdown LEVEL
let catalog = null;
let windVelByTime = {};     // PERMUKAAN: valid_time -> velocity_json (partikel angin)
let windVelStrato = {};     // STRATO 70 hPa: valid_time -> velocity_json
let worldLayer = null, provLayer = null;   // layer batas (warna diatur per-tema)
const dataCache = new Map();
// Tombol "Kondisi" HANYA mengatur ikon cuaca (cerah/berawan/hujan). Nama kota +
// nilai parameter aktif berdiri sendiri, selalu tampil, tak ikut tombol itu.
let cityIconsOn = false;    // toggle IKON kondisi cuaca per kota
let cityGroup = null;       // L.layerGroup penampung marker kota (label + ikon opsional)
let cyclonesOn = false;     // toggle deteksi siklon + jalur
let cyclones = null, cyclonesLoading = null;
let cycloneGroup = null;
let fireOn = false;         // toggle titik panas VIIRS (FIRMS), overlay pengamatan
let fireData = null, fireLoading = null;
// Status Arah Asap. SENGAJA di sini, bukan di modulnya. asapTitik dibaca oleh
// fungsi ganti frame yang letaknya jauh di atas modul, dan let yang dibaca
// sebelum barisnya dieksekusi melempar galat yang mematikan seluruh app.
// Status Gunung Api, alasan letaknya sama dengan status Arah Asap di bawah.
let gunungData = null, gunungLoading = null;
let gunungGroup = null;
let asapTitik = null;             // {lat, lon} titik api yang sedang dilacak
let asapGroup = null;
let asapTimer = 0;
let asapToken = 0;
let asapPasBingkai = false;       // peta didekatkan ke lintasan cuma sekali, waktu baru dibuka
let fireGroup = null;
let itczOn = false;         // toggle zona ITCZ (pita + garis pertemuan angin)
let itcz = null, itczLoading = null;
let itczGroup = null;
let isobars = null, isobarsLoading = null;   // garis isobar (auto di layer Tekanan)
let isobarGroup = null;
let monsoonOn = false;      // toggle: monsun DOMINAN (warna + banner ikut data) + arus beranimasi
let monsoon = null, monsoonLoading = null;
let monsoonVel = null, monsoonVelData = null, monsoonVelLoading = null;
let borneoVel = null, borneoVelData = null, borneoVelLoading = null, borneoMarker = null;

// Ubin label CARTO DIMATIKAN. Alasannya: ubin itu menulis nama kota juga, sedangkan
// label kita sendiri sudah menulis nama + angka parameter. Dua duanya hidup = tiap
// kota punya dua nama (mis. "Majalengka" muncul dua kali, salah satunya tanpa angka).
// Satu tempat cukup satu label, dan label yang menang adalah yang membawa angka.
//
// Naikkan angka ini untuk menghidupkan lagi label CARTO di bawah zoom tersebut
// (mis. 5.5 = hidup saat peta masih jauh, mati begitu label kota kita muncul).
const LABEL_TILE_MAX_Z = 0;

// ---- Nama negara & laut, digambar sendiri ----
// Ubin label CARTO dimatikan karena bikin nama kota kembar. Konteks geografis tetap
// perlu, jadi kita gambar sendiri dari daftar pendek ini. Karena daftarnya kita yang
// pegang, tak mungkin bentrok dengan label kota. Hanya yang masuk domain data
// (bujur 62-180 timur, lintang 33 selatan sampai 33 utara).
const GEO_LABELS = [
  { t: "India", lat: 22.0, lon: 79.0, k: "neg" },
  { t: "Sri Lanka", lat: 7.8, lon: 80.8, k: "neg" },
  { t: "Bangladesh", lat: 24.0, lon: 90.0, k: "neg" },
  { t: "Myanmar", lat: 21.0, lon: 96.2, k: "neg" },
  { t: "Thailand", lat: 15.5, lon: 101.0, k: "neg" },
  { t: "Laos", lat: 18.6, lon: 103.6, k: "neg" },
  { t: "Kamboja", lat: 12.4, lon: 104.9, k: "neg" },
  { t: "Vietnam", lat: 16.2, lon: 107.4, k: "neg" },
  { t: "Tiongkok", lat: 27.0, lon: 107.0, k: "neg" },
  { t: "Taiwan", lat: 23.7, lon: 121.0, k: "neg" },
  { t: "Filipina", lat: 12.5, lon: 122.5, k: "neg" },
  { t: "Malaysia", lat: 4.0, lon: 102.3, k: "neg" },
  { t: "Brunei", lat: 4.5, lon: 114.7, k: "neg" },
  { t: "Indonesia", lat: -4.2, lon: 109.8, k: "neg" },
  { t: "Timor Leste", lat: -8.8, lon: 125.9, k: "neg" },
  { t: "Papua Nugini", lat: -6.2, lon: 144.0, k: "neg" },
  { t: "Australia", lat: -24.0, lon: 133.0, k: "neg" },
  { t: "Samudra Hindia", lat: -15.0, lon: 85.0, k: "laut" },
  { t: "Laut Arab", lat: 15.0, lon: 65.0, k: "laut" },
  { t: "Teluk Benggala", lat: 15.0, lon: 88.0, k: "laut" },
  { t: "Laut Andaman", lat: 11.0, lon: 95.5, k: "laut" },
  { t: "Laut Cina Selatan", lat: 13.5, lon: 114.0, k: "laut" },
  { t: "Laut Jawa", lat: -5.4, lon: 114.6, k: "laut" },
  { t: "Laut Sulawesi", lat: 3.5, lon: 122.0, k: "laut" },
  { t: "Laut Banda", lat: -5.6, lon: 128.0, k: "laut" },
  { t: "Laut Timor", lat: -11.5, lon: 127.0, k: "laut" },
  { t: "Laut Arafura", lat: -9.5, lon: 136.0, k: "laut" },
  { t: "Laut Filipina", lat: 16.0, lon: 130.0, k: "laut" },
  { t: "Samudra Pasifik", lat: 5.0, lon: 158.0, k: "laut" },
];
// Di atas zoom ini pengguna sudah tahu sedang melihat mana, dan label kota yang
// membawa angka jadi yang lebih berguna.
const GEO_LABEL_MAX_Z = 6;
let geoGroup = null;
let cityPlacedPts = [];   // titik label kota terakhir, dipakai geo label biar tak tabrakan

function refreshGeoLabels() {
  if (!geoGroup) return;
  geoGroup.clearLayers();
  if (map.getZoom() >= GEO_LABEL_MAX_Z) return;
  const b = map.getBounds();
  // Nama negara/laut cuma konteks, jadi mengalah pada label kota yang membawa angka.
  // Titik label kota dipakai sebagai penghalang, lalu antar-geo saling menghindar juga.
  const halang = cityPlacedPts.slice(), GX = 66, GY = 22;
  for (const g of GEO_LABELS) {
    if (!b.contains([g.lat, g.lon])) continue;
    const pt = map.latLngToContainerPoint([g.lat, g.lon]);
    let ok = true;
    for (let i = 0; i < halang.length; i++)
      if (Math.abs(pt.x - halang[i].x) < GX && Math.abs(pt.y - halang[i].y) < GY) { ok = false; break; }
    if (!ok) continue;
    halang.push(pt);
    geoGroup.addLayer(L.marker([g.lat, g.lon], {
      pane: "labels", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "geo-lbl geo-" + g.k, iconSize: [0, 0],
                        html: `<span>${g.t}</span>` }),
    }));
  }
}

// Pilih set label CARTO sesuai tema, atau matikan bila zoom sudah melewati ambang.
function applyLabelTiles() {
  const light = LAYER_THEME[activeLayer] === "light";
  const pakai = map.getZoom() < LABEL_TILE_MAX_Z ? (light ? lightLabels : darkLabels) : null;
  for (const l of [darkLabels, lightLabels])
    if (l !== pakai && map.hasLayer(l)) map.removeLayer(l);
  if (pakai && !map.hasLayer(pakai)) pakai.addTo(map);
}

// Tema per-layer: angin = gelap (latar peta gelap), hujan = terang (latar putih).
function applyTheme() {
  const light = LAYER_THEME[activeLayer] === "light";
  // Tukar alas peta. Kelas di kontainer mengubah warna latar Leaflet juga, kalau
  // tidak, saat tile belum termuat yang terlihat latar gelap sekejap.
  const alasBaru = light ? lightBase : darkBase;
  const alasLama = light ? darkBase : lightBase;
  if (map.hasLayer(alasLama)) map.removeLayer(alasLama);
  if (!map.hasLayer(alasBaru)) alasBaru.addTo(map);
  map.getContainer().classList.toggle("alas-terang", light);
  applyLabelTiles();
  map.getPane("labels").classList.toggle("lbl-light", light);   // teks gelap di peta terang
  // Label kota ikut membalik. Putih-berpendar-hitam di atas alas terang (ISPU,
  // O3, Kabut Asap, daya tampung) terbaca berat dan kotor.
  map.getPane("cityicons").classList.toggle("lbl-light", light);
  // Batas: override per-layer bila ada, jika tidak ikut tema (gelap/putih).
  const color = BORDER_COLOR[activeLayer] || (light ? "#1c1b1b" : "#ffffff");
  const opacity = light ? 0.7 : 0.85;
  // Di layer Tekanan, batas dibuat lebih redup agar isobar jadi garis dominan.
  const bOpacity = activeLayer === "pressure_surface" ? 0.5 : opacity;
  if (worldLayer) worldLayer.setStyle({ color, opacity: bOpacity });
  if (provLayer) provLayer.setStyle({ color, opacity: bOpacity });
}

// Warna partikel angin sesuai tema: gelap di latar terang, putih di latar gelap.
function particleColor() {
  if (activeLayer === "o3") return "#ffffff";   // O3: partikel angin PUTIH (permintaan user)
  return LAYER_THEME[activeLayer] === "light" ? "#2b3550" : "#ffffff";
}

const $ = (id) => document.getElementById(id);

function toWIB(iso) {
  // GFS memberi waktu UTC; WIB = UTC+7.
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
}

function fmtValid(iso) {
  // "2026-07-31T00:00:00Z" -> "Jum, 31 Jul 07:00 WIB"
  const opt = { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" };
  return toWIB(iso).toLocaleString("id-ID", opt).replace(/\./g, ":") + " WIB";
}

function fmtDay(iso) {
  // Untuk layer harian: tampilkan TANGGAL saja (hari akumulasi, UTC).
  return new Date(iso).toLocaleDateString("id-ID",
    { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}

// Frame terdekat ke waktu "sekarang" (untuk posisi awal slider, karena window
// bisa memuat masa lalu -24 jam).
function nearestNowIndex() {
  const now = Date.now();
  let best = 0, bestDiff = Infinity;
  frames.forEach((f, i) => {
    const d = Math.abs(new Date(f.valid_time).getTime() - now);
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return best;
}

// Label tanggal/jam (WIB) di bawah slider: tanggal ditandai tebal saat harinya
// berganti, sisanya jam saja.
function buildTicks() {
  const wrap = $("tl-ticks");
  if (!wrap || !frames.length) return;
  const n = frames.length;
  let prevDay = null;
  wrap.innerHTML = frames.map((f, i) => {
    const wib = toWIB(f.valid_time);
    const day = wib.getUTCDate();
    // Frame 0 hanya dilabeli kalau memang hari tersendiri (layer HARIAN). Di layer
    // per-jam frame 0 itu hari yang belum genap; dulu labelnya dipaksa muncul lalu
    // menyerempet label tengah malam pertama, jadi terlihat bertumpuk di awal.
    // Sekarang tanggal cuma muncul di pergantian hari yang sebenarnya.
    const isDay = i === 0
      ? (n <= 1 || day !== toWIB(frames[1].valid_time).getUTCDate())
      : day !== prevDay;
    prevDay = day;
    const pos = n === 1 ? 0 : (i / (n - 1)) * 100;
    const edge = i === 0 ? " edge-start" : (i === n - 1 ? " edge-end" : "");
    // Mark untuk tiap frame; label TANGGAL saja (di pergantian hari) biar tak berdesakan.
    const lbl = isDay
      ? `<span class="tl-tick-lbl">${wib.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" })}</span>`
      : "";
    return `<div class="tl-tick${isDay ? " day" : ""}${edge}" style="left:${pos}%">` +
      `<span class="tl-tick-mark"></span>${lbl}</div>`;
  }).join("");
}

// ---- Batas administrasi -------------------------------------------------
// Indonesia: batas PROVINSI (garis tipis). Negara lain: batas NEGARA saja.
const ADMIN_BASE = "data/";
async function loadAdmin() {
  // Struktur styling mengikuti portofolio: batas negara solid & tegas,
  // batas provinsi tipis putus-putus. Warna putih agar kontras di atas heatmap gelap.
  const styleCountry = { color: "#ffffff", weight: 1.0, opacity: 0.85, fill: false, lineJoin: "round", lineCap: "round", interactive: false };
  const styleProv = { color: "#ffffff", weight: 1.0, opacity: 0.85, fill: false, dashArray: "3 2", lineJoin: "round", interactive: false };
  // Canvas renderer khusus pane admin: fitur di luar frame (+padding) tak digambar,
  // muncul lagi saat di-pan/zoom-out. Jauh lebih mulus daripada SVG.
  const renderer = L.canvas({ pane: "admin", padding: 0.5 });
  try {
    const [world, prov] = await Promise.all([
      fetch(ADMIN_BASE + "world_countries.geojson").then((r) => (r.ok ? r.json() : null)),
      fetch(ADMIN_BASE + "idn_provinces.geojson").then((r) => (r.ok ? r.json() : null)),
    ]);
    if (world) {
      worldLayer = L.geoJSON(world, {
        pane: "admin",
        renderer,
        style: styleCountry,
        // Indonesia digambar oleh layer provinsi → hindari garis pantai ganda kasar.
        filter: (f) => !f.properties || f.properties.name !== "Indonesia",
      }).addTo(map);
    }
    if (prov) provLayer = L.geoJSON(prov, { pane: "admin", renderer, style: styleProv }).addTo(map);
    applyTheme(); // warna batas sesuai layer aktif saat ini
  } catch (e) {
    console.warn("Batas administrasi gagal dimuat:", e);
  }
}

async function loadVelocity(vj) {
  if (dataCache.has(vj)) return dataCache.get(vj);
  const res = await fetch(DATA_BASE + vj);
  if (!res.ok) throw new Error("Gagal memuat " + vj);
  const data = await res.json();
  dataCache.set(vj, data);
  return data;
}

function renderLegend(layerKey) {
  const def = LEGENDS[layerKey];
  const head = $("legend-head"), cells = $("legend-cells");
  if (!def || !head || !cells) return;
  head.textContent = def.head;
  cells.classList.toggle("legend-words", !!def.words);   // sel melebar utk label kata
  cells.classList.toggle("legend-lebar", !!def.lebar);   // sel sedikit lebih lebar utk angka spt -50K
  cells.innerHTML = def.cells.map(([label, bg, dark, sub]) =>
    `<div class="legend-cell${dark ? " dark" : ""}${sub ? " dua-baris" : ""}" style="background:${bg}">` +
    (sub ? `<b>${label}</b><span>${sub}</span>` : label) + `</div>`).join("");
}

function setActiveLayer(layerKey) {
  if (!catalog || !catalog.layers[layerKey] || layerKey === activeLayer) return;
  activeLayer = layerKey;
  activeBase = BASE_OF[layerKey] || layerKey;   // tombol yang menyala = kunci permukaan
  frames = catalog.layers[layerKey].frames;
  document.querySelectorAll(".layer-btn[data-layer]").forEach((b) =>
    b.classList.toggle("active", b.dataset.layer === activeBase));
  renderLegend(layerKey);
  applyTheme();
  aturGunung();
  if (velocityLayer) { map.removeLayer(velocityLayer); velocityLayer = null; } // recreate warna partikel
  // Recreate imageOverlay heatmap tiap ganti layer: elemen <img> yang sama TAK
  // di-reuse antar-layer. Mencegah "ghost" palet layer sebelumnya menembus area
  // transparan layer hujan (bug sisa palet putih->biru saat pindah lalu balik).
  if (speedLayer) { map.removeLayer(speedLayer); speedLayer = null; }
  buildTicks();
  const slider = $("time-slider");
  if (slider) slider.max = String(frames.length - 1);
  // Index frame tak sebanding antar-layer (harian ~8 frame vs per-jam ~27). Selalu
  // resolve ulang ke frame terdekat "sekarang" agar tak melompat ke awal data.
  current = nearestNowIndex();
  showFrame(current);
  syncIsobars();                 // isobar auto muncul/lepas mengikuti layer Tekanan
  // panel titik ikut variabel aktif
  // Popup ikut digambar ulang saat slider atau parameter berubah, jadi penanda
  // "waktu sekarang" di plot selalu sejajar dengan yang tampil di peta.
  // Titik aktif digambar ulang mengikuti parameter baru. Disalin dulu karena
  // openPoint menutup popup lama, dan penutupan itu mengosongkan sharedPoint.
  // Pindah dari layer daya tampung ke polutan (atau sebaliknya) sekalian
  // memindahkan isinya antara sidebar dan popup.
  const titik = sharedPoint;
  if (titik) openPoint(titik.lat, titik.lon, titik.name, titik.me);
  updateHash();
}

// Posisi slider 0 sampai 1 untuk isian jalurnya. CSS sudah punya gradasi isian
// tapi tak pernah diberi angka, jadi jalurnya dulu selalu tampak penuh. Dipanggil
// juga langsung dari event input, sebab showFrame baru sampai ke sini sesudah
// medan angin frame itu selesai dimuat dan isiannya jadi tertinggal dari tombol.
function isiSlider(ts) {
  const max = parseInt(ts.max, 10) || 0;
  ts.style.setProperty("--p", max > 0 ? (parseInt(ts.value, 10) / max).toFixed(4) : "0");
}

async function showFrame(i) {
  current = (i + frames.length) % frames.length;
  const frame = frames[current];

  // Heatmap (kedua layer punya preview_image): angin = kecepatan, hujan = laju hujan.
  const url = DATA_BASE + frame.preview_image;
  if (!speedLayer) {
    speedLayer = L.imageOverlay(url, imageBounds || dataBounds, { pane: "speed", opacity: 0.92, interactive: false });
    speedLayer.addTo(map);
  } else {
    speedLayer.setUrl(url);
  }
  const isVector = catalog.layers[activeLayer]?.kind === "vector";
  speedLayer.setOpacity(isVector ? 0.92 : 1); // scalar opaque; angin semi

  // Partikel angin PUTIH — SELALU ada (angin & hujan), dari medan angin waktu sama.
  // Ikut LEVEL: di stratosfer pakai medan angin 70 hPa agar konsisten dengan heatmap.
  const vsrc = (mapLevel === "strato") ? windVelStrato : windVelByTime;
  const vj = vsrc[frame.valid_time];
  if (vj) {
    const data = await loadVelocity(vj);
    if (!velocityLayer) {
      velocityLayer = L.velocityLayer({
        displayValues: false,
        displayOptions: {
          velocityType: "Angin", position: "bottomleft", emptyString: "Tidak ada data",
          angleConvention: "bearingCW", speedUnit: "kt", directionString: "Arah", speedString: "Kecepatan",
        },
        data,
        minVelocity: 0, maxVelocity: 25, velocityScale: 0.012,
        particleAge: 90, particleMultiplier: 1 / 260, lineWidth: 1.1,
        colorScale: [particleColor()], frameRate: 24,
      });
      velocityLayer.addTo(map);
    } else {
      if (!map.hasLayer(velocityLayer)) velocityLayer.addTo(map);
      velocityLayer.setData(data);
    }
  } else if (velocityLayer && map.hasLayer(velocityLayer)) {
    map.removeLayer(velocityLayer);
  }

  const vt = $("valid-time");
  if (vt) vt.textContent = DAILY_LAYERS.has(activeLayer) ? fmtDay(frame.valid_time) : fmtValid(frame.valid_time);
  const ts = $("time-slider"); if (ts) { ts.value = String(current); isiSlider(ts); }
  refreshCityIcons();                    // label kota (+ikon bila aktif) ikut waktu aktif
  if (fireOn) drawFire();                // titik api ikut jam di slider
  if (asapTitik) jadwalAsap();           // lintasan asap dihitung ulang dari jam yang tampil
  if (window.kotaTick) window.kotaTick();  // kartu Kabar Kota ikut jam yang tampil
  if (cyclonesOn) refreshCyclones();     // siklon + jalur ikut waktu aktif
  if (itczOn) refreshItcz();             // zona ITCZ ikut waktu aktif
  if (activeLayer === "pressure_surface") refreshIsobars();   // isobar ikut waktu aktif
  updateHash();
}

function togglePlay() {
  playing = !playing;
  $("play-icon").textContent = playing ? "pause" : "play_arrow";
  if (playing) {
    playTimer = setInterval(async () => { await showFrame(current + 1); }, 1100);
  } else {
    clearInterval(playTimer);
  }
}

// ================= POINT DETAIL =================
let pointData = null;      // { meta, vars: {name:{arr,scale,offset}} }
let pointLoading = null;
let pointMarker = null;
let sharedPoint = null;    // {lat,lon,name} titik aktif → dipakai untuk link Bagikan
let lastPoint = null;      // untuk export CSV
const MS_TO_KT = 1.943844;
const DIRS = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"]; // 8 arah dari Utara searah jarum jam

async function loadPointData() {
  if (pointData) return pointData;
  if (pointLoading) return pointLoading;
  pointLoading = (async () => {
    const meta = await fetch(DATA_BASE + "point_meta.json").then((r) => r.json());
    const gz = await fetch(DATA_BASE + "point_data.bin.gz").then((r) => r.arrayBuffer());
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    const vars = {};
    for (const v of meta.vars) {
      const Ctor = v.dtype === "uint8" ? Uint8Array : Int16Array;
      vars[v.var] = { arr: new Ctor(buf, v.byteOffset, v.byteLength / Ctor.BYTES_PER_ELEMENT),
                      scale: v.scale, offset: v.offset };
    }
    pointData = { meta, vars };
    return pointData;
  })();
  return pointLoading;
}

// Bilinear di titik (lat,lon) untuk semua waktu -> array nilai.
function sampleVar(pd, name, lat, lon) {
  const v = pd.vars[name];
  if (!v) return null;
  const { nx, ny, bounds, dx, dy, times } = pd.meta;
  const [w, , , n] = bounds;
  let fx = Math.max(0, Math.min(nx - 1, (lon - w) / dx));
  let fy = Math.max(0, Math.min(ny - 1, (n - lat) / dy)); // baris-0 = utara
  const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nx - 1), tx = fx - x0;
  const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, ny - 1), ty = fy - y0;
  const plane = nx * ny, out = [];
  for (let t = 0; t < times.length; t++) {
    const b = t * plane;
    const A = v.arr[b + y0 * nx + x0], B = v.arr[b + y0 * nx + x1];
    const C = v.arr[b + y1 * nx + x0], D = v.arr[b + y1 * nx + x1];
    const raw = (1 - tx) * (1 - ty) * A + tx * (1 - ty) * B + (1 - tx) * ty * C + tx * ty * D;
    out.push(raw * v.scale + v.offset);
  }
  return out;
}

function windAt(u, v) {
  const spd = Math.sqrt(u * u + v * v) * MS_TO_KT;
  const deg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360; // arah DATANG
  return { spd, dir: DIRS[Math.round(deg / 45) % 8] };
}

// ============== PROFIL VERTIKAL (Skew-T) — muat malas & sampel ==============
let profileData = null;      // { meta, vars:{t,r,u,v} }
let profileLoading = null;
let skewtOpen = false;       // kartu Skew-T sedang dibuka?

async function loadProfileData() {
  if (profileData) return profileData;
  if (profileLoading) return profileLoading;
  profileLoading = (async () => {
    const meta = await fetch(DATA_BASE + "profile_meta.json").then((r) => r.json());
    const gz = await fetch(DATA_BASE + "profile.bin.gz").then((r) => r.arrayBuffer());
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    const vars = {};
    for (const v of meta.vars) {
      const Ctor = v.dtype === "uint8" ? Uint8Array : Int16Array;
      vars[v.var] = { arr: new Ctor(buf, v.byteOffset, v.byteLength / Ctor.BYTES_PER_ELEMENT),
                      scale: v.scale, offset: v.offset };
    }
    profileData = { meta, vars };
    return profileData;
  })();
  return profileLoading;
}

// Index waktu profil terdekat dengan valid_time frame yang sedang ditampilkan.
function profileTimeIndex(pd) {
  const vt = frames && frames[current] && frames[current].valid_time;
  const ts = pd.meta.times;
  const hit = ts.indexOf(vt);
  if (hit >= 0) return hit;
  const target = new Date(vt || ts[0]).getTime();
  let best = 0, bd = Infinity;
  ts.forEach((t, i) => { const dd = Math.abs(new Date(t).getTime() - target); if (dd < bd) { bd = dd; best = i; } });
  return best;
}

// Profil vertikal di (lat,lon) untuk index waktu ti -> {levels,T,RH,u,v} per level.
function sampleProfile(pd, lat, lon, ti) {
  const { nx, ny, bounds, dx, dy, levels } = pd.meta;
  const nlev = levels.length, plane = nx * ny, [w, , , n] = bounds;
  const fx = Math.max(0, Math.min(nx - 1, (lon - w) / dx));
  const fy = Math.max(0, Math.min(ny - 1, (n - lat) / dy));
  const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nx - 1), tx = fx - x0;
  const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, ny - 1), ty = fy - y0;
  const samp = (vv, lev) => {
    const b = (ti * nlev + lev) * plane;
    const A = vv.arr[b + y0 * nx + x0], B = vv.arr[b + y0 * nx + x1];
    const C = vv.arr[b + y1 * nx + x0], D = vv.arr[b + y1 * nx + x1];
    return ((1 - tx) * (1 - ty) * A + tx * (1 - ty) * B + (1 - tx) * ty * C + tx * ty * D) * vv.scale + vv.offset;
  };
  const out = { levels: levels.slice(), T: [], RH: [], u: [], v: [] };
  for (let l = 0; l < nlev; l++) {
    out.T.push(samp(pd.vars.t, l)); out.RH.push(Math.max(0, Math.min(100, samp(pd.vars.r, l))));
    out.u.push(samp(pd.vars.u, l)); out.v.push(samp(pd.vars.v, l));
  }
  return out;
}

// Export PLOT Skew-T (tanpa legenda) ke PNG. Rasterize SVG plot ke canvas,
// beri latar + border + bayangan neubrutalist agar rapi saat dibagikan.
function exportSkewTPng() {
  const wrap = $("pt-skewt-wrap");
  const svgEl = wrap && wrap.querySelector("svg");   // svg PERTAMA = plot (bukan swatch legenda)
  if (!svgEl) return;
  const vb = svgEl.viewBox.baseVal;
  const W = vb && vb.width ? vb.width : 340, H = vb && vb.height ? vb.height : 380;
  const xml = new XMLSerializer().serializeToString(svgEl);
  const img = new Image();
  img.onload = () => {
    const s = 2, M = 14, SH = 6;
    const cw = W + M * 2 + SH, ch = H + M * 2 + SH;
    const c = document.createElement("canvas");
    c.width = cw * s; c.height = ch * s;
    const x = c.getContext("2d");
    x.scale(s, s);
    x.fillStyle = "#fcf8f8"; x.fillRect(0, 0, cw, ch);         // latar
    x.fillStyle = "#1c1b1b"; x.fillRect(M + SH, M + SH, W, H); // bayangan keras
    x.fillStyle = "#ffffff"; x.fillRect(M, M, W, H);           // latar plot putih
    x.drawImage(img, M, M, W, H);
    x.lineWidth = 3; x.strokeStyle = "#1c1b1b"; x.strokeRect(M + 1.5, M + 1.5, W - 3, H - 3);
    c.toBlob((b) => {
      if (!b) return;
      const nm = (sharedPoint && sharedPoint.name) ? sharedPoint.name.replace(/[^\w-]+/g, "_")
        : (lastPoint ? lastPoint.lat.toFixed(2) + "_" + lastPoint.lon.toFixed(2) : "titik");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = `skewt_${nm}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}

// Legenda garis/elemen diagram (di bawah plot, sebelum kartu indeks).
function skewtLegend() {
  const line = (c, dash) => `<svg width="24" height="10" viewBox="0 0 24 10"><line x1="1" y1="5" x2="23" y2="5" stroke="${c}" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ""}/></svg>`;
  const box = (fill) => `<svg width="24" height="10" viewBox="0 0 24 10"><rect x="1" y="1" width="22" height="8" fill="${fill}" stroke="#9aa2b0" stroke-width="0.5"/></svg>`;
  const barbSw = `<svg width="24" height="12" viewBox="0 0 24 12"><line x1="2" y1="6" x2="19" y2="6" stroke="#222" stroke-width="1.2"/><line x1="19" y1="6" x2="23" y2="1" stroke="#222" stroke-width="1.2"/><line x1="15" y1="6" x2="19" y2="1" stroke="#222" stroke-width="1.2"/></svg>`;
  const it = (sw, label) => `<div class="skt-lg">${sw}<span>${label}</span></div>`;
  return `<div class="skt-legend">` +
    it(line("#e42320"), "Suhu (T)") +
    it(line("#1f8a4c"), "Titik embun (Td)") +
    it(line("#1c1b1b", "4 3"), "Jalur parcel") +
    it(barbSw, "Angin (barbs)") +
    it(line("#0029d7", "5 3"), "LCL · dasar awan") +
    it(line("#d97706", "5 3"), "LFC · mulai konveksi") +
    it(line("#7a1fa2", "5 3"), "EL · puncak konveksi") +
    it(box("rgba(226,35,32,.30)"), "CAPE · energi naik") +
    it(box("rgba(35,96,200,.25)"), "CIN · penghambat") +
    `</div>`;
}

// Kotak indeks konvektif di bawah diagram.
function skewtIndexBox(d) {
  const fmtP = (p) => p ? Math.round(p) + " hPa" : "–";
  const capeCol = d.cape > 2500 ? "#d61f1f" : d.cape > 1000 ? "#e8590c" : d.cape > 300 ? "#f59f00" : "#2b8a3e";
  const cell = (label, val, col) =>
    `<div class="skt-cell"><span class="skt-k">${label}</span><span class="skt-v" style="color:${col || "#1c1b1b"}">${val}</span></div>`;
  return `<div class="skt-idx">` +
    cell("CAPE", Math.round(d.cape) + " J/kg", capeCol) +
    cell("CIN", Math.round(d.cin) + " J/kg", d.cin < -50 ? "#e8590c" : "#5a6472") +
    cell("LCL", fmtP(d.lcl.p)) +
    cell("LFC", fmtP(d.lfc)) +
    cell("EL", fmtP(d.el)) +
    cell("LI", d.li !== null ? d.li.toFixed(1) : "–", d.li !== null && d.li < -2 ? "#d61f1f" : "#5a6472") +
    `</div>`;
}

// Skeleton loading kartu Skew-T (meniru layout: catatan + plot + export + legenda + indeks).
function skewtSkeleton() {
  return `<div class="pt-skel skt-skel">` +
    `<div class="sk-bar skt-sk-note"></div>` +
    `<div class="sk-bar skt-sk-plot"></div>` +
    `<div class="sk-bar skt-sk-exp"></div>` +
    `<div class="skt-sk-idx">${"<div class='sk-bar'></div>".repeat(6)}</div>` +
    `</div>`;
}

// Render (atau re-render) kartu Skew-T ke #pt-skewt-wrap untuk titik & waktu aktif.
async function renderSkewTCard() {
  // skewt.js dibuang di Kertas Emisi (profil termodinamika tak ada kaitannya dengan
  // polutan). Kartunya juga disembunyikan lewat CSS, tapi jaga-jaga kalau terpanggil.
  if (!window.SkewT) return;
  const wrap = $("pt-skewt-wrap");
  if (!wrap || !lastPoint) return;
  wrap.innerHTML = skewtSkeleton();
  let pd;
  try { pd = await loadProfileData(); }
  catch (e) { wrap.innerHTML = `<div class="skt-load">Profil belum tersedia.</div>`; return; }
  if (!skewtOpen) return;                     // keburu ditutup
  const ti = profileTimeIndex(pd);
  const prof = sampleProfile(pd, lastPoint.lat, lastPoint.lon, ti);
  const d = window.SkewT.derive(prof);
  wrap.innerHTML =
    `<div class="skt-note">Profil ${fmtValid(pd.meta.times[ti])} · indikasi model GFS (grid ~1°), bukan sounding asli.</div>` +
    window.SkewT.svg(d, { W: 340, H: 380 }) +
    `<div class="skt-exp-row"><button type="button" class="skt-export" id="skt-export">` +
    `<span class="material-symbols-outlined">image</span> Export PNG</button></div>` +
    skewtLegend() +
    skewtIndexBox(d);
  $("skt-export")?.addEventListener("click", exportSkewTPng);
}

function fmtCoord(lat, lon) {
  return Math.abs(lat).toFixed(2) + "° " + (lat >= 0 ? "LU" : "LS") + " · " +
         Math.abs(lon).toFixed(2) + "° " + (lon >= 0 ? "BT" : "BB");
}
function fmtHour(iso) { const w = toWIB(iso); return w.getUTCDate() + "/" + String(w.getUTCHours()).padStart(2, "0"); }

// Judul panel titik: koordinat (klik acak), nama kota (search/ikon), atau
// alamat hasil reverse-geocoding (tombol "lokasi saya"). Token menjaga agar
// hasil geocoding yang datang telat tak menimpa titik lain yang keburu dipilih.
let pointToken = 0;
function setPointLabel(text, kind) { // kind: "coord" | "addr" | "loading"
  const c = $("pt-coords"); if (!c) return;
  c.textContent = text;
  c.classList.toggle("mono", kind === "coord");
  c.classList.toggle("pt-addr", kind === "addr" || kind === "loading");
}

// Susun alamat awam "Kelurahan, Kecamatan, Kota/Kabupaten" dari address
// Nominatim (tag OSM Indonesia tak konsisten → ambil sebisanya lalu dedup).
function addressLabel(a) {
  if (!a) return null;
  const kel = a.village || a.neighbourhood || a.hamlet || a.suburb;
  const kec = a.municipality || a.subdistrict || a.city_district;
  const kk  = a.city || a.town || a.county || a.regency;
  const seen = new Set(), parts = [];
  for (const x of [kel, kec, kk, a.state])
    if (x && !seen.has(x)) { seen.add(x); parts.push(x); }
  return parts.slice(0, 3).join(", ") || null;
}

// Reverse-geocode via Nominatim (OpenStreetMap) — dipakai HANYA untuk tombol
// "lokasi saya" (jarang & dipicu user, sesuai kebijakan pemakaian wajar).
async function reverseGeocode(lat, lon) {
  const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2" +
    "&lat=" + lat + "&lon=" + lon + "&zoom=14&addressdetails=1&accept-language=id";
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("geocode " + r.status);
  return addressLabel((await r.json()).address);
}

// Cari alamat lalu perbarui judul; gagal / titik sudah diganti → koordinat.
async function fillAddress(lat, lon) {
  const token = pointToken;
  setPointLabel("Mencari alamat…", "loading");
  try {
    const addr = await reverseGeocode(lat, lon);
    if (pointToken !== token) return;
    setPointLabel(addr || fmtCoord(lat, lon), addr ? "addr" : "coord");
    if (sharedPoint && addr) { sharedPoint.name = addr; updateHash(); }
  } catch (_) {
    if (pointToken !== token) return;
    setPointLabel(fmtCoord(lat, lon), "coord");
  }
}

// Deret-waktu untuk VARIABEL yang sedang dipilih (ikut layer aktif).
function chartSeries(pd, lat, lon) {
  const times = pd.meta.times;
  // yDomain = [bawah, atas] skala sumbu Y tetap. Utk tekanan sengaja TERBALIK
  // (1200 di bawah → 400 di atas) meniru profil atmosfer vertikal: tekanan
  // tertinggi di permukaan. Tanpa yDomain → skala otomatis dari data (mulai 0).
  const num = (v, label, unit, color, type, yDomain) =>
    ({ label, unit, color, type, times, values: sampleVar(pd, v, lat, lon), yDomain });
  // Panel titik = prakiraan PERMUKAAN (di tempat berdiri). Bila peta sedang di
  // level strato, grafik ikut variabel permukaan padanannya (data titik = permukaan).
  switch (BASE_OF[activeLayer] || activeLayer) {
    case "wind_surface": {
      const u = sampleVar(pd, "u", lat, lon), v = sampleVar(pd, "v", lat, lon);
      return { label: "Kecepatan Angin", unit: "kt", color: "#0029d7", type: "line",
               times, values: u.map((uu, i) => Math.sqrt(uu * uu + v[i] * v[i]) * MS_TO_KT) };
    }
    case "temp_surface": return num("temp", "Suhu", "°C", "#e42320", "line", [0, 50]);
    case "humidity_surface": return num("humidity", "Kelembapan", "%", "#1f8a5c", "line", [0, 100]);
    case "cloud_surface": return num("cloud", "Tutupan Awan", "%", "#5a6472", "line", [0, 100]);
    case "pressure_surface": return num("pressure", "Tekanan", "hPa", "#7a3fb0", "line", [1200, 400]);
    case "storm_potential": return num("cape", "CAPE", "J/kg", "#e84a2f", "line", [0, 4000]);
    // Sumbu CIN sengaja 0 di atas, -400 di bawah: makin ke bawah makin tebal tutupnya.
    case "cin_surface": return num("cin", "CIN", "J/kg", "#8a29c8", "line", [-400, 0]);
    case "rain_accum_surface": {
      const rain = sampleVar(pd, "rain", lat, lon), days = {};
      times.forEach((t, i) => { const d = t.slice(0, 10); days[d] = (days[d] || 0) + rain[i] * 3; });
      const dts = Object.keys(days).sort();
      return { label: "Akumulasi Hujan Harian", unit: "mm/hari", color: "#2360c8", type: "line",
               times: dts.map((d) => d + "T00:00:00Z"), values: dts.map((d) => days[d]), daily: true };
    }
    default: return num("rain", "Hujan", "mm", "#2360c8", "line"); // rain_surface
  }
}

function chartSVG(spec) {
  const { values, color, type, times, daily } = spec;
  const n = values.length;
  if (!n) return "";
  // Padding asimetris: kiri utk label sumbu-Y, bawah utk label waktu sumbu-X.
  const W = 330, H = 162, padL = 32, padR = 8, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB, y0 = padT + plotH;
  const vmin = Math.min(...values), vmax = Math.max(...values);
  // lo = nilai di DASAR sumbu, hi = nilai di PUNCAK. Bila yDomain diberi, pakai
  // itu (bisa terbalik spt tekanan: lo=1200 > hi=400). Selain itu otomatis mulai 0.
  const [lo, hi] = spec.yDomain
    ? [spec.yDomain[0], spec.yDomain[1]]
    : [Math.min(0, vmin), vmax === Math.min(0, vmin) ? Math.min(0, vmin) + 1 : vmax];
  const x = (i) => padL + plotW * (n <= 1 ? 0.5 : i / (n - 1));
  const y = (v) => y0 - plotH * ((v - lo) / (hi - lo));
  const fmt = (v) => (Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0));
  const tms = times ? times.map((t) => new Date(t).getTime()) : [];
  const nowMs = Date.now();

  // Posisi pecahan "kini" di dalam deret (utk memisah garis solid vs putus-putus).
  let sxi = n - 1;
  if (times && n > 1) {
    if (nowMs <= tms[0]) sxi = 0;
    else if (nowMs >= tms[n - 1]) sxi = n - 1;
    else for (let i = 0; i < n - 1; i++)
      if (nowMs >= tms[i] && nowMs <= tms[i + 1]) { sxi = i + (nowMs - tms[i]) / (tms[i + 1] - tms[i]); break; }
  }
  const sx = x(sxi);

  // ---- data (bar: solid=terlewati, transparan+outline putus=forecast) ----
  let body = "";
  if (type === "bar") {
    const bw = Math.max(3, (plotW / n) * 0.6);
    for (let i = 0; i < n; i++) {
      const past = !times || tms[i] <= nowMs;
      const bx = (x(i) - bw / 2).toFixed(1), by = y(values[i]).toFixed(1), bh = (y0 - y(values[i])).toFixed(1);
      body += `<rect x="${bx}" y="${by}" width="${bw.toFixed(1)}" height="${bh}" fill="${color}" ` +
        (past ? `opacity="0.82"/>` : `opacity="0.26" stroke="${color}" stroke-width="1" stroke-dasharray="3 2"/>`);
    }
  } else {
    const pts = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    if (type === "area")
      body += `<path d="${pts}L${x(n - 1).toFixed(1)},${y0}L${x(0).toFixed(1)},${y0}Z" fill="${color}" opacity="0.14"/>`;
    // Garis digambar 2x: klip kiri "kini" = solid, klip kanan = putus-putus.
    body += `<clipPath id="cpPast"><rect x="0" y="0" width="${sx.toFixed(1)}" height="${H}"/></clipPath>` +
            `<clipPath id="cpFut"><rect x="${sx.toFixed(1)}" y="0" width="${(W - sx).toFixed(1)}" height="${H}"/></clipPath>`;
    body += `<path d="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" clip-path="url(#cpPast)"/>`;
    body += `<path d="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="5 4" opacity="0.8" clip-path="url(#cpFut)"/>`;
  }

  // ---- sumbu X & Y + tick label (tanpa grid) ----
  const AX = `stroke="#1c1b1b" stroke-width="1.4"`;
  let axes = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${y0}" ${AX}/>` +
             `<line x1="${padL}" y1="${y0}" x2="${padL + plotW}" y2="${y0}" ${AX}/>`;
  for (const tv of [hi, (lo + hi) / 2, lo]) {
    const yy = y(tv);
    axes += `<line x1="${padL - 3}" y1="${yy.toFixed(1)}" x2="${padL}" y2="${yy.toFixed(1)}" ${AX}/>` +
            `<text x="${padL - 5}" y="${(yy + 3).toFixed(1)}" class="pt-ax" text-anchor="end">${fmt(tv)}</text>`;
  }
  if (times) {
    const nt = Math.min(5, n), last = n - 1;
    let prevDay = null;
    for (let k = 0; k < nt; k++) {
      const i = nt <= 1 ? 0 : Math.round((k * last) / (nt - 1));
      const xx = x(i), w = toWIB(times[i]), day = w.getUTCDate();
      const lbl = (daily || prevDay === null || day !== prevDay)
        ? day + "/" + (w.getUTCMonth() + 1)
        : String(w.getUTCHours()).padStart(2, "0") + ":00";
      prevDay = day;
      const anchor = i === 0 ? "start" : i === last ? "end" : "middle";
      axes += `<line x1="${xx.toFixed(1)}" y1="${y0}" x2="${xx.toFixed(1)}" y2="${y0 + 3}" ${AX}/>` +
              `<text x="${xx.toFixed(1)}" y="${y0 + 14}" class="pt-ax" text-anchor="${anchor}">${lbl}</text>`;
    }
    // garis acuan real-time di batas solid/forecast (tanpa teks — dijelaskan legenda)
    if (sx > padL + 1 && sx < padL + plotW - 1)
      axes += `<line x1="${sx.toFixed(1)}" y1="${padT}" x2="${sx.toFixed(1)}" y2="${y0}" stroke="#e8590c" stroke-width="1" stroke-dasharray="2 3" opacity="0.75"/>`;
  }

  return `<svg class="pt-meteo" viewBox="0 0 ${W} ${H}" width="100%">` +
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="#ffffff" stroke="#1c1b1b" stroke-width="2"/>` +
    axes + body + `</svg>`;
}

// Legenda bawah frame grafik: garis solid = kondisi sekarang, putus = forecast.
function chartLegend(color) {
  const line = (dash) => `<svg width="24" height="8" viewBox="0 0 24 8">` +
    `<line x1="1" y1="4" x2="23" y2="4" stroke="${color}" stroke-width="2.5"${dash ? ` stroke-dasharray="5 4"` : ""}/></svg>`;
  return `<div class="chart-legend">` +
    `<span class="chl-key">${line(false)}Kondisi Sekarang</span>` +
    `<span class="chl-key">${line(true)}<i>Forecast</i></span></div>`;
}

// ================= POPUP TITIK =================
// Kertas Cuaca memakai sidebar kanan. Di sini diganti POPUP tepat di titik yang
// diklik, seperti Kertas Fenomena. Isinya satu hal saja: plot deret waktu parameter
// yang sedang aktif. Sumbu X waktu, sumbu Y konsentrasi.

let seriesMeta = null;       // isi point_meta.json, dimuat sekali
let seriesCache = {};        // key layer -> {meta, arr}
let pointPopup = null;
let popupLabel = null;   // nama kota kalau titiknya dari klik label kota

async function loadSeries(key) {
  if (seriesCache[key]) return seriesCache[key];
  if (!seriesMeta) {
    seriesMeta = await fetch(DATA_BASE + "point_meta.json").then((r) => r.json());
  }
  const m = seriesMeta[key];
  if (!m) throw new Error("deret titik tak ada untuk " + key);
  const gz = await fetch(DATA_BASE + m.file).then((r) => r.arrayBuffer());
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  seriesCache[key] = { meta: m, arr: new Int16Array(buf) };
  return seriesCache[key];
}

// Sampel bilinear deret waktu di satu titik. Grid baris-0 = utara.
function sampleSeries(pd, lat, lon) {
  const { nx, ny, west, east, north, south, nt, scale } = pd.meta;
  const dx = (east - west) / (nx - 1), dy = (north - south) / (ny - 1);
  const fx = Math.max(0, Math.min(nx - 1, (lon - west) / dx));
  const fy = Math.max(0, Math.min(ny - 1, (north - lat) / dy));
  const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nx - 1), tx = fx - x0;
  const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, ny - 1), ty = fy - y0;
  const out = [];
  for (let t = 0; t < nt; t++) {
    const b = t * nx * ny;
    const A = pd.arr[b + y0 * nx + x0], B = pd.arr[b + y0 * nx + x1];
    const C = pd.arr[b + y1 * nx + x0], D = pd.arr[b + y1 * nx + x1];
    out.push(((1 - tx) * (1 - ty) * A + tx * (1 - ty) * B +
              (1 - tx) * ty * C + tx * ty * D) * scale);
  }
  return out;
}

// Sampel TETANGGA TERDEKAT. Dipakai untuk kode pencemar kritis, yang isinya nomor
// kategori bukan besaran. Merata-ratakan kode 0 dan 4 menghasilkan 2, yaitu polutan
// ketiga yang sama sekali tak terlibat. Jadi di sini tak boleh bilinear.
function sampleSeriesNearest(pd, lat, lon) {
  const { nx, ny, west, east, north, south, nt, scale } = pd.meta;
  const dx = (east - west) / (nx - 1), dy = (north - south) / (ny - 1);
  const x = Math.round(Math.max(0, Math.min(nx - 1, (lon - west) / dx)));
  const y = Math.round(Math.max(0, Math.min(ny - 1, (north - lat) / dy)));
  const out = [];
  for (let t = 0; t < nt; t++) out.push(pd.arr[t * nx * ny + y * nx + x] * scale);
  return out;
}

// Plot garis sederhana. Sengaja tanpa pustaka grafik: satu SVG, mudah dibaca,
// dan tak menambah beban unduh.
// Langkah sumbu Y. Dicari langkah BULAT TERKECIL yang masih muat dalam jatah
// garis, bukan sekadar membagi rentang jadi empat. Bedanya terasa: membagi empat
// memberi 0/50/100/150, cara ini memberi 0/20/40/.../160 di rentang yang sama.
// Bentuk yang dianggap bulat: 1, 2, 2,5, 5 dikali pangkat sepuluh.
const _MANTIS = [1, 2, 2.5, 5];
function langkahSumbu(atas, maksTick) {
  if (!(atas > 0)) return 1;
  const e0 = Math.floor(Math.log10(atas)) - 3;
  for (let e = e0; e <= e0 + 6; e++) {
    for (const m of _MANTIS) {
      const l = m * Math.pow(10, e);
      if (l > 0 && Math.ceil(atas / l) + 1 <= maksTick) return l;
    }
  }
  return atas / 4;
}
// Berapa desimal supaya langkahnya tercetak PERSIS. Langkah 0,25 butuh dua desimal;
// membulatkannya ke satu desimal melahirkan deret 0,3 lalu 0,5 lalu 0,8 yang salah.
function desimalLangkah(l) {
  for (let d = 0; d <= 4; d++) {
    const k = l * Math.pow(10, d);
    if (Math.abs(k - Math.round(k)) < 1e-9) return d;
  }
  return 4;
}

function seriesPlotSVG(vals, times, unit, daily, warna, pita, baku, namaY) {
  const n = vals.length;
  if (!n) return "";
  // padL sengaja ketat. Yang menentukan lebarnya cuma label terpanjang ("12.000")
  // plus satu strip untuk satuan yang diputar; sisanya jadi ruang plot.
  const W = 300, H = 200, padL = 46, padR = 10, padT = 10, padB = 26;
  const pw = W - padL - padR, ph = H - padT - padB, y0 = padT + ph;
  const vmax = Math.max(...vals), vmin = Math.min(...vals);
  // Dasar sumbu NORMALNYA 0: konsentrasi itu besaran mutlak, memotong dasarnya
  // membuat kenaikan kecil terlihat dramatis. Tapi daya tampung boleh MINUS, dan
  // justru yang minus itu maknanya (beban maksimum sudah terlampaui), jadi sumbu
  // ikut turun kalau deretnya memang menembus nol.
  // Sumbu juga selalu memuat garis baku mutu walau konsentrasinya masih jauh di
  // bawah, karena jarak ke ambang itu sendiri informasinya.
  const atasKasar = Math.max(vmax * 1.08, baku ? baku.nilai * 1.05 : 0, 0);
  const bawahKasar = Math.min(vmin * 1.08, 0);
  const langkah = langkahSumbu(Math.max(atasKasar - bawahKasar, 1e-9), 13);
  const hi = langkah * Math.ceil(atasKasar / langkah);
  const lo = langkah * Math.floor(bawahKasar / langkah);
  const desimal = desimalLangkah(langkah);
  const angkaID = (v) => v.toLocaleString("id-ID", { minimumFractionDigits: desimal, maximumFractionDigits: desimal });

  const X = (i) => padL + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  const Y = (v) => y0 - ((v - lo) / (hi - lo)) * ph;
  const garis = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  // Zona di bawah garis diisi sampai NOL, bukan sampai dasar plot. Kalau diisi
  // sampai dasar, deret daya tampung yang minus akan tampak seolah menumpuk
  // "kelebihan", padahal justru sedang kekurangan.
  const yNol = Math.min(y0, Math.max(padT, Y(0)));
  const area = `M${X(0).toFixed(1)},${yNol.toFixed(1)} ` +
    vals.map((v, i) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("") +
    ` L${X(n - 1).toFixed(1)},${yNol.toFixed(1)} Z`;

  // Sumbu Y: mulai 0, naik dengan langkah bulat sampai batas atas. Di antara tiap
  // dua label ada satu garis bantu tanpa angka, jadi mata bisa membaca setengah
  // langkah (mis. tiap 5 saat labelnya tiap 10) tanpa angkanya berdesakan.
  let sy = "";
  const nSetengah = Math.round((hi - lo) / (langkah / 2));
  for (let k = 0; k <= nSetengah; k++) {
    const v = lo + k * (langkah / 2);
    const y = Y(v);
    if (Math.abs(v) < langkah * 1e-6 && lo < 0) {
      // Garis NOL dipertebal: di layer daya tampung, di situlah batas antara
      // "masih ada ruang" dan "sudah terlampaui".
      sy += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="pp-nol"/>` +
            `<text x="${padL - 4}" y="${(y + 3).toFixed(1)}" class="pp-ytick">0</text>`;
      continue;
    }
    if (k % 2) {
      sy += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="pp-grid-halus"/>`;
      continue;
    }
    sy += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="pp-grid"/>` +
          `<text x="${padL - 4}" y="${(y + 3).toFixed(1)}" class="pp-ytick">${angkaID(v)}</text>`;
  }
  // Satuan sumbu Y, diputar 90 derajat di tepi kiri. ISPU/AQI tak bersatuan, jadi
  // nama indeksnya (dari namaY) yang dipakai supaya sumbunya tetap punya keterangan.
  const satuanY = unit || namaY || (pita ? "ISPU" : "");
  const cy = (padT + ph / 2).toFixed(1);
  const yu = satuanY
    ? `<text transform="rotate(-90 7 ${cy})" x="7" y="${cy}" class="pp-yunit">${satuanY}</text>` : "";

  // Sumbu X mengikuti slider: label muncul di PERGANTIAN HARI, formatnya sama
  // ("20 Agu"). Dulu layer per-jam cuma menampilkan jam, jadi deret 5 hari punya
  // empat label "00:00" yang tak bisa dibedakan satu sama lain.
  let ganti = [], hariSblm = null;
  for (let i = 0; i < n; i++) {
    const d = toWIB(times[i]).getUTCDate();
    if (d !== hariSblm) { ganti.push(i); hariSblm = d; }
  }
  // Menjatah label BUKAN dengan melompati indeks, melainkan dengan menghitung
  // tempat yang benar-benar dipakai tiap label. Cara lompat-indeks pernah membuat
  // "20 Agu" dan "21 Agu" bertabrakan di layer per-3-jam: label pertama dipaku ke
  // tepi kiri, sedangkan pergantian hari berikutnya jatuh cuma ~36 px dari situ,
  // padahal satu label selebar ~32 px.
  // Label dipusatkan di titiknya, KECUALI kalau begitu ujungnya keluar kanvas.
  // Memaku label pertama ke tepi plot (cara lama) memajukannya ~15 px ke kiri,
  // dan itu justru menyerempet label hari berikutnya sehingga ikut terbuang.
  const LBL_W = 31, LBL_JEDA = 3;
  let sx = "", kananTerpakai = -1e9;
  for (const i of ganti) {
    const x = X(i);
    const anc = x - LBL_W / 2 < 2 ? "start" : (x + LBL_W / 2 > W - 2 ? "end" : "middle");
    const gx = anc === "start" ? 2 : anc === "end" ? W - 2 : x;
    const kiri = anc === "start" ? gx : anc === "end" ? gx - LBL_W : gx - LBL_W / 2;
    if (kiri < kananTerpakai + LBL_JEDA) continue;      // tak muat, lewati
    kananTerpakai = kiri + LBL_W;
    const w = toWIB(times[i]);
    const lab = w.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
    sx += `<text x="${gx.toFixed(1)}" y="${H - 8}" class="pp-xtick" style="text-anchor:${anc}">${lab}</text>`;
  }

  // Penanda waktu yang sedang tampil di peta: DOT saja, tanpa garis tegak.
  const ci = nearestIndex(times, frames[current] && frames[current].valid_time);
  const now = ci >= 0
    ? `<circle cx="${X(ci).toFixed(1)}" cy="${Y(vals[ci]).toFixed(1)}" r="3.5" class="pp-dot"/>` : "";
  const kini = ci >= 0 ? vals[ci] : vals[0];
  const angka = kini >= 100 ? Math.round(kini) : kini >= 10 ? kini.toFixed(1) : kini.toFixed(2);

  // Isi plot. Tanpa `pita` = satu warna rata seperti layer polutan. Dengan `pita`
  // (dipakai ISPU) garis dan zonanya diwarnai MENURUT KATEGORI: tiap kategori
  // dipotong jadi lapisan mendatar sesuai rentang nilainya, lalu jalur yang sama
  // digambar ulang di tiap lapisan dengan warna kategori itu.
  let defs = "", isi = "";
  if (pita) {
    pita.forEach(([batasAtas, col], i) => {
      const bawahNilai = i === 0 ? lo : pita[i - 1][0];
      if (bawahNilai >= hi) return;
      const yAtas = Y(Math.min(batasAtas, hi));
      const yBawah = Y(bawahNilai);
      if (yBawah - yAtas <= 0.2) return;
      defs += `<clipPath id="ppita${i}"><rect x="${padL}" y="${yAtas.toFixed(1)}" ` +
              `width="${pw}" height="${(yBawah - yAtas).toFixed(1)}"/></clipPath>`;
      isi += `<g clip-path="url(#ppita${i})">` +
             `<path d="${area}" fill="${col}" opacity=".30"/>` +
             `<path d="${garis}" fill="none" stroke="${col}" stroke-width="2"/></g>`;
    });
  } else {
    isi = `<path d="${area}" fill="${warna}" opacity=".18"/>` +
          `<path d="${garis}" fill="none" stroke="${warna}" stroke-width="2"/>`;
  }

  // Baku Mutu Udara Ambien (PP 22/2021). Garisnya SELALU ada, dan keterangannya
  // berupa legenda contoh-garis, bukan kalimat.
  let bm = "", ket = "";
  if (baku) {
    const yb = Y(baku.nilai);
    bm = `<line x1="${padL}" y1="${yb.toFixed(1)}" x2="${W - padR}" y2="${yb.toFixed(1)}" class="pp-baku-garis"/>`;
    ket = `<div class="pp-bmua"><svg width="30" height="9" aria-hidden="true">` +
          `<line x1="0" y1="4.5" x2="30" y2="4.5" class="pp-baku-garis"/></svg>` +
          `<span>BMUA (${baku.nilai.toLocaleString("id-ID")} ${unit || ""})</span></div>`;
  }
  return `<div class="pp-head"><b>${angka}</b><span>${unit || ""}</span></div>` +
    `<svg class="pp-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs>${defs}</defs>${sy}${yu}${isi}${bm}${now}${sx}</svg>${ket}`;
}

// ================= ARSIP RIWAYAT (grafik tren harian per kota) =================
// Backend menabung tiap hari (7 polutan + ISPU, rata-rata harian per kota) lalu
// menggabungnya jadi data/arsip/harian.json. Grafik tren muncul di popup titik
// saat yang diklik sebuah KOTA (namanya cocok dengan daftar arsip).
let arsipData = null, arsipLoading = null, arsipIdxByName = null;
function loadArsip() {
  if (arsipData) return Promise.resolve(arsipData);
  if (!arsipLoading) {
    arsipLoading = fetch("data/arsip/harian.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.places) {
          arsipIdxByName = new Map(d.places.map((n, i) => [n, i]));
          arsipData = d;
        }
        return arsipData;
      })
      .catch(() => null);
  }
  return arsipLoading;
}

// Grafik garis riwayat harian. Sumbu X = tanggal, tanpa pemisah kini/forecast
// (semuanya sudah lampau). Dot di titik terakhir. ISPU diwarnai per kategori.
function trenKotaSVG(dates, vals, unit, warna, pita) {
  const pts = dates.map((d, i) => [d, vals[i]]).filter(([, v]) => v != null && isFinite(v));
  if (pts.length < 2)
    return '<div class="tren-kosong">Riwayat harian belum cukup. Arsip menabung satu entri tiap hari, jadi grafik tren muncul setelah beberapa hari berjalan.</div>';
  const D = pts.map((p) => p[0]), V = pts.map((p) => p[1]), n = V.length;
  const W = 300, H = 168, padL = 46, padR = 10, padT = 10, padB = 26;
  const pw = W - padL - padR, ph = H - padT - padB, yb = padT + ph;
  const vmax = Math.max(...V), vmin = Math.min(...V);
  const atas = Math.max(vmax * 1.08, 0), bawah = Math.min(vmin * 1.08, 0);
  const langkah = langkahSumbu(Math.max(atas - bawah, 1e-9), 11);
  const hi = langkah * Math.ceil(atas / langkah), lo = langkah * Math.floor(bawah / langkah);
  const des = desimalLangkah(langkah);
  const angkaID = (v) => v.toLocaleString("id-ID", { minimumFractionDigits: des, maximumFractionDigits: des });
  const X = (i) => padL + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  const Y = (v) => yb - ((v - lo) / (hi - lo)) * ph;
  const garis = V.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const area = `M${X(0).toFixed(1)},${Y(lo).toFixed(1)} ` +
    V.map((v, i) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("") +
    ` L${X(n - 1).toFixed(1)},${Y(lo).toFixed(1)} Z`;
  let sy = "";
  for (let v = lo; v <= hi + 1e-9; v += langkah) {
    const y = Y(v);
    sy += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="pp-grid"/>` +
          `<text x="${padL - 4}" y="${(y + 3).toFixed(1)}" class="pp-ytick">${angkaID(v)}</text>`;
  }
  const satuanY = unit || (pita ? "ISPU" : "");
  const cy = (padT + ph / 2).toFixed(1);
  const yu = satuanY ? `<text transform="rotate(-90 7 ${cy})" x="7" y="${cy}" class="pp-yunit">${satuanY}</text>` : "";
  const LBL_W = 31, JEDA = 3; let sx = "", kanan = -1e9;
  for (let i = 0; i < n; i++) {
    const x = X(i);
    const anc = x - LBL_W / 2 < 2 ? "start" : (x + LBL_W / 2 > W - 2 ? "end" : "middle");
    const gx = anc === "start" ? 2 : anc === "end" ? W - 2 : x;
    const kiri = anc === "start" ? gx : anc === "end" ? gx - LBL_W : gx - LBL_W / 2;
    if (kiri < kanan + JEDA) continue;
    kanan = kiri + LBL_W;
    const dd = new Date(D[i] + "T00:00:00Z");
    const lab = dd.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
    sx += `<text x="${gx.toFixed(1)}" y="${H - 8}" class="pp-xtick" style="text-anchor:${anc}">${lab}</text>`;
  }
  let defs = "", isi = "";
  if (pita) {
    pita.forEach(([batasAtas, col], i) => {
      const bawahNilai = i === 0 ? lo : pita[i - 1][0];
      if (bawahNilai >= hi) return;
      const yA = Y(Math.min(batasAtas, hi)), yBw = Y(bawahNilai);
      if (yBw - yA <= 0.2) return;
      defs += `<clipPath id="tpita${i}"><rect x="${padL}" y="${yA.toFixed(1)}" width="${pw}" height="${(yBw - yA).toFixed(1)}"/></clipPath>`;
      isi += `<g clip-path="url(#tpita${i})"><path d="${area}" fill="${col}" opacity=".30"/>` +
             `<path d="${garis}" fill="none" stroke="${col}" stroke-width="2"/></g>`;
    });
  } else {
    isi = `<path d="${area}" fill="${warna}" opacity=".18"/>` +
          `<path d="${garis}" fill="none" stroke="${warna}" stroke-width="2"/>`;
  }
  const dot = `<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(V[n - 1]).toFixed(1)}" r="3.5" class="pp-dot"/>`;
  return `<svg class="pp-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${sy}${yu}${isi}${dot}${sx}</svg>`;
}

// Blok tren untuk satu kota + parameter aktif; jatuh ke ISPU bila parameter aktif
// tak diarsipkan (mis. daya tampung / PBLH). Return "" kalau titiknya bukan kota.
async function trenKotaHTML(nama, key) {
  const a = await loadArsip();
  if (!a || !arsipIdxByName || !arsipIdxByName.has(nama)) return "";
  const par = a.params.includes(key) ? key : "ispu";
  const ci = arsipIdxByName.get(nama);
  const vals = (a.data[par] || []).map((row) => (row && row[ci] != null ? row[ci] : null));
  const unit = par === "ispu" ? "" : (CITY_UNIT[par]?.u || "");
  const warna = (LEGENDS[par]?.cells?.[2]?.[1]) || "#35c84a";
  const pita = par === "ispu" ? ISPU_KAT.map(([batas, , col]) => [batas, col]) : null;
  const judul = par === "ispu" ? "ISPU" : (KIMIA_HTML[par] || par);
  return `<div class="pp-tren"><div class="pp-tren-head">Tren harian ${judul}<span>rata-rata per hari</span></div>` +
         trenKotaSVG(a.dates, vals, unit, warna, pita) + "</div>";
}


function nearestIndex(times, vt) {
  if (!vt || !times || !times.length) return -1;
  const t = new Date(vt).getTime();
  let bi = 0, bd = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(new Date(times[i]).getTime() - t);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Layer daya tampung isinya jauh lebih panjang dari layer lain: angka besar,
// kategori, empat baris rincian neraca, lalu plot. Di popup 330 px itu sudah
// tak muat. Jadi khusus layer itu detailnya dibuka di sidebar kanan yang bisa
// disembunyikan, sedangkan layer polutan tetap memakai popup di titiknya.
const pakaiSidebar = (key) => false;   // CESGS Aether tidak punya layer daya tampung

let sidebarTersembunyi = false;   // user menekan "sembunyikan", jangan dipaksa buka lagi

function sidebarAktif() { return !!$("point-panel")?.classList.contains("open"); }

function bukaSidebar(judul, par, koordinat) {
  const pp = $("point-panel");
  if (!pp) return;
  setPointLabel(judul, koordinat ? "coord" : "addr");
  const t = $("pt-par"); if (t) t.innerHTML = par || "";
  pp.classList.add("open");
  pp.classList.toggle("hidden", sidebarTersembunyi);
  $("pt-reopen")?.classList.toggle("show", sidebarTersembunyi);
  geserUI();
}

// Panel memakan 380 px tepi kanan peta. Kontrol kanan, legenda, dan slider ikut
// digeser selama panel benar-benar terlihat, supaya tak ada yang tertimpa.
function geserUI() {
  const pp = $("point-panel");
  const tampil = !!pp && pp.classList.contains("open") && !pp.classList.contains("hidden");
  $("stage")?.classList.toggle("pt-open", tampil);
}

function isiSidebar(html) { const b = $("pt-body"); if (b) b.innerHTML = html; }

function tutupSidebar() {
  $("point-panel")?.classList.remove("open", "hidden");
  $("pt-reopen")?.classList.remove("show");
  geserUI();
}

// Popup duduk persis di titiknya jadi tak perlu penanda. Sidebar tidak, jadi
// titik yang sedang dibaca harus ditandai sendiri di peta.
function tandaTitik(lat, lon, isMe) {
  hapusTanda();
  const html = isMe
    ? '<span class="pm-me"><span class="material-symbols-outlined">person</span></span>'
    : '<span class="pm-diamond"></span>';
  const sz = isMe ? 32 : 20;
  pointMarker = L.marker([lat, lon], {
    icon: L.divIcon({ className: "point-mark", html, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
    interactive: false, pane: "labels",
  }).addTo(map);
}

function hapusTanda() {
  if (pointMarker) { map.removeLayer(pointMarker); pointMarker = null; }
}

// Isi detail titik. Dipakai popup MAUPUN sidebar, jadi yang dikembalikan cuma
// potongan isinya, bukan bungkusnya.
async function badanTitik(key, lat, lon) {
  const pd = await loadSeries(key);
  const vals = sampleSeries(pd, lat, lon);
  let warna = (LEGENDS[key]?.cells?.[1]?.[1]) || "#35c84a";
  let kepala = "";
  if (key === "ispu") {
    // ISPU perlu dua hal lagi yang tak muat di plot: kategorinya, dan parameter
    // mana yang bikin angkanya setinggi itu. Aturannya menyebut yang kedua
    // "pencemar kritis", dan itu justru yang menentukan tindakan.
    const i = Math.max(0, nearestIndex(pd.meta.times, frames[current] && frames[current].valid_time));
    const nilai = Math.round(vals[i]);
    const [, nama, bg, putih] = ispuKategori(nilai);
    warna = bg;
    let kritis = "";
    try {
      const pk = await loadSeries("ispu_kritis");
      const kode = sampleSeriesNearest(pk, lat, lon);
      const par = (pd.meta.kritis_param || [])[Math.round(kode[i])];
      if (par) kritis = `<div class="pp-kritis">Pencemar kritis <b>${KIMIA_HTML[par] || par}</b></div>`;
    } catch (e) { console.warn("pencemar kritis tak terbaca", e); }
    kepala = `<div class="pp-ispu${putih ? " putih" : ""}" style="background:${bg}">` +
             `<b>${nilai}</b><span>${nama}</span></div>${kritis}`;
  }
  if (key === "aqi") {
    // AQI (US EPA), pembanding ISPU. Sama pola: nilai + kategori + polutan dominan.
    const i = Math.max(0, nearestIndex(pd.meta.times, frames[current] && frames[current].valid_time));
    const nilai = Math.round(vals[i]);
    const [, nama, bg, putih] = aqiKategori(nilai);
    warna = bg;
    let dom = "";
    try {
      const pk = await loadSeries("aqi_kritis");
      const kode = sampleSeriesNearest(pk, lat, lon);
      const par = (pd.meta.kritis_param || [])[Math.round(kode[i])];
      if (par) dom = `<div class="pp-kritis">Polutan dominan <b>${KIMIA_HTML[par] || par}</b></div>`;
    } catch (e) { console.warn("polutan dominan AQI tak terbaca", e); }
    kepala = `<div class="pp-ispu${putih ? " putih" : ""}" style="background:${bg}">` +
             `<b>${nilai}</b><span>${nama}</span></div>${dom}`;
  }
  const pita = key === "ispu" ? ISPU_KAT.map(([batas, , col]) => [batas, col])
    : key === "aqi" ? AQI_KAT.map(([batas, , col]) => [batas, col])
    : null;
  const baku = bakuMutuLayer(key, !!pd.meta.daily);
  // AOD memang tak bersatuan, tapi sumbu tanpa keterangan sama sekali bikin
  // bingung. Nama besarannya sendiri yang dipakai.
  const satuan = pd.meta.units || (key === "aod" ? "AOD" : "");
  // Label sumbu Y untuk indeks tak bersatuan: ikut layer aktif (ISPU vs AQI),
  // supaya AQI tak salah berlabel "ISPU".
  const namaY = key === "aqi" ? "AQI" : key === "ispu" ? "ISPU" : "";
  return {
    par: KIMIA_HTML[key] || key,
    badan: kepala + seriesPlotSVG(vals, pd.meta.times, satuan, pd.meta.daily, warna, pita, baku, namaY),
  };
}

// Geser popup titik ke BAWAH marker: offset diukur dari tinggi popup SEBENARNYA
// (presisi berapa pun isinya), tip disembunyikan via kelas .pt-pop-below.
function _popupKeBawah(pop) {
  if (!pop) return;
  const el = pop.getElement && pop.getElement();
  const wrap = el && el.querySelector(".leaflet-popup-content-wrapper");
  const h = wrap ? wrap.offsetHeight : 320;
  pop.options.offset = L.point(0, h + 22);
  pop.update();
}

async function openPoint(lat, lon, label, isMe) {
  const key = activeLayer;
  if (!key) return;
  const sidebar = pakaiSidebar(key);
  // Tutup popup lama LEBIH DULU. Penutupan memicu penangan popupclose yang
  // membersihkan state, jadi kalau state diisi duluan justru ikut terhapus.
  if (pointPopup) map.closePopup(pointPopup);
  if (!sidebar) tutupSidebar();
  popupLabel = label || null;
  sharedPoint = { lat, lon, name: label || null, me: !!isMe };
  updateHash();
  const judul = label || fmtCoord(lat, lon);
  const token = ++pointToken;                 // hasil yang telat jangan menimpa titik baru
  let popupBawah = false;
  if (sidebar) {
    tandaTitik(lat, lon, isMe);
    bukaSidebar(judul, KIMIA_HTML[key] || key, !label);
    isiSidebar('<div class="pt-loading">Memuat…</div>');
  } else {
    hapusTanda();
    // Titik di paro ATAS frame: popup default (ke atas) kepotong tepi atas karena
    // peta terkunci maxBounds (autoPan mentok). Buka KE BAWAH (kelas pt-pop-below,
    // offset diukur dari tinggi popup lewat _popupKeBawah). Paro bawah tetap ke atas.
    popupBawah = map.latLngToContainerPoint([lat, lon]).y < map.getSize().y * 0.5;
    pointPopup = L.popup({ className: popupBawah ? "pt-pop pt-pop-below" : "pt-pop",
        maxWidth: 330, autoPan: true, autoPanPadding: [16, 16], closeOnClick: false })
      .setLatLng([lat, lon])
      .setContent(`<div class="pp-title">${judul}</div><div class="pp-body">Memuat…</div>`)
      .openOn(map);
    if (popupBawah) _popupKeBawah(pointPopup);
  }
  try {
    const { par, badan } = await badanTitik(key, lat, lon);
    if (token !== pointToken) return;
    // Grafik tren riwayat, hanya kalau titiknya sebuah kota yang ada di arsip.
    let tren = "";
    if (sharedPoint && sharedPoint.name) {
      try { tren = await trenKotaHTML(sharedPoint.name, key); } catch (e) { /* arsip opsional */ }
      if (token !== pointToken) return;
    }
    if (sidebar) {
      const t = $("pt-par"); if (t) t.innerHTML = par;
      isiSidebar(badan + tren);
    } else if (pointPopup) {
      pointPopup.setContent(`<div class="pp-title">${judul}<span class="pp-par">${par}</span></div>` +
                            `<div class="pp-body">${badan + tren}</div>`);
      if (popupBawah) _popupKeBawah(pointPopup);   // tinggi berubah setelah grafik masuk
    }
  } catch (e) {
    console.error(e);
    if (token !== pointToken) return;
    if (sidebar) isiSidebar('<div class="pt-loading">Data titik gagal dimuat.</div>');
    else if (pointPopup) pointPopup.setContent(`<div class="pp-title">${judul}</div><div class="pp-body">Data titik gagal dimuat.</div>`);
  }
}

function closePoint() {
  if (pointPopup) { map.closePopup(pointPopup); pointPopup = null; }
  tutupSidebar();
  hapusTanda();
  pointToken++;
  sidebarTersembunyi = false;
  sharedPoint = null;
  popupLabel = null;
  updateHash();
}

// Popup juga bisa ditutup lewat tombol X bawaan Leaflet atau tombol Escape, dan
// jalur itu TIDAK melewati closePoint(). Tanpa penangan ini `pointPopup` tetap
// terisi, lalu setActiveLayer menghidupkannya kembali begitu parameter diganti:
// titik yang sudah ditutup muncul lagi sendiri.
map.on("popupclose", (e) => {
  if (e.popup !== pointPopup) return;
  pointPopup = null;
  sharedPoint = null;
  popupLabel = null;
  updateHash();
});

// Sembunyikan = panel digeser ke kanan, titiknya TETAP terpilih dan penanda di
// peta tetap ada. Tombol tab di tepi kanan yang memanggilnya kembali.
function hidePoint() {
  if (!sidebarAktif()) { closePoint(); return; }
  sidebarTersembunyi = true;
  $("point-panel")?.classList.add("hidden");
  $("pt-reopen")?.classList.add("show");
  geserUI();
}

function reopenPoint() {
  sidebarTersembunyi = false;
  $("point-panel")?.classList.remove("hidden");
  $("pt-reopen")?.classList.remove("show");
  geserUI();
}

// ================= FRESHNESS · SHARE · TOAST =================
// Waktu inisiasi model (run_time GFS) dalam WIB — jam & tanggal. Kredibilitas:
// user tahu kapan data terakhir diperbarui.
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function updateFreshness() {
  const el = $("fresh-text"); if (!el || !catalog?.run_time) return;
  const w = toWIB(catalog.run_time);
  const hh = String(w.getUTCHours()).padStart(2, "0");
  const mm = String(w.getUTCMinutes()).padStart(2, "0");
  el.textContent = `Last update : ${hh}:${mm} WIB, ${w.getUTCDate()} ${MONTHS_ID[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast"); if (!el) return;
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// Hash saat halaman dibuka (sebelum showFrame/updateHash menimpanya) — sumber
// kebenaran untuk restore link yang dibagikan.
const INITIAL_HASH = location.hash;

// URL-hash state: layer + waktu (valid_time) + titik → link bisa dibagikan &
// kebuka persis. replaceState supaya tak menumpuk riwayat / memicu navigasi.
function updateHash() {
  if (!activeLayer) return;
  const p = new URLSearchParams();
  p.set("l", activeLayer);
  const f = frames && frames[current];
  if (f?.valid_time) p.set("t", f.valid_time);
  if (sharedPoint) {
    p.set("p", sharedPoint.lat.toFixed(4) + "," + sharedPoint.lon.toFixed(4));
    if (sharedPoint.name) p.set("n", sharedPoint.name);
  }
  if (cyclonesOn) p.set("c", "1");
  if (itczOn) p.set("z", "1");
  if (monsoonOn) p.set("m", "1");
  if (fireOn) p.set("a", "1");
  history.replaceState(null, "", location.pathname + location.search + "#" + p.toString());
}
async function restoreFromHash() {
  const h = INITIAL_HASH.replace(/^#/, ""); if (!h || !catalog) return;
  const p = new URLSearchParams(h);
  const l = p.get("l");
  if (l && catalog.layers[l] && l !== activeLayer) {
    {
      if (BASE_OF[l] && stratoAvailable()) {   // layer versi strato -> aktifkan level dulu
        mapLevel = "strato";
        applyLevelUI();
        syncLevelControls();
      }
      setActiveLayer(l);
    }
  }
  const t = p.get("t");
  if (t && frames) {
    const idx = frames.findIndex((f) => f.valid_time === t);
    if (idx >= 0) { current = idx; showFrame(current); }
  }
  if (p.get("c") === "1" && !cyclonesOn) toggleCyclones();
  if (p.get("z") === "1" && !itczOn) toggleItcz();
  if (p.get("m") === "1" && !monsoonOn) toggleMonsoon();
  if (p.get("a") === "1" && !fireOn) toggleFire();
  const pt = p.get("p");
  if (pt) {
    const [la, lo] = pt.split(",").map(parseFloat);
    if (isFinite(la) && isFinite(lo) && (!dataBounds || dataBounds.contains([la, lo]))) {
      map.setView([la, lo], 8, { animate: false });
      openPoint(la, lo, p.get("n") || null);
    }
  }
}
async function shareCurrent() {
  updateHash();
  const url = location.href;
  const data = { title: "CESGS Aether", text: "Lihat kualitas udara di CESGS Aether", url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast("Link disalin ke clipboard");
  } catch (_) { /* user batal atau clipboard diblokir */ }
}

// Layar penuh: sembunyikan semua panel kecuali brand + fullscreen browser (best-effort).
let immersive = false;
function setFsIcon() {
  const ic = document.querySelector("#fs-btn .material-symbols-outlined");
  if (ic) ic.textContent = immersive ? "fullscreen_exit" : "fullscreen";
  $("fs-btn")?.classList.toggle("active", immersive);
}
function toggleFullscreen() {
  immersive = !immersive;
  $("stage")?.classList.toggle("immersive", immersive);
  setFsIcon();
  try {
    if (immersive) document.documentElement.requestFullscreen?.();
    else if (document.fullscreenElement) document.exitFullscreen?.();
  } catch (_) { /* fullscreen API diblokir → mode sembunyi-panel tetap jalan */ }
  setTimeout(() => map.invalidateSize(), 200);
}
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && immersive) {   // keluar via ESC → sinkron
    immersive = false;
    $("stage")?.classList.remove("immersive");
    setFsIcon();
  }
  map.invalidateSize();
});

// Kartu Tentang (modal)
function setAbout(on) {
  const box = $("about-overlay"); if (!box) return;
  box.classList.toggle("show", on);
  box.setAttribute("aria-hidden", on ? "false" : "true");
}
function openAbout() { setAbout(true); }
function closeAbout() { setAbout(false); }

// ================= SEARCH KOTA/KABUPATEN =================
let places = null, placesLoading = null;
async function loadPlaces() {
  if (places) return places;
  if (!placesLoading) placesLoading = fetch(ADMIN_BASE + "id_places.json")
    .then((r) => r.json())
    .then((a) => {
      // b = nama tanpa prefix (utk cari "sleman"), f = nama penuh (lowercase).
      // tier 0=ibukota provinsi, 1=kota, 2=kabupaten → menentukan mulai zoom berapa
      // ikon kondisi kota boleh muncul (strategi anti-rame saat zoom-out).
      places = a.map((p) => {
        const tier = PROV_CAPITALS.has(p.n) ? 0 : (p.n.startsWith("Kota") ? 1 : 2);
        const minZoom = tier === 0 ? 0 : (tier === 1 ? 5.5 : 6.5);
        return { n: p.n, lat: p.lat, lon: p.lon, tier, minZoom,
          b: p.n.replace(/^(Kabupaten|Kota) /, "").toLowerCase(), f: p.n.toLowerCase() };
      });
      return places;
    });
  return placesLoading;
}
function renderSearch(q) {
  const box = $("search-results"); if (!box) return;
  q = q.trim().toLowerCase();
  if (!q || !places) { box.innerHTML = ""; return; }
  const pre = [], sub = [];
  for (const p of places) {
    if (p.b.startsWith(q) || p.f.startsWith(q)) pre.push(p);       // awalan diprioritaskan
    else if (p.b.includes(q) || p.f.includes(q)) sub.push(p);
  }
  const res = pre.concat(sub).slice(0, 12);
  box.innerHTML = res.length
    ? res.map((p) => `<div class="search-item" data-lat="${p.lat}" data-lon="${p.lon}">${p.n}</div>`).join("")
    : '<div class="search-empty">Tak ada hasil</div>';
}
function pickPlace(lat, lon, name) {
  map.setView([lat, lon], 8, { animate: true });
  openPoint(lat, lon, name);
  $("search-box")?.classList.remove("open");
  // Bilah Kabar Kota ikut melompat ke kota yang dicari, supaya pengunjung tak
  // perlu menunggu satu putaran penuh untuk melihat kartunya.
  if (name && window.kotaLompat) window.kotaLompat(name);
}

// ================= LABEL & IKON KONDISI PER KOTA =================
// Kondisi cuaca titik dari hujan (mm/jam) + tutupan awan (%). sev = prioritas
// declutter (cuaca lebih parah menang saat berdesakan).
function cityCondition(rain, cloud) {
  if (rain >= 20) return { icon: "thunderstorm", cls: "cc-storm", sev: 5, label: "hujan sangat lebat" };
  if (rain >= 10) return { icon: "rainy_heavy", cls: "cc-heavy", sev: 4, label: "hujan lebat" };
  if (rain >= 0.5) return { icon: "rainy", cls: "cc-rain", sev: 3, label: "hujan" };
  if (cloud >= 85) return { icon: "cloud", cls: "cc-cloud", sev: 2, label: "berawan tebal" };
  if (cloud >= 40) return { icon: "partly_cloudy_day", cls: "cc-pcloud", sev: 1, label: "cerah berawan" };
  return { icon: "sunny", cls: "cc-sunny", sev: 0, label: "cerah" };
}

// Index waktu point_data terdekat dengan frame yang sedang ditampilkan.
const currentTimeIndex = (pd) => timeIndexOf(pd.meta.times);
function timeIndexOf(times) {
  const vt = frames[current] && frames[current].valid_time;
  if (!vt) return 0;
  const target = new Date(vt).getTime();
  let bi = 0, bd = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(new Date(times[i]).getTime() - target);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Tempatkan ikon kota: filter tier×zoom + dalam layar, urut prioritas, lalu
// GREEDY anti-tabrakan piksel → hanya yang tak overlap yang digambar. Efeknya
// zoom-out = ibukota provinsi saja; makin zoom-in makin banyak kota/kabupaten.
// ---- Sumber nilai label kota ----
// SENGAJA bukan point_data.bin.gz. Berkas itu 21 MB (seluruh grid 473x265), padahal
// label cuma butuh 514 titik. city_data.json sudah disampel di backend: ~100 KB
// terkirim. point_data tetap ada, tapi kembali malas: baru diunduh saat pengguna
// mengklik peta atau membuka Skew-T.
let cityData = null, cityDataLoading = null, cityIndexByName = null;
function loadCityData() {
  if (cityData) return Promise.resolve(cityData);
  if (!cityDataLoading) {
    cityDataLoading = fetch(DATA_BASE + "city_data.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          cityIndexByName = new Map(d.places.map((n, i) => [n, i]));
          cityData = d;
        }
        return cityData;
      })
      .catch(() => null);
  }
  return cityDataLoading;
}
// Satu nilai, sudah dikembalikan ke satuan aslinya.
function cityRaw(key, i, ti) {
  const a = cityData && cityData.data[key];
  // null = parameter itu belum punya nilai di langkah ini (mis. ISPU saat jendela
  // 24 jam belum genap). Harus jadi NaN, bukan 0, kalau tidak labelnya menampilkan
  // angka nol yang seolah terukur.
  if (!a || !a[i] || a[i][ti] == null) return NaN;
  return a[i][ti] * cityData.scales[key];
}

// Satuan per parameter untuk label kota. Pakai SIMBOL, bukan kata.
// Derajat & persen menempel ke angka, sisanya diberi spasi (31°C, 88%, 12 kt).
const UGM = "\u00b5g/m\u00b3";
const CITY_UNIT = {
  ispu: { u: "", d: 0 },
  pm25: { u: UGM, d: 0 }, pm10: { u: UGM, d: 0 }, co: { u: UGM, d: 0 },
  no2: { u: UGM, d: 1 }, so2: { u: UGM, d: 1 }, o3: { u: UGM, d: 0 },
  aod: { u: "", d: 2 }, pbl: { u: "m", d: 0 },
  wind_surface: { u: "kt", d: 0 },
  rain_surface: { u: "mm", d: 1 },
  rain_accum_surface: { u: "mm", d: 0 },
  temp_surface: { u: "\u00b0C", d: 0 },
  humidity_surface: { u: "%", d: 0 },
  cloud_surface: { u: "%", d: 0 },
  pressure_surface: { u: "hPa", d: 0 },
  storm_potential: { u: "J/kg", d: 0 },
  cin_surface: { u: "J/kg", d: 0 },
};
// Untuk parameter Kertas Emisi, kunci layer SAMA dengan kunci variabelnya.
const CITY_VAR = { ispu: "ispu", pm25: "pm25", pm10: "pm10", co: "co", no2: "no2",
                   so2: "so2", o3: "o3", aod: "aod", pbl: "pbl",
                   wind_surface: "wind", rain_surface: "rain", temp_surface: "temp",
                   humidity_surface: "humidity", cloud_surface: "cloud",
                   pressure_surface: "pressure", storm_potential: "cape",
                   cin_surface: "cin" };

// Nilai parameter aktif di satu kota. Rumusnya SENGAJA disamakan dengan chartSeries
// supaya angka di label dan angka di grafik panel titik tak pernah berbeda.
function cityValueText(i, ti) {
  if (BASE_OF[activeLayer]) return "";        // level strato: data titik hanya permukaan
  const s = CITY_UNIT[activeLayer];
  if (!s || !cityData) return "";
  let v;
  if (activeLayer === "rain_accum_surface") {
    const d = cityData.times[ti].slice(0, 10);   // total sepanjang TANGGAL frame aktif
    v = 0;
    cityData.times.forEach((t, k) => { if (t.slice(0, 10) === d) v += cityRaw("rain", i, k) * 3; });
  } else {
    v = cityRaw(CITY_VAR[activeLayer], i, ti);
  }
  if (!isFinite(v)) return "";
  if (s.bagi) v /= s.bagi;
  // Hujan per jam angkanya kecil, jadi 1 desimal. Tapi "0.0 mm" di seluruh peta
  // cuma jadi sampah visual, dan di atas 10 mm desimalnya tak berguna.
  const dec = (activeLayer === "rain_surface" && (v < 0.05 || v >= 10)) ? 0 : s.d;
  const sep = (s.u === "\u00b0C" || s.u === "%" || s.u === "") ? "" : " ";
  // Ribuan diberi pemisah supaya 142167 tak terbaca sebagai deretan angka acak.
  const angka = Math.abs(v) >= 1000
    ? v.toLocaleString("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : v.toFixed(dec);
  return angka + (s.sfx || "") + sep + s.u;
}

// Nama untuk DI PETA saja, biar label pendek. Judul panel titik & tooltip tetap
// memakai nama lengkap.
//
// Awalan "Kabupaten"/"Kota" dibuang, TAPI "Kota" dipertahankan kalau ada kabupaten
// bernama sama. Tanpa ini "Kota Bandung" dan "Kabupaten Bandung" sama sama jadi
// "Bandung", padahal wilayah dan angkanya berbeda. Ada 26 pasangan seperti itu.
let cityDupNames = null;
const cityBaseName = (n) => n.replace(/^(Kabupaten|Kota)(\s+Administrasi)?\s+/, "");
function buildCityDupNames(places) {
  if (cityDupNames) return;
  const hitung = {};
  for (const p of places) { const b = cityBaseName(p.n); hitung[b] = (hitung[b] || 0) + 1; }
  cityDupNames = new Set(Object.keys(hitung).filter((k) => hitung[k] > 1));
}
function cityShortName(n) {
  const base = cityBaseName(n);
  return (/^Kota\b/.test(n) && cityDupNames && cityDupNames.has(base)) ? "Kota " + base : base;
}
const escHtml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function refreshCityIcons() {
  if (!cityGroup) return;
  if (activeLayer === "vso2") { cityGroup.clearLayers(); return; }   // fokus ke gunung, lihat aturGunung
  let cd, pl;
  try { cd = await loadCityData(); pl = await loadPlaces(); }
  catch (e) { console.warn("Label kota gagal dimuat:", e); return; }
  if (!cityGroup || !cd) return;   // bisa dibongkar selama await
  buildCityDupNames(pl);
  const ti = timeIndexOf(cd.times);
  const z = map.getZoom(), b = map.getBounds();
  const cands = [];
  for (const p of pl) {
    if (z < p.minZoom || !b.contains([p.lat, p.lon])) continue;
    const i = cityIndexByName.get(p.n);
    if (i === undefined) continue;   // daftar tempat & city_data tak sinkron
    cands.push({ p, cond: cityCondition(cityRaw("rain", i, ti), cityRaw("cloud", i, ti)),
                 val: cityValueText(i, ti) });
  }
  cands.sort((a, c) => a.p.tier - c.p.tier || c.cond.sev - a.cond.sev);
  cityGroup.clearLayers();
  // Kotak anti-tabrakan LEBIH LEBAR dari ikon, karena ada nama + nilai di bawahnya.
  // Lebarnya dihitung dari ISI labelnya, bukan dipatok satu angka: nama panjang
  // seperti "Kota Gorontalo" dan nilai panjang seperti "-13 rb t/th" butuh ruang
  // jauh lebih besar daripada "Ambon 43", dan patokan tetap membuat keduanya
  // tetap ditempatkan lalu saling tindih.
  const RY = cityIconsOn ? 44 : 34;
  const setengahLebar = (c) =>
    Math.max(28, 3.3 * cityShortName(c.p.n).length, 3.7 * (c.val || "").length) + 6;
  const placed = [];
  for (const c of cands) {
    const pt = map.latLngToContainerPoint([c.p.lat, c.p.lon]);
    const w = setengahLebar(c);
    let ok = true;
    for (let i = 0; i < placed.length; i++)
      if (Math.abs(pt.x - placed[i].x) < w + placed[i].w &&
          Math.abs(pt.y - placed[i].y) < RY) { ok = false; break; }
    if (!ok) continue;
    placed.push({ x: pt.x, y: pt.y, w });
    const ico = cityIconsOn
      ? `<span class="cc-ico ${c.cond.cls}${c.p.tier === 0 ? " cc-cap" : ""}">` +
        `<span class="material-symbols-outlined">${c.cond.icon}</span></span>`
      : "";
    const m = L.marker([c.p.lat, c.p.lon], {
      pane: "cityicons", title: c.p.n, keyboard: false,
      icon: L.divIcon({ className: "city-cond" + (cityIconsOn ? "" : " no-ico"),
        iconSize: [30, 30], iconAnchor: [15, 15],
        html: ico + `<span class="cc-lbl"><b>${escHtml(cityShortName(c.p.n))}</b>` +
              (c.val ? `<i>${escHtml(c.val)}</i>` : "") + `</span>` }),
    });
    m.on("click", (e) => { L.DomEvent.stopPropagation(e); openPoint(c.p.lat, c.p.lon, c.p.n); });
    cityGroup.addLayer(m);
  }
  cityPlacedPts = placed;
  refreshGeoLabels();   // nama negara/laut ditata ULANG supaya menghindari label kota
}

// Legenda kecil kategori ikon (cermin cityCondition) — dibangun sekali.
const COND_LEGEND = [
  { icon: "sunny", cls: "cc-sunny", label: "Cerah" },
  { icon: "partly_cloudy_day", cls: "cc-pcloud", label: "Berawan" },
  { icon: "cloud", cls: "cc-cloud", label: "Mendung" },
  { icon: "rainy", cls: "cc-rain", label: "Hujan" },
  { icon: "rainy_heavy", cls: "cc-heavy", label: "Lebat" },
  { icon: "thunderstorm", cls: "cc-storm", label: "Sangat lebat" },
];
function buildCondLegend() {
  const el = $("cond-legend");
  if (!el || el.dataset.built) return;
  el.innerHTML = '<div class="cl-head mono">KONDISI</div><div class="cl-grid">' +
    COND_LEGEND.map((c) =>
      `<div class="cl-item"><span class="cc-ico cc-mini ${c.cls}">` +
      `<span class="material-symbols-outlined">${c.icon}</span></span>` +
      `<span class="cl-lbl">${c.label}</span></div>`).join("") +
    "</div>";
  el.dataset.built = "1";
}

// Tombol "Kondisi" kini HANYA menyalakan ikon cuaca + legendanya. Label nama & nilai
// tak ikut mati, karena itu informasi parameter yang sedang dipilih, bukan kondisi.
// Sembunyikan/tampilkan panel Parameter + Model. Brand sengaja TETAP terlihat,
// jadi identitas dan tombol Tentang tak ikut hilang.
function togglePanels() {
  const col = document.querySelector("#ui .col:not(.items-end)");
  const btn = $("panel-toggle");
  if (!col || !btn) return;
  const tutup = col.classList.toggle("panels-hidden");
  const ic = btn.querySelector(".material-symbols-outlined");
  if (ic) ic.textContent = tutup ? "chevron_right" : "chevron_left";
  const label = tutup ? "Tampilkan panel" : "Sembunyikan panel";
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

function toggleCityIcons() {
  cityIconsOn = !cityIconsOn;
  $("city-toggle") && $("city-toggle").classList.toggle("active", cityIconsOn);
  const cl = $("cond-legend");
  if (cityIconsOn) { buildCondLegend(); if (cl) cl.classList.add("show"); }
  else if (cl) cl.classList.remove("show");
  refreshCityIcons();
}

// Label kota selalu ada sejak peta dibuka. point_data dimuat di latar, jadi peta
// tetap bisa dipakai selagi berkasnya turun; labelnya menyusul saat sudah siap.
function initCityLabels() {
  if (!cityGroup) cityGroup = L.layerGroup([], { pane: "cityicons" });
  cityGroup.addTo(map);
  refreshCityIcons();
}

// ================= SIKLON (indikasi model GFS) =================
async function loadCyclones() {
  if (cyclones) return cyclones;
  if (!cyclonesLoading) cyclonesLoading = fetch(DATA_BASE + "cyclones.json")
    .then((r) => (r.ok ? r.json() : { tracks: [] }))
    .then((j) => (cyclones = j))
    .catch(() => (cyclones = { tracks: [] }));
  return cyclonesLoading;
}
// Warna ikut TINGKAT: Siklon Lintang Tinggi (UNGU), Siklon Tropis (MERAH),
// Bibit Siklon (ORANYE), Sirkulasi Siklonik (HIJAU TUA). Kunci legenda identifikasi.
function cycloneColor(tier, cat) {
  if (tier === "EXTRA") return "#7a1fa2";              // Siklon Lintang Tinggi — ungu
  if (tier === "SEED") return "#f59f00";              // Bibit Siklon — oranye
  if (tier === "CIRC") return "#1b7a3d";              // Sirkulasi Siklonik — hijau tua
  return cat >= 3 ? "#a11010" : "#d61f1f";            // Siklon Tropis — merah
}
function refreshCyclones() {
  if (!cycloneGroup) return;
  cycloneGroup.clearLayers();
  if (!cyclonesOn || !cyclones || !frames[current]) return;
  const nowT = frames[current].valid_time;
  for (const tr of cyclones.tracks) {
    // Hanya sistem yang ADA di waktu aktif → jalur selalu ada ikon siklonnya
    // (buang bug garis nyasar dari sistem yang baru terbentuk di jam lain).
    const cur = tr.points.find((p) => p.t === nowT);
    if (!cur) continue;
    const color = cycloneColor(tr.tier, tr.peak_cat);
    const sz = (tr.tier === "TC" || tr.tier === "EXTRA") ? 36 : tr.tier === "SEED" ? 30 : 26;
    const past = [], future = [];
    for (const p of tr.points) (p.t < nowT ? past : future).push([p.lat, p.lon]);
    if (past.length && future.length) future.unshift(past[past.length - 1]); // sambung
    if (past.length > 1)
      L.polyline(past, { pane: "cyclonepath", color, weight: 2, opacity: 0.3, dashArray: "3 5", interactive: false }).addTo(cycloneGroup);
    if (future.length > 1)
      L.polyline(future, { pane: "cyclonepath", color, weight: 3, opacity: 0.9, interactive: false }).addTo(cycloneGroup);
    for (const p of tr.points) {
      if (p.t < nowT) continue;       // titik prakiraan ke depan
      L.circleMarker([p.lat, p.lon], { pane: "cyclonepath", radius: 2.5, weight: 0,
        fillColor: color, fillOpacity: 0.9, interactive: false }).addTo(cycloneGroup);
    }
    const m = L.marker([cur.lat, cur.lon], {
      pane: "cyclones", keyboard: false,
      title: `${tr.name} · ${cur.label} · ${cur.wind_kt} kt · ${cur.mslp} hPa`,
      icon: L.divIcon({ className: "cyc-mark", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
        html: `<span class="cyc-spin" style="color:${color};font-size:${sz - 4}px"><span class="material-symbols-outlined" style="font-size:${sz - 4}px">cyclone</span></span>` }),
    });
    m.on("click", (e) => { L.DomEvent.stopPropagation(e); openPoint(cur.lat, cur.lon, tr.name); });
    cycloneGroup.addLayer(m);
  }
}
function toggleCyclones() {
  cyclonesOn = !cyclonesOn;
  $("cyclone-toggle") && $("cyclone-toggle").classList.toggle("active", cyclonesOn);
  const note = $("cyc-note");
  if (cyclonesOn) {
    if (!cycloneGroup) cycloneGroup = L.layerGroup([], { pane: "cyclones" });
    cycloneGroup.addTo(map);
    if (note) note.classList.add("show");
    loadCyclones().then(() => { if (cyclonesOn) refreshCyclones(); });
  } else {
    if (cycloneGroup) { cycloneGroup.clearLayers(); map.removeLayer(cycloneGroup); }
    if (note) note.classList.remove("show", "open");
  }
  updateHash();
}

// ================= TITIK PANAS VIIRS (FIRMS) =================
// Overlay PENGAMATAN satelit (bukan ramalan): hanya titik panas KUAT (FRP >= 100
// MW, disaring di backend), digambar MERAH TUA.
// Titik api IKUT SLIDER WAKTU UTAMA, diminta user. Dulu punya slider sendiri
// "48 jam terakhir" yang membingungkan. Satelit VIIRS cuma melintas beberapa
// kali sehari (sekitar 01.30 dan 13.30 WIB), jadi menyaring per jam membuat
// peta kosong di hampir semua jam. Yang tampil adalah deteksi 24 JAM SAMPAI
// JAM DI SLIDER, yang terbaru pekat dan yang lebih lama memudar.
// Untuk jam ramalan belum ada pengamatan. Yang tampil pengamatan terakhir, dan
// banner menulisnya terang terangan. Titiknya sengaja tetap ada supaya Arah
// Asap bisa dipakai untuk jam ramalan.
const FIRE_WARNA = "#a80000";
const FIRE_JENDELA_JAM = 24;
let fireRenderer = null;
let fireMaxT = 0;             // waktu deteksi TERBARU dalam data, ms

function loadFire() {
  if (fireData) return Promise.resolve(fireData);
  if (!fireLoading) fireLoading = fetch(DATA_BASE + "titik_api.json")
    .then((r) => (r.ok ? r.json() : { titik: [] }))
    .then((j) => (fireData = j))
    .catch(() => (fireData = { titik: [] }));
  return fireLoading;
}
const _CONF_TEKS = { l: "rendah", n: "nominal", h: "tinggi" };
function fmtWaktuWIB(iso) {
  try {
    return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta",
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " WIB";
  } catch { return iso; }
}
// Deteksi TERBARU dalam data, jadi batas antara jam yang sudah teramati dan belum.
function hitungFireMaxT() {
  const titik = (fireData && fireData.titik) || [];
  fireMaxT = titik.reduce((mx, p) => Math.max(mx, +new Date(p.t) || 0), 0);
}
// "Jum 00.56 WIB", untuk kalimat pendek di banner titik api.
function _jamPendek(ms) {
  const d = new Date(ms);
  const hari = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "short" });
  const jam = d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
  return `${hari} ${jam.replace(":", ".")} WIB`;
}
function drawFire() {
  if (!fireGroup) return;
  fireGroup.clearLayers();
  if (!fireOn || !fireData) return;
  const titik = fireData.titik || [];
  const vt = frames[current] && frames[current].valid_time;
  const tSlider = vt ? Date.parse(vt) : fireMaxT;
  // Jam ramalan belum teramati, jangkarnya pengamatan terakhir.
  const belum = fireMaxT && tSlider > fireMaxT;
  const jangkar = belum ? fireMaxT : tSlider;
  const awal = jangkar - FIRE_JENDELA_JAM * 3600e3;
  let n = 0;
  for (const p of titik) {
    const tp = +new Date(p.t) || 0;
    if (tp > jangkar || tp <= awal) continue;
    n++;
    // Umur deteksi terhadap jangkar. Enam jam terakhir pekat, lalu memudar
    // sampai sekitar sepertiga di ujung jendela 24 jam.
    const umur = (jangkar - tp) / 3600e3;
    const pekat = umur <= 6 ? 0.95 : Math.max(0.3, 0.95 - ((umur - 6) / (FIRE_JENDELA_JAM - 6)) * 0.65);
    // Mode Kabar Kota memakai ikon api, diminta user untuk booth. Di luar mode itu
    // tetap titik merah seperti semula. Pudarnya ikut umur deteksi di keduanya.
    const m = modeKota
      ? L.marker([p.la, p.lo], { pane: "fire", keyboard: false, title: "Titik api", opacity: pekat,
          icon: L.divIcon({ className: "api-ikon", iconSize: [18, 18], iconAnchor: [9, 15],
            html: '<span class="material-symbols-outlined">local_fire_department</span>' }) })
      : L.circleMarker([p.la, p.lo], { pane: "fire", renderer: fireRenderer,
          radius: 3.5, weight: 0.5, color: "#3a0a0a", opacity: pekat,
          fillColor: FIRE_WARNA, fillOpacity: pekat });
    m.on("click", (ev) => { L.DomEvent.stopPropagation(ev); openFirePopup(p); });
    fireGroup.addLayer(m);
  }
  // Kalimat banner sengaja pendek, diminta user. Jam slider tak perlu diulang,
  // sudah terlihat di slider. Untuk jam ramalan cukup disebut kapan data
  // terakhirnya, hari dan jam saja.
  const ring = $("api-ringkas");
  if (ring) {
    if (!titik.length) ring.textContent = "Belum ada data titik api";
    else if (belum) ring.textContent = `${n} titik api, data terakhir ${_jamPendek(fireMaxT)}`;
    else ring.textContent = n
      ? `${n} titik api dalam 24 jam terakhir`
      : "Tidak ada titik api dalam 24 jam terakhir";
  }
  // Mode Kabar Kota tidak memakai banner, jumlahnya tampil di status samping legenda.
  statusApi = { n, ada: titik.length > 0, belum: !!belum, akhir: fireMaxT };
  aturStatusSamping();
}
// Popup titik api. Default terbuka ke ATAS marker (tip di bawah). Untuk titik dekat
// tepi ATAS frame, popup default nyembur keluar bingkai (peta terkunci maxBounds,
// autoPan mentok), jadi dibuka ke BAWAH: offset positif diukur dari tinggi popup
// SEBENARNYA (presisi berapa pun barisnya) dan tip disembunyikan via .fire-popup-below.
function openFirePopup(p) {
  const latlng = [p.la, p.lo];
  const below = map.latLngToContainerPoint(latlng).y < 160;
  const html = `<div class="fire-pop"><b>Titik api kuat</b><br>` +
    `FRP ${p.f} MW · keyakinan ${_CONF_TEKS[p.c] || p.c}<br>` +
    `${fmtWaktuWIB(p.t)}${p.s ? " · " + p.s : ""}` +
    `<button type="button" class="asap-btn"><span class="material-symbols-outlined">air</span>Lihat arah asap</button></div>`;
  const pop = L.popup({ className: below ? "fire-popup fire-popup-below" : "fire-popup",
    autoPan: true, autoPanPadding: [24, 24] })
    .setLatLng(latlng).setContent(html).openOn(map);
  pop.getElement()?.querySelector(".asap-btn")?.addEventListener("click", () => {
    map.closePopup(pop);
    bukaAsap(p.la, p.lo);
  });
  if (below) {
    const wrap = pop.getElement() && pop.getElement().querySelector(".leaflet-popup-content-wrapper");
    const h = wrap ? wrap.offsetHeight : 64;
    pop.options.offset = L.point(0, h + 22);   // geser ke bawah marker
    pop.update();                              // hitung ulang posisi dgn offset baru
  }
}
function toggleFire() {
  fireOn = !fireOn;
  $("api-toggle") && $("api-toggle").classList.toggle("active", fireOn);
  if (fireOn) {
    if (!fireRenderer) fireRenderer = L.canvas({ pane: "fire", padding: 0.5 });
    if (!fireGroup) fireGroup = L.layerGroup([], { pane: "fire" });
    fireGroup.addTo(map);
    loadFire().then(() => { if (!fireOn) return; hitungFireMaxT(); drawFire(); });
  } else {
    if (fireGroup) { fireGroup.clearLayers(); map.removeLayer(fireGroup); }
    tutupAsap();
  }
  aturBanner();
  aturStatusSamping();
  updateHash();
}


// ================= GUNUNG API (status PVMBG + gas belerang CAMS) =================
// Parameter "Gas Gunung Api" di rel kiri. Peta menampilkan gas belerang (SO2
// vulkanik di lapisan model paling bawah, satuan mentah kg/kg) dari model CAMS
// seperti polutan lain, dan di atasnya titik tiap gunung api dengan warna status RESMI dari MAGMA
// Indonesia (PVMBG). Gunung Siaga dan Awas diberi lingkaran radius bahaya dari
// rekomendasinya. Ini GAS, bukan abu, dan itu ditulis terang di banner.
// Awalnya fitur tumpangan di panel kanan, dipindah ke rel kiri atas permintaan
// user supaya punya legenda sendiri dan fokus ke gunung.
const GUNUNG_WARNA = { 1: "#3fb950", 2: "#f2c200", 3: "#ff8a00", 4: "#e0241b" };
const GUNUNG_NAMA = { 1: "Normal", 2: "Waspada", 3: "Siaga", 4: "Awas" };

function loadGunung() {
  if (gunungData) return Promise.resolve(gunungData);
  if (!gunungLoading) gunungLoading = fetch(DATA_BASE + "gunung_api.json")
    .then((r) => (r.ok ? r.json() : { gunung: [] }))
    .then((j) => (gunungData = j))
    .catch(() => (gunungData = { gunung: [] }));
  return gunungLoading;
}

function _esc(t) {
  return String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function drawGunung() {
  if (!gunungGroup) return;
  gunungGroup.clearLayers();
  const daftar = (gunungData && gunungData.gunung) || [];
  // Normal digambar dulu supaya yang bergolak selalu di atas.
  for (const g of [...daftar].sort((a, b) => a.lvl - b.lvl)) {
    if (!isFinite(g.lat) || !isFinite(g.lon)) continue;
    const r = g.laporan && g.laporan.radius_km;
    if (g.lvl >= 3 && r) {
      L.circle([g.lat, g.lon], { pane: "gunung", radius: r * 1000, color: GUNUNG_WARNA[g.lvl],
        weight: 1.5, dashArray: "4 4", fillColor: GUNUNG_WARNA[g.lvl], fillOpacity: 0.12,
        interactive: false }).addTo(gunungGroup);
    }
    const sz = { 1: 12, 2: 15, 3: 19, 4: 21 }[g.lvl] || 12;
    const nama = g.lvl >= 3 ? `<b class="gn-nama">${_esc(g.n)}</b>` : "";
    const m = L.marker([g.lat, g.lon], { pane: "gunung", keyboard: false, title: `${g.n}, ${GUNUNG_NAMA[g.lvl]}`,
      icon: L.divIcon({ className: `gn-ikon gn-l${g.lvl}`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz * 0.75],
        html: `<span class="gn-seg" style="--gw:${GUNUNG_WARNA[g.lvl]}"></span>${nama}` }) });
    m.on("click", () => openGunungPopup(g));
    m.addTo(gunungGroup);
  }
  const n = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const g of daftar) n[g.lvl] = (n[g.lvl] || 0) + 1;
  const ring = $("gunung-ringkas");
  if (ring) {
    const bagian = [];
    if (n[4]) bagian.push(`${n[4]} Awas`);
    bagian.push(`${n[3]} Siaga`, `${n[2]} Waspada`);
    ring.textContent = daftar.length ? `${bagian.join(", ").replace(/^(\d+)/, "$1 gunung")}` : "Data gunung api belum tersedia";
  }
  // Mode Kabar Kota tidak memakai banner, hitungannya tampil di status samping legenda.
  statusGunung = daftar.length ? n : null;
  aturStatusSamping();
}

function openGunungPopup(g) {
  const lap = g.laporan || {};
  let rek = lap.rekomendasi || "";
  const panjang = rek.length > 240;
  if (panjang) rek = rek.slice(0, 240).replace(/\s+\S*$/, "") + "…";
  const html =
    `<div class="gn-pop"><div class="gn-pop-n">${_esc(g.n)}</div>` +
    `<div class="gn-pop-p">${_esc(g.prov)}</div>` +
    `<span class="gn-chip" style="--gw:${GUNUNG_WARNA[g.lvl]}">Level ${["", "I", "II", "III", "IV"][g.lvl]} ${GUNUNG_NAMA[g.lvl]}</span>` +
    (lap.waktu ? `<div class="gn-pop-sub">Laporan ${_esc(lap.waktu)}</div>` : "") +
    (lap.visual ? `<div class="gn-pop-h">Pengamatan</div><p>${_esc(lap.visual)}</p>` : "") +
    (rek ? `<div class="gn-pop-h">Rekomendasi resmi</div><p>${_esc(rek)}</p>` : "") +
    `<a class="gn-pop-a" href="${_esc(g.url)}" target="_blank" rel="noopener">Laporan lengkap di MAGMA PVMBG</a></div>`;
  L.popup({ className: "fire-popup", maxWidth: 300, autoPan: true, autoPanPadding: [24, 24] })
    .setLatLng([g.lat, g.lon]).setContent(html).openOn(map);
}

// Parameter Gas Gunung Api FOKUS KE GUNUNG. Waktu dipilih, titik status gunung
// dan bannernya muncul, label nilai kota disembunyikan (nilai gas di pusat kota
// hampir selalu nol, jadi cuma mengotori peta). Dipanggil tiap ganti layer.
function aturGunung() {
  const fokus = activeLayer === "vso2" || gunungSelalu;
  if (fokus) {
    if (!gunungGroup) gunungGroup = L.layerGroup([], { pane: "gunung" });
    gunungGroup.addTo(map);
    loadGunung().then(() => { if (activeLayer === "vso2" || gunungSelalu) drawGunung(); });
  } else {
    if (gunungGroup) { gunungGroup.clearLayers(); map.removeLayer(gunungGroup); }
  }
  aturBanner();
  aturStatusSamping();
}

// ================= MODE KABAR KOTA =================
// Diminta user. Semua tata letak baru untuk booth (status di samping legenda,
// ikon api, tombol Model di kanan, Last update di bawah kartu brand, legenda di
// layar penuh) CUMA berlaku waktu Kabar Kota menyala. Kabar Kota mati, situs
// kembali ke tata letak semula. kota.js memanggil setModeKota tiap bilahnya
// dinyalakan atau dimatikan. Aturan CSS-nya bergantung pada kelas #ui.kota-on.
let modeKota = false;
function setModeKota(on) {
  modeKota = !!on;
  if (fireOn && fireData) drawFire();   // titik merah dan ikon api bertukar
  aturBanner();
  aturStatusSamping();
  aturTempatFresh();
  aturTempatModel();
}

// Banner titik api dan gunung api, tampilan semula. Disembunyikan di mode Kabar Kota.
function aturBanner() {
  const api = $("api-note"), gn = $("gunung-note");
  const apiTampil = fireOn && !modeKota;
  const gnTampil = activeLayer === "vso2" && !modeKota;
  if (api) { api.classList.toggle("show", apiTampil); if (!apiTampil) api.classList.remove("open"); }
  if (gn) { gn.classList.toggle("show", gnTampil); if (!gnTampil) gn.classList.remove("open"); }
}

// Badge Last update. HP selalu di legend-col (di atas legenda). Desktop, di mode
// Kabar Kota tepat di bawah kartu brand, di luar mode itu di kontainer slider
// (atas kanan) seperti semula.
function aturTempatFresh() {
  const badge = $("data-fresh");
  if (!badge) return;
  const hp = window.matchMedia("(max-width: 640px)").matches;
  if (hp) {
    const host = document.querySelector(".legend-col");
    if (host && badge.parentElement !== host) host.insertBefore(badge, host.firstChild);
  } else if (modeKota) {
    const brand = document.querySelector(".brand-row");
    if (brand && brand.nextElementSibling !== badge) brand.insertAdjacentElement("afterend", badge);
  } else {
    const host = document.querySelector(".ui-bottom .timeline");
    if (host && badge.parentElement !== host) host.insertBefore(badge, host.firstChild);
  }
}

// Panel MODEL. Semula di kolom kiri di bawah Parameter. Di mode Kabar Kota
// dipindah utuh ke kotak tombol Model di kolom kanan. Elemen aslinya yang
// dipindah, jadi pendengar dropdown tetap jalan.
function aturTempatModel() {
  const panel = document.querySelector(".panel.selects");
  const kotak = $("model-box");
  const jangkar = document.querySelector(".level-bar");
  if (!panel || !kotak || !jangkar) return;
  if (modeKota) {
    if (panel.parentElement !== kotak) kotak.appendChild(panel);
  } else {
    kotak.classList.remove("open");
    if (panel.previousElementSibling !== jangkar) jangkar.insertAdjacentElement("afterend", panel);
  }
}

// ================= STATUS DI SAMPING LEGENDA =================
// Versi Kabar Kota dari banner titik api dan banner gunung api, diminta user.
// Satu kotak kaca kecil tepat di kiri batang legenda. Isinya hitungan status gunung waktu
// parameter Gas Gunung Api tampil, dan jumlah titik api waktu Titik Api
// menyala. Penjelasan lengkap yang dulu ada di banner muncul waktu kotaknya
// ditunjuk, atau diketuk di layar sentuh.
let statusApi = null;       // {n, ada, belum, akhir}, diisi drawFire
// Selama Kabar Kota menyala, gunung api dan statusnya tampil MENETAP di semua
// parameter, bukan cuma di Gas Gunung Api. Diatur kota.js lewat setGunungSelalu.
let gunungSelalu = false;
function setGunungSelalu(on) {
  gunungSelalu = !!on;
  aturGunung();
}
let statusGunung = null;    // {1..4: jumlah}, diisi drawGunung

const KET_API = "Titik api KUAT (FRP di atas 100 MW) dari satelit VIIRS yang terdeteksi 24 jam " +
  "sampai jam yang tampil di slider. Ikon yang lebih pudar adalah deteksi yang lebih lama. Ini " +
  "PENGAMATAN (telat sekitar 3 jam), bukan ramalan, dan bisa terlewat bila tertutup awan. Untuk " +
  "jam ramalan yang tampil pengamatan terakhir. Klik ikon api untuk detail dan arah asapnya.";
const KET_GUNUNG = "Segitiga menunjukkan status resmi gunung api dari PVMBG, dan lingkaran putus " +
  "putus radius bahaya yang direkomendasikan. Warna di peta adalah gas SO\u2082 dari gunung api di " +
  "udara dekat permukaan menurut model CAMS, bukan abu. Klik gunung untuk laporan terbarunya.";

function aturStatusSamping() {
  const box = $("status-samping");
  if (!box) return;
  const bagian = [];
  if (!modeKota) { box.innerHTML = ""; box.hidden = true; return; }
  if ((activeLayer === "vso2" || gunungSelalu) && statusGunung) {
    const n = statusGunung;
    const item = (lvl) => `<span class="ss-item"><i class="ss-seg" style="--gw:${GUNUNG_WARNA[lvl]}"></i>` +
      `${GUNUNG_NAMA[lvl]} <b>${n[lvl] || 0}</b></span>`;
    bagian.push(`<div class="ss-grup" tabindex="0">` +
      `<span class="ss-judul"><span class="material-symbols-outlined">landscape</span>Gunung</span>` +
      (n[4] ? item(4) : "") + item(3) + item(2) + item(1) +
      `<div class="ss-tip">${_esc(KET_GUNUNG)}</div></div>`);
  }
  if (fireOn && statusApi) {
    const a = statusApi;
    // Keterangan waktu dipindah ke tooltip supaya jajaran di samping legenda
    // tetap ringkas dan tidak menabrak badge parameter.
    const sub = !a.ada ? "Belum ada data titik api."
      : a.belum ? `Data terakhir ${_jamPendek(a.akhir)}.` : "Dalam 24 jam terakhir.";
    bagian.push(`<div class="ss-grup" tabindex="0">` +
      `<span class="ss-judul ss-api"><span class="material-symbols-outlined">local_fire_department</span>Titik api</span>` +
      `<span class="ss-item"><b>${a.n}</b></span>` +
      `<div class="ss-tip"><b>${a.n} titik api.</b> ${_esc(sub)}<br>${_esc(KET_API)}</div></div>`);
  }
  box.innerHTML = bagian.join("");
  box.hidden = !bagian.length;
}

// ================= ARAH ASAP (lintasan asap dari titik api) =================
// Dari satu titik api, posisi asap digeser mengikuti angin 10 m ramalan CAMS
// sedikit demi sedikit, mulai dari JAM YANG TAMPIL di slider, sampai 48 jam
// atau sampai keluar peta. Sembilan lintasan, satu di tengah dan delapan dari
// titik yang sedikit bergeser, jadi terbentuk KIPAS. Kipas sempit berarti
// arahnya yakin, kipas lebar berarti kurang pasti. Satu garis tunggal akan
// terlihat lebih pasti daripada kenyataannya.
// Anginnya dari deret pd_angin_u dan pd_angin_v, bukan dari berkas velocity
// JSON animasi partikel, yang 1,8 MB per jam. Dua deret itu baru dimuat waktu
// fitur ini pertama kali dipakai.
const ASAP_JAM = 48;              // panjang lintasan
const ASAP_DT_MNT = 15;           // langkah integrasi
const ASAP_PENANDA_JAM = 6;       // penanda jam di garis tengah
const ASAP_KIPAS_DEG = 0.12;      // jarak titik awal lintasan pinggir, ~13 km
// Kota dianggap DILEWATI kalau garis tengah sedekat ini dari titik acuannya.
// Acuannya pusat kabupaten dan kota, rata rata berjarak sekitar 60 km, jadi
// radius yang lebih kecil membuat banyak wilayah yang jelas dilewati terlewat.
const ASAP_KOTA_KM = 35;
// Status Arah Asap dideklarasikan di atas, dekat fireData, lihat catatannya di sana.

function _jarakKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
  const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
const _ARAH8 = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"];
function _arahKe(la1, lo1, la2, lo2) {
  const r = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
  const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  const deg = (Math.atan2(y, x) / r + 360) % 360;
  return _ARAH8[Math.round(deg / 45) % 8];
}

// Angin di satu titik dan satu saat, bilinear di ruang, linear di waktu.
// Balik null kalau di luar domain atau di luar rentang waktu data.
function _anginDi(pu, pv, T, lat, lon, tms) {
  const { nx, ny, west, east, north, south, scale } = pu.meta;
  if (lon < west || lon > east || lat < south || lat > north) return null;
  if (tms < T[0] || tms > T[T.length - 1]) return null;
  let i = 0;
  while (i < T.length - 2 && T[i + 1] <= tms) i++;
  const ft = T[i + 1] > T[i] ? (tms - T[i]) / (T[i + 1] - T[i]) : 0;
  const fx = (lon - west) / ((east - west) / (nx - 1));
  const fy = (north - lat) / ((north - south) / (ny - 1));
  const x0 = Math.min(nx - 2, Math.floor(fx)), y0 = Math.min(ny - 2, Math.floor(fy));
  const tx = fx - x0, ty = fy - y0;
  const bil = (arr, t) => {
    const b = t * nx * ny;
    return ((1 - tx) * (1 - ty) * arr[b + y0 * nx + x0] + tx * (1 - ty) * arr[b + y0 * nx + x0 + 1] +
            (1 - tx) * ty * arr[b + (y0 + 1) * nx + x0] + tx * ty * arr[b + (y0 + 1) * nx + x0 + 1]) * scale;
  };
  const t1 = Math.min(i + 1, T.length - 1);
  return [bil(pu.arr, i) * (1 - ft) + bil(pu.arr, t1) * ft,
          bil(pv.arr, i) * (1 - ft) + bil(pv.arr, t1) * ft];
}

// Satu lintasan, Runge-Kutta orde dua (titik tengah). Tiap titik [lat, lon, ms].
function _lintasan(pu, pv, T, lat, lon, t0) {
  const dt = ASAP_DT_MNT * 60, n = ASAP_JAM * 60 / ASAP_DT_MNT;
  const geser = (la, lo, w, detik) => [
    la + (w[1] * detik) / 111320,
    lo + (w[0] * detik) / (111320 * Math.cos(la * Math.PI / 180)),
  ];
  const jalur = [[lat, lon, t0]];
  let la = lat, lo = lon, t = t0;
  for (let k = 0; k < n; k++) {
    const w1 = _anginDi(pu, pv, T, la, lo, t);
    if (!w1) break;
    const [lam, lom] = geser(la, lo, w1, dt / 2);
    const w2 = _anginDi(pu, pv, T, lam, lom, t + (dt / 2) * 1000);
    if (!w2) break;
    [la, lo] = geser(la, lo, w2, dt);
    t += dt * 1000;
    jalur.push([la, lo, t]);
  }
  return jalur;
}

function _isiKartuAsap(html) {
  const c = $("asap-card"); if (!c) return;
  c.querySelector(".asap-isi").innerHTML = html;
  c.classList.add("show");
}

function bukaAsap(lat, lon) {
  asapTitik = { lat, lon };
  asapPasBingkai = true;
  if (!asapGroup) asapGroup = L.layerGroup([], { pane: "asap" }).addTo(map);
  _isiKartuAsap('<p class="asap-muat">Menghitung arah asap…</p>');
  gambarAsap();
}
function tutupAsap() {
  asapTitik = null;
  asapToken++;
  if (asapGroup) asapGroup.clearLayers();
  $("asap-card")?.classList.remove("show");
}
// Slider bisa digeser cepat, jadi hitung ulangnya ditunda sampai geserannya reda.
function jadwalAsap() { clearTimeout(asapTimer); asapTimer = setTimeout(gambarAsap, 180); }

async function gambarAsap() {
  if (!asapTitik) return;
  const token = ++asapToken;
  const { lat, lon } = asapTitik;
  let pu, pv;
  try {
    [pu, pv] = await Promise.all([loadSeries("angin_u"), loadSeries("angin_v")]);
  } catch (e) {
    console.warn("deret angin tak ada", e);
    if (token === asapToken) _isiKartuAsap('<p class="asap-muat">Data angin untuk arah asap belum tersedia di kiriman ini.</p>');
    return;
  }
  if (token !== asapToken) return;
  const T = pu.meta._T || (pu.meta._T = pu.meta.times.map((x) => Date.parse(x)));
  const vt = frames[current] && frames[current].valid_time;
  let t0 = vt ? Date.parse(vt) : T[0];
  t0 = Math.max(T[0], Math.min(t0, T[T.length - 1]));

  // Kipas, garis tengah dulu lalu delapan pinggir.
  const semua = [_lintasan(pu, pv, T, lat, lon, t0)];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    semua.push(_lintasan(pu, pv, T, lat + ASAP_KIPAS_DEG * Math.sin(a),
                         lon + ASAP_KIPAS_DEG * Math.cos(a) / Math.cos(lat * Math.PI / 180), t0));
  }
  const tengah = semua[0];

  asapGroup.clearLayers();
  for (const j of semua.slice(1)) {
    if (j.length > 1) L.polyline(j.map((p) => [p[0], p[1]]), { pane: "asap", color: "#ffffff",
      weight: 1.2, opacity: 0.45, interactive: false }).addTo(asapGroup);
  }
  if (tengah.length > 1) {
    const ll = tengah.map((p) => [p[0], p[1]]);
    L.polyline(ll, { pane: "asap", color: "#10131c", weight: 6, opacity: 0.45, interactive: false }).addTo(asapGroup);
    L.polyline(ll, { pane: "asap", color: "#ffffff", weight: 3, opacity: 0.95, interactive: false }).addTo(asapGroup);
    // Penanda jam. Kalau angin melemah, beberapa penanda jatuh berdekatan dan
    // tulisannya bertumpuk. Yang terlalu dekat dengan penanda sebelumnya dilewati.
    const tiap = (ASAP_PENANDA_JAM * 60) / ASAP_DT_MNT;
    let akhir = [lat, lon];
    for (let k = tiap; k < tengah.length; k += tiap) {
      if (_jarakKm(akhir[0], akhir[1], tengah[k][0], tengah[k][1]) < 30) continue;
      akhir = [tengah[k][0], tengah[k][1]];
      const jam = Math.round((k * ASAP_DT_MNT) / 60);
      L.marker([tengah[k][0], tengah[k][1]], { pane: "asap", interactive: false,
        icon: L.divIcon({ className: "asap-jam", html: `<span>+${jam} j</span>`, iconSize: [0, 0] }) }).addTo(asapGroup);
    }
  }
  L.circleMarker([lat, lon], { pane: "asap", radius: 7, weight: 2, color: "#ffffff",
    fill: false, interactive: false }).addTo(asapGroup);
  // Baru dibuka, peta didekatkan ke seluruh kipas. Waktu slider digeser tidak,
  // supaya bingkai yang sedang dibaca orang tidak melompat lompat.
  if (asapPasBingkai) {
    asapPasBingkai = false;
    const titik = semua.flat().map((p) => [p[0], p[1]]);
    if (titik.length > 1) {
      const hp = window.matchMedia("(max-width: 640px)").matches;
      map.fitBounds(L.latLngBounds(titik).pad(0.15), {
        // Di HP kartu Arah Asap menutup sepertiga atas layar, jadi lintasan
        // dibingkai di bawahnya. Di layar lebar kartu dan kolom kanan di kanan.
        paddingTopLeft: hp ? [90, 330] : [260, 90],
        paddingBottomRight: hp ? [20, 200] : [560, 150],
        maxZoom: 7, animate: true });
    }
  }

  // ---- Kartu, bahasa awam ----
  const kota = await loadPlaces().catch(() => []);
  if (token !== asapToken) return;
  let dekat = null, dekatKm = Infinity;
  for (const c of kota) {
    const d = _jarakKm(lat, lon, c.lat, c.lon);
    if (d < dekatKm) { dekatKm = d; dekat = c; }
  }
  const namaDekat = dekat ? dekat.n.replace(/^(Kabupaten|Kota) /, "") : "";

  if (tengah.length < 5) {
    _isiKartuAsap(`<p>Untuk jam ini arah asap dari titik api dekat <b>${namaDekat}</b> tidak bisa dihitung. ` +
      `Datanya belum atau sudah tidak mencakup jam tersebut.</p>`);
    return;
  }
  const i24 = Math.min(tengah.length - 1, (24 * 60) / ASAP_DT_MNT);
  const jamNyata = Math.round(((tengah[i24][2] - t0) / 3600e3));
  const km = Math.round(_jarakKm(lat, lon, tengah[i24][0], tengah[i24][1]) / 10) * 10;
  const arah = _arahKe(lat, lon, tengah[i24][0], tengah[i24][1]);
  // Lebar kipas di jam yang sama, jarak terjauh ujung pinggir ke ujung tengah.
  let lebar = 0;
  for (const j of semua.slice(1)) {
    const p = j[Math.min(j.length - 1, i24)];
    lebar = Math.max(lebar, _jarakKm(p[0], p[1], tengah[i24][0], tengah[i24][1]));
  }
  const yakin = lebar < 60 ? "Kipasnya sempit, jadi arahnya cukup yakin."
    : lebar < 150 ? "Kipasnya agak melebar, arahnya bisa bergeser."
    : "Kipasnya melebar, arahnya kurang pasti.";
  const ringkas = km < 20
    ? `Asap dari titik api dekat <b>${namaDekat}</b> diperkirakan <b>tertahan di sekitar sumbernya</b>, anginnya lemah. ${yakin}`
    : `Asap dari titik api dekat <b>${namaDekat}</b> diperkirakan bergerak ke <b>${arah}</b>, ` +
      `sekitar <b>${km} km</b> dalam ${jamNyata} jam. ${yakin}`;

  // Kota yang dilewati garis tengah, satu kali per kota, urut waktu.
  const lewat = [];
  for (const c of kota) {
    let best = Infinity, bi = -1;
    for (let k = 0; k < tengah.length; k += 2) {
      const d = _jarakKm(tengah[k][0], tengah[k][1], c.lat, c.lon);
      if (d < best) { best = d; bi = k; }
    }
    // Wilayah tempat api itu sendiri sudah disebut di kalimat pertama, jadi tak diulang.
    if (c === dekat) continue;
    if (best <= ASAP_KOTA_KM && tengah[bi][2] - t0 >= 3600e3) lewat.push({ c, t: tengah[bi][2] });
  }
  lewat.sort((a, b) => a.t - b.t);
  let pdIspu = null;
  try { pdIspu = await loadSeries("ispu"); } catch (e) { /* ISPU opsional di kartu */ }
  if (token !== asapToken) return;
  const baris = lewat.slice(0, 6).map(({ c, t }) => {
    const jam = Math.round((t - t0) / 3600e3);
    const kapan = new Date(t).toLocaleString("id-ID", { timeZone: "Asia/Jakarta",
      weekday: "short", hour: "2-digit", minute: "2-digit" }).replace(".", ":");
    let ispu = "";
    if (pdIspu) {
      const i = nearestIndex(pdIspu.meta.times, new Date(t).toISOString());
      const v = Math.round(sampleSeries(pdIspu, c.lat, c.lon)[i]);
      if (isFinite(v)) {
        const [, nama, warna] = ispuKategori(v);
        ispu = `<span class="asap-ispu"><i style="background:${warna}"></i>ISPU ${v} ${nama}</span>`;
      }
    }
    return `<div class="asap-kota"><span class="asap-kota-n">${c.n.replace(/^(Kabupaten|Kota) /, "")}</span>` +
      `<span class="asap-kota-t">+${jam} jam · ${kapan} WIB</span>${ispu}</div>`;
  }).join("");
  const daftar = baris
    ? `<div class="asap-sub">Wilayah yang dilewati</div>${baris}`
    : `<div class="asap-sub">Tidak ada pusat kota atau kabupaten lain yang dilewati dalam ${ASAP_JAM} jam.</div>`;
  _isiKartuAsap(`<p class="asap-ringkas">${ringkas}</p>${daftar}` +
    `<p class="asap-catatan">Perkiraan dari angin permukaan model CAMS, mulai jam yang tampil di slider. ` +
    `Asap dari api yang sangat besar bisa naik lebih tinggi dan bergerak berbeda. Bukan peringatan resmi.</p>`);
}

// ================= ZONA ITCZ (indikasi model GFS) =================
// Sabuk pertemuan angin pasat dua belahan bumi → banyak awan & hujan. Digambar
// sebagai PITA zona (konvergensi kuat) + GARIS sumbu. Hanya untuk jam prakiraan
// run aktif (0..72 jam); waktu lampau tak punya data (konsisten dgn siklon).
const ITCZ_COLOR = "#ff2ea6";   // magenta terang — kontras di semua warna heatmap
async function loadItcz() {
  if (itcz) return itcz;
  if (!itczLoading) itczLoading = fetch(DATA_BASE + "itcz.json")
    .then((r) => (r.ok ? r.json() : { times: [], frames: [] }))
    .then((j) => (itcz = j))
    .catch(() => (itcz = { times: [], frames: [] }));
  return itczLoading;
}
function refreshItcz() {
  if (!itczGroup) return;
  itczGroup.clearLayers();
  if (!itczOn || !itcz || !itcz.times || !frames[current]) return;
  const ti = itcz.times.indexOf(frames[current].valid_time);
  if (ti < 0) return;                         // waktu lampau → tak ada garis
  for (const sg of itcz.frames[ti] || []) {
    if (sg.length < 2) continue;
    // Pita zona: tepi utara (maju) + tepi selatan (mundur) → poligon terisi.
    const ring = [];
    for (const p of sg) ring.push([p[2], p[0]]);                // [latN, lon]
    for (let i = sg.length - 1; i >= 0; i--) ring.push([sg[i][3], sg[i][0]]); // [latS, lon]
    L.polygon(ring, { pane: "itcz", color: ITCZ_COLOR, weight: 1, opacity: 0.35,
      fillColor: ITCZ_COLOR, fillOpacity: 0.2, interactive: false }).addTo(itczGroup);
    // Garis sumbu: casing putih (kontras di latar gelap/terang) + garis teal putus.
    const axis = sg.map((p) => [p[1], p[0]]);
    L.polyline(axis, { pane: "itcz", color: "#ffffff", weight: 6, opacity: 0.35,
      interactive: false, lineCap: "round", lineJoin: "round" }).addTo(itczGroup);
    L.polyline(axis, { pane: "itcz", color: ITCZ_COLOR, weight: 3, opacity: 0.95,
      dashArray: "7 5", interactive: false, lineCap: "round", lineJoin: "round" }).addTo(itczGroup);
  }
}
function toggleItcz() {
  itczOn = !itczOn;
  $("itcz-toggle") && $("itcz-toggle").classList.toggle("active", itczOn);
  const note = $("itcz-note");
  if (itczOn) {
    if (!itczGroup) itczGroup = L.layerGroup([], { pane: "itcz" });
    itczGroup.addTo(map);
    if (note) note.classList.add("show");
    loadItcz().then(() => { if (itczOn) refreshItcz(); });
  } else {
    if (itczGroup) { itczGroup.clearLayers(); map.removeLayer(itczGroup); }
    if (note) note.classList.remove("show", "open");
  }
  updateHash();
}

// ================= ISOBAR (garis tekanan) =================
// Otomatis muncul HANYA di layer Tekanan (tanpa tombol): garis kontur PRMSL
// tiap 4 hPa + penanda pusat tekanan Tinggi (H) / Rendah (L). Melengkapi heatmap
// jadi peta tekanan gaya klasik. Hanya jam prakiraan run aktif (0..72 jam).
// Warna isobar MENGIKUTI palet tekanan (dari legenda) pada nilai hPa garis itu,
// lalu digelapkan ("lebih tua") agar kontras; dipadu halo putih supaya terbaca
// di zona terang (~1013) maupun gelap (biru/oranye).
// Kertas Emisi tak punya layer tekanan, jadi legendanya memang tak ada. Kode isobar
// warisan Kertas Cuaca tetap ada tapi TIDAK boleh mematikan seluruh aplikasi saat dimuat.
const _PRESS_STOPS = ((LEGENDS.pressure_surface || {}).cells || []).map(([lab, hex]) => [parseFloat(lab), hex]);
const _hex2rgb = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const _rgb2hex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
function _rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function _hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g] = [c, x]; else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x]; else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c]; else [r, b] = [c, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
// Warna isobar: ambil HUE dari palet tekanan pd nilai hPa garis, tapi paksa
// saturasi cukup & kecerahan medium (0.40) → jelas berwarna spt palet, "lebih
// tua" tanpa jadi hitam; zona pucat (~1013) pun tampil sbg warna, bukan abu.
function isobarColor(hPa) {
  const s = _PRESS_STOPS;
  let a = s[0], b = s[s.length - 1];
  if (hPa <= s[0][0]) b = a = s[0];
  else if (hPa >= s[s.length - 1][0]) a = b = s[s.length - 1];
  else for (let i = 0; i < s.length - 1; i++) if (hPa >= s[i][0] && hPa <= s[i + 1][0]) { a = s[i]; b = s[i + 1]; break; }
  const t = b[0] === a[0] ? 0 : (hPa - a[0]) / (b[0] - a[0]);
  const ca = _hex2rgb(a[1]), cb = _hex2rgb(b[1]);
  const rgb = [0, 1, 2].map((k) => ca[k] + (cb[k] - ca[k]) * t);
  const [h, sat] = _rgb2hsl(rgb[0], rgb[1], rgb[2]);
  const [r, g, bl] = _hsl2rgb(h, Math.min(0.9, Math.max(0.55, sat * 1.25)), 0.4);
  return _rgb2hex(r, g, bl);
}
async function loadIsobars() {
  if (isobars) return isobars;
  if (!isobarsLoading) isobarsLoading = fetch(DATA_BASE + "isobars.json")
    .then((r) => (r.ok ? r.json() : { times: [], frames: [] }))
    .then((j) => (isobars = j))
    .catch(() => (isobars = { times: [], frames: [] }));
  return isobarsLoading;
}
function refreshIsobars() {
  if (!isobarGroup) return;
  isobarGroup.clearLayers();
  if (activeLayer !== "pressure_surface" || !isobars || !isobars.times || !frames[current]) return;
  const ti = isobars.times.indexOf(frames[current].valid_time);
  if (ti < 0) return;                         // waktu lampau → tak ada isobar
  const fr = isobars.frames[ti];
  if (!fr) return;
  for (const [lv, pts] of fr.iso) {
    const latlng = pts.map((p) => [p[1], p[0]]);
    const bold = lv % 20 === 0;               // pertegas tiap 20 hPa (gaya peta cuaca)
    // Inti = warna palet tekanan (digelapkan) pada nilai hPa garis + HALO PUTIH.
    // Border admin diredupkan (abu) supaya isobar jadi garis dominan.
    L.polyline(latlng, { pane: "isobar", color: "#ffffff", weight: bold ? 4 : 3,
      opacity: 0.6, interactive: false, lineJoin: "round" }).addTo(isobarGroup);
    L.polyline(latlng, { pane: "isobar", color: isobarColor(lv), weight: bold ? 2.2 : 1.4,
      opacity: 0.97, interactive: false, lineJoin: "round" }).addTo(isobarGroup);
  }
  for (const [t, v, lat, lon] of fr.hl) {
    const high = t === 1;
    isobarGroup.addLayer(L.marker([lat, lon], {
      pane: "isobar", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "hl-wrap", iconSize: [44, 44], iconAnchor: [22, 22],
        html: `<span class="hl-mark ${high ? "hl-h" : "hl-l"}">${high ? "H" : "L"}<b>${v}</b></span>` }),
    }));
  }
}
// Tampilkan/lepas isobar sesuai layer aktif (dipanggil saat ganti layer).
function syncIsobars() {
  if (activeLayer === "pressure_surface") {
    if (!isobarGroup) isobarGroup = L.layerGroup([], { pane: "isobar" });
    if (!map.hasLayer(isobarGroup)) isobarGroup.addTo(map);
    loadIsobars().then(() => { if (activeLayer === "pressure_surface") refreshIsobars(); });
  } else if (isobarGroup) {
    isobarGroup.clearLayers();
    if (map.hasLayer(isobarGroup)) map.removeLayer(isobarGroup);
  }
}

// ================= MONSUN (indikasi model GFS) =================
// Status monsun (badge) + ARUS AMBER beranimasi = angin rata-rata musiman lewat
// leaflet-velocity (warna amber, partikel lebih tebal & jarang → beda dari angin
// putih sesaat). Medan rata-rata bersifat statik (tak ikut slider).
async function loadMonsoon() {
  if (monsoon) return monsoon;
  if (!monsoonLoading) monsoonLoading = fetch(DATA_BASE + "monsoon.json")
    .then((r) => (r.ok ? r.json() : { phase: null }))
    .then((j) => (monsoon = j))
    .catch(() => (monsoon = { phase: null }));
  return monsoonLoading;
}
// Warna arus & banner mengikuti MONSUN DOMINAN (dari data): Australia=amber,
// Asia=biru, Peralihan=hijau. Gradasi satu rona → partikel jelas berwarna.
const MON_AMBER = ["#ffe0a3", "#ffc760", "#ffb020", "#f59e0b", "#e07b00"];
const MON_BLUE = ["#a9c6f5", "#6f9ae6", "#3f6fce", "#2650a8", "#173b7d"];
const MON_GREEN = ["#c3e8ae", "#8fd06b", "#5cb63f", "#3f9330", "#2c6f24"];
function monColors(code) {
  if (code === "ASIA") return { scale: MON_BLUE, banner: "#1e3f8f" };
  if (code === "TRANS") return { scale: MON_GREEN, banner: "#1a7a4f" };
  return { scale: MON_AMBER, banner: "#b26a00" };        // AUS (default)
}
async function loadMonsoonVel() {
  if (monsoonVelData) return monsoonVelData;
  if (!monsoonVelLoading) monsoonVelLoading = fetch(DATA_BASE + "monsoon_velocity.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (monsoonVelData = j))
    .catch(() => (monsoonVelData = null));
  return monsoonVelLoading;
}
async function loadBorneoVel() {
  if (borneoVelData) return borneoVelData;
  if (!borneoVelLoading) borneoVelLoading = fetch(DATA_BASE + "monsoon_velocity_bv.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (borneoVelData = j))
    .catch(() => (borneoVelData = null));
  return borneoVelLoading;
}
// Borneo Vortex: swirl partikel TEAL (medan angin kotak Kalimantan → berpilin sendiri)
// + ikon pusaran di pusat. HANYA saat vorteks terdeteksi (musim DJF).
function showBorneoVortex(vx) {
  if (!vx || !vx.active) return;
  loadBorneoVel().then((bv) => {
    if (!monsoonOn || !bv) return;
    if (!borneoVel) borneoVel = L.velocityLayer({
      displayValues: false, data: bv,
      minVelocity: 0, maxVelocity: 12, velocityScale: 0.025,
      particleAge: 110, particleMultiplier: 1 / 300, lineWidth: 2.2,
      colorScale: ["#7fe6df", "#2fd0c6", "#0fb5ae", "#0a8f89", "#076d68"], frameRate: 24,
    });
    if (!map.hasLayer(borneoVel)) borneoVel.addTo(map);
    if (!borneoMarker && vx.lat != null) borneoMarker = L.marker([vx.lat, vx.lon], {
      interactive: false, keyboard: false, title: "Borneo Vortex",
      icon: L.divIcon({ className: "bv-mark", iconSize: [40, 40], iconAnchor: [20, 20],
        html: `<span class="cyc-spin" style="color:#0fb5ae;font-size:34px"><span class="material-symbols-outlined" style="font-size:34px">cyclone</span></span>` }),
    });
    if (borneoMarker && !map.hasLayer(borneoMarker)) borneoMarker.addTo(map);
  });
}
function hideBorneoVortex() {
  if (borneoVel && map.hasLayer(borneoVel)) map.removeLayer(borneoVel);
  if (borneoMarker && map.hasLayer(borneoMarker)) map.removeLayer(borneoMarker);
}
// Panel FENOMENA: daftar semua fenomena + status. Dot HIJAU NEON = sedang terjadi,
// MERAH = belum; baris tak-aktif diredupkan (kelas ph-off).
function fillPhenomPanel() {
  const el = $("phenom-panel");
  if (!el || !monsoon) return;
  const p = monsoon.phase || {};
  const s = monsoon.surge || {};
  const vx = monsoon.vortex || {};
  const konst = p.steadiness != null ? Math.round(p.steadiness * 100) + "%" : "-";
  // Dot AKTIF ikut warna arus/velocity fenomena; BELUM terjadi = merah menyala.
  const MON_DOT = { AUS: "#ffb020", ASIA: "#3f6fce", TRANS: "#5cb63f" };
  const SURGE_DOT = "#3f6fce", BV_DOT = "#0fb5ae", OFF = "#ff2d2d";
  const row = (active, color, name, status) => {
    const c = active ? color : OFF;
    return `<div class="ph-row ${active ? "" : "ph-off"}">` +
      `<span class="ph-dot" style="background:${c};box-shadow:0 0 6px 1px ${c}"></span>` +
      `<div class="ph-txt"><b>${name}</b><span>${status}</span></div></div>`;
  };
  el.innerHTML = `<div class="ph-head">FENOMENA</div>` +
    row(true, MON_DOT[p.code] || "#ffb020", "Monsun", `${p.label || "-"}${p.season ? " · " + p.season : ""}. Angin dari ${p.wind_from || "-"}, konsistensi ${konst}.`) +
    row(!!s.active, SURGE_DOT, "<i>Cold Surge</i>", s.active ? `${s.level}, angin utara ${s.north_kt || 0} kt. ${s.note}` : "Belum terjadi (fenomena musim hujan / DJF).") +
    row(!!vx.active, BV_DOT, "<i>Borneo Vortex</i>", vx.active ? `Vortisitas ${vx.vort}. ${vx.note}` : "Belum terjadi (fenomena musim hujan / DJF).");
}
function toggleMonsoon() {
  monsoonOn = !monsoonOn;
  $("mon-toggle") && $("mon-toggle").classList.toggle("active", monsoonOn);
  const panel = $("phenom-panel");
  if (monsoonOn) {
    Promise.all([loadMonsoon(), loadMonsoonVel()]).then(([mon, data]) => {
      if (!monsoonOn) return;
      fillPhenomPanel();
      if (panel) panel.classList.add("show");
      showBorneoVortex(mon && mon.vortex);
      if (data) {
        const code = mon && mon.phase ? mon.phase.code : "AUS";
        if (!monsoonVel) {
          monsoonVel = L.velocityLayer({
            displayValues: false, data,
            minVelocity: 0, maxVelocity: 14, velocityScale: 0.02,
            particleAge: 120, particleMultiplier: 1 / 500, lineWidth: 2.4,
            colorScale: monColors(code).scale, frameRate: 22,
          });
          monsoonVel.addTo(map);
        } else if (!map.hasLayer(monsoonVel)) {
          monsoonVel.addTo(map);
        }
      }
    });
  } else {
    if (monsoonVel && map.hasLayer(monsoonVel)) map.removeLayer(monsoonVel);
    hideBorneoVortex();
    if (panel) panel.classList.remove("show");
  }
  updateHash();
}

// ---- Skeleton loading ---------------------------------------------------
// Pemberitahuan mode cangkang. Dipakai sekali saat data belum tersambung.
function shellNotice() {
  hideSkeleton();
  const el = $("cyc-note");
  if (el) {
    el.classList.add("show");
    const t = el.querySelector(".cyc-note-txt");
    if (t) t.textContent = "Kerangka siap, data CAMS belum tersambung";
    const d = el.querySelector(".cyc-detail");
    if (d) d.innerHTML = '<div class="itcz-lead">Peta, basemap, batas wilayah, dan seluruh panel sudah jalan. ' +
      'Tombol parameter polutan sengaja dimatikan sampai pipeline CAMS dibuat.</div>';
  }
  const play = $("play-btn"); if (play) play.disabled = true;
  const vt = $("valid-time"); if (vt) vt.textContent = "Tanpa data";
  const head = $("legend-head"); if (head) head.textContent = "BELUM ADA DATA";
  const fresh = $("data-fresh"); if (fresh) fresh.style.display = "none";   // badge "Last update" tak punya arti
  const cells = $("legend-cells"); if (cells) cells.innerHTML = "";
}

function hideSkeleton() {
  const s = $("skeleton");
  if (!s || s.classList.contains("hide")) return;
  s.classList.add("hide");                 // fade-out (transition CSS)
  setTimeout(() => s.remove(), 480);
}
// Tampilkan pesan (error/diagnosa) di kotak #loading & lepas skeleton.
function showLoadMsg(msg, asHtml) {
  const el = $("loading");
  if (el) { el[asHtml ? "innerHTML" : "textContent"] = msg; el.style.display = "block"; }
  hideSkeleton();
}
// Tunggu frame heatmap PERTAMA benar-benar tergambar sebelum skeleton dilepas,
// biar reveal-nya mulus (bukan peta kosong sekejap). Ada fallback timeout.
function whenHeatmapReady() {
  return new Promise((resolve) => {
    const img = speedLayer && speedLayer.getElement();
    if (!img || img.complete) return resolve();
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    img.addEventListener("load", fin, { once: true });
    img.addEventListener("error", fin, { once: true });
    setTimeout(fin, 1600);
  });
}

// ---- Init --------------------------------------------------------------
// MODE CANGKANG. Kertas Emisi belum tersambung data CAMS, tapi peta, basemap,
// batas wilayah, bingkai, dan seluruh kerangka UI tetap harus bisa ditinjau.
// Tanpa ini, catalog.json yang tak ada bikin init() gagal dan layar cuma pesan error.
// Domainnya SAMA PERSIS dengan Kertas Cuaca supaya bingkainya identik.
let dataMissing = false;
const SHELL_CATALOG = { region: { bounds: [62.0, -33.0, 180.0, 33.0] }, layers: {} };

async function init() {
  // Diagnosa dini penyebab umum gagal-muat
  if (location.protocol === "file:") {
    showLoadMsg(
      "⚠️ Halaman dibuka via <b>file://</b> — browser memblokir pemuatan data.<br><br>" +
      "Buka lewat alamat server:<br><b>http://127.0.0.1:8000/frontend/index.html</b>", true);
    return;
  }
  if (typeof L === "undefined" || typeof L.velocityLayer !== "function") {
    showLoadMsg("⚠️ Library peta gagal dimuat (cek koneksi internet ke unpkg.com / CDN diblokir).");
    return;
  }
  try {
    let cat = null;
    try {
      const catRes = await fetch(DATA_BASE + "catalog.json");
      if (catRes.ok) cat = await catRes.json();
    } catch (e) { /* jaringan/berkas tak ada -> jatuh ke cangkang di bawah */ }
    const avail = Object.keys((cat && cat.layers) || {});
    if (!avail.length) { cat = SHELL_CATALOG; dataMissing = true; }
    catalog = cat;
    activeLayer = dataMissing ? null : (cat.layers["ispu"] ? "ispu" : (cat.layers["pm25"] ? "pm25" : avail[0]));
    frames = dataMissing ? [] : cat.layers[activeLayer].frames;

    // Domain data penuh (untuk imageOverlay heatmap).
    const [dw, ds, de, dn] = cat.region.bounds;
    dataBounds = L.latLngBounds([ds, dw], [dn, de]);
    // Kotak untuk MENEMPATKAN gambar beda dengan kotak data. `bounds` itu
    // pusat-ke-pusat sel, sedangkan pratinjau berisi blok-blok sel penuh, jadi
    // penempatannya harus pakai TEPI sel. Backend lama tak mengirimnya, jadi
    // mundur ke `bounds` supaya katalog lama tetap terbaca.
    const ib = cat.region.image_bounds;
    imageBounds = ib ? L.latLngBounds([ib[1], ib[0]], [ib[3], ib[2]]) : dataBounds;

    // Wire tombol layer: klik memilih varian sesuai LEVEL aktif (permukaan/strato).
    // Tombol tanpa data (atau diredupkan oleh level) diabaikan saat diklik.
    document.querySelectorAll(".layer-btn[data-layer]").forEach((btn) => {
      const key = btn.dataset.layer;
      if (cat.layers[key]) {
        btn.classList.remove("disabled");
        // Pilih variabel TIDAK menutup dropdown; hanya tombol panah "Parameter" yg menutup.
        btn.addEventListener("click", async () => {
          if (btn.classList.contains("disabled")) return;   // diredupkan (mis. di strato)
          if (playing) togglePlay();
          activeBase = key;
          setActiveLayer(resolveLayer(key));
        });
      } else {
        btn.classList.add("disabled");
      }
      btn.classList.toggle("active", key === activeLayer);
    });
    renderLegend(activeLayer);

    // Medan angin per-waktu — partikel dipakai di SEMUA layer (termasuk hujan).
    // Kertas Emisi tak punya layer angin sendiri. Velocity ditempelkan ke tiap frame
    // polutan, jadi partikelnya ikut di SEMUA parameter tanpa perlu tombol angin.
    Object.values(cat.layers || {}).forEach((L) =>
      (L.frames || []).forEach((f) => { if (f.velocity_json) windVelByTime[f.valid_time] = f.velocity_json; }));

    setupLevelSelect();   // hidupkan dropdown LEVEL kalau data strato ada

    // Bingkai tampilan = kotak inti (VIEW_CORE) yang diperlebar pada sumbu yang
    // perlu hingga RASIONYA sama dengan jendela desktop. Efeknya: seluruh wilayah
    // inti (India–Pasifik Barat, Cina Selatan–tengah Australia) mengisi layar
    // penuh, tanpa bar kosong dan tanpa terpotong; tepi domain data (yang lebih
    // luas) tak pernah terlihat. Dihitung ulang tiap kali jendela di-resize.
    function frameRegion() {
      const crs = map.options.crs;
      const sw = crs.project(VIEW_CORE.getSouthWest());
      const ne = crs.project(VIEW_CORE.getNorthEast());
      const cx = (sw.x + ne.x) / 2, cy = (sw.y + ne.y) / 2; // pusat (proyeksi Mercator)
      let halfW = Math.abs(ne.x - sw.x) / 2;
      let halfH = Math.abs(ne.y - sw.y) / 2;
      const size = map.getSize();
      const screenRatio = size.x / size.y;
      // Setengah-ukuran domain data GRIB. Bingkai tak boleh melewati ini di sumbu
      // mana pun, kalau lewat yang kelihatan cuma latar kosong di tepi.
      const dsw = crs.project(dataBounds.getSouthWest());
      const dne = crs.project(dataBounds.getNorthEast());
      const dataHalfW = Math.abs(dne.x - dsw.x) / 2;
      const dataHalfH = Math.abs(dne.y - dsw.y) / 2;
      if (screenRatio > halfW / halfH) {
        // Layar lebih lebar (mis. jendela browser yang tingginya termakan bilah
        // alamat) → perlebar bujur. TAPI jangan keluar domain data (lon 62-180E),
        // nanti tepi KIRI/KANAN kosong. Bila melebihi, KUNCI bujur ke domain data
        // & POTONG lintang: layar terisi penuh, zoom sedikit lebih dekat.
        halfW = halfH * screenRatio;
        if (halfW > dataHalfW) { halfW = dataHalfW; halfH = halfW / screenRatio; }
      } else {
        // Layar lebih tinggi (mis. HP potret) → kebalikannya. Pertinggi lintang,
        // tapi jangan keluar domain data (lat ±33), nanti tepi ATAS/BAWAH kosong.
        // Bila melebihi, KUNCI lintang & POTONG bujur: tampil strip vertikal.
        halfH = halfW / screenRatio;
        if (halfH > dataHalfH) { halfH = dataHalfH; halfW = halfH * screenRatio; }
      }
      const box = L.latLngBounds(
        crs.unproject(L.point(cx - halfW, cy - halfH)),
        crs.unproject(L.point(cx + halfW, cy + halfH))
      );
      // Kunci HANYA zoom-out pada tampilan awal (bingkai inti mengisi layar);
      // zoom-in dan geser tetap bebas di dalam domain data.
      const z = map.getBoundsZoom(box);      // zoom saat bingkai inti mengisi layar
      map.setMinZoom(z);                     // tak bisa zoom-out lebih jauh dari ini
      map.setMaxBounds(dataBounds);          // pan dibatasi domain data, bukan bingkai
      map.setView(crs.unproject(L.point(cx, cy)), z, { animate: false });
    }
    frameRegion();
    map.on("resize", frameRegion);
    loadAdmin(); // batas negara + provinsi Indonesia (non-blocking)
    initCityLabels(); // nama kota + nilai parameter aktif (non-blocking)
    geoGroup = L.layerGroup([], { pane: "labels" }).addTo(map);
    refreshGeoLabels();   // nama negara & laut (pengganti label CARTO)

    // Wiring UI dibuat tahan-null: elemen dekoratif yang hilang (mis. cache
    // index.html lama) tak boleh menggagalkan pemuatan peta & data.
    const slider = $("time-slider");
    if (slider) {
      slider.disabled = dataMissing;
      slider.max = String(Math.max(0, frames.length - 1));
      slider.addEventListener("input", (ev) => {
        isiSlider(slider);
        if (playing) togglePlay();
        showFrame(parseInt(ev.target.value, 10));
      });
    }
    $("panel-toggle")?.addEventListener("click", togglePanels);
    $("play-btn")?.addEventListener("click", togglePlay);
    buildTicks(); // label tanggal/jam WIB di bawah slider

    // Tombol zoom neubrutalist → kontrol peta
    $("zoom-in")?.addEventListener("click", () => map.zoomIn());
    $("zoom-out")?.addEventListener("click", () => map.zoomOut());

    // Panah geser variabel (HP): gulir strip layer + auto-redup panah di ujung.
    const layersEl = document.querySelector(".layers");
    const layerStep = () => Math.max(120, (layersEl ? layersEl.clientWidth : 200) * 0.7);
    function updateLayerNav() {
      if (!layersEl) return;
      const atStart = layersEl.scrollLeft <= 1;
      const atEnd = layersEl.scrollLeft + layersEl.clientWidth >= layersEl.scrollWidth - 1;
      $("layer-prev")?.classList.toggle("nav-hidden", atStart);
      $("layer-next")?.classList.toggle("nav-hidden", atEnd);
    }
    $("layer-prev")?.addEventListener("click", () => layersEl?.scrollBy({ left: -layerStep(), behavior: "smooth" }));
    $("layer-next")?.addEventListener("click", () => layersEl?.scrollBy({ left: layerStep(), behavior: "smooth" }));
    layersEl?.addEventListener("scroll", updateLayerNav);
    window.addEventListener("resize", updateLayerNav);
    updateLayerNav();

    // HP: dropdown "Parameter" (variabel) & dropdown kontrol kanan (buka/tutup)
    $("param-toggle")?.addEventListener("click", () =>
      document.querySelector(".layer-bar")?.classList.toggle("param-open"));
    $("ctrl-toggle")?.addEventListener("click", () =>
      document.querySelector(".col.items-end")?.classList.toggle("ctrl-open"));

    // Toggle ikon kondisi cuaca per kota + hitung ulang declutter tiap pindah/zoom
    $("city-toggle")?.addEventListener("click", toggleCityIcons);
    $("cyclone-toggle")?.addEventListener("click", toggleCyclones);
    $("itcz-toggle")?.addEventListener("click", toggleItcz);
    $("mon-toggle")?.addEventListener("click", toggleMonsoon);
    $("api-toggle")?.addEventListener("click", toggleFire);
    map.on("moveend", () => { refreshCityIcons(); });
    map.on("zoomend", applyLabelTiles);   // ambang label CARTO vs label kota sendiri

    // "Cuaca lokasi saya" — geolokasi browser → buka detail di titik pengguna
    $("geo-btn")?.addEventListener("click", () => {
      const btn = $("geo-btn");
      if (!navigator.geolocation) { alert("Browser tidak mendukung geolokasi."); return; }
      btn.classList.add("active");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          btn.classList.remove("active");
          const { latitude, longitude } = pos.coords;
          if (dataBounds && !dataBounds.contains([latitude, longitude])) {
            alert("Lokasi kamu di luar cakupan peta (Asia–Pasifik).");
            return;
          }
          map.setView([latitude, longitude], 8, { animate: true });
          openPoint(latitude, longitude, null, true); // marker "kamu di sini"
          fillAddress(latitude, longitude); // koordinat → alamat kecamatan/kota
        },
        () => { btn.classList.remove("active"); alert("Tidak bisa mengakses lokasi. Izinkan akses lokasi di browser."); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    // Point detail: klik peta → panel titik
    map.on("click", (e) => openPoint(e.latlng.lat, e.latlng.lng));
    $("pt-close")?.addEventListener("click", closePoint);
    $("pt-export")?.addEventListener("click", exportCSV);
    $("pt-hide")?.addEventListener("click", hidePoint);
    $("pt-reopen")?.addEventListener("click", reopenPoint);
    $("share-btn")?.addEventListener("click", shareCurrent);
    $("fs-btn")?.addEventListener("click", toggleFullscreen);
    $("about-btn")?.addEventListener("click", openAbout);
    $("nav-arrow")?.addEventListener("click", () => $("nav-arrow").closest(".brand-row")?.classList.toggle("nav-open"));
    $("about-close")?.addEventListener("click", closeAbout);
    $("about-overlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeAbout(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAbout(); });
    // Badge "Last update" (HP): tap ikon "!" → buka teks; tap lagi/panah → tutup.
    $("data-fresh")?.addEventListener("click", () => $("data-fresh").classList.toggle("open"));
    // Tempat badge Last update ikut layar dan mode Kabar Kota, lihat aturTempatFresh.
    aturTempatFresh();
    window.addEventListener("resize", aturTempatFresh);
    // Dropdown legenda+threshold di banner indikasi siklon.
    $("cyc-note-toggle")?.addEventListener("click", () => $("cyc-note").classList.toggle("open"));
    $("api-note-toggle")?.addEventListener("click", () => $("api-note")?.classList.toggle("open"));
    $("asap-tutup")?.addEventListener("click", tutupAsap);
    $("gunung-note-toggle")?.addEventListener("click", () => $("gunung-note")?.classList.toggle("open"));
    $("itcz-note-toggle")?.addEventListener("click", () => $("itcz-note").classList.toggle("open"));

    // Pencarian kota/kabupaten
    // Kotak MODEL di kolom kanan. Buka tutup seperti kotak Cari, tutup waktu
    // klik di luar atau Escape.
    const mbox = $("model-box");
    $("model-btn")?.addEventListener("click", (e) => { e.stopPropagation(); mbox?.classList.toggle("open"); });
    document.addEventListener("click", (e) => {
      if (mbox?.classList.contains("open") && !e.target.closest(".model-wrap")) mbox.classList.remove("open");
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") mbox?.classList.remove("open"); });

    const sbox = $("search-box"), sin = $("search-input");
    $("search-btn")?.addEventListener("click", () => {
      if (sbox.classList.toggle("open")) { loadPlaces(); sin.focus(); }
    });
    sin?.addEventListener("input", (e) => renderSearch(e.target.value));
    sin?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") sbox.classList.remove("open");
      if (e.key === "Enter") {
        const f = $("search-results").querySelector(".search-item");
        if (f) pickPlace(parseFloat(f.dataset.lat), parseFloat(f.dataset.lon), f.textContent);
      }
    });
    $("search-results")?.addEventListener("click", (e) => {
      const it = e.target.closest(".search-item");
      if (it) pickPlace(parseFloat(it.dataset.lat), parseFloat(it.dataset.lon), it.textContent);
    });
    // Initial time (dekoratif) diisi dari run model
    const io = $("init-opt");
    if (io) io.textContent = cat.run_time;

    const runEl = $("run-info");
    if (runEl) runEl.title = "Run model: " + cat.run_time;
    current = nearestNowIndex();       // mulai di frame terdekat "sekarang"
    if (!dataMissing) {
      await showFrame(current);
      restoreFromHash();               // pulihkan layer/waktu/titik dari link dibagikan
      updateFreshness();
    } else {
      shellNotice();                   // beri tahu jelas: kerangka siap, data belum
    }
    await whenHeatmapReady();          // reveal setelah frame pertama tergambar
    hideSkeleton();
  } catch (err) {
    showLoadMsg("Gagal memuat data: " + err.message);
    console.error(err);
  }
}

init();

// PWA: daftarkan service worker (cache shell berversi; data cuaca tetap online).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW gagal:", e)));
}

// Seksi bilah bawah HP. `sel` = pemilih tombol ASLI yang diwakili.
const LB_SEKSI = [
  { judul: "Parameter", sel: ".layer-btn[data-layer]" },
  // Di HP kolom kanan diciutkan, dan tombol pembuka menunya disembunyikan
  // bilah bawah. Di Kertas Emisi akibatnya Titik Api dan Bagikan tak bisa
  // dijangkau sama sekali dari HP. Di Aether dua tombol itu diwakili di sini.
  { judul: "Fitur", sel: "#api-toggle, #share-btn" },
];
// Warisan Kertas Cuaca (siklon, ITCZ, monsun, kondisi kota) memang tak berlaku
// di peta polusi dan sudah disembunyikan CSS, jadi tak diikutkan.
// Banner titik api TIDAK dipindah ke tumpukan kiri bawah. Tumpukan itu dirancang
// untuk Kertas Cuaca, di sini dia menimpa slider waktu. Posisinya di HP diatur
// CSS, menempel kanan sejajar chip parameter.
const KET_SUMBER = [];

/* ==================================================================
   TATA LETAK HP: bilah bawah, chip parameter, tumpukan keterangan.

   Versi UMUM, dipakai bersama Kertas Cuaca, Kertas Fenomena, dan Kertas
   Emisi. Yang beda antar aplikasi cuma daftar seksi di LB_SEKSI dan daftar
   kotak keterangan di KET_SUMBER, keduanya di atas.

   Prinsip yang dipegang: bilah bawah TIDAK punya tombol sendiri. Isinya
   dibangun dari tombol yang SUDAH ADA di DOM, dan kliknya diteruskan ke
   tombol aslinya. Jadi tak ada dua tempat yang harus disamakan tiap kali
   ada parameter baru, dan status aktif/redup selalu ikut yang asli.
   Penyelarasannya pakai MutationObserver, bukan memanggil ulang dari
   belasan tempat, supaya tak ada jalur yang kelewat.
   ================================================================== */
const HP = () => window.matchMedia("(max-width: 640px)").matches;
const _q = (id) => document.getElementById(id);

function _ikonDari(btn) {
  const i = btn.querySelector(".material-symbols-outlined");
  return i ? i.textContent.trim() : "";
}
function _labelDari(btn) {
  // Urutan: .lb-txt, lalu TEKS TOMBOL ITU SENDIRI, baru data-tip.
  // data-tip sering berisi keterangan panjang ("Daya tampung PM2,5",
  // "Convective Available Potential Energy") yang tak muat di tombol selebar
  // sepertiga layar. Teks tombolnya sendiri sudah ringkas ("PM2.5", "CAPE").
  // Ikon dikeluarkan dulu, kalau tidak nama ligature Material ikut terbaca.
  const t = btn.querySelector(".lb-txt")?.textContent.trim();
  if (t) return t;
  const salin = btn.cloneNode(true);
  salin.querySelectorAll(".material-symbols-outlined").forEach((e) => e.remove());
  const teks = salin.textContent.replace(/\s+/g, " ").trim();
  if (teks) return teks;
  return btn.dataset.tip || btn.getAttribute("aria-label") || "";
}

function bangunLowbar() {
  const body = _q("lowbar-body");
  if (!body) return;
  body.innerHTML = "";
  for (const sec of LB_SEKSI) {
    const asli = [...document.querySelectorAll(sec.sel)];
    if (!asli.length) continue;
    const tiruan = asli.map((src) => {
      const b = document.createElement("button");
      b.type = "button";
      const ik = _ikonDari(src);
      b.innerHTML = (ik ? `<span class="material-symbols-outlined">${ik}</span>` : "")
                  + _labelDari(src);
      b.addEventListener("click", () => {
        if (src.classList.contains("disabled")) return;
        src.click();
        if (sec.tutup) setLowbar(false);   // seksi yang sekali pilih langsung tutup
      });
      return b;
    });
    // Status awal + ikut berubah otomatis kalau kelas tombol asli berubah.
    asli.forEach((src, i) => {
      const cermin = () => {
        tiruan[i].className = "lb-btn"
          + (src.classList.contains("active") ? " active" : "")
          + (src.classList.contains("disabled") ? " disabled" : "");
      };
      cermin();
      new MutationObserver(cermin).observe(src, { attributes: true, attributeFilter: ["class"] });
    });
    const wrap = document.createElement("div");
    wrap.className = "lb-sec";
    wrap.innerHTML = `<div class="lb-head">${sec.judul}</div><div class="lb-rule"></div>`;
    const box = document.createElement("div");
    box.className = "lb-items";
    tiruan.forEach((b) => box.appendChild(b));
    wrap.appendChild(box);
    body.appendChild(wrap);
  }
}

function setLowbar(buka) {
  const lb = _q("lowbar"), h = _q("lowbar-handle"), st = _q("stage");
  if (!lb || !h) return;
  lb.classList.toggle("open", buka);
  h.classList.toggle("open", buka);
  lb.setAttribute("aria-hidden", String(!buka));
  st && st.classList.toggle("lowbar-open", buka);
  // Peta berubah tinggi (jadi 4:3), Leaflet harus diberi tahu.
  setTimeout(() => { try { map.invalidateSize({ animate: false }); } catch (e) {} }, 300);
}

// Chip nama parameter aktif di tengah atas.
function updateParChip() {
  const el = _q("par-chip");
  if (!el) return;
  if (!HP()) { el.hidden = true; return; }
  const src = document.querySelector(".layer-btn.active");
  if (!src) { el.hidden = true; return; }
  el.hidden = false;
  const ik = _ikonDari(src);
  el.innerHTML = (ik ? `<span class="material-symbols-outlined">${ik}</span>` : "")
               + _labelDari(src);
}

// Keterangan dikumpulkan ke kiri bawah. Elemen ASLINYA yang dipindah, bukan
// disalin, supaya isinya tetap ikut diperbarui oleh kode yang sudah ada.
const _ketAsal = new Map();
function susunKeterangan() {
  const stack = _q("ket-stack"), body = _q("ket-body");
  if (!stack || !body) return;
  if (!HP()) {                       // desktop: kembalikan ke tempat semula
    for (const [id] of KET_SUMBER) {
      const el = _q(id), asal = _ketAsal.get(id);
      if (el && asal && el.parentElement === body) { el.classList.remove("di-ket"); asal.appendChild(el); }
    }
    stack.hidden = true;
    return;
  }
  let ada = 0;
  for (const [id, judul] of KET_SUMBER) {
    const el = _q(id);
    if (!el) continue;
    if (!_ketAsal.has(id)) _ketAsal.set(id, el.parentElement);
    const tampil = el.classList.contains("show") || el.classList.contains("open")
                || (el.parentElement !== body && getComputedStyle(el).display !== "none");
    if (tampil) {
      if (el.parentElement !== body) {
        el.classList.add("di-ket");
        const t = document.createElement("div");
        t.className = "ket-judul"; t.textContent = judul.toUpperCase();
        body.appendChild(t); body.appendChild(el);
      }
      ada++;
    } else if (el.parentElement === body) {
      el.classList.remove("di-ket");
      if (el.previousElementSibling?.classList.contains("ket-judul")) el.previousElementSibling.remove();
      _ketAsal.get(id)?.appendChild(el);
    }
  }
  stack.hidden = ada === 0;
}

function setupHP() {
  bangunLowbar();
  updateParChip();
  _q("lowbar-handle")?.addEventListener("click", () => setLowbar(true));
  _q("lowbar")?.addEventListener("click", (e) => {
    if (e.target === _q("lowbar") || e.target.classList.contains("lowbar-grip")) setLowbar(false);
  });
  _q("ket-toggle")?.addEventListener("click", () => _q("ket-stack").classList.toggle("ciut"));
  window.addEventListener("resize", () => { updateParChip(); susunKeterangan(); });
  // Parameter aktif & keterangan bisa berubah dari mana saja; pantau saja.
  new MutationObserver(() => { updateParChip(); susunKeterangan(); })
    .observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class", "style"] });
  susunKeterangan();
}

// Pemicu. Bilah dibangun begitu DOM siap; status aktif/redup yang berubah
// belakangan (saat katalog dimuat) sudah ditangani MutationObserver.
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", setupHP);
else setupHP();
