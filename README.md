# NinoNime

Aplikasi anime (PWA, tanpa build step) dengan tema gelap navy, aksen merah & emas:

- **Beranda**: lanjut nonton, tayang hari ini, Top 10 (carousel melingkar dengan kartu tengah bermahkota), anime musim ini
- **Jadwal**: pilih hari, garis waktu beranimasi dengan penanda **SEKARANG** (jam WIB)
- **Cari** dan **Favorit** (dipisah Ongoing / Tamat)
- **Info anime**: sampul "terbang" ke poster, sinopsis, daftar episode bergambar, tombol Simpan
- **Pemutar**: geser ke bawah → jendela melayang (mini player), ketuk/geser ke atas → penuh lagi
- **Keypass**: wajib masuk akun + keypass (sekali). Keypass tampil di halaman Akun (bintang, tampilkan, salin).
  "Belum mempunyai keypass" → WhatsApp bot dengan perintah `.keypass <email>` → bot membuat keypass otomatis.

Data anime (judul, sampul, jadwal, episode) dari [Jikan API](https://jikan.moe) (data MyAnimeList, gratis, tanpa kunci).

## Struktur

```
index.html            CSP, font, tautan CSS/JS
config.js             SUPABASE_URL, SUPABASE_ANON_KEY, WA_BOT  ← isi dulu
css/base.css          dasar tema (warna, tombol, kartu, bar bawah, dialog)
css/anime.css         semua layar anime + pemutar
css/app.css           gerbang keypass, Akun, masuk/daftar
js/main.js            router (#/home #/jadwal #/cari #/favorit #/akun #/anime/<id> #/admin), bar bawah, Akun
js/anime.js           layar anime, Jikan API, pemutar + mini player, keypass, panel admin
js/sources.js         ← sambungkan sumber video episode di sini
js/api.js             Supabase Auth + RPC (fetch biasa)
supabase/schema.sql   tabel & fungsi keypass, admin, bot WhatsApp
docs/bot-keypass.md   cara memasang perintah .keypass di bot WhatsApp
```

## Memasang

1. **Supabase**: buat proyek baru → SQL Editor → jalankan `supabase/schema.sql`.
2. **config.js**: isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (Project Settings → API, kunci *anon/publishable*), dan `WA_BOT`.
3. **Admin**: daftar akun lewat aplikasi, lalu di SQL Editor:
   ```sql
   insert into public.nn_admins (user_id) select id from auth.users where email = 'emailkamu@gmail.com';
   ```
   Menu **Akun → Admin → Keypass & bot WhatsApp** muncul: buat keypass manual atau kunci bot.
4. **Bot WhatsApp**: ikuti `docs/bot-keypass.md`.
5. **Coba di komputer**: `python3 -m http.server 8080` lalu buka `http://localhost:8080`.
6. **Terbitkan**: push ke repo GitHub → Settings → Pages → *Deploy from a branch* (`main`, folder `/`).
   Supabase → Authentication → URL Configuration: isi *Site URL* dengan alamat GitHub Pages-mu.

## Sumber video

`js/sources.js` → `episodeSource(anime, ep)` mengembalikan `{ kind: "yt", id }`, `{ kind: "mp4", url }`, `{ kind: "hls", url }`
atau `null`. Tanpa sumber, episode menampilkan "belum tersedia" dan trailer resmi YouTube tetap bisa diputar.
Tambahkan domain video ke `media-src` / `frame-src` di Content-Security-Policy `index.html`.

## Catatan

- Favorit dan riwayat tonton disimpan di HP (localStorage).
- Jam tayang dari Jikan berzona Jepang; diubah ke WIB (−2 jam).
- Jikan membatasi ±3 permintaan/detik; `js/anime.js` sudah mengantre dan menyimpan cache.

## Satu akun dengan Ninokuu

1. Pakai proyek Supabase yang sama: isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `config.js` persis seperti Ninokuu, lalu jalankan `supabase/schema.sql` di proyek itu. Email dan password yang sama langsung bisa masuk.
2. Sesi login tersimpan per alamat situs. Bila NinoNime beda domain, pengguna masuk sekali lagi (akun sama).
3. Bila NinoNime satu alamat situs dengan Ninokuu (subfolder atau subdomain yang berbagi penyimpanan), isi `SESSION_KEY: "ninokuu:session"` di `config.js`. Masuk di salah satu aplikasi berlaku di keduanya. Jangan kirim token lewat URL.

## Tayang dan bangun APK lewat GitHub (tanpa Android Studio)

1. Push proyek ke repo GitHub. Di **Settings → Pages**, pilih Source **GitHub Actions**. Workflow *Deploy PWA* menayangkan web setiap push ke `main`.
2. Untuk APK: tab **Actions → Build APK → Run workflow**. Hasilnya di **Releases → apk-terbaru → ninonime.apk** (tautan tetap, bisa dibagikan). Build berikutnya otomatis saat berkas `VERSION` diubah.
3. APK ditandatangani kunci debug: cukup untuk dipasang langsung ke HP. Play Store memerlukan kunci rilis sendiri.

## Username, lupa password, dan indikator password

- Daftar memakai **username unik** (3–20 karakter; huruf kecil, angka, titik, garis bawah; diawali huruf). Dicek langsung lewat `nn_username_free`, dipesan saat daftar (`nn_reserve_username`), dan diikat ke akun saat pertama masuk (`nn_claim_username`). Tabelnya `nn_profiles`, tidak menyentuh tabel Ninokuu.
- **Alamat & email:** NinoNime tinggal di `ninokuu.site/ninonime/` (folder sendiri, tidak menyentuh halaman Ninokuu): `/ninonime/` = halaman unduh, `/ninonime/update/` = pembaruan, `/ninonime/app/` = aplikasinya (PWA), lalu `verified/` dan `resetpassword/`. Halaman unduh dan update dikelola langsung di repo `ninokuu-site` (skrip rakit hanya menimpa `app/`, `verified/`, `resetpassword/`). Tautan email verifikasi → `ninokuu.site/ninonime/verified/`, tautan lupa password → `ninokuu.site/ninonime/resetpassword/` (`VERIFY_URL` dan `RESET_URL` di `config.js`). Tambahkan `https://ninokuu.site/ninonime/**` ke Supabase → Auth → URL Configuration → Redirect URLs. Site URL Supabase dibiarkan milik Ninokuu.
- **Menerbitkan ke situs:** workflow *Terbitkan ke ninokuu.site/ninonime* menyalin aplikasi ke repo `ninokuu-site` (butuh secret `SITE_TOKEN`), atau manual: `sh scripts/rakit-situs.sh ../ninokuu-site` lalu commit di repo situs.
