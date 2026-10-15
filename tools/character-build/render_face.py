# Face close-ups (front and three-quarter) for iterating on the eyes.
import bpy, sys, os
CHAR = os.environ.get('CHAR', 'rokan')
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
TAG = sys.argv[sys.argv.index('--') + 2]
bpy.ops.wm.open_mainfile(filepath=f'{OUT}/{CHAR}.blend')
sc = bpy.context.scene
# Show the base form only (the SSJ hair and fur meshes overlap it).
for o in bpy.data.objects:
    if o.name.startswith(('HairSSJ', 'Fur')): o.hide_render = True
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'MATERIAL'
sc.render.resolution_x = sc.render.resolution_y = 700
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 0.32
sc.collection.objects.link(cam)
sc.camera = cam
head = Vector((0, 0, max(v.co.z for v in bpy.data.objects['Body'].data.vertices) - 0.12))
VIEWS = {'face': (0, -2, 0), 'face34': (1.3, -1.5, 0)}
if os.environ.get('FACE_SIDE'): VIEWS['faceside'] = (2, 0, 0)
for v, d in VIEWS.items():
    tgt = head + Vector((0, -0.07, -0.02)) if v == 'faceside' else head
    cam.location = tgt + Vector(d)
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{OUT}/{TAG}-{v}.png'
    bpy.ops.render.render(write_still=True)
