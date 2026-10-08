/* ============================================================
   lernfunke – Shop-Konfiguration
   ------------------------------------------------------------
   Produkte hier pflegen. Für echte Bezahlung pro Produkt einen
   Bezahllink eintragen (z. B. Stripe Payment Link, Lemon Squeezy,
   Digistore24, Gumroad, PayPal.me …) in `checkoutUrl`.
   Ohne Link läuft der Shop im Demo-Modus (Hinweis statt Kauf).
   ============================================================ */
const CONFIG = {
  currency: "EUR",
  // Optional: ein Link, der den ganzen Warenkorb abwickelt (z. B. Shop-System).
  // Leer lassen, wenn pro Produkt einzeln bezahlt wird.
  cartCheckoutUrl: "",
};

const CATEGORIES = [
  { id: "all", label: "Alle" },
  { id: "ausmalbilder", label: "Ausmalbilder" },
  { id: "buecher", label: "Kinderbücher" },
  { id: "lernen", label: "Lernmaterial" },
  { id: "bundles", label: "Bundles" },
];

const PRODUCTS = [
  { id: "tiere", cat: "ausmalbilder", title: "Ausmalbilder Tierwelt", desc: "30 liebevolle Motive von Fuchs bis Elefant – ideal für kleine Künstler ab 3 Jahren.", price: 4.9, pages: "30 Seiten", emoji: "🦊", color: "#eab76a", checkoutUrl: "" },
  { id: "dinos", cat: "ausmalbilder", title: "Ausmalbilder Dinos", desc: "Brüllend gute Dino-Motive zum Ausmalen und Entdecken.", price: 4.9, pages: "25 Seiten", emoji: "🦕", color: "#8a8f72", checkoutUrl: "" },
  { id: "weltraum", cat: "ausmalbilder", title: "Ausmalbilder Weltraum", desc: "Raketen, Planeten und freundliche Sterne für Nachwuchs-Astronauten.", price: 4.9, pages: "28 Seiten", emoji: "🚀", color: "#d4875a", badge: "Neu", checkoutUrl: "" },
  { id: "monsterich-dunkel", cat: "buecher", title: "Monsterich hat Angst im Dunkeln", desc: "Das kleine Grasmonster entdeckt, dass ein bisschen Angst dazugehört – und dass Mut zu zweit leichter ist.", price: 7.9, pages: "34 Seiten · Bilderbuch", image: "assets/monsterich-dunkel.jpg", color: "#2f3b66", badge: "Bestseller", checkoutUrl: "" },
  { id: "monsterich-bauch", cat: "buecher", title: "Monsterich und das Grummeln im Bauch", desc: "Monsterich und sein Freund Pusti gehen einem lauten Grummeln auf den Grund.", price: 7.9, pages: "34 Seiten · Bilderbuch", image: "assets/monsterich-bauch.jpg", color: "#8a8f72", checkoutUrl: "" },
  { id: "buchstaben", cat: "lernen", title: "Buchstaben-Übungsblätter", desc: "Schwungübungen und Buchstaben spielerisch lernen – Vorschule und 1. Klasse.", price: 5.9, pages: "40 Seiten", emoji: "✏️", color: "#d4875a", checkoutUrl: "" },
  { id: "zahlen", cat: "lernen", title: "Zahlen-Rätselheft", desc: "Zählen, Zuordnen und Knobeln mit Zahlen von 1 bis 20.", price: 5.9, pages: "32 Seiten", emoji: "🔢", color: "#eab76a", checkoutUrl: "" },
  { id: "bundle", cat: "bundles", title: "Funken-Bundle", desc: "Alle Ausmalbilder-Sets und beide Kinderbücher zum Vorteilspreis.", price: 24.9, oldPrice: 38.2, pages: "6 Produkte", emoji: "🎁", color: "#8a8f72", badge: "Spare 35 %", checkoutUrl: "" },
];

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: CONFIG.currency }).format(n);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============================================================
   Morphende Blobs: Punkte auf einem Kreis, deren Radius sich
   über Sinuswellen verändert; verbunden über glatte Kurven.
   ============================================================ */
const blobs = [];
const N = 8;

function registerBlobs(root = document) {
  $$("[data-blob]:not([data-ready])", root).forEach((el) => {
    el.dataset.ready = "1";
    blobs.push({
      el,
      seed: +el.dataset.seed || 1,
      cx: +el.dataset.cx, cy: +el.dataset.cy, r: +el.dataset.r,
      amp: +el.dataset.amp || 0.14,
      stretch: +el.dataset.stretch || 1,
    });
  });
  drawBlobs(0);
}

function blobPath(b, t) {
  const pts = [];
  const f = b.r < 5 ? 4 : 1;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const p = b.seed * 1.7 + i * 1.3;
    const wob = Math.sin(t * 0.8 + p) * 0.6 + Math.sin(t * 1.3 + p * 1.9) * 0.4;
    const rad = b.r * (1 + b.amp * wob);
    pts.push([b.cx + Math.cos(a) * rad * b.stretch, b.cy + Math.sin(a) * rad]);
  }
  // Catmull-Rom → kubische Bézier (geschlossen)
  let d = `M${pts[0][0].toFixed(f)},${pts[0][1].toFixed(f)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(f)},${c1[1].toFixed(f)} ${c2[0].toFixed(f)},${c2[1].toFixed(f)} ${p2[0].toFixed(f)},${p2[1].toFixed(f)}`;
  }
  return d + "Z";
}

let scrollBoost = 0;
function drawBlobs(t) {
  const tt = t + scrollBoost;
  for (const b of blobs) b.el.setAttribute("d", blobPath(b, tt));
}
function loop(ms) {
  drawBlobs(ms / 1000);
  requestAnimationFrame(loop);
}
addEventListener("scroll", () => { scrollBoost = scrollY * 0.004; }, { passive: true });

/* ============================================================
   Shop
   ============================================================ */
let activeCat = "all";

function renderFilters() {
  $("#filters").innerHTML = CATEGORIES.map(
    (c) => `<button class="chip ${c.id === activeCat ? "active" : ""}" role="tab" aria-selected="${c.id === activeCat}" data-cat="${c.id}">${c.label}</button>`
  ).join("");
}

function renderGrid() {
  const list = PRODUCTS.filter((p) => activeCat === "all" || p.cat === activeCat);
  $("#grid").innerHTML = list.map((p, i) => {
    const catLabel = CATEGORIES.find((c) => c.id === p.cat).label;
    return `
    <article class="card" style="animation-delay:${i * 60}ms">
      <div class="cover ${p.image ? "has-img" : ""}" style="background:${p.color}22">
        <span class="tag">${catLabel}</span>
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
        ${p.image ? `<img src="${p.image}" alt="Cover: ${p.title}" loading="lazy">` : `<svg viewBox="0 0 300 300" aria-hidden="true">
          <path data-blob data-seed="${(i % 9) + 1}" data-cx="150" data-cy="150" data-r="95" data-amp=".2" fill="${p.color}" opacity=".35"/>
          <path data-blob data-seed="${(i % 9) + 4}" data-cx="150" data-cy="150" data-r="72" data-amp=".24" fill="${p.color}"/>
        </svg>
        <span class="emoji" aria-hidden="true">${p.emoji}</span>`}
      </div>
      <div class="card-body">
        <h3>${p.title}</h3>
        <p>${p.desc}</p>
        <div class="meta">${p.pages} · PDF-Download</div>
        <div class="buy">
          <span class="price">${fmt(p.price)}${p.oldPrice ? ` <s style="font-size:.8rem;color:var(--ink-soft)">${fmt(p.oldPrice)}</s>` : ""}</span>
          <button class="add" data-add="${p.id}" aria-label="${p.title} in den Warenkorb">In den Korb</button>
        </div>
      </div>
    </article>`;
  }).join("");
  registerBlobs($("#grid"));
}

/* ---------- Warenkorb ---------- */
let cart = [];
try { cart = JSON.parse(localStorage.getItem("lernfunke-cart") || "[]").filter((id) => PRODUCTS.some((p) => p.id === id)); } catch (e) { cart = []; }

const save = () => { try { localStorage.setItem("lernfunke-cart", JSON.stringify(cart)); } catch (e) {} };

function renderCart() {
  const items = cart.map((id) => PRODUCTS.find((p) => p.id === id));
  $("#cartCount").textContent = items.length;
  $("#cartCount").style.display = items.length ? "grid" : "none";
  $("#cartTotal").textContent = fmt(items.reduce((s, p) => s + p.price, 0));
  $("#checkout").disabled = !items.length;
  $("#cartItems").innerHTML = items.length
    ? items.map((p) => `
      <li class="ci">
        <div class="ci-ico" style="background:${p.color}33">${p.image ? `<img src="${p.image}" alt="">` : p.emoji}</div>
        <div><b>${p.title}</b><small>${p.pages} · PDF</small></div>
        <div class="ci-right"><div>${fmt(p.price)}</div><button class="ci-rm" data-rm="${p.id}">Entfernen</button></div>
      </li>`).join("")
    : `<li class="cart-empty"><span>🛒</span>Dein Warenkorb ist noch leer.<br>Zeit für einen Funken Inspiration!</li>`;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

function openCart(open) {
  $("#drawer").classList.toggle("open", open);
  $("#overlay").classList.toggle("show", open);
  $("#drawer").setAttribute("aria-hidden", String(!open));
  document.body.style.overflow = open ? "hidden" : "";
}

function addToCart(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (cart.includes(id)) return toast("Schon im Warenkorb – digitale Produkte brauchst du nur einmal 😊");
  cart.push(id);
  save(); renderCart();
  toast(`„${p.title}“ liegt im Warenkorb ✨`);
  const b = $("#cartOpen");
  b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
}

function showModal(title, text) {
  $("#modalTitle").textContent = title;
  $("#modalText").textContent = text;
  $("#modal").hidden = false;
}

function checkout() {
  const items = cart.map((id) => PRODUCTS.find((p) => p.id === id));
  if (!items.length) return;
  if (CONFIG.cartCheckoutUrl) { location.href = CONFIG.cartCheckoutUrl; return; }
  if (items.length === 1 && items[0].checkoutUrl) { location.href = items[0].checkoutUrl; return; }
  if (items.length > 1 && items.every((p) => p.checkoutUrl)) {
    // Ohne Warenkorb-Anbindung: jedes Produkt hat einen eigenen Bezahllink.
    showModal("Fast geschafft!", "Du wirst nacheinander zu den Bezahlseiten deiner Produkte geleitet. Starte mit dem ersten:");
    $("#modalClose").onclick = () => { $("#modal").hidden = true; location.href = items[0].checkoutUrl; };
    return;
  }
  showModal("Demo-Modus", "Die Bezahlung ist noch nicht angebunden. Trage in script.js bei den Produkten einen Bezahllink (z. B. Stripe Payment Link) ein, dann führt „Zur Kasse“ direkt zum echten Checkout.");
}

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  const t = e.target;
  const cat = t.closest("[data-cat]");
  if (cat) { activeCat = cat.dataset.cat; renderFilters(); renderGrid(); return; }
  const add = t.closest("[data-add]");
  if (add) return addToCart(add.dataset.add);
  const rm = t.closest("[data-rm]");
  if (rm) { cart = cart.filter((id) => id !== rm.dataset.rm); save(); renderCart(); return; }
  const legal = t.closest("[data-legal]");
  if (legal) { e.preventDefault(); showModal(legal.dataset.legal, "Hier gehört dein rechtlich geprüfter Text hin (Pflicht für Online-Shops in Deutschland)."); $("#modalClose").onclick = () => { $("#modal").hidden = true; }; return; }
  if (t.closest("#links a")) { $("#links").classList.remove("open"); $("#burger").setAttribute("aria-expanded", "false"); }
});
$("#modalClose").onclick = () => { $("#modal").hidden = true; };
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").hidden = true; });
$("#cartOpen").onclick = () => openCart(true);
$("#cartClose").onclick = () => openCart(false);
$("#overlay").onclick = () => openCart(false);
$("#checkout").onclick = checkout;
addEventListener("keydown", (e) => { if (e.key === "Escape") { openCart(false); $("#modal").hidden = true; } });
$("#burger").onclick = () => {
  const open = $("#links").classList.toggle("open");
  $("#burger").setAttribute("aria-expanded", String(open));
};
$("#nlForm").addEventListener("submit", (e) => {
  e.preventDefault();
  e.target.reset();
  toast("Danke! Bitte Newsletter-Dienst anbinden 💌");
});
addEventListener("scroll", () => $("#nav").classList.toggle("scrolled", scrollY > 10), { passive: true });
$("#year").textContent = new Date().getFullYear();

/* Scroll-Reveal */
const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
}, { threshold: 0.12 });
$$(".reveal").forEach((el) => io.observe(el));

/* Init */
renderFilters();
renderGrid();
renderCart();
registerBlobs();
if (!reduceMotion) requestAnimationFrame(loop);

/* ============================================================
   Monsterich wandert beim Scrollen: pro Abschnitt eine Station
   (Position, Größe, Neigung, Blickrichtung). Dazwischen wird
   weich überblendet, mit etwas Trägheit.
   ============================================================ */
(function monsterich() {
  const el = $("#mon");
  if (!el) return;
  const BASE_H = 400;
  let stops = [];
  let cur = null;

  const mid = (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + scrollY + r.height / 2, w: r.width, h: r.height, top: r.top + scrollY }; };

  function build() {
    const vw = innerWidth, vh = innerHeight, small = vw < 860;
    const maxS = Math.max(0, document.documentElement.scrollHeight - vh);
    const list = [];
    const add = (s, x, y, h, rot, flip) => list.push({ s: Math.min(Math.max(0, s), maxS), x, y, h, rot, flip });

    const hero = mid($(".hero-art"));
    add(0, hero.x, Math.min(hero.y, vh * 0.85), Math.min(hero.w * 0.86, vh * 0.72), 0, 1);

    const shop = mid($("#shop"));
    add(shop.top - vh * 0.25, small ? vw * 0.86 : vw * 0.06, vh * (small ? 0.84 : 0.76), small ? 100 : 190, 8, 1);

    const steps = mid($("#so-gehts"));
    add(steps.y - vh * 0.5, small ? vw * 0.13 : vw * 0.91, vh * (small ? 0.84 : 0.88), small ? 100 : 190, -6, -1);

    const about = mid($(".about-art"));
    add(about.y - vh * 0.5, about.x, vh * 0.5 + about.h * 0.04, about.w * (small ? 0.78 : 0.82), 0, 1);

    const faq = mid($("#faq"));
    add(faq.y - vh * 0.5, small ? vw * 0.97 : vw * 0.985, vh * (small ? 0.82 : 0.6), small ? 120 : 250, -16, -1);

    const nl = mid($(".newsletter"));
    add(nl.y - vh * 0.45, small ? vw * 0.84 : vw * 0.17, vh * (small ? 0.84 : 0.52), small ? 110 : 270, 4, 1);

    add(maxS, vw * 0.9, vh - (small ? 120 : 80), small ? 80 : 130, 0, 1);

    stops = list.reduce((acc, p) => { if (!acc.length || p.s > acc[acc.length - 1].s + 1) acc.push(p); return acc; }, []);
  }

  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  function target(S) {
    if (S <= stops[0].s) return stops[0];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (S <= b.s) {
        const t = smooth(Math.min(1, Math.max(0, ((S - a.s) / (b.s - a.s) - 0.18) / 0.64)));
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerp(a.h, b.h, t), rot: lerp(a.rot, b.rot, t), flip: lerp(a.flip, b.flip, t) };
      }
    }
    return stops[stops.length - 1];
  }

  function frame() {
    const t = target(scrollY);
    if (!cur) { cur = { ...t }; el.classList.add("ready"); }
    const k = reduceMotion ? 1 : 0.13;
    for (const key of ["x", "y", "h", "rot", "flip"]) cur[key] = lerp(cur[key], t[key], k);
    const lean = reduceMotion ? 0 : Math.max(-10, Math.min(10, (t.x - cur.x) * 0.05));
    const sc = cur.h / BASE_H;
    el.style.transform = `translate3d(${cur.x - 180}px, ${cur.y - BASE_H / 2}px, 0) rotate(${cur.rot + lean}deg) scale(${cur.flip * sc}, ${sc})`;
    requestAnimationFrame(frame);
  }

  let timer;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(build, 120); };
  build();
  addEventListener("resize", rebuild);
  addEventListener("load", build);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  if ("ResizeObserver" in window) new ResizeObserver(rebuild).observe(document.body);
  requestAnimationFrame(frame);
})();
