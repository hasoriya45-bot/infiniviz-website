# INFINIVIZ: Blender → Website → GitHub workflow

Three commands take a Blender project to the live "Step inside. Look around." section (04).
Run them from the repository folder in PowerShell.

```powershell
.\tools\export.cmd -Project nimesh-bedroom -Blend "D:\INFINIVIZ\Nimesh Bedroom\Nimesh Bedroom.blend"
.\tools\sync-assets.cmd -Project nimesh-bedroom -Feature
.\tools\publish.cmd -Publish -Message "Add Nimesh Bedroom 3D experience"
```

| Step | What it does | Stops if… |
|---|---|---|
| `export.ps1` | Opens the .blend in Blender (in the background; the file is never saved). Validates it, renders 9 equirectangular panoramas in Cycles on the GPU (4096×2048 + 2K + thumbnails), exports a Draco GLB and the textures, and writes `manifest.json`. | A camera, texture, material or world is missing, a render fails, or the GLB is invalid or over the size limit |
| `sync-assets.ps1` | Validates the export again, backs up the current website copy to `..\infiniviz-backups\`, copies model, panoramas and thumbnails to `experiences/<project>/`, and updates `experiences/registry.json`. `-Feature` shows the project in Section 04. | Anything is missing or wrong (nothing is copied) |
| `publish.ps1` | Runs `test-site.ps1`. Without `-Publish` it only shows what would change. With `-Publish`: commit → push → wait for GitHub Pages → check the live files. | Any test fails (nothing is committed) |

`test-site.ps1` can be run on its own. It checks every link and asset, then loads the site in headless Microsoft Edge at desktop and phone size. It checks: no errors, all sections, 12 projects, no sideways scrolling, the 3D viewer loads, all panoramas load, every mode works, and walking from every viewpoint never passes through walls. Screenshots go to `..\infiniviz-test-results\`.

## Folders
```
<repo>\                         the website (everything here is public on GitHub Pages)
  experiences\registry.json     which projects exist and which one Section 04 shows
  experiences\<project>\        model\<project>.glb, panoramas\, panoramas\2k\, thumbnails\, manifest.json
  tools\                        these scripts, and tools\blender\projects\<project>.json configs
..\infiniviz-exports\<project>\ raw Blender output, including textures\ and export-report.json (not public)
..\infiniviz-backups\           automatic backups before each sync (not public)
..\infiniviz-test-results\      test reports and screenshots (not public)
```
.blend files, exports and backups are never committed (see `.gitignore`).

## Starting from SketchUp (optional)
Blender 5.x cannot open `.skp` or import COLLADA (`.dae`). In SketchUp use **File › Export › 3D Model › FBX**
(Options: tick *Export texture maps*, units *Meters*), then:
```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python-exit-code 1 --python tools\blender\import_model.py -- --input "D:\INFINIVIZ\Nimesh Bedroom\Nimesh.fbx" --out "D:\INFINIVIZ\Nimesh Bedroom\Nimesh Bedroom.blend" --d5-meta "D:\DESKTOP\nimesh bedroom 360\D5VirtualTour_25780a\_Resource\meta.json"
```
It reports size, triangles, materials and missing textures, packs textures, and adds an editable daylight setup.
With `--d5-meta` it places cameras at the real D5 tour positions, but only if they all land inside the room.
Add `--camera-map '{"9":"CAM_01_Bed", ...}'` to name them directly. It never overwrites an existing .blend.
Open the result in Blender, check the cameras and lighting, then run `export.ps1`.

## Preparing a Blender project
1. **Cameras:** create one camera per viewpoint, named exactly as in the project config. For Nimesh Bedroom:
   `CAM_01_Bed`, `CAM_02_Entrance`, `CAM_03_Wardrobe`, `CAM_04_TV_Unit`, `CAM_05_Window`, `CAM_06_Seating`,
   `CAM_07_Ceiling`, `CAM_08_Bathroom`, `CAM_09_Full_Room`. Place each one at eye height (about 1.5–1.6 m).
   The panorama uses its position and heading, and the horizon is kept level automatically. The walkthrough also starts from these positions.
2. **Materials:** use Principled BSDF with image textures; these export as PBR materials. Keep all textures with the file (File › External Data › Pack Resources) or next to it.
3. **Optimize for the web:** aim for under ~1.5 M triangles and textures of 2K or less. Apply or remove heavy modifiers, and delete hidden helper objects.
   The GLB must stay under 80 MB (GitHub refuses files over 100 MB).
4. **Material options (optional):** create the alternative materials and tick **Fake User** (shield icon) on each, or Blender
   drops unused materials on save. Then list them under `material_options` in the config.
5. **Lighting variants (optional):** create e.g. a `World_Night` world (with Fake User) and a `Night_Lights` collection
   (disabled in renders by default). Then add `{ "id": "night", "label": "Night", "world": "World_Night", "show_collections": ["Night_Lights"] }`
   to `lighting_variants`. Each variant renders its own validated set of 9 panoramas. In the 3D modes,
   lighting is a real-time approximation; baked Blender lighting does not change dynamically.

Check a file without rendering: `.\tools\export.cmd -Project nimesh-bedroom -Blend "...blend" -ValidateOnly`
Quick low-quality test: add `-Samples 32`. Higher resolution: `-Resolution 8192`.

## A new project
Copy `tools\blender\projects\nimesh-bedroom.json` to `<new-id>.json`, edit the id, title, views and camera names, and run the three commands with `-Project <new-id>`.

## Checking the pipeline on a new PC
`pipeline-test.json` with `tools\blender\make_test_fixture.py` builds a plain test room and runs the whole chain.
It is marked `test_fixture`, so the live site never shows it and `test-site.ps1` and `publish.ps1` refuse to publish it.

## Running the scripts on Windows
This PC's PowerShell blocks `.ps1` scripts (execution policy "Restricted"). Use the `.cmd` launchers in `tools\`:
they run the matching `.ps1` with a one-off `-ExecutionPolicy Bypass`, without changing any system setting.

## InfiniViz showcase (Section 04 environment)
The Section 04 environment is an original InfiniViz showcase apartment built entirely by script.
It's a studio demo, not a client project.
```powershell
.\tools\vendor-sync.cmd                      # once: local copies of three.js etc. (already in the repo)
powershell -ExecutionPolicy Bypass -File .\tools\assets\fetch-polyhaven.ps1   # CC0 textures + HDRIs -> ..\infiniviz-assets\polyhaven
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python tools\blender\showcase\build_showcase.py -- --assets ..\infiniviz-assets\polyhaven --out "..\infiniviz-assets\showcase\InfiniViz Showcase.blend"
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b "..\infiniviz-assets\showcase\InfiniViz Showcase.blend" --python tools\blender\preview_render.py -- --config tools\blender\projects\infiniviz-showcase.json --out ..\infiniviz-exports\infiniviz-showcase-previews
.\tools\export.cmd -Project infiniviz-showcase -Blend "..\infiniviz-assets\showcase\InfiniViz Showcase.blend"
.\tools\sync-assets.cmd -Project infiniviz-showcase -Feature
.\tools\publish.cmd                          # tests + dry run; add -Publish only after approval
```
Material options, lighting variants (Day / Evening / Night) and web lighting presets live in
`tools\blender\projects\infiniviz-showcase.json`. Every configurator choice gets a Cycles-rendered thumbnail.

## Blender MCP (live editing from Claude)
* Claude Code user settings (`C:\Users\User\.claude.json`) contain a `blender` MCP server: `uvx blender-mcp` (v2.0.0).
* In Blender 5.2, enable the **Blender MCP** add-on (v1.8; already installed). In the 3D Viewport press **N**, open the
  **BlenderMCP** tab and click **Connect to MCP server** (port 9876).
* Start a new Claude Code session; the Blender tools then appear. They can inspect the open scene, objects and materials and run Python.
* MCP is only for interactive work. The website never depends on Blender running; exports are static files.