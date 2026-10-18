# AlgoKopi

Website dine-in AlgoKopi. Backend memakai Python 3.10+ dan SQLite bawaan; frontend tanpa proses build.

## Jalankan

```bash
ALGOKOPI_ADMIN_USER=admin ALGOKOPI_ADMIN_PASSWORD='ganti-dengan-kata-sandi-kuat' python3 server.py
```

Buka `http://localhost:8000`. Halaman masuk staf ada di `/admin/login`; setelah masuk, dashboard terbuka di `/admin/orders`. Data tersimpan di `data/algokopi.sqlite3` (ubah dengan `ALGOKOPI_DB`). Untuk uji, jalankan `python3 -m unittest discover -s tests -v`.
Server hanya mendengarkan di `127.0.0.1` secara default; atur `HOST` dan `PORT` bila perlu.

## Struktur kode

- `server.py`: API, autentikasi, dan penyajian aset statis.
- `public/core.js`: state aplikasi, akses API, keranjang, serta utilitas tampilan.
- `public/views.js`: template halaman pelanggan dan staf.
- `public/app.js`: navigasi, pemuatan data, dan penanganan interaksi.
- `public/styles.css`: gaya yang dikelompokkan menurut bagian halaman; variabel warna dan ukuran utama ada di `:root`.

Frontend memakai ES modules langsung di browser, sehingga tidak memerlukan proses build. Untuk mengubah tampilan, cari bagian halaman di `views.js`, lalu aturan terkait di `styles.css`. Jika menambah modul JavaScript baru, daftarkan rutenya di daftar `assets` dalam `server.py`.

Akun staf dengan akses antrean dan pembayaran kasir dapat ditambahkan melalui `ALGOKOPI_STAFF_USER` dan `ALGOKOPI_STAFF_PASSWORD`. Admin memakai variabel pada contoh di atas.

## Sebelum digunakan untuk transaksi nyata

Harga dan foto awal adalah **contoh demonstrasi**. Semua pesanan awal diberi `is_demo` dan laporan nyata mengecualikannya. Isi harga, informasi produk, meja, jam, akun staf, dan kebijakan operasional dari pemilik. Setelah harga diverifikasi, atur `ALGOKOPI_REAL_ORDERS=1` dan `ALGOKOPI_PRICES_CONFIRMED=1`. Untuk QRIS, atur juga `ALGOKOPI_AUTOGOPAY_KEY` di server. QRIS tidak ditampilkan sebagai pembayaran aktif tanpa kredensial. Konfigurasi callback HTTPS provider ke `/api/webhooks/autogopay`. Uji transaksi kecil dan verifikasi kontrak respons provider sebelum peluncuran. Lakukan backup database dan sajikan di balik HTTPS.

`ALGOKOPI_REAL_ORDERS=1` bersama `ALGOKOPI_PRICES_CONFIRMED=1` mengaktifkan transaksi nyata; harga contoh harus diganti sebelum menyalakannya. `ALGOKOPI_AUTOGOPAY_KEY` hanya dibaca backend. Admin awal berasal dari environment. Aplikasi tidak menyimpan kata sandi plaintext.

## Batas implementasi saat ini

Alur QRIS memakai endpoint dan verifikasi webhook dari PRD, tetapi belum diuji dengan akun merchant aktif. Foto produk masih foto contoh dari Unsplash. Dashboard sudah dapat menambah menu/meja, mengubah harga/ketersediaan, melihat audit, dan mencatat pengembalian manual. Editor visual untuk seluruh grup varian, unggah foto, QR cetak meja, pengaturan jam buka dan biaya, serta alur penyelesaian event pembayaran yang tidak cocok belum tersedia. Rekonsiliasi status QRIS berjalan saat pelanggan meminta status; belum ada worker terjadwal. Sebelum dipakai untuk uang nyata, lengkapi bagian tersebut, validasi kontrak provider dengan akun merchant, siapkan backup teruji, dan lakukan pemeriksaan keamanan deployment.
