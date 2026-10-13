# What is in heroes.blend: statue roots, their meshes, faces, materials and images; the light rig and the camera.
import bpy
for n in ("engel", "milan_mourning", "maternal_affection"):
    r = bpy.data.objects["STATUE_" + n]
    ms = [o for o in r.children_recursive if o.type == 'MESH']
    print("ROOT", n, "scale", tuple(round(v, 4) for v in r.scale), "loc", tuple(round(v, 3) for v in r.location), "meshes", len(ms),
          "faces", sum(len(o.data.polygons) for o in ms))
    for o in ms[:30]:
        mats = [s.material.name if s.material else None for s in o.material_slots]
        print("  M", o.name, len(o.data.polygons), mats)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    imgs = [(x.image.name, x.image.size[:]) for x in m.node_tree.nodes if x.type == 'TEX_IMAGE' and x.image]
    print("MAT", m.name, [x.type for x in m.node_tree.nodes][:12], imgs)
for o in bpy.data.objects:
    if o.type == 'LIGHT': print("LIGHT", o.name, o.data.type, round(o.data.energy, 1), tuple(o.data.color), getattr(o.data, "size", None), getattr(o.data, "spot_size", None))
    if o.type == 'CAMERA': print("CAM", o.name, o.data.lens)
print("WORLD", bpy.context.scene.world.name if bpy.context.scene.world else None, bpy.context.scene.view_settings.view_transform, bpy.context.scene.view_settings.look, bpy.context.scene.view_settings.exposure)
