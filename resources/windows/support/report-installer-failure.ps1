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
  $log = Join-Path $env:TEMP 'aionui-installer-fallback.log'
}
$logFileName = Split-Path -Leaf $log
$statusPath = Join-Path $env:TEMP 'aionui-installer-report.json'

function Write-StatusFile($status) {
  $json = $status | ConvertTo-Json -Compress -Depth 5
  [System.IO.File]::WriteAllText($statusPath, $json, (New-Object System.Text.UTF8Encoding $false))
}

function Write-InstallerLog([string]$message) {
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] ' + $message)
}

function Show-ReportMessage([string]$text, [string]$icon) {
  if ($NoUi) {
    return
  }

  try {
    $style = if ($icon -eq 'Information') { 64 } else { 48 }
    $shell = New-Object -ComObject WScript.Shell
    $shell.Popup($text, 60, 'AionUi installer report', $style) | Out-Null
  } catch {
    Add-Type -AssemblyName System.Windows.Forms
    $messageIcon = [System.Windows.Forms.MessageBoxIcon]::$icon
    [System.Windows.Forms.MessageBox]::Show(
      $text,
      'AionUi installer report',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      $messageIcon
    ) | Out-Null
  }
}

if ([string]::IsNullOrWhiteSpace($Dsn)) {
  Write-StatusFile ([ordered]@{
    status = 'skipped'
    reason = 'empty-dsn'
    code = $Code
    session = $Session
    release = $Release
    logPath = $log
    at = (Get-Date -Format o)
  })
  Write-InstallerLog ('event=report-skipped reason=empty-dsn code=' + $Code + ' session=' + $Session + ' statusPath=' + $statusPath)
  exit 0
}

try {
  $uri = [Uri]$Dsn
  $projectId = $uri.AbsolutePath.Trim('/')
  $endpoint = $uri.Scheme + '://' + $uri.Authority + '/api/' + $projectId + '/envelope/'
  $logText = if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Raw } else { '' }
  $eventId = [guid]::NewGuid().ToString('N')
  $event = @{
    message = ('installer-failure ' + $Code)
    level = 'error'
    platform = 'other'
    release = $Release
    tags = @{
      code = $Code
      detail = $Detail
      phase = 'installer'
      arch = $Arch
      session = $Session
      updated = $Updated
    }
    extra = @{
      installerSession = $Session
      installerLogPath = $log
      reportStatusPath = $statusPath
    }
  } | ConvertTo-Json -Compress -Depth 5

  $header = @{ event_id = $eventId; dsn = $Dsn } | ConvertTo-Json -Compress
  $eventHeader = @{ type = 'event'; length = [Text.Encoding]::UTF8.GetByteCount($event); content_type = 'application/json' } | ConvertTo-Json -Compress
  $attachmentHeader = @{ type = 'attachment'; length = [Text.Encoding]::UTF8.GetByteCount($logText); filename = $logFileName; content_type = 'text/plain' } | ConvertTo-Json -Compress
  $body = $header + "`n" + $eventHeader + "`n" + $event + "`n" + $attachmentHeader + "`n" + $logText

  Invoke-RestMethod -Uri $endpoint -Method Post -ContentType 'application/x-sentry-envelope' -Body $body -TimeoutSec 10 | Out-Null

  $search = 'event_id:' + $eventId + ' code:' + $Code + ' session:' + $Session
  Write-StatusFile ([ordered]@{
    status = 'sent'
    eventId = $eventId
    code = $Code
    session = $Session
    release = $Release
    search = $search
    logPath = $log
    at = (Get-Date -Format o)
  })
  Write-InstallerLog ('event=report-sent code=' + $Code + ' session=' + $Session + ' eventId=' + $eventId + ' statusPath=' + $statusPath + ' search=' + $search)
  Show-ReportMessage ('AionUi installer report sent.' + [Environment]::NewLine + [Environment]::NewLine + 'Event ID: ' + $eventId + [Environment]::NewLine + 'Session: ' + $Session + [Environment]::NewLine + [Environment]::NewLine + 'Report status: ' + $statusPath) 'Information'
} catch {
  $errorText = $_.Exception.GetType().FullName + ': ' + $_.Exception.Message
  Write-StatusFile ([ordered]@{
    status = 'failed'
    code = $Code
    session = $Session
    release = $Release
    error = $errorText
    logPath = $log
    at = (Get-Date -Format o)
  })
  Write-InstallerLog ('event=report-failed code=' + $Code + ' session=' + $Session + ' statusPath=' + $statusPath + ' error=' + $errorText)
  Show-ReportMessage ('AionUi installer report failed.' + [Environment]::NewLine + [Environment]::NewLine + 'Status: ' + $statusPath + [Environment]::NewLine + 'Log: ' + $log) 'Exclamation'
}
