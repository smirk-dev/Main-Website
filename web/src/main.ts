import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { loadWorld, fixMaterials, Ground, HOLED, lod1, mid, type World } from "./world";
import { Vegetation, RANGE } from "./vegetation";
import { Terrain } from "./terrain";
import { densify } from "./densify";
import { Collision } from "./collide";
import { Player } from "./player";
import { Door } from "./door";
import { Statues, Plates } from "./statues";
import { Ambience } from "./sound";
import { PLACE_LIST, PAGES } from "./places";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $("c") as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
/** the untextured statue parts' stone, sRGB (?stone=rrggbb to try others) */
const STONE = "#" + (params.get("stone") ?? "8e8a82");

// D2: desktop only. Touch-first or small screens get the plain archive.
if (matchMedia("(pointer: coarse)").matches || innerWidth < 900) {
  $("start").hidden = true; $("story").hidden = true; $("lines").hidden = true; $("gate").hidden = false;
  throw new Error("desktop only");
}

/** The seven places in the forest. Blender XY centres; each opens its archive page. A category without a page has no prompt. */
const PLACES = PLACE_LIST.map((p) => ({ ...p, pos: new THREE.Vector3(p.x, 0, -p.y) }));

// ---------- renderer ----------
// test switches (?pr= pixel ratio, ?shadows=0, ?lights=0, ?aa=1)
const tier = { pixel: Number(params.get("pr") ?? Math.min(devicePixelRatio, 1.25)), shadows: params.get("shadows") !== "0" };
// no MSAA by default: on integrated GPUs it halved the frame rate (20 to 40 fps at the spawn, Iris Xe)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: params.get("aa") === "1", powerPreference: "high-performance" });
renderer.setPixelRatio(tier.pixel);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = tier.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xbfc3c2);
scene.background = FOG;
scene.fog = new THREE.FogExp2(FOG, 0.021);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);
const door = new Door();
door.resize(innerWidth / innerHeight);
const statues = new Statues();
const plates = new Plates($("plates"));
const usePlates = params.get("plates") !== "0";   // test switch: raster only
if (params.has("debug")) Object.assign(window, { act1: { statues, plates, door } });
statues.resize(innerWidth / innerHeight);
// Act I → II → III. ?door starts at the door, ?forest skips both (tests)
let mode: "statues" | "door" | "forest" = params.has("forest") ? "forest" : params.has("door") ? "door" : "statues";
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  door.resize(innerWidth / innerHeight); statues.resize(innerWidth / innerHeight); layoutStory();
});

// ---------- Act I: the scroll track ----------
const story = $("story"), track = $("track"), lines = $("lines"), cue = $("cue");
const STEP = 0.85;                          // viewport heights of scroll per key of the timeline
const LAST = statues.keys.length - 1;       // the last black key; one more step brings the door up
const lineEls = Array.from(lines.querySelectorAll<HTMLElement>(".line")).map((el) => {
  const s = ["engel", "milan_mourning", "maternal_affection"].indexOf(el.dataset.statue ?? "");
  const b = ["emerge", "reveal", "close"].indexOf(el.dataset.beat ?? "");
  // the text takes the third of the frame the statue leaves empty
  if (s >= 0) el.classList.add(s === 1 ? "right" : "left");
  return { el, t: s >= 0 ? statues.beats[s][b] : 0, intro: s < 0 };
});
/** scroll per key interval: where the light is out at both ends (between two statues) a short stretch, so the black never
 *  reads as the page having stopped. Past the last key the door comes up at one step per key. */
const SEG = statues.keys.slice(0, -1).map((a, i) => { const b = statues.keys[i + 1]; return a.key + a.rim === 0 && b.key + b.rim === 0 ? 0.3 : 1; });
const CUM = SEG.reduce<number[]>((c, l) => (c.push(c[c.length - 1] + l), c), [0]);
/** timeline position (keys) → scroll position (steps), and back */
const toScroll = (t: number) => { if (t >= LAST) return CUM[LAST] + (t - LAST); const i = Math.max(0, Math.floor(t)); return CUM[i] + (t - i) * SEG[i]; };
const fromScroll = (u: number) => { if (u >= CUM[LAST]) return LAST + (u - CUM[LAST]); let i = 0; while (i < LAST - 1 && CUM[i + 1] <= u) i++; return i + (u - CUM[i]) / SEG[i]; };
/** the scroll stops: the title, every beat, the door */
const STOPS = [0, ...statues.beats.flat(), LAST + 1].map(toScroll);
function layoutStory() {
  const step = innerHeight * STEP;
  track.style.height = `${toScroll(LAST + 1) * step + innerHeight}px`;
  track.replaceChildren(...STOPS.map((u) => { const i = document.createElement("i"); i.style.top = `${u * step}px`; return i; }));
}
layoutStory();
let storyT = 0, stillSince = performance.now();
story.addEventListener("scroll", () => { stillSince = performance.now(); });
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
// the keyboard pages from stop to stop, so no beat (and no line) is ever paged past
story.addEventListener("keydown", (e) => {
  const fwd = ["PageDown", "ArrowDown", "ArrowRight"].includes(e.key) || (e.key === " " && !e.shiftKey);
  const back = ["PageUp", "ArrowUp", "ArrowLeft"].includes(e.key) || (e.key === " " && e.shiftKey);
  const home = e.key === "Home", end = e.key === "End";
  if (!fwd && !back && !home && !end) return;
  e.preventDefault();
  const step = innerHeight * STEP, u = story.scrollTop / step;
  const to = home ? 0 : end ? STOPS[STOPS.length - 1] : fwd ? STOPS.find((x) => x > u + 0.05) : [...STOPS].reverse().find((x) => x < u - 0.05);
  if (to !== undefined) story.scrollTo({ top: to * step, behavior: reduced ? "auto" : "smooth" });
});
/** yield a frame while someone is watching; in a hidden tab rAF never fires, so don't wait for it */
const nextFrame = () => (document.hidden ? Promise.resolve() : new Promise<void>((r) => requestAnimationFrame(() => r())));
/** resolves once the reader has stopped scrolling for a moment (or has left Act I): the forest's heavy set-up runs then, so the story never stutters */
const calm = () => new Promise<void>((res) => { const k = () => (mode !== "statues" || performance.now() - stillSince > 1200 ? res() : setTimeout(k, 200)); k(); });
if (mode === "statues") story.focus();
else { story.hidden = true; lines.hidden = true; $("start").hidden = false; }
/** Act I's statues download first and alone; the door and the forest wait for them */
const act1 = mode === "statues"
  ? statues.load(() => { cue.textContent = "Scroll"; }).catch((e) => { console.error(e); cue.textContent = "The statues failed to load. Scroll on to the door."; })
  : Promise.resolve();

// ---------- load ----------
const bar = $("bar"), loadtxt = $("loadtxt"), enter = $("enter") as HTMLButtonElement;
let world: World;
let veg: Vegetation;
let player: Player;
let sun: THREE.DirectionalLight;
/** obj: full detail (a statue's whole scan: within 12 m only); mid: a statue's 30k copy, 12-40 m; far: the reduced copy past
 *  40 m (half in the mist); shells: backing for the pinholed scans, only needed close */
const statics: { obj: THREE.Object3D; mid?: THREE.Object3D; far?: THREE.Object3D; shells: THREE.Mesh[]; c: THREE.Vector3; cast: boolean; near: boolean; close: boolean }[] = [];
const sunDir = new THREE.Vector3();

/** Two of the scans (shipped whole, see export_web.py) are photogrammetry with pinholes all over: you saw the sky through
 *  them. A copy of each big scan mesh, pushed 2 cm inward along its normals, sits behind every hole and closes it. */
function backScan(root: THREE.Object3D): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [], shells: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.geometry.index?.count ?? 0) / 3 > 50000 && m.geometry.attributes.normal) meshes.push(m); });
  for (const m of meshes) {
    const e = 0.02 / m.matrixWorld.getMaxScaleOnAxis();
    const g = m.geometry.clone(), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * e, p.getY(i) - n.getY(i) * e, p.getZ(i) - n.getZ(i) * e);
    const sh = new THREE.Mesh(g, m.material); sh.receiveShadow = true; m.add(sh); shells.push(sh);
  }
  return shells;
}

/** A flame that isn't inside any lantern of its cluster (one in SX_landing_3 hung 1.4 m under its lamps and read as a
 *  floating white oval) is moved into the nearest lantern, a little below its middle. */
function seatFlames(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const flames: THREE.Mesh[] = [], lamps: THREE.Box3[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return;
    if ((m.material as THREE.Material).name === "lantern_flame") flames.push(m); else lamps.push(new THREE.Box3().setFromObject(m)); });
  const c = new THREE.Vector3(), lc = new THREE.Vector3();
  for (const f of flames) {
    new THREE.Box3().setFromObject(f).getCenter(c);
    if (!lamps.length || lamps.some((b) => b.clone().expandByScalar(0.03).containsPoint(c))) continue;
    let best = lamps[0], bd = Infinity;
    for (const b of lamps) { b.getCenter(lc); const d = Math.hypot(lc.x - c.x, lc.z - c.z); if (d < bd) { bd = d; best = b; } }
    best.getCenter(lc); lc.y -= (best.max.y - best.min.y) * 0.12;
    f.position.add(f.parent!.worldToLocal(lc.clone()).sub(f.parent!.worldToLocal(c.clone())));
    f.updateMatrixWorld(true);
  }
}

async function boot() {
  await act1;
  const [w, sky] = await Promise.all([
    loadWorld((f, label) => { bar.style.width = `${Math.round(f * 100)}%`; loadtxt.textContent = `Loading ${label}…`; }),
    new HDRLoader().loadAsync("/assets/sky_1k.hdr"),
  ]);
  await calm();
  world = w;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = sky;
  scene.environmentIntensity = 0.55;

  const d = w.data;
  // the ground: one surface from the forest out into the mist, the same one the walker stands on
  const terrain = new Terrain(w);
  scene.add(terrain.mesh());
  await calm();
  const walls = new Collision(terrain);
  const added = densify(w, terrain, PLACES.map((p) => ({ x: p.x, z: -p.y, r: p.r })), d.spawn);
  if (params.has("debug")) console.log("densify: +" + added + " instances");
  sunDir.fromArray(d.sun.dir).normalize();
  sun = new THREE.DirectionalLight(new THREE.Color().fromArray(d.sun.color), 2.8);
  sun.castShadow = tier.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfd6dc, 0x4a3a2a, 0.35);
  scene.add(hemi);

  // the statues, the structures, the ruins and the ground
  for (const s of d.statics) {
    if (s.name === "ground") continue;   // replaced by the terrain mesh
    const make = (f: string) => {
      const g = w.glbs.get(f);
      if (!g) return undefined;
      const toned = !!g.userData.toned;
      const obj = s.matrix ? g.scene.clone(true) : g.scene;
      if (s.matrix) { obj.matrixAutoUpdate = false; obj.matrix.fromArray(s.matrix); }
      fixMaterials(obj, { shadows: true, receive: true });
      if (s.name.startsWith("SX_landing")) seatFlames(obj);
      // the scans' marble was weathered by a node setup the web format can't carry: tone the bare albedo down to match (once per file)
      // A part with no texture at all (the fork's broken-wing angel) got only that 0.62 and read as chalk-white plaster: it takes
      // a weathered grey stone instead
      if (s.name.startsWith("ST_") && !toned) obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (!m?.color) return;
        if (m.map) m.color.multiplyScalar(0.62); else { m.color.set(STONE); m.roughness = 0.92; }
      });
      g.userData.toned = true;
      scene.add(obj); obj.name = s.name;
      return obj;
    };
    const obj = make(s.file);
    if (!obj) continue;
    if (s.name === "ruins_posts") { walls.addObject(obj); continue; }   // the chapel ruins: always drawn
    const far = make(lod1(s.file));
    // you stop at the stone itself; a statue's 6k far copy is as good as its whole scan at the 10 cm collision grid and
    // keeps the load from walking 120-480k triangles per statue
    walls.addObject(s.name.startsWith("ST_") && far ? far : obj);
    const shells = HOLED.has(s.name) ? backScan(obj) : [];
    const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const md = s.name.startsWith("ST_") ? make(mid(s.file)) : undefined;
    statics.push({ obj, mid: md, far, shells, c, cast: true, near: true, close: true });
  }

  // lantern glow: a handful of real lights at the landing; every flame also glows on its own
  if (params.get("lights") !== "0") d.lanterns.slice(0, 4).forEach((p) => {
    const l = new THREE.PointLight(0xffa04a, 6, 9, 2); l.position.fromArray(p); scene.add(l);
  });

  await calm();
  veg = new Vegetation(w, tier.shadows, renderer, sunDir, { sun, hemi, env: sky, envI: scene.environmentIntensity });
  scene.add(veg.group);
  veg.solids(walls);
  if (params.has("debug")) console.log("collision: " + walls.tris + " triangles");
  player = new Player(camera, new Ground(w, terrain), walls, d.spawn, canvas);
  if (reduced) player.bobScale = 0;
  player.slideOn = params.get("slide") !== "0";
  player.settle();
  const fc = d.cameras["FCAM_B"];
  player.update(0);
  player.lookAt(fc.target[0], fc.target[1] - 0.6, fc.target[2]);   // first look: down the trail towards the fork angel

  // compile every shader now, not on the first step into a new clearing
  await calm();
  await renderer.compileAsync(scene, camera);
  // ...and upload every texture, a few a frame: compileAsync leaves textures for their first draw, and the 4K maps of a
  // clearing's statues and structures stalled the walk 2-3 s on its first sight of them (Iris Xe, ANGLE D3D11)
  const texs = new Set<THREE.Texture>();
  if (params.get("warm") !== "0") {   // test switch: ?warm=0 leaves uploads to the first draw
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    for (const mt of [m.material, m.customDepthMaterial].flat()) if (mt) for (const v of Object.values(mt)) if (v instanceof THREE.Texture) texs.add(v);
  });
  let up = 0;
  for (const t of texs) {
    renderer.initTexture(t);
    if (++up % 3 === 0) { await nextFrame(); await calm(); loadtxt.textContent = `Loading the forest… ${Math.round((100 * up) / texs.size)}%`; }
  }
  // the same for the meshes: draw each statue and structure once, alone and unculled, into one pixel of the canvas (with
  // the forest's tone mapping, so it builds the programs the walk will use), so its vertex buffers are on the GPU before
  // the walker meets it (a 1 M-face scan's first draw cost ~1 s). The next frame redraws the whole canvas.
  const all = statics.flatMap((s) => [s.obj, s.mid, s.far, ...s.shells].filter((o) => !!o) as THREE.Object3D[]);
  veg.group.visible = false;
  for (const o of all) {
    for (const x of all) x.visible = x === o;
    const culled: THREE.Object3D[] = [];
    o.traverse((q) => { if (q.frustumCulled) { q.frustumCulled = false; culled.push(q); } });
    const tm = renderer.toneMapping; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.render(scene, camera); renderer.setScissorTest(false);
    renderer.toneMapping = tm;
    for (const q of culled) q.frustumCulled = true;
    await nextFrame(); await calm();
  }
  for (const x of all) x.visible = true;   // the loop sets the real visibility on its first frame
  veg.group.visible = true;
  }
  if (params.has("debug")) Object.assign(window, { game: { player, camera, renderer, veg, scene, statics, world: w, R: RANGE, sun, film } });   // test hook: teleport and look
  bar.style.width = "100%"; loadtxt.textContent = "The forest is ready.";
  if (mode === "forest") { enter.disabled = false; enter.focus(); }
  if (waiting) arrive();
}

// ---------- states: start → walking ⇄ paused / reading a page ----------
const start = $("start"), pause = $("pause"), hud = $("hud"), panel = $("panel"), page = $("page") as HTMLIFrameElement;
const prompt = $("prompt"), place = $("place");
let reading = false;
const lock = () => canvas.requestPointerLock();
const fade = $("fade"), fadetxt = $("fadetxt");
let waiting = false;
/** Through the door: swap to the forest under the mist-coloured fade, then let the fade lift. */
function arrive() {
  if (!world) { waiting = true; fadetxt.textContent = "The forest is still loading…"; return; }
  waiting = false; fadetxt.textContent = "";
  mode = "forest"; start.hidden = true; hud.hidden = false; lock();
  fade.style.transition = "opacity 1.4s ease-out"; fade.style.opacity = "0";
}
// no auto-focus: focus eases the door ajar
act1.then(() => door.load()).then(() => { if (mode !== "forest") enter.disabled = false; }).catch((e) => { console.error(e); enter.disabled = false; });
enter.onmouseenter = enter.onfocus = () => door.ajar(true);
enter.onmouseleave = enter.onblur = () => door.ajar(false);
enter.onclick = () => {
  if (mode === "forest") { start.hidden = true; hud.hidden = false; lock(); return; }
  enter.disabled = true; $("leave").setAttribute("disabled", "");
  mode = "door"; door.reveal = 1; story.hidden = true; lines.hidden = true; plates.show(-1, 0);
  (start.querySelector(".door-top") as HTMLElement).style.opacity = "0";
  (start.querySelector(".door-bottom") as HTMLElement).style.opacity = "0";
  // reduced motion: no push through the doorway, just a fade to the forest
  if (reduced) { fade.style.transition = "opacity .6s"; fade.style.opacity = "1"; setTimeout(arrive, 650); }
  else { door.onThrough = arrive; door.enter(); }
};
// D3: browsers only let a script close a tab it opened; if the tab is still here, say so
$("leave").onclick = () => { window.close(); setTimeout(() => { $("gone").hidden = false; }, 300); };
$("resume").onclick = lock;
const sound = new Ambience(), soundBtn = $("sound");
sound.onchange = (on, err) => {
  soundBtn.textContent = err ? "Sound unavailable" : on ? "Sound on" : "Sound off"; soundBtn.setAttribute("aria-pressed", String(on));
};
soundBtn.onclick = () => sound.toggle();
canvas.onclick = () => { if (!reading && start.hidden) lock(); };
document.addEventListener("pointerlockchange", () => {
  const on = document.pointerLockElement === canvas;
  pause.hidden = on || reading || !start.hidden;
});

let focus: (typeof PLACES)[number] | null = null;
function openPage(p: (typeof PLACES)[number]) {
  reading = true; page.src = PAGES[p.key]; panel.hidden = false; hud.hidden = true; sound.duck(true);
  document.exitPointerLock();
}
function closePage() {
  reading = false; panel.hidden = true; hud.hidden = false; page.src = "about:blank"; sound.duck(false);
  // take the keyboard back from the page: hiding its iframe leaves focus inside it, so W/A/S/D went to a blank frame and
  // the walker could look round but not move ("stuck in one place after opening a structure")
  page.blur(); canvas.focus({ preventScroll: true }); window.focus();
  lock();
}
addEventListener("keydown", (e) => {
  if (e.code === "KeyE" && focus && !reading && player?.locked) openPage(focus);
  if (e.code === "Escape" && reading) closePage();
  if (e.code === "KeyM" && mode === "forest" && !e.repeat) sound.toggle();
});
// the archive page's "Back to the forest" posts this
addEventListener("message", (e) => { if (e.data === "back-to-forest") closePage(); });

// ---------- loop ----------
const clock = new THREE.Timer();
const fpsEl = $("fps"); fpsEl.hidden = !params.has("debug");
let frames = 0, acc = 0, slow = 0, shadowEvery = 1, tick = 0;
const look = new THREE.Vector3(), to = new THREE.Vector3();
let lastPlace = "";
// offline rendering (the scroll tour, scratch tools): with hold set the loop draws only when asked, once per captured frame.
// Headless Chrome runs rAF faster than the GPU drains, so a free-running loop queued seconds of draws ahead of every capture.
const film = { hold: false, once: false };

function frame() {
  if (film.hold && !film.once) { requestAnimationFrame(frame); return; }
  film.once = false;
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === "statues") {
    // the camera follows the scroll with a little lag, so a wheel notch glides instead of jumping
    const target = fromScroll(story.scrollTop / (innerHeight * STEP));
    storyT = reduced ? target : storyT + (target - storyT) * Math.min(1, dt * 5);
    if (Math.abs(target - storyT) < 1e-4) storyT = target;
    const t = storyT;
    for (const l of lineEls) {
      const d = l.intro ? Math.max(0, t) / 0.6 : Math.abs(t - l.t) / 0.42, o = Math.max(0, 1 - d);
      l.el.style.opacity = String(o * o * (3 - 2 * o));
      if (!l.intro) l.el.style.transform = `translateY(calc(-50% + ${((t - l.t) * -26).toFixed(1)}px))`;
    }
    const doorF = THREE.MathUtils.smoothstep(t, LAST + 0.15, LAST + 0.9);
    const skip = $("lines").querySelector(".skip-story") as HTMLElement;
    skip.style.opacity = String(1 - doorF); skip.style.visibility = doorF > 0.5 ? "hidden" : "";
    const st = $("start");
    if (doorF > 0) {
      plates.show(-1, 0);
      // the door rises out of the same black the last statue went into
      st.hidden = false; st.style.opacity = String(doorF); st.style.pointerEvents = doorF > 0.6 ? "" : "none";
      door.reveal = doorF; door.update(dt);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.render(door.scene, door.camera);
    } else {
      st.hidden = true;
      renderer.toneMapping = THREE.AgXToneMapping;
      // resting: the scroll and the camera have both stopped (the camera eases in for a moment after the wheel)
      const rest = performance.now() - stillSince > 350 && storyT === target;
      if (statues.ready) {
        const { statue } = statues.update(Math.min(t, LAST));
        plates.preload(statue);
        renderer.render(statues.scene, statues.camera);
        // at rest on a beat, the path-traced plate of exactly this frame fades in over the raster
        const b = statues.beats[statue].findIndex((bt) => Math.abs(bt - t) < 0.02);
        if (usePlates && rest && b >= 0) plates.show(statue, b); else plates.show(-1, 0);
      }
      else renderer.clear();
    }
  } else if (mode === "door") {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    door.update(dt);   // may hand over to the forest (arrive) as the camera crosses the threshold
    if (mode === "door") { if (!reduced) fade.style.opacity = String(door.through); renderer.render(door.scene, door.camera); }
  } else if (world && !reading) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    player.update(dt);
    // the sun's shadow box follows the walker
    sun.position.copy(player.pos).addScaledVector(sunDir, 120); sun.target.position.copy(player.pos); sun.target.updateMatrixWorld();
    veg.update(camera);
    for (const s of statics) {
      const d = s.c.distanceTo(player.pos), cast = d < 25, shown = d < 105;   // 105 m: the mist has taken them completely
      s.near = d < 38 ? true : d > 42 ? false : s.near;                       // dead band: no flicker on the line
      s.close = d < 11 ? true : d > 13 ? false : s.close;                    // a statue's whole scan only within ~12 m
      s.obj.visible = shown && (s.near || !s.far) && (s.close || !s.mid);
      if (s.mid) s.mid.visible = shown && s.near && !s.close;
      if (s.far) s.far.visible = shown && !s.near;
      for (const m of s.shells) m.visible = d < 15;   // pinholes only read up close
      if (cast !== s.cast) { s.cast = cast; for (const o of [s.obj, s.mid, s.far]) o?.traverse((q) => { q.castShadow = cast; }); }   // only when it changes
    }

    // what is the walker near, and facing?
    camera.getWorldDirection(look);
    let best: (typeof PLACES)[number] | null = null, bestD = 1e9, near: (typeof PLACES)[number] | null = null, nearD = 1e9;
    for (const p of PLACES) {
      to.set(p.pos.x - player.pos.x, 0, p.pos.z - player.pos.z);
      const d = to.length();
      if (d < p.r + 4 && d < nearD) { near = p; nearD = d; }
      if (d < p.r && PAGES[p.key] && (d < 3 || to.normalize().dot(look.setY(0).normalize()) > 0.45) && d < bestD) { best = p; bestD = d; }
    }
    focus = best;
    prompt.hidden = !best;
    const say = best ? `Open ${best.label}` : "", span = prompt.querySelector("span")!;
    if (say && span.textContent !== say) span.textContent = say;   // not every frame: the prompt sits on a backdrop blur
    const nm = near ? near.where : "";
    if (nm !== lastPlace) { place.style.opacity = nm ? "1" : "0"; if (nm) place.textContent = nm; lastPlace = nm; }

    if (!renderer.shadowMap.autoUpdate && ++tick % shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);

    // keep it smooth: if frames run long for a few seconds, draw less (resolution first, then range, then shadows)
    frames++; acc += dt;
    if (acc > 2) {
      const fps = frames / acc; fpsEl.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1e6).toFixed(2)}M tris`;
      if (fps < 40 && start.hidden && player.locked && !film.hold) {   // offline rendering keeps its quality
        slow++;
        if (slow === 1 && tier.pixel > 1) { tier.pixel = 1; renderer.setPixelRatio(1); }
        else if (slow === 2) veg.scale = 0.8;
        // never switch shadows off here: that recompiles every material in one frame (40 -> 70 programs, a 5-15 s freeze on
        // Iris Xe, felt as "stuck near the statues"). Redraw the shadow map every 4th frame instead, which compiles nothing.
        else if (slow === 3 && tier.shadows) { renderer.shadowMap.autoUpdate = false; shadowEvery = 4; }
        else if (slow === 4) { renderer.setPixelRatio(0.8); veg.scale = 0.65; }
      }
      frames = 0; acc = 0;
    }
  }
  requestAnimationFrame(frame);
}
boot().catch((e) => { loadtxt.textContent = "The forest failed to load. " + e.message; console.error(e); });
requestAnimationFrame(frame);
