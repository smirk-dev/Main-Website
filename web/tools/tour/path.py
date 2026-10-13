# The video tour's route: A* over the game's own collision (0.5 m grid, 1.25 m clearance (0.75 m brushed trunks), the trail cheaper), from the
# spawn through every place in order, plus the statue avenue. Writes tour_route.json (polyline + stops) and a top-down plot.
import json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
JS = r"""async ([order, vias]) => {
  const P = game.player, W = P.walls, T = P.ground.t;
  const CL = 1.25, S = 0.5, X0 = -40, X1 = 44, Z0 = -116, Z1 = 12;   // the fence
  const nx = Math.round((X1 - X0) / S) + 1, nz = Math.round((Z1 - Z0) / S) + 1;
  const free = new Uint8Array(nx * nz), cost = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = X0 + i * S, z = Z0 + j * S;
    free[j * nx + i] = (i > 1 && j > 1 && i < nx - 2 && j < nz - 2 && !W.hits(x, z, CL)) ? 1 : 0;
    cost[j * nx + i] = 1 + 1.6 * (1 - Math.min(1, T.path(x, z) * 2)) + (W.hits(x, z, CL + 0.6) ? 2.5 : 0) + (W.hits(x, z, CL + 1.4) ? 1.0 : 0); }
  const cell = (x, z) => [Math.round((x - X0) / S), Math.round((z - Z0) / S)];
  const nearestFree = (x, z, rmax = 14) => { const [ci, cj] = cell(x, z); let best = null, bd = 1e9;
    const RM = Math.round(rmax / S); for (let dj = -RM; dj <= RM; dj++) for (let di = -RM; di <= RM; di++) { const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= nx || j >= nz || !free[j * nx + i]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; } } return best; };
  const astar = (a, b) => { const N = nx * nz, g = new Float32Array(N).fill(1e30), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const s = a[1] * nx + a[0], t = b[1] * nx + b[0]; g[s] = 0; const open = [[0, s]];
    const h = (k) => Math.hypot(k % nx - b[0], Math.floor(k / nx) - b[1]);
    const push = (e) => { open.push(e); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    while (open.length) { const [, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === t) break;
      const i = k % nx, j = Math.floor(k / nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const q = jj * nx + ii; if (!free[q] || done[q]) continue;
        const ng = g[k] + Math.hypot(di, dj) * (cost[k] + cost[q]) / 2; if (ng < g[q]) { g[q] = ng; from[q] = k; push([ng + h(q), q]); } } }
    const out = []; for (let k = t; k !== -1; k = from[k]) out.push([X0 + (k % nx) * S, Z0 + Math.floor(k / nx) * S]); return out.reverse(); };
  const pts = [[P.pos.x, P.pos.z]], stops = [];
  let cur = nearestFree(P.pos.x, P.pos.z, 8); if (!cur) return { error: "spawn not free " + P.pos.x + "," + P.pos.z };
  for (const leg of order) {
    let goal;
    if (leg.via) goal = nearestFree(leg.x, leg.z, 6);
    else { const c = cell(leg.x, leg.z), rr = Math.max(4, leg.r * 0.8); let best = null, bd = 1e9;   // a free cell ~0.55 r from the centre, nearest the way we come from
      const [ci, cj] = cur;
      const W2 = Math.round(rr / S) + 16; for (let dj = -W2; dj <= W2; dj++) for (let di = -W2; di <= W2; di++) { const i = c[0] + di, j = c[1] + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz || !free[j * nx + i]) continue; const dc = Math.abs(Math.hypot(di, dj) * S - rr), dw = Math.hypot(i - ci, j - cj) * S;
        const sc = dc * 3 + dw * 0.15; if (sc < bd) { bd = sc; best = [i, j]; } } goal = best; }
    if (!goal) return { error: "no goal for " + JSON.stringify(leg) };
    const seg = astar(cur, goal); if (seg.length < 2) return { error: 'no path to ' + JSON.stringify(leg) };
    for (const q of seg.slice(1)) pts.push(q);
    if (!leg.via) stops.push({ key: leg.key, at: pts.length - 1, look: [leg.x, leg.z] });
    cur = goal;
  }
  // the grid for the plot
  const img = []; for (let j = 0; j < nz; j++) { let row = ''; for (let i = 0; i < nx; i++) row += free[j * nx + i] ? (T.path(X0 + i * S, Z0 + j * S) > 0.2 ? 't' : '.') : '#'; img.push(row); }
  return { pts, stops, grid: img, X0, Z0, S }; }"""
PLACES = {"landing": (-6.5, 15, 6), "earlier": (-22, 30, 7), "stories": (-2, 80, 9), "games": (-30, 88, 13), "work": (36, 85, 7), "art": (-8, 100, 6), "tools": (22, 96, 7)}
def place(k): x, y, r = PLACES[k]; return {"key": k, "x": x, "z": -y, "r": r}
ORDER = [place("landing"), place("earlier"), {"via": 1, "x": 0, "z": -40}, {"via": 1, "x": 1, "z": -58}, {"via": 1, "x": -1, "z": -68},
         place("stories"), place("games"), place("art"), place("tools"), place("work")]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=d3d11"]); pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.goto("http://localhost:5181/?forest&debug", wait_until="networkidle")
    pg.wait_for_function("() => window.game && document.getElementById('loadtxt').textContent.includes('ready')", timeout=240000)
    r = pg.evaluate(JS, [ORDER, []])
    b.close()
if "error" in r: print(r["error"]); raise SystemExit
g = r["grid"]; S, X0, Z0 = r["S"], r["X0"], r["Z0"]
im = Image.new("RGB", (len(g[0]) * 4, len(g) * 4), "white"); d = ImageDraw.Draw(im)
for j, row in enumerate(g):
    for i, ch in enumerate(row):
        if ch != ".": d.rectangle([i * 4, j * 4, i * 4 + 3, j * 4 + 3], fill=(40, 40, 40) if ch == "#" else (225, 200, 160))
px = lambda x, z: ((x - X0) / S * 4 + 2, (z - Z0) / S * 4 + 2)
d.line([px(x, z) for x, z in r["pts"]], fill=(220, 30, 30), width=3)
for s in r["stops"]:
    x, z = r["pts"][s["at"]]; d.ellipse([px(x, z)[0] - 6, px(x, z)[1] - 6, px(x, z)[0] + 6, px(x, z)[1] + 6], fill=(30, 90, 220)); d.text((px(x, z)[0] + 8, px(x, z)[1] - 6), s["key"], fill=(0, 0, 160))
im.save("g5/tour_route.png")
L = sum(((r["pts"][k + 1][0] - r["pts"][k][0]) ** 2 + (r["pts"][k + 1][1] - r["pts"][k][1]) ** 2) ** 0.5 for k in range(len(r["pts"]) - 1))
json.dump({"pts": r["pts"], "stops": r["stops"]}, open("tour_route.json", "w"))
print("route", round(L), "m,", len(r["pts"]), "points, stops", [s["key"] for s in r["stops"]])
