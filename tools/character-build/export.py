import bpy, sys
OUT = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=f'{OUT}/rokan.blend')
arm = bpy.data.objects['Rokan']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(False)
body = bpy.data.objects['Body']
# One skinned mesh, one primitive per material (fewer draw calls on Quest).
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'Rokan_Mesh'
# Remove armature-modifier duplicates left by the join
mods = [m for m in body.modifiers if m.type == 'ARMATURE']
for m in mods[1:]: body.modifiers.remove(m)
arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{OUT}/rokan.glb', export_format='GLB', use_selection=True,
    export_yup=True, export_skins=True, export_animations=False, export_morph=False,
    export_apply=False, export_texcoords=True, export_normals=True, export_materials='EXPORT')
print('verts', len(body.data.vertices), 'mats', [m.name for m in body.data.materials])
