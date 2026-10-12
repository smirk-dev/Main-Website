import * as THREE from "three";
import type { World } from "./world";

/** The ground, one function for both what you see and what you walk on.
 *  Inside the detailed GROUND (Blender x ±45, y −30..110) it is the exported height grid; outside it eases into gentle
 *  rolling ground that runs on to the edge of the mist, so there is no seam, no step and no end of the world. */
const GX0 = -45, GX1 = 45, GY0 = -30, GY1 = 110;   // Blender XY of the detailed ground
const BLEND = 8;                                   // metres over which the detail hands over to the far ground

export function pathX(y: number) { return 2.2 * Math.sin(y * 0.07) + 1.2 * Math.sin(y * 0.19 + 1); }   // the trail's centre line (forest04.py)

// cheap smooth value noise, deterministic, same everywhere it is asked
function hash(i: number, j: number) { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
export function noise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class Terrain {
  private H: Float32Array;
  private P: Uint8Array;
  private g: World["data"]["grid"];
  constructor(w: World) { this.H = w.height; this.P = w.path; this.g = w.data.grid; }

  private grid(A: ArrayLike<number>, bx: number, by: number) {
    const g = this.g;
    const fx = (bx - g.x0) / g.hs, fy = (by - g.y0) / g.hs;
    const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.ny - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - i)), ty = Math.min(1, Math.max(0, fy - j));
    const a = A[j * g.nx + i], b = A[j * g.nx + i + 1], c = A[(j + 1) * g.nx + i], d = A[(j + 1) * g.nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  /** metres outside the detailed ground (0 inside) */
  private out(bx: number, by: number) { return Math.hypot(Math.max(0, GX0 - bx, bx - GX1), Math.max(0, GY0 - by, by - GY1)); }

  /** far ground: low swells, a few tens of centimetres, at the far trees' level */
  far(bx: number, by: number) { return -0.2 + 0.32 * (noise(bx * 0.045, by * 0.045) - 0.5) + 0.14 * (noise(bx * 0.13 + 7, by * 0.13 + 3) - 0.5); }

  /** ground height at three.js (x, z) */
  height(x: number, z: number) {
    const bx = x, by = -z, o = this.out(bx, by);
    const cx = Math.min(GX1, Math.max(GX0, bx)), cy = Math.min(GY1, Math.max(GY0, by));
    const near = this.grid(this.H, cx, cy);
    if (o <= 0) return near;
    return near + (this.far(bx, by) - near) * smooth(0, BLEND, o);
  }

  /** 0..1, how much of the trail is under (x, z): the exported mask inside, the main trail's line beyond it */
  path(x: number, z: number) {
    const bx = x, by = -z;
    let p = this.out(bx, by) <= 0 ? this.grid(this.P, bx, by) / 255 : 0;
    if (by > GY1 - 2 || by < GY0 + 2) p = Math.max(p, 1 - smooth(0.7, 1.9, Math.abs(bx - pathX(by))));
    return p;
  }

  /** One mesh from the forest out to the mist: 0.5 m cells on the detailed ground, widening steadily beyond it. */
  mesh(): THREE.Mesh {
    const lines = (lo: number, hi: number, min: number, max: number) => {
      const out: number[] = [];
      for (let v = lo; v <= hi + 1e-6; v += 0.5) out.push(v);
      let s = 0.5, v = hi; while (v < max) { if (v - hi > BLEND) s = Math.min(8, s * 1.15); v += s; out.push(v); }
      s = 0.5; v = lo; while (v > min) { if (lo - v > BLEND) s = Math.min(8, s * 1.15); v -= s; out.unshift(v); }
      return out;
    };
    const xs = lines(GX0, GX1, -260, 260), ys = lines(GY0, GY1, -240, 350);
    const nx = xs.length, ny = ys.length, n = nx * ny;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), mud = new Float32Array(n * 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, bx = xs[i], by = ys[j], x = bx, z = -by;
      pos[k * 3] = x; pos[k * 3 + 1] = this.height(x, z); pos[k * 3 + 2] = z;
      uv[k * 2] = bx / 3; uv[k * 2 + 1] = by / 3;   // the Cycles ground tiles every 3 m
      // as ground_mat: mud where the trail is, broken up by noise; plus a slow light/dark drift so the tiling never reads
      const nz = noise(bx * 0.066, by * 0.043) * 0.45 + 0.55;
      mud[k * 2] = Math.min(1, this.path(x, z) * nz * 2.2);
      mud[k * 2 + 1] = 0.86 + 0.24 * noise(bx * 0.08 + 11, by * 0.08 + 5);
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    let t = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[t++] = a; idx[t++] = b; idx[t++] = c; idx[t++] = b; idx[t++] = d; idx[t++] = c;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("mud", new THREE.BufferAttribute(mud, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const tl = new THREE.TextureLoader(), A = "/assets/ground/";
    const tex = (f: string, srgb: boolean) => {
      const t = tl.load(A + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const mat = new THREE.MeshStandardMaterial({ map: tex("leaves_diff.webp", true), normalMap: tex("leaves_nor.webp", false), roughness: 0.95, metalness: 0 });
    const mudMap = tex("mud_diff.webp", true), mudNor = tex("mud_nor.webp", false);
    mat.onBeforeCompile = (s) => {
      s.uniforms.mudMap = { value: mudMap }; s.uniforms.mudNor = { value: mudNor };
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 mud;\nvarying vec2 vMud;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMud = mud;");
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D mudMap;\nuniform sampler2D mudNor;\nvarying vec2 vMud;")
        .replace("#include <map_fragment>", `
          vec4 c0 = texture2D( map, vMapUv ), c1 = texture2D( mudMap, vMapUv );
          vec3 gc = mix( c0.rgb, c1.rgb, vMud.x ) * ( 1.0 + 0.2 * vMud.x );
          gc = mix( gc, gc * vec3( 0.9, 0.66, 0.45 ), 0.7 * vMud.x );
          diffuseColor.rgb *= gc * vMud.y;`)
        .replace("#include <normal_fragment_maps>", THREE.ShaderChunk.normal_fragment_maps.replace(
          "texture2D( normalMap, vNormalMapUv ).xyz", "mix( texture2D( normalMap, vNormalMapUv ).xyz, texture2D( mudNor, vNormalMapUv ).xyz, vMud.x )"));
    };
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true; m.name = "terrain";
    return m;
  }
}
