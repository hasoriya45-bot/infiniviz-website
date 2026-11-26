# INFINIVIZ local preview server — no Node or Python needed.
# Serves this folder at http://localhost:<Port>/infiniviz-website/ (same path as GitHub Pages).
# Usage:  powershell -ExecutionPolicy Bypass -File .\serve.ps1 [-Port 8080] [-Open]
param([int]$Port = 8080, [switch]$Open)

$root = [IO.Path]::GetFullPath($PSScriptRoot)
$base = '/infiniviz-website'
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'; '.xml' = 'application/xml'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.avif' = 'image/avif'; '.ico' = 'image/x-icon'
  '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.bin' = 'application/octet-stream'; '.hdr' = 'application/octet-stream'
  '.mp4' = 'video/mp4'; '.webm' = 'video/webm'; '.woff2' = 'font/woff2'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "Could not start on port $Port. Try: .\serve.ps1 -Port 8090" -ForegroundColor Red; exit 1 }
$url = "http://localhost:$Port$base/"
Write-Host ""
Write-Host "  INFINIVIZ is running at $url" -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop."
Write-Host ""
if ($Open) { Start-Process $url }

function Send-File($req, $res, $path, $status) {
  $ext = [IO.Path]::GetExtension($path).ToLower()
  $type = $mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
  $res.StatusCode = $status
  $res.ContentType = $type
  $res.Headers.Add('Cache-Control', 'no-cache')
  if ($req.HttpMethod -eq 'HEAD') { $res.ContentLength64 = (Get-Item -LiteralPath $path).Length; return }
  $bytes = [IO.File]::ReadAllBytes($path)
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }   # keeps Ctrl+C responsive
    $ctx = $task.Result
    $req = $ctx.Request; $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path -eq '/' -or $path -eq $base) { $res.Redirect("$base/"); continue }
      if ($path.StartsWith("$base/")) { $path = $path.Substring($base.Length) }
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $res.StatusCode = 403 }
      elseif (Test-Path -LiteralPath $file -PathType Leaf) { Send-File $req $res $file 200 }
      else { Send-File $req $res (Join-Path $root '404.html') 404 }
      Write-Host ("{0} {1} {2}" -f $res.StatusCode, $req.HttpMethod, $req.Url.AbsolutePath) -ForegroundColor DarkGray
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
