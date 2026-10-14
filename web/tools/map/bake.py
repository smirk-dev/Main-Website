# The forest map, baked from the scene itself: an orthographic top-down render of the ground, the trail, every statue and
# structure and the rocks and logs (no fog, trees hidden: from above their crowns would hide everything), plus every
# tree's position; and the same view with only the ground, so style.py can cut the structures out by difference. style.py turns that into the parchment map. Needs the dev server on :5181 (?debug exposes window.game).
# usage: python -I bake.py  -> map_raw.png, map_ground.png, map_trees.json (in the current directory)
import base64, json
from playwright.sync_api import sync_playwright
# the map's ground rectangle (three.js x / z), the walkable fence (player.ts BOUNDS) plus a margin of forest
X0, X1, Z0, Z1, PPM = -48, 48, -128, 24, 24   # PPM: pixels per metre
W, H = (X1 - X0) * PPM, (Z1 - Z0) * PPM
SHOT = """([X0, X1, Z0, Z1, W, H]) => {
  const T = game.THREE, r = game.renderer, s = game.scene;
  s.fog = null; s.background = new T.Color(0xbfc3c2);
  for (const st of game.statics) { st.obj.visible = true; if (st.mid) st.mid.visible = false; if (st.far) st.far.visible = false; for (const m of st.shells) m.visible = false; }
  // rocks, stumps and logs: every instance; the rest of the vegetation off
  for (const set of game.veg.sets) set.lods.forEach((parts, l) => parts.forEach((p) => {
    const on = set.def.kind === 'prop' && l === 0;
    p.mesh.visible = on;
    if (on) { p.mesh.instanceMatrix.array.set(p.mats); p.mesh.count = set.def.count; p.mesh.instanceMatrix.clearUpdateRanges(); p.mesh.instanceMatrix.needsUpdate = true; }
  }));
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  // the sun's shadows over the whole map, for relief
  const sun = game.sun; sun.position.set(cx, 0, cz).addScaledVector(game.sunDir, 150); sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, far: 400 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.map?.dispose(); sun.shadow.map = null;
  r.shadowMap.autoUpdate = true;
  const cam = new T.OrthographicCamera(X0 - cx, X1 - cx, (Z1 - Z0) / 2, -(Z1 - Z0) / 2, 1, 400);
  cam.position.set(cx, 200, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld();
  r.setPixelRatio(1); r.setSize(W, H, false); r.toneMapping = T.ACESFilmicToneMapping;
  const grab = () => { r.render(s, cam); const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(r.domElement, 0, 0); return c.toDataURL('image/png'); };
  const full = grab();
  // the ground alone: statues, structures, ruins and props off (the lantern lights stay, so their glow cancels out)
  const off = [];
  s.traverse((o) => { if (o.visible && (o.name === 'ruins_posts' || game.statics.some((st) => st.obj === o))) { o.visible = false; off.push(o); } });
  for (const set of game.veg.sets) for (const parts of set.lods) for (const p of parts) p.mesh.visible = false;
  const ground = grab();
  const trees = [];
  for (const set of game.veg.sets) if (set.def.kind === 'tree') for (let i = 0; i < set.def.count; i++) {
    const x = set.pos[i * 3], z = set.pos[i * 3 + 2];
    if (x > X0 && x < X1 && z > Z0 && z < Z1) trees.push([+x.toFixed(2), +z.toFixed(2), set.radius]);
  }
  return { png: full, ground, trees, gl: r.getContext().isContextLost() };
}"""
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", args=["--use-angle=d3d11"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.goto("http://localhost:5181/?forest&debug&aa=1", wait_until="domcontentloaded")
    pg.wait_for_function("() => window.game && document.getElementById('loadtxt').textContent.includes('ready')", timeout=300000)
    pg.evaluate("() => { game.film.hold = true; }")   # the loop stops drawing over us
    pg.wait_for_timeout(300)
    out = pg.evaluate(SHOT, [X0, X1, Z0, Z1, W, H])
    b.close()
assert not out["gl"], "context lost"
open("map_raw.png", "wb").write(base64.b64decode(out["png"].split(",", 1)[1]))
open("map_ground.png", "wb").write(base64.b64decode(out["ground"].split(",", 1)[1]))
json.dump({"rect": [X0, X1, Z0, Z1], "ppm": PPM, "trees": out["trees"]}, open("map_trees.json", "w"))
print("map_raw.png", W, "x", H, "|", len(out["trees"]), "trees")
