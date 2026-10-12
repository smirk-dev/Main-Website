import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { Terrain } from "./terrain";

const A = "/assets/";
/** pinholed scans shipped whole, no far copy (SPARSE in export_web.py) */
export const SPARSE = new Set(["ST_under_fire_of_war", "ST_vigeland_mother_child"]);
export const lod1 = (f: string) => f.replace(".glb", "_lod1.glb");

export interface InstanceSet { name: string; kind: "tree" | "sapling" | "plant" | "prop"; files: string[]; count: number; offset: number; collide: number; bbox: number[] | null; impostor: string | null }
export interface SceneData {
  grid: { x0: number; y0: number; hs: number; nx: number; ny: number; cs: number; cx: number; cy: number };
  sun: { dir: number[]; energy: number; color: number[] };
  lanterns: number[][];
  instances: InstanceSet[];
  statics: { name: string; file: string; matrix?: number[] }[];
  cameras: Record<string, { pos: number[]; target: number[] }>;
  spawn: number[];
  sky: string;
}

export interface World {
  data: SceneData;
  height: Float32Array;   // ny × nx, Blender XY: bx = x, by = -z
  path: Uint8Array;       // ny × nx, trail mask 0..255 (same grid as height)
  collide: Uint8Array;    // cy × cx
  instances: Float32Array;  // 12 floats per instance (column-major 4×3)
  glbs: Map<string, GLTF>;
}

/** Load everything, reporting progress 0..1. Files are fetched in parallel, a few at a time. */
export async function loadWorld(onProgress: (f: number, label: string) => void): Promise<World> {
  const draco = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const data: SceneData = await (await fetch(A + "scene.json")).json();
  const files = new Set<string>();
  for (const s of data.statics) if (s.name !== "ground") {   // the ground is built from height.bin (terrain.ts)
    files.add(s.file);
    if (/^S[TX]_/.test(s.name) && !SPARSE.has(s.name)) files.add(lod1(s.file));
  }
  for (const i of data.instances) for (const f of i.kind === "tree" ? i.files.slice(0, 1) : i.files) files.add(f);   // trees: full model + impostor only
  const list = [...files];
  let done = 0;
  const total = list.length + 4;
  const tick = (label: string) => onProgress(++done / total, label);

  const bin = async (f: string) => { const b = await (await fetch(A + f)).arrayBuffer(); tick(f); return b; };
  const [h, c, ins, pa] = await Promise.all([bin("height.bin"), bin("collide.bin"), bin("instances.bin"), bin("path.bin")]);

  const glbs = new Map<string, GLTF>();
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const f = list[next++];
      try { glbs.set(f, await loader.loadAsync(A + f)); }
      catch (e) { console.warn("skipped", f, e); }   // one bad file must not stop the forest
      tick(f.includes("ST_") ? "statues" : f.includes("SX_") ? "structures" : f.includes("trees/") ? "trees" : "the forest floor");
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { data, height: new Float32Array(h), path: new Uint8Array(pa), collide: new Uint8Array(c), instances: new Float32Array(ins), glbs };
}

/** Make exported materials behave in real time: alpha cards cut out (no sorting), everything lit by the environment. */
export function fixMaterials(root: THREE.Object3D, opts: { shadows: boolean; receive?: boolean; plant?: boolean }) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = opts.shadows;
    m.receiveShadow = opts.receive ?? true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      // glTF transmission (the lantern brass, the glass orb) makes three.js draw the whole scene a second time,
      // every frame, for the refraction: it doubled the frame time. Glass is plain transparency instead.
      const tx = (mat as THREE.MeshPhysicalMaterial).transmission > 0;
      if (tx) (mat as THREE.MeshPhysicalMaterial).transmission = 0;
      const glass = /glass/i.test(mat.name) || (tx && !mat.map);
      if (mat.transparent && !glass && mat.map) {
        mat.transparent = false; mat.alphaTest = 0.3; mat.depthWrite = true; mat.side = THREE.DoubleSide;
        mat.alphaToCoverage = true;
      }
      if (glass) { mat.transparent = true; mat.opacity = Math.min(mat.opacity, 0.35); mat.depthWrite = false; }
      if (mat.map) mat.map.anisotropy = 4;
      // vegetation: the exporter maps a spare texture channel to metalness, which turns needles into dark metal
      if (opts.plant) {
        mat.metalness = 0; mat.metalnessMap = null;
        // needles and leaves are thin: fake the light coming through them, or backlit cards go black
        if (mat.alphaTest > 0 && mat.map) { mat.emissive.set(0x4a5a3a); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.55; }
      }
    }
  });
}

// ---- terrain and collision lookups (world x,z in three.js space) ----
export class Ground {
  constructor(private w: World, private t: Terrain) {}
  height(x: number, z: number): number { return this.t.height(x, z); }   // the same surface the terrain mesh is built from
  solid(x: number, z: number): boolean {
    const g = this.w.data.grid;
    const i = Math.floor((x - g.x0) / g.cs), j = Math.floor((-z - g.y0) / g.cs);
    if (i < 0 || j < 0 || i >= g.cx || j >= g.cy) return true;
    return this.w.collide[j * g.cx + i] === 1;
  }
}
