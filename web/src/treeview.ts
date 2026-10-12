// dev-only: one exported tree on its own, every part in a separate colour-coded slot (?f=trees/x.glb&part=n)
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { fixMaterials } from "./world";
const q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ canvas: document.getElementById("c") as HTMLCanvasElement, antialias: true });
r.setSize(innerWidth, innerHeight, false); r.toneMapping = THREE.ACESFilmicToneMapping;
const s = new THREE.Scene(); s.background = new THREE.Color(0xbfc3c2);
s.add(new THREE.HemisphereLight(0xcfd6dc, 0x4a3a2a, 1.2)); const d = new THREE.DirectionalLight(0xffffff, 2.5); d.position.set(5, 10, 7); s.add(d);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/")).load("/assets/" + (q.get("f") ?? "trees/pine_tree_01_a_lod0.glb"), (g) => {
  fixMaterials(g.scene, { shadows: false, plant: true });
  const only = q.get("hide");
  g.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { console.log("part", (m.material as THREE.Material).name, m.geometry.index!.count / 3); if (only && (m.material as THREE.Material).name.includes(only)) m.visible = false; } });
  s.add(g.scene);
  const b = new THREE.Box3().setFromObject(g.scene), c = b.getCenter(new THREE.Vector3()), h = b.max.y - b.min.y;
  const y = Number(q.get("y") ?? 0.7);
  cam.position.set(c.x + h * 0.25, b.min.y + h * y, c.z + h * 0.25); cam.lookAt(c.x, b.min.y + h * y + 1, c.z);
  r.render(s, cam); (window as any).done = true;
});
