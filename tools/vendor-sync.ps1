<#
INFINIVIZ - copy the exact pinned versions of the JavaScript libraries into vendor/ so the site
never depends on a third-party CDN being reachable (some networks block cdn.jsdelivr.net).

  .\tools\vendor-sync.ps1

Re-run only when upgrading a library version below. Follows relative imports recursively.
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $repo 'vendor'
$THREE = '0.160.0'; $BVH = '0.7.8'; $LENIS = '1.1.13'; $GSAP = '3.12.5'
$cdn = 'https://cdn.jsdelivr.net/npm'

$entries = @(
  "three@$THREE/build/three.module.min.js",
  "three@$THREE/examples/jsm/controls/OrbitControls.js",
  "three@$THREE/examples/jsm/environments/RoomEnvironment.js",
  "three@$THREE/examples/jsm/objects/Sky.js",
  "three@$THREE/examples/jsm/loaders/GLTFLoader.js",
  "three@$THREE/examples/jsm/loaders/DRACOLoader.js",
  "three@$THREE/examples/jsm/loaders/RGBELoader.js",
  "three@$THREE/examples/jsm/postprocessing/EffectComposer.js",
  "three@$THREE/examples/jsm/postprocessing/RenderPass.js",
  "three@$THREE/examples/jsm/postprocessing/UnrealBloomPass.js",
  "three@$THREE/examples/jsm/postprocessing/OutputPass.js",
  "three@$THREE/examples/jsm/libs/draco/gltf/draco_decoder.js",
  "three@$THREE/examples/jsm/libs/draco/gltf/draco_decoder.wasm",
  "three@$THREE/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js",
  "three-mesh-bvh@$BVH/build/index.module.js",
  "lenis@$LENIS/dist/lenis.min.js"
)
$extra = @{
  "gsap/gsap.min.js"          = "https://cdnjs.cloudflare.com/ajax/libs/gsap/$GSAP/gsap.min.js"
  "gsap/ScrollTrigger.min.js" = "https://cdnjs.cloudflare.com/ajax/libs/gsap/$GSAP/ScrollTrigger.min.js"
}

function Get-LocalPath([string]$pkgPath) {
  # three@0.160.0/x/y.js -> vendor/three/x/y.js ; three-mesh-bvh@0.7.8/build/index.module.js -> vendor/three-mesh-bvh/index.module.js
  $name, $rest = $pkgPath -split '@[^/]+/', 2
  if ($name -eq 'three-mesh-bvh') { $rest = $rest -replace '^build/', '' }
  if ($name -eq 'lenis') { $rest = $rest -replace '^dist/', '' }
  return Join-Path $vendor (Join-Path $name $rest)
}

$seen = @{}; $queue = New-Object System.Collections.Queue
$entries | ForEach-Object { $queue.Enqueue($_) }
$ProgressPreference = 'SilentlyContinue'
while ($queue.Count) {
  $p = $queue.Dequeue(); if ($seen[$p]) { continue }; $seen[$p] = $true
  $dst = Get-LocalPath $p
  New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
  Invoke-WebRequest "$cdn/$p" -OutFile $dst -UseBasicParsing
  if ($p -like '*.js' -and $p -like 'three@*') {
    $txt = [IO.File]::ReadAllText($dst)
    foreach ($m in [regex]::Matches($txt, "(?:from|import)\s*\(?\s*['""](\.{1,2}/[^'""]+)['""]")) {
      $base = [Uri]"https://x/$p"
      $rel = ([Uri]::new($base, $m.Groups[1].Value)).AbsolutePath.TrimStart('/')
      if (-not $seen[$rel]) { $queue.Enqueue($rel) }
    }
  }
}
foreach ($k in $extra.Keys) {
  $dst = Join-Path $vendor $k; New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
  Invoke-WebRequest $extra[$k] -OutFile $dst -UseBasicParsing
}
$files = Get-ChildItem $vendor -Recurse -File
"vendor/: {0} files, {1:N0} KB (three {2}, three-mesh-bvh {3}, lenis {4}, gsap {5})" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1KB), $THREE, $BVH, $LENIS, $GSAP
