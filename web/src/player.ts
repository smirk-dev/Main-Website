import * as THREE from "three";
import type { Ground } from "./world";

const WALK = 3.0, RUN = 6.0, ACCEL = 22, FRICTION = 14, SENS = 0.0021, EYE = 1.65, RADIUS = 0.32;
/** The walkable area: the part of the forest that was built. Beyond it the trees go on, but you can't. (three.js x / z) */
export const BOUNDS = { x0: -40, x1: 44, z0: -116, z1: 12 };

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private keys = new Set<string>();
  private bob = 0;
  private hash = new Map<string, { x: number; z: number; r: number }[]>();
  locked = false;

  constructor(private cam: THREE.PerspectiveCamera, private ground: Ground, trunks: { x: number; z: number; r: number }[], spawn: number[], private el: HTMLElement) {
    this.pos.set(spawn[0], 0, spawn[2]);
    for (const t of trunks) {   // 4 m buckets so each step only checks its neighbourhood
      const k = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`;
      (this.hash.get(k) ?? this.hash.set(k, []).get(k)!).push(t);
    }
    addEventListener("keydown", (e) => { this.keys.add(e.code); });
    addEventListener("keyup", (e) => { this.keys.delete(e.code); });
    addEventListener("blur", () => this.keys.clear());
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.euler.y -= e.movementX * SENS;
      this.euler.x = THREE.MathUtils.clamp(this.euler.x - e.movementY * SENS, -1.45, 1.45);
    });
    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === this.el; if (!this.locked) this.keys.clear(); });
  }

  lookAt(x: number, y: number, z: number) {
    const d = new THREE.Vector3(x, y, z).sub(this.cam.position);
    this.euler.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0);
  }

  private blocked(x: number, z: number): boolean {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return true;   // the invisible fence
    for (const [dx, dz] of [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS], [0.7 * RADIUS, 0.7 * RADIUS], [-0.7 * RADIUS, 0.7 * RADIUS], [0.7 * RADIUS, -0.7 * RADIUS], [-0.7 * RADIUS, -0.7 * RADIUS]])
      if (this.ground.solid(x + dx, z + dz)) return true;
    const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
    for (let i = bx - 1; i <= bx + 1; i++) for (let j = bz - 1; j <= bz + 1; j++)
      for (const t of this.hash.get(`${i},${j}`) ?? []) if (Math.hypot(x - t.x, z - t.z) < t.r + RADIUS) return true;
    return false;
  }

  update(dt: number) {
    const k = this.keys;
    const f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const s = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const run = k.has("ShiftLeft") || k.has("ShiftRight");
    const yaw = this.euler.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let wx = fx * f + rx * s, wz = fz * f + rz * s;
    const wl = Math.hypot(wx, wz);
    const speed = this.locked ? (run ? RUN : WALK) : 0;
    if (wl > 0) { wx = wx / wl * speed; wz = wz / wl * speed; }
    const dvx = wx - this.vel.x, dvz = wz - this.vel.z, dl = Math.hypot(dvx, dvz);
    const rate = wl > 0 ? ACCEL : FRICTION;
    if (dl > 1e-5) { const t = Math.min(1, rate * dt / dl); this.vel.x += dvx * t; this.vel.z += dvz * t; }

    // slide along whatever is in the way: try the full step, then each axis alone
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (!this.blocked(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (!this.blocked(nx, this.pos.z)) { this.pos.x = nx; this.vel.z = 0; }
    else if (!this.blocked(this.pos.x, nz)) { this.pos.z = nz; this.vel.x = 0; }
    else { this.vel.x = 0; this.vel.z = 0; }

    const gy = this.ground.height(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);   // smooth over the ground's small bumps
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * sp * 2.1;
    const by = Math.sin(this.bob) * 0.035 * Math.min(1, sp / WALK);
    this.cam.position.set(this.pos.x, this.pos.y + EYE + by, this.pos.z);
    this.cam.quaternion.setFromEuler(this.euler);
  }

  /** Free spawn spot: if the given one is inside something, step outward until it isn't. */
  settle() {
    for (let r = 0; r < 6; r += 0.25) for (let a = 0; a < 6.28; a += 0.4) {
      const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      if (!this.blocked(x, z)) { this.pos.x = x; this.pos.z = z; this.pos.y = this.ground.height(x, z); return; }
    }
  }
}
