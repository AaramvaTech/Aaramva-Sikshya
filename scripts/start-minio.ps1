$ErrorActionPreference = 'Stop'

$minioExe = Join-Path $PSScriptRoot '..\tools\minio\minio.exe'
if (-not (Test-Path $minioExe)) {
    Write-Error "MinIO binary not found at tools/minio/minio.exe. See docs/ops/RUNBOOK.md 'Local dev setup - MinIO' for the download commands."
    exit 1
}

$dataDir = 'D:/aaramva/minio-data'
if (-not (Test-Path $dataDir)) {
    Write-Error "MinIO data dir not found at $dataDir. If it moved, update scripts/start-minio.ps1 and docs/ops/RUNBOOK.md together."
    exit 1
}

$env:MINIO_ROOT_USER = 'minioadmin'
$env:MINIO_ROOT_PASSWORD = 'minioadmin'

Write-Host "Starting MinIO - API http://127.0.0.1:9000, console http://127.0.0.1:9001"
& $minioExe server $dataDir --console-address ":9001"
