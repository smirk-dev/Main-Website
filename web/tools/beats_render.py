# The settled frame of every Act I beat, path traced in Cycles (D8): blender.exe -b heroes.blend -P beats_render.py -- [name ...]
# Same statue normalisation, light rig and camera poses as act1.py (the approved renders) at 1920x1080. The browser's
# raster camera uses identical poses (src/statues.ts), so when the scroll rests on a beat it can crossfade to this image.
import bpy, math, sys, os, json, time
import numpy as np
from mathutils import Vector
OUT = "C:/Users/surya/asset-src/main-website/beats/"
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100
sc.cycles.samples = 160; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.01; sc.cycles.use_denoising = True
sc.render.image_settings.file_format = "PNG"
KEY = bpy.data.objects["KEY"]; RIM = bpy.data.objects["RIM"]; FILL = bpy.data.objects["FILL"]
cam = bpy.data.objects["CAM"]; sc.camera = cam
FILL.data.energy = 0
K0, R0 = KEY.data.energy, RIM.data.energy
roots = {n: bpy.data.objects["STATUE_" + n] for n in ("engel", "milan_mourning", "maternal_affection")}
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
names = argv or list(roots)
def log(*a): print(*a, flush=True)

def bbox(root):
    pts = []
    for o in root.children_recursive:
        if o.type != "MESH" or len(o.data.vertices) == 0: continue
        n = len(o.data.vertices); co = np.empty(n * 3, dtype=np.float32); o.data.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)[::max(1, n // 20000)]
        M = np.array(o.matrix_world); pts.append(co @ M[:3, :3].T + M[:3, 3])
    P = np.concatenate(pts)
    return Vector(np.percentile(P, 1, axis=0).tolist()), Vector(np.percentile(P, 99, axis=0).tolist())

PLAN = {"engel": dict(side=+1, yaw=-38, close=(1.05, 0.93, 0.91, 70)), "milan_mourning": dict(side=-1, yaw=30), "maternal_affection": dict(side=+1, yaw=34)}
meta = {"sensor": cam.data.sensor_width, "fit": cam.data.sensor_fit}
for r in roots.values():
    for o in [r] + list(r.children_recursive): o.hide_render = True
for n in names:
    r = roots[n]
    for o in [r] + list(r.children_recursive): o.hide_render = False; o.hide_viewport = False
    bpy.context.view_layer.update()
    mn, mx = bbox(r); h = mx.z - mn.z
    if abs(h - 2.0) > 0.4:
        r.scale = tuple(v * 2.0 / h for v in r.scale); bpy.context.view_layer.update()
        mn, mx = bbox(r); r.location -= Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)); bpy.context.view_layer.update()
        mn, mx = bbox(r)
    base = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)); h = mx.z - mn.z
    s = h / 2.0
    KEY.location = base + Vector((2.4, -1.7, 3.0)) * s; RIM.location = base + Vector((-1.6, 1.9, 2.6)) * s
    for L in (KEY, RIM): L.rotation_euler = (base + Vector((0, 0, h * 0.55)) - L.location).to_track_quat("-Z", "Y").to_euler()
    p = PLAN[n]
    beats = [("emerge", p["yaw"] * 0.4, 2.6, 0.30, 0.55, 50, False, 0.20),
             ("reveal", p["yaw"], 2.35, 0.28, 0.47, 50, True, 0.20),
             ("close", p["yaw"] * 0.6, *p.get("close", (0.95, 0.80, 0.84, 85)), True, 0.16)]
    meta[n] = {"h": h, "base": list(base)}
    for name, yaw, dist, eye, look, lens, key_on, shift in beats:
        a = math.radians(yaw); d = Vector((math.sin(a), -math.cos(a), 0))
        cam.location = base + d * dist * h + Vector((0, 0, eye * h))
        cam.rotation_euler = (base + Vector((0, 0, look * h)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens; cam.data.shift_x = -p["side"] * shift; cam.data.shift_y = 0
        KEY.data.energy = K0 * s * s * (1.0 if key_on else 0.06)
        RIM.data.energy = R0 * s * s * (5.0 if not key_on else 1.0)
        f = OUT + f"{n}_{name}.png"
        if os.path.exists(f) and "--force" not in argv: continue
        sc.render.filepath = f; t = time.time()
        bpy.ops.render.render(write_still=True); log("RENDERED", n, name, round(time.time() - t), "s")
    for o in [r] + list(r.children_recursive): o.hide_render = True
json.dump(meta, open(OUT + "beats.json", "w"), indent=1, default=float)
