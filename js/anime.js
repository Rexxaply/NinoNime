// NinoNime · akses keypass, beranda, jadwal tayang, cari, favorit, info anime, dan pemutar yang bisa
// digeser ke bawah menjadi jendela melayang (mini player gaya YouTube).
// Data anime (judul, sampul, jadwal, episode) dari Jikan API (data MyAnimeList, gratis, tanpa kunci),
// diambil langsung dari HP. Sumber video episode disambungkan di js/sources.js.
import * as api from "./api.js";
import { ICONS, esc, icon, $, $$, toast } from "./ui.js";
import { episodeSource } from "./sources.js";
// layar penuh status bar (APK/Capacitor) bisa disambungkan di sini; di PWA cukup Fullscreen API
const setFullscreen = async () => {};

Object.assign(ICONS, {
  tv: '<rect x="3" y="6" width="18" height="13" rx="2.5"></rect><path d="m8 2 4 4 4-4"></path>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h8"></path>',
  eyeOff: '<path d="M3 3l18 18"></path><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>',
  wa: '<path d="M20 11.6a8.1 8.1 0 0 1-12.1 7.1L3.5 20l1.3-4.2A8.1 8.1 0 1 1 20 11.6z"></path><path d="M9 8.6c0 3 2.4 5.9 5.6 6.4l1-1.4-1.9-1-.9.8a5 5 0 0 1-2.4-2.4l.8-.9-1-1.9z"></path>',
  fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>',
  next: '<path d="m6 5 9 7-9 7z"></path><path d="M18 5v14"></path>',
  minim: '<path d="m6 9 6 6 6-6"></path>',
});

// Nomor bot WhatsApp yang membuat keypass otomatis (perintah: .keypass email@kamu.com). Diatur di config.js
export const WA_BOT = String(window.NINONIME_CONFIG?.WA_BOT || "").replace(/\D/g, "");
const JIKAN = "https://api.jikan.moe/v4";
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAYS_S = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const JP_DAYS = ["sundays", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* =====================================================================
   Akses (keypass) dan mode
   ===================================================================== */
const accKey = () => "animeAcc:" + (api.userId() || "-");
export const cachedAccess = () => (api.userId() ? api.lsGet(accKey()) : null);
export const hasAccess = () => !!cachedAccess()?.access;
export async function loadAccess() {
  if (!api.userId()) return null;
  const r = await api.rpc("anime_access");
  const v = { access: !!r?.access, code: r?.code || "" };
  api.lsSet(accKey(), v);
  return v;
}
// pesan otomatis untuk bot: perintah + email akun yang sedang login
export const BOT_CMD = ".keypass";
const waLink = (email) => `https://wa.me/${WA_BOT}?text=${encodeURIComponent(`${BOT_CMD} ${email || ""}`.trim())}`;
export const openWa = () => window.open(waLink(api.currentUser()?.email || ""), "_blank");

// pop-up keypass. Selesai → resolve(true) bila akses didapat.
export function openKeypass() {
  return new Promise((resolve) => {
    $(".kp-host")?.remove();
    const host = document.createElement("div");
    host.className = "ask-host kp-host";
    host.innerHTML = `<div class="ask-bg" data-k="close"></div>
<form class="ask glass kp" role="dialog" aria-modal="true" aria-labelledby="kpT" autocomplete="off">
  <span class="kp-ic">${icon("tv", 26, 2)}</span>
  <b class="ask-ttl" id="kpT">Masukkan keypass</b>
  <img class="kp-logo" src="icons/logo.png" alt="NinoNime" width="138" height="32">
  <p class="ask-msg">NinoNime dibuka dengan keypass. Cukup sekali, setelah itu keypass tersimpan di halaman Akun.</p>
  <label class="kp-f">${icon("key", 18, 2)}<input name="kp" required maxlength="20" spellcheck="false" autocapitalize="characters" placeholder="NK-XXXX-XXXX-XXXX" aria-label="Keypass"></label>
  <span class="err" id="kpErr" role="alert"></span>
  <button class="btn primary kp-go" type="submit">Buka NinoNime</button>
  <button class="kp-wa" type="button" data-k="wa">${icon("wa", 16, 2)}Belum mempunyai keypass</button>
  <span class="kp-hint">Bot WhatsApp akan mengirim keypass untuk email <b>${esc(api.currentUser()?.email || "")}</b>. Tinggal tekan kirim di WhatsApp.</span>
  <button class="ask-b kp-x" type="button" data-k="close">Nanti saja</button>
</form>`;
    document.body.append(host);
    host._close = () => finish(false);
    const form = $("form", host), inp = $("input", host), err = $("#kpErr", host);
    requestAnimationFrame(() => { host.classList.add("on"); setTimeout(() => inp.focus({ preventScroll: true }), 220); });
    let done = false;
    const finish = (v) => {
      if (done) return; done = true;
      host.classList.remove("on"); host.classList.add("off");
      setTimeout(() => host.remove(), 180);
      document.removeEventListener("keydown", onKey, true);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); finish(false); } };
    document.addEventListener("keydown", onKey, true);
    // huruf besar & tanda hubung otomatis saat mengetik: NK-ABCD-EFGH-JKLM
    inp.addEventListener("input", () => {
      const all = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const pre = all.startsWith("NK") && all.length !== 12, body = (pre ? all.slice(2) : all).slice(0, 12);
      inp.value = (pre ? (body ? "NK-" : "NK") : "") + (body.match(/.{1,4}/g) || []).join("-");
      err.textContent = "";
    });
    host.addEventListener("click", (e) => {
      const k = e.target.closest("[data-k]")?.dataset.k;
      if (k === "close") finish(false);
      if (k === "wa") openWa();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $(".kp-go", host); btn.disabled = true; btn.textContent = "Memeriksa…"; err.textContent = "";
      try {
        const r = await api.rpc("redeem_keypass", { p_code: inp.value });
        if (!r?.access) throw new Error(r?.error || "Keypass tidak valid.");
        api.lsSet(accKey(), { access: true, code: r.code });
        form.classList.add("kp-ok");
        setTimeout(() => finish(true), 520);
      } catch (ex) {
        err.textContent = ex.message || "Gagal memeriksa keypass."; form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
        btn.disabled = false; btn.textContent = "Buka NinoNime";
      }
    });
  });
}

export const closeKeypass = () => { const h = $(".kp-host:not(.off)"); if (!h) return false; h._close?.(); return true; };

// baris keypass di halaman Akun: tampil sebagai bintang, dengan tombol Tampilkan & Salin
export function keypassSection() {
  const a = cachedAccess();
  if (!a?.access) return `<section class="sec"><h2 class="cap">Keypass</h2><div class="group">
    <button class="mrow" data-act="kpOpen"><span class="mrow-ic">${icon("key", 20)}</span><span class="rc-mid"><b>Keypass NinoNime</b><span class="mu sm">Belum ada · ketuk untuk memasukkan keypass</span></span><span class="mu">${icon("chev", 18)}</span></button>
    <button class="mrow" data-act="kpWa"><span class="mrow-ic">${icon("wa", 20)}</span><span class="rc-mid"><b>Belum mempunyai keypass</b><span class="mu sm">Minta otomatis ke bot WhatsApp</span></span><span class="mu">${icon("chev", 18)}</span></button></div></section>`;
  return `<section class="sec"><h2 class="cap">Keypass</h2><div class="group">
    <div class="mrow kp-row"><span class="mrow-ic">${icon("key", 20)}</span><span class="rc-mid"><b>Keypass NinoNime</b><code class="kp-code" id="kpCode" data-shown="0">${"•".repeat(14)}</code></span>
      <button class="sq-btn" data-act="kpShow" aria-label="Tampilkan keypass" aria-pressed="false">${icon("eye", 18, 2)}</button>
      <button class="sq-btn" data-act="kpCopy" aria-label="Salin keypass">${icon("copy", 18, 2)}</button></div></div>
    <p class="mu xs lh px6">Keypass ini terikat ke akunmu. Jangan dibagikan.</p></section>`;
}
export function keypassActs(redraw) {
  return {
    kpOpen: async () => { if (await openKeypass()) { toast("NinoNime terbuka. Selamat menonton!"); redraw(); } },
    kpWa: () => openWa(),
    kpShow: (el) => {
      const c = $("#kpCode"), on = c.dataset.shown !== "1";
      c.dataset.shown = on ? "1" : "0"; c.textContent = on ? cachedAccess()?.code || "" : "•".repeat(14);
      el.setAttribute("aria-pressed", String(on)); el.innerHTML = icon(on ? "eyeOff" : "eye", 18, 2);
    },
    kpCopy: async () => { try { await navigator.clipboard.writeText(cachedAccess()?.code || ""); toast("Keypass disalin"); } catch { toast("Tidak bisa menyalin otomatis"); } },
  };
}

/* =====================================================================
   Jikan API: antrean (maks ±3 permintaan/detik) + cache
   ===================================================================== */
const mem = new Map();
let qTail = Promise.resolve(), lastAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function jget(path, ttlMin = 30) {
  const k = "jk:" + path, now = Date.now();
  const m = mem.get(k); if (m && now - m.at < ttlMin * 60e3) return m.v;
  const ls = api.lsGet(k); if (ls && now - ls.at < ttlMin * 60e3) { mem.set(k, ls); return ls.v; }
  const job = qTail.then(async () => {
    for (let i = 0; i < 4; i++) {
      const wait = lastAt + 380 - Date.now(); if (wait > 0) await sleep(wait);
      lastAt = Date.now();
      let r;
      try { r = await fetch(JIKAN + path); } catch { if (ls) return ls.v; throw new Error("Tidak ada koneksi internet."); }
      if (r.status === 429 || r.status >= 500) { await sleep(900 * (i + 1)); continue; }
      if (!r.ok) throw new Error(r.status === 404 ? "Anime tidak ditemukan." : `Gagal memuat data anime (HTTP ${r.status}).`);
      const v = await r.json();
      const e = { at: Date.now(), v }; mem.set(k, e);
      if (JSON.stringify(v).length < 180000) api.lsSet(k, e);
      return v;
    }
    if (ls) return ls.v;
    throw new Error("Server data anime sedang sibuk. Coba lagi sebentar.");
  });
  qTail = job.catch(() => {});
  return job;
}
// buang cache Jikan lama dari penyimpanan HP (dipanggil sesekali)
function trimCache() {
  try { Object.keys(localStorage).filter((k) => k.startsWith("ninonime:jk:")).forEach((k) => { const v = JSON.parse(localStorage.getItem(k)); if (!v || Date.now() - v.at > 2 * 86400e3) localStorage.removeItem(k); }); } catch {}
}
setTimeout(trimCache, 8000);

const ytId = (t) => t?.youtube_id || (String(t?.embed_url || "").match(/embed\/([\w-]{11})/) || [])[1] || "";
const mapA = (a) => ({
  id: a.mal_id, title: a.title || a.title_english || "", alt: a.title_english && a.title_english !== a.title ? a.title_english : "",
  cover: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "",
  score: a.score, eps: a.episodes, status: a.status, airing: !!a.airing, type: a.type, year: a.year || a.aired?.prop?.from?.year,
  season: a.season, members: a.members, rating: a.rating, duration: a.duration, studios: (a.studios || []).map((s) => s.name),
  genres: [...(a.genres || []), ...(a.themes || [])].map((g) => g.name), synopsis: a.synopsis || "",
  bc: a.broadcast?.time ? { day: String(a.broadcast.day || "").toLowerCase(), time: a.broadcast.time } : null, trailer: ytId(a.trailer),
  from: a.aired?.from || "",
});
const uniq = (list) => { const s = new Set(); return list.filter((x) => !s.has(x.id) && s.add(x.id)); };
const SFW = "sfw=true";
export const A = {
  now: async (page = 1) => { const r = await jget(`/seasons/now?${SFW}&limit=24&page=${page}`, 60); return { items: uniq((r.data || []).map(mapA)), next: !!r.pagination?.has_next_page }; },
  top: async () => uniq(((await jget(`/top/anime?filter=airing&${SFW}&limit=10`, 180)).data || []).map(mapA)),
  search: async (q, page = 1) => { const r = await jget(`/anime?q=${encodeURIComponent(q)}&${SFW}&limit=24&page=${page}&order_by=members&sort=desc`, 60); return { items: uniq((r.data || []).map(mapA)), next: !!r.pagination?.has_next_page }; },
  detail: async (id) => mapA((await jget(`/anime/${id}/full`, 360)).data || {}),
  // gambar per episode (kalau ada di MyAnimeList): { nomor: url }
  epThumbs: async (id) => { const o = {}; ((await jget(`/anime/${id}/videos/episodes`, 360)).data || []).forEach((v) => { const n = Number(String(v.episode || "").replace(/\D+/g, "")) || v.mal_id; const u = v.images?.jpg?.image_url; if (n && u) o[n] = u; }); return o; },
  episodes: async (id) => ((await jget(`/anime/${id}/episodes`, 120)).data || []).map((e) => ({ n: e.mal_id, title: e.title || "", aired: e.aired, filler: e.filler, recap: e.recap })),
  // jadwal satu hari JST (semua halaman, maks 3)
  jpDay: async (d) => {
    let out = [];
    for (let p = 1; p <= 3; p++) { const r = await jget(`/schedules?filter=${JP_DAYS[d].slice(0, -1)}&${SFW}&kids=false&limit=25&page=${p}`, 180); out = out.concat((r.data || []).map(mapA)); if (!r.pagination?.has_next_page) break; }
    return uniq(out);
  },
};

/* ---------- waktu tayang: JST → WIB (WIB = JST − 2 jam) ---------- */
// mengembalikan { day: 0..6 (WIB), min: menit sejak 00.00 WIB } atau null
export function wibSlot(bc) {
  if (!bc?.time) return null;
  const jd = JP_DAYS.indexOf(bc.day); if (jd < 0) return null;
  const [h, m] = bc.time.split(":").map(Number); let min = h * 60 + (m || 0) - 120, day = jd;
  if (min < 0) { min += 1440; day = (day + 6) % 7; }
  return { day, min };
}
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// waktu sekarang di WIB (tidak bergantung zona waktu HP)
const wibNow = () => { const d = new Date(Date.now() + 7 * 3600e3); return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d }; };
async function scheduleFor(day) {
  // anime tayang hari WIB `day` = jadwal JST hari yang sama (jam ≥ 02.00) + JST hari berikutnya (jam < 02.00)
  const [a, b] = await Promise.all([A.jpDay(day), A.jpDay((day + 1) % 7)]);
  return uniq([...a, ...b]).map((x) => ({ ...x, slot: wibSlot(x.bc) })).filter((x) => x.slot && x.slot.day === day).sort((p, q) => p.slot.min - q.slot.min);
}

/* ---------- riwayat tonton (di HP) ---------- */
const HK = "animeHist";
export const hist = () => api.lsGet(HK, []);
function saveHist(a, ep, t = 0, dur = 0) {
  const list = hist().filter((x) => x.id !== a.id);
  list.unshift({ id: a.id, title: a.title, cover: a.cover, ep, t: Math.round(t), dur: Math.round(dur), at: Date.now() });
  api.lsSet(HK, list.slice(0, 60));
}

/* =====================================================================
   Tampilan
   ===================================================================== */
const aHref = (id) => `#/anime/${id}`;
const fmtScore = (n) => (Number(n) > 0 ? Number(n).toFixed(2).replace(".", ",") : "");
const acv = (url, title, cls = "") => `<span class="cover ${cls}${url ? "" : " cv-none"}" data-ini="${esc((title || "?").trim()[0] || "?")}">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</span>`;
const acard = (a, i = 0) => `<a class="an-card" href="${aHref(a.id)}" style="--i:${i}"><span class="an-cv">${acv(a.cover, a.title)}${a.airing ? `<span class="an-new">Tayang</span>` : ""}${fmtScore(a.score) ? `<span class="cv-score">${icon("star", 10, 2)}${fmtScore(a.score)}</span>` : ""}${a.eps ? `<span class="an-eps">${a.eps} eps</span>` : ""}</span><b class="t2">${esc(a.title)}</b><span class="mu xs">${esc([a.type, a.year].filter(Boolean).join(" · "))}</span></a>`;
const skCards = (n) => `<div class="an-grid">${Array.from({ length: n }, () => `<span class="an-card"><span class="an-cv sk"></span><span class="sk sk-l"></span><span class="sk sk-l s"></span></span>`).join("")}</div>`;
const errHtml = (e) => `<div class="empty"><b>${esc(e.message || "Gagal memuat")}</b><button class="btn ghost mt8" data-act="retry">Coba lagi</button></div>`;

// --- Top 10: carousel melingkar. Kartu tengah lebih besar (mahkota + bingkai emas), kiri/kanan mengecil & redup.
// Bergeser sendiri tiap 3,5 dtk (berhenti saat disentuh / di luar layar), bisa digeser jari, dan berputar terus.
const CROWN_SVG = '<svg class="tc-crown" viewBox="0 0 64 44" aria-hidden="true"><defs><linearGradient id="tcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#E39B1B"/></linearGradient></defs><path d="M6 14l13 11L32 4l13 21 13-11-6 26H12z" fill="url(#tcg)" stroke="#8A5A0B" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="29" r="4" fill="#E0242B"/></svg>';
function carousel(root, list, extraCleanup) {
  const n = list.length;
  let cur = 0, timer = 0, hidden = false, drag = null;
  root.innerHTML = `<div class="tc-track">${list.map((a, i) => `<a class="tc-it" href="${aHref(a.id)}" data-i="${i}" aria-label="Peringkat ${i + 1}: ${esc(a.title)}">
    <span class="tc-cv">${acv(a.cover, a.title)}<span class="tc-shade"></span><span class="tc-rank">${i + 1}</span>${fmtScore(a.score) ? `<span class="cv-score">${icon("star", 10, 2)}${fmtScore(a.score)}</span>` : ""}
      <span class="tc-cap"><b>${esc(a.title)}</b><span class="tc-stars" style="--s:${Math.max(0, Math.min(5, (Number(a.score) || 0) / 2)).toFixed(2)}" aria-label="Skor ${fmtScore(a.score) || "-"}"></span></span></span>${i === 0 ? CROWN_SVG : ""}</a>`).join("")}</div>
    <div class="tc-dots" aria-hidden="true">${list.map((_, i) => `<i data-i="${i}"></i>`).join("")}</div>`;
  const items = $$(".tc-it", root), dots = $$(".tc-dots i", root);
  // posisi relatif terhadap kartu tengah, dibungkus melingkar: -n/2 .. n/2
  const rel = (i, c) => { let d = (i - c) % n; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; };
  let prev = null;
  const layout = (dx = 0) => {
    items.forEach((el, i) => {
      const d = rel(i, cur), was = prev ? rel(i, prev) : d;
      // kartu yang melompat dari ujung kiri ke ujung kanan (atau sebaliknya) dipindah tanpa animasi supaya tidak melintas
      el.style.transition = Math.abs(d - was) > 1.5 || drag ? "none" : "";
      el.style.setProperty("--d", d); el.style.setProperty("--dx", dx + "px");
      el.classList.toggle("on", d === 0); el.setAttribute("tabindex", Math.abs(d) <= 1 ? "0" : "-1");
      el.setAttribute("aria-hidden", String(Math.abs(d) > 2));
    });
    dots.forEach((dt, i) => dt.classList.toggle("on", i === cur));
    const crown = $(".tc-crown", root); if (crown && crown.parentElement !== items[cur]) items[cur].append(crown);
    const lab = $("#tcN"); if (lab) lab.textContent = `#${cur + 1} dari ${n}`;
    prev = cur;
  };
  const goTo = (c) => { cur = (c + n) % n; layout(); };
  const auto = () => { clearInterval(timer); timer = setInterval(() => { if (!hidden && !drag && document.visibilityState === "visible") goTo(cur + 1); }, 3500); };
  root.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId }; });
  root.addEventListener("pointermove", (e) => {
    if (!drag) return; drag.dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(drag.dx) > 8 && Math.abs(drag.dx) > Math.abs(e.clientY - drag.y)) { drag.moved = true; try { root.setPointerCapture(drag.id); } catch {} }
    if (drag.moved) layout(drag.dx);
  });
  const up = () => {
    if (!drag) return; const d = drag; drag = null;
    if (d.moved) { root.dataset.justDragged = "1"; setTimeout(() => delete root.dataset.justDragged, 60); const step = Math.abs(d.dx) > 40 ? (d.dx < 0 ? 1 : -1) * Math.max(1, Math.round(Math.abs(d.dx) / 160)) : 0; goTo(cur + step); }
    auto();
  };
  root.addEventListener("pointerup", up); root.addEventListener("pointercancel", up);
  // ketuk kartu samping → kartu itu ke tengah (bukan langsung dibuka); kartu tengah → buka info anime
  root.addEventListener("click", (e) => {
    const a = e.target.closest(".tc-it"); if (!a) return;
    if (root.dataset.justDragged) { e.preventDefault(); return; }
    if (!a.classList.contains("on")) { e.preventDefault(); goTo(+a.dataset.i); auto(); }
    else rememberCover(a.querySelector(".cover"));
  });
  const io = new IntersectionObserver((es) => { hidden = !es[0].isIntersecting; }, { threshold: 0.3 });
  io.observe(root);
  layout(); auto();
  return () => { clearInterval(timer); io.disconnect(); extraCleanup?.(); };
}

// --- Beranda anime ---
export async function vHome(view, x) {
  const h = hist(), last = h[0];
  const wn = wibNow();
  view.innerHTML = `
<header class="top"><span class="an-logo"><img class="logo nn-logo" src="icons/logo.png" alt="NinoNime" width="147" height="34"></span>
  <span class="top-r">${x.topRight || ""}</span></header>
<section class="hello"><h1>Mau nonton apa <span class="gold">hari ini</span>?</h1><span class="mu sm">${DAYS[wn.day]}, ${wn.date.getUTCDate()} ${MONTHS[wn.date.getUTCMonth()]} · jam tayang dalam WIB</span></section>
${last ? `<section class="sec s16"><h2 class="cap">Lanjut nonton</h2>
  <a class="resume an-res" href="${aHref(last.id)}" data-act="resume">${acv(last.cover, last.title, "rs")}
    <span class="rc-mid g6"><span class="meta"><span class="tag-s">Episode ${esc(last.ep)}</span></span><span class="rs-t">${esc(last.title)}</span>
      <span class="mu sm">${last.dur ? `${hhmm(Math.floor(last.t / 60))} dari ${hhmm(Math.floor(last.dur / 60))}` : "Ketuk untuk lanjut"}</span>
      <span class="prog"><span style="width:${last.dur ? Math.max(4, Math.round((last.t / last.dur) * 100)) : 6}%"></span></span></span>
    <span class="play">${icon("play", 19, 2)}</span></a></section>` : ""}
<section class="sec s24 nox"><div class="sec-h px"><h2>Tayang hari ini</h2><a class="link-red" href="#/jadwal">Lihat jadwal</a></div><div class="hs an-today" id="today">${`<span class="an-tm"><span class="sk an-tm-sk"></span></span>`.repeat(4)}</div></section>
<section class="sec s26 nox"><div class="sec-h px"><h2>Top 10 sedang tayang</h2><span class="mu sm" id="tcN"></span></div><div class="tc" id="atop"><div class="tc-track"><span class="tc-it sk" style="--d:0"></span><span class="tc-it sk" style="--d:-1"></span><span class="tc-it sk" style="--d:1"></span></div></div></section>
<section class="sec s26"><div class="sec-h"><h2>Musim ini</h2><span class="mu sm" id="seasonN"></span></div><div id="season">${skCards(6)}</div>
  <button class="more-auto" id="aMore" hidden><span class="spin-s" aria-hidden="true"></span>Memuat lainnya…</button></section>
<div class="pad-nav"></div>`;
  let page = 1, items = [], next = false, busy = false;
  const loadSeason = async (more) => {
    if (busy) return; busy = true;
    try {
      const r = await A.now(page);
      items = more ? uniq(items.concat(r.items)) : r.items; next = r.next;
      if (!$("#season")) return;
      $("#season").innerHTML = items.length ? `<div class="an-grid">${items.map((a, i) => acard(a, more ? 0 : i)).join("")}</div>` : `<div class="empty"><b>Belum ada data</b></div>`;
      $("#aMore").hidden = !next;
    } catch (e) { if (more) { page--; toast(e.message); } else if ($("#season")) $("#season").innerHTML = errHtml(e); }
    finally { busy = false; }
  };
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && next && !busy) { page++; loadSeason(true); } }, { rootMargin: "500px" });
  io.observe($("#aMore"));
  x.setCleanup(() => io.disconnect());
  x.setActs({ retry: () => vHome(view, x), ...x.topActs });
  x.refreshDots?.();
  const loadToday = async () => {
    try {
      const list = await scheduleFor(wn.day), el = $("#today"); if (!el) return;
      const up = list.filter((a) => a.slot.min >= wn.min - 30);
      const show = (up.length ? up : list).slice(0, 12);
      el.innerHTML = show.length ? show.map((a, i) => `<a class="an-tm" href="${aHref(a.id)}" style="--i:${i}">${acv(a.cover, a.title)}<span class="an-tm-t"><b>${hhmm(a.slot.min)}</b>${a.slot.min <= wn.min ? `<i class="live">Tayang</i>` : ""}</span><span class="t2 b13">${esc(a.title)}</span></a>`).join("") : `<span class="mu sm px">Tidak ada jadwal tayang hari ini</span>`;
    } catch (e) { const el = $("#today"); if (el) el.innerHTML = `<span class="mu sm px">${esc(e.message)}</span>`; }
  };
  const loadTop = async () => {
    try {
      const list = (await A.top()).slice(0, 10), el = $("#atop"); if (!el || !list.length) return;
      x.setCleanup(carousel(el, list, () => io.disconnect()));
    } catch (e) { const el = $("#atop"); if (el) el.innerHTML = `<span class="mu sm px">${esc(e.message)}</span>`; }
  };
  // berurutan (bukan bersamaan): Jikan membatasi jumlah permintaan per detik
  await loadToday(); await loadTop(); await loadSeason(false);
}

// --- Jadwal: pilihan hari + garis waktu dengan penanda SEKARANG ---
let jDay = null;
export async function vJadwal(view, x) {
  const wn = wibNow();
  if (jDay == null) jDay = wn.day;
  // minggu berjalan (Minggu–Sabtu) dengan tanggalnya
  const start = new Date(wn.date); start.setUTCDate(start.getUTCDate() - wn.day);
  const week = DAYS_S.map((s, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); return { i, s, n: d.getUTCDate(), m: d.getUTCMonth() }; });
  view.innerHTML = `
<div class="page-h jd-h"><h1>Jadwal</h1><span class="mu sm">Jam tayang WIB</span></div>
<div class="jd-days" role="tablist" style="--di:${jDay}"><span class="jd-pill" aria-hidden="true"></span>
  ${week.map((d) => `<button role="tab" class="jd-day${d.i === wn.day ? " today" : ""}" aria-selected="${d.i === jDay}" data-act="day" data-v="${d.i}"><span>${d.s}</span><b>${d.n}</b><i></i></button>`).join("")}</div>
<div id="jdBody"></div><div class="pad-nav"></div>`;
  let seq = 0;
  const draw = async (dir = 0) => {
    const my = ++seq, body = $("#jdBody"), d = week[jDay];
    $(".jd-days").style.setProperty("--di", jDay);
    $$(".jd-day").forEach((b) => b.setAttribute("aria-selected", String(+b.dataset.v === jDay)));
    body.innerHTML = `<div class="jd-sum"><b>${DAYS[jDay]}</b><span class="mu sm">${d.n} ${MONTHS[d.m]}</span><span class="grow"></span><span class="mu sm" id="jdN"></span></div>
      <div class="jd-line jd-load">${`<div class="jd-it"><span class="jd-tm"><span class="sk sk-l"></span></span><span class="jd-dot"></span><span class="jd-card"><span class="sk jd-skc"></span><span class="col g6 grow"><span class="sk sk-l"></span><span class="sk sk-l s"></span></span></span></div>`.repeat(4)}</div>`;
    body.dataset.dir = dir > 0 ? "f" : dir < 0 ? "b" : "";
    try {
      const list = await scheduleFor(jDay);
      if (my !== seq || !$("#jdBody")) return;
      const now = wibNow(), isToday = jDay === now.day;
      $("#jdN").textContent = `${list.length} anime`;
      let html = "", nowPut = false, k = 0;
      const nowRow = () => `<div class="jd-now" style="--i:${k++}"><span class="jd-tm"><b>${hhmm(now.min)}</b></span><span class="jd-dot now"></span><span class="jd-nl"><i class="jd-tag">SEKARANG</i></span></div>`;
      for (const a of list) {
        if (isToday && !nowPut && a.slot.min > now.min) { html += nowRow(); nowPut = true; }
        const past = isToday && a.slot.min <= now.min, diff = a.slot.min - now.min;
        const left = isToday && diff > 0 ? `${diff >= 60 ? Math.floor(diff / 60) + "j " : ""}${diff % 60}m` : "";
        html += `<a class="jd-it${past ? " past" : ""}" href="${aHref(a.id)}" style="--i:${k++}"><span class="jd-tm"><b>${hhmm(a.slot.min)}</b>${left ? `<i>${left}</i>` : past && now.min - a.slot.min < 30 ? `<i class="live">Tayang</i>` : ""}</span><span class="jd-dot"></span>
          <span class="jd-card">${acv(a.cover, a.title, "jd")}<span class="col g4 grow"><b class="t2">${esc(a.title)}</b><span class="mu xs">${esc([a.eps ? `${a.eps} episode` : "Episode baru", fmtScore(a.score) ? "★ " + fmtScore(a.score) : ""].filter(Boolean).join(" · "))}</span></span></span></a>`;
      }
      if (isToday && !nowPut && list.length) html += nowRow();
      body.innerHTML = body.firstElementChild.outerHTML + (list.length ? `<div class="jd-line">${html}</div>` : `<div class="empty"><b>Belum ada jadwal</b><span class="mu sm">Tidak ada anime yang tayang hari ini.</span></div>`);
      body.dataset.dir = dir > 0 ? "f" : dir < 0 ? "b" : "";
      requestAnimationFrame(() => body.querySelector(".jd-line")?.classList.add("on"));
      // gulir pelan ke penanda SEKARANG
      if (isToday) setTimeout(() => { const n = $(".jd-now"); if (n && n.getBoundingClientRect().top > innerHeight * .6) window.scrollTo({ top: window.scrollY + n.getBoundingClientRect().top - innerHeight * .35, behavior: "smooth" }); }, 450);
    } catch (e) { if (my === seq && $("#jdBody")) $("#jdBody").innerHTML = errHtml(e); }
  };
  // geser kiri/kanan untuk pindah hari
  let sx = 0, sy = 0;
  const ts = (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  const te = (e) => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) { const n = Math.min(6, Math.max(0, jDay + (dx < 0 ? 1 : -1))); if (n !== jDay) { const dir = n - jDay; jDay = n; draw(dir); } } };
  view.addEventListener("touchstart", ts, { passive: true }); view.addEventListener("touchend", te, { passive: true });
  // penanda SEKARANG ikut bergerak tiap menit
  const tick = setInterval(() => { if (jDay === wibNow().day && document.visibilityState === "visible") draw(0); }, 60e3);
  x.setCleanup(() => { clearInterval(tick); view.removeEventListener("touchstart", ts); view.removeEventListener("touchend", te); });
  x.setActs({ day: (el) => { const n = +el.dataset.v; if (n === jDay) return; const dir = n - jDay; jDay = n; draw(dir); }, retry: () => draw(0) });
  await draw(0);
}

// --- Cari ---
let sq = "", sMem = null;
export async function vSearch(view, x) {
  view.innerHTML = `<div class="page-h"><h1>Cari anime</h1></div>
<form class="search mx" id="asf" role="search"><span class="mu">${icon("search", 19)}</span><input id="asq" type="search" enterkeyhint="search" placeholder="Judul anime, mis. One Piece" value="${esc(sq)}" autocomplete="off"></form>
<div id="ares" class="px mt14"></div><div class="pad-nav"></div>`;
  const drawRes = (r) => { $("#ares").innerHTML = r.items.length ? `<div class="an-grid">${r.items.map((a, i) => acard(a, i)).join("")}</div>` : `<div class="empty"><b>Tidak ditemukan</b><span class="mu sm">Coba judul lain atau ejaan Jepang/Inggris.</span></div>`; };
  const run = async () => {
    const q = $("#asq").value.trim(); sq = q;
    if (!q) { const r = await A.now(1).catch(() => null); if (r && $("#ares")) $("#ares").innerHTML = `<h2 class="cap">Sedang tayang</h2><div class="an-grid">${r.items.map((a, i) => acard(a, i)).join("")}</div>`; return; }
    if (sMem?.q === q) return drawRes(sMem.r);
    $("#ares").innerHTML = skCards(6);
    try { const r = await A.search(q); sMem = { q, r }; if ($("#ares") && sq === q) drawRes(r); } catch (e) { if ($("#ares")) $("#ares").innerHTML = errHtml(e); }
  };
  $("#asf").addEventListener("submit", (e) => { e.preventDefault(); $("#asq").blur(); run(); });
  let t = 0; $("#asq").addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 650); });
  x.setActs({ retry: run });
  await run();
}

// --- Favorit anime (di HP): dibedakan Ongoing & Tamat ---
const FK = "animeFav";
export const favs = () => api.lsGet(FK, []);
const isFav = (id) => favs().some((f) => f.id === id);
const favItem = (a) => ({ id: a.id, title: a.title, cover: a.cover, eps: a.eps, status: a.status, airing: a.airing, score: a.score, type: a.type, year: a.year, at: Date.now(), chk: Date.now() });
function toggleFav(a) {
  const on = isFav(a.id);
  api.lsSet(FK, on ? favs().filter((f) => f.id !== a.id) : [favItem(a), ...favs()].slice(0, 300));
  return !on;
}
const isDone = (f) => !f.airing && /finished/i.test(f.status || "");
const statusName = (a) => (a.airing || /currently/i.test(a.status || "") ? "Ongoing" : /finished/i.test(a.status || "") ? "Tamat" : /not yet/i.test(a.status || "") ? "Segera tayang" : a.status || "");
// status anime yang masih tayang dicek ulang (maks 4 judul tiap buka Favorit, masing-masing paling cepat 12 jam sekali)
async function refreshFavs() {
  const due = favs().filter((f) => !isDone(f) && Date.now() - (f.chk || 0) > 12 * 3600e3).slice(0, 4);
  let changed = false;
  for (const f of due) {
    try {
      const a = await A.detail(f.id);
      api.lsSet(FK, favs().map((y) => (y.id === f.id ? { ...y, status: a.status, airing: a.airing, eps: a.eps, score: a.score, chk: Date.now() } : y)));
      changed = changed || a.airing !== f.airing || a.status !== f.status;
    } catch {}
  }
  return changed;
}
let favTab = "all";
export async function vFav(view, x) {
  const draw = () => {
    const list = favs(), on = list.filter((f) => !isDone(f)), done = list.filter(isDone);
    const card = (f, i) => `<a class="an-card" href="${aHref(f.id)}" style="--i:${i}"><span class="an-cv">${acv(f.cover, f.title)}<span class="an-new ${isDone(f) ? "done" : ""}">${isDone(f) ? "Tamat" : "Ongoing"}</span>${f.eps ? `<span class="an-eps">${f.eps} eps</span>` : ""}</span><b class="t2">${esc(f.title)}</b><span class="mu xs">${esc([f.type, f.year].filter(Boolean).join(" · "))}</span></a>`;
    const sec = (title, arr, cls) => arr.length ? `<section class="fv-sec"><h2 class="fv-h ${cls}">${title}<span>${arr.length}</span></h2><div class="an-grid">${arr.map(card).join("")}</div></section>` : "";
    const tabs = [["all", "Semua", list.length], ["on", "Ongoing", on.length], ["done", "Tamat", done.length]];
    view.innerHTML = `<div class="page-h"><h1>Favorit</h1><span class="mu sm">${list.length} anime · ${on.length} masih tayang</span>
  <div class="chips fv-chips" role="group">${tabs.map(([k, n, c]) => `<button aria-pressed="${favTab === k}" data-act="ftab" data-v="${k}">${n}<b>${c}</b></button>`).join("")}</div></div>
<div class="px" id="fvBody" data-t="${favTab}">${!list.length ? `<div class="empty"><span class="empty-ic">${icon("heart", 24)}</span><b>Belum ada anime favorit</b><span class="mu sm">Tekan Simpan di halaman info anime.</span></div>`
  : favTab === "on" ? sec("Ongoing", on, "on") || `<div class="empty"><b>Tidak ada yang masih tayang</b></div>`
  : favTab === "done" ? sec("Tamat", done, "done") || `<div class="empty"><b>Belum ada yang tamat</b></div>`
  : sec("Ongoing", on, "on") + sec("Tamat", done, "done")}</div><div class="pad-nav"></div>`;
  };
  draw();
  x.setActs({ ftab: (el) => { favTab = el.dataset.v; draw(); } });
  if (await refreshFavs()) draw();
}

// --- Animasi sampul berpindah (daftar ↔ info anime) ---
// Sampul yang diketuk "terbang" ke poster besar di info anime; saat kembali, poster terbang lagi ke sampulnya.
let morph = null;
function rememberCover(cv) {
  if (!cv) return;
  const r = cv.getBoundingClientRect(), img = cv.querySelector("img");
  morph = { r, src: img?.currentSrc || img?.src || "", at: Date.now() };
}
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#/anime/"]'); if (!a || a.closest(".tc")) return;
  rememberCover(a.querySelector(".cover"));
}, true);
function fly(from, toEl, src, dur = 420) {
  if (!toEl || !from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const to = toEl.getBoundingClientRect(); if (!to.width) return;
  const g = document.createElement("div"); g.className = "fly";
  g.style.cssText = `left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;background-image:url("${String(src).replace(/"/g, "%22")}")`;
  document.body.append(g);
  toEl.style.visibility = "hidden";
  const k = g.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, borderRadius: "10px" }, { transform: "none", borderRadius: getComputedStyle(toEl).borderRadius }],
    { duration: dur, easing: "cubic-bezier(.2,.8,.2,1)" });
  const done = () => { toEl.style.visibility = ""; g.remove(); };
  k.onfinish = done; setTimeout(done, dur + 200);
}
let backFly = null;   // poster info anime saat ditinggalkan → sampul di daftar
export function flyBack(view) {
  if (!backFly || Date.now() - backFly.at > 1500) { backFly = null; return; }
  const b = backFly; backFly = null;
  const el = $$(`a[href="${aHref(b.id)}"] .cover`, view).find((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  if (el) fly(b.r, el, b.src, 380);
}

// --- Info anime (poster di tengah, sinopsis, daftar episode bergambar) ---
const fmtDate = (iso) => { const t = Date.parse(iso || ""); if (!t) return ""; const d = new Date(t + 7 * 3600e3); return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
let epDesc = false, epGridView = false;
export async function vDetail(view, x, id) {
  id = Number(id);
  const from = morph && Date.now() - morph.at < 1500 ? morph : null; morph = null;
  const bar = (title = "") => `<div class="ad-bar"><button class="icon-btn" data-act="back" aria-label="Kembali">${icon("back", 22)}</button><b class="ad-bar-t">${esc(title)}</b>
    <button class="ad-save${isFav(id) ? " on" : ""}" data-act="save" aria-pressed="${isFav(id)}">${icon(isFav(id) ? "heartF" : "heart", 17, 2)}<span>${isFav(id) ? "Tersimpan" : "Simpan"}</span></button></div>`;
  // kerangka langsung tampil (poster dari sampul yang diketuk), data menyusul
  view.innerHTML = `<div class="ad">${bar()}<div class="ad-hero"><span class="ad-bg"${from?.src ? ` style="background-image:url('${esc(from.src)}')"` : ""}></span>
    <span class="cover adp${from?.src ? "" : " sk"}">${from?.src ? `<img src="${esc(from.src)}" alt="">` : ""}</span><span class="sk sk-l ad-skt"></span><span class="sk sk-l s ad-skt"></span></div></div>`;
  if (from) fly(from.r, $(".cover.adp", view), from.src);
  x.setActs({ back: () => x.back("#/home"), retry: () => vDetail(view, x, id) });
  let a, eps = [], thumbs = {};
  try { a = await A.detail(id); } catch (e) { view.innerHTML = `<div class="ad">${bar()}${errHtml(e)}</div>`; return; }
  if (!view.querySelector(".ad")) return;
  const h = hist().find((y) => y.id === id);
  const slot = wibSlot(a.bc);
  const total = () => Math.max(a.eps || 0, eps.length || 0, h?.ep || 0);
  const epRow = (n, i) => {
    const e = eps.find((y) => y.n === n), cur = Number(h?.ep) === n, t = e?.title && !/^episode\s*\d+$/i.test(e.title) ? e.title : "";
    return `<button class="ep-row${cur ? " on" : ""}" data-act="ep" data-v="${n}" style="--i:${Math.min(i, 16)}"><span class="ep-th"${thumbs[n] || a.cover ? ` style="background-image:url('${esc(thumbs[n] || a.cover)}')"` : ""}>${cur ? `<i>Terakhir</i>` : ""}<span class="ep-pl">${icon("play", 14, 2.4)}</span></span>
      <span class="col g4 grow"><b>Episode ${n}</b><span class="mu xs">${esc([t, fmtDate(e?.aired)].filter(Boolean).join(" · ") || (a.airing && n === total() ? "Episode terbaru" : ""))}</span></span>${e?.filler ? `<span class="ep-tag">Filler</span>` : ""}</button>`;
  };
  const epList = () => {
    const n = total(); if (!n) return `<span class="mu sm">Belum ada episode.</span>`;
    const nums = Array.from({ length: n }, (_, i) => i + 1); if (epDesc) nums.reverse();
    return epGridView ? `<div class="ep-grid">${nums.map((k, i) => `<button class="ep-b${k === Number(h?.ep) ? " on" : ""}" data-act="ep" data-v="${k}" style="--i:${Math.min(i, 24)}">${k}</button>`).join("")}</div>`
      : `<div class="ep-rows">${nums.map(epRow).join("")}</div>`;
  };
  const draw = () => {
    const meta = [a.studios[0] ? `<b class="ad-studio">${esc(a.studios[0])}</b>` : "", esc(a.type || ""), esc(statusName(a)), esc(fmtDate(a.from))].filter(Boolean).join('<i class="ad-sep">|</i>');
    view.innerHTML = `<div class="ad">${bar(a.title)}
<div class="ad-hero"><span class="ad-bg" style="background-image:url('${esc(a.cover)}')"></span>
  <span class="cover adp">${a.cover ? `<img src="${esc(a.cover)}" alt="">` : ""}${fmtScore(a.score) ? `<span class="adp-score">${icon("star", 12, 2)}${fmtScore(a.score).replace(/,?0$/, "")}</span>` : ""}</span>
  <h1 class="ad-t">${esc(a.title)}</h1>${a.alt ? `<span class="ad-alt">${esc(a.alt)}</span>` : ""}
  <span class="ad-meta">${meta}</span>
  ${a.genres.length ? `<span class="ad-gen">${a.genres.slice(0, 5).map((g) => `<i>${esc(g)}</i>`).join("")}</span>` : ""}
  ${slot ? `<span class="ad-slot">${icon("clock", 12, 2)}Tayang tiap ${DAYS[slot.day]} ${hhmm(slot.min)} WIB</span>` : ""}
</div>
<div class="px col g14">
  <div class="row g8 ad-cta"><button class="btn primary grow" data-act="play">${icon("play", 18, 2)}${h ? `Lanjut episode ${esc(h.ep)}` : "Tonton episode 1"}</button>${a.trailer ? `<button class="btn ghost" data-act="trailer">${icon("tv", 18, 2)}Trailer</button>` : ""}</div>
  <div class="ad-card"><b>Sinopsis</b><p class="ad-syn" id="syn">${esc(a.synopsis || "Belum ada sinopsis.").replace(/\n+/g, "<br>")}</p>
    ${a.synopsis.length > 220 ? `<button class="ad-more" data-act="syn">Lihat selengkapnya ${icon("chev", 14, 2.2)}</button>` : ""}</div>
  <div class="ep-h"><h2>Episode <span class="mu">(${total()})</span></h2><span class="row g6"><button class="sq-btn" data-act="epGrid" aria-label="${epGridView ? "Tampilan daftar" : "Tampilan kotak"}">${icon(epGridView ? "list" : "grid", 17, 2)}</button><button class="sq-btn${epDesc ? " on" : ""}" data-act="epSort" aria-label="Urutkan episode">${icon("sort", 17, 2)}</button></span></div>
  <div id="eps">${epList()}</div>
  ${a.studios.length ? `<p class="mu xs">Studio: ${esc(a.studios.join(", "))}${a.duration ? " · " + esc(a.duration) : ""}</p>` : ""}
</div><div class="pad-nav"></div></div>`;
  };
  draw();
  // judul muncul di bar atas setelah poster tergulir lewat
  const onScroll = () => { const b = $(".ad-bar", view); if (b) b.classList.toggle("solid", window.scrollY > 260); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  x.setCleanup(() => {
    removeEventListener("scroll", onScroll);
    const p = $(".cover.adp", view); if (p) { const r = p.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) backFly = { id, r, src: a.cover, at: Date.now() }; }
  });
  const redrawEps = () => { const el = $("#eps"); if (el) el.innerHTML = epList(); };
  x.setActs({
    back: () => x.back("#/home"), retry: () => vDetail(view, x, id),
    play: () => player.open(a, h?.ep || 1, eps),
    ep: (el) => player.open(a, Number(el.dataset.v), eps),
    trailer: () => player.open(a, 0, eps),
    save: (el) => {
      const on = toggleFav(a);
      el.classList.toggle("on", on); el.setAttribute("aria-pressed", String(on));
      el.innerHTML = `${icon(on ? "heartF" : "heart", 17, 2)}<span>${on ? "Tersimpan" : "Simpan"}</span>`;
      el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
      toast(on ? (a.airing ? "Disimpan di Favorit · Ongoing" : "Disimpan di Favorit · Tamat") : "Dihapus dari Favorit");
    },
    syn: (el) => { const o = $("#syn").classList.toggle("open"); el.innerHTML = `${o ? "Sembunyikan" : "Lihat selengkapnya"} ${icon("chev", 14, 2.2)}`; el.classList.toggle("up", o); },
    epSort: (el) => { epDesc = !epDesc; el.classList.toggle("on", epDesc); redrawEps(); },
    epGrid: (el) => { epGridView = !epGridView; el.innerHTML = icon(epGridView ? "list" : "grid", 17, 2); redrawEps(); },
  });
  // favorit: status ikut diperbarui saat info anime dibuka
  if (isFav(id)) api.lsSet(FK, favs().map((f) => (f.id === id ? { ...f, status: a.status, airing: a.airing, eps: a.eps, score: a.score, chk: Date.now() } : f)));
  try { eps = await A.episodes(id); } catch {}
  try { thumbs = await A.epThumbs(id); } catch {}
  if ($("#eps")) { const hEl = $(".ep-h h2 .mu"); if (hEl) hEl.textContent = `(${total()})`; redrawEps(); }
}

/* =====================================================================
   Pemutar + mini player
   - Geser video ke bawah → mengecil menjadi jendela melayang di atas bar bawah (video tetap berjalan).
   - Ketuk / geser ke atas jendela melayang → kembali penuh. Geser ke samping / ✕ → tutup.
   Sumber video: trailer YouTube resmi (dari data MyAnimeList) dan episodeSource() di js/sources.js
   (MP4/HLS langsung atau video YouTube).
   ===================================================================== */
// Sumber video episode: lihat js/sources.js

export const player = (() => {
  let root = null, st = "closed", cur = null, ep = 0, list = [], yt = null, ytState = -1, vid = null;
  const build = () => {
    root = document.createElement("div");
    root.className = "ap"; root.hidden = true;
    root.innerHTML = `<div class="ap-dim"></div>
<div class="ap-sheet" role="dialog" aria-label="Pemutar anime">
  <div class="ap-vid"><div class="ap-media"></div>
    <div class="ap-ctl"><button class="ap-ib" data-p="min" aria-label="Kecilkan">${icon("minim", 24, 2.2)}</button><span class="grow"></span><button class="ap-ib" data-p="fs" aria-label="Layar penuh">${icon("fs", 20, 2)}</button></div>
    <span class="ap-mt"><b></b><span></span></span>
    <button class="ap-mb" data-p="pp" aria-label="Putar / jeda">${icon("pause", 22, 2.2)}</button>
    <button class="ap-mb" data-p="close" aria-label="Tutup">${icon("x", 22, 2.2)}</button>
    <span class="ap-bar"><i></i></span></div>
  <div class="ap-body"><span class="ap-grab" aria-hidden="true"></span><div class="ap-info"></div></div>
</div>`;
    document.body.append(root);
    root.addEventListener("click", onClick);
    bindDrag();
    window.addEventListener("message", onYtMsg);
  };
  const setState = (s) => { st = s; root.classList.toggle("full", s === "full"); root.classList.toggle("mini", s === "mini"); document.body.classList.toggle("ap-mini", s === "mini"); document.body.classList.toggle("ap-full", s === "full"); };

  /* ----- media ----- */
  const media = () => $(".ap-media", root);
  function load(src, poster) {
    stopMedia();
    const m = media();
    if (!src) {
      m.innerHTML = `<div class="ap-empty" style="--bg:url('${esc(poster || "")}')"><span>${icon("tv", 30, 1.8)}</span><b>Video episode ${ep} belum tersedia</b><i>Sumber video untuk episode ini belum ada (js/sources.js).${cur?.trailer ? " Trailer bisa diputar." : ""}</i>${cur?.trailer ? `<button class="btn ghost" data-p="trailer">${icon("play", 16, 2)}Putar trailer</button>` : ""}</div>`;
      syncPP(); return;
    }
    if (src.kind === "yt") {
      const o = encodeURIComponent(location.origin.startsWith("http") ? location.origin : "https://localhost");
      m.innerHTML = `<iframe class="ap-yt" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(src.id)}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=${o}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="Pemutar video"></iframe>`;
      yt = $("iframe", m); ytState = -1;
      yt.addEventListener("load", () => { try { yt.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); } catch {} });
    } else {
      m.innerHTML = `<video class="ap-v" playsinline autoplay controls preload="metadata" ${poster ? `poster="${esc(poster)}"` : ""}></video>`;
      vid = $("video", m); vid.src = src.url;
      const h = hist().find((y) => y.id === cur.id && Number(y.ep) === ep);
      vid.addEventListener("loadedmetadata", () => { if (h?.t > 5 && h.t < vid.duration - 10) vid.currentTime = h.t; }, { once: true });
      let lastSave = 0;
      vid.addEventListener("timeupdate", () => { const b = $(".ap-bar i", root); if (b && vid.duration) b.style.width = (vid.currentTime / vid.duration) * 100 + "%"; if (Date.now() - lastSave > 5000) { lastSave = Date.now(); saveHist(cur, ep, vid.currentTime, vid.duration); } });
      vid.addEventListener("play", syncPP); vid.addEventListener("pause", syncPP);
      vid.addEventListener("ended", () => { if (ep && (!cur.eps || ep < cur.eps)) setTimeout(() => go(ep + 1), 800); });
    }
    syncPP();
  }
  function stopMedia() { if (vid) { try { vid.pause(); } catch {} vid.removeAttribute("src"); vid.load?.(); } vid = null; yt = null; ytState = -1; const m = root && media(); if (m) m.innerHTML = ""; }
  const ytCmd = (func) => { try { yt?.contentWindow.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*"); } catch {} };
  function onYtMsg(e) {
    if (!yt || e.source !== yt.contentWindow) return;
    let d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    const s = d?.info?.playerState ?? (d?.event === "onStateChange" ? d.info : undefined);
    if (typeof s === "number") { ytState = s; syncPP(); }
    const ct = d?.info?.currentTime, du = d?.info?.duration;
    if (ct != null && du) { const b = $(".ap-bar i", root); if (b) b.style.width = (ct / du) * 100 + "%"; }
  }
  const playing = () => (vid ? !vid.paused : yt ? ytState === 1 || ytState === 3 || ytState === -1 : false);
  const syncPP = () => { const b = $("[data-p=pp]", root); if (b) { b.innerHTML = icon(playing() ? "pause" : "play", 22, 2.2); b.hidden = !vid && !yt; } };
  const toggle = () => { if (vid) vid.paused ? vid.play() : vid.pause(); else if (yt) { ytCmd(playing() ? "pauseVideo" : "playVideo"); ytState = playing() ? 2 : 1; syncPP(); } };

  /* ----- isi info di bawah video ----- */
  function info() {
    const a = cur, n = Math.max(a.eps || 0, list.length, ep);
    const e = list.find((y) => y.n === ep);
    $(".ap-mt b", root).textContent = a.title;
    $(".ap-mt span", root).textContent = ep ? `Episode ${ep}` : "Trailer";
    $(".ap-info", root).innerHTML = `
  <div class="ap-h">${acv(a.cover, a.title, "sm")}<div class="col g4 grow"><b class="ap-t">${esc(a.title)}</b><span class="mu sm">${ep ? `Episode ${ep}${e?.title && !/^episode\s*\d+$/i.test(e.title) ? " · " + esc(e.title) : ""}` : "Trailer resmi"}</span></div></div>
  <div class="ap-acts">
    <button class="pill-btn" data-p="prev" ${ep > 1 ? "" : "disabled"}>${icon("back", 16, 2)}Sebelumnya</button>
    <button class="pill-btn" data-p="next" ${ep && (!a.eps || ep < a.eps) && (!n || ep < n) ? "" : "disabled"}>Berikutnya${icon("next", 16, 2)}</button>
    ${a.trailer ? `<button class="pill-btn" data-p="trailer">${icon("tv", 16, 2)}Trailer</button>` : ""}
    <button class="pill-btn" data-p="info">${icon("info", 16, 2)}Info</button></div>
  ${a.synopsis ? `<p class="ap-syn">${esc(a.synopsis.slice(0, 360))}${a.synopsis.length > 360 ? "…" : ""}</p>` : ""}
  ${n ? `<div class="sec-h"><h2>Daftar episode</h2><span class="mu sm">${n} episode</span></div><div class="ep-grid">${Array.from({ length: n }, (_, i) => `<button class="ep-b${i + 1 === ep ? " on" : ""}" data-p="ep" data-v="${i + 1}">${i + 1}</button>`).join("")}</div>` : ""}
  <div style="height:calc(40px + env(safe-area-inset-bottom))"></div>`;
    requestAnimationFrame(() => $(".ap-info .ep-b.on", root)?.scrollIntoView({ block: "nearest", inline: "center" }));
  }
  async function go(n) {
    ep = n; info();
    if (!n) { load(cur.trailer ? { kind: "yt", id: cur.trailer } : null, cur.cover); return; }
    saveHist(cur, n);
    load(null, cur.cover); $(".ap-empty b", root) && ($(".ap-empty b", root).textContent = "Memuat video…");
    let src = null; try { src = await episodeSource(cur, n); } catch {}
    if (cur && ep === n) load(src, cur.cover);
  }

  /* ----- buka / kecilkan / tutup (animasi FLIP: video berpindah halus antara penuh ↔ melayang) ----- */
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function flip(to) {
    const v = media(), sh = $(".ap-sheet", root);
    const a = v.getBoundingClientRect();
    sh.style.transform = ""; sh.style.transition = ""; v.style.transform = ""; root.style.removeProperty("--p");
    setState(to);
    if (reduce()) return;
    const b = v.getBoundingClientRect();
    const sx = a.width / b.width, sy = a.height / b.height;
    v.animate([{ transformOrigin: "0 0", transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${sx}, ${sy})` }, { transformOrigin: "0 0", transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
    if (to === "full") { $(".ap-body", root).animate([{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "ease-out" }); $(".ap-dim", root).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); }
    else $(".ap-mt", root).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120, fill: "backwards" });
  }
  function open(a, n = 1, eps = []) {
    if (!root) build();
    const same = cur && cur.id === a.id && ep === n && st !== "closed";
    cur = a; list = eps || [];
    if (st === "closed") { root.hidden = false; setState("full"); if (!reduce()) $(".ap-sheet", root).animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" }); }
    else if (st === "mini") flip("full");
    if (!same) go(n);
  }
  function minimize() { if (st === "full") { exitFs(); flip("mini"); } }
  function close() {
    if (st === "closed") return;
    exitFs();
    const sh = $(".ap-sheet", root);
    const end = () => { stopMedia(); root.hidden = true; setState("closed"); sh.style.transform = ""; sh.style.opacity = ""; };
    if (reduce()) return end();
    sh.animate([{ transform: sh.style.transform || "none", opacity: 1 }, { transform: (sh.style.transform || "") + (st === "mini" ? " translateY(120%)" : " translateY(100%)"), opacity: st === "mini" ? 0 : 1 }], { duration: 240, easing: "ease-in" }).onfinish = end;
  }
  // tombol kembali HP (dipanggil dari main.js): pemutar penuh → kecilkan dulu, tidak meninggalkan halaman
  const onBack = () => { if (fs) { exitFs(); return true; } if (st === "full") { minimize(); return true; } return false; };

  /* ----- layar penuh (miring) ----- */
  let fs = false;
  async function enterFs() {
    const v = $(".ap-vid", root); fs = true; document.body.classList.add("ap-fs"); root.classList.add("fs");
    try { await (v.requestFullscreen?.() || v.webkitRequestFullscreen?.()); } catch {}
    try { await screen.orientation?.lock?.("landscape"); } catch {}
    setFullscreen(true).catch?.(() => {});
  }
  function exitFs() {
    if (!fs) return; fs = false; document.body.classList.remove("ap-fs"); root?.classList.remove("fs");
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    try { screen.orientation?.unlock?.(); } catch {}
    setFullscreen(false, false)?.catch?.(() => {});
  }
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && fs) exitFs(); });

  function onClick(e) {
    const b = e.target.closest("[data-p]");
    if (st === "mini" && !b) { flip("full"); return; }
    if (!b) return;
    const p = b.dataset.p;
    if (p === "min") minimize();
    else if (p === "close") close();
    else if (p === "pp") toggle();
    else if (p === "fs") fs ? exitFs() : enterFs();
    else if (p === "prev" && ep > 1) go(ep - 1);
    else if (p === "next") go(ep + 1);
    else if (p === "ep") go(Number(b.dataset.v));
    else if (p === "trailer") go(0);
    else if (p === "info") { minimize(); location.hash = aHref(cur.id); }
  }

  /* ----- geser: penuh → bawah (kecilkan), melayang → atas (buka) / samping (tutup) ----- */
  function bindDrag() {
    const sh = $(".ap-sheet", root), body = $(".ap-body", root);
    let y0 = 0, x0 = 0, dy = 0, dx = 0, t0 = 0, on = false, axis = "";
    const H = () => window.innerHeight;
    sh.addEventListener("touchstart", (e) => {
      if (fs || e.touches.length > 1) return;
      const inBody = body.contains(e.target);
      if (st === "full" && inBody && body.scrollTop > 0) return;
      if (e.target.closest("iframe, video")) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = dx = 0; t0 = Date.now(); on = true; axis = "";
    }, { passive: true });
    sh.addEventListener("touchmove", (e) => {
      if (!on) return;
      dy = e.touches[0].clientY - y0; dx = e.touches[0].clientX - x0;
      if (!axis) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; axis = Math.abs(dy) >= Math.abs(dx) ? "y" : "x"; }
      if (st === "full") {
        if (axis !== "y" || dy < 0) { if (dy < 0) on = false; return; }
        if (e.cancelable) e.preventDefault();
        const p = Math.min(1, dy / (H() * 0.55));
        sh.style.transition = "none"; sh.style.transform = `translateY(${dy}px)`;
        root.style.setProperty("--p", p.toFixed(3));
      } else if (st === "mini") {
        if (e.cancelable) e.preventDefault();
        sh.style.transition = "none";
        if (axis === "x") { sh.style.transform = `translateX(${dx}px)`; sh.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 260)); }
        else if (dy < 0) sh.style.transform = `translateY(${Math.max(dy, -140) * 0.6}px)`;
      }
    }, { passive: false });
    const end = () => {
      if (!on) return; on = false;
      const v = (Date.now() - t0) || 1, vel = dy / v;
      sh.style.transition = "";
      if (st === "full") {
        if (axis === "y" && (dy > 110 || (vel > 0.6 && dy > 30))) minimize();
        else { sh.animate([{ transform: sh.style.transform }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }); sh.style.transform = ""; root.style.removeProperty("--p"); }
      } else if (st === "mini") {
        if (axis === "x" && Math.abs(dx) > 90) { sh.style.opacity = ""; close(); return; }
        if (axis === "y" && dy < -40) { sh.style.transform = ""; flip("full"); return; }
        sh.animate([{ transform: sh.style.transform, opacity: sh.style.opacity || 1 }, { transform: "none", opacity: 1 }], { duration: 200, easing: "ease-out" });
        sh.style.transform = ""; sh.style.opacity = "";
      }
    };
    sh.addEventListener("touchend", end); sh.addEventListener("touchcancel", end);
  }
  return { open, close, minimize, onBack, state: () => st };
})();

/* =====================================================================
   Panel developer: buat & kelola keypass
   ===================================================================== */
export async function vKeypassAdmin(view, x) {
  view.innerHTML = x.topbar("Keypass &amp; bot") + `<div class="px col g14 mt6">
  <div class="card col g10"><b>Buat keypass baru</b><span class="mu sm lh">Satu keypass untuk satu akun. Kirim ke pengguna lewat WhatsApp; setelah dipakai, keypass terikat ke akun itu.</span>
    <div class="row g8"><input class="kp-in" id="kpNote" maxlength="80" placeholder="Catatan (mis. nama pembeli)"><input class="kp-in kp-n" id="kpCount" type="number" min="1" max="50" value="1" aria-label="Jumlah"></div>
    <button class="btn primary" data-act="make">${icon("key", 18, 2)}Buat keypass</button><div id="kpNew"></div></div>
  <div class="card col g10"><b>Kunci bot WhatsApp</b><span class="mu sm lh">Bot memakai kunci ini untuk membuat keypass otomatis (perintah <code>${BOT_CMD} email</code>). Kunci hanya tampil sekali; simpan di pengaturan bot. Panduan: docs/bot-keypass.md di repo</span>
    <div class="row g8"><input class="kp-in" id="bkLabel" maxlength="60" placeholder="Nama bot (mis. Bot Termux)"><button class="btn ghost sm" data-act="mkBot">Buat kunci</button></div>
    <div id="bkNew"></div><div id="bkList"></div></div>
  <div class="sec-h"><h2>Daftar keypass</h2><button class="sq-btn" data-act="reload" aria-label="Muat ulang">${icon("refresh", 18, 2)}</button></div>
  <div id="kpList">${x.loading(3, "sk-lrow")}</div></div><div class="pad-nav"></div>`;
  const loadList = async () => {
    try {
      const rows = (await api.rpc("dev_keypass_list", { p_limit: 200 })) || [];
      $("#kpList").innerHTML = rows.length ? `<div class="group">${rows.map((r) => `<div class="mrow kp-li${r.revoked ? " rev" : ""}"><span class="rc-mid"><code>${esc(r.code)}</code><span class="mu xs">${r.redeemed_at ? `Dipakai ${esc(r.name || "")} · ${esc(r.email || "")}` : r.reserved_email ? `Untuk ${esc(r.reserved_email)} · belum dipakai` : "Belum dipakai"}${r.wa ? " · WA " + esc(r.wa) : ""}${r.note && !/^bot:/.test(r.note) ? " · " + esc(r.note) : r.note ? " · dari bot" : ""}${r.revoked ? " · DICABUT" : ""}</span></span>
        <button class="sq-btn" data-act="cp" data-v="${esc(r.code)}" aria-label="Salin">${icon("copy", 16, 2)}</button><button class="sq-btn" data-act="rev" data-v="${esc(r.code)}" data-r="${r.revoked ? 0 : 1}" aria-label="${r.revoked ? "Pulihkan" : "Cabut"}">${icon(r.revoked ? "restore" : "ban", 16, 2)}</button></div>`).join("")}</div>` : `<div class="empty"><b>Belum ada keypass</b></div>`;
    } catch (e) { $("#kpList").innerHTML = `<div class="empty"><b>${esc(e.message)}</b><span class="mu sm">Pastikan supabase/schema.sql sudah dijalankan.</span></div>`; }
  };
  const loadBots = async () => {
    try {
      const rows = (await api.rpc("dev_bot_keys")) || [];
      $("#bkList").innerHTML = rows.length ? `<div class="group">${rows.map((r) => `<div class="mrow kp-li${r.revoked ? " rev" : ""}"><span class="rc-mid"><b>${esc(r.label || "Bot")}</b><span class="mu xs">Dibuat ${esc(fmtDate(r.created_at))}${r.last_used_at ? " · terakhir dipakai " + esc(fmtDate(r.last_used_at)) : " · belum dipakai"}${r.revoked ? " · DICABUT" : ""}</span></span>${r.revoked ? "" : `<button class="sq-btn" data-act="rvBot" data-v="${r.id}" aria-label="Cabut kunci bot">${icon("ban", 16, 2)}</button>`}</div>`).join("")}</div>` : "";
    } catch {}
  };
  x.setActs({
    back: () => x.back("#/akun"), reload: () => { loadList(); loadBots(); },
    mkBot: async (el) => {
      el.disabled = true;
      try {
        const k = await api.rpc("dev_make_bot_key", { p_label: $("#bkLabel").value });
        $("#bkNew").innerHTML = `<div class="kp-new"><code class="bk-code">${esc(k)}</code><span class="mu xs">Salin sekarang. Kunci ini tidak bisa dilihat lagi.</span><button class="btn ghost" data-act="cpBot">${icon("copy", 16, 2)}Salin kunci bot</button></div>`;
        $("#bkNew").dataset.k = k; loadBots();
      } catch (e) { toast(e.message); }
      el.disabled = false;
    },
    cpBot: async () => { try { await navigator.clipboard.writeText($("#bkNew").dataset.k || ""); toast("Kunci bot disalin"); } catch { toast("Tidak bisa menyalin otomatis"); } },
    rvBot: async (el) => { try { await api.rpc("dev_revoke_bot_key", { p_id: Number(el.dataset.v) }); toast("Kunci bot dicabut"); loadBots(); } catch (e) { toast(e.message); } },
    make: async (el) => {
      el.disabled = true;
      try {
        const codes = (await api.rpc("dev_make_keypass", { p_count: Number($("#kpCount").value) || 1, p_note: $("#kpNote").value })) || [];
        $("#kpNew").innerHTML = `<div class="kp-new">${codes.map((c) => `<code>${esc(c)}</code>`).join("")}<button class="btn ghost" data-act="cpAll">${icon("copy", 16, 2)}Salin semua</button></div>`;
        $("#kpNew").dataset.codes = codes.join("\n");
        loadList();
      } catch (e) { toast(e.message); }
      el.disabled = false;
    },
    cpAll: async () => { try { await navigator.clipboard.writeText($("#kpNew").dataset.codes || ""); toast("Keypass disalin"); } catch { toast("Tidak bisa menyalin otomatis"); } },
    cp: async (el) => { try { await navigator.clipboard.writeText(el.dataset.v); toast("Disalin"); } catch { toast("Tidak bisa menyalin otomatis"); } },
    rev: async (el) => { try { await api.rpc("dev_revoke_keypass", { p_code: el.dataset.v, p_revoked: el.dataset.r === "1" }); toast(el.dataset.r === "1" ? "Keypass dicabut" : "Keypass dipulihkan"); loadList(); } catch (e) { toast(e.message); } },
  });
  await Promise.all([loadList(), loadBots()]);
}
