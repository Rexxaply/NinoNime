# Bot WhatsApp: keypass NinoNime otomatis

Pengguna yang belum punya keypass menekan **"Belum mempunyai keypass"** di NinoNime. Aplikasi meminta **kode aktivasi** acak ke Supabase
(terikat ke akun yang sedang login), lalu membuka WhatsApp ke nomor bot dengan pesan yang sudah terisi:

```
Kode aktivasi : AK-7A24-WN6P
Email : pengguna@email.com

⚠️ Jangan hapus atau ubah pesan ini. Langsung kirim saja.
```

Bot membaca kode dan email, mengirimnya ke Supabase untuk divalidasi, lalu membalas keypass `NK-XXXX-XXXX-XXXX`
dengan perintah **salin kode** (hangus 30 menit bila belum dipakai) dan **tautan kembali ke aplikasi** yang mengisi keypass otomatis.
Di aplikasi, setelah login pengguna langsung di Beranda: kartu "Masukkan keypass" memeriksa otomatis begitu 12 karakter terisi
(salah → teks validasi; benar → NinoNime terbuka penuh).

## Aturan kode aktivasi (dicek di server)

| Aturan | Hasil |
|---|---|
| Kode harus cocok dengan email di pesan | selain itu bot membalas "Kode aktivasi tidak cocok" (email orang lain tidak bisa diminta) |
| Kode hanya bisa dipakai **1x** | pemakaian kedua ditolak; kode dikunci ke email dan nomor pengirim yang memakainya |
| Kedaluwarsa 30 menit | pengguna menekan tombol lagi untuk kode baru |
| Maks 5 kode per akun per jam | mencegah spam dari aplikasi |
| Maks 3 keypass baru per nomor WhatsApp per 24 jam, 60 per kunci bot per jam | bot menolak dan menyebut berapa lama harus menunggu (`retry_after` detik) |
| Keypass dari bot **hangus 30 menit** bila belum dipakai (`expires_at`) | sesudah dipakai akun, keypass permanen; pengguna meminta lagi lewat bot |
| Akun sudah punya keypass | aplikasi tidak membuat kode aktivasi baru |

Bot **tidak** memegang `service_role`. Bot hanya memakai kunci publik (`anon`) + kunci bot rahasia (`nkbot_…`, hash SHA-256-nya
saja yang tersimpan; dibuat di Akun → Admin → *Keypass & bot WhatsApp*). Kalau bocor, cabut dari halaman yang sama.

## Langkah pemasangan

1. Jalankan `supabase/schema.sql` (aman dijalankan ulang), jadikan akunmu admin (lihat README).
2. Di aplikasi: Akun → Admin → *Kunci bot WhatsApp* → **Buat kunci**. Salin (hanya tampil sekali).
3. Simpan di pengaturan bot (`.env`):

```
SUPABASE_URL=https://<proyek-kamu>.supabase.co
SUPABASE_ANON_KEY=<kunci publik anon>
NINONIME_BOT_KEY=nkbot_...
NINONIME_APP_URL=https://<alamat-aplikasi-kamu>/   # tujuan tautan "buka aplikasi" di balasan bot
```

4. Tambahkan pengenal pesan di bot (contoh di bawah). Nomor bot diatur di `config.js` → `WA_BOT`.

## API

```
POST {SUPABASE_URL}/rest/v1/rpc/nn_bot_keypass
apikey: {SUPABASE_ANON_KEY}
Authorization: Bearer {SUPABASE_ANON_KEY}
Content-Type: application/json

{ "p_key": "nkbot_...", "p_email": "pengguna@email.com", "p_wa": "6281234567890", "p_activation": "AK-7A24-WN6P" }
```

Balasan:

```json
{ "ok": true, "status": "baru", "code": "NK-ABCD-EFGH-JKLM" }
{ "ok": true, "status": "sudah_ada", "code": "NK-..." }     // sudah dibuatkan, belum dipakai
{ "ok": true, "status": "sudah_aktif", "code": "NK-..." }   // akun itu sudah memakai keypass
{ "ok": false, "error": "Kode aktivasi ini sudah dipakai. ..." }
{ "ok": false, "limit": true, "retry_after": 3600, "error": "... Coba lagi dalam 1 jam 0 menit." }   // batas terlampaui
```

## Contoh (Node.js, Baileys)

```js
const { SUPABASE_URL, SUPABASE_ANON_KEY, NINONIME_BOT_KEY } = process.env;

async function mintaKeypass(email, wa, aktivasi) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nn_bot_keypass`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key: NINONIME_BOT_KEY, p_email: email, p_wa: wa, p_activation: aktivasi }),
  });
  if (!r.ok) throw new Error(`Server ${r.status}`);
  return r.json();
}

// di handler pesan masuk (text = isi pesan, from = "6281234567890@s.whatsapp.net")
const APP_URL = process.env.NINONIME_APP_URL || "";
const kode = text.match(/Kode aktivasi\s*:\s*(AK-[A-Z0-9]{4}-[A-Z0-9]{4})/i);
const mail = text.match(/Email\s*:\s*(\S+@\S+\.\S+)/i);
if (kode && mail) {
  const wa = from.split("@")[0];
  try {
    const r = await mintaKeypass(mail[1], wa, kode[1]);
    let balas;
    if (!r.ok && r.limit) balas = `⛔ ${r.error}\n\nBatas permintaan keypass sudah terlampaui. Tunggu sampai waktunya lalu minta lagi dari aplikasi.`;
    else if (!r.ok && /sudah dipakai/i.test(r.error)) balas = "ℹ️ Kode aktivasi ini sudah digunakan.\n\nKalau keypass belum masuk, tekan lagi \"Belum mempunyai keypass\" di aplikasi untuk kode baru.";
    else if (!r.ok) balas = `❌ ${r.error}`;
    else if (r.status === "sudah_aktif") balas = `✅ Akun ini sudah memakai keypass:\n\n*${r.code}*`;
    else balas = `🎬 Keypass NinoNime kamu:\n\n*${r.code}*\n\n📋 Salin kode di atas, lalu tempel di aplikasi. Kode HANGUS dalam 30 menit.\n\n👉 Buka aplikasi (kode terisi otomatis):\n${APP_URL}#/home?kp=${r.code}`;
    await sock.sendMessage(from, { text: balas });
  } catch (e) {
    await sock.sendMessage(from, { text: "⚠️ Server sedang sibuk. Coba lagi beberapa menit lagi." });
  }
}
```
