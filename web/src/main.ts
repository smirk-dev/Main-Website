import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { loadWorld, fixMaterials, Ground, type World } from "./world";
import { Vegetation } from "./vegetation";
import { Player } from "./player";
import { Door } from "./door";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $("c") as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

// D2: desktop only. Touch-first or small screens get the plain archive.
if (matchMedia("(pointer: coarse)").matches || innerWidth < 900) {
  $("start").hidden = true; $("gate").hidden = false;
  throw new Error("desktop only");
}

/** The seven places in the forest. Blender XY centres; each opens its archive page. A category without a page has no prompt. */
const PLACES = [
  { key: "landing", label: "Landing pages for people", where: "The lanterns", x: -6.5, y: 15, r: 6 },
  { key: "earlier", label: "Earlier selves", where: "The wells and mirrors", x: -22, y: 30, r: 7 },
  { key: "stories", label: "Stories and experiences", where: "The ruined chapel", x: -2, y: 80, r: 9 },
  { key: "games", label: "Games", where: "The stone ring", x: -30, y: 88, r: 13 },
  { key: "work", label: "Work", where: "The milestones", x: 36, y: 85, r: 7 },
  { key: "art", label: "Art and writing", where: "The easels", x: -8, y: 100, r: 6 },
  { key: "tools", label: "Tools and engineering", where: "The anvils", x: 22, y: 96, r: 7 },
].map((p) => ({ ...p, pos: new THREE.Vector3(p.x, 0, -p.y) }));
const PAGES: Record<string, string> = { tools: "/archive/tools.html" };

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
let mode: "door" | "forest" = params.has("forest") ? "forest" : "door";   // ?forest skips the door (tests)
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  door.resize(innerWidth / innerHeight);
});

// ---------- load ----------
const bar = $("bar"), loadtxt = $("loadtxt"), enter = $("enter") as HTMLButtonElement;
let world: World;
let veg: Vegetation;
let player: Player;
let sun: THREE.DirectionalLight;
const statics: { obj: THREE.Object3D; c: THREE.Vector3; cast: boolean }[] = [];   // hidden beyond the mist
const sunDir = new THREE.Vector3();

async function boot() {
  const [w, sky] = await Promise.all([
    loadWorld((f, label) => { bar.style.width = `${Math.round(f * 100)}%`; loadtxt.textContent = `Loading ${label}…`; }),
    new HDRLoader().loadAsync("/assets/sky_1k.hdr"),
  ]);
  world = w;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = sky;
  scene.environmentIntensity = 0.55;

  const d = w.data;
  sunDir.fromArray(d.sun.dir).normalize();
  sun = new THREE.DirectionalLight(new THREE.Color().fromArray(d.sun.color), 2.8);
  sun.castShadow = tier.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xcfd6dc, 0x4a3a2a, 0.35));

  // the statues, the structures, the ruins and the ground
  for (const s of d.statics) {
    const g = w.glbs.get(s.file);
    if (!g) continue;
    const obj = s.matrix ? g.scene.clone(true) : g.scene;
    if (s.matrix) { obj.matrixAutoUpdate = false; obj.matrix.fromArray(s.matrix); }
    fixMaterials(obj, { shadows: s.name !== "ground", receive: true });
    // the scans' marble was weathered by a node setup the web format can't carry: tone the bare albedo down to match
    if (s.name.startsWith("ST_")) obj.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.color) m.color.multiplyScalar(0.62); });
    scene.add(obj);
    if (s.name !== "ground" && s.name !== "ruins_posts") { const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()); statics.push({ obj, c, cast: true }); }
  }
  // past the detailed ground: a plain floor the mist swallows
  const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5c4b3b, roughness: 1 }));
  far.position.set(0, -0.25, -60); far.receiveShadow = true; scene.add(far);

  // lantern glow: a handful of real lights at the landing; every flame also glows on its own
  if (params.get("lights") !== "0") d.lanterns.slice(0, 4).forEach((p) => {
    const l = new THREE.PointLight(0xffa04a, 6, 9, 2); l.position.fromArray(p); scene.add(l);
  });

  veg = new Vegetation(w, tier.shadows);
  scene.add(veg.group);
  player = new Player(camera, new Ground(w), veg.trunks, d.spawn, canvas);
  player.settle();
  const fc = d.cameras["FCAM_B"];
  player.update(0);
  player.lookAt(fc.target[0], fc.target[1] - 0.6, fc.target[2]);   // first look: down the trail towards the fork angel

  // compile every shader now, not on the first step into a new clearing
  renderer.compile(scene, camera);
  if (params.has("debug")) Object.assign(window, { game: { player, camera, renderer, veg, scene } });   // test hook: teleport and look
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
door.load().then(() => { if (mode === "door") enter.disabled = false; })   // no auto-focus: focus eases the door ajar.catch((e) => { console.error(e); enter.disabled = false; });
enter.onmouseenter = enter.onfocus = () => door.ajar(true);
enter.onmouseleave = enter.onblur = () => door.ajar(false);
enter.onclick = () => {
  if (mode === "forest") { start.hidden = true; hud.hidden = false; lock(); return; }
  enter.disabled = true; $("leave").setAttribute("disabled", "");
  (start.querySelector(".door-top") as HTMLElement).style.opacity = "0";
  (start.querySelector(".door-bottom") as HTMLElement).style.opacity = "0";
  door.onThrough = arrive; door.enter();
};
// D3: browsers only let a script close a tab it opened; if the tab is still here, say so
$("leave").onclick = () => { window.close(); setTimeout(() => { $("gone").hidden = false; }, 300); };
$("resume").onclick = lock;
canvas.onclick = () => { if (!reading && start.hidden) lock(); };
document.addEventListener("pointerlockchange", () => {
  const on = document.pointerLockElement === canvas;
  pause.hidden = on || reading || !start.hidden;
});

let focus: (typeof PLACES)[number] | null = null;
function openPage(p: (typeof PLACES)[number]) {
  reading = true; page.src = PAGES[p.key]; panel.hidden = false; hud.hidden = true;
  document.exitPointerLock();
}
function closePage() {
  reading = false; panel.hidden = true; hud.hidden = false; page.src = "about:blank"; lock();
}
addEventListener("keydown", (e) => {
  if (e.code === "KeyE" && focus && !reading && player?.locked) openPage(focus);
  if (e.code === "Escape" && reading) closePage();
});
// the archive page's "Back to the forest" posts this
addEventListener("message", (e) => { if (e.data === "back-to-forest") closePage(); });

// ---------- loop ----------
const clock = new THREE.Timer();
const fpsEl = $("fps"); fpsEl.hidden = !params.has("debug");
let frames = 0, acc = 0, slow = 0;
const look = new THREE.Vector3(), to = new THREE.Vector3();
let lastPlace = "";

function frame() {
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === "door") {
    door.update(dt);   // may hand over to the forest (arrive) as the camera crosses the threshold
    if (mode === "door") { fade.style.opacity = String(door.through); renderer.render(door.scene, door.camera); }
  } else if (world && !reading) {
    player.update(dt);
    // the sun's shadow box follows the walker
    sun.position.copy(player.pos).addScaledVector(sunDir, 120); sun.target.position.copy(player.pos); sun.target.updateMatrixWorld();
    veg.update(camera);
    for (const s of statics) {
      const d = s.c.distanceTo(player.pos), cast = d < 40;
      s.obj.visible = d < 80 * veg.scale;
      if (cast !== s.cast) { s.cast = cast; s.obj.traverse((o) => { o.castShadow = cast; }); }   // only when it changes
    }

    // what is the walker near, and facing?
    camera.getWorldDirection(look);
    let best: (typeof PLACES)[number] | null = null, bestD = 1e9, near: (typeof PLACES)[number] | null = null, nearD = 1e9;
    for (const p of PLACES) {
      to.set(p.pos.x - player.pos.x, 0, p.pos.z - player.pos.z);
      const d = to.length();
      if (d < p.r + 10 && d < nearD) { near = p; nearD = d; }
      if (d < p.r && PAGES[p.key] && (d < 3 || to.normalize().dot(look.setY(0).normalize()) > 0.45) && d < bestD) { best = p; bestD = d; }
    }
    focus = best;
    prompt.hidden = !best;
    if (best) prompt.querySelector("span")!.textContent = `Open ${best.label}`;
    const nm = near ? near.where : "";
    if (nm !== lastPlace) { place.style.opacity = nm ? "1" : "0"; if (nm) place.textContent = nm; lastPlace = nm; }

    renderer.render(scene, camera);

    // keep it smooth: if frames run long for a few seconds, draw less (resolution first, then range, then shadows)
    frames++; acc += dt;
    if (acc > 2) {
      const fps = frames / acc; fpsEl.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1e6).toFixed(2)}M tris`;
      if (fps < 40 && start.hidden && player.locked) {
        slow++;
        if (slow === 1 && tier.pixel > 1) { tier.pixel = 1; renderer.setPixelRatio(1); }
        else if (slow === 2) veg.scale = 0.8;
        else if (slow === 3 && tier.shadows) { renderer.shadowMap.enabled = false; sun.castShadow = false; }
        else if (slow === 4) { renderer.setPixelRatio(0.8); veg.scale = 0.65; }
      }
      frames = 0; acc = 0;
    }
  }
  requestAnimationFrame(frame);
}
boot().catch((e) => { loadtxt.textContent = "The forest failed to load. " + e.message; console.error(e); });
requestAnimationFrame(frame);
