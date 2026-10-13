import bpy, sys, math
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
TAG = sys.argv[sys.argv.index('--') + 2]
bpy.ops.wm.open_mainfile(filepath=f'{OUT}/rokan.blend')
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'MATERIAL'
sh.show_cavity = True
sh.cavity_type = 'BOTH'
sh.show_object_outline = False
sc.render.resolution_x, sc.render.resolution_y = 700, 1000
sc.world = bpy.data.worlds.new('w') if not sc.world else sc.world
cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.15
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
views = {'front': (0, -5, 0), 'side': (5, 0, 0), 'back': (0, 5, 0), 'q': (3.5, -3.5, 0)}
for v, d in views.items():
    cam.location = Vector(d) + Vector((0, 0, 0.98))
    direction = Vector((0, 0, 0.98)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{OUT}/{TAG}-{v}.png'
    bpy.ops.render.render(write_still=True)
