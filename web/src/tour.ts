import { PLACE_LIST, PAGES } from "./places";

// The scroll tour: the same forest, pre-rendered offline in the game's engine at full quality (tools/tour/), as a film the
// scroll position scrubs. Smooth on any machine, no WebGL; the price is a fixed path. Each place gets a stop with its page.
type Stop = { key: string; f0: number; f1: number };
type Tour = { fps: number; frames: number; stops: Stop[] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const film = $<HTMLVideoElement>("film"), hint = $("hint"), card = $("card"), rail = $("rail"), panel = $("panel"), page = $<HTMLIFrameElement>("page");
const BASE = "/assets/tour/";

let tour: Tour, dur = 0, target = 0, shown = 0, seeking = false, reading = false, at: Stop | null = null;
const place = (k: string) => PLACE_LIST.find((p) => p.key === k)!;
const progress = () => { const max = document.documentElement.scrollHeight - innerHeight; return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0; };
const scrollFor = (t: number) => (t / dur) * (document.documentElement.scrollHeight - innerHeight);

async function load() {
  tour = await (await fetch(BASE + "tour.json")).json();
  dur = tour.frames / tour.fps;
  // streamed, not fetched whole: the forest's foliage costs 60-140 MB however it is encoded, so the browser range-requests
  // ahead of the scroll instead. AV1 720p (sharper) where it decodes, else H.264 960p; ?codec=av1|h264 forces one.
  const want = new URLSearchParams(location.search).get("codec");
  const av1 = want ? want === "av1" : film.canPlayType('video/mp4; codecs="av01.0.05M.08"') === "probably";
  film.src = BASE + (av1 ? "tour_av1.mp4" : "tour.mp4");
  const pct = hint.querySelector("b")!;
  film.addEventListener("progress", () => {
    if (film.buffered.length && dur) pct.textContent = String(Math.min(100, Math.floor((film.buffered.end(0) / dur) * 100 * 8)));   // the first eighth is enough to start
  });
  await new Promise<void>((r) => film.addEventListener("canplay", () => r(), { once: true }));
  $("load").hidden = true; $("go").hidden = false;
  for (const s of tour.stops) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.key = s.key;
    b.textContent = place(s.key).label; b.setAttribute("aria-label", `Go to ${place(s.key).label}, ${place(s.key).where.toLowerCase()}`);
    b.onclick = () => scrollTo({ top: scrollFor((s.f0 + 6) / tour.fps), behavior: "smooth" });
    rail.append(b);
  }
  target = shown = progress() * dur;
  film.currentTime = shown;
  requestAnimationFrame(tick);
}

film.addEventListener("seeked", () => { seeking = false; });
addEventListener("scroll", () => {
  target = progress() * dur;
  if (scrollY > 40) hint.classList.add("gone");
}, { passive: true });

function tick() {
  // ease the shown time after the scroll (one seek in flight at a time, so a fast flick never queues up a backlog)
  shown += (target - shown) * 0.2;
  if (Math.abs(target - shown) < 0.5 / tour.fps) shown = target;
  if (!seeking && Math.abs(film.currentTime - shown) > 0.4 / tour.fps) { seeking = true; film.currentTime = shown; }
  const f = shown * tour.fps;
  const s = tour.stops.find((s) => f > s.f0 - tour.fps * 0.6 && f < s.f1 + tour.fps * 1.2) ?? null;
  if (s !== at) {
    at = s; card.hidden = !s;
    if (s) {
      const p = place(s.key);
      card.querySelector(".where")!.textContent = p.where;
      card.querySelector(".label")!.textContent = p.label;
      (card.querySelector(".open") as HTMLElement).hidden = !PAGES[s.key];
    }
  }
  for (const b of Array.from(rail.children) as HTMLElement[]) {
    const st = tour.stops.find((x) => x.key === b.dataset.key)!;
    b.classList.toggle("here", st === at); b.classList.toggle("past", f > st.f1);
  }
  requestAnimationFrame(tick);
}

function openPage() {
  if (!at || !PAGES[at.key] || reading) return;
  reading = true; page.src = PAGES[at.key]; panel.hidden = false; document.documentElement.style.overflow = "hidden";
}
function closePage() {
  if (!reading) return;
  reading = false; panel.hidden = true; page.src = "about:blank"; document.documentElement.style.overflow = "";
  page.blur(); window.focus();   // the page had the keyboard; take it back or E and the arrows go nowhere
}
card.querySelector(".open")!.addEventListener("click", openPage);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePage();
  else if ((e.key === "e" || e.key === "E" || e.key === "Enter") && !reading && e.target === document.body) openPage();
});
addEventListener("message", (e) => { if (e.data === "back-to-forest") closePage(); });

load().catch((e) => { $("load").textContent = "The walk didn't load. Try again, or walk it yourself."; console.error(e); });
