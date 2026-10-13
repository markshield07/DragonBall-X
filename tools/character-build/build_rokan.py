import bpy, bmesh, sys, json, math
import numpy as np
from mathutils import Vector, Matrix
import os
HERE = os.environ.get('CHAR_BUILD', os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else 'tools/character-build')
sys.path.insert(0, HERE)
from mhbody import build, joint_centers, MH

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.environ.get('CHAR_OUT', 'out')
STAGE = sys.argv[sys.argv.index('--') + 2] if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 2 else 'all'

# Heroic bodybuilder: max muscle, low body fat, tall, V-taper, big arms and legs.
TARGETS = [
    ('caucasian-male-young', 0.4), ('asian-male-young', 0.3), ('african-male-young', 0.3),
    ('universal-male-young-maxmuscle-minweight', 0.75),
    ('universal-male-young-maxmuscle-averageweight', 0.25),
    ('height', 0.15),
    ('proportions', 1.0),
    ('torso-vshape-incr', 0.9),
    ('torso-muscle-dorsi-incr', 1.0),
    ('torso-muscle-pectoral-incr', 0.9),
    ('measure-shoulder-dist-incr', 0.5),
    ('measure-waist-circ-decr', 0.6),
    ('stomach-tone-incr', 1.0),
    ('measure-upperarm-circ-incr', 1.0),
    ('l-upperarm-scale-horiz-incr', 0.5), ('r-upperarm-scale-horiz-incr', 0.5),
    ('l-upperarm-scale-depth-incr', 0.5), ('r-upperarm-scale-depth-incr', 0.5),
    ('l-lowerarm-scale-horiz-incr', 0.5), ('r-lowerarm-scale-horiz-incr', 0.5),
    ('l-lowerarm-scale-depth-incr', 0.5), ('r-lowerarm-scale-depth-incr', 0.5),
    ('l-upperarm-muscle-incr', 1.0), ('r-upperarm-muscle-incr', 1.0),
    ('l-upperarm-shoulder-muscle-incr', 1.0), ('r-upperarm-shoulder-muscle-incr', 1.0),
    ('l-lowerarm-muscle-incr', 1.0), ('r-lowerarm-muscle-incr', 1.0),
    ('l-upperleg-muscle-incr', 1.0), ('r-upperleg-muscle-incr', 1.0),
    ('l-lowerleg-muscle-incr', 0.5), ('r-lowerleg-muscle-incr', 0.5),
    ('measure-thigh-circ-incr', 0.4),
    ('measure-calf-circ-incr', 0.2),
    ('measure-neck-circ-incr', 0.8),
    ('head-square', 0.35),
    ('chin-width-incr', 0.3),
    ('chin-prominent-incr', 0.3),
    ('l-eye-scale-incr', 0.7), ('r-eye-scale-incr', 0.7),
    ('l-eye-height2-incr', 0.8), ('r-eye-height2-incr', 0.8),
]

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_mesh(name, verts, faces, uv_faces=None, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    if uv_faces is not None:
        layer = me.uv_layers.new(name='UVMap')
        k = 0
        for poly in me.polygons:
            fu = uv_faces[poly.index]
            for j, li in enumerate(poly.loop_indices):
                layer.data[li].uv = uvs[fu[j]] if fu[j] >= 0 else (0, 0)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob

def material(name, color):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = 0.7
    return m

def srgb(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

# ---------------------------------------------------------------------------
reset()
B, UV, F, FUV, FG = build(TARGETS)
J = joint_centers(B, F, FG)
NB = 13380
from sculpt import sculpt_bodybuilder
B = sculpt_bodybuilder(B, [f for f, g in zip(F, FG) if g == 'body'], J, NB)
body_f = [(f, fu) for f, fu, g in zip(F, FUV, FG) if g == 'body']
body = make_mesh('Body', B[:NB].tolist(), [f for f, _ in body_f], [fu for _, fu in body_f], UV)
body.data.materials.append(material('Skin', srgb(0xc8875a)))

# ---- Armature (MakeHuman game-engine skeleton, Unreal-style bone names) ----
rig = json.load(open(f'{MH}/rig.game_engine.json'))
arm_data = bpy.data.armatures.new('Rig')
arm = bpy.data.objects.new('Rokan', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
def pos(spec):
    if spec['strategy'] == 'CUBE':
        return Vector(J[spec['cube_name']])
    return Vector(B[spec['vertex_indices']].mean(axis=0))
for name, b in rig.items():
    eb = arm_data.edit_bones.new(name)
    eb.head = pos(b['head'])
    eb.tail = pos(b['tail'])
    if (eb.tail - eb.head).length < 1e-4:
        eb.tail = eb.head + Vector((0, 0, 0.05))
    eb.roll = b.get('roll', 0)
for name, b in rig.items():
    if b['parent']:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[b['parent']]
        arm_data.edit_bones[name].use_connect = b.get('use_connect', False)
bpy.ops.object.mode_set(mode='OBJECT')

weights = json.load(open(f'{MH}/weights.game_engine.json'))['weights']
def bind(ob, src_index=None):
    """Skin `ob` to the rig. src_index[i] = body vertex index to copy weights from."""
    groups = {name: ob.vertex_groups.new(name=name) for name in rig}
    if src_index is None:
        for bone, lst in weights.items():
            g = groups[bone]
            for vi, w in lst:
                if vi < NB:
                    g.add([vi], w, 'REPLACE')
    else:
        per_body = {}
        for bone, lst in weights.items():
            for vi, w in lst:
                if vi < NB:
                    per_body.setdefault(vi, []).append((bone, w))
        for i, src in enumerate(src_index):
            for bone, w in per_body.get(src, []):
                groups[bone].add([i], w, 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    ob.parent = arm

def bind_bone(ob, bone):
    g = ob.vertex_groups.new(name=bone)
    g.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    ob.parent = arm

bind(body)
np.save(f'{OUT}/B.npy', B)
json.dump({k: list(map(float, v)) for k, v in J.items()}, open(f'{OUT}/joints.json', 'w'))
exec(open(os.path.join(HERE, 'parts.py')).read()) if STAGE != 'body' else None

if STAGE in ('all', 'bake'):
    exec(open(os.path.join(HERE, 'bake.py')).read())
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/rokan.blend')
print('BODY verts', len(body.data.vertices), 'height', B[:NB, 2].max())
