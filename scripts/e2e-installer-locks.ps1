param(
  [string]$Installer26 = (Join-Path $PSScriptRoot '..\out-fast-builds\AionUi-2.1.26-win-x64.exe'),
  [string]$Installer27 = (Join-Path $PSScriptRoot '..\out-fast-builds\AionUi-2.1.27-win-x64.exe'),
  [string]$ResultDir = (Join-Path $PSScriptRoot '..\e2e-results'),
  [ValidateSet('CancelReport', 'RetrySuccess', 'All')]
  [string]$Scenario = 'All',
  [switch]$SkipInstall26,
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
  installer26 = (Resolve-Path $Installer26 -ErrorAction SilentlyContinue).Path
  installer27 = (Resolve-Path $Installer27 -ErrorAction SilentlyContinue).Path
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

function Install-26 {
  Assert-File $Installer26 '2.1.26 installer'
  Stop-AionUiProcesses
  $proc = Start-Installer -Path $Installer26 -InstallerArgs @('/S')
  $exit = Wait-ProcessExit $proc 420 'install-2.1.26'
  if ($exit -ne 0) { throw "2.1.26 installer failed with exit code $exit" }
  $info = Get-AionUiInstallInfo
  Add-Step 'install-info-after-26' @{ installLocation = $info.installLocation; displayVersion = $info.displayVersion; registryPath = $info.registryPath }
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

function Find-AionUiWindow([string[]]$ContainsAny, [int]$TimeoutSec = 90) {
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
    [void](Try-AdvanceInstallerWizard)
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

function Run-CancelReport([string]$InstallDir) {
  Add-Step 'scenario-start' @{ scenario = 'CancelReport' }
  Remove-Item -LiteralPath (Join-Path $env:TEMP 'aionui-installer-report.json') -Force -ErrorAction SilentlyContinue
  $appPid = Start-AionUi $InstallDir
  $locker = Start-Locker $InstallDir
  try {
    $installer = Start-Installer -Path $Installer27
    $appPrompt = Find-AionUiWindow @('already running', 'is running', 'close it', 'close AionUi', $UiText.Running) 120
    Add-Step 'window-captured' @{ kind = 'app-running'; title = $appPrompt.title; text = $appPrompt.text }
    Invoke-WindowButton $appPrompt @('OK', $UiText.OK, $UiText.Yes)

    $cannotClosePrompt = Find-AionUiWindow @('could not finish closing or removing the previous version', 'If Retry keeps returning here', 'cannot be closed', 'Please close it manually', $UiText.CannotClose, $UiText.CannotCloseDefault, $UiText.ManualCloseDefault, $UiText.PreviousVersion) 180
    Add-Step 'window-captured' @{ kind = 'old-uninstaller-retry-cancel'; title = $cannotClosePrompt.title; text = $cannotClosePrompt.text }
    Invoke-WindowButton $cannotClosePrompt @('Cancel', $UiText.Cancel)

    $lockerPrompt = Find-AionUiWindow @('Application using the file:', 'Application using it:', 'file or folder in the install directory', 'this file is still open') 120
    Add-Step 'window-captured' @{ kind = 'locker-retry-cancel'; title = $lockerPrompt.title; text = $lockerPrompt.text }
    Invoke-WindowButton $lockerPrompt @('Cancel', $UiText.Cancel)

    $failurePrompt = Find-AionUiWindow @('AionUi installation failed', 'E1003', 'Send this installer failure report') 120
    Add-Step 'window-captured' @{ kind = 'failure-report-consent'; title = $failurePrompt.title; text = $failurePrompt.text }
    Invoke-WindowButton $failurePrompt @('Yes', $UiText.Yes)

    $reportPrompt = Find-AionUiWindow @('installer report sent', 'Event ID:', 'installer report failed') 90
    Add-Step 'window-captured' @{ kind = 'report-result'; title = $reportPrompt.title; text = $reportPrompt.text }
    Invoke-WindowButton $reportPrompt @('OK', $UiText.OK)

    $exit = Wait-ProcessExit $installer 120 'install-2.1.27-cancel-report'
    $status = Wait-ForReportStatus
    $sentryOutput = Search-Sentry $status.eventId
    if ($status.status -ne 'sent') { throw "Expected Sentry report status sent, got $($status.status)" }
    if (-not (Test-Path -LiteralPath $status.logPath)) { throw "Installer log missing: $($status.logPath)" }
    $logText = Get-Content -LiteralPath $status.logPath -Raw
    foreach ($required in @('event=rm-lockers', 'event=report-sent', 'AionUi')) {
      if ($logText -notlike "*$required*") { throw "Installer log missing expected text: $required" }
    }
    if ($logText -notlike '*phase=residual-delete-failed*' -and
        $logText -notlike '*phase=old-uninstaller-failed*' -and
        $logText -notlike '*event=old-uninstaller-failed action=report*') {
      throw 'Installer log missing expected RM failure phase'
    }
    Add-Step 'scenario-result' @{ scenario = 'CancelReport'; installerExit = $exit; eventId = $status.eventId; logPath = $status.logPath; sentryFound = [bool]$sentryOutput }
  } finally {
    Stop-Locker $locker
    Stop-AionUiProcesses
  }
}

function Run-RetrySuccess([string]$InstallDir) {
  Add-Step 'scenario-start' @{ scenario = 'RetrySuccess' }
  $appPid = Start-AionUi $InstallDir
  $locker = Start-Locker $InstallDir
  try {
    $installer = Start-Installer -Path $Installer27
    $appPrompt = Find-AionUiWindow @('already running', 'is running', 'close it', 'close AionUi', $UiText.Running) 120
    Add-Step 'window-captured' @{ kind = 'app-running'; title = $appPrompt.title; text = $appPrompt.text }
    Invoke-WindowButton $appPrompt @('OK', $UiText.OK, $UiText.Yes)

    $cannotClosePrompt = Find-AionUiWindow @('could not finish closing or removing the previous version', 'If Retry keeps returning here', 'cannot be closed', 'Please close it manually', $UiText.CannotClose, $UiText.CannotCloseDefault, $UiText.ManualCloseDefault, $UiText.PreviousVersion) 180
    Add-Step 'window-captured' @{ kind = 'old-uninstaller-retry-cancel'; title = $cannotClosePrompt.title; text = $cannotClosePrompt.text }
    Invoke-WindowButton $cannotClosePrompt @('Cancel', $UiText.Cancel)

    $lockerPrompt = Find-AionUiWindow @('Application using the file:', 'Application using it:', 'file or folder in the install directory', 'this file is still open') 120
    Add-Step 'window-captured' @{ kind = 'locker-retry-cancel'; title = $lockerPrompt.title; text = $lockerPrompt.text }
    Stop-Locker $locker
    $locker = $null
    Invoke-WindowButton $lockerPrompt @('Retry', $UiText.Retry)

    $exit = Wait-ProcessExit $installer 420 'install-2.1.27-retry-success'
    if ($exit -ne 0) { throw "Expected retry-success installer exit 0, got $exit" }
    $info = Get-AionUiInstallInfo
    Add-Step 'install-info-after-27' @{ installLocation = $info.installLocation; displayVersion = $info.displayVersion; registryPath = $info.registryPath }
    if ($info.displayVersion -and $info.displayVersion -ne '2.1.27') {
      throw "Expected DisplayVersion 2.1.27, got $($info.displayVersion)"
    }
    Add-Step 'scenario-result' @{ scenario = 'RetrySuccess'; installerExit = $exit; displayVersion = $info.displayVersion }
  } finally {
    Stop-Locker $locker
    Stop-AionUiProcesses
  }
}

try {
  Assert-File $Installer27 '2.1.27 installer'
  if (-not $SkipInstall26) {
    $installInfo = Install-26
  } else {
    $installInfo = Get-AionUiInstallInfo
    Add-Step 'install-info-existing' @{ installLocation = $installInfo.installLocation; displayVersion = $installInfo.displayVersion; registryPath = $installInfo.registryPath }
  }

  if ($Scenario -eq 'CancelReport' -or $Scenario -eq 'All') {
    Run-CancelReport $installInfo.installLocation
  }

  if ($Scenario -eq 'RetrySuccess' -or $Scenario -eq 'All') {
    if ($Scenario -eq 'All') {
      $installInfo = Install-26
    }
    Run-RetrySuccess $installInfo.installLocation
  }

  Add-Step 'e2e-complete' @{ scenario = $Scenario }
  Save-State
} catch {
  Add-Step 'e2e-failed' @{ error = $_.Exception.Message; scriptStackTrace = $_.ScriptStackTrace }
  Save-State
  throw
} finally {
  Stop-Transcript | Out-Null
}
