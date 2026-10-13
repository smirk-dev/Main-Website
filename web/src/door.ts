import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/** Act II: the castle door alone in the black void (g2-scenes/door.html). Blender coords → three: (x, z, -y).
 *  Hovering Enter eases it a hand's width open and daylight spills across the floor; enter() swings it wide and walks the camera through. */
export class Door {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(23, 16 / 9, 0.1, 60);
  private left?: THREE.Object3D;
  private right?: THREE.Object3D;
  private day: THREE.SpotLight;
  private key: THREE.SpotLight;
  private rim: THREE.SpotLight;
  /** 0..1: the door's own light coming up out of the black at the end of Act I */
  reveal = 1;
  private angle = 0;     // current leaf swing, degrees
  private target = 0;
  private walking = -1;  // seconds into the walk-through, -1 = not started
  private from = new THREE.Vector3(0.6, 1.55, 8.5);
  private look = new THREE.Vector3(0, 1.45, 0);
  onThrough?: () => void;

  constructor() {
    this.scene.background = new THREE.Color(0x000000);
    this.camera.position.copy(this.from); this.camera.lookAt(this.look);

    // obsidian floor: near-black and glossy so the spill of light reads on it
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.22, metalness: 0 }));
    floor.position.z = 29.95; floor.receiveShadow = true; this.scene.add(floor);

    // the approved forest view, seen only through the doorway
    const tex = new THREE.TextureLoader().load("/assets/door/forest_plate.webp"); tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plate.position.set(0, 1.6, -6); this.scene.add(plate);

    // key (warm, front left) and rim (cool, behind right), as on the heroes; daylight from beyond the door
    const key = this.key = new THREE.SpotLight(0xffd19e, 260, 14, 0.6, 0.6, 2); key.position.set(-3.6, 4.2, 3.4); key.target.position.set(0, 1.4, 0);
    const rim = this.rim = new THREE.SpotLight(0x9ebdff, 70, 12, 0.6, 0.7, 2); rim.position.set(3.4, 3.8, 1.2); rim.target.position.set(0, 1.4, 0);
    this.day = new THREE.SpotLight(0xffdbad, 0, 18, 0.75, 0.5, 1.4); this.day.position.set(0.2, 2.6, -2.4); this.day.target.position.set(0, 0, 4);
    this.day.castShadow = true; this.day.shadow.mapSize.set(1024, 1024); this.day.shadow.bias = -0.0005;
    this.scene.add(key, key.target, rim, rim.target, this.day, this.day.target, new THREE.AmbientLight(0xffffff, 0.04));
  }

  async load() {
    const g = await new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/")).loadAsync("/assets/door/door.glb");
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      // the void wall: pure black, it only exists to frame the doorway
      if (/void/.test((m.material as THREE.Material).name)) m.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
    });
    this.left = g.scene.getObjectByName("large_castle_door_left");
    this.right = g.scene.getObjectByName("large_castle_door_right");
    this.scene.add(g.scene);
  }

  /** Hovering Enter: a hand's width open. */
  ajar(on: boolean) { if (this.walking < 0) this.target = on ? 16 : 0; }

  /** Swing wide and walk through; onThrough fires as the camera crosses the threshold. */
  enter() { if (this.walking < 0) { this.target = 80; this.walking = 0; } }

  resize(aspect: number) {
    // the approved render's 50 mm lens, opened to about 38 mm so the words above and the choices below clear the door
    this.camera.aspect = aspect;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((18 / 38) / Math.max(aspect, 1.2)));
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    this.angle += (this.target - this.angle) * Math.min(1, dt * (this.walking >= 0 ? 1.8 : 3.5));
    if (this.left) this.left.rotation.y = THREE.MathUtils.degToRad(this.angle);
    if (this.right) this.right.rotation.y = -THREE.MathUtils.degToRad(this.angle);
    this.day.intensity = (220 * Math.min(1, this.angle / 16) + 160 * Math.max(0, (this.angle - 16) / 64)) * this.reveal;
    this.key.intensity = 260 * this.reveal; this.rim.intensity = 70 * this.reveal;
    if (this.walking >= 0) {
      this.walking += dt;
      // wait for the leaves to clear, then a slow push through the doorway, easing in
      const t = THREE.MathUtils.clamp((this.walking - 0.7) / 2.6, 0, 1), e = t * t * (3 - 2 * t);
      this.camera.position.set(THREE.MathUtils.lerp(0.6, 0, e), THREE.MathUtils.lerp(1.55, 1.6, e), THREE.MathUtils.lerp(8.5, -1.5, e));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 50, Math.min(1, dt * 1.2 * t)); this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 1.5, -6);
      if (t >= 1 && this.onThrough) { const f = this.onThrough; this.onThrough = undefined; f(); }
    }
  }

  /** 0 → 1 over the last part of the walk: the caller fades to the forest's mist colour with it. */
  get through() { return this.walking < 0 ? 0 : THREE.MathUtils.clamp((this.walking - 2.4) / 0.9, 0, 1); }
}
