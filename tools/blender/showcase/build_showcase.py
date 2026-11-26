"""
INFINIVIZ showcase scene generator (Blender 5.x, Cycles).

Builds an original contemporary apartment interior for the website's Section 04:
real-scale geometry, PBR materials from CC0 Poly Haven textures, HDRI daylight with
window light portals, interior lighting, three lighting setups (day / evening / night),
material variants for the configurator and nine named cameras.

  blender -b --factory-startup --python-exit-code 1 --python tools/blender/showcase/build_showcase.py -- \
      --assets "D:/.../infiniviz-assets/polyhaven" --out "D:/.../infiniviz-assets/showcase/InfiniViz Showcase.blend"

This is an InfiniViz studio showcase, not a client project. It never overwrites an existing .blend.
"""
import argparse
import datetime
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--assets", required=True, help="folder with textures/ and hdris/ from fetch-polyhaven.ps1")
ap.add_argument("--out", required=True)
args = ap.parse_args(argv)
TEX = os.path.join(args.assets, "textures")
HDR = os.path.join(args.assets, "hdris")
errors = []


def log(m): print(f"[INFINIVIZ] {m}", flush=True)


# ------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "InfiniViz Showcase"
scene.unit_settings.system = "METRIC"
scene.render.engine = "CYCLES"
scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.max_bounces = 12
scene.cycles.diffuse_bounces = 6
scene.cycles.glossy_bounces = 6
scene.cycles.transmission_bounces = 8
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.sample_clamp_indirect = 8.0
for vt, look in (("AgX", "AgX - Medium High Contrast"), ("AgX", "None"), ("Filmic", "None")):
    try:
        scene.view_settings.view_transform = vt
        scene.view_settings.look = look
        break
    except TypeError:
        continue
scene.view_settings.exposure = 2.3
scene["infiniviz_showcase"] = True
scene["infiniviz_note"] = "InfiniViz studio showcase interior - not a client project"


def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


C_ARCH = coll("IVZ_Architecture")
C_FURN = coll("IVZ_Furniture")
C_LIGHT_DAY = coll("IVZ_Lights_Day")
C_LIGHT_INT = coll("IVZ_Lights_Interior")
C_CAMS = coll("IVZ_Cameras")
C_EXT = coll("IVZ_Exterior")


# ------------------------------------------------------------------ materials
def tex_path(asset, kind):
    p = os.path.join(TEX, asset, f"{asset}_{kind}_2k.jpg")
    if not os.path.isfile(p):
        errors.append(f"missing texture {p}")
        return None
    return p


def pbr(name, asset, tile=2.0, tint=None, rough_mul=1.0, fake_user=False, normal_strength=1.0, solid=None):
    """Principled material from Poly Haven maps. UVs are in metres; Mapping scales by 1/tile (exports as KHR_texture_transform)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; n = nt.nodes; l = nt.links
    bsdf = n["Principled BSDF"]
    uv = n.new("ShaderNodeTexCoord"); uv.location = (-1100, 0)
    mp = n.new("ShaderNodeMapping"); mp.location = (-900, 0)
    mp.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0)
    l.new(uv.outputs["UV"], mp.inputs["Vector"])
    d = None if solid else tex_path(asset, "diffuse")
    if d:
        t = n.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(d, check_existing=True); t.location = (-600, 200)
        l.new(mp.outputs["Vector"], t.inputs["Vector"])
        if tint:
            mix = n.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.location = (-300, 250)
            mix.inputs["Factor"].default_value = 1.0
            l.new(t.outputs["Color"], mix.inputs["A"]); mix.inputs["B"].default_value = (*tint, 1)
            l.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        else:
            l.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    r = tex_path(asset, "rough")
    if r:
        t = n.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(r, check_existing=True); t.location = (-600, -80)
        t.image.colorspace_settings.name = "Non-Color"
        l.new(mp.outputs["Vector"], t.inputs["Vector"])
        if rough_mul != 1.0:
            mm = n.new("ShaderNodeMath"); mm.operation = "MULTIPLY"; mm.inputs[1].default_value = rough_mul; mm.location = (-300, -80)
            l.new(t.outputs["Color"], mm.inputs[0]); l.new(mm.outputs["Value"], bsdf.inputs["Roughness"])
        else:
            l.new(t.outputs["Color"], bsdf.inputs["Roughness"])
    nm = tex_path(asset, "nor_gl")
    if nm:
        t = n.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(nm, check_existing=True); t.location = (-600, -360)
        t.image.colorspace_settings.name = "Non-Color"
        nn = n.new("ShaderNodeNormalMap"); nn.location = (-300, -360); nn.inputs["Strength"].default_value = normal_strength
        l.new(mp.outputs["Vector"], t.inputs["Vector"]); l.new(t.outputs["Color"], nn.inputs["Color"]); l.new(nn.outputs["Normal"], bsdf.inputs["Normal"])
    if solid:
        bsdf.inputs["Base Color"].default_value = (*solid, 1)
    m.use_fake_user = fake_user
    m["tile_m"] = tile
    return m


def plain(name, color, rough=0.5, metal=0.0, emit=0.0, emit_color=None, transmission=0.0, fake_user=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
        b.inputs["IOR"].default_value = 1.45
    if emit:
        b.inputs["Emission Color"].default_value = (*(emit_color or color), 1)
        b.inputs["Emission Strength"].default_value = emit
    m.use_fake_user = fake_user
    return m


M = {
    # configurable (first entry of each group is the default)
    "wall": pbr("IVZ_Wall", "white_plaster_02", tile=2.5, tint=(0.96, 0.95, 0.93)),
    "wall_grey": pbr("IVZ_Wall_Grey", "grey_plaster", tile=2.5, fake_user=True),
    "wall_concrete": pbr("IVZ_Wall_Concrete", "concrete_wall_003", tile=3.0, fake_user=True),
    "floor": pbr("IVZ_Floor", "laminate_floor_02", tile=2.0, rough_mul=0.85),
    "floor_concrete": pbr("IVZ_Floor_Concrete", "concrete_floor_02", tile=3.0, rough_mul=0.7, fake_user=True),
    "floor_marble": pbr("IVZ_Floor_Marble", "marble_tiles", tile=2.0, rough_mul=0.5, fake_user=True),
    "wood": pbr("IVZ_Wood", "oak_veneer_01", tile=1.5),
    "wood_walnut": pbr("IVZ_Wood_Walnut", "walnut_veneer_02", tile=1.5, fake_user=True),
    "uph": pbr("IVZ_Upholstery", "fabric_pattern_07", tile=0.6, solid=(0.62, 0.56, 0.48), normal_strength=0.8),
    "uph_brown": pbr("IVZ_Upholstery_Leather_Brown", "brown_leather", tile=1.0, fake_user=True),
    "uph_white": pbr("IVZ_Upholstery_Leather_White", "leather_white", tile=1.0, fake_user=True),
    "ceiling": pbr("IVZ_Ceiling", "white_plaster_02", tile=3.0),
    "ceiling_wood": pbr("IVZ_Ceiling_Wood", "oak_veneer_01", tile=1.5, fake_user=True),
    "ceiling_concrete": pbr("IVZ_Ceiling_Concrete", "concrete_wall_003", tile=3.0, fake_user=True),
    "metal": plain("IVZ_Metal", (0.03, 0.03, 0.03), rough=0.35, metal=1.0),
    "metal_brass": plain("IVZ_Metal_Brass", (0.80, 0.60, 0.33), rough=0.28, metal=1.0, fake_user=True),
    # fixed
    "stone": pbr("IVZ_Stone", "marble_01", tile=1.6, rough_mul=0.35),
    "rug": pbr("IVZ_Rug", "fabric_pattern_07", tile=0.35, solid=(0.36, 0.33, 0.29), normal_strength=1.2),
    "terrace": pbr("IVZ_Terrace", "concrete_floor_02", tile=3.0),
    "glass": plain("IVZ_Glass", (0.92, 0.95, 0.96), rough=0.02),
    "frame": plain("IVZ_Frame", (0.02, 0.02, 0.02), rough=0.4, metal=0.8),
    "tv": plain("IVZ_TV_Screen", (0.005, 0.005, 0.006), rough=0.08),
    "leaf": plain("IVZ_Plant", (0.08, 0.2, 0.06), rough=0.6),
    "pot": plain("IVZ_Planter", (0.55, 0.52, 0.48), rough=0.8),
    "glow": plain("IVZ_Light_Strip", (1.0, 0.86, 0.68), rough=0.5, emit=1.0),
    "globe": plain("IVZ_Pendant_Glass", (0.96, 0.94, 0.9), rough=0.45),
}

# Architectural glass: partial alpha (light passes, reflections stay); pendant globes slightly translucent.
for _m, _a in (("IVZ_Glass", 0.12), ("IVZ_Pendant_Glass", 0.75)):
    _mat = bpy.data.materials[_m]
    _mat.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = _a
    for _attr, _val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try: setattr(_mat, _attr, _val)
        except Exception: pass

# ------------------------------------------------------------------ geometry helpers
def world_uv(obj):
    """Box-projected UVs in metres using world coordinates (consistent scale across objects)."""
    me = obj.data
    bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    mw = obj.matrix_world; rot = mw.to_3x3()
    for f in bm.faces:
        n = (rot @ f.normal).normalized()
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for lp in f.loops:
            w = mw @ lp.vert.co
            if az >= ax and az >= ay: lp[uvl].uv = (w.x, w.y)
            elif ax >= ay: lp[uvl].uv = (w.y, w.z)
            else: lp[uvl].uv = (w.x, w.z)
    bm.to_mesh(me); bm.free()


def box(name, size, loc, mat, coll=C_FURN, bevel=0.0, rot_z=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc; o.rotation_euler.z = math.radians(rot_z)
    coll.objects.link(o)
    me.materials.append(mat)
    bpy.context.view_layer.update()
    world_uv(o)
    if bevel:
        b = o.modifiers.new("Bevel", "BEVEL"); b.width = bevel; b.segments = 2; b.limit_method = "ANGLE"
    for p in me.polygons: p.use_smooth = False
    return o


def cyl(name, r, h, loc, mat, coll=C_FURN, seg=32):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); o.location = loc; coll.objects.link(o)
    me.materials.append(mat); bpy.context.view_layer.update(); world_uv(o)
    for p in me.polygons: p.use_smooth = True
    return o


def sphere(name, r, loc, mat, coll=C_FURN, sub=3):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); o.location = loc; coll.objects.link(o)
    me.materials.append(mat); bpy.context.view_layer.update(); world_uv(o)
    for p in me.polygons: p.use_smooth = True
    return o


# ------------------------------------------------------------------ architecture (x east, y north, z up; metres)
W, D, H = 11.0, 7.5, 3.2
X0, X1, Y0, Y1 = -W / 2, W / 2, -D / 2, D / 2
T = 0.2
box("Floor", (W, D, 0.1), (0, 0, -0.05), M["floor"], C_ARCH)
box("Ceiling", (W, D, 0.12), (0, 0, H + 0.06), M["ceiling"], C_ARCH)
box("Wall_North", (W + 2 * T, T, H), (0, Y1 + T / 2, H / 2), M["wall"], C_ARCH)
box("Wall_West", (T, D, H), (X0 - T / 2, 0, H / 2), M["wall"], C_ARCH)
# East wall with an entrance door opening (y -1.6 .. -0.6, height 2.4)
box("Wall_East_A", (T, (-1.6) - Y0, H), (X1 + T / 2, (Y0 + -1.6) / 2, H / 2), M["wall"], C_ARCH)
box("Wall_East_B", (T, Y1 - (-0.6), H), (X1 + T / 2, (Y1 + -0.6) / 2, H / 2), M["wall"], C_ARCH)
box("Wall_East_Lintel", (T, 1.0, H - 2.4), (X1 + T / 2, -1.1, 2.4 + (H - 2.4) / 2), M["wall"], C_ARCH)
box("Entrance_Door", (0.05, 1.0, 2.4), (X1 + 0.08, -1.1, 1.2), M["wood_walnut"], C_ARCH)
box("Door_Handle", (0.04, 0.02, 0.25), (X1 + 0.02, -0.72, 1.05), M["metal"], C_ARCH)
# South facade: floor-to-ceiling glazing with slim frames
box("Glazing_Sill", (W + 2 * T, T, 0.06), (0, Y0 - T / 2, 0.03), M["frame"], C_ARCH)
box("Glazing_Head", (W + 2 * T, T, 0.12), (0, Y0 - T / 2, H - 0.06), M["frame"], C_ARCH)
n_panes = 5
for i in range(n_panes):
    x = X0 + (i + 0.5) * W / n_panes
    g = box(f"Glass_{i+1}", (W / n_panes - 0.06, 0.02, H - 0.18), (x, Y0 - T / 2, 0.06 + (H - 0.18) / 2), M["glass"], C_ARCH)
for i in range(n_panes + 1):
    box(f"Mullion_{i}", (0.06, T, H), (X0 + i * W / n_panes, Y0 - T / 2, H / 2), M["frame"], C_ARCH)
# Exterior terrace + balustrade (seen through the glass)
box("Terrace", (W + 2, 3.0, 0.1), (0, Y0 - T - 1.5, -0.08), M["terrace"], C_EXT)
box("Balustrade_Glass", (W + 2, 0.02, 1.05), (0, Y0 - T - 2.95, 0.5), M["glass"], C_EXT)
box("Balustrade_Rail", (W + 2, 0.05, 0.05), (0, Y0 - T - 2.95, 1.05), M["frame"], C_EXT)
# Recessed linear light slots (interior lighting)
for i, y in enumerate((-1.6, 0.4, 2.2)):
    box(f"Light_Slot_{i+1}", (W - 1.6, 0.06, 0.02), (0, y, H - 0.011), M["glow"], C_LIGHT_INT)

# ------------------------------------------------------------------ furniture
# Media wall (west)
box("Media_Console", (0.5, 2.8, 0.42), (X0 + 0.25, 0.2, 0.31), M["wood"], bevel=0.01)
box("Media_Console_Plinth", (0.46, 2.76, 0.1), (X0 + 0.25, 0.2, 0.05), M["metal"])
box("TV", (0.05, 1.65, 0.95), (X0 + 0.04, 0.2, 1.35), M["tv"], bevel=0.005)
box("Media_Panel", (0.03, 3.4, 2.4), (X0 + 0.015, 0.2, 1.4), M["wood"])
# Sofa (faces west) + chaise
box("Sofa_Seat", (0.95, 2.9, 0.42), (-2.0, 0.1, 0.21), M["uph"], bevel=0.04)
box("Sofa_Back", (0.22, 2.9, 0.42), (-1.62, 0.1, 0.63), M["uph"], bevel=0.05)
box("Sofa_Arm_N", (0.95, 0.2, 0.62), (-2.0, 1.55, 0.31), M["uph"], bevel=0.05)
box("Sofa_Chaise", (1.6, 0.95, 0.42), (-2.33, -1.82, 0.21), M["uph"], bevel=0.04)
for i, y in enumerate((-0.7, 0.1, 0.9)):
    box(f"Sofa_Cushion_{i+1}", (0.16, 0.6, 0.42), (-1.85, y, 0.66), M["uph"], bevel=0.06, rot_z=4 * (i - 1))
box("Rug", (3.4, 3.8, 0.012), (-3.25, 0.0, 0.006), M["rug"], C_FURN)
box("Coffee_Table_Top", (1.25, 0.75, 0.04), (-3.45, 0.1, 0.4), M["stone"], bevel=0.008)
box("Coffee_Table_Base", (1.0, 0.5, 0.36), (-3.45, 0.1, 0.19), M["wood"], bevel=0.01)
# Lounge chair by the window + side table + floor lamp
box("Lounge_Chair_Seat", (0.8, 0.8, 0.4), (-4.3, -2.6, 0.2), M["uph"], bevel=0.05, rot_z=35)
box("Lounge_Chair_Back", (0.8, 0.18, 0.5), (-4.55, -2.3, 0.62), M["uph"], bevel=0.05, rot_z=35)
cyl("Side_Table", 0.24, 0.5, (-3.4, -2.9, 0.25), M["wood"])
cyl("Floor_Lamp_Pole", 0.015, 1.6, (-1.3, 1.85, 0.8), M["metal"], seg=12)
cyl("Floor_Lamp_Shade", 0.22, 0.3, (-1.3, 1.85, 1.62), M["uph"], seg=32)
# Dining
box("Dining_Top", (2.2, 1.0, 0.05), (1.4, -1.4, 0.75), M["wood"], bevel=0.01)
for i, (dx, dy) in enumerate(((-0.95, -0.4), (0.95, -0.4), (-0.95, 0.4), (0.95, 0.4))):
    box(f"Dining_Leg_{i+1}", (0.06, 0.06, 0.72), (1.4 + dx, -1.4 + dy, 0.36), M["metal"])
for i, (dx, side) in enumerate([(x, s) for x in (-0.65, 0.0, 0.65) for s in (-1, 1)]):
    cy = -1.4 + side * 0.72
    box(f"Chair_{i+1}_Seat", (0.46, 0.46, 0.06), (1.4 + dx, cy, 0.46), M["uph"], bevel=0.015)
    box(f"Chair_{i+1}_Back", (0.46, 0.05, 0.42), (1.4 + dx, cy + side * 0.21, 0.72), M["wood"], bevel=0.01)
    box(f"Chair_{i+1}_Frame", (0.42, 0.42, 0.43), (1.4 + dx, cy, 0.215), M["metal"])
for i, dx in enumerate((-0.6, 0.0, 0.6)):
    cyl(f"Pendant_Cord_{i+1}", 0.004, 0.9, (1.4 + dx, -1.4, H - 0.45), M["metal"], C_FURN, seg=8)
    sphere(f"Pendant_Globe_{i+1}", 0.14, (1.4 + dx, -1.4, H - 1.0), M["globe"], C_FURN)
# Kitchen (north wall) + island
box("Kitchen_Base", (4.6, 0.62, 0.88), (2.7, Y1 - 0.31, 0.44), M["wood"], bevel=0.005)
box("Kitchen_Worktop", (4.65, 0.66, 0.04), (2.7, Y1 - 0.33, 0.9), M["stone"], bevel=0.004)
box("Kitchen_Splashback", (3.5, 0.02, 0.62), (2.15, Y1 - 0.01, 1.23), M["stone"])
box("Kitchen_Tall", (1.2, 0.62, 2.5), (4.85, Y1 - 0.31, 1.25), M["wood"], bevel=0.005)
box("Kitchen_Shelf", (2.0, 0.28, 0.04), (1.6, Y1 - 0.14, 1.85), M["wood"])
box("Island_Base", (2.4, 0.95, 0.88), (2.6, 1.35, 0.44), M["wood"], bevel=0.008)
box("Island_Top", (2.5, 1.05, 0.05), (2.6, 1.35, 0.905), M["stone"], bevel=0.005)
for i, dx in enumerate((-0.8, 0.0, 0.8)):
    cyl(f"Stool_{i+1}_Seat", 0.2, 0.05, (2.6 + dx, 0.55, 0.68), M["uph"])
    cyl(f"Stool_{i+1}_Leg", 0.02, 0.66, (2.6 + dx, 0.55, 0.33), M["metal"], seg=12)
# Shelving near the entrance + plants
box("Shelving", (0.4, 1.6, 2.2), (X1 - 0.2, 1.6, 1.1), M["wood"], bevel=0.005)
for i, (x, y) in enumerate(((-5.0, -3.2), (4.9, -3.2), (-0.6, 3.3))):
    cyl(f"Planter_{i+1}", 0.22, 0.5, (x, y, 0.25), M["pot"])
    for k in range(5):
        sphere(f"Plant_{i+1}_{k}", 0.22 + 0.05 * (k % 2), (x + 0.12 * math.cos(k * 1.3), y + 0.12 * math.sin(k * 1.3), 0.75 + 0.18 * k), M["leaf"], C_FURN, sub=2)

# ------------------------------------------------------------------ lighting
def load_hdr(fname):
    p = os.path.join(HDR, fname)
    if not os.path.isfile(p):
        errors.append(f"missing HDRI {p}")
        return None
    return bpy.data.images.load(p, check_existing=True)


def make_world(name, hdr_file, strength, rotation_deg=0.0, fake_user=False):
    w = bpy.data.worlds.new(name); w.use_nodes = True
    nt = w.node_tree; n = nt.nodes; l = nt.links
    bg = n["Background"]; bg.inputs["Strength"].default_value = strength
    img = load_hdr(hdr_file)
    if img:
        env = n.new("ShaderNodeTexEnvironment"); env.image = img
        tc = n.new("ShaderNodeTexCoord"); mp = n.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = (0, 0, math.radians(rotation_deg))
        l.new(tc.outputs["Generated"], mp.inputs["Vector"]); l.new(mp.outputs["Vector"], env.inputs["Vector"])
        l.new(env.outputs["Color"], bg.inputs["Color"])
    w.use_fake_user = fake_user
    w["hdri"] = hdr_file
    return w


world_day = make_world("World_Day", "kloofendal_48d_partly_cloudy_puresky_4k.hdr", 2.6, rotation_deg=200)
world_evening = make_world("World_Evening", "lilienstein_2k.hdr", 0.7, rotation_deg=160, fake_user=True)
world_night = make_world("World_Night", "moonless_golf_2k.hdr", 0.35, rotation_deg=0, fake_user=True)
scene.world = world_day

# Daylight: window light portals (Cycles) + a soft sun for crisp shadows
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4.5; sun.data.angle = math.radians(2.0); sun.data.color = (1.0, 0.96, 0.9)
sun.rotation_euler = (math.radians(55), 0, math.radians(25))
C_LIGHT_DAY.objects.link(sun)
portal = bpy.data.objects.new("Window_Portal", bpy.data.lights.new("Window_Portal", "AREA"))
portal.data.shape = "RECTANGLE"; portal.data.size = W; portal.data.size_y = H
portal.location = (0, Y0 - 0.02, H / 2); portal.rotation_euler = (math.radians(90), 0, 0)
try:
    portal.data.cycles.is_portal = True
except Exception:
    pass
C_LIGHT_DAY.objects.link(portal)
fill = bpy.data.objects.new("Window_Fill", bpy.data.lights.new("Window_Fill", "AREA"))
fill.data.shape = "RECTANGLE"; fill.data.size = W - 1.0; fill.data.size_y = H - 0.6; fill.data.energy = 220; fill.data.color = (0.92, 0.96, 1.0)
fill.location = (0, Y0 + 0.15, H / 2); fill.rotation_euler = (math.radians(90), 0, 0)
C_LIGHT_DAY.objects.link(fill)

# Interior (evening / night): warm area lights over zones + point lights in pendants (exported to the web)
def area(name, loc, size, energy, coll=C_LIGHT_INT):
    o = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    o.data.shape = "RECTANGLE"; o.data.size, o.data.size_y = size; o.data.energy = energy; o.data.color = (1.0, 0.82, 0.62)
    o.location = loc; coll.objects.link(o); return o


area("Area_Living", (-3.2, 0.1, H - 0.05), (3.0, 2.5), 50)
area("Area_Kitchen", (2.7, 2.4, H - 0.05), (4.0, 1.4), 45)
area("Area_Dining", (1.4, -1.4, H - 0.05), (2.4, 1.2), 24)
for i, dx in enumerate((-0.6, 0.0, 0.6)):
    p = bpy.data.objects.new(f"Pendant_Light_{i+1}", bpy.data.lights.new(f"Pendant_Light_{i+1}", "POINT"))
    p.data.energy = 7; p.data.color = (1.0, 0.8, 0.58); p.data.shadow_soft_size = 0.12
    p.location = (1.4 + dx, -1.4, H - 1.0); C_LIGHT_INT.objects.link(p)
lamp = bpy.data.objects.new("Floor_Lamp_Light", bpy.data.lights.new("Floor_Lamp_Light", "POINT"))
lamp.data.energy = 10; lamp.data.color = (1.0, 0.78, 0.55); lamp.location = (-1.3, 1.85, 1.55); C_LIGHT_INT.objects.link(lamp)
C_LIGHT_INT.hide_render = True  # day setup by default; evening/night variants switch it on

# ------------------------------------------------------------------ cameras (eye level; overview raised)
EYE = 1.55
cams = [
    ("CAM_01_Living", (-2.6, 2.6, EYE), (-3.6, -1.0)),
    ("CAM_02_Entrance", (4.6, -1.1, EYE), (0.0, 0.0)),
    ("CAM_03_Kitchen", (0.4, -0.1, EYE), (3.4, 3.2)),
    ("CAM_04_Dining", (3.6, -2.6, EYE), (0.6, -0.6)),
    ("CAM_05_Window", (-0.4, -3.0, EYE), (-0.4, 3.0)),
    ("CAM_06_Lounge", (-4.4, -1.4, EYE), (-1.0, 1.0)),
    ("CAM_07_Ceiling", (0.2, 0.4, 1.4), (1.4, -1.4)),
    ("CAM_08_Media", (-0.4, 0.2, EYE), (-5.4, 0.2)),
    ("CAM_09_Overview", (5.0, 2.55, 2.55), (-3.0, -2.5)),
]
for name, loc, look in cams:
    cd = bpy.data.cameras.new(name); cd.lens = 18; cd.clip_start = 0.05
    co = bpy.data.objects.new(name, cd); C_CAMS.objects.link(co); co.location = loc
    d = Vector((look[0] - loc[0], look[1] - loc[1], 0.0))
    heading = math.atan2(-d.x, d.y) if d.length > 1e-3 else 0.0
    pitch = math.radians(128) if "Ceiling" in name else math.radians(88 if "Overview" not in name else 72)
    co.rotation_euler = (pitch, 0, heading)
scene.camera = bpy.data.objects["CAM_09_Overview"]

# ------------------------------------------------------------------ save (never overwrite)
if errors:
    for e in errors:
        print(f"[INFINIVIZ] ERROR: {e}", flush=True)
    sys.exit(1)
out = os.path.abspath(args.out)
if os.path.exists(out):
    s, e = os.path.splitext(out); out = f"{s}_{datetime.datetime.now():%Y%m%d-%H%M%S}{e}"
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out)
tris = sum(len(p.vertices) - 2 for o in scene.objects if o.type == "MESH" for p in o.data.polygons)
log(f"Saved {out}  |  objects {len(scene.objects)}, base triangles {tris:,}, materials {len(bpy.data.materials)}")
