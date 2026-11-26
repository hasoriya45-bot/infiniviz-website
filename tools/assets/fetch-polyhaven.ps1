<#
INFINIVIZ - download the CC0 Poly Haven textures and HDRIs listed in polyhaven-assets.json.

  .\tools\assets\fetch-polyhaven.ps1 [-Dest ..\infiniviz-assets\polyhaven]

Files land outside the website repo. Existing files with the right size are skipped (safe to re-run).
Writes CREDITS.md (all assets CC0, https://polyhaven.com/license).
#>
param([string]$Dest = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Dest) { $Dest = Join-Path (Split-Path -Parent $repo) 'infiniviz-assets\polyhaven' }
$cfg = Get-Content (Join-Path $PSScriptRoot 'polyhaven-assets.json') -Raw | ConvertFrom-Json
$h = @{ 'User-Agent' = 'infiniviz-asset-fetch' }
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force $Dest | Out-Null
$credits = @('# Poly Haven assets (CC0)', '', 'All assets below are CC0 (public domain) from https://polyhaven.com - https://polyhaven.com/license', '')
$problems = @(); $total = 0

function Get-File($url, $out, $size) {
  if ((Test-Path $out) -and (Get-Item $out).Length -eq $size) { return 'cached' }
  Invoke-WebRequest $url -OutFile $out -UseBasicParsing -Headers $h
  if ((Get-Item $out).Length -ne $size) { throw "size mismatch for $out" }
  return 'downloaded'
}

foreach ($id in $cfg.textures) {
  try {
    $files = Invoke-RestMethod "https://api.polyhaven.com/files/$id" -Headers $h
    $dir = Join-Path $Dest "textures\$id"; New-Item -ItemType Directory -Force $dir | Out-Null
    foreach ($map in $cfg.texture_maps) {
      $names = @($map); if ($map -ieq 'Diffuse') { $names += 'col_1', 'col_01', 'col_03', 'diff' }  # some sets ship colour variants instead
      $prop = foreach ($nm in $names) { $p = $files.PSObject.Properties | Where-Object { $_.Name -ieq $nm } | Select-Object -First 1; if ($p) { $p; break } }
      if (-not $prop) { $problems += "$id has no '$map' map"; continue }
      $f = $prop.Value.($cfg.texture_resolution).jpg
      if (-not $f) { $problems += "$id/$map has no $($cfg.texture_resolution) jpg"; continue }
      $out = Join-Path $dir ("{0}_{1}_{2}.jpg" -f $id, $map.ToLower(), $cfg.texture_resolution)
      $state = Get-File $f.url $out $f.size; $total += $f.size
      Write-Host ("  {0,-24} {1,-8} {2,6:N1} MB  {3}" -f $id, $map, ($f.size / 1MB), $state)
    }
    $credits += "- $id - https://polyhaven.com/a/$id"
  } catch { $problems += "texture $id : $($_.Exception.Message)" }
}
foreach ($hd in $cfg.hdris) {
  try {
    $files = Invoke-RestMethod "https://api.polyhaven.com/files/$($hd.id)" -Headers $h
    $f = $files.hdri.($hd.resolution).hdr
    $dir = Join-Path $Dest 'hdris'; New-Item -ItemType Directory -Force $dir | Out-Null
    $out = Join-Path $dir ("{0}_{1}.hdr" -f $hd.id, $hd.resolution)
    $state = Get-File $f.url $out $f.size; $total += $f.size
    Write-Host ("  {0,-38} HDRI {1,6:N1} MB  {2}  ({3})" -f $hd.id, ($f.size / 1MB), $state, $hd.use)
    $credits += "- $($hd.id) (HDRI, $($hd.use)) - https://polyhaven.com/a/$($hd.id)"
  } catch { $problems += "hdri $($hd.id) : $($_.Exception.Message)" }
}
[IO.File]::WriteAllText((Join-Path $Dest 'CREDITS.md'), ($credits -join "`n"), (New-Object Text.UTF8Encoding $false))
Write-Host ("Total {0:N0} MB in {1}" -f ($total / 1MB), $Dest)
if ($problems) { Write-Host 'PROBLEMS:' -ForegroundColor Red; $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }; exit 1 }
Write-Host 'ALL ASSETS OK' -ForegroundColor Green
