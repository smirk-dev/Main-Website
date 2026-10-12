import * as THREE from "three";
import type { Terrain } from "./terrain";
import { BOUNDS } from "./player";

/** What a walker bumps into, built in the browser from the very meshes on screen: every triangle of a statue, a wall, a
 *  trunk or a rock that passes between knee and head height marks the 10 cm cells under it. So you stop at the bark or
 *  the stone, not at a circle or a coarse cell around it, and low things (roots, pebbles, a fallen branch) can be stepped over. */
const CS = 0.1, LO = 0.3, HI = 1.8, MARGIN = 2;

export class Collision {
  private x0 = BOUNDS.x0 - MARGIN; private z0 = BOUNDS.z0 - MARGIN;
  private nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0 + 2 * MARGIN) / CS);
  private nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0 + 2 * MARGIN) / CS);
  private g = new Uint8Array(this.nx * this.nz);
  private local = new Map<THREE.BufferGeometry, Uint32Array>();   // per tree mesh: only the triangles low enough to matter
  tris = 0;

  constructor(private t: Terrain) {}

  /** Inside the grid's area (with r of slack)? Instances outside it can be skipped whole. */
  near(x: number, z: number, r: number) {
    return x > this.x0 - r && z > this.z0 - r && x < this.x0 + this.nx * CS + r && z < this.z0 + this.nz * CS + r;
  }

  /** Every mesh under root, at its world placement. Cut-out cards (leaves, needles, ivy sprays) are left out. */
  addObject(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      if ([m.material].flat().every((mt) => mt.alphaTest > 0)) return;
      this.addGeometry(m.geometry, m.matrixWorld.elements, 0);
    });
  }

  /** One placement of a geometry; e = column-major 4×4 at offset o. lowOnly: an upright plant on the ground,
   *  so only its bottom couple of metres (local y) can reach the walker — skips most of a tree's triangles. */
  addGeometry(geo: THREE.BufferGeometry, e: ArrayLike<number>, o: number, lowOnly = false) {
    const P = geo.attributes.position as THREE.BufferAttribute;
    let idx = lowOnly ? this.local.get(geo) : undefined;
    if (lowOnly && !idx) {
      const all = geo.index ? (geo.index.array as ArrayLike<number>) : Array.from({ length: P.count }, (_, i) => i);
      const keep: number[] = [];
      for (let k = 0; k + 2 < all.length; k += 3) {
        const a = all[k], b = all[k + 1], c = all[k + 2];
        if (Math.min(P.getY(a), P.getY(b), P.getY(c)) < 2.6) keep.push(a, b, c);
      }
      idx = new Uint32Array(keep); this.local.set(geo, idx);
    }
    const I = idx ?? (geo.index ? (geo.index.array as ArrayLike<number>) : null);
    const n = I ? I.length : P.count;
    const v = new Float32Array(9), r = new Float32Array(3);
    for (let k = 0; k + 2 < n; k += 3) {
      for (let q = 0; q < 3; q++) {
        const i = I ? I[k + q] : k + q, x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const wx = e[o] * x + e[o + 4] * y + e[o + 8] * z + e[o + 12];
        const wy = e[o + 1] * x + e[o + 5] * y + e[o + 9] * z + e[o + 13];
        const wz = e[o + 2] * x + e[o + 6] * y + e[o + 10] * z + e[o + 14];
        v[q * 3] = wx; v[q * 3 + 1] = wy; v[q * 3 + 2] = wz;
      }
      if (Math.max(v[0], v[3], v[6]) < this.x0 || Math.min(v[0], v[3], v[6]) > this.x0 + this.nx * CS ||
          Math.max(v[2], v[5], v[8]) < this.z0 || Math.min(v[2], v[5], v[8]) > this.z0 + this.nz * CS) continue;   // off the grid
      for (let q = 0; q < 3; q++) r[q] = v[q * 3 + 1] - this.t.height(v[q * 3], v[q * 3 + 2]);   // height above the ground
      if (Math.min(r[0], r[1], r[2]) > HI || Math.max(r[0], r[1], r[2]) < LO) continue;
      this.tris++;
      // sample the triangle finer than a cell and mark each sample that sits in the body's height band
      const l = Math.max(Math.hypot(v[3] - v[0], v[5] - v[2]), Math.hypot(v[6] - v[0], v[8] - v[2]), Math.hypot(v[6] - v[3], v[8] - v[5]));
      const s = Math.max(1, Math.ceil(l / (CS * 0.6)));
      for (let a = 0; a <= s; a++) for (let b = 0; a + b <= s; b++) {
        const u = a / s, w = b / s, c = 1 - u - w;
        const h = r[0] * c + r[1] * u + r[2] * w;
        if (h < LO || h > HI) continue;
        const x = v[0] * c + v[3] * u + v[6] * w, z = v[2] * c + v[5] * u + v[8] * w;
        const i = Math.floor((x - this.x0) / CS), j = Math.floor((z - this.z0) / CS);
        if (i >= 0 && j >= 0 && i < this.nx && j < this.nz) this.g[j * this.nx + i] = 1;
      }
    }
  }

  /** Does a body of radius rad standing at (x, z) touch anything? */
  hits(x: number, z: number, rad: number) {
    const i0 = Math.floor((x - rad - this.x0) / CS), i1 = Math.floor((x + rad - this.x0) / CS);
    const j0 = Math.floor((z - rad - this.z0) / CS), j1 = Math.floor((z + rad - this.z0) / CS);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return true;
      if (!this.g[j * this.nx + i]) continue;
      // nearest point of the cell to the centre
      const cx = Math.max(this.x0 + i * CS, Math.min(x, this.x0 + (i + 1) * CS)), cz = Math.max(this.z0 + j * CS, Math.min(z, this.z0 + (j + 1) * CS));
      if ((cx - x) ** 2 + (cz - z) ** 2 < rad * rad) return true;
    }
    return false;
  }
}
