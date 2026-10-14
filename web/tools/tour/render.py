# Supersampled tour render: the game draws at 2x (3840x2160 for a 1920x1080 viewport), and each frame is averaged 2x2 down to
# 1920x1080 in the page (an exact-half drawImage = a box filter) and saved as JPEG q95. Kills needle aliasing and the trees'
# dissolve dither before the encoder sees them. One draw per pose (game.film.hold). usage: tour_render2.py <outdir> [stride] [first] [last] [aa]
import base64, json, os, sys, time
from playwright.sync_api import sync_playwright
out = sys.argv[1]; stride = int(sys.argv[2]) if len(sys.argv) > 2 else 1
F = json.load(open("tour_cam.json"))["frames"]
first = int(sys.argv[3]) if len(sys.argv) > 3 else 0; last = int(sys.argv[4]) if len(sys.argv) > 4 else len(F) - 1
aa = sys.argv[5] if len(sys.argv) > 5 else "1"
tree0 = float(sys.argv[6]) if len(sys.argv) > 6 else 40   # full trees out to here: the dissolve band moves into the mist
abias = sys.argv[7] if len(sys.argv) > 7 else "-1"   # sharper needle alpha: 2x supersampling does the smoothing, and 0.5 erased needles past 15 m
os.makedirs(out, exist_ok=True)
SHOT = """([x, z, yaw, pitch]) => new Promise(res => { const P = game.player; P.pos.x = x; P.pos.z = z; P.euler.set(pitch, yaw, 0);
  game.film.once = true;
  // the game's loop rAF runs first in the next frame and draws; this callback runs after it, before the buffer is presented
  requestAnimationFrame(() => {
    const c = window.__half || (window.__half = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }));
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(game.renderer.domElement, 0, 0, 1920, 1080);
    // never save a bad frame: a GPU reset (one frame over Windows' 2 s limit) loses the context and every later frame is black
    const px = g.getImageData(0, 0, 1920, 1080).data; let sum = 0; for (let i = 0; i < px.length; i += 4 * 997) sum += px[i] + px[i + 1] + px[i + 2];
    const bad = game.renderer.getContext().isContextLost() ? 'context lost' : game.renderer.getPixelRatio() !== 2 ? 'pixel ratio ' + game.renderer.getPixelRatio()
      : sum < 30 * (px.length / (4 * 997)) ? 'black frame' : '';
    res(bad ? 'BAD ' + bad : c.toDataURL('image/jpeg', 0.95));
  }); })"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=d3d11"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    pg.goto(f"http://localhost:5181/?forest&debug&aa={aa}&pr=2&abias={abias}", wait_until="networkidle")
    pg.wait_for_function("() => window.game && document.getElementById('loadtxt').textContent.includes('ready')", timeout=300000)
    pg.click("#enter"); pg.wait_for_timeout(1500)
    pg.evaluate("() => document.exitPointerLock()")   # unlocked: the frame-time fallback never fires
    pg.evaluate("(t) => { game.R.tree0 = t; }", tree0)
    pg.add_style_tag(content="#hud,#pause,#fps,#fade,.screen,#panel{display:none!important}")
    for k in range(0, len(F), max(1, len(F) // 12)):
        f = F[k]; pg.evaluate(SHOT, [f[0], f[1], f[2], -0.03]); pg.wait_for_timeout(200)
    pg.evaluate("() => { game.film.hold = true; }")
    f = F[first]; pg.evaluate(SHOT, [f[0], f[1], f[2], -0.03 + 0.05 * f[3]]); pg.wait_for_timeout(1500)
    print("canvas", pg.evaluate("() => [game.renderer.domElement.width, game.renderer.domElement.height]"), flush=True)
    t0 = time.time(); n = 0; slowest = (0, -1)
    for k in range(first, last + 1, stride):
        path = os.path.join(out, f"f{k:05d}.jpg")
        if os.path.exists(path): continue
        f = F[k]
        t1 = time.time(); d = pg.evaluate(SHOT, [f[0], f[1], f[2], -0.03 + 0.05 * f[3]])
        if d.startswith("BAD"): print("frame", k, d, "- stopping; the runner restarts the browser", flush=True); b.close(); sys.exit(3)
        slowest = max(slowest, (time.time() - t1, k))
        open(path, "wb").write(base64.b64decode(d.split(",", 1)[1])); n += 1
        if n % 50 == 0: print(f"{k}/{last}  {(time.time() - t0) / n:.2f} s/frame", flush=True)
    print("done", n, "frames", round(time.time() - t0), "s | slowest", round(slowest[0], 2), "s at", slowest[1], flush=True)
    b.close()
