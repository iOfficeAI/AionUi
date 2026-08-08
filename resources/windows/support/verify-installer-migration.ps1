param(
  [Parameter(Mandatory = $true)]
  [string]$CurrentInstaller,

  [string]$LegacyInstaller,

  [Parameter(Mandatory = $true)]
  [ValidateSet('x64', 'arm64')]
  [string]$Arch,

  [Parameter(Mandatory = $true)]
  [string]$DiagnosticsDirectory,

  [Parameter(Mandatory = $true)]
  [ValidateSet('fresh', 'migration-prepare', 'migration-upgrade')]
  [string]$Mode,

  [string]$TemporaryDirectory = $env:RUNNER_TEMP
)

$ErrorActionPreference = 'Stop'
$freshInstallDirectory = Join-Path $TemporaryDirectory "csbu-workmate-fresh-smoke-$Arch"
$migrationInstallDirectory = Join-Path $env:LOCALAPPDATA "Programs\csbu-workmate-migration-smoke-$Arch"
$installStatePath = Join-Path $env:LOCALAPPDATA 'CSBU WorkMate\installer-state.ini'
$installRegistryPath = 'HKCU:\Software\d1c5b48c-1cbe-5096-9ab3-71e40b612193'
$uninstallRegistryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\d1c5b48c-1cbe-5096-9ab3-71e40b612193'
$registryPaths = @($installRegistryPath, $uninstallRegistryPath)

New-Item -ItemType Directory -Path $DiagnosticsDirectory -Force | Out-Null
Set-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'smoke-status.txt') -Value "Started at $(Get-Date -Format o)"
Add-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'smoke-status.txt') -Value "Mode: $Mode"

function Invoke-BoundedProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Phase,
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [string]$ProgressLogPath = '',
    [int]$TimeoutSeconds = 600
  )

  Write-Host "::group::Installer smoke phase: $Phase"
  $startedAt = Get-Date
  $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -PassThru -NoNewWindow
  $deadline = $startedAt.AddSeconds($TimeoutSeconds)
  $reportedLogLineCount = 0
  while (-not $process.WaitForExit(5000)) {
    $elapsedSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
    $installDirectoryExists = Test-Path -LiteralPath $migrationInstallDirectory
    $stagingDirectoryExists = Test-Path -LiteralPath "$migrationInstallDirectory.__csbu-migration"
    Write-Host "$Phase heartbeat: pid=$($process.Id) elapsed=${elapsedSeconds}s installDirectoryExists=$installDirectoryExists stagingDirectoryExists=$stagingDirectoryExists"
    if ($ProgressLogPath -and (Test-Path -LiteralPath $ProgressLogPath -PathType Leaf)) {
      $logLines = @(Get-Content -LiteralPath $ProgressLogPath -ErrorAction SilentlyContinue)
      if ($logLines.Count -gt $reportedLogLineCount) {
        $logLines | Select-Object -Skip $reportedLogLineCount | ForEach-Object { Write-Host "[$Phase] $_" }
        $reportedLogLineCount = $logLines.Count
      }
    }
    if ((Get-Date) -ge $deadline) {
      & taskkill.exe /PID $process.Id /T /F 2>&1 |
        Out-File -LiteralPath (Join-Path $DiagnosticsDirectory "$Phase-taskkill.txt")
      Write-Host '::endgroup::'
      throw "$Phase timed out after ${TimeoutSeconds}s"
    }
  }
  if ($ProgressLogPath -and (Test-Path -LiteralPath $ProgressLogPath -PathType Leaf)) {
    $logLines = @(Get-Content -LiteralPath $ProgressLogPath -ErrorAction SilentlyContinue)
    $logLines | Select-Object -Skip $reportedLogLineCount | ForEach-Object { Write-Host "[$Phase] $_" }
  }
  $duration = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
  Write-Host "$Phase finished with exit code $($process.ExitCode) after ${duration}s"
  Write-Host '::endgroup::'
  if ($process.ExitCode -ne 0) {
    throw "$Phase failed with exit code $($process.ExitCode)"
  }
}

function Wait-ForUninstallCompletion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Phase,
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory,
    [int]$TimeoutSeconds = 600
  )

  Write-Host "Waiting for the detached NSIS uninstaller during $Phase"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastProgressAt = Get-Date
  while ((Get-Date) -lt $deadline) {
    $directoryExists = Test-Path -LiteralPath $InstallDirectory
    $registrationExists = $registryPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $directoryExists -and -not $registrationExists) {
      Write-Host "$Phase completed and removed its directory and registration"
      return
    }
    if (((Get-Date) - $lastProgressAt).TotalSeconds -ge 15) {
      Write-Host "$Phase still running: directoryExists=$directoryExists registrationExists=$([bool]$registrationExists)"
      $lastProgressAt = Get-Date
    }
    Start-Sleep -Seconds 1
  }

  $stuckProcesses = @(Get-CimInstance Win32_Process | Where-Object {
      $_.Name -match '^Un_' -or
      ([string]$_.CommandLine).Contains($InstallDirectory, [StringComparison]::OrdinalIgnoreCase)
    })
  ConvertTo-Json -InputObject $stuckProcesses -Depth 4 -AsArray |
    Set-Content -LiteralPath (Join-Path $DiagnosticsDirectory "$Phase-stuck-processes.json")
  foreach ($stuckProcess in $stuckProcesses) {
    & taskkill.exe /PID $stuckProcess.ProcessId /T /F 2>&1 |
      Out-File -LiteralPath (Join-Path $DiagnosticsDirectory "$Phase-taskkill.txt") -Append
  }
  throw "$Phase did not finish cleanup within ${TimeoutSeconds}s"
}

function Assert-Registration {
  param([Parameter(Mandatory = $true)][string]$ExpectedInstallDirectory)

  foreach ($registryPath in $registryPaths) {
    if (-not (Test-Path -LiteralPath $registryPath)) {
      throw "Standard Windows installation registration is missing: $registryPath"
    }
  }
  $actualInstallLocation = (Get-ItemProperty -LiteralPath $installRegistryPath).InstallLocation
  if ([IO.Path]::GetFullPath($actualInstallLocation) -ne [IO.Path]::GetFullPath($ExpectedInstallDirectory)) {
    throw "Installation directory registration mismatch: $actualInstallLocation"
  }
}

function Get-InstalledTargets {
  param([Parameter(Mandatory = $true)][string]$InstallDirectory)

  $application = Get-Item -LiteralPath (Join-Path $InstallDirectory 'CSBU WorkMate.exe')
  $uninstaller = Get-ChildItem -LiteralPath $InstallDirectory -Recurse -File -Filter 'Uninstall*.exe' |
    Select-Object -First 1
  if (-not $uninstaller) {
    throw "Installed uninstaller was not found under $InstallDirectory"
  }
  return @($application, $uninstaller)
}

function Assert-Metadata {
  param([Parameter(Mandatory = $true)][object[]]$Targets)

  foreach ($target in $Targets) {
    $info = $target.VersionInfo
    foreach ($propertyName in @('CompanyName', 'FileVersion', 'LegalCopyright', 'ProductName', 'ProductVersion')) {
      if ([string]::IsNullOrWhiteSpace([string]$info.$propertyName)) {
        throw "Required installed VERSIONINFO is missing from $($target.FullName): $propertyName"
      }
    }
    if ($info.CompanyName -ne 'CSBU' -or $info.ProductName -ne 'CSBU WorkMate') {
      throw "Unexpected installed product metadata in $($target.FullName)"
    }
    if ($info.LegalCopyright -ne 'Copyright © 2026 CSBU') {
      throw "Unexpected installed LegalCopyright in $($target.FullName): $($info.LegalCopyright)"
    }
  }
}

function Get-InstallState {
  if (-not (Test-Path -LiteralPath $installStatePath -PathType Leaf)) {
    throw "Legacy registry-free installer did not create migration state: $installStatePath"
  }

  $state = @{}
  $inInstallSection = $false
  foreach ($line in Get-Content -LiteralPath $installStatePath -Encoding UTF8) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^\[(.+)\]$') {
      $inInstallSection = $Matches[1] -eq 'Install'
      continue
    }
    if ($inInstallSection -and $trimmed -match '^([^=]+)=(.*)$') {
      $state[$Matches[1].Trim()] = $Matches[2].Trim()
    }
  }
  return $state
}

function Assert-LegacyMigrationState {
  $state = Get-InstallState
  foreach ($requiredKey in @('InstallLocation', 'UninstallerPath', 'Arch')) {
    if ([string]::IsNullOrWhiteSpace([string]$state[$requiredKey])) {
      throw "Legacy migration state is missing required value: $requiredKey"
    }
  }
  $expectedInstallDirectory = [IO.Path]::GetFullPath($migrationInstallDirectory)
  $actualInstallDirectory = [IO.Path]::GetFullPath([string]$state.InstallLocation)
  if ($actualInstallDirectory -ine $expectedInstallDirectory) {
    throw "Legacy migration state install directory mismatch: $actualInstallDirectory"
  }
  if ([string]$state.Arch -ne $Arch) {
    throw "Legacy migration state architecture mismatch: $($state.Arch)"
  }
  $expectedUninstaller = Join-Path $expectedInstallDirectory 'Uninstall CSBU WorkMate.exe'
  $actualUninstaller = [IO.Path]::GetFullPath([string]$state.UninstallerPath)
  if ($actualUninstaller -ine $expectedUninstaller) {
    throw "Legacy migration state uninstaller mismatch: $actualUninstaller"
  }
}

function Save-DiagnosticsSnapshot {
  param([Parameter(Mandatory = $true)][string]$Phase)

  $snapshotDirectory = Join-Path $DiagnosticsDirectory $Phase
  New-Item -ItemType Directory -Path $snapshotDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $installStatePath -PathType Leaf) {
    Copy-Item -LiteralPath $installStatePath -Destination (Join-Path $snapshotDirectory 'installer-state.ini') -Force
  }
  try {
    Get-Volume | Select-Object DriveLetter, FileSystemLabel, Size, SizeRemaining |
      ConvertTo-Json -Depth 3 -AsArray |
      Set-Content -LiteralPath (Join-Path $snapshotDirectory 'volumes.json')
    if (Test-Path -LiteralPath $migrationInstallDirectory) {
      Get-ChildItem -LiteralPath $migrationInstallDirectory -Force -Recurse |
        Select-Object FullName, Length, LastWriteTimeUtc |
        ConvertTo-Json -Depth 3 -AsArray |
        Set-Content -LiteralPath (Join-Path $snapshotDirectory 'install-directory.json')
    }
  } catch {
    Set-Content -LiteralPath (Join-Path $snapshotDirectory 'filesystem-error.txt') -Value $_.Exception.Message
  }
  try {
    $processSnapshot = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -match 'CSBU|Uninstall|nsis|^Un_' -or
        ([string]$_.CommandLine).Contains($migrationInstallDirectory, [StringComparison]::OrdinalIgnoreCase)
      } | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine)
    ConvertTo-Json -InputObject $processSnapshot -Depth 4 -AsArray |
      Set-Content -LiteralPath (Join-Path $snapshotDirectory 'processes.json')
  } catch {
    Set-Content -LiteralPath (Join-Path $snapshotDirectory 'process-error.txt') -Value $_.Exception.Message
  }
  Add-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'smoke-status.txt') -Value "$Phase snapshot saved at $(Get-Date -Format o)"
}

function Clear-SmokeState {
  foreach ($directory in @($freshInstallDirectory, $migrationInstallDirectory)) {
    if (Test-Path -LiteralPath $directory) {
      Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction Continue
    }
  }
  if (Test-Path -LiteralPath $installStatePath) {
    Remove-Item -LiteralPath $installStatePath -Force -ErrorAction Continue
  }
  foreach ($registryPath in $registryPaths) {
    if (Test-Path -LiteralPath $registryPath) {
      Remove-Item -LiteralPath $registryPath -Recurse -Force -ErrorAction Continue
    }
  }
}

$shouldCleanBefore = $Mode -in @('fresh', 'migration-prepare')
$shouldCleanAfter = $Mode -in @('fresh', 'migration-upgrade')
if ($shouldCleanBefore) {
  Clear-SmokeState
}
try {
  if ($Mode -eq 'fresh') {
    $freshLog = Join-Path $DiagnosticsDirectory 'fresh-install.jsonl'
    Invoke-BoundedProcess -Phase 'fresh-install' -FilePath $CurrentInstaller -ArgumentList @('/S', "--installer-log=$freshLog", "/D=$freshInstallDirectory") -ProgressLogPath $freshLog
    $freshTargets = Get-InstalledTargets -InstallDirectory $freshInstallDirectory
    Assert-Registration -ExpectedInstallDirectory $freshInstallDirectory
    Assert-Metadata -Targets $freshTargets
    Invoke-BoundedProcess -Phase 'fresh-uninstall' -FilePath $freshTargets[1].FullName -ArgumentList @('/S', "--installer-log=$freshLog") -ProgressLogPath $freshLog
    Wait-ForUninstallCompletion -Phase 'fresh-uninstall' -InstallDirectory $freshInstallDirectory
  } elseif ($Mode -eq 'migration-prepare') {
    if ([string]::IsNullOrWhiteSpace($LegacyInstaller) -or -not (Test-Path -LiteralPath $LegacyInstaller -PathType Leaf)) {
      throw 'Legacy installer is required for migration smoke tests'
    }

    $legacyLog = Join-Path $DiagnosticsDirectory 'legacy-install.jsonl'
    Invoke-BoundedProcess -Phase 'legacy-install' -FilePath $LegacyInstaller -ArgumentList @('/S', "--installer-log=$legacyLog", "/D=$migrationInstallDirectory") -ProgressLogPath $legacyLog
    $null = Get-InstalledTargets -InstallDirectory $migrationInstallDirectory
    Assert-LegacyMigrationState
    foreach ($registryPath in $registryPaths) {
      if (Test-Path -LiteralPath $registryPath) {
        throw "Legacy registry-free installer unexpectedly registered: $registryPath"
      }
    }
    Save-DiagnosticsSnapshot -Phase 'before-upgrade'
  } else {
    $null = Get-InstalledTargets -InstallDirectory $migrationInstallDirectory
    Assert-LegacyMigrationState
    Save-DiagnosticsSnapshot -Phase 'upgrade-start'
    $migrationLog = Join-Path $DiagnosticsDirectory 'migration-install.jsonl'
    Invoke-BoundedProcess -Phase 'registry-free-migration' -FilePath $CurrentInstaller -ArgumentList @('/S', "--installer-log=$migrationLog") -ProgressLogPath $migrationLog
    if (Test-Path -LiteralPath $installStatePath) {
      throw "Legacy registry-free installer state remains after installation: $installStatePath"
    }
    Assert-Registration -ExpectedInstallDirectory $migrationInstallDirectory
    $migratedTargets = Get-InstalledTargets -InstallDirectory $migrationInstallDirectory
    Assert-Metadata -Targets $migratedTargets
    Invoke-BoundedProcess -Phase 'migrated-uninstall' -FilePath $migratedTargets[1].FullName -ArgumentList @('/S', "--installer-log=$migrationLog") -ProgressLogPath $migrationLog
    Wait-ForUninstallCompletion -Phase 'migrated-uninstall' -InstallDirectory $migrationInstallDirectory
  }
} finally {
  Save-DiagnosticsSnapshot -Phase "after-$Mode"
  Add-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'smoke-status.txt') -Value "Finished at $(Get-Date -Format o)"
  if ($shouldCleanAfter) {
    Clear-SmokeState
  }
}
