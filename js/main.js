// NinoNime · router, bar bawah, halaman Akun (masuk/daftar + keypass), gerbang keypass, panel admin.
import * as api from "./api.js";
import * as AN from "./anime.js";
import { esc, icon, $, $$, toast, ask, closeAsk } from "./ui.js";

const VERSION = window.NINONIME_CONFIG?.VERSION || "0.1.0";
const view = $("#view");
const nav = $("#nav");
let route = { name: "home", params: [] }, prevName = "home", cleanup = null, acts = {};
const scrollMem = new Map();

/* ---------- router ---------- */
// #/home  #/jadwal  #/cari  #/favorit  #/akun  #/anime/<id>  #/admin
const TABS = ["home", "jadwal", "cari", "favorit", "akun"];
const NAV = [["home", "home", "Beranda"], ["jadwal", "cal", "Jadwal"], ["cari", "search", "Cari"], ["favorit", "heart", "Favorit"], ["akun", "user", "Akun"]];
const DEPTH = { home: 0, jadwal: 0, cari: 0, favorit: 0, akun: 0, anime: 1, admin: 1 };
nav.insertAdjacentHTML("beforeend", NAV.map(([t, ic, l]) => `<a href="#/${t}" data-tab="${t}">${icon(ic, 22)}<span>${l}</span></a>`).join(""));
const parse = () => { const p = (location.hash.replace(/^#\/?/, "") || "home").split("/").map(decodeURIComponent); return { name: p[0], params: p.slice(1) }; };
const go = (h) => { location.hash = h; };
const goReplace = (h) => { if (h !== location.hash) location.replace(h); };
let navDepth = 0;
const back = (fallback = "#/home") => (navDepth > 0 ? history.back() : goReplace(fallback));
const setActs = (a) => { acts = a; };
view.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]"); if (!el || !view.contains(el)) return;
  const fn = acts[el.dataset.act]; if (fn) { e.preventDefault(); fn(el, e); }
});

const topbar = (title, right = "") => `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Kembali">${icon("back", 22)}</button><h1>${title}</h1>${right || '<span class="tb-sp"></span>'}</div>`;
const loading = (n, cls) => `<div class="sk-wrap">${`<div class="sk ${cls}"></div>`.repeat(n)}</div>`;
const group = (t, inner) => `<section class="sec"><h2 class="cap">${t}</h2><div class="group">${inner}</div></section>`;
const mrow = (ic, label, sub, act, danger = false) => `<button class="mrow${danger ? " danger" : ""}" data-act="${act}"><span class="mrow-ic">${icon(ic, 19)}</span><span class="rc-mid"><b>${label}</b>${sub ? `<span class="mu sm">${sub}</span>` : ""}</span>${danger ? "" : `<span class="mu">${icon("chev", 18)}</span>`}</button>`;
const ctx = () => ({
  topbar, setActs, go, back, loading, setCleanup: (f) => { cleanup = f; },
  topRight: `<a class="gl-btn" href="#/cari" aria-label="Cari">${icon("search", 20)}</a><a class="gl-btn" href="#/akun" aria-label="Akun">${icon("user", 20)}</a>`,
});

/* ---------- gerbang: harus masuk akun + punya keypass ---------- */
const OPEN = new Set(["akun"]);
function gate() {
  if (!api.currentUser()) { authPage(); return; }
  view.innerHTML = `<div class="gate"><img class="gate-logo" src="icons/logo.png" alt="NinoNime" width="207" height="48">
    <p class="mu lh">${api.currentUser() ? "Akunmu belum punya keypass. Masukkan keypass sekali untuk membuka semua fitur." : "Masuk atau daftar dulu, lalu masukkan keypass sekali untuk membuka NinoNime."}</p>
    ${api.currentUser() ? `<button class="btn primary wide" data-act="kp">${icon("key", 18, 2)}Masukkan keypass</button><button class="btn ghost wide" data-act="wa">Belum mempunyai keypass</button>`
      : `<button class="btn primary wide" data-act="login">Masuk / Daftar</button>`}</div>`;
  setActs({ kp: async () => { if (await AN.openKeypass()) render(); }, wa: () => AN.openWa(), login: () => go("#/akun") });
}


/* ---------- halaman masuk / daftar (kartu berbalik) ---------- */
// Masuk di sisi depan, Daftar di sisi belakang. "Tidak memiliki akun" membalik kartu ke kiri; "Sudah punya akun" membaliknya ke kanan.
const TERMS = "Ketentuan penggunaan NinoNime\n\n• Aplikasi ini hanya untuk lingkaran pengguna yang diundang pemiliknya.\n• Keypass bersifat pribadi: jangan dibagikan atau dijual.\n• Kami menyimpan email dan data akunmu di server untuk login dan akses. Password disimpan terenkripsi, bukan teks asli.\n• Daftar favorit disimpan di perangkatmu.\n• Pemilik dapat mencabut keypass bila ada penyalahgunaan.";
let flipUp = false;
function authPage() {
  const face = (up) => `<form class="auth-face ${up ? "back" : "front"}" data-up="${up ? 1 : 0}">
      <b class="b17">${up ? "Daftar akun NinoNime" : "Masuk ke NinoNime"}</b>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="nama@email.com"></label>
      <label>Password<input name="pw" type="password" required minlength="8" autocomplete="${up ? "new-password" : "current-password"}" placeholder="Minimal 8 karakter"></label>
      ${up ? `<label class="agree"><input name="agree" type="checkbox" required><span>Saya menyetujui <a href="#" data-act="terms">Ketentuan &amp; Privasi</a> NinoNime.</span></label>` : ""}
      <span class="err" role="alert"></span>
      <button class="btn primary" type="submit">${up ? "Daftar" : "Masuk"}</button>
      <button class="btn ghost" type="button" data-act="flip">${up ? "Sudah punya akun? Masuk" : "Tidak memiliki akun? Daftar"}</button></form>`;
  view.innerHTML = `<div class="auth-page"><img class="gate-logo" src="icons/logo.png" alt="NinoNime" width="207" height="48">
    <p class="mu lh ct">Masuk dulu untuk membuka NinoNime.</p>
    <div class="flip${flipUp ? " is-up" : ""}" id="flip"><div class="flip-in">${face(false)}${face(true)}</div></div></div><div class="pad-nav"></div>`;
  const flip = $("#flip");
  const sync = () => { $$(".auth-face", flip).forEach((f) => { const hide = (f.dataset.up === "1") !== flipUp; f.inert = hide; f.setAttribute("aria-hidden", hide); }); };
  sync();
  setActs({
    flip: () => { flipUp = !flipUp; authMode = flipUp ? "up" : "in"; flip.classList.toggle("is-up", flipUp); sync(); setTimeout(() => $(`.auth-face[data-up="${flipUp ? 1 : 0}"] input`, flip)?.focus({ preventScroll: true }), 650); },
    terms: (e) => { e?.preventDefault?.(); ask(TERMS, { title: "Ketentuan & Privasi", ok: "Mengerti", cancel: "Tutup" }); },
  });
  $$(".auth-face", flip).forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const up = form.dataset.up === "1", f = new FormData(form), btn = form.querySelector("button[type=submit]"), err = form.querySelector(".err");
    err.textContent = "";
    if (up && !f.get("agree")) { err.textContent = "Centang persetujuan ketentuan dulu."; return; }
    btn.disabled = true;
    try {
      if (up) { const r = await api.signUp(f.get("email"), f.get("pw")); if (r.confirm) { toast("Cek email untuk konfirmasi akun, lalu masuk.", 4500); flipUp = false; authMode = "in"; authPage(); return; } }
      else await api.signIn(f.get("email"), f.get("pw"));
      await AN.loadAccess().catch(() => {});
      toast("Berhasil masuk");
      if (!AN.hasAccess() && (await AN.openKeypass())) { go("#/home"); return; }
      render();
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  }));
}

/* ---------- Akun ---------- */
let authMode = "in";
async function vAkun() {
  const user = api.currentUser();
  if (!user) { authPage(); return; }
  view.innerHTML = `<div class="page-h"><h1>Akun</h1></div>
${!api.configured ? `<p class="note-warn mx">${icon("info", 18)}Isi SUPABASE_URL dan SUPABASE_ANON_KEY di config.js.</p>` : ""}
${user ? `<div class="me-card mx"><span class="me-ini">${esc((user.email || "?")[0].toUpperCase())}</span><span class="rc-mid"><b>${esc(user.email || "")}</b><span class="mu sm">${AN.hasAccess() ? "Keypass aktif" : "Belum ada keypass"}</span></span></div>
  <div class="px"><div id="kpSec">${AN.keypassSection()}</div></div>
  <div id="adminRow"></div>
  ${group("Aplikasi", mrow("info", "Tentang NinoNime", "Versi " + esc(VERSION), "about") + mrow("out", "Keluar", "", "logout", true))}`
  : ""}
<div class="pad-nav"></div>`;
  const redrawKp = () => { const el = $("#kpSec"); if (el) el.innerHTML = AN.keypassSection(); };
  setActs({
    ...AN.keypassActs(redrawKp),
    about: () => toast(`NinoNime v${VERSION}`),
    admin: () => go("#/admin"),
    logout: async () => { if (!(await ask("Keluar dari akun?", { ok: "Keluar", danger: true }))) return; AN.player.close(); await api.signOut(); toast("Kamu sudah keluar"); vAkun(); },
  });
  if (user) {
    AN.loadAccess().then(redrawKp).catch(() => {});
    api.rpc("nn_is_admin").then((ok) => { const el = $("#adminRow"); if (ok && el) el.innerHTML = group("Admin", mrow("key", "Keypass & bot WhatsApp", "Buat, salin, dan cabut keypass · kunci bot", "admin")); }).catch(() => {});
  }
}

/* ---------- render ---------- */
const VIEWS = {
  home: () => AN.vHome(view, ctx()).then(() => AN.flyBack(view)),
  jadwal: () => AN.vJadwal(view, ctx()).then(() => AN.flyBack(view)),
  cari: () => AN.vSearch(view, ctx()).then(() => AN.flyBack(view)),
  favorit: () => AN.vFav(view, ctx()).then(() => AN.flyBack(view)),
  anime: (id) => AN.vDetail(view, ctx(), id),
  akun: vAkun,
  admin: () => AN.vKeypassAdmin(view, ctx()),
};
async function render() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  closeAsk();
  scrollMem.set(route.name + route.params.join("/"), window.scrollY);
  route = parse();
  if (!VIEWS[route.name]) { goReplace("#/home"); return; }
  const depth = DEPTH[route.name] ?? 0, prevDepth = DEPTH[prevName] ?? 0;
  navDepth = depth > 0 ? navDepth + (prevDepth < depth ? 1 : 0) : 0;
  const fwd = depth !== prevDepth ? depth > prevDepth : TABS.indexOf(route.name) >= TABS.indexOf(prevName);
  prevName = route.name;
  document.body.dataset.screen = route.name;
  document.body.classList.toggle("nav-off", !TABS.includes(route.name));
  if (TABS.includes(route.name)) nav.style.setProperty("--ti", TABS.indexOf(route.name));
  $$("#nav a").forEach((a) => a.setAttribute("aria-current", String(a.dataset.tab === route.name)));
  view.classList.remove("in", "in-f", "in-b"); view.innerHTML = "";
  const job = !OPEN.has(route.name) && !AN.hasAccess() ? (gate(), null) : VIEWS[route.name](...route.params);
  void view.offsetWidth; view.classList.add("in", fwd ? "in-f" : "in-b");
  await job;
  const y = scrollMem.get(route.name + route.params.join("/"));
  requestAnimationFrame(() => window.scrollTo(0, y || 0));
}
window.addEventListener("hashchange", render);

// bar bawah ringkas: menggulir ke bawah → bar mengecil; diam / kembali ke atas → terbuka lagi
let lastY = null, acc = 0, idle = 0;
const setMin = (on) => document.body.classList.toggle("nav-min", on);
addEventListener("scroll", () => {
  const y = scrollY; clearTimeout(idle); idle = setTimeout(() => { acc = 0; setMin(false); }, 2500);
  if (lastY == null || Math.abs(y - lastY) > 400) { lastY = y; acc = 0; return; }
  const d = y - lastY; lastY = y;
  if (y < 30) { acc = 0; setMin(false); return; }
  if (d > 0) { acc += d; if (acc > 48) setMin(true); } else acc = 0;
}, { passive: true });
nav.addEventListener("click", (e) => { if (!document.body.classList.contains("nav-min")) return; e.preventDefault(); e.stopPropagation(); acc = 0; setMin(false); }, true);
const navW = () => { const w = nav.offsetWidth; if (w) { nav.style.setProperty("--nw", w + "px"); nav.style.setProperty("--nwn", String(w)); } };
navW(); new ResizeObserver(navW).observe(nav);

// tombol kembali browser/HP saat pemutar penuh → kecilkan pemutar dulu
addEventListener("keydown", (e) => { if (e.key === "Escape" && (AN.closeKeypass() || AN.player.onBack())) e.preventDefault(); });

api.onAuth((s) => { if (!s) render(); });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
render();
// akses dicek ulang ke server tiap aplikasi dibuka (keypass bisa dicabut admin)
if (api.userId()) AN.loadAccess().then(() => { if (!AN.hasAccess() && !OPEN.has(route.name)) render(); }).catch(() => {});
