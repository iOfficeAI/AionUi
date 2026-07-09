param(
  [string]$Dsn,
  [string]$LogPath,
  [string]$Code,
  [string]$Detail,
  [string]$Release,
  [string]$Arch,
  [string]$Session,
  [string]$Updated,
  [switch]$NoUi
)

$ErrorActionPreference = 'SilentlyContinue'
$log = $LogPath
if (-not $log) {
  $log = Join-Path $env:TEMP 'aionui-installer-fallback-log.jsonl'
}
$logFileName = Split-Path -Leaf $log
$statusPath = Join-Path $env:TEMP 'aionui-installer-report.json'

function Write-StatusFile($status) {
  foreach ($key in @($status.Keys)) {
    if ($status[$key] -is [string]) {
      $status[$key] = ConvertTo-StatusSafeString $status[$key]
    }
  }
  $json = $status | ConvertTo-Json -Compress -Depth 5
  [System.IO.File]::WriteAllText($statusPath, $json, (New-Object System.Text.UTF8Encoding $false))
}

function ConvertTo-StatusSafeString([string]$value) {
  if ($null -eq $value) {
    return ''
  }
  $safe = $value -replace '[\x00-\x1F]', ' '
  $safe = $safe -replace '"', "'"
  return $safe
}

function ConvertTo-SentryTagValue([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return ''
  }
  $safe = $value -replace '[\r\n\t]', ' '
  if ($safe.Length -gt 180) {
    return $safe.Substring(0, 180)
  }
  return $safe
}

function Write-InstallerLog([string]$event, [hashtable]$properties = @{}) {
  $payload = [ordered]@{
    schemaVersion = 1
    ts = (Get-Date -Format o)
    session = $Session
    version = $Release
    arch = $Arch
    updated = ($Updated -eq '1' -or $Updated -eq 'true')
    instDir = ''
    event = $event
  }
  foreach ($key in $properties.Keys) {
    $payload[$key] = $properties[$key]
  }
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ($payload | ConvertTo-Json -Compress -Depth 8)
}

function Read-AionUiAnalyticsId {
  $candidates = @()
  if ($env:APPDATA) {
    $candidates += (Join-Path $env:APPDATA 'AionUi\analytics.json')
  }
  if ($env:LOCALAPPDATA) {
    $candidates += (Join-Path $env:LOCALAPPDATA 'AionUi\analytics.json')
  }

  foreach ($candidate in $candidates) {
    try {
      if (-not (Test-Path -LiteralPath $candidate)) {
        continue
      }
      $data = Get-Content -LiteralPath $candidate -Raw | ConvertFrom-Json
      if ($data.id -and -not [string]::IsNullOrWhiteSpace([string]$data.id)) {
        return [string]$data.id
      }
    } catch {
      Write-InstallerLog 'report-user-id-read-failed' @{ path = $candidate; error = $_.Exception.Message }
    }
  }

  return ''
}

function Show-ReportMessage([string]$text, [string]$icon) {
  if ($NoUi) {
    return
  }

  Add-Type -AssemblyName System.Windows.Forms
  $messageIcon = [System.Windows.Forms.MessageBoxIcon]::$icon
  [System.Windows.Forms.MessageBox]::Show(
    $text,
    'AionUi installer report',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    $messageIcon
  ) | Out-Null
}

function Get-BlockingDiagnostics([string]$detail) {
  if ([string]::IsNullOrWhiteSpace($detail)) {
    return ''
  }

  $marker = 'uninstallerDetail='
  $index = $detail.IndexOf($marker, [System.StringComparison]::Ordinal)
  if ($index -ge 0) {
    return $detail.Substring($index + $marker.Length).Trim()
  }

  return $detail.Trim()
}

function Get-LatestInstallerFailureContext {
  $empty = [ordered]@{
    failedPath = ''
    outerInstallerPid = $null
    fallbackReason = ''
    currentOutDir = ''
  }
  try {
    if (-not (Test-Path -LiteralPath $log)) {
      return $empty
    }
    $events = @(Get-Content -LiteralPath $log -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $_ | ConvertFrom-Json
      } catch {
        $null
      }
    } | Where-Object { $_ })
    $failure = @($events | Where-Object { $_.event -eq 'failure' } | Select-Object -Last 1)[0]
    $lockers = @($events | Where-Object { $_.event -eq 'rm-lockers' } | Select-Object -Last 1)[0]
    if ($failure -and $failure.failedPath) {
      $empty.failedPath = [string]$failure.failedPath
    } elseif ($lockers -and $lockers.target) {
      $empty.failedPath = [string]$lockers.target
    }
    if ($lockers -and $null -ne $lockers.outerInstallerPid) {
      $empty.outerInstallerPid = [int]$lockers.outerInstallerPid
    }
    if ($lockers -and $lockers.fallbackReason) {
      $empty.fallbackReason = [string]$lockers.fallbackReason
    } elseif ($failure -and $failure.fallbackReason) {
      $empty.fallbackReason = [string]$failure.fallbackReason
    }
    if ($lockers -and $lockers.currentOutDir) {
      $empty.currentOutDir = [string]$lockers.currentOutDir
    }
  } catch {
    Write-InstallerLog 'report-failure-context-read-failed' @{ error = $_.Exception.Message }
  }
  return $empty
}

function Get-OptionalHandleDiagnostics {
  $diag = [ordered]@{
    available = $false
    used = $false
    reason = 'handle-not-found'
    command = ''
    target = ''
    pid = $null
    timedOut = $false
    exitCode = $null
    output = ''
    error = ''
  }

  $command = @(Get-Command handle.exe -ErrorAction SilentlyContinue | Select-Object -First 1)[0]
  if (-not $command) {
    return $diag
  }

  $diag.available = $true
  $diag.command = [string]$command.Source
  $context = Get-LatestInstallerFailureContext
  $target = [string]$context.failedPath
  if ([string]::IsNullOrWhiteSpace($target)) {
    $diag.reason = 'no-failed-path'
    return $diag
  }

  $diag.target = $target
  $pid = $context.outerInstallerPid
  $outPath = Join-Path $env:TEMP ('aionui-handle-' + [guid]::NewGuid().ToString('N') + '.out')
  $errPath = Join-Path $env:TEMP ('aionui-handle-' + [guid]::NewGuid().ToString('N') + '.err')

  try {
    $args = @('-accepteula', '-nobanner')
    if ($null -ne $pid -and $pid -gt 0) {
      $diag.pid = [int]$pid
      $args += @('-p', [string]$pid)
    }
    $args += $target
    $diag.used = $true
    $diag.reason = ''
    $process = Start-Process `
      -FilePath $command.Source `
      -ArgumentList $args `
      -WindowStyle Hidden `
      -PassThru `
      -RedirectStandardOutput $outPath `
      -RedirectStandardError $errPath
    if (-not $process.WaitForExit(3000)) {
      $diag.timedOut = $true
      $diag.reason = 'timeout'
      try {
        $process.Kill()
      } catch {
      }
    } else {
      $diag.exitCode = $process.ExitCode
    }
    $stdout = if (Test-Path -LiteralPath $outPath) { Get-Content -LiteralPath $outPath -Raw } else { '' }
    $stderr = if (Test-Path -LiteralPath $errPath) { Get-Content -LiteralPath $errPath -Raw } else { '' }
    $output = (($stdout + [Environment]::NewLine + $stderr) -replace '[\x00-\x1F]', ' ').Trim()
    if ($output.Length -gt 4000) {
      $output = $output.Substring(0, 4000)
    }
    $diag.output = $output
  } catch {
    $diag.reason = 'failed'
    $diag.error = $_.Exception.GetType().FullName + ': ' + $_.Exception.Message
  } finally {
    Remove-Item -LiteralPath $outPath, $errPath -Force -ErrorAction SilentlyContinue
  }

  return $diag
}

function Get-WrapperCode([string]$detail) {
  if ([string]::IsNullOrWhiteSpace($detail)) {
    return ''
  }
  if ($detail -match '(^|\s)wrapperCode=(E[0-9]+)') {
    return $Matches[2]
  }
  return ''
}

function New-ReportDetailsText(
  [string]$code,
  [string]$eventId,
  [string]$issueSearch,
  [string]$userId,
  [string]$session,
  [string]$blockingDiagnostics
) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('--------------------------------')
  $lines.Add('AionUi installer failure ' + $code)
  $lines.Add('--------------------------------')
  $lines.Add('')
  if ($eventId) {
    $lines.Add('Event ID: ' + $eventId)
    $lines.Add('')
  }
  if ($issueSearch) {
    $lines.Add('Issue search: ' + $issueSearch)
    $lines.Add('')
  }
  if ($userId) {
    $lines.Add('User ID: ' + $userId)
    $lines.Add('')
  }
  if ($session) {
    $lines.Add('Session: ' + $session)
    $lines.Add('')
  }
  if ($blockingDiagnostics) {
    $lines.Add('Diagnostics:')
    foreach ($line in ($blockingDiagnostics -split "\r?\n")) {
      $trimmed = $line.Trim()
      if ($trimmed) {
        $lines.Add($trimmed)
      }
    }
    $lines.Add('')
    $lines.Add('')
  }
  $lines.Add('---------------------------')
  $lines.Add('To AionUi Team')
  $lines.Add('---------------------------')
  return ($lines -join [Environment]::NewLine)
}

$wrapperCode = Get-WrapperCode $Detail
$blockingDiagnostics = Get-BlockingDiagnostics $Detail
$handleDiagnostics = Get-OptionalHandleDiagnostics
$issueSearchPreview = 'message:"installer-failure ' + $Code + '" type:installer-failure code:' + $Code
$copyTextPreview = New-ReportDetailsText $Code '' $issueSearchPreview '' $Session $blockingDiagnostics

if ([string]::IsNullOrWhiteSpace($Dsn)) {
  Write-StatusFile ([ordered]@{
    status = 'skipped'
    reason = 'empty-dsn'
    code = $Code
    wrapperCode = $wrapperCode
    session = $Session
    release = $Release
    logPath = $log
    blockingDiagnostics = $blockingDiagnostics
    handleDiagnostics = $handleDiagnostics
    copyText = $copyTextPreview
    at = (Get-Date -Format o)
  })
  Write-InstallerLog 'report-skipped' @{ reason = 'empty-dsn'; code = $Code; wrapperCode = $wrapperCode; statusPath = $statusPath }
  exit 0
}

try {
  $uri = [Uri]$Dsn
  $projectId = $uri.AbsolutePath.Trim('/')
  $endpoint = $uri.Scheme + '://' + $uri.Authority + '/api/' + $projectId + '/envelope/'
  $logText = if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Raw } else { '' }
  $eventId = [guid]::NewGuid().ToString('N')
  $userId = Read-AionUiAnalyticsId
  $eventPayload = @{
    message = ('installer-failure ' + $Code)
    level = 'error'
    platform = 'other'
    release = $Release
    logger = 'aionui.installer'
    fingerprint = @('installer-failure', $Code)
    tags = @{
      type = 'installer-failure'
      code = $Code
      wrapper_code = $wrapperCode
      detail = (ConvertTo-SentryTagValue $Detail)
      phase = 'installer'
      arch = $Arch
      session = $Session
      updated = $Updated
    }
    extra = @{
      installerSession = $Session
      installerLogPath = $log
      reportStatusPath = $statusPath
      installerDetail = $Detail
      wrapperCode = $wrapperCode
      blockingDiagnostics = $blockingDiagnostics
      handleDiagnostics = $handleDiagnostics
    }
  }
  if ($userId) {
    $eventPayload['user'] = @{ id = $userId }
    $eventPayload['tags']['user_id'] = $userId
  }
  $event = $eventPayload | ConvertTo-Json -Compress -Depth 6

  $header = @{ event_id = $eventId; dsn = $Dsn } | ConvertTo-Json -Compress
  $eventHeader = @{ type = 'event'; length = [Text.Encoding]::UTF8.GetByteCount($event); content_type = 'application/json' } | ConvertTo-Json -Compress
  $attachmentHeader = @{ type = 'attachment'; length = [Text.Encoding]::UTF8.GetByteCount($logText); filename = $logFileName; content_type = 'text/plain' } | ConvertTo-Json -Compress
  $bodyText = $header + "`n" + $eventHeader + "`n" + $event + "`n" + $attachmentHeader + "`n" + $logText
  $body = [Text.Encoding]::UTF8.GetBytes($bodyText)

  Invoke-RestMethod -Uri $endpoint -Method Post -ContentType 'application/x-sentry-envelope' -Body $body -TimeoutSec 10 | Out-Null

  $search = 'event_id:' + $eventId + ' code:' + $Code + ' session:' + $Session
  $issueSearch = 'message:"installer-failure ' + $Code + '" type:installer-failure code:' + $Code
  if ($userId) {
    $issueSearch = $issueSearch + ' user.id:' + $userId
  }
  Write-StatusFile ([ordered]@{
    status = 'sent'
    eventId = $eventId
    code = $Code
    wrapperCode = $wrapperCode
    session = $Session
    release = $Release
    search = $search
    issueSearch = $issueSearch
    userId = $userId
    logPath = $log
    blockingDiagnostics = $blockingDiagnostics
    handleDiagnostics = $handleDiagnostics
    copyText = (New-ReportDetailsText $Code $eventId $issueSearch $userId $Session $blockingDiagnostics)
    at = (Get-Date -Format o)
  })
  Write-InstallerLog 'report-sent' @{ code = $Code; wrapperCode = $wrapperCode; eventId = $eventId; statusPath = $statusPath; search = $search; issueSearch = $issueSearch; userId = $userId }
  $reportDetails = New-ReportDetailsText $Code $eventId $issueSearch $userId $Session $blockingDiagnostics
  Show-ReportMessage ('AionUi installer report sent.' + [Environment]::NewLine + [Environment]::NewLine + 'Tip: If you can get in touch with the AionUi team, press [ Ctrl + C ] in this dialog to copy details, then send them to us via social media, email, or a GitHub issue:' + [Environment]::NewLine + 'https://github.com/iOfficeAI/AionUi/issues' + [Environment]::NewLine + [Environment]::NewLine + $reportDetails) 'Information'
} catch {
  $errorText = $_.Exception.GetType().FullName + ': ' + $_.Exception.Message
  Write-StatusFile ([ordered]@{
    status = 'failed'
    code = $Code
    wrapperCode = $wrapperCode
    session = $Session
    release = $Release
    error = 'report-upload-failed'
    errorType = $_.Exception.GetType().FullName
    errorMessage = $errorText
    logPath = $log
    blockingDiagnostics = $blockingDiagnostics
    handleDiagnostics = $handleDiagnostics
    copyText = (New-ReportDetailsText $Code '' '' $userId $Session $blockingDiagnostics)
    at = (Get-Date -Format o)
  })
  Write-InstallerLog 'report-failed' @{ code = $Code; wrapperCode = $wrapperCode; statusPath = $statusPath; error = $errorText }
  Show-ReportMessage ('AionUi installer report failed.' + [Environment]::NewLine + [Environment]::NewLine + 'Status: ' + $statusPath + [Environment]::NewLine + 'Log: ' + $log) 'Exclamation'
}
