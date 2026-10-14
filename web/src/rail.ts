import * as THREE from "three";
import type { Ground } from "./world";
import rail from "./rail.json";

const WALK = 3.0, RUN = 6.0, ACCEL = 8, FRICTION = 6, SENS = 0.0021, EYE = 1.65;
const SNAP = 2.5;   // let go within this many metres of a place and you drift onto its spot
/** The trail the walk keeps to (the scroll tour's own path, tools/tour/cam.py → src/rail.json): x, z every 0.5 m. */
export const RAIL = rail.pts as [number, number][];
const STEP = rail.step, END = (RAIL.length - 1) * STEP;
const STOPS = rail.stops.map((s) => s.s);

/** The desktop walker on rails: W/S (or the wheel) carry you along the trail, the mouse looks anywhere. Never leaving
 *  the trail is what the rest of the scene leans on: no collision to build, and nothing out of range of it is ever drawn. */
export class RailPlayer {
  readonly pos = new THREE.Vector3();
  readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  /** how far along the trail, m */
  s = 0;
  private v = 0;
  private sign = 1;   // which way along the trail W goes: towards where you look
  private wheel = 0;
  private keys = new Set<string>();
  private bob = 0;
  bobScale = 1;
  locked = false;

  constructor(private cam: THREE.PerspectiveCamera, private ground: Ground, private el: HTMLElement) {
    addEventListener("keydown", (e) => { this.keys.add(e.code); });
    addEventListener("keyup", (e) => { this.keys.delete(e.code); });
    addEventListener("blur", () => this.keys.clear());
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.euler.y -= e.movementX * SENS;
      this.euler.x = THREE.MathUtils.clamp(this.euler.x - e.movementY * SENS, -1.45, 1.45);
    });
    // a wheel notch is a nudge along the trail (down = on, the way a page scrolls)
    addEventListener("wheel", (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === this.el; if (!this.locked) { this.keys.clear(); this.wheel = 0; } });
    this.place();
  }

  /** x, z at arc length s, and the trail's heading there over a few metres (short enough to turn with it, long enough
   *  that the little out-and-back spurs at a place don't flip it) */
  private at(s: number, out: THREE.Vector3) {
    const f = THREE.MathUtils.clamp(s, 0, END) / STEP, i = Math.min(RAIL.length - 2, Math.floor(f)), t = f - i;
    out.set(RAIL[i][0] + (RAIL[i + 1][0] - RAIL[i][0]) * t, 0, RAIL[i][1] + (RAIL[i + 1][1] - RAIL[i][1]) * t);
    return out;
  }
  private tan = new THREE.Vector3(); private a = new THREE.Vector3(); private b = new THREE.Vector3();

  lookAt(x: number, y: number, z: number) {
    const d = new THREE.Vector3(x, y, z).sub(this.cam.position);
    this.euler.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0);
  }

  settle() { this.s = 0; this.v = 0; this.place(); this.pos.y = this.ground.height(this.pos.x, this.pos.z); }

  update(dt: number) {
    const k = this.keys;
    const f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const run = k.has("ShiftLeft") || k.has("ShiftRight");
    // W is "the way I'm looking": the trail's direction nearest the gaze, kept until the gaze is clearly the other way
    this.tan.subVectors(this.at(this.s + 4, this.a), this.at(this.s - 4, this.b)).setY(0);
    if (this.tan.lengthSq() > 4) {
      const dot = this.tan.normalize().x * -Math.sin(this.euler.y) + this.tan.z * -Math.cos(this.euler.y);
      if (Math.abs(dot) > 0.35 && f === 0) this.sign = Math.sign(dot);   // never flips mid-stride
    }
    let want = this.locked ? f * this.sign * (run ? RUN : WALK) : 0;
    if (this.wheel) { want = Math.sign(this.wheel) * this.sign * WALK; this.wheel -= Math.sign(this.wheel) * Math.min(Math.abs(this.wheel), dt * 6); }
    if (want === 0) {
      // let go near a place: glide onto its spot (a critically damped spring), so the place stops where the tour stops
      const near = STOPS.find((p) => Math.abs(p - this.s) < SNAP);
      if (near !== undefined) want = THREE.MathUtils.clamp((near - this.s) * 1.6, -WALK, WALK);
    }
    const rate = want !== 0 ? ACCEL : FRICTION;
    this.v += THREE.MathUtils.clamp(want - this.v, -rate * dt, rate * dt);
    this.s = THREE.MathUtils.clamp(this.s + this.v * dt, 0, END);
    if (this.s === 0 || this.s === END) this.v = 0;
    this.place();
    const gy = this.ground.height(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    const sp = Math.abs(this.v);
    this.bob += dt * sp * 2.1;
    const by = Math.sin(this.bob) * 0.035 * this.bobScale * Math.min(1, sp / WALK);
    this.cam.position.set(this.pos.x, this.pos.y + EYE + by, this.pos.z);
    this.cam.quaternion.setFromEuler(this.euler);
  }

  /** The place whose tour stop you are at (within 4 m of it along the trail): the stops frame a place from 7-24 m off,
   *  outside its own open radius, so main.ts lets a stop count as being there */
  stopKey(): string | null { return rail.stops.find((x) => Math.abs(x.s - this.s) < 4)?.key ?? null; }

  private place() { const y = this.pos.y; this.at(this.s, this.pos); this.pos.y = y; }
}
