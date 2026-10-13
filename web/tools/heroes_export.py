# Act I heroes for the browser: blender.exe -b heroes.blend -P heroes_export.py -- [name ...]
# Each statue is normalised to a 2 m figure with its base at the origin (as act1.py did for the approved renders),
# its scan chunks merged into one mesh (decimating chunks alone tears a scan apart), welded, collapsed once, and
# written as Draco + WebP to web/public/assets/heroes/<name>.glb. Front stays -Y in Blender, i.e. +Z in three.js.
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector

OUT = "C:/Users/surya/OneDrive/Documents/Obsidian Vault/suryansh/coding_projects/Main-Website/web/public/assets/heroes/"
os.makedirs(OUT, exist_ok=True)
# faces kept, texture edge: the close beat fills the frame with a face, so the albedo stays at 4K
PLAN = {"engel": (240000, 4096), "milan_mourning": (280000, 4096), "maternal_affection": (240000, 4096)}
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
names = argv or list(PLAN)

def bbox(objs):
    # 1st-99th percentile of real vertices: scans carry stray fragments that wreck a plain bound_box
    pts = []
    for o in objs:
        n = len(o.data.vertices)
        if not n: continue
        co = np.empty(n * 3, dtype=np.float32); o.data.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)[::max(1, n // 20000)]
        M = np.array(o.matrix_world); pts.append(co @ M[:3, :3].T + M[:3, 3])
    P = np.concatenate(pts)
    return Vector(np.percentile(P, 1, axis=0).tolist()), Vector(np.percentile(P, 99, axis=0).tolist())

meta = {}
if os.path.exists(OUT + "heroes.json"): meta = json.load(open(OUT + "heroes.json"))
for n in names:
    faces, tex = PLAN[n]
    r = bpy.data.objects["STATUE_" + n]
    for o in [r] + list(r.children_recursive): o.hide_viewport = False; o.hide_set(False)   # hidden objects keep a stale matrix_world
    bpy.context.view_layer.update()
    ms = [o for o in r.children_recursive if o.type == "MESH" and len(o.data.polygons)]
    mn, mx = bbox(ms); h = mx.z - mn.z
    if abs(h - 2.0) > 0.4:
        r.scale = tuple(v * 2.0 / h for v in r.scale); bpy.context.view_layer.update()
        mn, mx = bbox(ms)
    base = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)); h = mx.z - mn.z

    # bake every chunk's world transform into one mesh, base at the origin
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for o in ms:
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
        c.parent = None; c.matrix_world = o.matrix_world.copy(); copies.append(c)
    for c in copies: c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = "hero_" + n
    j.data.transform(__import__("mathutils").Matrix.Translation(-base)); j.data.update()
    before = len(j.data.polygons)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.object.mode_set(mode="OBJECT")
    if len(j.data.polygons) > faces:
        d = j.modifiers.new("dec", "DECIMATE"); d.decimate_type = "COLLAPSE"; d.ratio = faces / len(j.data.polygons)
        bpy.ops.object.modifier_apply(modifier="dec")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    for s in j.material_slots:
        if not s.material or not s.material.use_nodes: continue
        for x in s.material.node_tree.nodes:
            if x.type == "TEX_IMAGE" and x.image and x.image.size[0] > tex:
                e = tex if "baseColor" in x.image.name else tex // 2
                x.image.scale(e, int(e * x.image.size[1] / x.image.size[0]))
    bpy.ops.object.select_all(action="DESELECT"); j.select_set(True)
    f = OUT + n + ".glb"
    bpy.ops.export_scene.gltf(filepath=f, export_format="GLB", use_selection=True, export_apply=True,
        export_image_format="WEBP", export_image_quality=82, export_draco_mesh_compression_enable=True,
        export_draco_position_quantization=16, export_draco_normal_quantization=12, export_draco_texcoord_quantization=14,
        export_cameras=False, export_lights=False, export_animations=False)
    lo, hi = bbox([j])
    meta[n] = {"h": round(h, 4), "faces": len(j.data.polygons), "bytes": os.path.getsize(f),
               "lo": [round(v, 3) for v in lo], "hi": [round(v, 3) for v in hi]}
    print("HERO", n, "h", round(h, 3), "faces", before, "->", len(j.data.polygons), "MB", round(os.path.getsize(f) / 1e6, 2), flush=True)
    bpy.data.objects.remove(j)
json.dump(meta, open(OUT + "heroes.json", "w"), indent=1)
