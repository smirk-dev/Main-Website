import { PLACE_LIST } from "./places";
import { BOUNDS } from "./player";
import rail from "./rail.json";

/** The forest's map (M): the parchment baked from the scene itself (tools/map: bake.py → style.py → public/assets/map),
 *  every place marked where it stands, you as an arrow. Click a place, or anywhere inside the fence, to travel there. */
export interface Travel { x: number; z: number; look: [number, number] | null; name: string }

// the map image's ground rectangle (three.js x / z) and size, as style.py wrote them into map.json
const RECT = { x0: -48, x1: 48, z0: -128, z1: 24 };
const STOP = Object.fromEntries(rail.stops.map((s) => [s.key, s]));
const at = (s: number) => { const i = Math.min(rail.pts.length - 1, Math.round(s / rail.step)); return rail.pts[i]; };

export class ForestMap {
  readonly el: HTMLElement;
  private sheet: HTMLElement;
  private me: HTMLElement;
  private pin: HTMLElement;
  private go: HTMLButtonElement;
  private pick: Travel | null = null;
  open = false;
  onTravel?: (t: Travel) => void;
  onClose?: () => void;

  constructor() {
    this.el = document.getElementById("map")!;
    this.sheet = this.el.querySelector(".sheet") as HTMLElement;
    this.me = this.el.querySelector(".me") as HTMLElement;
    this.pin = this.el.querySelector(".pin") as HTMLElement;
    this.go = this.el.querySelector(".go") as HTMLButtonElement;
    for (const p of PLACE_LIST) {
      const st = STOP[p.key], spot = st ? at(st.s) : [p.x, -p.y];
      const b = document.createElement("button");
      b.className = p.x > 15 ? "grace west" : "grace"; b.type = "button";   // near the east edge the name goes on the left
      this.put(b, p.x, -p.y);
      b.innerHTML = `<i></i><span><b>${p.where}</b>${p.label}</span>`;
      b.onclick = (e) => { e.stopPropagation(); this.choose({ x: spot[0], z: spot[1], look: [p.x, -p.y], name: p.where }, p.x, -p.y); };
      this.sheet.appendChild(b);
    }
    this.sheet.onclick = (e) => {
      const r = this.sheet.getBoundingClientRect();
      const x = RECT.x0 + ((e.clientX - r.left) / r.width) * (RECT.x1 - RECT.x0);
      const z = RECT.z0 + ((e.clientY - r.top) / r.height) * (RECT.z1 - RECT.z0);
      if (x < BOUNDS.x0 + 1 || x > BOUNDS.x1 - 1 || z < BOUNDS.z0 + 1 || z > BOUNDS.z1 - 1) return;   // beyond the fence
      this.choose({ x, z, look: null, name: "" }, x, z);
    };
    this.go.onclick = () => this.travel();
    (this.el.querySelector(".close") as HTMLButtonElement).onclick = () => this.close();
    addEventListener("keydown", (e) => {
      if (!this.open || e.defaultPrevented) return;   // the press that opened it
      if (e.code === "Enter" && this.pick) { e.preventDefault(); this.travel(); }
      if (e.code === "Escape" || (e.code === "KeyM" && !e.repeat)) { e.preventDefault(); this.close(); }
    });
  }

  private put(el: HTMLElement, x: number, z: number) {
    el.style.left = `${((x - RECT.x0) / (RECT.x1 - RECT.x0)) * 100}%`;
    el.style.top = `${((z - RECT.z0) / (RECT.z1 - RECT.z0)) * 100}%`;
  }

  private choose(t: Travel, mx: number, mz: number) {
    this.pick = t; this.put(this.pin, mx, mz); this.pin.hidden = false;
    this.go.textContent = t.name ? `Travel to ${t.name}` : "Travel here"; this.go.hidden = false; this.go.focus();
  }

  private travel() { const t = this.pick; if (!t) return; this.pick = null; this.close(true); this.onTravel?.(t); }

  show(x: number, z: number, yaw: number) {
    this.open = true; this.el.hidden = false; this.pick = null; this.pin.hidden = true; this.go.hidden = true;
    this.put(this.me, x, z); this.me.style.setProperty("--yaw", `${-yaw}rad`);
  }

  close(travelling = false) {
    if (!this.open) return;
    this.open = false; this.el.hidden = true;
    if (!travelling) this.onClose?.();
  }
}
