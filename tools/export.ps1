<#
INFINIVIZ - step 1 of 3: export a Blender project for the website.

  .\tools\export.ps1 -Project nimesh-bedroom -Blend "D:\INFINIVIZ\Nimesh Bedroom\Nimesh Bedroom.blend"

Options:
  -ExportRoot  where exports go (default: ..\infiniviz-exports next to the repo, never inside the website)
  -Samples     Cycles samples (default from the project config)
  -Resolution  panorama width, height = width/2 (default 4096; use 8192 for 8K)
  -ValidateOnly  check cameras/textures/materials without rendering
  -SkipPanoramas / -SkipModel
  -Device      GPU (default) or CPU
Exit code 0 = success, 1 = validation/export failed (see export-report.json).
#>
param(
  [Parameter(Mandatory = $true)][string]$Project,
  [Parameter(Mandatory = $true)][string]$Blend,
  [string]$ExportRoot = '',
  [int]$Samples = 0,
  [int]$Resolution = 0,
  [ValidateSet('GPU', 'CPU')][string]$Device = 'GPU',
  [switch]$ValidateOnly,
  [switch]$SkipPanoramas,
  [switch]$SkipModel,
  [switch]$ThumbnailsOnly,
  [string]$Blender = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $ExportRoot) { $ExportRoot = Join-Path (Split-Path -Parent $repo) 'infiniviz-exports' }
$config = Join-Path $PSScriptRoot "blender\projects\$Project.json"
$script = Join-Path $PSScriptRoot 'blender\export_project.py'

if (-not (Test-Path -LiteralPath $config)) { Write-Host "No project config: $config" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath $Blend)) { Write-Host "Blend file not found: $Blend" -ForegroundColor Red; exit 1 }
if (-not $Blender) {
  $Blender = Get-ChildItem 'C:\Program Files\Blender Foundation' -Recurse -Filter blender.exe -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.VersionInfo.ProductVersion -replace '[^\d\.].*$', '') } -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Blender -or -not (Test-Path -LiteralPath $Blender)) { Write-Host 'Blender not found. Pass -Blender "C:\path\to\blender.exe"' -ForegroundColor Red; exit 1 }

$out = Join-Path $ExportRoot $Project
$full = [IO.Path]::GetFullPath($out)
if ($full.StartsWith([IO.Path]::GetFullPath($repo), [StringComparison]::OrdinalIgnoreCase)) {
  Write-Host 'Export folder must be outside the website repository.' -ForegroundColor Red; exit 1
}
if ((Test-Path $out) -and -not $ValidateOnly -and -not $ThumbnailsOnly) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $bak = Join-Path $ExportRoot "_previous\$Project-$stamp"
  New-Item -ItemType Directory -Force (Split-Path $bak) | Out-Null
  Move-Item -LiteralPath $out -Destination $bak
  Write-Host "Previous export kept at $bak"
}
New-Item -ItemType Directory -Force $out | Out-Null

$pyArgs = @('--config', $config, '--out', $out, '--device', $Device)
if ($Samples -gt 0) { $pyArgs += @('--samples', $Samples) }
if ($Resolution -gt 0) { $pyArgs += @('--resolution', $Resolution) }
if ($ValidateOnly) { $pyArgs += '--validate-only' }
if ($SkipPanoramas) { $pyArgs += '--skip-panoramas' }
if ($SkipModel) { $pyArgs += '--skip-model' }
if ($ThumbnailsOnly) { $pyArgs += '--thumbnails-only' }

Write-Host "Blender : $Blender"
Write-Host "Project : $Project"
Write-Host "Source  : $Blend"
Write-Host "Export  : $out"
& $Blender -b $Blend --python-exit-code 1 --python $script -- @pyArgs
$code = $LASTEXITCODE
$report = Join-Path $out 'export-report.json'
if (Test-Path $report) {
  $r = Get-Content $report -Raw | ConvertFrom-Json
  if ($r.errors.Count) { Write-Host "`nErrors:" -ForegroundColor Red; $r.errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red } }
  if ($r.warnings.Count) { Write-Host "`nWarnings:" -ForegroundColor Yellow; $r.warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow } }
}
if ($code -ne 0) { Write-Host "`nEXPORT FAILED (exit $code). Nothing was copied to the website." -ForegroundColor Red; exit 1 }
Write-Host "`nEXPORT OK -> $out" -ForegroundColor Green
if (-not $ValidateOnly) { Write-Host "Next: .\tools\sync-assets.ps1 -Project $Project" }
exit 0
