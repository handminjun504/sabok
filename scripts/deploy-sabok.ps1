# 사복(sabok) 전용 배포 — GL/gl-server 폴더에서 실행하지 마세요.
# 사용: 저장소 루트에서  .\scripts\deploy-sabok.ps1
#       또는: powershell -ExecutionPolicy Bypass -File .\scripts\deploy-sabok.ps1

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$origin = git config --get remote.origin.url
if (-not $origin) { $origin = "" } else { $origin = $origin.Trim() }
if ([string]::IsNullOrWhiteSpace($origin) -or ($origin -notmatch "handminjun504/sabok")) {
  Write-Error "origin 이 handminjun504/sabok 가 아닙니다: '$origin' — 이 스크립트는 사복 전용 클론에서만 실행하세요."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") {
  Write-Warning "현재 브랜치가 main 이 아닙니다: $branch"
}

Write-Host "[sabok] git pull (ff-only) …" -ForegroundColor Cyan
git pull --ff-only origin main

Write-Host "[sabok] npm install …" -ForegroundColor Cyan
npm install --include=dev

Write-Host "[sabok] npm run build …" -ForegroundColor Cyan
npm run build

Write-Host "[sabok] 빌드 완료. 이 폴더를 가리키는 PM2 앱만 재시작하세요 (예: pm2 restart sabok)." -ForegroundColor Green
