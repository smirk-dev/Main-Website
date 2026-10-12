# Door scene for the browser: the castle door (frame + two leaves, hinges at their origins) and the void wall with its doorway hole.
import bpy, os
OUT = "C:/Users/surya/OneDrive/Documents/Obsidian Vault/suryansh/coding_projects/Main-Website/web/public/assets/door/"
os.makedirs(OUT, exist_ok=True)
for n in ("large_castle_door_left", "large_castle_door_right"): bpy.data.objects[n].rotation_euler.z = 0
wall = bpy.data.objects["Plane.001"]; wall.name = "void_wall"
print("W mods", [m.type for m in wall.modifiers])
for n in bpy.data.images:
    if n.size[0] > 1024: n.scale(1024, int(1024 * n.size[1] / n.size[0]))
pl = bpy.data.materials["forest_plate"]
img = next(x.image for x in pl.node_tree.nodes if x.type == 'TEX_IMAGE'); print("P plate", img.filepath, img.size[:])
keep = {"large_castle_door_frame", "large_castle_door_left", "large_castle_door_right", "void_wall"}
for o in bpy.context.scene.objects: o.select_set(o.name in keep)
bpy.ops.export_scene.gltf(filepath=OUT + "door.glb", export_format='GLB', use_selection=True, export_apply=True,
    export_image_format='WEBP', export_image_quality=85, export_draco_mesh_compression_enable=True, export_cameras=False, export_lights=False, export_animations=False)
print("D", os.path.getsize(OUT + "door.glb"))
