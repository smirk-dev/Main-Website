/** The site's sound, always on (Suryansh, 2026-10-14: no toggle). Browsers only let a page make sound after a key or a
 *  click, so `start()` is called from the first one (the title screen's "press any key", or the forest's Enter).
 *  Two scenes, crossfaded:
 *   hero:   the statues and the door, a dark piece (public/assets/audio/hero.ogg)
 *   forest: walking music (music.ogg) over the wind-and-insects loop (forest.ogg, Gravity Sound, CC BY 4.0)
 *  Credits for the music: /archive/credits.html. Each file is fetched and decoded when its scene first plays; Web Audio
 *  loops them without a gap. A file that fails to load is left out: the rest still plays. */
type Scene = "hero" | "forest";
const TRACKS: Record<string, { url: string; level: number; scene: Scene }> = {
  hero: { url: "/assets/audio/hero.ogg", level: 0.8, scene: "hero" },
  music: { url: "/assets/audio/music.ogg", level: 0.55, scene: "forest" },
  ambience: { url: "/assets/audio/forest.ogg", level: 0.6, scene: "forest" },
};

export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private gains = new Map<string, GainNode>();
  private loading = new Set<string>();
  private scene: Scene = "hero";
  private ducked = false;

  /** from inside a key or click handler: the only moment a browser lets audio begin */
  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    }
    this.ctx.resume().catch(() => {});
    this.play(this.scene);
  }
  get started() { return !!this.ctx; }

  play(scene: Scene) {
    this.scene = scene;
    if (!this.ctx) return;
    for (const [k, t] of Object.entries(TRACKS)) {
      if (t.scene === scene && !this.gains.has(k)) this.load(k);
      this.fade(k, 2.5);
    }
  }

  /** quieter while an archive page or the map is open over the forest */
  duck(d: boolean) { this.ducked = d; for (const k of this.gains.keys()) this.fade(k, 0.6); }

  private fade(k: string, s: number) {
    const g = this.gains.get(k), t = TRACKS[k];
    if (!g || !this.ctx) return;
    const on = t.scene === this.scene ? t.level * (this.ducked ? 0.4 : 1) : 0;
    g.gain.setTargetAtTime(on, this.ctx.currentTime, s / 3);
  }

  private async load(k: string) {
    if (this.loading.has(k) || !this.ctx) return;
    this.loading.add(k);
    try {
      const buf = await this.ctx.decodeAudioData(await (await fetch(TRACKS[k].url)).arrayBuffer());
      const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master!);
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g); src.start();
      this.gains.set(k, g); this.fade(k, 2.5);
    } catch (e) { console.error("sound: " + k, e); }
  }
}
