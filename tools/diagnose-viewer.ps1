<#
INFINIVIZ - reproduce Section 04 viewer failures in headless Microsoft Edge.

  .\tools\diagnose-viewer.ps1 [-Url https://hasoriya45-bot.github.io/infiniviz-website/]

Loads the page's self-test (?selftest=1) under three conditions and reports what Section 04 did:
  normal        - GPU WebGL available, network normal
  cdn-blocked   - cdn.jsdelivr.net and cdnjs.cloudflare.com unreachable (as when an ISP blocks a CDN)
  no-webgl      - WebGL unavailable (GPU disabled, no software fallback; like "hardware acceleration" off)
#>
param([string]$Url = 'https://hasoriya45-bot.github.io/infiniviz-website/')
$edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host 'Microsoft Edge not found' -ForegroundColor Red; exit 1 }
$tmp = Join-Path $env:TEMP ("ivz-diag-" + (Get-Date -Format 'HHmmss'))
New-Item -ItemType Directory -Force $tmp | Out-Null
$cases = [ordered]@{
  'normal'      = @('--use-angle=swiftshader', '--enable-unsafe-swiftshader')
  'cdn-blocked' = @('--use-angle=swiftshader', '--enable-unsafe-swiftshader', '"--host-resolver-rules=MAP cdn.jsdelivr.net 0.0.0.0, MAP cdnjs.cloudflare.com 0.0.0.0"')
  'no-webgl'    = @('--disable-gpu', '--disable-software-rasterizer', '--disable-3d-apis')
  'webgl1-only' = @('--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-webgl2')
}
foreach ($name in $cases.Keys) {
  $out = Join-Path $tmp "$name.html"
  $args2 = @('--headless=new', '--hide-scrollbars', "`"--user-data-dir=$tmp\p-$name`"", '--window-size=1440,900', '--virtual-time-budget=60000') + $cases[$name] + @('--dump-dom', "${Url}?selftest=1")
  $null = Start-Process -FilePath $edge -ArgumentList $args2 -RedirectStandardOutput $out -RedirectStandardError "$out.log" -Wait -PassThru -WindowStyle Hidden
  $dom = [IO.File]::ReadAllText($out)
  $m = [regex]::Match($dom, '<pre id="ivz-selftest"[^>]*>([\s\S]*?)</pre>')
  $fb = [regex]::Match($dom, 'data-fallback-msg[^>]*>([^<]*)<').Groups[1].Value
  $cls = [regex]::Match($dom, 'class="(viewer[^"]*)"').Groups[1].Value
  if ($m.Success) {
    $r = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value) | ConvertFrom-Json
    Write-Host ("{0,-12} viewer: {1,-12} class: {2}  render: {3}" -f $name, $r.viewer.status, $cls, $r.viewer.renderPath)
    if ($cls -match 'is-fallback') { Write-Host "             fallback text: $fb" -ForegroundColor Yellow }
    if ($r.viewer.reason) { Write-Host "             reason: $($r.viewer.reason)" -ForegroundColor Yellow }
    @($r.errors) | Select-Object -First 3 | ForEach-Object { Write-Host "             js: $_" -ForegroundColor DarkYellow }
  } else {
    Write-Host ("{0,-12} page did not finish its self-test (scripts probably failed to load). class: {1}" -f $name, $cls) -ForegroundColor Red
  }
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
