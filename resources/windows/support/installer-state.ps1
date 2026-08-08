param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('read', 'write', 'delete', 'prepare-migration', 'commit-migration', 'rollback-migration')]
  [string]$Action,
  [string]$ExpectedArch = '',
  [string]$InstallDir = '',
  [string]$Version = '',
  [string]$UninstallerPath = '',
  [string]$StateRoot = ''
)

$ErrorActionPreference = 'Stop'
$LocalStateRoot = if ($StateRoot) { [IO.Path]::GetFullPath($StateRoot) } else { [Environment]::GetFolderPath('LocalApplicationData') }
$StateDirectory = Join-Path $LocalStateRoot 'CSBU WorkMate'
$StatePath = Join-Path $StateDirectory 'installer-state.ini'
$ExpectedAppId = 'com.csbu.workmate'
$ExpectedUninstallerName = 'Uninstall CSBU WorkMate.exe'
$ExpectedExecutableName = 'CSBU WorkMate.exe'
$MigrationStagingSuffix = '.__csbu-migration'

function Get-NormalizedInstallDirectory([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue) -or -not [IO.Path]::IsPathRooted($PathValue)) {
    throw 'install-location-not-absolute'
  }

  $fullPath = [IO.Path]::GetFullPath($PathValue).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $root = [IO.Path]::GetPathRoot($fullPath).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $profile = [Environment]::GetFolderPath('UserProfile').TrimEnd([IO.Path]::DirectorySeparatorChar)
  $localAppData = [Environment]::GetFolderPath('LocalApplicationData').TrimEnd([IO.Path]::DirectorySeparatorChar)
  if ($fullPath -ieq $root -or $fullPath -ieq $profile -or $fullPath -ieq $localAppData) {
    throw 'install-location-too-broad'
  }
  return $fullPath
}

function Read-IniSection([string]$PathValue) {
  $values = @{}
  $inInstallSection = $false
  foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^\[(.+)\]$') {
      $inInstallSection = $Matches[1] -eq 'Install'
      continue
    }
    if ($inInstallSection -and $trimmed -match '^([^=]+)=(.*)$') {
      $values[$Matches[1].Trim()] = $Matches[2].Trim()
    }
  }
  return $values
}

function Test-InstallPayload([string]$Directory) {
  return (Test-Path -LiteralPath (Join-Path $Directory $ExpectedExecutableName) -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Directory $ExpectedUninstallerName) -PathType Leaf)
}

function Remove-DirectoryIfExists([string]$Directory) {
  if (Test-Path -LiteralPath $Directory) {
    Remove-Item -LiteralPath $Directory -Recurse -Force -ErrorAction Stop
  }
  if (Test-Path -LiteralPath $Directory) {
    throw 'migration-directory-remove-failed'
  }
}

function Get-ValidatedState([string]$Architecture, [bool]$AllowMigrationStaging) {
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
    return $null
  }
  $state = Read-IniSection $StatePath
  if ($state.SchemaVersion -ne '1' -or $state.AppId -ne $ExpectedAppId) {
    throw 'identity-invalid'
  }
  if ($Architecture -and $state.Arch -ne $Architecture) {
    throw 'architecture-mismatch'
  }
  $normalizedInstallDir = Get-NormalizedInstallDirectory $state.InstallLocation
  $normalizedUninstaller = [IO.Path]::GetFullPath($state.UninstallerPath)
  $expectedUninstaller = Join-Path $normalizedInstallDir $ExpectedUninstallerName
  if ($normalizedUninstaller -ine $expectedUninstaller) {
    throw 'uninstaller-location-invalid'
  }
  $stagingDirectory = "$normalizedInstallDir$MigrationStagingSuffix"
  if (-not (Test-InstallPayload $normalizedInstallDir) -and
    (-not $AllowMigrationStaging -or -not (Test-InstallPayload $stagingDirectory))) {
    throw 'application-or-uninstaller-missing'
  }
  return [pscustomobject]@{
    InstallDirectory = $normalizedInstallDir
    StagingDirectory = $stagingDirectory
  }
}

function Remove-StateFiles {
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $StateDirectory) {
    Get-ChildItem -LiteralPath $StateDirectory -File -Filter 'installer-state.ini.tmp.*' -ErrorAction SilentlyContinue |
      Remove-Item -Force -ErrorAction SilentlyContinue
    if (@(Get-ChildItem -LiteralPath $StateDirectory -Force -ErrorAction SilentlyContinue).Count -eq 0) {
      Remove-Item -LiteralPath $StateDirectory -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  if ($Action -eq 'delete') {
    Remove-StateFiles
    exit 0
  }

  if ($Action -eq 'read') {
    $validatedState = Get-ValidatedState $ExpectedArch $true
    if (-not $validatedState) {
      exit 10
    }
    exit 0
  }

  if ($Action -eq 'prepare-migration') {
    $validatedState = Get-ValidatedState $ExpectedArch $true
    if (-not $validatedState) {
      throw 'migration-state-missing'
    }
    try {
      if (Test-InstallPayload $validatedState.StagingDirectory) {
        Remove-DirectoryIfExists $validatedState.InstallDirectory
      } else {
        Remove-DirectoryIfExists $validatedState.StagingDirectory
        Move-Item -LiteralPath $validatedState.InstallDirectory -Destination $validatedState.StagingDirectory
      }
      New-Item -ItemType Directory -Path $validatedState.InstallDirectory -Force | Out-Null
    } catch {
      if (Test-InstallPayload $validatedState.StagingDirectory) {
        Remove-DirectoryIfExists $validatedState.InstallDirectory
        Move-Item -LiteralPath $validatedState.StagingDirectory -Destination $validatedState.InstallDirectory
      }
      throw
    }
    exit 0
  }

  if ($Action -eq 'rollback-migration') {
    $validatedState = Get-ValidatedState $ExpectedArch $true
    if (-not $validatedState -or -not (Test-InstallPayload $validatedState.StagingDirectory)) {
      throw 'migration-staging-invalid'
    }
    Remove-DirectoryIfExists $validatedState.InstallDirectory
    Move-Item -LiteralPath $validatedState.StagingDirectory -Destination $validatedState.InstallDirectory
    exit 0
  }

  if ($Action -eq 'commit-migration') {
    $validatedState = Get-ValidatedState $ExpectedArch $true
    if (-not $validatedState) {
      throw 'migration-state-missing'
    }
    try {
      Remove-DirectoryIfExists $validatedState.StagingDirectory
    } finally {
      Remove-StateFiles
    }
    exit 0
  }

  if ($ExpectedArch -notin @('x64', 'arm64')) {
    throw 'architecture-invalid'
  }
  $normalizedInstallDir = Get-NormalizedInstallDirectory $InstallDir
  $normalizedUninstaller = [IO.Path]::GetFullPath($UninstallerPath)
  $expectedUninstaller = Join-Path $normalizedInstallDir $ExpectedUninstallerName
  if ($normalizedUninstaller -ine $expectedUninstaller) {
    throw 'uninstaller-location-invalid'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $normalizedInstallDir $ExpectedExecutableName) -PathType Leaf)) {
    throw 'application-missing'
  }
  if (-not (Test-Path -LiteralPath $normalizedUninstaller -PathType Leaf)) {
    throw 'uninstaller-missing'
  }

  New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
  $temporaryPath = "$StatePath.tmp.$PID.$([guid]::NewGuid().ToString('N'))"
  $lines = @(
    '[Install]',
    'SchemaVersion=1',
    "AppId=$ExpectedAppId",
    "Version=$Version",
    "Arch=$ExpectedArch",
    "InstallLocation=$normalizedInstallDir",
    "UninstallerPath=$normalizedUninstaller",
    ''
  )
  Set-Content -LiteralPath $temporaryPath -Value $lines -Encoding UTF8
  Move-Item -LiteralPath $temporaryPath -Destination $StatePath -Force
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 11
}
