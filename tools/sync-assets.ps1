<#
INFINIVIZ - step 2 of 3: copy a validated Blender export into the website.

  .\tools\sync-assets.ps1 -Project nimesh-bedroom [-Feature]

- Validates the export (GLB, every panorama 2:1 and >= 4096 px, 2K copies, thumbnails, manifest).
- Backs up the current website copy to ..\infiniviz-backups\ before replacing it.
- Copies only what the website needs: model, panoramas (+2K), thumbnails, manifest.
  Source textures stay in the export folder (they are already embedded in the GLB).
- -Feature makes this project the one shown in Section 04 ("Step inside. Look around.").
#>
param(
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$ExportRoot = '',
  [switch]$Feature,
  [switch]$AllowFixture
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\checks.ps1')
$repo = Split-Path -Parent $PSScriptRoot
if (-not $ExportRoot) { $ExportRoot = Join-Path (Split-Path -Parent $repo) 'infiniviz-exports' }
$src = Join-Path $ExportRoot $Project
$dst = Join-Path $repo "experiences\$Project"

Write-Host "Validating export $src ..."
$v = Test-ProjectAssets -Dir $src -AllowFixture:$AllowFixture
if (-not $v.ok) {
  Write-Host "VALIDATION FAILED - nothing was copied:" -ForegroundColor Red
  $v.problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
$m = $v.manifest
Write-Host ("OK: {0} views, model {1:N1} MB" -f @($m.views).Count, ((Get-Item (Join-Path $src $m.model.file)).Length / 1MB)) -ForegroundColor Green

if (Test-Path -LiteralPath $dst) {
  $bak = Join-Path (Split-Path -Parent $repo) ("infiniviz-backups\{0}-{1}" -f $Project, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force (Split-Path $bak) | Out-Null
  Copy-Item -LiteralPath $dst -Destination $bak -Recurse
  Write-Host "Backed up current website copy to $bak"
  Remove-Item -LiteralPath $dst -Recurse -Force
}
New-Item -ItemType Directory -Force $dst | Out-Null
foreach ($part in 'model', 'panoramas', 'thumbnails', 'environment') {
  $p = Join-Path $src $part
  if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination $dst -Recurse }
}
Copy-Item -LiteralPath (Join-Path $src 'manifest.json') -Destination $dst

# Re-validate the copy that the website will actually serve.
$v2 = Test-ProjectAssets -Dir $dst -AllowFixture:$AllowFixture
if (-not $v2.ok) { Write-Host 'Copied files failed validation:' -ForegroundColor Red; $v2.problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }; exit 1 }

# Registry of projects; 'featured' is what Section 04 shows.
$regPath = Join-Path $repo 'experiences\registry.json'
$reg = if (Test-Path $regPath) { Read-JsonFile $regPath } else { [pscustomobject]@{ featured = $null; projects = @() } }
$list = @($reg.projects | Where-Object { $_.id -ne $Project })
$list += [pscustomobject]@{ id = $Project; title = $m.title; manifest = "experiences/$Project/manifest.json"; test_fixture = [bool]$m.test_fixture; updated = (Get-Date -Format s) }
$reg.projects = $list
if ($Feature) { $reg.featured = $Project }
[IO.File]::WriteAllText($regPath, ($reg | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))

$size = (Get-ChildItem $dst -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Website copy ready: experiences\{0} ({1:N1} MB). Featured in Section 04: {2}" -f $Project, $size, $reg.featured) -ForegroundColor Green
Write-Host 'Next: .\tools\publish.ps1            (tests only, shows what would be published)'
Write-Host '      .\tools\publish.ps1 -Publish   (tests, then commit + push + verify live)'
exit 0
