// Koneksi ke Supabase (Auth + RPC). Tanpa library: semua lewat fetch.
const C = window.NINONIME_CONFIG || {};
// Server utama (self-hosted) dan cadangan (Supabase Cloud). Server utama mati → pindah otomatis ke cadangan.
const clean = (u) => String(u || "").replace(/\/+$/, "");
const MAIN = { url: clean(C.SUPABASE_URL), key: String(C.SUPABASE_ANON_KEY || "") };
const BACKUP = { url: clean(C.FALLBACK_URL), key: String(C.FALLBACK_KEY || "") };
const hasBackup = !!(BACKUP.url && BACKUP.key && BACKUP.url !== MAIN.url);
let useBackup = false;
let BASE = MAIN.url, KEY = MAIN.key;
export const configured = !!(BASE && KEY);
export const onBackup = () => useBackup;

const LS = "ninonime:";
export const lsGet = (k, d = null) => { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
export const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(LS + k) : localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} };

export class ApiError extends Error { constructor(msg, status = 0) { super(msg); this.status = status; } }
const NET_MSG = "Tidak ada koneksi internet. Periksa jaringanmu lalu coba lagi.";
const T = [
  [/Invalid login credentials/i, "Username/email atau password salah."],
  [/Email not confirmed/i, "Email belum dikonfirmasi. Cek kotak masuk (dan folder spam)."],
  [/User already registered/i, "Email ini sudah terdaftar. Silakan masuk."],
  [/Password should be at least/i, "Password minimal 8 karakter."],
  [/rate limit/i, "Terlalu banyak percobaan. Coba lagi beberapa saat lagi."],
  [/JWT expired/i, "Sesi berakhir, silakan masuk lagi."],
];
const translate = (m) => (T.find(([re]) => re.test(m)) || [0, m])[1];
async function readErr(r) {
  let j = null; try { j = await r.json(); } catch {}
  return new ApiError(translate(String(j?.error_description || j?.msg || j?.message || j?.error || `HTTP ${r.status}`)), r.status);
}

/* ---------- sesi login ---------- */
// Sesi bisa dibagi dengan Ninokuu bila keduanya satu alamat situs (SESSION_KEY: "ninokuu:session").
// Satu kunci untuk dua aplikasi + dibaca ulang tiap dipakai, supaya refresh token yang berputar tidak basi.
// Token hanya berlaku di server yang menerbitkannya, jadi sesi server cadangan disimpan di kunci terpisah (":cadangan"; sama dengan Ninokuu).
const SKEY0 = String(C.SESSION_KEY || "");
const sk = () => (SKEY0 ? SKEY0 + (useBackup ? ":cadangan" : "") : "");
const readSess = () => { if (!SKEY0) return lsGet(useBackup ? "session:cadangan" : "session"); try { const v = localStorage.getItem(sk()); return v ? JSON.parse(v) : null; } catch { return null; } };
const writeSess = (v) => { if (!SKEY0) return lsSet(useBackup ? "session:cadangan" : "session", v); try { v == null ? localStorage.removeItem(sk()) : localStorage.setItem(sk(), JSON.stringify(v)); } catch {} };
let session = readSess();
const syncSess = () => { const s = readSess(); if (JSON.stringify(s) !== JSON.stringify(session)) { session = s; listeners.forEach((f) => { try { f(session); } catch {} }); } };
addEventListener("storage", (e) => { if (!SKEY0 || e.key === sk()) syncSess(); });
addEventListener("focus", syncSess);
const listeners = new Set();
export const onAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function setSession(s) {
  session = s && s.access_token ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: s.user } : null;
  writeSess(session);
  listeners.forEach((f) => { try { f(session); } catch {} });
}
export const currentUser = () => session?.user || null;
export const userId = () => session?.user?.id || null;

/* ---------- server utama ⇄ cadangan ---------- */
// 502/503/504/52x (tunnel mati / server di rumah padam) → server utama dites langsung dulu; benar-benar mati → pindah ke cadangan.
// Server utama dites lagi tiap 90 detik; pulih → kembali.
const DOWN = (st) => st === 502 || st === 503 || st === 504 || (st >= 520 && st <= 530);
const probeMain = async () => {
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
    const r = await fetch(MAIN.url + "/rest/v1/app_config?select=key&limit=1", { headers: { apikey: MAIN.key }, signal: c.signal, cache: "no-store" });
    clearTimeout(t); return r.ok;
  } catch { return false; }
};
let probeT = null, lastOn = 0;
function logBackup(event, detail) {
  // dicatat di Cloud (tabel fallback_log): kapan & berapa kali server cadangan dipakai
  if (!hasBackup) return;
  if (event === "on") { if (Date.now() - lastOn < 10 * 60e3) return; lastOn = Date.now(); }
  fetch(BACKUP.url + "/rest/v1/fallback_log", { method: "POST", keepalive: true,
    headers: { apikey: BACKUP.key, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ event, app: "ninonime", version: String(C.VERSION || ""), detail: String(detail || "").slice(0, 150) }) }).catch(() => {});
}
function switchTo(backup, detail) {
  if (useBackup === backup) return;
  useBackup = backup; BASE = (backup ? BACKUP : MAIN).url; KEY = (backup ? BACKUP : MAIN).key;
  session = readSess(); listeners.forEach((f) => { try { f(session); } catch {} });
  logBackup(backup ? "on" : "off", detail);
  try { window.dispatchEvent(new CustomEvent("ninonime:backend", { detail: { backup } })); } catch {}
  clearInterval(probeT); probeT = null;
  if (backup) probeT = setInterval(async () => { if (await probeMain()) switchTo(false, "pulih"); }, 90e3);
}
async function failover(status) {
  if (!hasBackup || useBackup) return false;
  if (await probeMain()) return false;      // server utama sehat: galatnya milik permintaan ini saja
  switchTo(true, status ? "HTTP " + status : "tidak terjangkau");
  return true;
}
// satu pintu semua permintaan: build(token) membuat init fetch (dipanggil ulang setelah pindah server)
// token login milik server lain / rusak → server menjawab 401 (PostgREST: PGRST301 "No suitable key or wrong key type")
const badToken = async (r) => { try { return /PGRST30[123]|JWT|key type|invalid_token|bad_jwt/i.test(JSON.stringify(await r.clone().json())); } catch { return false; } };
async function net(path, build, { auth = true, failover: fo = true } = {}) {
  if (!configured) throw new ApiError("Aplikasi belum tersambung ke server (isi config.js).");
  let reauth = false, moved = false;
  for (let i = 0; i < 3; i++) {
    const t = auth ? await accessToken() : null;
    const init = build(t);
    // kunci baru (sb_publishable_) bukan JWT: cukup di header apikey, jangan dikirim sebagai Bearer
    const bearer = auth ? (t ? { Authorization: "Bearer " + t } : KEY.startsWith("sb_") ? {} : { Authorization: "Bearer " + KEY }) : {};
    init.headers = { apikey: KEY, ...bearer, ...(init.headers || {}) };
    let r = null;
    try { r = await fetch(BASE + path, init); } catch {}
    // token ditolak: coba perbarui; refresh token juga ditolak → sesi dihapus (masuk lagi), permintaan diulang tanpa login
    if (r && r.status === 401 && auth && t && !reauth && await badToken(r)) { reauth = true; forceRefresh = true; await accessToken(); continue; }
    if (r && !DOWN(r.status)) return r;
    if (!moved && fo) { moved = true; if (await failover(r ? r.status : 0)) continue; }
    if (r) return r;
    throw new ApiError(NET_MSG);
  }
}

async function authCall(path, body, { method = "POST", token } = {}) {
  // token eksplisit / refresh token milik satu server: jangan dialihkan ke server lain
  const r = await net("/auth/v1" + path, () => ({ method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }),
    { auth: false, failover: !token && !/grant_type=refresh_token/.test(path) });
  if (!r.ok) throw await readErr(r);
  return r.status === 204 ? null : r.json().catch(() => null);
}
let refreshing = null, forceRefresh = false;   // forceRefresh: token ditolak server → perbarui walau belum kedaluwarsa
async function accessToken() {
  syncSess();
  if (!session) return null;
  if (!forceRefresh && session.expires_at * 1000 - Date.now() > 60e3) return session.access_token;
  forceRefresh = false;
  refreshing ||= authCall("/token?grant_type=refresh_token", { refresh_token: session.refresh_token })
    .then((s) => { setSession(s); return s.access_token; })
    .catch((e) => { if (e.status === 400 || e.status === 401) setSession(null); return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}
export async function signIn(email, password) { setSession(await authCall("/token?grant_type=password", { email: email.trim(), password })); return session; }
const RESET_URL = String(C.RESET_URL || "https://ninokuu.site/ninonime/resetpassword/");
const VERIFY_URL = String(C.VERIFY_URL || "https://ninokuu.site/ninonime/verified/");
// "Lupa password?": mengirim tautan reset ke email (halaman reset NinoNime di ninokuu.site/ninonime/resetpassword/; akunnya tetap satu dengan Ninokuu)
export async function recover(email) { await authCall("/recover?redirect_to=" + encodeURIComponent(RESET_URL), { email: email.trim() }); }
export async function signUp(email, password, username = "") {
  const r = await authCall("/signup?redirect_to=" + encodeURIComponent(VERIFY_URL), { email: email.trim(), password, ...(username ? { data: { nn_username: username } } : {}) });
  if (r?.access_token) { setSession(r); return { session }; }
  return { confirm: true };   // "Confirm email" aktif di Supabase: tunggu konfirmasi
}
// ganti password / email akun yang sedang masuk (berlaku juga untuk Ninokuu: akunnya satu)
export async function updateUser(attrs) { const t = await accessToken(); if (!t) throw new ApiError("Masuk dulu."); const u = await authCall("/user", attrs, { method: "PUT", token: t }); if (u?.id && session) setSession({ ...session, user: u }); return u; }
// scope=local: hanya sesi di perangkat/aplikasi ini yang keluar. Tanpa itu Supabase mengeluarkan SEMUA sesi akun
// (Ninokuu di HP yang sama ikut terlempar, karena akunnya satu).
export async function signOut() { const t = session?.access_token; setSession(null); if (t) authCall("/logout?scope=local", null, { token: t }).catch(() => {}); }

/* ---------- tabel (REST) — dipakai untuk membaca profil Ninokuu (satu proyek Supabase) ---------- */
export async function rest(path) {
  const r = await net("/rest/v1/" + path, () => ({}));
  if (!r.ok) throw await readErr(r);
  return r.json();
}
export const publicUrl = (bucket, path) => `${BASE}/storage/v1/object/public/${bucket}/${String(path).split("/").map(encodeURIComponent).join("/")}`;

/* ---------- RPC (fungsi SQL di supabase/schema.sql) ---------- */
export async function rpc(fn, args = {}) {
  const r = await net("/rest/v1/rpc/" + fn, () => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) }));
  if (!r.ok) throw await readErr(r);
  return r.status === 204 ? null : r.json();
}
