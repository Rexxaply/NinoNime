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
// Balik kartu digerakkan pegas (bukan durasi tetap): bisa disentuh ulang di tengah jalan, lalu berbalik dari posisinya saat itu.
const TERMS = "Ketentuan penggunaan NinoNime\n\n• Aplikasi ini hanya untuk lingkaran pengguna yang diundang pemiliknya.\n• Keypass bersifat pribadi: jangan dibagikan atau dijual.\n• Kami menyimpan email, username, dan data akunmu di server untuk login dan akses. Password disimpan terenkripsi, bukan teks asli.\n• Daftar favorit disimpan di perangkatmu.\n• Pemilik dapat mencabut keypass bila ada penyalahgunaan.";
let flipUp = false;
const EMAIL_RE = /^(?!.*\.\.)[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const validEmail = (v) => v.length <= 254 && !/^[.]|[.]@/.test(v) && EMAIL_RE.test(v);
const USER_RE = /^[a-z][a-z0-9_.]{2,19}$/;
const COMMON = /^(password|passw0rd|12345678|123456789|1234567890|qwertyui|qwerty123|iloveyou|abc12345|11111111)/i;
// kekuatan password: 1 = lemah (merah), 2 = sedang (oranye), 3 = kuat (hijau)
export function strength(p) {
  if (p.length < 8 || COMMON.test(p) || /^(.)\1+$/.test(p)) return 1;
  let sc = 0;
  if (p.length >= 12) sc++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) sc++;
  if (/\d/.test(p)) sc++;
  if (/[^A-Za-z0-9]/.test(p)) sc++;
  if (sc >= 3 && p.length >= 10) return 3;
  return sc >= 1 ? 2 : 1;
}
const SLABEL = ["", "Lemah", "Sedang", "Kuat"];
const pwField = (up) => `<label>Password<span class="pw"><input name="pw" type="password" required minlength="8" autocomplete="${up ? "new-password" : "current-password"}" placeholder="Minimal 8 karakter"><button type="button" class="eye" data-act="eye" aria-label="Tampilkan password" aria-pressed="false">${icon("eye", 20)}</button></span></label>`;

function authPage() {
  const front = `<form class="auth-face front" data-up="0" novalidate><div class="fc">
      <b class="b17">Masuk ke NinoNime</b>
      <label>Email<input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="nama@email.com"></label>
      ${pwField(false)}
      <span class="err" role="alert"></span>
      <button class="btn primary" type="submit">Masuk</button>
      <button class="btn ghost" type="button" data-act="flip">Tidak memiliki akun? Daftar</button></div></form>`;
  const back = `<form class="auth-face back" data-up="1" novalidate><div class="fc">
      <b class="b17">Daftar akun NinoNime</b>
      <label>Username<input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" placeholder="contoh: nino_fan"><span class="hint" data-for="username" aria-live="polite"></span></label>
      <label>Email<input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="nama@email.com"><span class="hint" data-for="email" aria-live="polite"></span></label>
      ${pwField(true)}
      <span class="meter" data-s="0" aria-live="polite"><i></i><i></i><i></i><em>Kekuatan password</em></span>
      <label class="agree"><input name="agree" type="checkbox" required><span>Saya menyetujui <a href="#" data-act="terms">Ketentuan &amp; Privasi</a> NinoNime.</span></label>
      <span class="err" role="alert"></span>
      <button class="btn primary" type="submit">Daftar</button>
      <button class="btn ghost" type="button" data-act="flip">Sudah punya akun? Masuk</button></div></form>`;
  view.innerHTML = `<div class="auth-page"><img class="gate-logo" src="icons/logo.png" alt="NinoNime" width="207" height="48">
    <p class="mu lh ct">Masuk dulu untuk membuka NinoNime.</p>
    <div class="flip${flipUp ? " is-up" : ""}" id="flip"><div class="flip-in" id="flipIn">${front}${back}<span class="gloss" aria-hidden="true"></span></div></div>
    <div class="forgot" id="forgot"><button class="link" type="button" data-act="forgot" aria-expanded="false">Lupa password?</button>
      <form class="fg-box" id="fgBox" hidden novalidate><label>Email akunmu<input name="email" type="email" autocomplete="email" inputmode="email" placeholder="nama@email.com"></label>
        <button class="btn primary" type="submit">Kirim tautan reset</button><span class="fg-msg" role="status"></span></form></div></div><div class="pad-nav"></div>`;
  const flip = $("#flip"), inner = $("#flipIn"), gloss = $(".gloss", flip), forgot = $("#forgot"), fg = $("#fgBox");
  const faces = $$(".auth-face", flip), faceOf = (up) => faces.find((f) => (f.dataset.up === "1") === up);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* pegas untuk sudut balik: mulai dari nilai saat ini, bisa dibalik di tengah jalan, tanpa kunci input */
  let ang = flipUp ? -180 : 0, vel = 0, tgt = ang, raf = 0, last = 0;
  let hF = 0, hB = 0;
  const draw = () => {
    if (hF && hB) flip.style.height = hF + (hB - hF) * Math.min(1, Math.abs(ang) / 180) + "px";
    const dip = Math.sin(Math.min(1, Math.abs(ang) / 180) * Math.PI);          // 0 di ujung, 1 di tengah balikan
    inner.style.transform = `translateZ(${-70 * dip}px) rotateY(${ang}deg) scale(${1 - 0.035 * dip})`;
    gloss.style.opacity = String(dip * 0.55);
    flip.style.setProperty("--lift", String(dip));
  };
  const step = (t) => {
    const dt = Math.min(0.032, (t - last) / 1000); last = t;
    const w = (2 * Math.PI) / 0.58, z = 0.9;                                   // response 0,58 dtk, sedikit memantul
    vel += (-w * w * (ang - tgt) - 2 * z * w * vel) * dt; ang += vel * dt; draw();
    if (Math.abs(ang - tgt) < 0.04 && Math.abs(vel) < 0.6) { ang = tgt; vel = 0; draw(); raf = 0; return; }
    raf = requestAnimationFrame(step);
  };
  const go2 = (up) => { tgt = up ? -180 : 0; if (reduce) { ang = tgt; vel = 0; draw(); return; } if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } };
  draw();

  /* tinggi alami tiap sisi (isi + padding + border); kartu berubah tinggi bersama sudut balikan */
  const nat = (f) => $(".fc", f).offsetHeight + 42;
  const fit = () => { hF = nat(faceOf(false)); hB = nat(faceOf(true)); draw(); };
  const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; faces.forEach((f) => ro?.observe($(".fc", f)));
  const sync = () => { faces.forEach((f) => { const hide = (f.dataset.up === "1") !== flipUp; f.inert = hide; f.setAttribute("aria-hidden", String(hide)); }); forgot.classList.toggle("off", flipUp); if (flipUp) { fg.hidden = true; $(".link", forgot).setAttribute("aria-expanded", "false"); } };
  sync(); requestAnimationFrame(fit);

  /* tampil/sembunyi password */
  const eye = (btn) => { const inp = btn.parentElement.querySelector("input"), on = inp.type === "password"; inp.type = on ? "text" : "password"; btn.setAttribute("aria-pressed", String(on)); btn.setAttribute("aria-label", on ? "Sembunyikan password" : "Tampilkan password"); };

  /* validasi langsung di form daftar */
  const bf = faceOf(true), q = (n) => bf.elements[n], hint = (n) => $(`.hint[data-for="${n}"]`, bf);
  const setHint = (n, txt, kind) => { const h = hint(n); h.textContent = txt; h.dataset.k = kind || ""; };
  let uOk = null, uTimer = 0, uSeq = 0;
  const checkUser = () => {
    const v = q("username").value.trim().toLowerCase(); clearTimeout(uTimer); uOk = null; const my = ++uSeq;
    if (!v) { setHint("username", "", ""); return; }
    if (!USER_RE.test(v)) { setHint("username", "3–20 karakter: huruf kecil, angka, titik, garis bawah; diawali huruf.", "bad"); uOk = false; return; }
    setHint("username", "Memeriksa…", "wait");
    uTimer = setTimeout(async () => {
      try { const r = await api.rpc("nn_username_free", { p_username: v }); if (my !== uSeq) return;
        uOk = !!r?.free; setHint("username", uOk ? "Username tersedia" : (r?.error || "Username sudah dipakai"), uOk ? "ok" : "bad");
      } catch { if (my === uSeq) { uOk = null; setHint("username", "Tidak bisa memeriksa sekarang. Dicek lagi saat mendaftar.", "wait"); } }
    }, 450);
  };
  const checkMail = (final) => {
    const v = q("email").value.trim();
    if (!v) { setHint("email", "", ""); return false; }
    const ok = validEmail(v);
    setHint("email", ok ? (final ? "Format email benar" : "") : (final ? "Format email belum benar. Contoh: nama@email.com" : ""), ok ? "ok" : "bad");
    return ok;
  };
  const meter = $(".meter", bf);
  const checkPw = () => { const p = q("pw").value, s = p ? strength(p) : 0; meter.dataset.s = String(s); $("em", meter).textContent = s ? `Password ${SLABEL[s].toLowerCase()}${s === 1 && p.length < 8 ? " (minimal 8 karakter)" : ""}` : "Kekuatan password"; return s; };
  q("username").addEventListener("input", checkUser);
  q("email").addEventListener("input", () => checkMail(false)); q("email").addEventListener("blur", () => checkMail(true));
  q("pw").addEventListener("input", checkPw);

  /* lupa password */
  const fgMsg = $(".fg-msg", fg);
  fg.addEventListener("submit", async (e) => {
    e.preventDefault(); const em = fg.elements.email.value.trim(), btn = fg.querySelector("button");
    if (!validEmail(em)) { fgMsg.dataset.k = "bad"; fgMsg.textContent = "Isi email yang formatnya benar."; return; }
    btn.disabled = true; fgMsg.dataset.k = ""; fgMsg.textContent = "Mengirim…";
    try { await api.recover(em); fgMsg.dataset.k = "ok"; fgMsg.textContent = "Jika email itu terdaftar, tautan reset sudah dikirim. Cek kotak masuk dan folder spam."; }
    catch (ex) { fgMsg.dataset.k = "bad"; fgMsg.textContent = ex.message; }
    setTimeout(() => { btn.disabled = false; }, 30000);
  });

  setActs({
    eye: (el) => eye(el),
    flip: () => { flipUp = !flipUp; authMode = flipUp ? "up" : "in"; flip.classList.toggle("is-up", flipUp); sync(); go2(flipUp); },
    terms: (_el, e) => { e?.preventDefault?.(); ask(TERMS, { title: "Ketentuan & Privasi", ok: "Mengerti", cancel: "Tutup" }); },
    forgot: (el) => {
      const open = fg.hidden; fg.hidden = !open; el.setAttribute("aria-expanded", String(open));
      if (open) { const m = faceOf(false).elements.email.value.trim(); if (m && !fg.elements.email.value) fg.elements.email.value = m; fg.elements.email.focus({ preventScroll: true }); }
    },
  });

  faces.forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const up = form.dataset.up === "1", f = new FormData(form), btn = form.querySelector("button[type=submit]"), err = form.querySelector(".err");
    const email = String(f.get("email") || "").trim(), pw = String(f.get("pw") || ""), fail = (m, el) => { err.textContent = m; el?.focus({ preventScroll: true }); };
    err.textContent = "";
    if (!validEmail(email)) { if (up) checkMail(true); return fail("Format email belum benar. Contoh: nama@email.com", form.elements.email); }
    if (pw.length < 8) return fail("Password minimal 8 karakter.", form.elements.pw);
    let username = "";
    if (up) {
      username = String(f.get("username") || "").trim().toLowerCase();
      if (!USER_RE.test(username)) return fail("Username belum benar: 3–20 karakter, huruf kecil/angka/titik/garis bawah, diawali huruf.", form.elements.username);
      if (uOk === false) return fail("Username sudah dipakai atau tidak valid.", form.elements.username);
      if (!f.get("agree")) return fail("Centang persetujuan ketentuan dulu.");
    }
    btn.disabled = true;
    try {
      if (up) {
        const rv = await api.rpc("nn_reserve_username", { p_username: username, p_email: email.toLowerCase() });
        if (!rv?.ok) { uOk = false; setHint("username", rv?.error || "Username sudah dipakai", "bad"); throw new Error(rv?.error || "Username sudah dipakai. Coba yang lain."); }
        const r = await api.signUp(email, pw, username);
        if (r.confirm) { toast("Cek email untuk konfirmasi akun, lalu masuk.", 4500); flipUp = false; authMode = "in"; authPage(); return; }
      } else await api.signIn(email, pw);
      api.rpc("nn_claim_username").then((r) => { if (r?.username) api.lsSet("username", r.username); }).catch(() => {});
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
${user ? `<div class="me-card mx"><span class="me-ini">${esc((user.email || "?")[0].toUpperCase())}</span><span class="rc-mid"><b>${esc(api.lsGet("username") ? "@" + api.lsGet("username") : user.email || "")}</b><span class="mu sm">${api.lsGet("username") ? esc(user.email || "") + " · " : ""}${AN.hasAccess() ? "Keypass aktif" : "Belum ada keypass"}</span></span></div>
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
    logout: async () => { if (!(await ask("Keluar dari akun?", { ok: "Keluar", danger: true }))) return; AN.player.close(); await api.signOut(); api.lsSet("username", null); toast("Kamu sudah keluar"); vAkun(); },
  });
  if (user) {
    if (!api.lsGet("username")) api.rpc("nn_claim_username").then((r) => { if (r?.username) { api.lsSet("username", r.username); vAkun(); } }).catch(() => {});
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
