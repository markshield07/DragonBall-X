# Face close-ups (front and three-quarter) for iterating on the eyes.
import bpy, sys
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
TAG = sys.argv[sys.argv.index('--') + 2]
bpy.ops.wm.open_mainfile(filepath=f'{OUT}/rokan.blend')
sc = bpy.context.scene
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
for v, d in {'face': (0, -2, 0), 'face34': (1.3, -1.5, 0)}.items():
    cam.location = head + Vector(d)
    cam.rotation_euler = (head - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{OUT}/{TAG}-{v}.png'
    bpy.ops.render.render(write_still=True)
