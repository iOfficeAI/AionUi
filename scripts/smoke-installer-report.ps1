$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$reportScript = Join-Path $repoRoot 'resources\windows\support\report-installer-failure.ps1'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $env:TEMP "aionui-installer-smoke-$runId-log.jsonl"
$statusPath = Join-Path $env:TEMP 'aionui-installer-report.json'

Remove-Item -LiteralPath $statusPath -Force -ErrorAction SilentlyContinue

@(
  '{"schemaVersion":1,"event":"session-begin","session":"smoke","version":"2.1.28"}'
  '{"schemaVersion":1,"event":"failure","session":"smoke","version":"2.1.28","updated":true,"code":"E1003","phase":"atomic-failed","failedPath":"C:\\Users\\huang\\AppData\\Local\\Programs\\AionUi","blockingProcesses":[],"fallbackReason":"restart-manager-no-process","message":"Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder."}'
) | Set-Content -LiteralPath $logPath -Encoding UTF8

$detail = 'wrapperCode=E1002 old-uninstaller exitCode=2 uninstallerDetail=- Outer installer: previous uninstaller exited with code 2
- Inner failure: E1003 phase atomic-failed
- File or folder: C:\Users\huang\AppData\Local\Programs\AionUi
- Blocking process: Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder.'

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $reportScript `
  -Dsn ' ' `
  -LogPath $logPath `
  -Code 'E1003' `
  -Detail $detail `
  -Release '2.1.28' `
  -Arch 'x64' `
  -Session 'smoke-session' `
  -Updated '1' `
  -NoUi

if ($LASTEXITCODE -ne 0) {
  throw "report-installer-failure.ps1 exited with $LASTEXITCODE"
}

if (-not (Test-Path -LiteralPath $statusPath)) {
  throw "Report status was not written: $statusPath"
}

$status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
if ($status.code -ne 'E1003') {
  throw "Expected code E1003, got $($status.code)"
}
if ($status.wrapperCode -ne 'E1002') {
  throw "Expected wrapperCode E1002, got $($status.wrapperCode)"
}
if ($status.copyText -notlike '*AionUi installer failure E1003*') {
  throw 'copyText does not include failure heading'
}
if ($status.copyText -notlike '*To AionUi Team*') {
  throw 'copyText does not include team footer'
}
if ($status.copyText -like '*Blocking process: Windows`r`n*' -or $status.copyText -like '*Blocking process: Windows`n*') {
  throw 'copyText appears to contain truncated Blocking process text'
}
if ($status.blockingDiagnostics -like '*Blocking process: Windows' -and $status.blockingDiagnostics -notlike '*Windows did not identify*') {
  throw 'blockingDiagnostics appears truncated'
}
if ($null -eq $status.handleDiagnostics) {
  throw 'handleDiagnostics missing from report status'
}
if ($null -eq $status.handleDiagnostics.available) {
  throw 'handleDiagnostics.available missing from report status'
}

$events = @(Get-Content -LiteralPath $logPath | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
if (-not (@($events | Where-Object { $_.event -eq 'report-skipped' }).Count -gt 0)) {
  throw 'report-skipped JSONL event missing'
}

Write-Output "status=$($status.status)"
Write-Output "code=$($status.code)"
Write-Output "wrapperCode=$($status.wrapperCode)"
Write-Output "copyTextLength=$($status.copyText.Length)"
