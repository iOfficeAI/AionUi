param(
  [string]$LogPath,
  [string]$InstDir,
  [string]$TargetPath,
  [string]$LockerListPath,
  [string]$Session,
  [string]$Version,
  [string]$Arch,
  [string]$Updated,
  [string]$CurrentOutDir
)

$ErrorActionPreference = 'SilentlyContinue'

function Write-InstallerJson([string]$event, [hashtable]$fields) {
  $payload = [ordered]@{
    schemaVersion = 1
    ts = (Get-Date -Format o)
    session = $Session
    version = $Version
    arch = $Arch
    updated = ($Updated -eq '1' -or $Updated -eq 'true')
    instDir = $InstDir
    event = $event
  }
  foreach ($key in $fields.Keys) {
    $payload[$key] = $fields[$key]
  }
  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ($payload | ConvertTo-Json -Compress -Depth 10)
}

function Test-SamePath([string]$left, [string]$right) {
  if ([string]::IsNullOrWhiteSpace($left) -or [string]::IsNullOrWhiteSpace($right)) {
    return $false
  }
  try {
    $leftFull = [System.IO.Path]::GetFullPath($left).TrimEnd('\')
    $rightFull = [System.IO.Path]::GetFullPath($right).TrimEnd('\')
    return [string]::Equals($leftFull, $rightFull, [System.StringComparison]::CurrentCultureIgnoreCase)
  } catch {
    return $false
  }
}

function New-SelfLockProcess([int]$processId) {
  return [pscustomobject]@{ name = 'AionUi installer'; pid = $processId }
}

function Write-LockersAndExit($lockers, [string]$fallbackReason, [string]$message, [int]$exitCode, [int]$resources, [int]$count) {
  $lockerText = @($lockers | ForEach-Object { $_.name + '(' + $_.pid + ')' }) -join ', '
  [System.IO.File]::WriteAllText($LockerListPath, $lockerText, (New-Object System.Text.UTF8Encoding $false))
  Write-InstallerJson 'rm-lockers' @{
    target = $TargetPath
    resources = $resources
    count = $count
    blockingProcesses = @($lockers)
    fallbackReason = $fallbackReason
    message = $message
    outerInstallerPid = $script:installerPid
    currentOutDir = $CurrentOutDir
    installerSelfLock = $script:installerSelfLock
  }
  exit $exitCode
}

[System.IO.File]::WriteAllText($LockerListPath, '', (New-Object System.Text.UTF8Encoding $false))

try {
  $instDirFull = [System.IO.Path]::GetFullPath($InstDir)
  $targetPathFull = if ($TargetPath) { [System.IO.Path]::GetFullPath($TargetPath) } else { '' }
  $psProc = @(Get-CimInstance -ClassName Win32_Process | Where-Object { $_.ProcessId -eq $PID })[0]
  $script:installerPid = if ($psProc) { [int]$psProc.ParentProcessId } else { 0 }
  $script:installerSelfLock = (Test-SamePath $CurrentOutDir $targetPathFull) -or (Test-SamePath $CurrentOutDir $instDirFull)

  $resources = @()
  if ($targetPathFull -and (Test-Path -LiteralPath $targetPathFull -PathType Leaf)) {
    $resources = @($targetPathFull)
  } elseif ($targetPathFull -and (Test-Path -LiteralPath $targetPathFull -PathType Container)) {
    $topLevel = @(Get-ChildItem -LiteralPath $targetPathFull -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    $knownRelative = @(
      'AionUi.exe',
      'Uninstall AionUi.exe',
      'resources\app.asar',
      'resources\app-update.yml',
      'resources\bundled-aioncore\win32-x64\aioncore.exe'
    )
    $known = @(
      $knownRelative |
        ForEach-Object { Join-Path $targetPathFull $_ } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
    )
    $resources = @($topLevel + $known | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Select-Object -Unique | Select-Object -First 512)
  }

  Write-InstallerJson 'rm-query-start' @{
    target = $TargetPath
    resources = $resources.Count
    outerInstallerPid = $script:installerPid
    currentOutDir = $CurrentOutDir
    installerSelfLock = $script:installerSelfLock
  }

  if ($resources.Count -eq 0) {
    if ($script:installerSelfLock -and $script:installerPid -gt 0) {
      Write-LockersAndExit @(New-SelfLockProcess $script:installerPid) `
        'installer-self-lock' `
        'The installer process is using the install directory as its current output directory.' `
        0 `
        0 `
        1
    }
    Write-LockersAndExit @() `
      'restart-manager-no-resources' `
      'Restart Manager had no existing files to query for this path.' `
      1 `
      0 `
      0
  }

  $source = @'
using System;
using System.Text;
using System.Runtime.InteropServices;

namespace AionUi.RestartManager {
  public enum RM_APP_TYPE {
    RmUnknownApp = 0,
    RmMainWindow = 1,
    RmOtherWindow = 2,
    RmService = 3,
    RmExplorer = 4,
    RmConsole = 5,
    RmCritical = 1000
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS {
    public int dwProcessId;
    public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
    public string strServiceShortName;
    public RM_APP_TYPE ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)]
    public bool bRestartable;
  }

  public static class Native {
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, StringBuilder strSessionKey);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmRegisterResources(uint dwSessionHandle, UInt32 nFiles, string[] rgsFilenames, UInt32 nApplications, IntPtr rgApplications, UInt32 nServices, string[] rgsServiceNames);
    [DllImport("rstrtmgr.dll")]
    public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);
    [DllImport("rstrtmgr.dll")]
    public static extern int RmEndSession(uint pSessionHandle);
  }
}
'@
  Add-Type -TypeDefinition $source -ErrorAction Stop

  $sessionHandle = [uint32]0
  $key = New-Object System.Text.StringBuilder 64
  $result = [AionUi.RestartManager.Native]::RmStartSession([ref]$sessionHandle, 0, $key)
  if ($result -ne 0) {
    throw "RmStartSession=$result"
  }

  try {
    for ($i = 0; $i -lt $resources.Count; $i += 256) {
      $end = [Math]::Min($i + 255, $resources.Count - 1)
      $chunk = [string[]]$resources[$i..$end]
      $result = [AionUi.RestartManager.Native]::RmRegisterResources($sessionHandle, [uint32]$chunk.Count, $chunk, 0, [IntPtr]::Zero, 0, $null)
      if ($result -ne 0) {
        throw "RmRegisterResources=$result"
      }
    }

    $ERROR_MORE_DATA = 234
    $ERROR_ACCESS_DENIED = 5
    $needed = [uint32]0
    $count = [uint32]0
    $reasons = [uint32]0

    for ($attempt = 0; $attempt -lt 6; $attempt++) {
      if ($attempt -gt 0) {
        Start-Sleep -Milliseconds (50 * $attempt)
      }
      $needed = [uint32]0
      $count = [uint32]0
      $reasons = [uint32]0
      $result = [AionUi.RestartManager.Native]::RmGetList($sessionHandle, [ref]$needed, [ref]$count, $null, [ref]$reasons)
      if ($result -ne $ERROR_ACCESS_DENIED) {
        break
      }
    }

    if ($result -ne 0 -and $result -ne $ERROR_MORE_DATA) {
      throw "RmGetList=$result"
    }

    $lockers = @()
    if ($result -eq $ERROR_MORE_DATA -or $needed -gt 0) {
      for ($attempt = 0; $attempt -lt 6; $attempt++) {
        if ($attempt -gt 0) {
          Start-Sleep -Milliseconds (50 * $attempt)
        }
        $count = $needed
        $apps = New-Object 'AionUi.RestartManager.RM_PROCESS_INFO[]' $count
        $result = [AionUi.RestartManager.Native]::RmGetList($sessionHandle, [ref]$needed, [ref]$count, $apps, [ref]$reasons)
        if ($result -ne $ERROR_ACCESS_DENIED -and $result -ne $ERROR_MORE_DATA) {
          break
        }
      }
      if ($result -ne 0) {
        throw "RmGetList=$result"
      }
      $lockers = @(
        $apps |
          Select-Object -First $count |
          Where-Object { $_.Process.dwProcessId -gt 0 } |
          ForEach-Object {
            $name = $_.strAppName
            if (-not $name) {
              $proc = Get-Process -Id $_.Process.dwProcessId -ErrorAction SilentlyContinue
              if ($proc) {
                $name = $proc.ProcessName
              }
            }
            if (-not $name) {
              $name = 'unknown'
            }
            [pscustomobject]@{ name = $name; pid = [int]$_.Process.dwProcessId }
          }
      )
    }

    if ($lockers.Count -eq 0 -and $script:installerSelfLock -and $script:installerPid -gt 0) {
      $lockers = @(New-SelfLockProcess $script:installerPid)
    }

    if ($script:installerSelfLock -and $lockers.Count -gt 0) {
      Write-LockersAndExit $lockers `
        'installer-self-lock' `
        'The installer process is using the install directory as its current output directory.' `
        0 `
        $resources.Count `
        $lockers.Count
    }

    if ($lockers.Count -eq 0) {
      Write-LockersAndExit @() `
        'restart-manager-no-process' `
        'Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder.' `
        1 `
        $resources.Count `
        0
    }

    Write-LockersAndExit $lockers '' '' 0 $resources.Count $needed
  } finally {
    [void][AionUi.RestartManager.Native]::RmEndSession($sessionHandle)
  }
} catch {
  Write-InstallerJson 'rm-error' @{
    target = $TargetPath
    error = $_.Exception.Message
    outerInstallerPid = $script:installerPid
    currentOutDir = $CurrentOutDir
    installerSelfLock = $script:installerSelfLock
  }
  exit 1
}
