# INFINIVIZ: Blender → Website → GitHub workflow

Three commands take a Blender project to the live "Step inside. Look around." section (04).
Run them from the repository folder in PowerShell.

```powershell
.\tools\export.ps1 -Project nimesh-bedroom -Blend "D:\INFINIVIZ\Nimesh Bedroom\Nimesh Bedroom.blend"
.\tools\sync-assets.ps1 -Project nimesh-bedroom -Feature
.\tools\publish.ps1 -Publish -Message "Add Nimesh Bedroom 3D experience"
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

Check a file without rendering: `.\tools\export.ps1 -Project nimesh-bedroom -Blend "...blend" -ValidateOnly`
Quick low-quality test: add `-Samples 32`. Higher resolution: `-Resolution 8192`.

## A new project
Copy `tools\blender\projects\nimesh-bedroom.json` to `<new-id>.json`, edit the id, title, views and camera names, and run the three commands with `-Project <new-id>`.

## Checking the pipeline on a new PC
`pipeline-test.json` with `tools\blender\make_test_fixture.py` builds a plain test room and runs the whole chain.
It is marked `test_fixture`, so the live site never shows it and `test-site.ps1` and `publish.ps1` refuse to publish it.
