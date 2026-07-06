param(
  [string[]]$Versions = @(),
  [string]$SentryDsnFile = '',
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\out-fast-builds')
)

$ErrorActionPreference = 'Stop'

function Find-SentryDsnFile {
  if ($SentryDsnFile) {
    if (-not (Test-Path -LiteralPath $SentryDsnFile)) {
      throw "SENTRY_DSN file not found: $SentryDsnFile"
    }
    return (Resolve-Path -LiteralPath $SentryDsnFile).Path
  }

  $candidates = @(
    (Join-Path $PSScriptRoot '..\SENTRY_DSN'),
    (Join-Path $PSScriptRoot '..\..\SENTRY_DSN')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw 'SENTRY_DSN file not found. Pass -SentryDsnFile or place SENTRY_DSN at repo root/parent.'
}

function Get-PackageVersion([string]$RepoRoot) {
  $packageJsonPath = Join-Path $RepoRoot 'package.json'
  $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
  if (-not $packageJson.version) {
    throw "package.json is missing version: $packageJsonPath"
  }
  return [string]$packageJson.version
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dsnPath = Find-SentryDsnFile
$env:SENTRY_DSN = (Get-Content -LiteralPath $dsnPath -Raw).Trim()
$env:ELECTRON_BUILDER_COMPRESSION_LEVEL = '1'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$buildVersions = @($Versions | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($buildVersions.Count -eq 0) {
  $buildVersions = @(Get-PackageVersion $repoRoot)
}

foreach ($version in $buildVersions) {
  Write-Host "=== build $version start: $(Get-Date -Format o) ==="
  $env:AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION = $version

  Push-Location $repoRoot
  try {
    bun run build-win:x64:fast
    if ($LASTEXITCODE -ne 0) {
      throw "build $version failed with exit code $LASTEXITCODE"
    }

    $source = Join-Path $repoRoot "out\AionUi-$version-win-x64.exe"
    $target = Join-Path $OutputDir "AionUi-$version-win-x64.exe"
    if (-not (Test-Path -LiteralPath $source)) {
      throw "Expected artifact was not produced: $source"
    }

    Copy-Item -LiteralPath $source -Destination $target -Force
    $item = Get-Item -LiteralPath $target
    $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA512).Hash
    Write-Host "=== build $version done: $(Get-Date -Format o) size=$($item.Length) sha512=$hash ==="
  } finally {
    Pop-Location
  }
}
