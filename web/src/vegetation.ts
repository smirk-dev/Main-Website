import * as THREE from "three";
import type { World, InstanceSet } from "./world";
import { fixMaterials } from "./world";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Trees: full detail near, then a flat cut-out (impostor) to the edge of the mist. A decimated middle version was tried: it turns the branches into spikes. */
export const RANGE = { tree0: 15, tree: 95, sapling: 30, plant: 22, prop: 60 };

interface Part { mesh: THREE.InstancedMesh; mats: Float32Array }   // mats: precomputed instance×node matrices, 16 floats each
interface Set { def: InstanceSet; pos: Float32Array; lods: Part[][]; radius: number; lift: number; near: Uint8Array }

/** Every tree, plant and rock in the forest, drawn as GPU instances. Each frame only what is in view and in range is uploaded. */
export class Vegetation {
  readonly group = new THREE.Group();
  readonly trunks: { x: number; z: number; r: number }[] = [];
  private sets: Set[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  scale = 1;   // range multiplier for the quality tier

  constructor(w: World, private shadows: boolean) {
    const I = w.instances;
    const inst = new THREE.Matrix4();
    for (const def of w.data.instances) {
      const pos = new Float32Array(def.count * 3);
      const insts: THREE.Matrix4[] = [];
      for (let k = 0; k < def.count; k++) {
        const o = (def.offset / 4) + k * 12;
        inst.set(I[o], I[o + 3], I[o + 6], I[o + 9], I[o + 1], I[o + 4], I[o + 7], I[o + 10], I[o + 2], I[o + 5], I[o + 8], I[o + 11], 0, 0, 0, 1);
        insts.push(inst.clone());
        pos[k * 3] = I[o + 9]; pos[k * 3 + 1] = I[o + 10]; pos[k * 3 + 2] = I[o + 11];
        if (def.collide > 0) {
          const s = Math.hypot(I[o], I[o + 1], I[o + 2]);
          this.trunks.push({ x: I[o + 9], z: I[o + 11], r: def.collide * s });
        }
      }
      const lods: Part[][] = [];
      let radius = 1.5, lift = 0.5;
      for (const f of def.kind === "tree" ? def.files.slice(0, 1) : def.files) {
        const g = w.glbs.get(f);
        if (!g) continue;
        g.scene.updateMatrixWorld(true);
        fixMaterials(g.scene, { shadows: shadows && (def.kind === "tree" || def.kind === "prop"), plant: true });
        const box = new THREE.Box3().setFromObject(g.scene);
        const sz = box.getSize(new THREE.Vector3());
        radius = Math.max(radius, Math.hypot(sz.x, sz.y, sz.z) * 0.5); lift = sz.y * 0.5;
        const parts: Part[] = [];
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = new Float32Array(def.count * 16);
          for (let k = 0; k < def.count; k++) this.m4.multiplyMatrices(insts[k], m.matrixWorld).toArray(mats, k * 16);
          const im = new THREE.InstancedMesh(m.geometry, m.material, def.count);
          im.castShadow = m.castShadow;   // impostors don't cast (see impostor())
          im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.group.add(im);
          parts.push({ mesh: im, mats });
        });
        lods.push(parts);
      }
      if (def.impostor && def.bbox) lods.push([this.impostor(def, insts)]);
      this.sets.push({ def, pos, lods, radius, lift, near: new Uint8Array(def.count) });
    }
  }

  /** Two crossed cut-out cards carrying a render of the whole tree, sized to match the render's framing (see export_web.py). */
  private impostor(def: InstanceSet, insts: THREE.Matrix4[]): Part {
    const [x0, y0, z0, x1, y1, z1] = def.bbox!;
    const S = Math.max(y1 - y0, 2 * Math.max(x1 - x0, z1 - z0));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const a = new THREE.PlaneGeometry(S / 2, S).translate(cx, cy, cz);
    const b = new THREE.PlaneGeometry(S / 2, S).translate(-cx, 0, 0).rotateY(Math.PI / 2).translate(cx, cy, cz);
    const geo = mergeGeometries([a, b])!;
    const tex = new THREE.TextureLoader().load("/assets/" + def.impostor);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xb8b8b0 });
    const im = new THREE.InstancedMesh(geo, mat, def.count);
    im.castShadow = this.shadows;   // or tree shadows on the ground switch on and off at the detail distance
    im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(im);
    const mats = new Float32Array(def.count * 16);
    insts.forEach((m, k) => m.toArray(mats, k * 16));
    return { mesh: im, mats };
  }

  private last = new THREE.Vector3(1e9, 0, 0);
  private lastDir = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private lastScale = 1;

  /** Choose and upload the visible instances, but only once the walker has moved or turned enough to matter:
   *  the cull uses a widened view (fov margin + bigger spheres) so a few frames of turning never show a gap.
   *  Nothing pops: trees run to where the mist has fully swallowed them; small things shrink away over the last
   *  quarter of their range; the detail/impostor swap has a 2 m dead band so standing near the line never flickers.
   *  `scale` (quality) only shortens the near ranges, never the far edge. */
  update(camera: THREE.PerspectiveCamera) {
    const cp = camera.position;
    camera.getWorldDirection(this.dir);
    if (cp.distanceTo(this.last) < 0.5 && this.dir.dot(this.lastDir) > 0.995 && this.scale === this.lastScale) return;
    this.last.copy(cp); this.lastDir.copy(this.dir); this.lastScale = this.scale;
    const wide = camera.clone(); wide.fov = Math.min(150, camera.fov + 25); wide.updateProjectionMatrix(); wide.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(wide.projectionMatrix, camera.matrixWorldInverse));
    const tmp = new Float32Array(16);
    const buckets: number[][] = [[], [], [], []];   // impostors drawn near to far: the near cards hide the far ones before they are shaded
    for (const s of this.sets) {
      const k = s.def.kind, tree = k === "tree";
      const far = tree ? RANGE.tree : (k === "sapling" ? RANGE.sapling : k === "plant" ? RANGE.plant : RANGE.prop) * this.scale;
      const r0 = RANGE.tree0 * this.scale, fade = far * 0.75;
      const counts = s.lods.map(() => 0);
      for (let i = 0; i < s.def.count; i++) {
        const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2];
        const d = Math.hypot(x - cp.x, z - cp.z);
        if (d > far) { s.near[i] = 0; continue; }
        if (tree) s.near[i] = d < r0 - 1 ? 1 : d > r0 + 1 ? 0 : s.near[i];
        this.sphere.center.set(x, y + s.lift, z); this.sphere.radius = s.radius + 1;
        if (d > 7 && !this.frustum.intersectsSphere(this.sphere)) continue;   // the few just behind still cast their shadows forward
        const l = !tree || s.near[i] ? 0 : s.lods.length - 1;
        if (l > 0) { buckets[Math.min(3, Math.floor(d / 22))].push(i); continue; }
        const f = tree || d < fade ? 1 : Math.max(0.02, (far - d) / (far - fade));
        for (const p of s.lods[l]) {
          let src = p.mats.subarray(i * 16, i * 16 + 16);
          if (f < 1) {   // shrink about the instance's own foot
            tmp.set(src);
            for (let e = 0; e < 11; e++) if (e % 4 !== 3) tmp[e] *= f;
            tmp[12] = x + (tmp[12] - x) * f; tmp[13] = y + (tmp[13] - y) * f; tmp[14] = z + (tmp[14] - z) * f;
            src = tmp;
          }
          p.mesh.instanceMatrix.array.set(src, counts[l] * 16);
        }
        counts[l]++;
      }
      if (tree) {
        const l = s.lods.length - 1;
        for (const b of buckets) { for (const i of b) { for (const p of s.lods[l]) p.mesh.instanceMatrix.array.set(p.mats.subarray(i * 16, i * 16 + 16), counts[l] * 16); counts[l]++; } b.length = 0; }
      }
      s.lods.forEach((parts, l) => parts.forEach((p) => {
        const im = p.mesh.instanceMatrix;
        p.mesh.count = counts[l]; p.mesh.visible = counts[l] > 0;
        if (counts[l] > 0) { im.clearUpdateRanges(); im.addUpdateRange(0, counts[l] * 16); im.needsUpdate = true; }   // upload only the used part
      }));
    }
  }
}
