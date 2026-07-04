param(
  [string]$Installer27 = (Join-Path $PSScriptRoot '..\out-fast-builds\AionUi-2.1.27-win-x64.exe'),
  [string]$Installer28 = (Join-Path $PSScriptRoot '..\out-fast-builds\AionUi-2.1.28-win-x64.exe'),
  [string]$ResultDir = (Join-Path $PSScriptRoot '..\e2e-results'),
  [ValidateSet('CancelReport')]
  [string]$Scenario = 'CancelReport',
  [switch]$SkipInstall27,
  [switch]$SkipSentrySearch
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
New-Item -ItemType Directory -Force -Path $ResultDir | Out-Null
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$resultPath = Join-Path $ResultDir "installer-locks-$runId.json"
$transcriptPath = Join-Path $ResultDir "installer-locks-$runId.log"
Start-Transcript -Path $transcriptPath -Force | Out-Null

$state = [ordered]@{
  runId = $runId
  startedAt = (Get-Date -Format o)
  installer27 = (Resolve-Path $Installer27 -ErrorAction SilentlyContinue).Path
  installer28 = (Resolve-Path $Installer28 -ErrorAction SilentlyContinue).Path
  resultPath = $resultPath
  transcriptPath = $transcriptPath
  steps = New-Object System.Collections.ArrayList
}

function New-UnicodeText([int[]]$CodePoints) {
  return -join ($CodePoints | ForEach-Object { [char]$_ })
}

$UiText = @{
  FileInUse = New-UnicodeText @(25991, 20214, 27491, 22312, 20351, 29992)
  Next = New-UnicodeText @(19979, 19968, 27493)
  Install = New-UnicodeText @(23433, 35013)
  Agree = New-UnicodeText @(21516, 24847)
  Finish = New-UnicodeText @(23436, 25104)
  Close = New-UnicodeText @(20851, 38381)
  Running = New-UnicodeText @(27491, 22312, 36816, 34892)
  OK = New-UnicodeText @(30830, 23450)
  Yes = New-UnicodeText @(26159)
  Cancel = New-UnicodeText @(21462, 28040)
  Retry = New-UnicodeText @(37325, 35797)
  CannotClose = New-UnicodeText @(26080, 27861, 23436, 25104, 20851, 38381)
  CannotCloseDefault = New-UnicodeText @(26080, 27861, 20851, 38381)
  ManualCloseDefault = New-UnicodeText @(35831, 25163, 21160, 20851, 38381)
  PreviousVersion = New-UnicodeText @(26087, 29256, 26412)
}

function Add-Step([string]$Name, [hashtable]$Data = @{}) {
  $entry = [ordered]@{ at = (Get-Date -Format o); name = $Name }
  foreach ($key in $Data.Keys) { $entry[$key] = $Data[$key] }
  [void]$state.steps.Add($entry)
  Write-Host "[$($entry.at)] $Name"
}

function Save-State {
  $state.endedAt = (Get-Date -Format o)
  $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8
}

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }
}

function Get-AionUiInstallInfo {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )

  foreach ($root in $roots) {
    $items = @(Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | Where-Object {
      $_.DisplayName -eq 'AionUi' -or $_.PSChildName -like '*AionUi*'
    })

    foreach ($item in $items) {
      $location = $item.InstallLocation
      if ($location -and (Test-Path -LiteralPath (Join-Path $location 'AionUi.exe'))) {
        return [ordered]@{
          displayName = $item.DisplayName
          displayVersion = $item.DisplayVersion
          installLocation = $location
          uninstallString = $item.UninstallString
          registryPath = $item.PSPath
        }
      }
    }
  }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\AionUi'),
    (Join-Path $env:ProgramFiles 'AionUi'),
    (Join-Path ${env:ProgramFiles(x86)} 'AionUi')
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'AionUi.exe')) {
      return [ordered]@{ installLocation = $candidate; displayVersion = $null; registryPath = $null }
    }
  }

  throw 'AionUi install location was not found in registry or default install paths.'
}

function Stop-AionUiProcesses {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ieq 'AionUi.exe' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Get-AionUiDefaultInstallDirs {
  @(
    (Join-Path $env:LOCALAPPDATA 'Programs\AionUi'),
    (Join-Path $env:ProgramFiles 'AionUi'),
    (Join-Path ${env:ProgramFiles(x86)} 'AionUi')
  ) | Where-Object { $_ } | ForEach-Object { [System.IO.Path]::GetFullPath($_).TrimEnd('\') }
}

function Test-AionUiDefaultInstallDir([string]$Path) {
  if (-not $Path) { return $false }
  $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  foreach ($candidate in Get-AionUiDefaultInstallDirs) {
    if ($fullPath -ieq $candidate) { return $true }
  }
  return $false
}

function Remove-AionUiRegistryEntries {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )

  foreach ($root in $roots) {
    $items = @(Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | Where-Object {
      $_.DisplayName -eq 'AionUi' -or $_.PSChildName -like '*AionUi*'
    })
    foreach ($item in $items) {
      Add-Step 'cleanup-registry-entry' @{ path = $item.PSPath; displayName = $item.DisplayName; displayVersion = $item.DisplayVersion }
      Remove-Item -LiteralPath $item.PSPath -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Stop-AionUiInstallDirUsers([string]$Path) {
  if (-not $Path) { return }
  $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  $hits = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessId -ne $PID -and (
      ($_.ExecutablePath -and [System.IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($fullPath, [StringComparison]::OrdinalIgnoreCase)) -or
      ($_.CommandLine -and $_.CommandLine.IndexOf($fullPath, [StringComparison]::OrdinalIgnoreCase) -ge 0)
    )
  })

  foreach ($hit in $hits) {
    Add-Step 'cleanup-stop-install-dir-user' @{ pid = $hit.ProcessId; name = $hit.Name; commandLine = $hit.CommandLine }
    Stop-Process -Id $hit.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Remove-AionUiInstallDir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Add-Step 'cleanup-install-dir' @{ path = $Path }

  for ($attempt = 1; $attempt -le 5 -and (Test-Path -LiteralPath $Path); $attempt++) {
    Stop-AionUiInstallDirUsers $Path
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $Path) {
      $longPath = if ($Path.StartsWith('\\?\')) { $Path } else { '\\?\' + $Path }
      & cmd.exe /c "rmdir /s /q `"$longPath`""
      Add-Step 'cleanup-install-dir-fallback' @{ path = $Path; attempt = $attempt; exitCode = $LASTEXITCODE }
    }
    if (Test-Path -LiteralPath $Path) { Start-Sleep -Seconds 1 }
  }

  if (Test-Path -LiteralPath $Path) {
    $leftovers = @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | Select-Object -First 8 -ExpandProperty FullName)
    throw "Failed to clean AionUi install directory: $Path. Leftovers: $($leftovers -join '; ')"
  }
}

function Reset-AionUiInstallBaseline {
  param([string]$Reason)

  Stop-AionUiProcesses

  $existing = $null
  try {
    $existing = Get-AionUiInstallInfo
  } catch {
    $existing = $null
  }

  if ($existing) {
    Add-Step 'cleanup-existing-install' @{ reason = $Reason; installLocation = $existing.installLocation; displayVersion = $existing.displayVersion }
    $uninstaller = Join-Path $existing.installLocation 'Uninstall AionUi.exe'
    if ((Test-AionUiDefaultInstallDir $existing.installLocation) -and (Test-Path -LiteralPath $uninstaller)) {
      $proc = Start-Process -FilePath $uninstaller -ArgumentList @('/S') -PassThru
      try {
        $exit = Wait-ProcessExit $proc 240 'cleanup-existing-uninstaller'
        Add-Step 'cleanup-uninstaller-exit' @{ exitCode = $exit }
      } catch {
        Add-Step 'cleanup-uninstaller-timeout-or-error' @{ error = $_.Exception.Message }
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      }
    }
  }

  Stop-AionUiProcesses
  foreach ($dir in Get-AionUiDefaultInstallDirs) {
    Stop-AionUiInstallDirUsers $dir
  }

  foreach ($dir in Get-AionUiDefaultInstallDirs) {
    Remove-AionUiInstallDir $dir
  }

  Remove-AionUiRegistryEntries
}

function Start-Installer([string]$Path, [string[]]$InstallerArgs = @()) {
  Add-Step 'installer-start' @{ path = $Path; args = ($InstallerArgs -join ' ') }
  if ($InstallerArgs -and $InstallerArgs.Count -gt 0) {
    return Start-Process -FilePath $Path -ArgumentList $InstallerArgs -PassThru
  }
  return Start-Process -FilePath $Path -PassThru
}

function Wait-ProcessExit([System.Diagnostics.Process]$Process, [int]$TimeoutSec, [string]$Label) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while (-not $Process.HasExited -and (Get-Date) -lt $deadline) {
    [void](Try-FinishInstallerWizard)
    Start-Sleep -Milliseconds 500
    $Process.Refresh()
  }
  if (-not $Process.HasExited) {
    throw "$Label did not exit within $TimeoutSec seconds. pid=$($Process.Id)"
  }
  Add-Step 'process-exit' @{ label = $Label; pid = $Process.Id; exitCode = $Process.ExitCode }
  return $Process.ExitCode
}

function Install-27 {
  Assert-File $Installer27 '2.1.27 installer'
  Reset-AionUiInstallBaseline 'install-2.1.27-baseline'
  $proc = Start-Installer -Path $Installer27 -InstallerArgs @('/S')
  $exit = Wait-ProcessExit $proc 420 'install-2.1.27'
  if ($exit -ne 0) { throw "2.1.27 installer failed with exit code $exit" }
  $info = Get-AionUiInstallInfo
  Add-Step 'install-info-after-27' @{ installLocation = $info.installLocation; displayVersion = $info.displayVersion; registryPath = $info.registryPath }
  return $info
}

function Start-AionUi([string]$InstallDir) {
  $exe = Join-Path $InstallDir 'AionUi.exe'
  Assert-File $exe 'Installed AionUi.exe'
  $proc = Start-Process -FilePath $exe -PassThru
  $deadline = (Get-Date).AddSeconds(45)
  do {
    $hit = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ProcessId -eq $proc.Id -or ($_.Name -ieq 'AionUi.exe' -and $_.ExecutablePath -eq $exe)
    } | Select-Object -First 1
    if ($hit) {
      Add-Step 'app-started' @{ pid = $hit.ProcessId; path = $hit.ExecutablePath }
      return $hit.ProcessId
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw 'AionUi process did not start.'
}

function Start-Locker([string]$InstallDir) {
  $lockedFile = Join-Path $InstallDir 'aionui-e2e-rstrtmgr-lock.txt'
  Set-Content -LiteralPath $lockedFile -Encoding UTF8 -Value "AionUi installer E2E lock $runId"
  $lockerScript = Join-Path $ResultDir "locker-$runId.ps1"
  @'
param([string]$Path)
$ErrorActionPreference = 'Stop'
$fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
  while ($true) { Start-Sleep -Seconds 1 }
} finally {
  $fs.Dispose()
}
'@ | Set-Content -LiteralPath $lockerScript -Encoding UTF8
  $proc = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $lockerScript, $lockedFile) -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 800
  Add-Step 'locker-started' @{ pid = $proc.Id; lockedFile = $lockedFile }
  return [ordered]@{ process = $proc; lockedFile = $lockedFile; script = $lockerScript }
}

function Stop-Locker($Locker) {
  if ($Locker -and $Locker.process) {
    Stop-Process -Id $Locker.process.Id -Force -ErrorAction SilentlyContinue
    Add-Step 'locker-stopped' @{ pid = $Locker.process.Id; lockedFile = $Locker.lockedFile }
  }
}

function Get-WindowText([System.Windows.Automation.AutomationElement]$Window) {
  $texts = New-Object System.Collections.Generic.List[string]
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue($Window)
  while ($queue.Count -gt 0) {
    $item = [System.Windows.Automation.AutomationElement]$queue.Dequeue()
    $name = $item.Current.Name
    if ($name -and -not $texts.Contains($name)) { $texts.Add($name) }
    $child = $walker.GetFirstChild($item)
    while ($child) {
      $queue.Enqueue($child)
      $child = $walker.GetNextSibling($child)
    }
  }
  return ($texts -join "`n")
}

function Get-AionUiWindows {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $windowCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window
  )

  $result = @()
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $windowCond)
  foreach ($window in $windows) {
    $title = $window.Current.Name
    if ($title -like '*AionUi*' -or $title -like "*$($UiText.FileInUse)*") {
      $result += $window
    }
  }
  return $result
}

function Try-ClickWindowButton([System.Windows.Automation.AutomationElement]$Window, [string[]]$ButtonNames, [string]$Reason) {
  $buttonCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  $buttons = $Window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCond)
  foreach ($button in $buttons) {
    foreach ($name in $ButtonNames) {
        if ($button.Current.Name -eq $name -or $button.Current.Name -like "*$name*") {
          if (-not $button.Current.IsEnabled) { continue }
        try {
          $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
          Add-Step 'button-click' @{ title = $Window.Current.Name; button = $button.Current.Name; reason = $Reason }
          $pattern.Invoke()
          Start-Sleep -Milliseconds 700
          return $true
        } catch {
          Add-Step 'button-click-skipped' @{ title = $Window.Current.Name; button = $button.Current.Name; reason = $Reason; error = $_.Exception.Message }
          continue
        }
      }
    }
  }
  return $false
}

function Try-AdvanceInstallerWizard {
  foreach ($window in Get-AionUiWindows) {
    $text = Get-WindowText $window
    if ($text -like '*Application using the file:*' -or
        $text -like '*Application using it:*' -or
        $text -like '*this file is still open*' -or
        $text -like '*AionUi installation failed*' -or
        $text -like '*Send this installer failure report*' -or
        $text -like '*installer report sent*') {
      continue
    }

    if (Try-ClickWindowButton $window @('Next', $UiText.Next, $UiText.Install, 'Install', 'I Agree', $UiText.Agree) 'advance-installer-wizard') {
      return $true
    }
  }
  return $false
}

function Try-FinishInstallerWizard {
  foreach ($window in Get-AionUiWindows) {
    if (Try-ClickWindowButton $window @('Finish', $UiText.Finish, $UiText.Close) 'finish-installer-wizard') {
      return $true
    }
  }
  return $false
}

function Find-AionUiWindow([string[]]$ContainsAny, [int]$TimeoutSec = 90, [switch]$NoAutoAdvance) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)

  do {
    foreach ($window in Get-AionUiWindows) {
      $title = $window.Current.Name
      $text = Get-WindowText $window
      foreach ($needle in $ContainsAny) {
        if ($text -like "*$needle*") {
          return [ordered]@{ window = $window; title = $title; text = $text }
        }
      }
    }
    if (-not $NoAutoAdvance) {
      [void](Try-AdvanceInstallerWizard)
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Expected installer window not found. Needles: $($ContainsAny -join ', ')"
}

function Invoke-WindowButton($WindowInfo, [string[]]$ButtonNames) {
  if (Try-ClickWindowButton $WindowInfo.window $ButtonNames 'target-window') {
    return
  }

  $buttonCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  $buttons = $WindowInfo.window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCond)
  $available = @()
  foreach ($button in $buttons) { $available += $button.Current.Name }
  throw "Button not found. Wanted: $($ButtonNames -join ', '). Available: $($available -join ', ')"
}

function Wait-ForReportStatus([int]$TimeoutSec = 45) {
  $statusPath = Join-Path $env:TEMP 'aionui-installer-report.json'
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    if (Test-Path -LiteralPath $statusPath) {
      $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
      if ($status.status -eq 'sent' -or $status.status -eq 'failed' -or $status.status -eq 'skipped') {
        Add-Step 'report-status' @{ statusPath = $statusPath; status = $status.status; eventId = $status.eventId; logPath = $status.logPath; search = $status.search }
        return $status
      }
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Report status file not written: $statusPath"
}

function Search-Sentry([string]$EventId) {
  if ($SkipSentrySearch -or -not $EventId) { return $null }
  $sentry = Get-Command sentry -ErrorAction SilentlyContinue
  if (-not $sentry) {
    Add-Step 'sentry-search-skipped' @{ reason = 'sentry command not found'; eventId = $EventId }
    return $null
  }

  $queries = @(
    @('issues', 'list', '--org', 'iofficeai', '--project', 'electron', '--query', "event_id:$EventId"),
    @('events', 'list', '--org', 'iofficeai', '--project', 'electron', '--query', "event_id:$EventId")
  )

  foreach ($args in $queries) {
    try {
      $output = & sentry @args 2>&1 | Out-String
      Add-Step 'sentry-search' @{ eventId = $EventId; command = "sentry $($args -join ' ')"; output = $output.Trim() }
      if ($LASTEXITCODE -eq 0 -and $output -match [regex]::Escape($EventId)) {
        return $output
      }
    } catch {
      Add-Step 'sentry-search-error' @{ eventId = $EventId; command = "sentry $($args -join ' ')"; error = $_.Exception.Message }
    }
  }

  return $null
}

function Read-InstallerJsonl([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Installer log missing: $Path"
  }

  $lineNumber = 0
  @(Get-Content -LiteralPath $Path | Where-Object { $_.Trim() } | ForEach-Object {
    $lineNumber++
    try {
      $_ | ConvertFrom-Json
    } catch {
      throw "Invalid JSONL in installer log at line $lineNumber`: $($_.Exception.Message). Line: $_"
    }
  })
}

function Run-CancelReport([string]$InstallDir) {
  Add-Step 'scenario-start' @{ scenario = 'CancelReport' }
  Remove-Item -LiteralPath (Join-Path $env:TEMP 'aionui-installer-report.json') -Force -ErrorAction SilentlyContinue
  $appPid = Start-AionUi $InstallDir
  $locker = Start-Locker $InstallDir
  try {
    $installer = Start-Installer -Path $Installer28
    $appPrompt = Find-AionUiWindow @('already running', 'is running', 'close it', 'close AionUi', $UiText.Running) 120
    Add-Step 'window-captured' @{ kind = 'app-running'; title = $appPrompt.title; text = $appPrompt.text }
    Invoke-WindowButton $appPrompt @('OK', $UiText.OK, $UiText.Yes)

    $failurePrompt = Find-AionUiWindow @('AionUi installation failed (E1003)', 'Blocking diagnostics:', 'Send this installer failure report') 240 -NoAutoAdvance
    Add-Step 'window-captured' @{ kind = 'failure-report-consent'; title = $failurePrompt.title; text = $failurePrompt.text }
    if ($failurePrompt.text -notlike '*AionUi installation failed (E1003)*') {
      throw 'Failure prompt does not use root cause code E1003'
    }
    if ($failurePrompt.text -like '*AionUi installation failed (E1002)*') {
      throw 'Failure prompt still uses wrapper code E1002 as the main visible code'
    }
    foreach ($required in @('Blocking diagnostics:', 'Outer installer', 'Inner failure: E1003', 'File or folder:')) {
      if ($failurePrompt.text -notlike "*$required*") {
        throw "Failure prompt missing expected root-cause detail: $required"
      }
    }
    if ($failurePrompt.text -like '*Blocking process: Windows' -and $failurePrompt.text -notlike '*Windows did not identify a specific locking process*') {
      throw 'Failure prompt appears to contain truncated Blocking process text'
    }
    if ($failurePrompt.text -like '*Installer log:*Blocking diagnostics:*' -or
        $failurePrompt.text -like '*Blocking diagnostics:*Installer log:*Installer log:*') {
      throw 'Failure prompt repeats installer log inside Blocking diagnostics'
    }
    if ($failurePrompt.text -like '*appCannotBeClosed*' -or
        $failurePrompt.text -like '*could not finish closing or removing the previous version*') {
      throw 'Failure prompt still shows the generic old-uninstaller retry copy'
    }
    Invoke-WindowButton $failurePrompt @('Yes', $UiText.Yes)

    $reportPrompt = Find-AionUiWindow @('installer report sent', 'AionUi installer failure E1003', 'Issue search:', 'GitHub issue', 'installer report failed') 90 -NoAutoAdvance
    Add-Step 'window-captured' @{ kind = 'report-result'; title = $reportPrompt.title; text = $reportPrompt.text }
    foreach ($required in @('AionUi installer failure E1003', 'https://github.com/iOfficeAI/AionUi/issues', 'To AionUi Team')) {
      if ($reportPrompt.text -notlike "*$required*") {
        throw "Report dialog missing expected copyable detail: $required"
      }
    }
    Invoke-WindowButton $reportPrompt @('OK', $UiText.OK)

    $exit = Wait-ProcessExit $installer 120 'install-2.1.28-cancel-report'
    $status = Wait-ForReportStatus
    $sentryOutput = Search-Sentry $status.eventId
    if ($status.status -ne 'sent') { throw "Expected Sentry report status sent, got $($status.status)" }
    if ($status.code -ne 'E1003') { throw "Expected report code E1003, got $($status.code)" }
    if ($status.wrapperCode -ne 'E1002') { throw "Expected wrapperCode E1002, got $($status.wrapperCode)" }
    if ($status.logPath -notlike '*-log.jsonl') { throw "Expected JSONL installer log, got $($status.logPath)" }
    if ($status.copyText -notlike '*AionUi installer failure E1003*' -or $status.copyText -notlike '*To AionUi Team*') {
      throw 'Report status copyText is missing expected E1003 support payload'
    }
    $events = Read-InstallerJsonl $status.logPath
    foreach ($requiredEvent in @('old-uninstaller-failed', 'report-sent')) {
      if (-not (@($events | Where-Object { $_.event -eq $requiredEvent }).Count -gt 0)) {
        throw "Installer JSONL log missing event: $requiredEvent"
      }
    }
    $failure = @($events | Where-Object { $_.event -eq 'failure' -and $_.code -eq 'E1003' } | Select-Object -Last 1)[0]
    if (-not $failure) {
      throw 'Missing E1003 JSONL failure event'
    }
    if (-not $failure.failedPath) {
      throw 'E1003 JSONL failure event is missing failedPath'
    }
    if (-not $failure.phase) {
      throw 'E1003 JSONL failure event is missing phase'
    }
    $hasRmLockers = @($events | Where-Object { $_.event -eq 'rm-lockers' }).Count -gt 0
    if (-not $hasRmLockers -and -not $failure.fallbackReason -and -not $failure.message) {
      throw 'Installer JSONL log has neither rm-lockers event nor fallback diagnostics on the E1003 failure'
    }
    $failureBlocking = ''
    $failureProcesses = @($failure.blockingProcesses)
    if ($failureProcesses.Count -gt 0) {
      $failureBlocking = @($failureProcesses | ForEach-Object {
        if ($_.pid) { "$($_.name)($($_.pid))" } else { [string]$_.name }
      }) -join ', '
    }
    if (-not $failureBlocking) { $failureBlocking = [string]$failure.message }
    if ($failureBlocking -eq 'Windows') {
      throw 'E1003 JSONL failure blocking diagnostics were truncated to Windows'
    }
    Add-Step 'scenario-result' @{ scenario = 'CancelReport'; installerExit = $exit; eventId = $status.eventId; issueSearch = $status.issueSearch; userId = $status.userId; logPath = $status.logPath; sentryFound = [bool]$sentryOutput }
  } finally {
    Stop-Locker $locker
    Stop-AionUiProcesses
  }
}

try {
  Assert-File $Installer28 '2.1.28 installer'
  if (-not $SkipInstall27) {
    $installInfo = Install-27
  } else {
    $installInfo = Get-AionUiInstallInfo
    Add-Step 'install-info-existing' @{ installLocation = $installInfo.installLocation; displayVersion = $installInfo.displayVersion; registryPath = $installInfo.registryPath }
  }

  Run-CancelReport $installInfo.installLocation

  Add-Step 'e2e-complete' @{ scenario = $Scenario }
  Save-State
} catch {
  Add-Step 'e2e-failed' @{ error = $_.Exception.Message; scriptStackTrace = $_.ScriptStackTrace }
  Save-State
  throw
} finally {
  Stop-Transcript | Out-Null
}
