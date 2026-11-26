"""
INFINIVIZ - bring a SketchUp (or other) export into Blender and save a project .blend.

  blender -b --factory-startup --python-exit-code 1 --python tools/blender/import_model.py -- \
      --input "D:/INFINIVIZ/Nimesh Bedroom/Nimesh.fbx" --out "D:/INFINIVIZ/Nimesh Bedroom/Nimesh Bedroom.blend" \
      [--d5-meta "<D5VirtualTour>/_Resource/meta.json"] [--camera-map '{"9":"CAM_01_Bed", ...}'] [--scale 1.0]

What it does (and does not do):
  * Imports FBX / OBJ / glTF / GLB. (Blender 5.x no longer imports COLLADA .dae - export FBX from SketchUp.)
  * Reports real-world size, materials and any missing texture files. Packs found textures into the .blend.
  * Adds an editable daylight setup (sky world + sun) in collection INFINIVIZ_Lighting - SketchUp exports carry no lights.
  * Optional: places cameras at the real D5 Render tour camera positions (meta.json), but only if they land inside
    the imported model (floor below, ceiling above). Otherwise no cameras are created and the report says why.
  * Never modifies the input file; never overwrites an existing .blend (adds a timestamp instead).
"""
import argparse
import datetime
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

P = "[INFINIVIZ]"
report = {"errors": [], "warnings": [], "info": {}}


def log(m): print(f"{P} {m}", flush=True)
def err(m): report["errors"].append(m); print(f"{P} ERROR: {m}", flush=True)
def warn(m): report["warnings"].append(m); print(f"{P} WARNING: {m}", flush=True)


argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--input", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--d5-meta", default="")
ap.add_argument("--camera-map", default="", help='JSON: {"<D5 view number>": "<camera name>"}')
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--no-pack", action="store_true")
args = ap.parse_args(argv)

src = os.path.abspath(args.input)
ext = os.path.splitext(src)[1].lower()
if not os.path.isfile(src):
    err(f"Input file not found: {src}")
elif ext == ".dae":
    err("Blender 5.x cannot import COLLADA (.dae). In SketchUp use File > Export > 3D Model > FBX instead.")

if not report["errors"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    log(f"Importing {os.path.basename(src)} ...")
    try:
        if ext == ".fbx":
            bpy.ops.import_scene.fbx(filepath=src, use_image_search=True, use_custom_normals=True, global_scale=args.scale)
        elif ext == ".obj":
            bpy.ops.wm.obj_import(filepath=src, global_scale=args.scale)
        elif ext in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=src)
        else:
            err(f"Unsupported file type '{ext}'. Use .fbx, .obj, .glb or .gltf.")
    except Exception as e:
        err(f"Import failed: {e}")

if not report["errors"]:
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        err("The file contains no mesh geometry.")

if not report["errors"]:
    # ---- size, triangles, materials, textures
    lo = Vector((1e18,) * 3); hi = Vector((-1e18,) * 3); tris = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    size = hi - lo
    report["info"].update({"objects": len(meshes), "triangles": tris,
                           "size_m": [round(size.x, 2), round(size.y, 2), round(size.z, 2)],
                           "bounds_min": [round(v, 2) for v in lo], "bounds_max": [round(v, 2) for v in hi]})
    log(f"Objects: {len(meshes)}, triangles: {tris:,}, size: {size.x:.2f} x {size.y:.2f} x {size.z:.2f} m")
    if max(size) > 200:
        warn(f"Model is {max(size):.0f} m across - units look wrong (cm or inches?). Re-run with --scale 0.01 (cm) or 0.0254 (inches).")
    if tris > 1_500_000:
        warn(f"{tris:,} triangles is heavy for the web; decimate or remove hidden detail before export (target < 1.5 M).")
    mats = sorted({s.material.name for o in meshes for s in o.material_slots if s.material})
    report["info"]["materials"] = mats
    log(f"Materials: {len(mats)}")
    missing = []
    for img in bpy.data.images:
        if img.source == "FILE" and not img.packed_file and not os.path.exists(bpy.path.abspath(img.filepath)):
            missing.append(f"{img.name} ({img.filepath})")
    if missing:
        warn(f"{len(missing)} texture file(s) not found - export the FBX with 'Export texture maps' on: {missing[:10]}")
    if not args.no_pack:
        try:
            bpy.ops.file.pack_all()
            log("Textures packed into the .blend")
        except Exception as e:
            warn(f"Could not pack textures: {e}")

    # ---- editable daylight setup (no lights come from SketchUp)
    col = bpy.data.collections.new("INFINIVIZ_Lighting"); scene.collection.children.link(col)
    world = bpy.data.worlds.new("World_Day"); world.use_nodes = True; scene.world = world
    nt = world.node_tree; bg = nt.nodes["Background"]
    try:
        sky = nt.nodes.new("ShaderNodeTexSky")
        for t in ("NISHITA", "SINGLE_SCATTERING", "MULTIPLE_SCATTERING", "PREETHAM"):
            try: sky.sky_type = t; break
            except TypeError: continue
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.6
    except Exception as e:
        warn(f"Sky texture not available ({e}); using a plain sky colour")
        bg.inputs["Color"].default_value = (0.55, 0.65, 0.8, 1)
    sun_data = bpy.data.lights.new("Sun", "SUN"); sun_data.energy = 3.0; sun_data.angle = math.radians(1.5)
    sun = bpy.data.objects.new("Sun", sun_data); col.objects.link(sun)
    sun.rotation_euler = (math.radians(55), 0, math.radians(35))
    log("Added daylight: World_Day (sky) + Sun in collection INFINIVIZ_Lighting - adjust in Blender")
    scene.render.engine = "CYCLES"

    # ---- cameras from the D5 tour, only if they truly sit inside this model
    if args.d5_meta:
        try:
            meta = json.loads(open(args.d5_meta, encoding="utf-8-sig").read())
            d5 = [(i + 1, s.get("sceneTitle", str(i + 1)), s["cameraPos"]) for i, s in enumerate(meta["sceneArray"])]
        except Exception as e:
            d5 = []; err(f"Could not read D5 meta.json: {e}")
        if d5:
            bm = bmesh.new()
            for o in meshes:
                me = o.evaluated_get(dg).to_mesh()
                tmp = bmesh.new(); tmp.from_mesh(me); tmp.transform(o.matrix_world)
                tm = bpy.data.meshes.new("__tmp"); tmp.to_mesh(tm); bm.from_mesh(tm); bpy.data.meshes.remove(tm); tmp.free()
                o.evaluated_get(dg).to_mesh_clear()
            tree = BVHTree.FromBMesh(bm); bm.free()
            cands = []
            for swap in (False, True):
                for sx in (1, -1):
                    for sy in (1, -1):
                        cands.append((swap, sx, sy))

            def place(c, p):
                x, y = (p["y"], p["x"]) if c[0] else (p["x"], p["y"])
                return Vector((c[1] * x / 100.0, c[2] * y / 100.0, p["z"] / 100.0))

            def score(c):
                ok = 0
                for _, _, p in d5:
                    v = place(c, p)
                    down = tree.ray_cast(v, Vector((0, 0, -1)), 3.0)
                    up = tree.ray_cast(v, Vector((0, 0, 1)), 4.0)
                    if down[0] is not None and up[0] is not None and 0.6 < (v - down[0]).length < 2.6:
                        ok += 1
                return ok

            scored = sorted(((score(c), c) for c in cands), key=lambda t: -t[0])
            best_n, best = scored[0]
            report["info"]["d5_alignment"] = {"inside": best_n, "of": len(d5), "mapping": {"swap_xy": best[0], "flip_x": best[1] < 0, "flip_y": best[2] < 0}}
            if best_n < len(d5):
                warn(f"D5 cameras do not line up with this model ({best_n}/{len(d5)} land inside a room). "
                     "No cameras created - place the 9 cameras by hand (see tools/README.md).")
            else:
                cmap = json.loads(args.camera_map) if args.camera_map else {}
                cams = bpy.data.collections.new("INFINIVIZ_Cameras"); scene.collection.children.link(cams)
                centre = sum((place(best, p) for _, _, p in d5), Vector()) / len(d5)
                for n, title, p in d5:
                    name = cmap.get(str(n)) or f"D5_{n:02d}"
                    cd = bpy.data.cameras.new(name); cd.lens = 18
                    co = bpy.data.objects.new(name, cd); cams.objects.link(co)
                    co.location = place(best, p)
                    d = centre - co.location; heading = math.atan2(-d.x, d.y) if d.length > 0.2 else 0.0
                    co.rotation_euler = (math.radians(90), 0, heading)
                    co["d5_view"] = n; co["d5_title"] = title
                log(f"Created {len(d5)} cameras at the real D5 positions (all {best_n} inside the room).")
                if not cmap:
                    log("Cameras are named D5_01..D5_09 - rename them to CAM_01_Bed ... CAM_09_Full_Room once the mapping is confirmed.")

    # ---- save (never overwrite)
    out = os.path.abspath(args.out)
    if os.path.exists(out):
        stem, e = os.path.splitext(out)
        out = f"{stem}_{datetime.datetime.now():%Y%m%d-%H%M%S}{e}"
        warn(f"{os.path.basename(args.out)} already exists - saved as {os.path.basename(out)} instead")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    report["info"]["saved"] = out
    log(f"Saved {out}")

rep_path = os.path.splitext(os.path.abspath(args.out))[0] + "_import-report.json"
try:
    os.makedirs(os.path.dirname(rep_path), exist_ok=True)
    with open(rep_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
except Exception:
    pass
log("FAILED" if report["errors"] else "DONE")
sys.exit(1 if report["errors"] else 0)
