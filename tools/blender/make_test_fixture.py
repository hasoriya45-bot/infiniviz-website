"""
PIPELINE TEST FIXTURE - not a real project, never published.

Builds a deliberately simple box room with the nine camera names the export config expects,
two wall materials (to test the material configurator) and a night lighting variant, then saves
it as a .blend so tools/export.ps1 can be tested end-to-end on any machine.

  blender -b --python tools/blender/make_test_fixture.py -- --out "D:/infiniviz-pipeline-test/pipeline-test.blend"
"""
import math
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = argv[argv.index("--out") + 1] if "--out" in argv else "pipeline-test.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Scene"
scene.unit_settings.system = "METRIC"


def mat(name, rgb, rough=0.6, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


M = {
    "floor": mat("Floor_Oak", (0.45, 0.30, 0.18), 0.45),
    "wall": mat("Wall_Paint", (0.86, 0.84, 0.80), 0.9),
    "wall_alt": mat("Wall_Paint_Sage", (0.55, 0.62, 0.52), 0.9),
    "ceiling": mat("Ceiling", (0.92, 0.92, 0.92), 0.9),
    "bed": mat("Bed_Fabric", (0.72, 0.66, 0.58), 1.0),
    "wood": mat("Walnut", (0.25, 0.15, 0.09), 0.5),
    "tv": mat("TV_Black", (0.02, 0.02, 0.02), 0.2),
    "sofa": mat("Sofa_Fabric", (0.35, 0.38, 0.42), 1.0),
    "door": mat("Bath_Door", (0.15, 0.12, 0.10), 0.5),
    "marker": mat("Marker_Red", (0.8, 0.05, 0.05), 0.5),
}


def box(name, size, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    return o


W, D, H = 5.0, 4.0, 2.8  # room x, y, height (m)
box("Floor", (W, D, 0.1), (0, 0, -0.05), M["floor"])
box("Ceiling", (W, D, 0.1), (0, 0, H + 0.05), M["ceiling"])
box("Wall_North", (W + 0.2, 0.1, H), (0, D / 2 + 0.05, H / 2), M["wall"])
box("Wall_South", (W + 0.2, 0.1, H), (0, -D / 2 - 0.05, H / 2), M["wall"])
box("Wall_East", (0.1, D, H), (W / 2 + 0.05, 0, H / 2), M["wall"])
box("Wall_West", (0.1, D, H), (-W / 2 - 0.05, 0, H / 2), M["wall"])
box("Bed", (1.8, 2.1, 0.55), (-1.2, 0.8, 0.275), M["bed"])
box("Headboard", (1.9, 0.1, 1.1), (-1.2, D / 2 - 0.06, 0.55), M["wood"])
box("Wardrobe", (0.6, 2.0, 2.3), (W / 2 - 0.31, 0.8, 1.15), M["wood"])
box("TV_Unit", (1.6, 0.4, 0.45), (0.9, -D / 2 + 0.21, 0.225), M["wood"])
box("TV", (1.2, 0.05, 0.7), (0.9, -D / 2 + 0.05, 1.2), M["tv"])
box("Sofa", (1.4, 0.8, 0.45), (-1.5, -1.2, 0.225), M["sofa"])
box("Bathroom_Door", (0.9, 0.05, 2.1), (W / 2 - 0.03, -1.2, 1.05), M["door"])
box("Orientation_Marker", (0.3, 0.3, 0.3), (0, D / 2 - 0.2, 1.6), M["marker"])  # red cube on the north wall

# Daylight: sun through an implied window + ceiling area light
bpy.ops.object.light_add(type="AREA", location=(0, 0, H - 0.05))
area = bpy.context.active_object; area.name = "Ceiling_Light"; area.data.energy = 300; area.data.size = 2.0
world = bpy.data.worlds.new("World_Day"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.6, 0.7, 0.85, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
scene.world = world
night = bpy.data.worlds.new("World_Night"); night.use_nodes = True
night.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.03, 0.06, 1)
night.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.2
night_col = bpy.data.collections.new("Night_Lights"); scene.collection.children.link(night_col)
for i, (x, y) in enumerate([(-1.2, 0.0), (1.2, -1.0)]):
    ld = bpy.data.lights.new(f"Lamp_{i}", "POINT"); ld.energy = 120; ld.color = (1.0, 0.78, 0.55)
    lo = bpy.data.objects.new(f"Lamp_{i}", ld); lo.location = (x, y, 1.4); night_col.objects.link(lo)
night_col.hide_render = True
# Alternatives that nothing uses yet must be kept with a Fake User, or Blender drops them on save.
M["wall_alt"].use_fake_user = True
night.use_fake_user = True

# The nine cameras the Nimesh Bedroom config expects (positions chosen for this test room only)
cams = [
    ("CAM_01_Bed", (-1.2, -0.6, 1.5), 0),
    ("CAM_02_Entrance", (-2.0, -1.7, 1.6), -40),
    ("CAM_03_Wardrobe", (0.6, 0.5, 1.6), -90),
    ("CAM_04_TV_Unit", (0.6, 0.4, 1.4), 180),
    ("CAM_05_Window", (1.5, 1.6, 1.6), 135),
    ("CAM_06_Seating", (-1.4, -1.7, 1.2), 20),
    ("CAM_07_Ceiling", (0.0, 0.0, 1.3), 45),
    ("CAM_08_Bathroom", (1.3, -1.2, 1.6), -90),
    ("CAM_09_Full_Room", (-2.2, -1.8, 2.3), -45),
]
for name, loc, heading in cams:
    cd = bpy.data.cameras.new(name); cd.lens = 18
    co = bpy.data.objects.new(name, cd); scene.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = (math.radians(80 if "Ceiling" not in name else 120), 0, math.radians(heading))
scene.camera = bpy.data.objects["CAM_01_Bed"]
scene["infiniviz_test_fixture"] = True

bpy.ops.wm.save_as_mainfile(filepath=out)
print(f"[INFINIVIZ] Test fixture saved: {out}")
