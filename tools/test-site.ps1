<#
INFINIVIZ - automated website tests (run by publish.ps1, or on their own).

  .\tools\test-site.ps1 [-AllowFixture] [-KeepServer]

1. Static checks: every local link/image/script in the HTML exists, JSON files parse,
   every registered 3D project passes asset validation (GLB, 9 panoramas, thumbnails).
2. Browser checks in headless Microsoft Edge at desktop (1440x900) and phone (390x844) size,
   using the site's built-in self-test (?selftest=1): no JS errors, all sections present,
   12 projects, no horizontal overflow, the 3D viewer loads, every viewpoint panorama loads,
   walkthrough collision keeps the camera inside the room, mode switching works.
3. Screenshots are saved to ..\infiniviz-test-results\<timestamp>\ for a visual check.
Exit 0 = all passed, 1 = something failed (details printed).
#>
param([switch]$AllowFixture, [int]$Port = 8099)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\checks.ps1')
$repo = Split-Path -Parent $PSScriptRoot
$fail = New-Object System.Collections.Generic.List[string]
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$results = Join-Path (Split-Path -Parent $repo) "infiniviz-test-results\$stamp"
New-Item -ItemType Directory -Force $results | Out-Null

# ---------------------------------------------------------------- 1. static checks
Write-Host '== Static checks ==' -ForegroundColor Cyan
foreach ($page in 'index.html', 'project.html', '404.html') {
  $p = Join-Path $repo $page
  if (-not (Test-Path $p)) { $fail.Add("missing page $page"); continue }
  $html = [IO.File]::ReadAllText($p)
  foreach ($m in [regex]::Matches($html, '(?:src|href)="([^"]*)"')) {
    $ref = ($m.Groups[1].Value -split '[?#]')[0]
    if ($ref -eq '' -or $ref -match '^[a-zA-Z][a-zA-Z0-9+.-]*:' -or $ref.StartsWith('/infiniviz-website/') -or $ref.StartsWith('//')) { continue }
    if (-not (Test-Path (Join-Path $repo $ref))) { $fail.Add("$page links to missing file: $ref") }
  }
}
foreach ($page in 'index.html', 'project.html') {
  $html = [IO.File]::ReadAllText((Join-Path $repo $page))
  foreach ($m in [regex]::Matches($html, '(?:<script[^>]+src|"(?:three[^"]*|three-mesh-bvh)")\s*[=:]\s*"(https?://[^"]+)"')) {
    $fail.Add("$page loads a script from a third-party CDN ($($m.Groups[1].Value)); use vendor/ so blocked CDNs cannot break the site")
  }
}
Get-ChildItem $repo -Recurse -Filter *.json -File | Where-Object { $_.FullName -notmatch '\\(\.git|tools\\node_modules)\\' } | ForEach-Object {
  try { $null = Read-JsonFile $_.FullName } catch { $fail.Add("invalid JSON: $($_.FullName.Substring($repo.Length + 1))") }
}
$regPath = Join-Path $repo 'experiences\registry.json'
$featured = $null
if (Test-Path $regPath) {
  $reg = Read-JsonFile $regPath
  $featured = $reg.featured
  foreach ($proj in @($reg.projects)) {
    $v = Test-ProjectAssets -Dir (Join-Path $repo "experiences\$($proj.id)") -AllowFixture:$AllowFixture
    if ($v.ok) { Write-Host "  project $($proj.id): assets OK" -ForegroundColor Green }
    else { $v.problems | ForEach-Object { $fail.Add("project $($proj.id): $_") } }
  }
} else { Write-Host '  no experiences/registry.json - Section 04 shows the built-in concept villa' }
Get-ChildItem $repo -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.Length -gt 95MB } | ForEach-Object { $fail.Add("$($_.Name) is over 95 MB (GitHub limit is 100 MB)") }
if ($fail.Count) { Write-Host "  static checks found $($fail.Count) problem(s)" -ForegroundColor Red } else { Write-Host '  all static checks passed' -ForegroundColor Green }

# ---------------------------------------------------------------- 2. browser checks
Write-Host '== Browser checks (headless Edge) ==' -ForegroundColor Cyan
$edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { $fail.Add('Microsoft Edge not found - cannot run browser tests') }
else {
  $server = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repo 'serve.ps1'), '-Port', $Port) -WindowStyle Hidden -PassThru
  try {
    $base = "http://localhost:$Port/infiniviz-website/"
    $ready = $false
    for ($i = 0; $i -lt 30 -and -not $ready; $i++) { try { $null = Invoke-WebRequest $base -UseBasicParsing -TimeoutSec 2; $ready = $true } catch { Start-Sleep -Milliseconds 300 } }
    if (-not $ready) { throw 'local test server did not start' }
    $profileDir = Join-Path $env:TEMP "ivz-edge-$stamp"
    $common = @('--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio', "`"--user-data-dir=$profileDir`"")
    # Phone size runs inside an exact 390 px frame (tools/test-frame.html): headless windows can't go below ~480 px.
    foreach ($size in @(@{ n = 'desktop'; w = 1440; h = 900; url = "${base}?selftest=1"; shot = { param($hash) "${base}?shot=1$(if ($hash) { "#$hash" })" } },
                        @{ n = 'mobile'; w = 520; h = 900; url = "${base}tools/test-frame.html?w=390&h=844"; shot = { param($hash) "${base}tools/test-frame.html?w=390&h=844&mode=shot$(if ($hash) { "&hash=$hash" })" } })) {
      $out = Join-Path $results "$($size.n)-selftest.html"
      $edgeArgs = $common + @("--window-size=$($size.w),$($size.h)", '--virtual-time-budget=300000', '--dump-dom', $size.url)
      $null = Start-Process -FilePath $edge -ArgumentList $edgeArgs -RedirectStandardOutput $out -RedirectStandardError "$out.log" -Wait -PassThru -WindowStyle Hidden
      $dom = [IO.File]::ReadAllText($out)
      $mm = [regex]::Match($dom, '<pre id="ivz-selftest"[^>]*>([\s\S]*?)</pre>')
      if (-not $mm.Success) { $fail.Add("$($size.n): self-test did not finish (no result in page)"); continue }
      $r = [Net.WebUtility]::HtmlDecode($mm.Groups[1].Value) | ConvertFrom-Json
      [IO.File]::WriteAllText((Join-Path $results "$($size.n)-selftest.json"), ($r | ConvertTo-Json -Depth 6))
      foreach ($f in @($r.failures)) { $fail.Add("$($size.n): $f") }
      $status = if (@($r.failures).Count) { 'FAIL' } else { 'PASS' }
      Write-Host ("  {0,-7} {1}  viewer={2} ({3})  viewpoints={4}  panoramas loaded={5}  collision={6}  js errors={7}" -f $size.n, $status, $r.viewer.status, $r.viewer.kind, $r.viewer.views, $r.viewer.panoramasLoaded, $(if ($r.viewer.collision) { if ($r.viewer.collision.ok) { 'ok' } else { 'FAIL' } } else { 'n/a' }), @($r.errors).Count) -ForegroundColor $(if ($status -eq 'PASS') { 'Green' } else { 'Red' })
      foreach ($shot in @(@{ suffix = 'top'; url = (& $size.shot '') }, @{ suffix = 'experience'; url = (& $size.shot 'experience') })) {
        $png = Join-Path $results "$($size.n)-$($shot.suffix).png"
        $null = Start-Process -FilePath $edge -ArgumentList ($common + @("--window-size=$($size.w),$($size.h)", '--virtual-time-budget=20000', "`"--screenshot=$png`"", $shot.url)) -Wait -PassThru -WindowStyle Hidden -RedirectStandardError "$png.log"
      }
    }
    Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
  } catch { $fail.Add("browser test error: $($_.Exception.Message)") }
  finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}

Write-Host "Results and screenshots: $results"
if ($fail.Count) {
  Write-Host "`nTESTS FAILED ($($fail.Count)):" -ForegroundColor Red
  $fail | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
Write-Host "`nALL TESTS PASSED" -ForegroundColor Green
exit 0
