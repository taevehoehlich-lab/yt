/* ============================================================
   lernfunke – Produkte
   Für echte Bezahlung bei jedem Produkt `checkoutUrl` eintragen
   (z. B. Stripe Payment Link, Lemon Squeezy, Gumroad, Digistore24).
   Ohne Link zeigt „Kaufen“ einen Hinweis (Demo-Modus).
   Die Preise sind Platzhalter.
   ============================================================ */
const PRODUCTS = [
  {
    id: "dunkel",
    title: "Monsterich hat Angst im Dunkeln",
    text: "Eine liebevolle Gute-Nacht-Geschichte über Angst, Mut und Freundschaft.",
    cover: "assets/cover-dunkel.jpg",
    alt: "Buchcover: Monsterich hat Angst im Dunkeln",
    facts: ["Ab 3 Jahren", "34 Seiten", "PDF"],
    price: 7.9,
    checkoutUrl: "",
  },
  {
    id: "bauch",
    title: "Monsterich und das Grummeln im Bauch",
    text: "Eine liebevolle Geschichte über Wut, Durchatmen und Freundschaft. Mit Wolkenatmung zum Mitmachen.",
    cover: "assets/cover-bauch.jpg",
    alt: "Buchcover: Monsterich und das Grummeln im Bauch",
    facts: ["Ab 3 Jahren", "34 Seiten", "PDF"],
    price: 7.9,
    checkoutUrl: "",
  },
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Shop ---------- */
$("#books").innerHTML =
  PRODUCTS.map((p) => `
    <article class="book fade">
      <div class="cover"><img src="${p.cover}" alt="${p.alt}" width="827" height="827" loading="lazy"></div>
      <h3>${p.title}</h3>
      <p>${p.text}</p>
      <ul class="chips">${p.facts.map((f) => `<li>${f}</li>`).join("")}</ul>
      <div class="buy">
        <span class="price">${fmt(p.price)}</span>
        <button class="btn" type="button" data-buy="${p.id}">Kaufen</button>
      </div>
    </article>`).join("") + `
    <article class="book book-soon fade">
      <h3>Bald mehr</h3>
      <p>Ausmalbilder, Lernmaterial und weitere Geschichten sind in Arbeit. Trag dich ein, dann erfährst du als Erste:r davon.</p>
      <form id="nlForm">
        <input type="email" id="nlMail" required placeholder="Deine E-Mail-Adresse" aria-label="E-Mail-Adresse" autocomplete="email">
        <button class="btn btn-ghost" type="submit">Benachrichtigen</button>
      </form>
    </article>`;

/* ---------- Dialoge ---------- */
function showModal(title, text, onClose) {
  $("#modalTitle").textContent = title;
  $("#modalText").textContent = text;
  $("#modal").hidden = false;
  $("#modalClose").focus();
  $("#modalClose").onclick = () => { $("#modal").hidden = true; if (onClose) onClose(); };
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2800);
}

document.addEventListener("click", (e) => {
  const buy = e.target.closest("[data-buy]");
  if (buy) {
    const p = PRODUCTS.find((x) => x.id === buy.dataset.buy);
    if (p.checkoutUrl) { location.href = p.checkoutUrl; return; }
    showModal("Demo-Modus", `„${p.title}“ kann noch nicht gekauft werden. Sobald ein Bezahllink (z. B. Stripe) bei diesem Produkt in script.js eingetragen ist, führt „Kaufen“ direkt zur Kasse.`);
    return;
  }
  const legal = e.target.closest("[data-legal]");
  if (legal) {
    e.preventDefault();
    showModal(legal.dataset.legal, "Hier kommt dein rechtlich geprüfter Text hin. Für Online-Shops in Deutschland ist das Pflicht.");
  }
});
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").hidden = true; });
addEventListener("keydown", (e) => { if (e.key === "Escape") $("#modal").hidden = true; });
$("#nlForm").addEventListener("submit", (e) => {
  e.preventDefault();
  e.target.reset();
  toast("Danke! Die Anmeldung ist noch nicht an einen Newsletter-Dienst angebunden.");
});
$("#year").textContent = new Date().getFullYear();

/* ---------- Einblenden beim Scrollen ---------- */
document.documentElement.classList.add("js");
$$("section .head, .intro > *, .gallery img, .parents > *, .steps li, .faq details").forEach((el) => el.classList.add("fade"));
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  $$(".fade").forEach((el) => io.observe(el));
} else {
  $$(".fade").forEach((el) => el.classList.add("in"));
}

/* ============================================================
   Weich morphende Formen: Punkte auf einem Kreis, deren Radius
   sich über Sinuswellen verändert, verbunden über glatte Kurven.
   ============================================================ */
const blobs = $$("[data-blob]").map((el) => ({
  el, seed: +el.dataset.seed, cx: +el.dataset.cx, cy: +el.dataset.cy, r: +el.dataset.r, amp: +el.dataset.amp || 0.12,
}));
const N = 8;
function blobPath(b, t) {
  const f = b.r < 5 ? 4 : 1;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, p = b.seed * 1.7 + i * 1.3;
    const wob = Math.sin(t * 0.7 + p) * 0.6 + Math.sin(t * 1.1 + p * 1.9) * 0.4;
    const rad = b.r * (1 + b.amp * wob);
    pts.push([b.cx + Math.cos(a) * rad, b.cy + Math.sin(a) * rad]);
  }
  let d = `M${pts[0][0].toFixed(f)},${pts[0][1].toFixed(f)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(f)},${c1[1].toFixed(f)} ${c2[0].toFixed(f)},${c2[1].toFixed(f)} ${p2[0].toFixed(f)},${p2[1].toFixed(f)}`;
  }
  return d + "Z";
}
const draw = (t) => blobs.forEach((b) => b.el.setAttribute("d", blobPath(b, t)));
draw(0);
if (!reduceMotion) {
  const loop = (ms) => { draw(ms / 1000); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
