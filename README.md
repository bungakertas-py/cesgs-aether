# CESGS Aether — Peta Kualitas Udara Indonesia

Membaca Gerak Udara. Peta kualitas udara interaktif Indonesia dari model
komposisi atmosfer CAMS Copernicus, dikembangkan CESGS Universitas Airlangga.
Saudara dari CESGS Nimbus (cuaca) dan CESGS Baruna (iklim laut).

Isinya ISPU, AQI US EPA sebagai pembanding, PM2.5, PM10, CO, NO2, SO2, O3,
kabut asap (AOD), tinggi lapisan batas (PBLH), dan titik api satelit VIIRS.
Klik titik mana saja untuk grafik per jam dan tren harian kota.

Turunan dari Kertas Emisi. Layer daya tampung, peta paparan penduduk, dan panel
peringatan dan populasi terpapar sengaja TIDAK dibawa ke versi CESGS.

## Menjalankan

- Pipeline, `cd backend/pipeline && python run.py`. Butuh `ADS_KEY` dan `FIRMS_KEY`.
- Review lokal, `python dev_server.py` lalu buka `http://127.0.0.1:8000/frontend/index.html`.
- Deploy otomatis lewat GitHub Actions tiap hari pukul 04.00 WIB.
