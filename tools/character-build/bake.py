# Executed inside build_character.py after parts: bake a muscle-detail normal map for the skin.
import numpy as np
from detail import detail_bodybuilder
hi = body.copy(); hi.data = body.data.copy(); hi.name = 'BodyHigh'
bpy.context.scene.collection.objects.link(hi)
hi.modifiers.clear(); hi.parent = None
for g in list(hi.vertex_groups): hi.vertex_groups.remove(g)
sub = hi.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
bpy.context.view_layer.objects.active = hi
for o in bpy.data.objects: o.select_set(False)
hi.select_set(True)
bpy.ops.object.modifier_apply(modifier='sub')
me = hi.data
n = len(me.vertices)
V = np.zeros(n * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
Nn = np.zeros(n * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
V2 = detail_bodybuilder(V, Nn, J, k=C['muscle'], female=C['female'])
me.vertices.foreach_set('co', V2.reshape(-1)); me.update()
print('HIGH verts', n)
# Image + bake setup on the low body's Skin material
img = bpy.data.images.new('SkinNormal', 2048, 2048, alpha=False)
img.colorspace_settings.name = 'Non-Color'
skin = body.data.materials[0]
nt = skin.node_tree
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
nt.nodes.active = tex
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 1
bake_settings = sc.render.bake
bake_settings.use_selected_to_active = True
bake_settings.cage_extrusion = 0.015
bake_settings.max_ray_distance = 0.03
bake_settings.margin = 6
for o in bpy.data.objects: o.select_set(False)
# bake from the un-skinned low mesh (rest pose)
arm_mod = body.modifiers.get('Armature'); arm_mod.show_render = False; arm_mod.show_viewport = False
hi.select_set(True); body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
arm_mod.show_render = True; arm_mod.show_viewport = True
img.filepath_raw = f'{OUT}/skin_normal.png'; img.file_format = 'PNG'; img.save()
# Wire the normal map into the Skin material so the glTF export carries it.
nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
bpy.data.objects.remove(hi, do_unlink=True)
sc.render.engine = 'BLENDER_WORKBENCH'
