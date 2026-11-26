# Shared validation helpers for the INFINIVIZ pipeline (dot-source this file).
Add-Type -AssemblyName System.Drawing

function Read-JsonFile([string]$Path) {
  $txt = [IO.File]::ReadAllText($Path).TrimStart([char]0xFEFF)
  return $txt | ConvertFrom-Json
}

function Test-Glb([string]$Path) {
  # Returns @{ ok; problems; bytes; triangles; materials }
  $r = @{ ok = $false; problems = @(); bytes = 0; triangles = 0; materials = @() }
  if (-not (Test-Path -LiteralPath $Path)) { $r.problems += "missing: $Path"; return $r }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $r.bytes = $bytes.Length
  if ($bytes.Length -lt 20) { $r.problems += 'file too small'; return $r }
  $magic = [Text.Encoding]::ASCII.GetString($bytes, 0, 4)
  $version = [BitConverter]::ToUInt32($bytes, 4)
  $length = [BitConverter]::ToUInt32($bytes, 8)
  $chunkLen = [BitConverter]::ToUInt32($bytes, 12)
  $chunkType = [Text.Encoding]::ASCII.GetString($bytes, 16, 4)
  if ($magic -ne 'glTF') { $r.problems += "bad magic '$magic'" }
  if ($version -ne 2) { $r.problems += "version $version (expected 2)" }
  if ($length -ne $bytes.Length) { $r.problems += "declared length $length != size $($bytes.Length)" }
  if ($chunkType -ne 'JSON') { $r.problems += 'first chunk is not JSON'; return $r }
  try {
    $gltf = [Text.Encoding]::UTF8.GetString($bytes, 20, $chunkLen) | ConvertFrom-Json
    foreach ($m in @($gltf.meshes)) { foreach ($p in @($m.primitives)) { if ($null -ne $p.indices) { $r.triangles += [int]($gltf.accessors[$p.indices].count / 3) } } }
    $r.materials = @($gltf.materials | ForEach-Object { $_.name })
    if (-not @($gltf.meshes).Count) { $r.problems += 'GLB has no meshes' }
  } catch { $r.problems += "JSON chunk unreadable: $($_.Exception.Message)" }
  $r.ok = ($r.problems.Count -eq 0)
  return $r
}

function Get-ImageSize([string]$Path) {
  $img = [System.Drawing.Image]::FromFile($Path)
  try { return @($img.Width, $img.Height) } finally { $img.Dispose() }
}

function Test-ProjectAssets {
  # Validates an export folder or a published experiences/<id> folder against its manifest.
  param([string]$Dir, [switch]$AllowFixture, [int]$MinPanoWidth = 4096, [double]$MaxFileMB = 95)
  $problems = New-Object System.Collections.Generic.List[string]
  $manifestPath = Join-Path $Dir 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { $problems.Add("manifest.json missing in $Dir"); return @{ ok = $false; problems = $problems } }
  try { $m = Read-JsonFile $manifestPath } catch { $problems.Add("manifest.json is not valid JSON: $($_.Exception.Message)"); return @{ ok = $false; problems = $problems } }
  if ($m.test_fixture -and -not $AllowFixture) { $problems.Add("project '$($m.id)' is a TEST FIXTURE and must never be published") }
  if (-not $m.model -or -not $m.model.file) { $problems.Add('manifest has no model') }
  else {
    $g = Test-Glb (Join-Path $Dir $m.model.file)
    foreach ($p in $g.problems) { $problems.Add("GLB: $p") }
  }
  $views = @($m.views)
  if ($views.Count -lt 1) { $problems.Add('manifest has no views') }
  $dirs = @('') + @($m.lighting | Where-Object { $_.panoramas_dir } | ForEach-Object { $_.panoramas_dir })
  foreach ($v in $views) {
    foreach ($ld in $dirs) {
      $pano = if ($ld) { $v.panorama -replace '^panoramas/', "panoramas/$ld/" } else { $v.panorama }
      $mob = if ($ld) { $v.panorama_mobile -replace '^panoramas/', "panoramas/$ld/" } else { $v.panorama_mobile }
      foreach ($pair in @(@($pano, $MinPanoWidth), @($mob, [int]($MinPanoWidth / 2)))) {
        $p = Join-Path $Dir $pair[0]
        if (-not (Test-Path -LiteralPath $p)) { $problems.Add("missing panorama: $($pair[0])"); continue }
        try {
          $s = Get-ImageSize $p
          if ($s[0] -ne 2 * $s[1]) { $problems.Add("$($pair[0]) is $($s[0])x$($s[1]); equirectangular must be 2:1") }
          if ($s[0] -lt $pair[1]) { $problems.Add("$($pair[0]) is $($s[0]) px wide; expected at least $($pair[1])") }
        } catch { $problems.Add("$($pair[0]) is not a readable image") }
      }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Dir $v.thumbnail))) { $problems.Add("missing thumbnail: $($v.thumbnail)") }
    if (@($v.position).Count -ne 3) { $problems.Add("view $($v.id) has no camera position") }
  }
  if ($m.web_lighting) {
    foreach ($p in $m.web_lighting.PSObject.Properties) {
      if ($p.Value.env -and -not (Test-Path -LiteralPath (Join-Path $Dir $p.Value.env))) { $problems.Add("missing lighting environment: $($p.Value.env)") }
    }
  }
  foreach ($opt in @($m.materials)) {
    foreach ($c in @($opt.choices)) {
      if ($c.thumbnail -and -not (Test-Path -LiteralPath (Join-Path $Dir $c.thumbnail))) { $problems.Add("missing material thumbnail: $($c.thumbnail)") }
    }
  }
  Get-ChildItem -LiteralPath $Dir -Recurse -File | Where-Object { $_.Length -gt $MaxFileMB * 1MB } | ForEach-Object {
    $problems.Add(("{0} is {1:N1} MB (limit {2} MB; GitHub rejects files over 100 MB)" -f $_.Name, ($_.Length / 1MB), $MaxFileMB))
  }
  return @{ ok = ($problems.Count -eq 0); problems = $problems; manifest = $m }
}
