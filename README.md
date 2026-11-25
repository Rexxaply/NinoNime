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
