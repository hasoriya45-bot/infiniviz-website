"""
INFINIVIZ - quick Cycles preview stills from each configured view camera (before final panoramas).

  blender -b "<file>.blend" --python-exit-code 1 --python tools/blender/preview_render.py -- \
      --config tools/blender/projects/<id>.json --out "<folder>" [--samples 48] [--width 1280] [--variant evening]

Never saves the .blend. Writes <out>/preview-NN-<slug>[-variant].jpg and prints timings.
"""
import argparse, json, os, sys, time
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--config", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--samples", type=int, default=48); ap.add_argument("--width", type=int, default=1280)
ap.add_argument("--variant", default=""); ap.add_argument("--views", default="", help="comma list of view numbers, default all")
a = ap.parse_args(argv)
cfg = json.load(open(a.config, encoding="utf-8"))
scene = bpy.data.scenes.get(cfg.get("scene")) or bpy.context.scene
os.makedirs(a.out, exist_ok=True)
errors = []

prefs = bpy.context.preferences.addons["cycles"].preferences
device = "CPU"
for backend in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = backend
    except TypeError:
        continue
    (getattr(prefs, "refresh_devices", None) or prefs.get_devices)()
    devs = [d for d in prefs.devices if d.type == backend]
    if devs:
        for d in prefs.devices: d.use = d.type == backend
        scene.cycles.device = "GPU"; device = f"{backend}: {devs[0].name}"; break
print(f"[INFINIVIZ] device {device}", flush=True)

if a.variant:
    var = next((v for v in cfg.get("lighting_variants", []) if v["id"] == a.variant), None)
    if not var:
        print(f"[INFINIVIZ] ERROR: unknown variant {a.variant}"); sys.exit(1)
    if var.get("world"): scene.world = bpy.data.worlds[var["world"]]
    for c in var.get("show_collections", []): bpy.data.collections[c].hide_render = False
    for c in var.get("hide_collections", []): bpy.data.collections[c].hide_render = True

r = scene.render
r.engine = "CYCLES"; scene.cycles.samples = a.samples; scene.cycles.use_denoising = True
r.resolution_x, r.resolution_y, r.resolution_percentage = a.width, int(a.width * 9 / 16), 100
r.image_settings.file_format = "JPEG"; r.image_settings.quality = 88; r.use_file_extension = True
pick = {int(x) for x in a.views.split(",") if x.strip()} if a.views else None
for i, v in enumerate(cfg["views"], 1):
    if pick and i not in pick: continue
    cam = bpy.data.objects.get(v["camera"])
    if not cam: errors.append(f"camera {v['camera']} missing"); continue
    scene.camera = cam
    stem = os.path.join(a.out, f"preview-{i:02d}-{v['slug']}" + (f"-{a.variant}" if a.variant else ""))
    r.filepath = stem
    t0 = time.time()
    try:
        bpy.ops.render.render(write_still=True, scene=scene.name)
        print(f"[INFINIVIZ] {os.path.basename(stem)}.jpg  {time.time() - t0:.1f}s", flush=True)
    except Exception as e:
        errors.append(f"{v['label']}: {e}")
for e in errors: print(f"[INFINIVIZ] ERROR: {e}", flush=True)
sys.exit(1 if errors else 0)
