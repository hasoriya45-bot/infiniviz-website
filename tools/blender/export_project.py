"""
INFINIVIZ - Blender export pipeline (Blender 4.2+ / 5.x, Cycles).

Exports one project for the website:
  model/<id>.glb              optimized web model (Draco, optional material swatches)
  panoramas/view-NN-<slug>.jpg   equirectangular 360 renders from the real Blender cameras
  panoramas/2k/...            half-resolution copies for phones
  panoramas/<variant>/...     extra lighting variants (if configured)
  textures/                   every image texture used by the scene
  thumbnails/                 small previews of each panorama
  manifest.json               everything the website needs (written only on success)
  export-report.json          always written; lists every error

Run (normally through tools/export.ps1):
  blender -b "Nimesh Bedroom.blend" --python-exit-code 1 --python tools/blender/export_project.py -- \
      --config tools/blender/projects/nimesh-bedroom.json --out "D:/INFINIVIZ/exports/nimesh-bedroom"

The .blend file is never saved or modified.
"""
import argparse
import datetime
import json
import math
import os
import shutil
import struct
import sys
import time
import traceback

import bpy
from mathutils import Vector

PREFIX = "[INFINIVIZ]"
errors = []
warnings = []


def log(msg):
    print(f"{PREFIX} {msg}", flush=True)


def err(msg):
    errors.append(msg)
    print(f"{PREFIX} ERROR: {msg}", flush=True)


def warn(msg):
    warnings.append(msg)
    print(f"{PREFIX} WARNING: {msg}", flush=True)


# --------------------------------------------------------------------------- args / config
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="INFINIVIZ Blender export")
    p.add_argument("--config", required=True, help="Project config JSON")
    p.add_argument("--out", required=True, help="Export folder (outside the website repo)")
    p.add_argument("--samples", type=int, default=None, help="Cycles samples (overrides config)")
    p.add_argument("--resolution", type=int, default=None, help="Panorama width; height is width/2 (default 4096)")
    p.add_argument("--device", default="GPU", choices=["GPU", "CPU"])
    p.add_argument("--validate-only", action="store_true", help="Only check the scene, export nothing")
    p.add_argument("--skip-panoramas", action="store_true")
    p.add_argument("--skip-model", action="store_true")
    return p.parse_args(argv)


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    for key in ("id", "title", "views"):
        if key not in cfg:
            raise ValueError(f"Config is missing '{key}'")
    for i, v in enumerate(cfg["views"], 1):
        for key in ("slug", "label", "camera"):
            if key not in v:
                raise ValueError(f"View #{i} in config is missing '{key}'")
    return cfg


# --------------------------------------------------------------------------- helpers
def to_gltf(v):
    """Blender Z-up -> glTF / three.js Y-up (metres)."""
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def view_angles(cam_obj):
    """Yaw/pitch in the website's convention: yaw 0 looks toward -Z (glTF), +yaw turns left."""
    fwd = cam_obj.matrix_world.to_3x3() @ Vector((0.0, 0.0, -1.0))
    fx, fy, fz = fwd.x, fwd.z, -fwd.y  # to glTF axes
    yaw = math.atan2(-fx, -fz)
    pitch = math.asin(max(-1.0, min(1.0, fy)))
    heading_blender = math.atan2(-fwd.x, fwd.y)  # Z rotation that makes a level camera face the same way
    return yaw, pitch, heading_blender


def file_ok(path, min_bytes=1):
    return os.path.isfile(path) and os.path.getsize(path) >= min_bytes


def check_glb(path):
    """Minimal GLB validation: header, version, declared length, JSON chunk."""
    problems = []
    info = {}
    with open(path, "rb") as f:
        data = f.read()
    if len(data) < 20:
        return ["GLB is too small"], info
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        problems.append("GLB magic header is not 'glTF'")
    if version != 2:
        problems.append(f"GLB version is {version}, expected 2")
    if length != len(data):
        problems.append(f"GLB declared length {length} != file size {len(data)}")
    chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        problems.append("First GLB chunk is not JSON")
        return problems, info
    gltf = json.loads(data[20:20 + chunk_len].decode("utf-8"))
    tris = 0
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            idx = prim.get("indices")
            if idx is not None:
                tris += gltf["accessors"][idx]["count"] // 3
    info = {
        "bytes": len(data),
        "meshes": len(gltf.get("meshes", [])),
        "materials": [m.get("name", "") for m in gltf.get("materials", [])],
        "images": len(gltf.get("images", [])),
        "triangles": tris,
        "extensionsRequired": gltf.get("extensionsRequired", []),
    }
    supported = {"KHR_draco_mesh_compression", "KHR_mesh_quantization", "KHR_texture_transform",
                 "EXT_texture_webp", "KHR_materials_emissive_strength", "KHR_lights_punctual",
                 "KHR_materials_transmission", "KHR_materials_ior", "KHR_materials_specular",
                 "KHR_materials_volume", "KHR_materials_clearcoat", "KHR_materials_sheen",
                 "KHR_texture_basisu", "EXT_meshopt_compression"}
    for ext in info["extensionsRequired"]:
        if ext not in supported:
            problems.append(f"GLB requires extension '{ext}' that the website viewer may not support")
    return problems, info


# --------------------------------------------------------------------------- validation
def validate(cfg):
    scene = bpy.data.scenes.get(cfg["scene"]) if cfg.get("scene") else bpy.context.scene
    if scene is None:
        err(f"Scene '{cfg.get('scene')}' not found. Scenes in file: {[s.name for s in bpy.data.scenes]}")
        return None
    log(f"Scene: '{scene.name}'")

    cams = [o.name for o in scene.objects if o.type == "CAMERA"]
    for i, v in enumerate(cfg["views"], 1):
        obj = bpy.data.objects.get(v["camera"])
        if obj is None:
            err(f"View {i:02d} '{v['label']}': camera object '{v['camera']}' not found")
        elif obj.type != "CAMERA":
            err(f"View {i:02d} '{v['label']}': object '{v['camera']}' is a {obj.type}, not a camera")
        elif obj.name not in scene.objects:
            err(f"View {i:02d} '{v['label']}': camera '{v['camera']}' is not in scene '{scene.name}'")
    if errors:
        log(f"Cameras present in the scene: {cams}")

    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        err("Scene contains no mesh objects - nothing to export")
    else:
        log(f"Meshes: {len(meshes)}")

    for img in bpy.data.images:
        if img.users == 0 or img.type != "IMAGE" or img.source not in {"FILE", "TILED"}:
            continue
        if img.packed_file:
            continue
        path = bpy.path.abspath(img.filepath)
        if not os.path.exists(path.replace("<UDIM>", "1001")):
            err(f"Missing texture file for image '{img.name}': {path}")

    for opt in cfg.get("material_options", []):
        if opt.get("target_material") not in bpy.data.materials:
            err(f"Material option '{opt.get('label')}': target material '{opt.get('target_material')}' not found")
        for choice in opt.get("choices", []):
            if choice.get("material") not in bpy.data.materials:
                err(f"Material option '{opt.get('label')}': choice material '{choice.get('material')}' not found")

    for var in cfg.get("lighting_variants", []):
        if var.get("world") and var["world"] not in bpy.data.worlds:
            err(f"Lighting variant '{var['id']}': world '{var['world']}' not found")
        for c in var.get("show_collections", []) + var.get("hide_collections", []):
            if c not in bpy.data.collections:
                err(f"Lighting variant '{var['id']}': collection '{c}' not found")
    return scene


# --------------------------------------------------------------------------- render setup
def setup_cycles(scene, device_pref, samples):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    used = "CPU"
    if device_pref == "GPU":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = backend
            except TypeError:
                continue
            (getattr(prefs, "refresh_devices", None) or prefs.get_devices)()
            devs = [d for d in prefs.devices if d.type == backend]
            if devs:
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                used = f"GPU ({backend}: {', '.join(d.name for d in devs)})"
                break
    if used == "CPU":
        scene.cycles.device = "CPU"
        if device_pref == "GPU":
            warn("No compatible GPU found for Cycles - rendering on CPU (slow)")
    log(f"Cycles device: {used}, samples: {samples}")
    return used


def apply_variant(var):
    """Toggle world/collections for a lighting variant. Returns an undo function."""
    scene = bpy.context.scene
    old_world = scene.world
    old_vis = {}
    if var.get("world"):
        scene.world = bpy.data.worlds[var["world"]]
    for name in var.get("show_collections", []):
        c = bpy.data.collections[name]; old_vis[name] = c.hide_render; c.hide_render = False
    for name in var.get("hide_collections", []):
        c = bpy.data.collections[name]; old_vis[name] = c.hide_render; c.hide_render = True

    def undo():
        scene.world = old_world
        for name, v in old_vis.items():
            bpy.data.collections[name].hide_render = v
    return undo


def save_scaled(src_path, dst_path, w, h, quality=85):
    img = bpy.data.images.load(src_path, check_existing=False)
    try:
        img.scale(w, h)
        img.filepath_raw = dst_path
        img.file_format = "JPEG"
        try:
            img.save(filepath=dst_path, quality=quality)
        except TypeError:
            img.save()
    finally:
        bpy.data.images.remove(img)
    if not file_ok(dst_path, 1024):
        raise RuntimeError(f"Scaled image was not written: {dst_path}")


def render_panoramas(scene, cfg, out, width, variant_dir=""):
    height = width // 2
    pano_dir = os.path.join(out, "panoramas", variant_dir)
    mobile_dir = os.path.join(out, "panoramas", variant_dir, "2k") if not variant_dir else os.path.join(out, "panoramas", variant_dir, "2k")
    thumb_dir = os.path.join(out, "thumbnails", variant_dir)
    for d in (pano_dir, mobile_dir, thumb_dir):
        os.makedirs(d, exist_ok=True)

    r = scene.render
    saved = (r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.use_file_extension,
             r.image_settings.file_format, getattr(r.image_settings, "quality", 90), scene.camera)
    r.resolution_x, r.resolution_y, r.resolution_percentage = width, height, 100
    r.use_file_extension = True
    r.image_settings.file_format = "JPEG"
    r.image_settings.quality = int(cfg.get("panorama_jpeg_quality", 90))

    cam_data = bpy.data.cameras.new("__infiniviz_pano")
    cam_data.type = "PANO"
    try:
        cam_data.panorama_type = "EQUIRECTANGULAR"
    except AttributeError:
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"
    pano_cam = bpy.data.objects.new("__infiniviz_pano", cam_data)
    scene.collection.objects.link(pano_cam)
    results = []
    try:
        for i, v in enumerate(cfg["views"], 1):
            name = f"view-{i:02d}-{v['slug']}"
            src = bpy.data.objects[v["camera"]]
            _, _, heading = view_angles(src)
            pano_cam.location = src.matrix_world.translation
            pano_cam.rotation_euler = (math.pi / 2, 0.0, heading)  # level horizon, same heading
            cam_data.clip_start = min(src.data.clip_start, 0.05)
            scene.camera = pano_cam
            stem = os.path.join(pano_dir, name)
            t0 = time.time()
            log(f"Rendering {variant_dir or 'default'} / {name} ({width}x{height}) ...")
            try:
                r.filepath = stem
                bpy.ops.render.render(write_still=True, scene=scene.name)
                path = stem + ".jpg"
                if not file_ok(path, 10_000):
                    raise RuntimeError("render finished but no image was written")
                save_scaled(path, os.path.join(mobile_dir, name + ".jpg"), max(1024, width // 2), max(512, height // 2))
                save_scaled(path, os.path.join(thumb_dir, name + ".jpg"), 512, 256, 80)
                log(f"  done in {time.time() - t0:.1f}s")
                results.append(name)
            except Exception as e:  # report, keep going so every failure is listed
                err(f"Panorama '{name}' ({v['label']}) failed: {e}")
    finally:
        bpy.data.objects.remove(pano_cam, do_unlink=True)
        bpy.data.cameras.remove(cam_data)
        (r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.use_file_extension,
         r.image_settings.file_format, r.image_settings.quality, scene.camera) = saved
    return results


# --------------------------------------------------------------------------- model / textures
def add_material_swatches(scene, cfg):
    """Alternative materials are only exported if something uses them: add tiny hidden swatch objects."""
    created = []
    used = {s.material.name for o in scene.objects if o.type == "MESH" for s in o.material_slots if s.material}
    for opt in cfg.get("material_options", []):
        for choice in opt.get("choices", []):
            mname = choice["material"]
            if mname in used or mname not in bpy.data.materials:
                continue
            me = bpy.data.meshes.new(f"__swatch__{mname}")
            me.from_pydata([(0, 0, 0), (0.01, 0, 0), (0, 0.01, 0)], [], [(0, 1, 2)])
            me.materials.append(bpy.data.materials[mname])
            ob = bpy.data.objects.new(f"__swatch__{mname}", me)
            ob.location = (0, 0, -1000)
            scene.collection.objects.link(ob)
            created.append(ob)
            used.add(mname)
    return created


def export_glb(scene, cfg, out):
    model_dir = os.path.join(out, "model")
    os.makedirs(model_dir, exist_ok=True)
    path = os.path.join(model_dir, f"{cfg['id']}.glb")
    m = cfg.get("model", {})
    wanted = {
        "filepath": path,
        "export_format": "GLB",
        "use_renderable": True,
        "use_active_scene": True,
        "export_apply": True,
        "export_cameras": False,
        "export_lights": bool(m.get("export_lights", True)),
        "export_import_convert_lighting_mode": "SPEC",
        "export_extras": True,
        "export_yup": True,
        "export_image_format": m.get("image_format", "AUTO"),
        "export_image_quality": int(m.get("image_quality", 85)),
        "export_draco_mesh_compression_enable": bool(m.get("draco", True)),
        "export_draco_mesh_compression_level": 6,
        "export_animations": False,
    }
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {k: v for k, v in wanted.items() if k in props}
    skipped = [k for k in wanted if k not in props]
    if skipped:
        warn(f"glTF exporter in this Blender version has no options: {skipped}")
    swatches = add_material_swatches(scene, cfg)
    try:
        try:
            bpy.ops.export_scene.gltf(**kwargs)
        except TypeError as e:
            if "export_image_format" in kwargs and kwargs["export_image_format"] != "AUTO":
                warn(f"Image format {kwargs['export_image_format']} not supported ({e}); retrying with AUTO")
                kwargs["export_image_format"] = "AUTO"
                bpy.ops.export_scene.gltf(**kwargs)
            else:
                raise
    finally:
        for ob in swatches:
            me = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            bpy.data.meshes.remove(me)
    if not file_ok(path, 1024):
        err(f"GLB export produced no file: {path}")
        return None
    problems, info = check_glb(path)
    for p in problems:
        err(f"GLB validation: {p}")
    limit = float(m.get("max_glb_mb", 80))
    if info.get("bytes", 0) > limit * 1024 * 1024:
        err(f"GLB is {info['bytes'] / 1048576:.1f} MB, over the {limit:.0f} MB limit (GitHub's hard limit is 100 MB). "
            "Decimate geometry, reduce texture sizes or set model.image_format to WEBP/JPEG.")
    log(f"GLB: {info.get('bytes', 0) / 1048576:.1f} MB, {info.get('triangles', 0):,} triangles, "
        f"{len(info.get('materials', []))} materials, {info.get('images', 0)} images")
    return {"file": f"model/{cfg['id']}.glb", **info}


def export_textures(out):
    tex_dir = os.path.join(out, "textures")
    os.makedirs(tex_dir, exist_ok=True)
    listed = []
    for img in bpy.data.images:
        if img.users == 0 or img.type != "IMAGE" or img.source not in {"FILE", "GENERATED"}:
            continue
        base = bpy.path.clean_name(img.name)
        try:
            if img.packed_file or img.source == "GENERATED":
                ext = ".png"
                dst = os.path.join(tex_dir, base + ext)
                img.save(filepath=dst)
            else:
                src = bpy.path.abspath(img.filepath)
                ext = os.path.splitext(src)[1] or ".png"
                dst = os.path.join(tex_dir, base + ext)
                shutil.copy2(src, dst)
            listed.append(f"textures/{base}{ext}")
        except Exception as e:
            err(f"Texture '{img.name}' could not be exported: {e}")
    log(f"Textures exported: {len(listed)}")
    return listed


def model_bounds(scene):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in scene.objects:
        if o.type != "MESH" or o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    a, b = to_gltf(lo), to_gltf(hi)
    return {"min": [min(a[i], b[i]) for i in range(3)], "max": [max(a[i], b[i]) for i in range(3)]}


# --------------------------------------------------------------------------- main
def main():
    args = parse_args()
    started = time.time()
    cfg = load_config(args.config)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    blend = bpy.data.filepath
    log(f"Blender {bpy.app.version_string}  |  file: {os.path.basename(blend) or '(unsaved)'}  |  project: {cfg['id']}")
    log(f"Export folder: {out}")

    scene = validate(cfg)
    report = {"project": cfg["id"], "blend_file": os.path.basename(blend), "blender": bpy.app.version_string,
              "started": datetime.datetime.now().isoformat(timespec="seconds")}
    if scene is None or errors or args.validate_only:
        return finish(out, report, None, started)

    bpy.context.window_manager  # ensure context
    width = args.resolution or int(cfg.get("panorama_width", 4096))
    if width % 2:
        width += 1
    samples = args.samples or int(cfg.get("samples", 512))

    views_out = []
    for i, v in enumerate(cfg["views"], 1):
        cam = bpy.data.objects[v["camera"]]
        yaw, pitch, _ = view_angles(cam)
        name = f"view-{i:02d}-{v['slug']}"
        views_out.append({
            "id": f"view-{i:02d}", "slug": v["slug"], "label": v["label"], "camera": v["camera"],
            "position": to_gltf(cam.matrix_world.translation),
            "yaw": round(yaw, 4), "pitch": round(pitch, 4),
            "panorama": f"panoramas/{name}.jpg",
            "panorama_mobile": f"panoramas/2k/{name}.jpg",
            "thumbnail": f"thumbnails/{name}.jpg",
        })

    lighting = []
    device = None
    if not args.skip_panoramas:
        device = setup_cycles(scene, args.device, samples)
        render_panoramas(scene, cfg, out, width)
        lighting.append({"id": "default", "label": cfg.get("default_lighting_label", "As rendered"), "panoramas_dir": ""})
        for var in cfg.get("lighting_variants", []):
            undo = apply_variant(var)
            try:
                render_panoramas(scene, cfg, out, width, var["id"])
            finally:
                undo()
            lighting.append({"id": var["id"], "label": var.get("label", var["id"]), "panoramas_dir": var["id"],
                             "exposure": var.get("web_exposure", 1.0)})

    model = None
    if not args.skip_model:
        model = export_glb(scene, cfg, out)

    textures = export_textures(out)

    manifest = {
        "schema": 1,
        "id": cfg["id"],
        "title": cfg["title"],
        "description": cfg.get("description", ""),
        "test_fixture": bool(cfg.get("test_fixture", False)),
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "source": {"blend_file": os.path.basename(blend), "blender": bpy.app.version_string, "scene": scene.name},
        "render": {"engine": "CYCLES", "samples": samples, "panorama_size": [width, width // 2], "device": device},
        "model": model,
        "bounds": model_bounds(scene),
        "eye_height": float(cfg.get("eye_height", 1.6)),
        "views": views_out,
        "lighting": lighting,
        "materials": cfg.get("material_options", []),
        "textures": textures,
        "environment": cfg.get("web_environment"),
    }
    return finish(out, report, manifest, started)


def finish(out, report, manifest, started):
    report["finished"] = datetime.datetime.now().isoformat(timespec="seconds")
    report["seconds"] = round(time.time() - started, 1)
    report["errors"] = errors
    report["warnings"] = warnings
    report["ok"] = not errors
    with open(os.path.join(out, "export-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    if manifest is not None and not errors:
        with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        log(f"SUCCESS - manifest written. {len(warnings)} warning(s).")
        return 0
    if manifest is None and not errors:
        log("Validation passed (validate-only run).")
        return 0
    log(f"FAILED with {len(errors)} error(s). No manifest written. See export-report.json")
    return 1


if __name__ == "__main__":
    try:
        code = main()
    except Exception as e:
        traceback.print_exc()
        err(f"Unexpected failure: {e}")
        code = 1
    sys.stdout.flush()
    if code:
        sys.exit(code)
