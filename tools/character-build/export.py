import bpy, sys, os
CHAR = os.environ.get('CHAR', 'rokan')
OUT = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=f'{OUT}/{CHAR}.blend')
arm = bpy.data.objects[CHAR.capitalize()]
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(False)
body = bpy.data.objects['Body']
# One skinned mesh, one primitive per material (fewer draw calls on Quest).
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = CHAR.capitalize() + '_Mesh'
# Remove armature-modifier duplicates left by the join
mods = [m for m in body.modifiers if m.type == 'ARMATURE']
for m in mods[1:]: body.modifiers.remove(m)
arm.select_set(True)
# 1024 JPEG normal map keeps each GLB small for Quest.
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=f'{OUT}/{CHAR}.glb', export_format='GLB', use_selection=True,
    export_yup=True, export_skins=True, export_animations=False, export_morph=False,
    export_apply=False, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=90)
print('verts', len(body.data.vertices), 'mats', [m.name for m in body.data.materials])
