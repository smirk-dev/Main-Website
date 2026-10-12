import type { World, InstanceSet } from "./world";
import type { Terrain } from "./terrain";
import { BOUNDS } from "./player";

/** The exported forest is too thin and stops 30 m behind the spawn. This thickens it in the browser, deterministically:
 *  more trees through the walkable forest, a belt of them all round it out to the mist, and grass, ferns and saplings
 *  over the whole walkable area rather than only along the trail. Copies reuse the exported species, so it costs no download. */

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Hash {   // points in 4 m buckets, for "anything within r?"
  private m = new Map<number, number[]>();
  private key(i: number, j: number) { return (i + 4096) * 8192 + (j + 4096); }
  add(x: number, z: number) { const k = this.key(Math.floor(x / 4), Math.floor(z / 4)); (this.m.get(k) ?? this.m.set(k, []).get(k)!).push(x, z); }
  near(x: number, z: number, r: number) {
    const i0 = Math.floor((x - r) / 4), i1 = Math.floor((x + r) / 4), j0 = Math.floor((z - r) / 4), j1 = Math.floor((z + r) / 4);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.m.get(this.key(i, j)); if (!a) continue;
      for (let k = 0; k < a.length; k += 2) if ((a[k] - x) ** 2 + (a[k + 1] - z) ** 2 < r * r) return true;
    }
    return false;
  }
}

export function densify(w: World, t: Terrain, clearings: { x: number; z: number; r: number }[], spawn: number[]) {
  const I = w.instances, sets = w.data.instances;
  const extra = new Map<InstanceSet, number[]>();
  const add = (s: InstanceSet, x: number, z: number, yaw: number, sc: number, sink: number) => {
    const c = Math.cos(yaw) * sc, n = Math.sin(yaw) * sc;
    // column-major 4×3: rotation about Y and uniform scale, then the position
    (extra.get(s) ?? extra.set(s, []).get(s)!).push(c, 0, -n, 0, sc, 0, n, 0, c, x, t.height(x, z) - sink, z);
  };
  const scaleOf = (s: InstanceSet) => { const o = s.offset / 4; return Math.hypot(I[o], I[o + 1], I[o + 2]); };

  // existing trunks and plants, so nothing new lands on top of them; and outside the detailed ground, onto the new terrain
  const trunks = new Hash(), small = new Hash();
  for (const s of sets) for (let k = 0; k < s.count; k++) {
    const o = s.offset / 4 + k * 12, x = I[o + 9], z = I[o + 11];
    if (s.kind === "tree" || s.kind === "prop" || s.kind === "sapling") trunks.add(x, z); else small.add(x, z);
    if (x < -45 || x > 45 || -z < -30 || -z > 110) I[o + 10] = t.height(x, z) - 0.05;
  }

  const solid = (x: number, z: number, r: number) => {
    const g = w.data.grid;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const i = Math.floor((x + dx - g.x0) / g.cs), j = Math.floor((-(z + dz) - g.y0) / g.cs);
      if (i >= 0 && j >= 0 && i < g.cx && j < g.cy && w.collide[j * g.cx + i] === 1) return true;
    }
    return false;
  };
  const inClearing = (x: number, z: number, f: number) => clearings.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * f) ** 2);
  const nearSpawn = (x: number, z: number, r: number) => (x - spawn[0]) ** 2 + (z - spawn[2]) ** 2 < r * r;
  const walk = (x: number, z: number, m: number) => x > BOUNDS.x0 - m && x < BOUNDS.x1 + m && z > BOUNDS.z0 - m && z < BOUNDS.z1 + m;

  // ---- trees: a jittered grid, closer inside the walkable forest, a little looser in the belt beyond it ----
  const species = sets.filter((s) => s.kind === "tree" && /^(fir|pine)_tree/.test(s.name));
  const R = rng(7);
  for (let z = -350; z < 175; z += 2.8) for (let x = -205; x < 210; x += 2.8) {
    const inner = walk(x, z, 12);
    if (!inner && R() < 0.5) { R(); R(); R(); continue; }   // the belt: a little looser than the walkable forest
    const px = x + (R() - 0.5) * 2.6, pz = z + (R() - 0.5) * 2.6;
    const yaw = R() * Math.PI * 2, pick = species[Math.floor(R() * species.length)];
    if (trunks.near(px, pz, inner ? 2.3 : 3.0)) continue;
    if (t.path(px, pz) > 0.02 || solid(px, pz, 1.2) || inClearing(px, pz, 0.85) || nearSpawn(px, pz, 4)) continue;
    trunks.add(px, pz);
    add(pick, px, pz, yaw, scaleOf(pick) * (0.85 + R() * 0.4), 0.05);
  }

  // ---- saplings, ferns and grass: the whole walkable area and a margin, at the density the trail already has ----
  const byKind = (re: RegExp) => sets.filter((s) => re.test(s.name));
  const strip = (x: number, z: number) => x > -22 && x < 22 && z > -60 && z < 16;   // the exported plants already cover this
  const fill = (list: InstanceSet[], step: number, keep: number, clear: number, seed: number, pathMax: number) => {
    const r = rng(seed);
    for (let z = BOUNDS.z0 - 22; z < BOUNDS.z1 + 22; z += step) for (let x = BOUNDS.x0 - 22; x < BOUNDS.x1 + 22; x += step) {
      const px = x + (r() - 0.5) * step, pz = z + (r() - 0.5) * step, a = r(), yaw = r() * Math.PI * 2, s = r(), pick = list[Math.floor(r() * list.length)];
      if (a > keep || strip(px, pz)) continue;
      if (t.path(px, pz) > pathMax || solid(px, pz, 0.35) || trunks.near(px, pz, clear) || inClearing(px, pz, 0.45)) continue;
      add(pick, px, pz, yaw, scaleOf(pick) * (0.8 + s * 0.45), 0.03);
    }
  };
  fill(byKind(/^grass/), 0.85, 0.95, 0.35, 11, 0.06);
  fill(byKind(/^fern/), 4.2, 0.85, 0.6, 12, 0.03);
  fill(byKind(/sapling/), 5.0, 0.8, 1.6, 13, 0.02);

  // ---- rebuild the instance blob with the new ones appended to each set ----
  let total = 0;
  for (const s of sets) total += s.count + (extra.get(s)?.length ?? 0) / 12;
  const out = new Float32Array(total * 12);
  let at = 0, added = 0;
  for (const s of sets) {
    out.set(I.subarray(s.offset / 4, s.offset / 4 + s.count * 12), at);
    const e = extra.get(s);
    if (e) { out.set(e, at + s.count * 12); s.count += e.length / 12; added += e.length / 12; }
    s.offset = at * 4; at += s.count * 12;
  }
  w.instances = out;
  return added;
}
