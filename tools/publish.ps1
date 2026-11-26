<#
INFINIVIZ - step 3 of 3: test, then publish to GitHub Pages.

  .\tools\publish.ps1                       # run every test and show what WOULD be published (no changes)
  .\tools\publish.ps1 -Publish -Message "Add Nimesh Bedroom 3D experience"

With -Publish: runs all tests; if anything fails it STOPS before committing. Otherwise it commits,
pushes to the existing remote/branch, waits for the GitHub Pages deployment and checks the live files.
Credentials are handled by Git Credential Manager; no tokens are stored or printed.
#>
param([switch]$Publish, [string]$Message = '', [switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\checks.ps1')
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) { $git = 'C:\Program Files\Git\cmd\git.exe' }
Push-Location $repo
try {
  if (-not $SkipTests) {
    & (Join-Path $PSScriptRoot 'test-site.ps1')
    if ($LASTEXITCODE -ne 0) { Write-Host "`nNOT PUBLISHED: tests failed. Fix the problems above and run again." -ForegroundColor Red; exit 1 }
  }
  $branch = (& $git rev-parse --abbrev-ref HEAD).Trim()
  $remote = (& $git remote get-url origin).Trim()
  $changes = & $git status --porcelain
  Write-Host "`nRepository: $remote  (branch $branch)"
  if (-not $changes) { Write-Host 'Nothing to publish - the working tree matches the last commit.' -ForegroundColor Yellow; exit 0 }
  Write-Host "Changes to publish:"; $changes | ForEach-Object { Write-Host "  $_" }
  & $git diff --stat | Select-Object -Last 1
  if (-not $Publish) { Write-Host "`nDRY RUN - nothing committed. Re-run with -Publish to commit and push." -ForegroundColor Yellow; exit 0 }

  if (-not $Message) { $Message = "Update website ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))" }
  & $git add -A
  $msgFile = Join-Path $env:TEMP "infiniviz-commit-$PID.txt"
  [IO.File]::WriteAllText($msgFile, ($Message -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
  & $git commit -q -F $msgFile
  $commitCode = $LASTEXITCODE
  Remove-Item $msgFile -ErrorAction SilentlyContinue
  if ($commitCode -ne 0) { throw 'git commit failed' }
  $sha = (& $git rev-parse HEAD).Trim()
  Write-Host "Committed $($sha.Substring(0,7)): $Message"
  & $git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push failed (check the sign-in window / network)' }

  # Wait for GitHub Pages to deploy this commit.
  $slug = ($remote -replace '\.git$', '') -replace '^https://github.com/', ''
  $h = @{ 'User-Agent' = 'infiniviz-publish'; 'Accept' = 'application/vnd.github+json' }
  Write-Host 'Waiting for GitHub Pages deployment ...'
  $deadline = (Get-Date).AddMinutes(10); $run = $null
  do {
    Start-Sleep -Seconds 15
    try { $run = (Invoke-RestMethod "https://api.github.com/repos/$slug/actions/runs?head_sha=$sha&per_page=5" -Headers $h).workflow_runs | Where-Object { $_.name -match 'pages' } | Select-Object -First 1 } catch { }
  } while ((-not $run -or $run.status -ne 'completed') -and (Get-Date) -lt $deadline)
  if (-not $run -or $run.conclusion -ne 'success') { Write-Host "Pages deployment did not succeed: $($run.status)/$($run.conclusion)" -ForegroundColor Red; exit 1 }
  Write-Host 'Pages deployment: success' -ForegroundColor Green

  # Verify the live files.
  $owner, $name = $slug.Split('/')
  $live = "https://$($owner.ToLower()).github.io/$name/"
  $urls = @($live, "${live}js/main.js", "${live}css/styles.css")
  $regPath = Join-Path $repo 'experiences\registry.json'
  if (Test-Path $regPath) {
    $reg = Read-JsonFile $regPath
    if ($reg.featured) {
      $m = Read-JsonFile (Join-Path $repo "experiences\$($reg.featured)\manifest.json")
      $urls += "${live}experiences/registry.json", "${live}experiences/$($reg.featured)/manifest.json", "${live}experiences/$($reg.featured)/$($m.model.file)"
      $urls += @($m.views | ForEach-Object { "${live}experiences/$($reg.featured)/$($_.panorama)" })
    }
  }
  $bad = foreach ($u in $urls) { try { $null = Invoke-WebRequest "${u}?v=$($sha.Substring(0,7))" -UseBasicParsing -Method Head -TimeoutSec 30 } catch { $u } }
  if ($bad) { Write-Host 'Live check failed for:' -ForegroundColor Red; $bad | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }; exit 1 }
  Write-Host "LIVE: $live  ($($urls.Count) files verified)" -ForegroundColor Green
} finally { Pop-Location }
