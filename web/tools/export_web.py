"""forest_v09.blend -> browser assets for the walkable forest (web/public/assets).
glbs (WebP textures, decimated), instances.bin (every tree/plant transform), height.bin, collide.bin, scene.json.
Blender is Z-up; everything written here is already in three.js Y-up (x, z, -y) unless noted."""
import bpy, bmesh, json, math, os, sys, random, struct, time
import numpy as np
from mathutils import Vector, Matrix
OUT = "C:/Users/surya/OneDrive/Documents/Obsidian Vault/suryansh/coding_projects/Main-Website/web/public/assets/"
args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
ONLY = set(a for a in args if not a.startswith("-"))   # e.g. trees plants statics data sky
def want(k): return not ONLY or k in ONLY
for d in ("", "trees", "plants", "static"): os.makedirs(OUT+d, exist_ok=True)
def log(*a): print("X", *a, flush=True)
rng = random.Random(3)
C4 = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))   # Blender Z-up -> glTF Y-up
C4i = C4.inverted()
def to3(v): return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]

# ---------- materials: the glTF exporter only understands image -> BSDF. Rewire every input to its source image ----------
def upstream_image(sock, seen=None):
    seen = seen or set()
    for l in sock.links:
        n = l.from_node
        if n in seen: continue
        seen.add(n)
        if n.type == 'TEX_IMAGE' and n.image: return n
        for i in n.inputs:
            r = upstream_image(i, seen)
            if r: return r
    return None
# the scene's needle/leaf colour maps lost their cut-out masks on an earlier resize (JPEG data): swap in rebuilt RGBA copies
# (colour + Poly Haven's separate *_alpha map, composed into asset-src/main-website/textures_cut/)
CUT = "C:/Users/surya/asset-src/main-website/textures_cut/"
for im in bpy.data.images:
    if os.path.exists(CUT+im.name+".png"):
        im.filepath = CUT+im.name+".png"; im.source = 'FILE'; im.alpha_mode = 'STRAIGHT'; im.reload(); log("cut-out", im.name, im.channels, im.depth)
CARD = set()   # materials whose alpha cuts out a shape (needle cards, grass blades, leaves)
for m in bpy.data.materials:
    if not (m.use_nodes and m.node_tree): continue
    nt = m.node_tree; b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b: continue
    bc = b.inputs['Base Color']
    if bc.links and bc.links[0].from_node.type != 'TEX_IMAGE':
        img = upstream_image(bc)
        if img: nt.links.new(img.outputs['Color'], bc)
    a = b.inputs['Alpha']
    if a.links:
        img = upstream_image(a)
        if img: nt.links.new(img.outputs['Alpha'], a); CARD.add(m.name)
    rg = b.inputs['Roughness']
    if rg.links and rg.links[0].from_node.type not in ('TEX_IMAGE', 'SEPARATE_COLOR'):
        img = upstream_image(rg)
        if img: nt.links.new(img.outputs['Color'], rg)
    for k in ('Emission Strength',):
        pass
CARDWORDS = ("twig", "leaves", "branches", "grass", "fern", "needle")
for m in bpy.data.materials:   # cutouts whose transparency comes through a Transparent-BSDF mix instead of the Alpha input
    if not (m.use_nodes and m.node_tree) or not any(w in m.name.lower() for w in CARDWORDS): continue
    nt = m.node_tree; b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b: continue
    if not b.inputs['Alpha'].links:
        img = b.inputs['Base Color'].links[0].from_node if b.inputs['Base Color'].links else None
        if img is None or img.type != 'TEX_IMAGE':
            img = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        if img: nt.links.new(img.outputs['Alpha'], b.inputs['Alpha'])
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); nt.links.new(b.outputs[0], out.inputs['Surface'])
    CARD.add(m.name)
log("cards", sorted(CARD))

# images with no pixels (missing on disk) make the exporter write a texture with no source: unlink them
for m in bpy.data.materials:
    if not (m.use_nodes and m.node_tree): continue
    for n in list(m.node_tree.nodes):
        if n.type == 'TEX_IMAGE' and n.image and (n.image.name.startswith('rock_moss_set_02_rough') or n.image.size[0] == 0 or not n.image.has_data and not n.image.packed_file and not os.path.exists(bpy.path.abspath(n.image.filepath))):
            log("drop image", n.image.name); m.node_tree.nodes.remove(n)

# ---------- textures: cap sizes (shared images are scaled once) ----------
scaled = set()
def cap_images(objs, px):
    for o in objs:
        for s in getattr(o, 'material_slots', []):
            if not s.material or not s.material.use_nodes: continue
            for n in s.material.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.name not in scaled and n.image.size[0] > px:
                    w, h = n.image.size; f = px/max(w, h); n.image.scale(max(1, int(w*f)), max(1, int(h*f))); scaled.add(n.image.name)

# ---------- mesh reduction ----------
def split_by_material(o):
    """one object per material (so leaf cards and solid bark can be reduced differently)"""
    out = []
    me = o.data
    for mi, slot in enumerate(o.material_slots):
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mi], context='FACES')
        if not bm.faces: bm.free(); continue
        for f in bm.faces: f.material_index = 0
        nm = bpy.data.meshes.new(me.name+"_"+str(mi)); bm.to_mesh(nm); bm.free()
        nm.materials.append(slot.material)
        no = bpy.data.objects.new(o.name+"_"+str(mi), nm); no.matrix_world = o.matrix_world.copy(); out.append(no)
    return out
def thin_cards(o, keep, grow):
    """drop whole cards (connected islands) at random, enlarge the survivors so the canopy keeps its mass.
"""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    seen = set(); kill = []
    for f in bm.faces:
        if f.index in seen: continue
        isl = []; st = [f]; seen.add(f.index)
        while st:
            g = st.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); st.append(h)
        if rng.random() > keep: kill += isl
        elif grow != 1.0:
            vs = {v for g in isl for v in g.verts}; c = sum((v.co for v in vs), Vector())/len(vs)
            for v in vs: v.co = c+(v.co-c)*grow
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(o.data); bm.free()
def islands(bm):
    seen = set(); out = []
    for f in bm.faces:
        if f.index in seen: continue
        isl = []; st = [f]; seen.add(f.index)
        while st:
            g = st.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); st.append(h)
        out.append(isl)
    return out
def prune(o, budget):
    """drop the smallest separate pieces (twiglets, small branches) first; decimating thin cylinders makes spikes"""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    isl = sorted(islands(bm), key=len, reverse=True); kept = 0; kill = []
    for i in isl:
        if kept + len(i) <= budget or kept == 0: kept += len(i)
        else: kill += i
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(o.data); bm.free()
def collapse(o, ratio):
    if ratio >= 1: return
    m = o.modifiers.new("dec", 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
def weld(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(o.data); bm.free()
def ntris(o): return sum(len(p.vertices)-2 for p in o.data.polygons)

EXP = bpy.data.scenes.new("EXP")
def export(objs, path):
    for o in list(EXP.collection.objects): EXP.collection.objects.unlink(o)
    for o in objs: EXP.collection.objects.link(o)
    with bpy.context.temp_override(scene=EXP, view_layer=EXP.view_layers[0]):
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_active_scene=True, export_apply=True,
                                  export_image_format='WEBP', export_image_quality=82, export_cameras=False, export_lights=False,
                                  export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                                  export_animations=False, export_extras=False)
    log("glb", os.path.basename(path), round(os.path.getsize(path)/1e6, 2), "MB")

SPARSE = {"ST_under_fire_of_war", "ST_vigeland_mother_child"}   # pinholed photogrammetry: any collapse opens it into confetti, ship whole
def reduced_copy(src_objs, card_tris, card_grow, solid_tris, base=Matrix(), scan=False):
    """copies of src meshes (in base-relative space), cards thinned, solids collapsed so the whole set lands near solid_tris"""
    parts = []
    for o in src_objs:
        if o.type != 'MESH' or not o.data.polygons: continue
        tmp = o.copy(); tmp.data = o.data.copy(); tmp.matrix_world = base @ o.matrix_world
        tmp.parent = None; tmp.matrix_world = base @ o.matrix_world; tmp.modifiers.clear()
        parts += split_by_material(tmp) if len(o.material_slots) > 1 else [tmp]
    solids = [p for p in parts if not (p.material_slots and p.material_slots[0].material and p.material_slots[0].material.name in CARD)]
    cards = [p for p in parts if p not in solids]
    dead = [c for c in cards if 'dead_branches' in c.material_slots[0].material.name]
    cards = [c for c in cards if c not in dead]
    for c in dead: parts.remove(c); bpy.data.objects.remove(c)
    ct = sum(ntris(c) for c in cards)
    keep = min(1.0, card_tris/max(ct, 1))
    # survivors grow to cover what was dropped (area ~ 1/keep), capped so single cards don't turn into billboards
    for c in cards: thin_cards(c, keep, card_grow if card_grow else min(2.0, (1/keep) ** 0.5))
    if cards: log("cards", cards[0].name, ct, "->", round(keep, 3))
    if scan:   # Sketchfab scans arrive as chunks, each a random scatter of triangles over the whole statue: reduce them as one
        groups = {}
        for p in solids: groups.setdefault(p.material_slots[0].material.name if p.material_slots and p.material_slots[0].material else "", []).append(p)
        for g in groups.values():
            if len(g) < 2: continue
            bm = bmesh.new()
            for p in g: p.data.transform(p.matrix_world); p.matrix_world = Matrix(); bm.from_mesh(p.data)
            bm.to_mesh(g[0].data); bm.free()
            for p in g[1:]: solids.remove(p); parts.remove(p); bpy.data.objects.remove(p)

    st = sum(ntris(s) for s in solids)
    for s in solids:
        share = solid_tris * ntris(s) / max(st, 1)
        if scan: weld(s)                           # scans are triangle soup: every face its own island, so pruning shreds them
        else: prune(s, share * 1.6)                # whole small branches go first,
        collapse(s, min(1.0, share/max(ntris(s), 1)))   # then a light even reduction
    return parts

# ---------- impostors ----------
def impostor(col, lo, hi, path):
    S = bpy.data.scenes.new("IMP"); S.render.engine = 'CYCLES'; S.cycles.samples = 24; S.cycles.use_denoising = True
    S.render.film_transparent = True; S.render.resolution_x = 256; S.render.resolution_y = 512; S.render.image_settings.color_mode = 'RGBA'
    S.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new("impw"); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.9; S.world = w
    e = bpy.data.objects.new("e", None); e.instance_type = 'COLLECTION'; e.instance_collection = col; S.collection.objects.link(e)
    h = hi.z-lo.z; wd = max(hi.x-lo.x, hi.y-lo.y)
    cd = bpy.data.cameras.new("ic"); cd.type = 'ORTHO'; cd.ortho_scale = max(h, wd*2)
    cam = bpy.data.objects.new("ic", cd); S.collection.objects.link(cam); S.camera = cam
    c = (lo+hi)/2   # lo, hi are already relative to the instance origin
    cam.location = (c.x, c.y-60, c.z); cam.rotation_euler = (math.pi/2, 0, 0)
    sd = bpy.data.lights.new("is", 'SUN'); sd.energy = 3.5; so = bpy.data.objects.new("is", sd); S.collection.objects.link(so); so.rotation_euler = (math.radians(55), 0, math.radians(-25))
    S.render.filepath = path
    with bpy.context.temp_override(scene=S): bpy.ops.render.render(write_still=True)
    log("impostor", os.path.basename(path), round(cd.ortho_scale, 1))
    bpy.data.scenes.remove(S)

# ---------- instanced vegetation ----------
INST = {}
for o in bpy.data.objects:
    if o.instance_collection and o.instance_type == 'COLLECTION': INST.setdefault(o.instance_collection.name, []).append(o)
def kind(cname):
    if cname.startswith(("pine_tree", "fir_tree", "tree_small")): return "tree"
    if cname.startswith(("fir_sapling", "pine_sapling")): return "sapling"
    if cname.startswith(("grass", "fern")): return "plant"
    return "prop"   # rocks, stumps, roots, dead trunks, branches
# per kind: list of (lod name, card keep, card grow, solid tris, texture px)
# (lod, card triangles, card enlargement, solid triangles, texture px)
LODS = {"tree": [("lod0", 22000, 0, 10000, 512), ("lod1", 4000, 0, 2500, 512)],
        "sapling": [("lod0", 1200, 0, 400, 256)],
        "plant": [("lod0", 200, 0, 200, 256)],
        "prop": [("lod0", 1e9, 1.0, 6000, 512)]}
inst_meta = []; inst_blob = bytearray()
if want("trees") or want("plants") or want("data"):
    for cname, insts in sorted(INST.items()):
        k = kind(cname); col = bpy.data.collections[cname]
        if (k == "tree" and not want("trees") and not want("data")) or (k != "tree" and not want("plants") and not want("data")): continue
        src = [o for o in col.all_objects if o.type == 'MESH']
        base = Matrix.Translation(-col.instance_offset)
        files = []
        for (lod, keep, grow, st, px) in LODS[k]:
            fn = ("trees/" if k == "tree" else "plants/")+cname+"_"+lod+".glb"; files.append(fn)
            if (k == "tree" and want("trees")) or (k != "tree" and want("plants")):
                cap_images(src, px)
                parts = reduced_copy(src, keep, grow, st, base, scan=(k == "prop"))   # rocks/trunks/roots: pruning islands took half of each
                export(parts, OUT+fn)
                for p in parts: bpy.data.objects.remove(p)
        bb = None
        if k == "tree":
            pts = [o.matrix_world @ Vector(c) for o in src for c in o.bound_box]; pts = [base @ p for p in pts]
            lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
            bb = [lo.x, lo.z, -hi.y, hi.x, hi.z, -lo.y]
            if want("impostors"): impostor(col, lo, hi, OUT+"trees/"+cname+"_imp.png")
        # transforms: column-major 4x3 per instance, Y-up
        off = len(inst_blob)
        for o in insts:
            M = C4 @ o.matrix_world @ C4i
            for c in range(4):
                for r in range(3): inst_blob += struct.pack("<f", M[r][c])
        # the trunk a walker collides with: trees and the bigger props only
        r_col = {"tree": 0.32, "sapling": 0.0, "plant": 0.0}.get(k, 0.0)
        if k == "prop" and cname.startswith(("boulder", "tree_stump", "dead_tree")): r_col = 0.6
        inst_meta.append({"name": cname, "kind": k, "files": files, "bbox": bb, "impostor": ("trees/"+cname+"_imp.png") if k == "tree" else None, "count": len(insts), "offset": off, "collide": r_col})
        log("inst", cname, k, len(insts))

# ---------- statics: statues, structures, ruins, lantern posts, ground ----------
def roots(prefix): return [o for o in bpy.data.objects if o.name.startswith(prefix) and (o.parent is None or not o.parent.name.startswith(prefix[:3]))]
STATIC_BUDGET = {"ST_": 30000, "SX_": 24000}
static_meta = []
bpy.context.view_layer.update()
if want("statics") or want("data"):
    lantern_done = None
    for r in roots("ST_")+roots("SX_"):
        objs = [r]+list(r.children_recursive); meshes = [o for o in objs if o.type == 'MESH']
        if not meshes: continue
        is_lantern_clone = r.name.startswith("SX_landing_0.")
        centre = r.name.endswith("_0") and r.name.startswith("SX_")
        budget = STATIC_BUDGET[r.name[:3]]*(1.6 if centre else 1.0)
        if r.name.startswith("SX_landing_0"): budget = 4000
        fn = "static/"+r.name+".glb"
        if is_lantern_clone:   # same lantern, different place: reuse the file, transform in scene.json
            static_meta.append({"name": r.name, "file": "static/SX_landing_0.glb", "matrix": [x for c in (C4 @ r.matrix_world @ C4i @ (C4 @ bpy.data.objects['SX_landing_0'].matrix_world @ C4i).inverted()).col for x in c]})
            continue
        if want("statics"):
            cap_images(meshes, 1024 if (r.name.startswith("ST_") or centre) else 512)
            parts = reduced_copy(meshes, 1.0, 1.0, 1e9 if r.name in SPARSE else budget, scan=True)
            export(parts, OUT+fn)
            for p in parts: bpy.data.objects.remove(p)
            if r.name not in SPARSE:   # far version (> 40 m, half in the mist); the sparse scans just drop their backing shell there
                parts = reduced_copy(meshes, 1.0, 1.0, max(1500, budget*0.2), scan=True)
                export(parts, OUT+fn.replace(".glb", "_lod1.glb"))
                for p in parts: bpy.data.objects.remove(p)
        static_meta.append({"name": r.name, "file": fn})
    others = [o for o in bpy.data.objects if o.type == 'MESH' and (o.name == "RUINS" or o.name.startswith("Cylinder"))]
    if want("statics"):
        cap_images(others, 1024)
        parts = []
        for o in others:
            t = o.copy(); t.data = o.data.copy(); t.parent = None; t.matrix_world = o.matrix_world.copy(); parts.append(t)   # keeps the bevel modifier; export_apply bakes it
        export(parts, OUT+"static/ruins_posts.glb")
        for p in parts: bpy.data.objects.remove(p)
        g = bpy.data.objects['GROUND']; cap_images([g], 1024)
        t = g.copy(); t.data = g.data.copy(); t.modifiers.clear(); collapse(t, 0.6)
        export([t], OUT+"static/ground.glb"); bpy.data.objects.remove(t)
    static_meta.append({"name": "ruins_posts", "file": "static/ruins_posts.glb"})
    static_meta.append({"name": "ground", "file": "static/ground.glb"})

# ---------- walking data ----------
X0, X1, Y0, Y1 = -48.0, 48.0, -34.0, 138.0   # Blender XY extent of the data grids
if want("data"):
    g = bpy.data.objects['GROUND']; gf = bpy.data.objects['GROUND_FAR']; gfz = gf.location.z+gf.data.vertices[0].co.z
    HS = 0.5; nx = int((X1-X0)/HS)+1; ny = int((Y1-Y0)/HS)+1; H = np.zeros((ny, nx), np.float32)
    Mi = g.matrix_world.inverted()
    for j in range(ny):
        for i in range(nx):
            p = Vector((X0+i*HS, Y0+j*HS, 60)); hit, loc, n, idx = g.ray_cast(Mi @ p, Vector((0, 0, -1)))
            H[j, i] = (g.matrix_world @ loc).z if hit else gfz
    open(OUT+"height.bin", "wb").write(H.tobytes()); log("height", nx, ny)
    # trail mask on the same grid (the ground shader mixes mud in by it); GROUND's vertices sit on the 0.5 m lattice
    P = np.zeros((ny, nx), np.uint8); att = g.data.attributes['path']
    for v, d in zip(g.data.vertices, att.data):
        w = g.matrix_world @ v.co; i = round((w.x-X0)/HS); j = round((w.y-Y0)/HS)
        if 0 <= i < nx and 0 <= j < ny: P[j, i] = max(0, min(255, round(d.value*255)))
    open(OUT+"path.bin", "wb").write(P.tobytes()); log("path", int((P > 0).sum()))
    # collision grid: every surface of the static scene between ankle and head height blocks the cell under it
    CS = 0.25; cx = int((X1-X0)/CS); cy = int((Y1-Y0)/CS); G = np.zeros((cy, cx), np.uint8)
    dg = bpy.context.evaluated_depsgraph_get()
    statics = [o for r in roots("ST_")+roots("SX_") for o in [r]+list(r.children_recursive) if o.type == 'MESH']
    statics += [o for o in bpy.data.objects if o.type == 'MESH' and (o.name == "RUINS" or o.name.startswith("Cylinder"))]
    def hz(x, y):
        i = np.clip(((x-X0)/HS).astype(int), 0, nx-1); j = np.clip(((y-Y0)/HS).astype(int), 0, ny-1); return H[j, i]
    for o in statics:
        e = o.evaluated_get(dg); me = e.to_mesh(); me.calc_loop_triangles()
        nv = len(me.vertices); nt = len(me.loop_triangles)
        if nt == 0: e.to_mesh_clear(); continue
        V = np.empty(nv*3, np.float32); me.vertices.foreach_get("co", V); V = V.reshape(-1, 3)
        T = np.empty(nt*3, np.int32); me.loop_triangles.foreach_get("vertices", T); T = T.reshape(-1, 3)
        M = np.array(o.matrix_world, np.float32); V = V@M[:3, :3].T+M[:3, 3]
        A, B, Cc = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
        pts = [A, B, Cc, (A+B)/2, (B+Cc)/2, (A+Cc)/2, (A+B+Cc)/3, (2*A+B+Cc)/4, (A+2*B+Cc)/4, (A+B+2*Cc)/4]
        P = np.concatenate(pts); z = P[:, 2]-hz(P[:, 0], P[:, 1]); P = P[(z > 0.18) & (z < 1.9)]
        i = ((P[:, 0]-X0)/CS).astype(int); j = ((P[:, 1]-Y0)/CS).astype(int); ok = (i >= 0) & (i < cx) & (j >= 0) & (j < cy)
        G[j[ok], i[ok]] = 1; e.to_mesh_clear()
    open(OUT+"collide.bin", "wb").write(G.tobytes()); log("collide cells", int(G.sum()))
    open(OUT+"instances.bin", "wb").write(bytes(inst_blob))
    sun = next(o for o in bpy.data.objects if o.type == 'LIGHT' and o.data.type == 'SUN')
    sd = sun.matrix_world.to_3x3() @ Vector((0, 0, 1))   # towards the sun
    lan = [to3(o.matrix_world.translation) for o in bpy.data.objects if o.type == 'LIGHT' and o.data.type == 'POINT']
    def path_x(y): return 2.2*math.sin(y*0.07)+1.2*math.sin(y*0.19+1)
    cams = {o.name: {"pos": to3(o.matrix_world.translation), "target": to3(o.matrix_world.translation+o.matrix_world.to_3x3() @ Vector((0, 0, -10)))}
            for o in bpy.data.objects if o.type == 'CAMERA'}
    js = {"grid": {"x0": X0, "y0": Y0, "hs": HS, "nx": nx, "ny": ny, "cs": CS, "cx": cx, "cy": cy, "note": "grids are Blender XY: bx = x, by = -z"},
          "sun": {"dir": to3(sd), "energy": sun.data.energy, "color": list(sun.data.color)},
          "lanterns": lan, "instances": inst_meta, "statics": static_meta, "cameras": cams,
          "spawn": to3(Vector((path_x(-6), -6, 0))), "sky": "sky_1k.hdr"}
    json.dump(js, open(OUT+"scene.json", "w"), indent=1); log("scene.json")
if want("sky"):
    w = bpy.context.scene.world; env = next(n for n in w.node_tree.nodes if n.type == 'TEX_ENVIRONMENT')
    im = env.image; im.scale(1024, 512); im.filepath_raw = OUT+"sky_1k.hdr"; im.file_format = 'HDR'; im.save(); log("sky")
log("DONE")
