# Bot WhatsApp: keypass NinoNime otomatis

Pengguna yang belum punya keypass menekan **"Belum mempunyai keypass"** di NinoNime. WhatsApp terbuka ke nomor bot
dengan pesan yang sudah terisi:

```
.keypass email@pengguna.com
```

Bot membaca perintah itu, meminta keypass ke Supabase, lalu membalas kodenya. Pengguna menempel kode di aplikasi (sekali saja).

## Kenapa aman tanpa kunci service_role

Bot **tidak** memegang kunci `service_role` dan tidak menulis ke tabel secara langsung. Bot hanya memanggil satu fungsi,
`bot_keypass`, dengan:

- **kunci publik** Supabase (`anon`, sama seperti yang ada di aplikasi), dan
- **kunci bot** rahasia (`nkbot_…`) yang dibuat di aplikasi: Akun → Admin → *Keypass & bot WhatsApp* → *Kunci bot WhatsApp*.

Di database hanya tersimpan hash SHA-256 kunci bot. Kalau kunci bocor, cabut dari halaman yang sama lalu buat yang baru.

Fungsi itu juga yang memeriksa semuanya di server:

| Aturan | Hasil |
|---|---|
| Email harus sudah terdaftar & dikonfirmasi di NinoNime | selain itu bot membalas "Email belum terdaftar…" |
| Keypass dari bot **hanya bisa dipakai akun dengan email itu** | orang lain tidak bisa memakai keypass hasil minta email orang lain |
| Email sudah punya keypass aktif / sudah dibuatkan | kode yang sama dikirim ulang (tidak membuat kode baru) |
| Maks 3 keypass baru per nomor WhatsApp per 24 jam | balasan "sudah meminta 3 keypass hari ini" |
| Maks 60 keypass baru per kunci bot per jam | balasan "Bot sedang sibuk" |

## Langkah pemasangan

1. Jalankan `supabase/schema.sql` di Supabase → SQL Editor (aman dijalankan ulang), lalu jadikan akunmu admin (lihat README).
2. Di aplikasi: Akun → Admin → **Keypass & bot WhatsApp** → *Kunci bot WhatsApp* → **Buat kunci**. Salin kuncinya
   (hanya tampil sekali).
3. Simpan di pengaturan bot (mis. file `.env` di Termux):

```
SUPABASE_URL=https://<proyek-kamu>.supabase.co
SUPABASE_ANON_KEY=<kunci publik anon, sama dengan di aplikasi>
NINOKUU_BOT_KEY=nkbot_...
```

4. Tambahkan perintah `.keypass` ke bot (contoh di bawah).
5. Nomor bot diatur di `config.js` → `WA_BOT`.

## API

```
POST {SUPABASE_URL}/rest/v1/rpc/bot_keypass
apikey: {SUPABASE_ANON_KEY}
Authorization: Bearer {SUPABASE_ANON_KEY}
Content-Type: application/json

{ "p_key": "nkbot_...", "p_email": "email@pengguna.com", "p_wa": "6281234567890" }
```

Balasan:

```json
{ "ok": true, "status": "baru", "code": "NK-ABCD-EFGH-JKLM" }
{ "ok": true, "status": "sudah_ada", "code": "NK-..." }     // sudah dibuatkan, belum dipakai
{ "ok": true, "status": "sudah_aktif", "code": "NK-..." }   // email itu sudah memakai keypass
{ "ok": false, "error": "Email ini belum terdaftar di NinoNime ..." }
```

## Contoh perintah bot (Node.js, mis. Baileys)

```js
// .keypass email@pengguna.com
const { SUPABASE_URL, SUPABASE_ANON_KEY, NINOKUU_BOT_KEY } = process.env;

async function mintaKeypass(email, wa) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bot_keypass`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key: NINOKUU_BOT_KEY, p_email: email, p_wa: wa }),
  });
  if (!r.ok) throw new Error(`Server ${r.status}`);
  return r.json();
}

// di handler pesan masuk:
// text = isi pesan, from = "6281234567890@s.whatsapp.net"
const m = text.trim().match(/^\.keypass\s+(\S+@\S+\.\S+)$/i);
if (m) {
  const wa = from.split("@")[0];
  try {
    const r = await mintaKeypass(m[1], wa);
    const balas = !r.ok ? `❌ ${r.error}`
      : r.status === "sudah_aktif" ? `✅ Email ini sudah memakai keypass:\n\n*${r.code}*`
      : `🎬 Keypass NinoNime untuk ${m[1]}:\n\n*${r.code}*\n\nBuka NinoNime → Masukkan keypass → tempel kode ini. Keypass hanya berlaku untuk akun dengan email tersebut.`;
    await sock.sendMessage(from, { text: balas });
  } catch (e) {
    await sock.sendMessage(from, { text: "⚠️ Server sedang sibuk. Coba lagi beberapa menit lagi." });
  }
}
```
