# bake.py's renders + the world's own height and trail grids -> the parchment map (public/assets/map/map.jpg + map.json).
#   ground: the real terrain as hill-shaded parchment (height.bin), the trail as a worn track (path.bin)
#   forest: every tree as an inked crown at its real position
#   structures: cut out of the top-down render by its difference from the ground-only render, toned to ink
# usage: python -I style.py <web/public/assets> [outdir]   (run where bake.py wrote map_raw.png, map_ground.png, map_trees.json)
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter
A = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(A, "map")
os.makedirs(OUT, exist_ok=True)
T = json.load(open("map_trees.json")); X0, X1, Z0, Z1 = T["rect"]; PPM = T["ppm"]
raw = np.asarray(Image.open("map_raw.png").convert("RGB"), np.float32)
gnd = np.asarray(Image.open("map_ground.png").convert("RGB"), np.float32)
H, W = raw.shape[:2]
g = json.load(open(os.path.join(A, "scene.json")))["grid"]
hgt = np.fromfile(os.path.join(A, "height.bin"), np.float32).reshape(g["ny"], g["nx"])
pth = np.fromfile(os.path.join(A, "path.bin"), np.uint8).reshape(g["ny"], g["nx"]).astype(np.float32) / 255
rng = np.random.default_rng(7)

# world position of every pixel; grids are Blender XY: bx = x, by = -z
x = X0 + (np.arange(W) + 0.5) / PPM; z = Z0 + (np.arange(H) + 0.5) / PPM
gi = np.clip((x - g["x0"]) / g["hs"], 0, g["nx"] - 1.001); gj = np.clip((-z - g["y0"]) / g["hs"], 0, g["ny"] - 1.001)
def sample(a):   # bilinear
    i0 = gi.astype(int); j0 = gj.astype(int); fi = gi - i0; fj = (gj - j0)[:, None]
    r0 = a[j0][:, i0] * (1 - fi) + a[j0][:, i0 + 1] * fi; r1 = a[j0 + 1][:, i0] * (1 - fi) + a[j0 + 1][:, i0 + 1] * fi
    return r0 * (1 - fj) + r1 * fj
h = sample(hgt); p = sample(pth)

def blur(a, r):
    return gaussian_filter(a.astype(np.float32), r)
def noise(scale, octaves=4):
    out = np.zeros((H, W), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        s = max(2, int(scale / 2 ** o)); n = rng.random((H // s + 2, W // s + 2)).astype(np.float32)
        out += amp * np.asarray(Image.fromarray(n, "F").resize((W + s, H + s), Image.BICUBIC), np.float32)[:H, :W]; tot += amp; amp *= 0.5
    return out / tot

# hill shade, light from the north-west, relief exaggerated (the forest floor only rolls a metre or two)
dzx = np.gradient(blur(h, 3), axis=1) * PPM; dzz = np.gradient(blur(h, 3), axis=0) * PPM
ex = 10.0; nx_, nz_, ny_ = -dzx * ex, -dzz * ex, np.ones_like(h)
ln = np.array([-0.55, -0.55, 0.63]); ln /= np.linalg.norm(ln)
shade = (nx_ * ln[0] + nz_ * ln[1] + ny_ * ln[2]) / np.sqrt(nx_ ** 2 + nz_ ** 2 + 1)
shade = (shade - shade.mean()) * 1.4

paper = np.array([231, 216, 184], np.float32); ink = np.array([58, 43, 28], np.float32)
blot = noise(420, 4); fibre = noise(6, 2)
tone = 1 + 0.16 * shade + 0.10 * (blot - 0.5) + 0.05 * (fibre - 0.5)
img = paper[None, None] * tone[..., None]

# the trail: a worn, darker track with an inked edge
pm = np.clip((blur(p, 2) - 0.12) / 0.3, 0, 1)
img = img * (1 - 0.22 * pm[..., None]) + np.array([150, 118, 80], np.float32) * 0.22 * pm[..., None]
edge = np.clip(np.abs(np.gradient(pm, axis=0)) + np.abs(np.gradient(pm, axis=1)), 0, 1) * 3
img = img * (1 - 0.35 * np.clip(edge, 0, 1)[..., None]) + ink * 0.35 * np.clip(edge, 0, 1)[..., None]

# the forest: an inked crown at every tree, a shadow to the south-east, a lighter cap
crowns = Image.new("L", (W, H), 0); caps = Image.new("L", (W, H), 0); shadow = Image.new("L", (W, H), 0)
dc, dk, ds = ImageDraw.Draw(crowns), ImageDraw.Draw(caps), ImageDraw.Draw(shadow)
for tx, tz, _ in T["trees"]:
    cx, cy = (tx - X0) * PPM, (tz - Z0) * PPM; r = PPM * (1.05 + 0.35 * rng.random())
    ds.ellipse([cx - r + r * 0.35, cy - r + r * 0.45, cx + r + r * 0.35, cy + r + r * 0.45], fill=150)
    dc.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    rc = r * 0.45; dk.ellipse([cx - rc - r * 0.25, cy - rc - r * 0.3, cx + rc - r * 0.25, cy + rc - r * 0.3], fill=255)
sh = np.asarray(shadow.filter(ImageFilter.GaussianBlur(PPM * 0.5)), np.float32) / 255
cr = np.asarray(crowns.filter(ImageFilter.GaussianBlur(PPM * 0.18)), np.float32) / 255
ck = np.asarray(caps.filter(ImageFilter.GaussianBlur(PPM * 0.35)), np.float32) / 255
needle = 0.7 + 0.6 * noise(5, 2)   # a little texture inside each crown
# a ragged edge: the crown is cut where the noise says, so no two are round
cr = np.clip((cr - 0.35 - 0.5 * (noise(14, 2) - 0.5)) / 0.3, 0, 1)
img = img * (1 - 0.30 * sh[..., None])
crown_col = np.array([78, 76, 50], np.float32)
a = (0.7 * cr * needle)[..., None]
img = img * (1 - a) + crown_col * a
img = img + (np.array([196, 186, 146], np.float32) - img) * (0.35 * ck * cr)[..., None]
# crown outlines: an ink ring where the crown's edge falls
ring = np.clip(np.abs(np.gradient(cr, axis=0)) + np.abs(np.gradient(cr, axis=1)), 0, 1) * 5
img = img * (1 - 0.4 * np.clip(ring, 0, 1)[..., None]) + ink * 0.4 * np.clip(ring, 0, 1)[..., None]

# the structures: what the ground-only render does not have, toned to ink on the paper
diff = np.abs(raw - gnd).max(axis=2)
m = Image.fromarray((diff > 22).astype(np.uint8) * 255, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5))
mk = np.asarray(m.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
lum = (raw @ np.array([0.3, 0.55, 0.15], np.float32)) / 255
lum = np.clip((lum - 0.12) / 0.7, 0, 1) ** 0.9
stone = ink[None, None] + (np.array([238, 228, 206], np.float32) - ink)[None, None] * lum[..., None]
# keep a trace of the real colour (the lanterns' glow, the moss), mostly ink
stone = stone * 0.82 + raw * 0.18
img = img * (1 - mk[..., None]) + stone * mk[..., None]
outline = np.clip(np.abs(np.gradient(mk, axis=0)) + np.abs(np.gradient(mk, axis=1)), 0, 1) * 2.2
img = img * (1 - 0.6 * np.clip(outline, 0, 1)[..., None]) + ink * 0.6 * np.clip(outline, 0, 1)[..., None]

# beyond the fence (player.ts BOUNDS): the map fades, as if not yet drawn in
BX0, BX1, BZ0, BZ1 = -40, 44, -116, 12
xx, zz = np.meshgrid(x, z)
out_d = np.maximum.reduce([BX0 - xx, xx - BX1, BZ0 - zz, zz - BZ1, np.zeros_like(xx)])
fade = np.clip(out_d / 6, 0, 1)[..., None] * 0.55
img = img * (1 - fade) + (paper * np.array([0.93, 0.9, 0.84]))[None, None] * fade
# aged edges: a burnt vignette
u = np.minimum.reduce([xx - X0, X1 - xx, zz - Z0, Z1 - zz]) / 6
vig = np.clip(1 - u, 0, 1) ** 1.6 * (0.6 + 0.4 * blot)
img = img * (1 - 0.55 * vig[..., None]) + np.array([92, 64, 38], np.float32) * 0.55 * vig[..., None]
img = np.clip(img + (rng.random((H, W, 1)) - 0.5) * 6, 0, 255).astype(np.uint8)
Image.fromarray(img).save(os.path.join(OUT, "map.jpg"), quality=86, optimize=True, progressive=True)
json.dump({"rect": [X0, X1, Z0, Z1], "ppm": PPM, "size": [W, H]}, open(os.path.join(OUT, "map.json"), "w"))
Image.fromarray(img).resize((W // 4, H // 4), Image.LANCZOS).save("map_small.png")
print("map.jpg", W, "x", H, os.path.getsize(os.path.join(OUT, "map.jpg")) // 1024, "KB")
