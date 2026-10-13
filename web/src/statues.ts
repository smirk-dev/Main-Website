import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/** Act I: three statues on obsidian black, one at a time (g2-scenes/act1.html, approved 2026-10-12).
 *  Each has three beats, emerge (a breath of key, strong rim) → reveal (3/4 view, full key) → close (the face),
 *  and between statues the light dies to black. Scroll position `t` (0..beats) drives everything; the poses and the
 *  light rig are act1.py's, converted from Blender (x, y, z) to three (x, z, -y), with each figure's base at the origin. */

export const NAMES = ["engel", "milan_mourning", "maternal_affection"] as const;
type Name = (typeof NAMES)[number];
export const BEATS = ["emerge", "reveal", "close"] as const;
/** the Cycles plates are 1920×1080 */
const PLATE = 16 / 9;
/** side: the third of the frame the statue holds (+1 right, -1 left; the text takes the other). yaw: beat 2's 3/4 angle.
 *  Milan's scan is front-only, so her camera stays within ±60° of her front. */
const PLAN: Record<Name, { side: number; yaw: number; close: [number, number, number, number] }> = {
  engel: { side: 1, yaw: -38, close: [1.05, 0.93, 0.91, 70] },
  milan_mourning: { side: -1, yaw: 30, close: [0.95, 0.8, 0.84, 85] },
  maternal_affection: { side: 1, yaw: 34, close: [0.95, 0.8, 0.84, 85] },
};

/** one key of the timeline: camera (yaw°, distance and eye height in figure heights, look-at height, lens mm, frame shift) and light */
interface Key { s: number; yaw: number; dist: number; eye: number; look: number; lens: number; shift: number; key: number; rim: number }

/** five keys per statue: black → emerge → reveal → close → black. Scroll stops (beats) sit on emerge, reveal and close. */
function keys(): Key[] {
  const out: Key[] = [];
  NAMES.forEach((n, s) => {
    const p = PLAN[n], [cd, ce, cl, clens] = p.close;
    const emerge = { s, yaw: p.yaw * 0.4, dist: 2.6, eye: 0.3, look: 0.55, lens: 50, shift: 0.2, key: 0.06, rim: 5 };
    out.push({ ...emerge, yaw: p.yaw * 0.1, dist: 2.9, key: 0, rim: 0 });   // from black, drifting in
    out.push(emerge);
    out.push({ s, yaw: p.yaw, dist: 2.35, eye: 0.28, look: 0.47, lens: 50, shift: 0.2, key: 1, rim: 1 });
    out.push({ s, yaw: p.yaw * 0.6, dist: cd, eye: ce, look: cl, lens: clens, shift: 0.16, key: 1, rim: 1 });
    out.push({ s, yaw: p.yaw * 0.5, dist: cd * 0.92, eye: ce, look: cl, lens: clens, shift: 0.16, key: 0, rim: 0 });   // the light dies
  });
  return out;
}

export class Statues {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 40);
  readonly keys = keys();
  /** the scroll positions (in keys) of the three readable beats of each statue: emerge, reveal, close */
  readonly beats = NAMES.map((_, s) => [s * 5 + 1, s * 5 + 2, s * 5 + 3]);
  private figures: (THREE.Object3D | undefined)[] = [];
  private h: number[] = [2, 2, 2];
  private key: THREE.SpotLight;
  private rim: THREE.SpotLight;
  private K = 100; private R = 46;
  /** stands in for the light the marble bounces onto itself in the Cycles plates, so the crossfade doesn't brighten the shadows */
  private bounce = new THREE.AmbientLight(0xfff3e4, 0);   // candela at a 2 m figure; scaled by height² like act1.py's s²
  private aspect = 16 / 9;
  current = -1;
  /** how much of the key light is up (0 in the black between statues) */
  lit = 0;

  constructor() {
    this.scene.background = new THREE.Color(0x000000);
    // act1.py's rig for a 2 m figure: KEY at (2.4, -1.7, 3.0)·s, RIM at (-1.6, 1.9, 2.6)·s, both aimed at 0.55 h; no fill
    this.key = new THREE.SpotLight(0xfff5e6, 0, 0, 0.62, 0.85, 2);
    this.rim = new THREE.SpotLight(0xd9e6ff, 0, 0, 0.55, 0.8, 2);
    for (const l of [this.key, this.rim]) {
      l.castShadow = true; l.shadow.mapSize.set(2048, 2048); l.shadow.bias = -0.00015; l.shadow.normalBias = 0.01;
      l.shadow.camera.near = 1; l.shadow.camera.far = 14; l.shadow.radius = 3;
      this.scene.add(l, l.target);
    }
    this.scene.add(this.bounce);
  }

  /** The first figure comes first so Act I can start while the other two (and the forest) stream in. */
  async load(onFirst?: () => void) {
    const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
    const meta: Record<string, { h: number }> = await (await fetch("/assets/heroes/heroes.json")).json();
    for (let i = 0; i < NAMES.length; i++) {
      const g = await loader.loadAsync(`/assets/heroes/${NAMES[i]}.glb`);
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true; m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        // weathered marble: matte, with a faint sheen where the key grazes it
        mat.metalness = 0; mat.roughness = 0.72; mat.metalnessMap = null;
        if (mat.map) mat.map.anisotropy = 8;
      });
      g.scene.visible = false;
      this.scene.add(g.scene);
      this.figures[i] = g.scene; this.h[i] = meta[NAMES[i]]?.h ?? 2;
      if (i === 0) onFirst?.();
    }
  }
  get ready() { return !!this.figures[0]; }

  resize(aspect: number) { this.aspect = aspect; }

  /** t: scroll position in keys (0 .. keys.length - 1). */
  update(t: number) {
    const ks = this.keys, n = ks.length;
    t = THREE.MathUtils.clamp(t, 0, n - 1);
    const i = Math.min(Math.floor(t), n - 2), f = t - i;
    const a = ks[i], b = ks[i + 1], e = f * f * (3 - 2 * f);
    // a pair of keys on two different statues never happens (each statue starts and ends in black on its own keys)
    const L = (x: number, y: number) => x + (y - x) * e;
    const s = a.s, h = this.h[s], p = PLAN[NAMES[s]];
    const yaw = THREE.MathUtils.degToRad(L(a.yaw, b.yaw)), dist = L(a.dist, b.dist) * h;
    if (this.current !== s) { this.figures.forEach((g, j) => g && (g.visible = j === s)); this.current = s; this.rig(h); }

    // front is -Y in Blender = +Z here; the camera orbits on the figure's own scale
    this.camera.position.set(Math.sin(yaw) * dist, L(a.eye, b.eye) * h, Math.cos(yaw) * dist);
    this.camera.lookAt(0, L(a.look, b.look) * h, 0);
    // Frame exactly like the 16:9 Cycles plate shown with object-fit: cover, so the raster and the plate line up at any window shape.
    // Blender: 36 mm sensor across the plate's width; shift_x moves the frame by that fraction of the plate's width.
    const lens = L(a.lens, b.lens), tanH = 18 / lens, A = this.aspect;
    this.camera.aspect = A;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanH / Math.max(A, PLATE)));
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[8] += 2 * (-p.side * L(a.shift, b.shift)) * Math.max(1, PLATE / A);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    const s2 = (h / 2) ** 2;
    this.key.intensity = this.K * s2 * L(a.key, b.key);
    this.rim.intensity = this.R * s2 * L(a.rim, b.rim);
    this.lit = L(a.key, b.key);
    this.bounce.intensity = 0.09 * this.lit;
    return { statue: s, side: p.side };
  }

  private rig(h: number) {
    const s = h / 2, aim = new THREE.Vector3(0, 0.55 * h, 0);
    this.key.position.set(2.4 * s, 3.0 * s, 1.7 * s);
    this.rim.position.set(-1.6 * s, 2.6 * s, -1.9 * s);
    for (const l of [this.key, this.rim]) { l.target.position.copy(aim); l.target.updateMatrixWorld(); l.distance = 0; }
  }
}

/** D8: the settled frame of each beat is path traced, offline, in Cycles (tools/beats_render.py, same poses and rig).
 *  When the scroll rests on a beat its plate crossfades in over the raster; it fades out the moment the scroll moves.
 *  Two <img> layers, so a new plate never shows half-decoded. */
export class Plates {
  private els: HTMLImageElement[];
  private on = -1;
  private cache = new Map<string, HTMLImageElement>();
  private shown = "";
  constructor(root: HTMLElement) { this.els = Array.from(root.querySelectorAll<HTMLImageElement>("img")); }
  private url(s: number, b: number) { return `/assets/heroes/beats/${NAMES[s]}_${BEATS[b]}.webp`; }
  /** start fetching a statue's three plates (call when it comes up) */
  preload(s: number) {
    for (let b = 0; b < 3; b++) {
      const u = this.url(s, b);
      if (!this.cache.has(u)) { const i = new Image(); i.decoding = "async"; i.src = u; this.cache.set(u, i); }
    }
  }
  /** show statue s, beat b (or nothing: s < 0) */
  show(s: number, b: number) {
    const u = s < 0 ? "" : this.url(s, b);
    if (u === this.shown) return;
    const img = u ? this.cache.get(u) : undefined;
    if (u && !(img?.complete && img.naturalWidth)) { this.preload(s); this.hide(); return; }   // not here yet: stay on the raster
    this.shown = u;
    if (!u) { this.hide(); return; }
    this.on = (this.on + 1) % 2;
    const el = this.els[this.on], other = this.els[1 - this.on];
    el.src = u; el.classList.add("on"); other.classList.remove("on");
  }
  private hide() { this.shown = ""; for (const e of this.els) e.classList.remove("on"); }
}
