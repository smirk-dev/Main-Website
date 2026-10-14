// Builds the archive pages (public/archive/<key>.html + index.html) from content/works.json, the one place the work lives.
// A category with no entries gets no page, and the forest gives its place no prompt (main.ts reads the same file).
// Run: node tools/build_archive.mjs   (also runs before `npm run build`)
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { categories } = JSON.parse(readFileSync(root + "content/works.json", "utf8"));
const credits = JSON.parse(readFileSync(root + "content/credits.json", "utf8"));   // tools/build_credits.py
const out = root + "public/archive/";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const host = (u) => new URL(u).host + (new URL(u).pathname === "/" ? "" : new URL(u).pathname);
const BADGE = { live: "Live", archived: "Archived", reference: "Reference" };
const PLURAL = { live: "live", archived: "archived", reference: "references" };

const HEAD = (title) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Suryansh Mishra</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500&display=swap">`;

const STYLE = `<style>
  :root {
    --ink: #0b0c0d; --ink-2: #121416; --line: #23272a; --text: #d9d6cf; --dim: #8d8a83; --faint: #5d5b56;
    --live: #9fc79a; --archived: #d6b47c; --reference: #9fb4c9; --accent: #e8d9b8;
    --serif: "Cormorant Garamond", "Iowan Old Style", Georgia, serif; --sans: Inter, system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html { background: var(--ink); color: var(--text); font: 16px/1.6 var(--sans); -webkit-font-smoothing: antialiased; }
  body { margin: 0; }
  a { color: inherit; }
  .skip { position: absolute; left: -999px; } .skip:focus { left: 16px; top: 16px; z-index: 9; background: var(--ink-2); padding: 8px 12px; }

  /* the clearing you came from, fading into the archive */
  .hero { position: relative; height: 72vh; min-height: 520px; overflow: hidden; }
  .hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 62%; filter: saturate(.8) brightness(.78); }
  .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(11,12,13,.15) 0%, rgba(11,12,13,.2) 40%, var(--ink) 98%); }
  .back { position: absolute; z-index: 2; top: 28px; left: 40px; font-size: 14px; letter-spacing: .02em; color: var(--text); text-decoration: none;
          padding: 8px 14px 8px 12px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(11,12,13,.35); backdrop-filter: blur(6px); }
  .back:hover, .back:focus-visible { border-color: rgba(255,255,255,.45); }
  .title { position: absolute; z-index: 2; left: 0; right: 0; bottom: 6vh; max-width: 1240px; margin: 0 auto; padding: 0 40px; }
  .kicker { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: var(--dim); }
  h1 { font: 400 clamp(56px, 7vw, 104px)/0.95 var(--serif); margin: 10px 0 18px; color: #f1ece2; letter-spacing: -.01em; }
  .lede { max-width: 620px; font: italic 400 23px/1.45 var(--serif); color: #c8c3b8; margin: 0; }

  main { max-width: 1240px; margin: 0 auto; padding: 40px 40px 120px; }
  .count { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--line); padding-bottom: 14px; margin-bottom: 8px;
           font-size: 13px; color: var(--faint); letter-spacing: .04em; }

  .entry { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 56px; align-items: center; padding: 64px 0; border-bottom: 1px solid var(--line); }
  .entry:nth-of-type(even) .preview { order: 2; }
  .preview { position: relative; aspect-ratio: 16 / 10; border-radius: 6px; overflow: hidden; background: var(--ink-2); border: 1px solid var(--line);
             box-shadow: 0 30px 60px -30px rgba(0,0,0,.8); }
  .preview img, .preview iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; object-fit: cover; object-position: top; display: block;
                                  transition: transform .6s cubic-bezier(.2,.7,.2,1); }
  .preview iframe { width: 1600px; height: 1000px; inset: auto; left: 0; top: 0; transform-origin: 0 0; object-fit: initial; transition: none; }
  .entry:hover .preview img { transform: scale(1.015); }
  .play { position: absolute; right: 14px; bottom: 14px; font: 500 13px var(--sans); color: #111; background: var(--accent); border: 0; border-radius: 999px;
          padding: 9px 16px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
  .play:hover, .play:focus-visible { background: #fff; }
  .num { font: 500 12px var(--sans); color: var(--faint); letter-spacing: .2em; font-variant-numeric: tabular-nums lining-nums; }
  h2 { font: 500 42px/1.05 var(--serif); margin: 6px 0 14px; color: #f1ece2; }
  .desc { margin: 0 0 26px; color: #bdb9b0; font-size: 16.5px; }
  dl { display: grid; grid-template-columns: 84px 1fr; gap: 8px 16px; margin: 0 0 28px; font-size: 14px; }
  dt { color: var(--faint); text-transform: uppercase; letter-spacing: .14em; font-size: 11px; padding-top: 3px; }
  dd { margin: 0; color: var(--text); }
  .row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .badge { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; padding: 4px 10px 4px 9px; border-radius: 999px; border: 1px solid currentColor; }
  .badge::before { content: "●"; font-size: 8px; margin-right: 7px; vertical-align: 2px; }
  .badge.live { color: var(--live); } .badge.archived { color: var(--archived); } .badge.reference { color: var(--reference); }
  .open { font-size: 15px; text-decoration: none; border-bottom: 1px solid rgba(232,217,184,.4); color: var(--accent); padding-bottom: 2px; }
  .open:hover, .open:focus-visible { border-color: var(--accent); }
  .note { font-size: 13px; color: var(--faint); }

  footer { max-width: 1240px; margin: 0 auto; padding: 0 40px 80px; display: flex; justify-content: space-between; color: var(--faint); font-size: 13px; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>`;

const SCRIPT = `<script>
  // inside the forest, "Back to the forest" closes this page and returns to the clearing; on its own it goes to the index
  document.querySelectorAll('.back, footer .open').forEach(a => a.addEventListener('click', e => {
    if (parent !== window) { e.preventDefault(); parent.postMessage('back-to-forest', '*'); }
  }));
  // Escape here, not only in the forest: once this page has the keyboard, the forest never hears the key
  addEventListener('keydown', e => { if (e.key === 'Escape' && parent !== window) parent.postMessage('back-to-forest', '*'); });
  // "Try it here": the live app loads only when asked, in place of its screenshot
  document.querySelectorAll('.play').forEach(b => b.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = b.dataset.src; f.title = b.closest('.entry').querySelector('h2').textContent + ' (live)';
    f.allow = 'camera; clipboard-write; fullscreen'; f.loading = 'eager';
    const p = b.parentElement; p.querySelector('img').replaceWith(f); b.remove(); fit(p); f.focus();
  }));
  // the app runs at desktop size (1600×1000) and is scaled to the frame, so it looks as it does full-screen
  function fit(p) { const f = p.querySelector('iframe'); if (f) f.style.transform = \`scale(\${p.clientWidth / 1600})\`; }
  addEventListener('resize', () => document.querySelectorAll('.preview').forEach(fit));
</script>`;

function countLine(c) {
  const by = {};
  for (const e of c.entries) by[e.status] = (by[e.status] ?? 0) + 1;
  const ks = Object.keys(by);
  const right = ks.length === 1 ? `All ${PLURAL[ks[0]]}` : ["live", "archived", "reference"].filter((k) => by[k]).map((k) => `${by[k]} ${k === "reference" ? (by[k] > 1 ? "references" : "reference") : k}`).join(" · ");
  const n = c.entries.length;
  return `<div class="count"><span>${n} ${n === 1 ? c.noun.replace(/s$/, "") : c.noun}</span><span>${right}</span></div>`;
}

function entry(e, i) {
  for (const f of ["name", "desc", "status", "shot", "shotAlt"]) if (!e[f]) throw new Error(`${e.name ?? "?"}: missing ${f}`);
  if (!existsSync(out + "shots/" + e.shot)) throw new Error(`${e.name}: no screenshot shots/${e.shot}`);
  const meta = [["Role", e.role], ["Year", e.year], ["Stack", e.stack]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  const play = e.play && e.url ? `\n      <button class="play" data-src="${esc(e.url)}">Try it here</button>` : "";
  const link = e.url ? `<a class="open" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.linkText ?? `Open ${host(e.url)} ↗`)}</a>` : "";
  const note = e.note ? `<span class="note">${esc(e.note)}</span>` : "";
  return `  <article class="entry">
    <div class="preview"><img src="shots/${esc(e.shot)}" alt="${esc(e.shotAlt)}" loading="lazy">${play}</div>
    <div>
      <div class="num">${String(i + 1).padStart(2, "0")}</div>
      <h2>${esc(e.name)}</h2>
      <p class="desc">${esc(e.desc)}</p>
      ${meta ? `<dl>${meta}</dl>` : ""}
      <div class="row"><span class="badge ${e.status}">${BADGE[e.status]}</span>${link}${note}</div>
    </div>
  </article>
`;
}

function page(c) {
  const plain = c.title.replace(/&/g, "and");
  return `${HEAD(plain)}
${STYLE}

<a class="skip" href="#entries">Skip to the ${esc(c.noun)}</a>
<header class="hero">
  <img src="${esc(c.hero)}" alt="${esc(c.heroAlt)}">
  <a class="back" href="./" aria-label="Back to the forest, to ${esc(c.where.toLowerCase())}">← Back to the forest</a>
  <div class="title">
    <div class="kicker">${esc(c.where)} · ${esc(plain)}</div>
    <h1>${esc(c.title)}</h1>
    <p class="lede">${esc(c.lede)}</p>
  </div>
</header>

<main id="entries">
  ${countLine(c)}

${c.entries.map(entry).join("\n")}</main>

<footer><span>Suryansh Mishra</span><a href="./" class="open">← Back to the forest</a></footer>

${SCRIPT}
</html>
`;
}

// the plain way in: every category on one page, for anyone who skips the forest (and for phones)
function index(cs) {
  const rows = cs.map((c) => `  <a class="cat" href="${c.key}.html"><img src="${esc(c.hero)}" alt="" loading="lazy"><span class="kicker">${esc(c.where)}</span>
    <h2>${esc(c.title)}</h2><p>${esc(c.lede)}</p><span class="n">${c.entries.length} ${c.entries.length === 1 ? c.noun.replace(/s$/, "") : c.noun}</span></a>`).join("\n");
  return `${HEAD("The archive")}
${STYLE}
<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 28px; padding: 32px 0 0; }
  .cat { display: block; text-decoration: none; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--ink-2); padding-bottom: 22px; }
  .cat img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; filter: saturate(.8) brightness(.8); margin-bottom: 18px; }
  .cat .kicker, .cat h2, .cat p, .cat .n { margin-left: 22px; margin-right: 22px; }
  .cat h2 { font-size: 30px; } .cat p { color: #bdb9b0; font-size: 15px; margin-top: 0; } .cat .n { font-size: 13px; color: var(--faint); }
  .cat:hover, .cat:focus-visible { border-color: #3a3f43; }
  .top { padding-top: 72px; } .top h1 { margin-top: 0; }
</style>

<main class="top">
  <div class="kicker">Suryansh Mishra</div>
  <h1>The archive</h1>
  <p class="lede">Everything behind the forest, without the walk.</p>
  <div class="grid">
${rows}
  </div>
</main>
<footer><a class="open" href="/">Walk the forest instead</a><a class="open" href="credits.html">Credits</a></footer>
</html>
`;
}

// D7: every model, scan, texture and sky that isn't ours, with its author and licence
function creditsPage() {
  const where = { landing: "The lanterns", earlier: "The wells and mirrors", stories: "The ruined chapel", games: "The stone ring", work: "The milestones", art: "The easels", tools: "The anvils" };
  const lic = (c) => c.license_url ? `<a href="${esc(c.license_url)}" rel="noopener">${esc(c.license)}</a>` : esc(c.license);
  const by = (c) => c.author ? (c.author_url ? `<a href="${esc(c.author_url)}" rel="noopener">${esc(c.author)}</a>` : esc(c.author)) : "";
  const table = (rows, place) => `<table><thead><tr><th>Work</th><th>By</th><th>Licence</th><th>Where</th></tr></thead><tbody>
${rows.map((c) => `<tr><td><a href="${esc(c.url)}" rel="noopener">${esc(c.title)}</a> <span class="src">${esc(c.source)}</span></td><td>${by(c)}</td><td>${lic(c)}</td><td>${esc(place(c))}</td></tr>`).join("\n")}
</tbody></table>`;
  return `${HEAD("Credits")}
${STYLE}
<style>
  .top { padding-top: 72px; } .top h1 { margin-top: 0; }
  h2 { font-size: 34px; margin: 64px 0 8px; } .intro { color: #bdb9b0; max-width: 720px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 18px; }
  th { text-align: left; font: 500 11px var(--sans); letter-spacing: .14em; text-transform: uppercase; color: var(--faint); padding: 0 16px 10px 0; border-bottom: 1px solid var(--line); }
  td { padding: 11px 16px 11px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  td a { text-decoration: none; border-bottom: 1px solid rgba(232,217,184,.25); } td a:hover, td a:focus-visible { border-color: var(--accent); }
  .src { color: var(--faint); font-size: 12px; margin-left: 6px; }
</style>
<main class="top">
  <div class="kicker">Suryansh Mishra</div>
  <h1>Credits</h1>
  <p class="lede">The statues, the stones and the forest were made by other people, and shared freely. Thank you.</p>
  <p class="intro">Every third-party asset on this site is listed here with its author and licence. Those under CC BY are credited as their licence asks; the CC0 ones are credited anyway. Most were simplified, retextured, weathered or rescaled to fit the scene (CC BY asks that changes be noted); any flaw that added is mine, not the authors'.</p>
  <h2>Statues</h2>
${table(credits.statues, (c) => c.where)}
  <h2>The structures</h2>
${table(credits.structures, (c) => where[c.where] ?? c.where)}
  <h2>The forest, the door and the sky</h2>
${table(credits.forest, () => "The forest")}
  <h2>Sound</h2>
${table(credits.sound, (c) => c.where)}
  <h2>Type and code</h2>
  <p class="intro">Cormorant Garamond and Inter (SIL Open Font License), served by Google Fonts. Rendered with <a class="open" href="https://threejs.org" rel="noopener">three.js</a> (MIT) and, offline, Blender Cycles.</p>
</main>
<footer><a class="open" href="/">Walk the forest</a><a class="open" href="./">The archive</a></footer>
</html>
`;
}

const shown = categories.filter((c) => c.entries.length);
for (const c of categories) {
  const f = out + c.key + ".html";
  if (c.entries.length) writeFileSync(f, page(c));
  else if (existsSync(f)) unlinkSync(f);
}
writeFileSync(out + "index.html", index(shown));
writeFileSync(out + "credits.html", creditsPage());
console.log(`archive: ${shown.map((c) => `${c.key} (${c.entries.length})`).join(", ")}; empty, no page: ${categories.filter((c) => !c.entries.length).map((c) => c.key).join(", ") || "none"}`);
