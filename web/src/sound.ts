/** D6: the forest's sound, off until asked for (M in the forest, or the button on the pause screen); never on its own.
 *  One 49 s seamless loop of wind with insects under it (public/assets/audio/forest.ogg, Gravity Sound, CC BY 4.0).
 *  Fetched and decoded only the first time it is switched on; Web Audio, so the loop has no gap. */
export class Ambience {
  on = false;
  private ctx?: AudioContext;
  private gain?: GainNode;
  private level = 0.7;
  onchange?: (on: boolean, error?: boolean) => void;

  async toggle() {
    this.on = !this.on;
    this.onchange?.(this.on);
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(this.ctx.destination);
        const buf = await this.ctx.decodeAudioData(await (await fetch("/assets/audio/forest.ogg")).arrayBuffer());
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(this.gain); src.start();
      }
      if (this.on) await this.ctx.resume();
      this.apply(1.5);
    } catch (e) {
      console.error(e); this.on = false; this.onchange?.(false, true);
    }
  }
  /** quieter while an archive page is open over the forest */
  duck(d: boolean) { this.level = d ? 0.25 : 0.7; this.apply(0.6); }
  private apply(s: number) {
    if (!this.ctx || !this.gain) return;
    this.gain.gain.setTargetAtTime(this.on ? this.level : 0, this.ctx.currentTime, s / 3);
  }
}
