import * as THREE from "three";
import type { World, InstanceSet } from "./world";
import { fixMaterials } from "./world";
import type { Collision } from "./collide";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Trees: full detail near, then an impostor to the edge of the mist. A decimated middle version was tried: it turns the branches into spikes.
 *  Between tree0 − BAND and tree0 + BAND both are drawn and dissolve into each other, so no tree ever changes in one frame. */
export const RANGE = { tree0: 13, tree: 95, sapling: 30, plant: 22, prop: 60 };
const BAND = 2;   // so full detail still ends at 15 m, as before the dissolve
const SHADE = 0.55;   // how much sun reaches an impostor's crown, on average (matched to the shadow-mapped near trees)

/** The sky map's light on an up-facing and a down-facing surface (cosine-weighted mean radiance times pi): the
 *  environment's share of the trees' ambient, for the hand-lit impostors. */
function skyLight(tex: THREE.DataTexture) {
  const { data, width: W, height: H } = tex.image as { data: ArrayLike<number>; width: number; height: number };
  const half = data instanceof Uint16Array, up = [0, 0, 0], dn = [0, 0, 0];
  let wu = 0, wd = 0;
  for (let y = 0; y < H; y += 2) {
    const c = Math.cos((y + 0.5) / H * Math.PI), sn = Math.sqrt(1 - c * c);   // c: the sine of the elevation
    for (let x = 0; x < W; x += 2) {
      const o = (y * W + x) * 4, w = Math.abs(c) * sn, acc = c > 0 ? up : dn;
      for (let k = 0; k < 3; k++) acc[k] += w * (half ? THREE.DataUtils.fromHalfFloat(data[o + k]) : data[o + k]);
      if (c > 0) wu += w; else wd += w;
    }
  }
  return { up: new THREE.Color(up[0] / wu, up[1] / wu, up[2] / wu).multiplyScalar(Math.PI), dn: new THREE.Color(dn[0] / wd, dn[1] / wd, dn[2] / wd).multiplyScalar(Math.PI) };
}
const IMP_N = 8, IMP_W = 256, IMP_H = 512;   // impostor views round each tree, and the size of each view

interface Part { mesh: THREE.InstancedMesh; mats: Float32Array; fade?: THREE.InstancedBufferAttribute; ring?: Ring }   // mats: instance×node matrices, 16 floats each
/** RING buffers per instanced attribute, used in turn: writing into the one the GPU drew from a frame ago stalled ANGLE/D3D11
 *  ~120 ms on every update (Iris Xe), i.e. a hitch every half metre of walking. With three, the one written is idle. */
interface Ring { k: number; m: THREE.InstancedBufferAttribute[]; f: THREE.InstancedBufferAttribute[]; n: number; nf: number }
const RING = 3;
interface Set { def: InstanceSet; pos: Float32Array; lods: Part[][]; radius: number; lift: number }

// screen-space noise for the dissolve: the near tree keeps the pixels below its weight, the impostor the rest
const IGN = "float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }\n";

const Q = new URLSearchParams(location.search);
/** Cut-out cards (needles, leaves) take their alpha from a mip this much blurrier than their colour: a needle thinner than a
 *  pixel then reads as part of a clump instead of a speckle of lone pixels (there's no MSAA to average it). ?abias= for tests. */
const ABIAS = Number(Q.get("abias") ?? 0.5).toFixed(2);   // 1.25 and 0.8 turned crowns into dark blobs; 0.5 keeps the needles
/** impostors: blend the two nearest of the eight views (default), or ?imp=dither for the old per-pixel pick between them */
const IMP_DITHER = Q.get("imp") === "dither";

/** Lets a detailed tree dissolve out pixel by pixel as its impostor dissolves in (per-instance `ifade`, 1 = all detail). */
function dissolve(mat: THREE.Material) {
  const cut = (mat as THREE.MeshStandardMaterial).alphaTest > 0 && !!(mat as THREE.MeshStandardMaterial).map;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float ifade;\nvarying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = ifade;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;\n" + IGN)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (ign(gl_FragCoord.xy) >= vFade) discard;");
    if (cut) sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      diffuseColor.a = opacity * texture2D(map, vMapUv, ${ABIAS}).a;`);
  };
  mat.needsUpdate = true;
}

/** Every tree, plant and rock in the forest, drawn as GPU instances. Each frame only what is in view and in range is uploaded. */
export class Vegetation {
  readonly group = new THREE.Group();
  private sets: Set[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private eye = new THREE.Vector3();   // the walker, for the impostors' shadow range
  scale = 1;   // range multiplier for the quality tier

  constructor(w: World, private shadows: boolean, private renderer: THREE.WebGLRenderer, private sunDir: THREE.Vector3,
              private light: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; env: THREE.DataTexture; envI: number }) {
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
      }
      const tree = def.kind === "tree";
      const lods: Part[][] = [];
      let radius = 1.5, lift = 0.5, imp: Part | undefined;
      for (const f of tree ? def.files.slice(0, 1) : def.files) {
        const g = w.glbs.get(f);
        if (!g) continue;
        g.scene.updateMatrixWorld(true);
        fixMaterials(g.scene, { shadows: shadows && (tree || def.kind === "prop"), plant: true });
        const box = new THREE.Box3().setFromObject(g.scene);
        const sz = box.getSize(new THREE.Vector3());
        radius = Math.max(radius, Math.hypot(sz.x, sz.y, sz.z) * 0.5); lift = sz.y * 0.5;
        if (tree) imp = this.impostor(g.scene, def.count, insts);   // baked from this very mesh, before it is instanced
        const parts: Part[] = [];
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = new Float32Array(def.count * 16);
          for (let k = 0; k < def.count; k++) this.m4.multiplyMatrices(insts[k], m.matrixWorld).toArray(mats, k * 16);
          const im = new THREE.InstancedMesh(m.geometry, m.material, def.count);
          im.castShadow = m.castShadow;
          im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          let fade: THREE.InstancedBufferAttribute | undefined;
          if (tree) {
            fade = new THREE.InstancedBufferAttribute(new Float32Array(def.count).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
            m.geometry.setAttribute("ifade", fade);
            for (const mt of [m.material].flat()) dissolve(mt);
          }
          this.group.add(im);
          parts.push({ mesh: im, mats, fade });
        });
        lods.push(parts);
      }
      if (imp) lods.push([imp]);
      this.sets.push({ def, pos, lods, radius, lift });
    }
  }

  /** Everything here a walker should bump into, at its real shape: trunks (the bark, not the needles), rocks, stumps, logs. */
  solids(c: Collision) {
    for (const s of this.sets) {
      const k = s.def.kind;
      if (k !== "tree" && k !== "prop") continue;
      for (const p of s.lods[0]) {
        if ([p.mesh.material].flat().every((m) => m.alphaTest > 0)) continue;   // cut-out cards: you brush through them
        for (let i = 0; i < s.def.count; i++)
          if (c.near(s.pos[i * 3], s.pos[i * 3 + 2], s.radius)) c.addGeometry(p.mesh.geometry, p.mats, i * 16, k === "tree");
      }
    }
  }

  /** An impostor made from the real-time tree itself, so near and far are the same tree under the same light:
   *  the lod0 mesh is rendered from IMP_N directions round its trunk (colour, and its normals for lighting),
   *  and drawn as one card that turns to face you, showing the view from your side and shaded by the scene's sun. */
  private impostor(root: THREE.Object3D, count: number, insts: THREE.Matrix4[]): Part {
    const r = this.renderer;
    // how far the tree reaches from its trunk, and from the ground up
    let R = 0.5, y0 = 1e9, y1 = -1e9;
    const v = new THREE.Vector3(), meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes.push(m);
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); R = Math.max(R, Math.hypot(v.x, v.z)); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    });
    y0 -= 0.05; y1 += 0.05; R += 0.05;
    const target = () => new THREE.WebGLRenderTarget(IMP_N * IMP_W, IMP_H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: 4 });
    const col = target(), nor = target();
    const orig = meshes.map((m) => m.material as THREE.MeshStandardMaterial);
    const cut = (m: THREE.MeshStandardMaterial) => (m.alphaTest > 0 && m.map ? 0.3 : -1);
    const albedo = orig.map((m) => new THREE.MeshBasicMaterial({ color: m.color, map: m.map, alphaTest: m.alphaTest > 0 ? 0.3 : 0, side: THREE.DoubleSide, vertexColors: m.vertexColors }));
    const normal = orig.map((m) => new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { map: { value: m.map }, cut: { value: cut(m) }, glow: { value: m.emissiveMap ? 1 : 0 } },
      vertexShader: "varying vec3 vN; varying vec2 vUv; void main() { vUv = uv; vN = mat3(modelMatrix) * normal; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D map; uniform float cut, glow; varying vec3 vN; varying vec2 vUv;\n" +
        "void main() { if (cut > 0.0 && texture2D(map, vUv).a < cut) discard; vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n * 0.5 + 0.5, glow); }",
    }));
    const scene = new THREE.Scene(), parent = root.parent;
    scene.add(root);
    const cam = new THREE.OrthographicCamera(-R, R, y1, y0, 0.1, 2 * R + 10);
    const prevTarget = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const passes: [THREE.WebGLRenderTarget, THREE.Material[], number][] = [[col, albedo, 0x141a10], [nor, normal, 0x8080ff]];
    for (const [t, mats, clear] of passes) {
      meshes.forEach((m, i) => { m.material = mats[i]; });
      r.setClearColor(clear, 0);
      for (let k = 0; k < IMP_N; k++) {
        const a = (k / IMP_N) * Math.PI * 2;
        cam.position.set(Math.sin(a) * (R + 5), 0, Math.cos(a) * (R + 5)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        t.viewport.set(k * IMP_W, 0, IMP_W, IMP_H); t.scissor.set(k * IMP_W, 0, IMP_W, IMP_H); t.scissorTest = true;
        r.setRenderTarget(t); r.clear(); r.render(scene, cam);
      }
    }
    meshes.forEach((m, i) => { m.material = orig[i]; });
    albedo.forEach((m) => m.dispose()); normal.forEach((m) => m.dispose());
    r.setRenderTarget(prevTarget); r.setClearColor(prevColor, prevAlpha);
    scene.remove(root); if (parent) parent.add(root);

    // the card: trunk on its centre line, as wide as the crown, ground to tip
    const geo = new THREE.PlaneGeometry(2 * R, y1 - y0).translate(0, (y0 + y1) / 2, 0);
    // Lit by hand, from the baked normals: the trees' own diffuse formula (sun + sky/ground, over pi, plus the needles' glow),
    // without three.js's light loop and shadow lookups, which on thousands of cards cost more than the rest of the forest.
    // SHADE stands in for the canopy shadow the near trees get from the shadow map.
    const mat = new THREE.MeshBasicMaterial({ map: col.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    const { sun, hemi, env, envI } = this.light, sky = skyLight(env);
    const lit = {
      uSunCol: { value: sun.color.clone().multiplyScalar(sun.intensity) }, uSunDir: { value: this.sunDir },
      uSky: { value: hemi.color.clone().multiplyScalar(hemi.intensity).add(sky.up.multiplyScalar(envI)) },
      uGnd: { value: hemi.groundColor.clone().multiplyScalar(hemi.intensity).add(sky.dn.multiplyScalar(envI)) },
      uGlow: { value: new THREE.Color(0x4a5a3a).multiplyScalar(0.55) }, uShade: { value: SHADE },
    };
    const vert = (eye: string) => `
      vec3 ip = instanceMatrix[3].xyz; float sc = length(instanceMatrix[0].xyz);
      vec3 ax = instanceMatrix[0].xyz / sc, az = instanceMatrix[2].xyz / sc;
      vec3 toC = ${eye}; toC.y = 0.0; toC = normalize(toC);
      vec3 rt = vec3(toC.z, 0.0, -toC.x);
      vec3 wp = ip + (rt * transformed.x + vec3(0.0, transformed.y, 0.0)) * sc;
      vFrame = mod(atan(dot(toC, ax), dot(toC, az)) / 6.2831853 * uN + uN, uN);
      vAx = ax; vAz = az;
      vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
      gl_Position = projectionMatrix * mvPosition;`;
    const decl = "uniform float uN;\nvarying float vFrame;\nvarying vec3 vAx;\nvarying vec3 vAz;\nvarying float vFade;\n";
    // the two nearest views, blended by angle, so walking round a tree never snaps (a per-pixel pick between them, the
    // first version, read as dither noise over every distant crown). iuv: the nearest view alone, for the shadow.
    const pick = `
      float f0 = floor(vFrame), ft = fract(vFrame), f1 = mod(f0 + 1.0, uN);
      ${IMP_DITHER ? "if (ign(gl_FragCoord.xy + vec2(23.0, 47.0)) < ft) f0 = f1; ft = 0.0;" : ""}
      float cu = clamp(vMapUv.x, 0.004, 0.996);
      vec2 uv0 = vec2((f0 + cu) / uN, vMapUv.y), uv1 = vec2((f1 + cu) / uN, vMapUv.y), iuv = ft < 0.5 ? uv0 : uv1;
      vec2 gx = dFdx(vMapUv) * vec2(1.0 / uN, 1.0), gy = dFdy(vMapUv) * vec2(1.0 / uN, 1.0);`;
    const uN = { value: IMP_N }, uNor = { value: nor.texture }, uSun = { value: this.sunDir }, uEye = { value: this.eye };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uN, uNor }, lit);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + decl + "attribute float ifade;")
        .replace("#include <project_vertex>", vert("cameraPosition - ip") + "\nvFade = ifade;")
        .replace("#include <worldpos_vertex>", "vec4 worldPosition = vec4(wp, 1.0);");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + decl + "uniform sampler2D uNor;\nuniform vec3 uSunCol, uSunDir, uSky, uGnd, uGlow;\nuniform float uShade;\n" + IGN)
        .replace("#include <map_fragment>", "if (ign(gl_FragCoord.xy) < vFade) discard;" + pick + `
          vec4 c0 = textureGrad(map, uv0, gx, gy), c1 = textureGrad(map, uv1, gx, gy);
          // colour from the views' own mips, weighted by their coverage so one view's empty texels don't grey the other's;
          // alpha from blurrier mips (see ABIAS)
          float ab = exp2(${ABIAS}), a0 = textureGrad(map, uv0, gx * ab, gy * ab).a, a1 = textureGrad(map, uv1, gx * ab, gy * ab).a;
          float w0 = c0.a * (1.0 - ft), w1 = c1.a * ft;
          diffuseColor *= vec4((c0.rgb * w0 + c1.rgb * w1) / max(w0 + w1, 1e-3), mix(a0, a1, ft));`)
        .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
          {
            vec4 impNor = mix(textureGrad(uNor, uv0, gx, gy), textureGrad(uNor, uv1, gx, gy), ft);
            vec3 ln = impNor.xyz * 2.0 - 1.0, wn = normalize(vAx * ln.x + vec3(0.0, ln.y, 0.0) + vAz * ln.z);
            vec3 irr = uSunCol * max(dot(wn, uSunDir), 0.0) * uShade + mix(uGnd, uSky, 0.5 * wn.y + 0.5);
            diffuseColor.rgb = diffuseColor.rgb * irr * RECIPROCAL_PI + uGlow * diffuseColor.rgb * impNor.a;
          }`);
    };
    // its shadow: the same card turned to face the sun
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: col.texture, alphaTest: 0.5 });
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uN, uSun, uEye });
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + decl + "uniform vec3 uSun, uEye;")
        // the shadow map only reaches ~30 m round the walker: cards beyond that would be drawn into it for nothing
        .replace("#include <project_vertex>", vert("uSun") + "\nif (distance(ip.xz, uEye.xz) > 34.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + decl + IGN)
        .replace("#include <map_fragment>", pick + "\ndiffuseColor *= textureGrad(map, iuv, gx, gy);");
    };
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("ifade", fade);
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.customDepthMaterial = depth;
    im.castShadow = this.shadows;   // or tree shadows on the ground switch on and off at the detail distance
    im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(im);
    const mats = new Float32Array(count * 16);
    insts.forEach((m, k) => m.toArray(mats, k * 16));
    return { mesh: im, mats, fade };
  }

  /** move a part on to the next buffer of its ring (made on first use) */
  private flip(p: Part) {
    const make = (n: number, size: number) => new THREE.InstancedBufferAttribute(new Float32Array(n), size).setUsage(THREE.DynamicDrawUsage);
    const r = (p.ring ??= { k: -1, m: [], f: [], n: p.mesh.instanceMatrix.array.length, nf: p.fade?.array.length ?? 0 });
    r.k = (r.k + 1) % RING;
    p.mesh.instanceMatrix = r.m[r.k] ??= make(r.n, 16);
    if (p.fade) { p.fade = r.f[r.k] ??= make(r.nf, 1); p.mesh.geometry.setAttribute("ifade", p.fade); }
  }

  private last = new THREE.Vector3(1e9, 0, 0);
  private lastDir = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private lastScale = 1;

  /** Choose and upload the visible instances, but only once the walker has moved or turned enough to matter:
   *  the cull uses a widened view (fov margin + bigger spheres) so a few frames of turning never show a gap.
   *  Nothing pops: trees run to where the mist has fully swallowed them; small things shrink away over the last
   *  quarter of their range; near the detail distance a tree is drawn both ways and dissolves from one into the other.
   *  `scale` (quality) only shortens the near ranges, never the far edge. */
  update(camera: THREE.PerspectiveCamera) {
    const cp = camera.position;
    this.eye.copy(cp);
    camera.getWorldDirection(this.dir);
    if (cp.distanceTo(this.last) < 0.5 && this.dir.dot(this.lastDir) > 0.995 && this.scale === this.lastScale) return;
    this.last.copy(cp); this.lastDir.copy(this.dir); this.lastScale = this.scale;
    for (const s of this.sets) for (const parts of s.lods) for (const p of parts) this.flip(p);
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
        if (d > far) continue;
        this.sphere.center.set(x, y + s.lift, z); this.sphere.radius = s.radius + 1;
        if (d > 7 && !this.frustum.intersectsSphere(this.sphere)) continue;   // the few just behind still cast their shadows forward
        if (tree) {
          // 1 = all detail, 0 = all impostor; in between both are drawn, dissolving into each other
          const t = Math.min(1, Math.max(0, (r0 + BAND - d) / (2 * BAND))), w = t * t * (3 - 2 * t);
          if (w < 1 && s.lods.length > 1) buckets[Math.min(3, Math.floor(d / 22))].push(i, w);
          if (w > 0 || s.lods.length < 2) {
            for (const p of s.lods[0]) { p.mesh.instanceMatrix.array.set(p.mats.subarray(i * 16, i * 16 + 16), counts[0] * 16); p.fade!.array[counts[0]] = s.lods.length > 1 ? w : 1; }
            counts[0]++;
          }
          continue;
        }
        const f = d < fade ? 1 : Math.max(0.02, (far - d) / (far - fade));
        for (const p of s.lods[0]) {
          let src = p.mats.subarray(i * 16, i * 16 + 16);
          if (f < 1) {   // shrink about the instance's own foot
            tmp.set(src);
            for (let e = 0; e < 11; e++) if (e % 4 !== 3) tmp[e] *= f;
            tmp[12] = x + (tmp[12] - x) * f; tmp[13] = y + (tmp[13] - y) * f; tmp[14] = z + (tmp[14] - z) * f;
            src = tmp;
          }
          p.mesh.instanceMatrix.array.set(src, counts[0] * 16);
        }
        counts[0]++;
      }
      if (tree && s.lods.length > 1) {
        const l = s.lods.length - 1;
        for (const b of buckets) {
          for (let j = 0; j < b.length; j += 2) {
            const i = b[j];
            for (const p of s.lods[l]) { p.mesh.instanceMatrix.array.set(p.mats.subarray(i * 16, i * 16 + 16), counts[l] * 16); p.fade!.array[counts[l]] = b[j + 1]; }
            counts[l]++;
          }
          b.length = 0;
        }
      }
      s.lods.forEach((parts, l) => parts.forEach((p) => {
        const im = p.mesh.instanceMatrix;
        p.mesh.count = counts[l]; p.mesh.visible = counts[l] > 0;
        if (counts[l] > 0) { im.clearUpdateRanges(); im.addUpdateRange(0, counts[l] * 16); im.needsUpdate = true; }   // upload only the used part
        if (counts[l] > 0 && p.fade) { p.fade.clearUpdateRanges(); p.fade.addUpdateRange(0, counts[l]); p.fade.needsUpdate = true; }
      }));
    }
  }
}
