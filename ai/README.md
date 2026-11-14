# Cara memakai model sentimen di React Native

Model ini membaca **satu komentar teks** lalu memberi hasil `positif`, `netral`, atau `negatif`. Prediksi dilakukan langsung di perangkat, jadi tidak perlu internet saat aplikasi digunakan.

## 1. Salin dua file ke aplikasi

Salin file ini ke folder kode aplikasi React Native-mu:

- `sentiment.js` — fungsi untuk membaca komentar dan membuat prediksi.
- `model-edom.json` — data model yang dipakai untuk memprediksi.

Gunakan `model-edom.json` untuk contoh ini. File `model.json` adalah model lama dari data buatan.

## 2. Pakai fungsi prediksi

Contoh sederhana di dalam layar React Native:

```javascript
import React, {useState} from 'react';
import {View, Text, TextInput, Button} from 'react-native';

const {createSentimentClassifier} = require('./sentiment');
const model = require('./model-edom.json');
const prediksiSentimen = createSentimentClassifier(model);

export default function App() {
  const [komentar, setKomentar] = useState('');
  const [hasil, setHasil] = useState('');

  function analisisKomentar() {
    const prediksi = prediksiSentimen(komentar);

    if (prediksi.label === null) {
      setHasil('Komentar belum dapat dianalisis. Coba tulis komentar lain.');
      return;
    }

    setHasil(`Sentimen: ${prediksi.label}`);
  }

  return (
    <View style={{padding: 24, gap: 12}}>
      <Text>Masukkan komentar praktikum:</Text>
      <TextInput
        value={komentar}
        onChangeText={setKomentar}
        placeholder="Contoh: Penjelasan asisten mudah dipahami"
        multiline
        style={{borderWidth: 1, padding: 10, minHeight: 80}}
      />
      <Button title="Analisis komentar" onPress={analisisKomentar} />
      <Text>{hasil}</Text>
    </View>
  );
}
```

Kalau nama atau lokasi file berbeda, sesuaikan bagian `require(...)` dengan lokasi file di proyekmu.

## 3. Apa yang dimasukkan dan apa hasilnya?

Yang dimasukkan hanya teks komentar, misalnya:

```text
Asisten menjelaskan langkah praktikum dengan jelas.
```

Hasil prediksinya kira-kira:

```text
Sentimen: positif
```

Model membaca satu komentar setiap kali tombol ditekan. Data seperti nama, nomor mahasiswa, atau nilai tidak dibutuhkan.

## Jika komentar tidak bisa dianalisis

Model memberi `label: null` jika komentarnya kosong atau tidak menemukan kata yang dikenali. Aplikasi sebaiknya meminta pengguna menulis komentar yang lebih jelas. Jangan menganggap komentar yang tidak terbaca sebagai sentimen netral.

## Catatan tentang model ini

Model ini masih contoh awal. Data latihnya berasal dari komentar evaluasi dosen/perkuliahan, bukan kumpulan komentar praktikum. Pada validasi data tersebut, hasil kelas netral lebih lemah daripada kelas positif dan negatif. Karena itu, prediksi belum bisa dianggap sebagai penilaian yang pasti untuk komentar praktikum.

File model berukuran sekitar 273 KiB. Prediksi berjalan di dalam aplikasi dan tidak mengirim komentar ke internet. Model belum dicoba pada ponsel atau diuji di proyek React Native tertentu.

## Kalau ingin melatih model lagi

Pelatihan dilakukan di komputer, bukan di dalam aplikasi. Siapkan Python, lalu jalankan dari folder ini:

```text
python -m pip install -r requirements.txt
python train_edom.py
```

Perintah itu membuat ulang `model-edom.json` dari `edom-data.csv`. Dataset tersebut berasal dari repositori publik [EDOM sentiment](https://github.com/samfch/edom-sentiment). Salinan lisensi MIT dan keterangan sumber tersedia di `EDOM-LICENSE.txt` dan `EDOM-ATTRIBUTION.txt`.

Untuk membuat model yang lebih sesuai dengan praktikum, kumpulkan komentar praktikum yang boleh digunakan, beri label positif/netral/negatif, lalu latih dan evaluasi model dengan data tersebut.
