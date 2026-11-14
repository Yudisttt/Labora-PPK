# Prototipe klasifikasi alasan izin

Model ini dibuat dari contoh sintetis berbahasa Indonesia sehari-hari. Label dipertahankan sebagai `positif`, `netral`, dan `negatif`, tetapi artinya khusus untuk alasan izin:

- `positif`: teks menyebut alasan yang tampak kuat atau sulit dihindari, seperti kondisi kesehatan, ujian wajib, atau keadaan darurat.
- `netral`: teks menyebut alasan yang dapat dipahami tetapi bersifat opsional/pribadi, seperti acara keluarga atau kegiatan dengan teman.
- `negatif`: alasan tidak jelas, tidak relevan, atau tidak menjelaskan ketidakhadiran.

Label ini bukan analisis emosi, bukan verifikasi bahwa cerita benar, dan bukan keputusan menerima/menolak izin. Asisten tetap mengambil keputusan.

Model hasil latihan disimpan di `model-permission-reason.json` dan dijalankan lokal melalui `sentiment.js`. Model EDOM asli (`model-edom.json`) tidak diubah.

Latih ulang tanpa dependency Python:

```powershell
node ai/train-permission-sentiment.mjs
```

Data sintetis ada di `training-data/permission-reasons.json`. Tinjau dan lengkapi data sebelum mengandalkan prediksi. Akurasi holdout kecil dari contoh sintetis hanya pemeriksaan awal, bukan jaminan akurasi pada alasan izin nyata.
