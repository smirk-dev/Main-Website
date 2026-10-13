# Render the tour offline in the game's own engine: one camera pose per frame from tour_cam.json, 1920x1080 (1600x900 css at
# 1 dpr; 1.2 dpr costs 1 s+ a frame and crashed the browser), MSAA on, full shadows every frame, no HUD. No real-time limit: each frame waits until it is drawn.
# usage: render.py <outdir> [stride] [first] [last]
import json, os, sys, time
from playwright.sync_api import sync_playwright
out = sys.argv[1]; stride = int(sys.argv[2]) if len(sys.argv) > 2 else 1
cam = json.load(open("tour_cam.json")); F = cam["frames"]
first = int(sys.argv[3]) if len(sys.argv) > 3 else 0; last = int(sys.argv[4]) if len(sys.argv) > 4 else len(F) - 1
os.makedirs(out, exist_ok=True)
POSE = """([x, z, yaw, pitch]) => new Promise(res => { const P = game.player; P.pos.x = x; P.pos.z = z; P.vel && P.vel.set(0, 0, 0);
  P.euler.set(pitch, yaw, 0); game.film.once = true;
  // the loop draws once in the next rAF; a 1-pixel read then waits for the GPU to finish it before the capture
  requestAnimationFrame(() => requestAnimationFrame(() => { const gl = game.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); res(game.renderer.getPixelRatio()); })); })"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=d3d11"])
    pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
    pg.goto("http://localhost:5181/?forest&debug&aa=1&pr=1", wait_until="networkidle")
    pg.wait_for_function("() => window.game && document.getElementById('loadtxt').textContent.includes('ready')", timeout=300000)
    pg.click("#enter"); pg.wait_for_timeout(1500)
    pg.evaluate("() => document.exitPointerLock()")   # unlocked: the frame-time fallback never fires, quality stays fixed
    pg.add_style_tag(content="#hud,#pause,#fps,#fade,.screen,#panel{display:none!important}")
    # warm: one pass over a few poses so the first real frame is not drawn mid-upload
    for k in range(0, len(F), max(1, len(F) // 12)):
        f = F[k]; pg.evaluate(POSE, [f[0], f[1], f[2], -0.03]); pg.wait_for_timeout(250)
    f = F[first]; pg.evaluate(POSE, [f[0], f[1], f[2], -0.03 + 0.05 * f[3]]); pg.wait_for_timeout(2000)   # settle where the chunk starts
    pg.evaluate("() => { game.film.hold = true; }")   # from here the loop draws only once per pose
    t0 = time.time(); n = 0
    for k in range(first, last + 1, stride):
        f = F[k]
        if os.path.exists(os.path.join(out, f"f{k:05d}.jpg")): continue
        pitch = -0.03 + 0.05 * f[3]   # lift the gaze a little as a structure comes up, so statues and doors sit in frame
        pr = pg.evaluate(POSE, [f[0], f[1], f[2], pitch])
        pg.screenshot(path=os.path.join(out, f"f{k:05d}.jpg"), type="jpeg", quality=92)
        n += 1
        if n % 50 == 0: print(f"{k}/{last}  {(time.time() - t0) / n:.2f} s/frame  pr {pr}", flush=True)
    print("done", n, "frames", round(time.time() - t0), "s", flush=True)
    b.close()
