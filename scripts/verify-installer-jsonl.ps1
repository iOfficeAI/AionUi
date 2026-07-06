param(
  [Parameter(Mandatory = $true)]
  [string]$FixturePath,

  [string]$ExpectedCode = 'E1003'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $FixturePath)) {
  throw "Fixture not found: $FixturePath"
}

$events = @(Get-Content -LiteralPath $FixturePath | Where-Object { $_.Trim() } | ForEach-Object {
  try {
    $_ | ConvertFrom-Json
  } catch {
    throw "Invalid JSONL line: $_"
  }
})

$failure = @($events | Where-Object { $_.event -eq 'failure' -and $_.updated -eq $true } | Select-Object -Last 1)[0]
if (-not $failure) {
  $failure = @($events | Where-Object { $_.event -eq 'failure' } | Select-Object -Last 1)[0]
}

if (-not $failure) {
  throw 'No failure event found'
}
if ($failure.code -ne $ExpectedCode) {
  throw "Expected code $ExpectedCode, got $($failure.code)"
}
if (-not $failure.failedPath) {
  throw 'failure.failedPath is missing'
}

$blocking = ''
$processes = @($failure.blockingProcesses)
if ($processes.Count -gt 0) {
  $blocking = @($processes | ForEach-Object {
    if ($_.pid) { "$($_.name)($($_.pid))" } else { [string]$_.name }
  }) -join ', '
}
if (-not $blocking) {
  $blocking = [string]$failure.message
}

if ($blocking -eq 'Windows') {
  throw 'Diagnostics were truncated to "Windows"'
}

Write-Output "rootCode=$($failure.code)"
Write-Output "phase=$($failure.phase)"
Write-Output "failedPath=$($failure.failedPath)"
Write-Output "blocking=$blocking"
