param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath,

  [Parameter(Mandatory = $true)]
  [string]$ResourceHackerPath
)

$ErrorActionPreference = 'Stop'

$resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
$resolvedResourceHacker = (Resolve-Path -LiteralPath $ResourceHackerPath).Path
$targetDirectory = Split-Path -Parent $resolvedTarget
$temporaryOutput = Join-Path $targetDirectory ('.' + [System.IO.Path]::GetFileName($resolvedTarget) + '.version-info-stripped.exe')

if (Test-Path -LiteralPath $temporaryOutput) {
  [System.IO.File]::Delete($temporaryOutput)
}

try {
  $arguments = @(
    '-open', ('"' + $resolvedTarget + '"'),
    '-save', ('"' + $temporaryOutput + '"'),
    '-action', 'delete',
    '-mask', 'VERSIONINFO,,',
    '-log', 'CONSOLE'
  )

  $startProcessParams = @{
    FilePath = $resolvedResourceHacker
    ArgumentList = $arguments
    Wait = $true
    PassThru = $true
    WindowStyle = 'Hidden'
  }
  $process = Start-Process @startProcessParams

  if ($process.ExitCode -ne 0) {
    throw "Resource Hacker exited with code $($process.ExitCode)"
  }
  if (-not (Test-Path -LiteralPath $temporaryOutput)) {
    throw 'Resource Hacker did not create the stripped executable'
  }

  $versionInfo = (Get-Item -LiteralPath $temporaryOutput).VersionInfo
  $remainingValues = @(
    $versionInfo.CompanyName,
    $versionInfo.FileDescription,
    $versionInfo.FileVersion,
    $versionInfo.InternalName,
    $versionInfo.LegalCopyright,
    $versionInfo.LegalTrademarks,
    $versionInfo.OriginalFilename,
    $versionInfo.ProductName,
    $versionInfo.ProductVersion
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  if ($remainingValues.Count -gt 0) {
    throw "VERSIONINFO removal verification failed: $($remainingValues -join ', ')"
  }

  [System.IO.File]::Copy($temporaryOutput, $resolvedTarget, $true)
  [System.IO.File]::Delete($temporaryOutput)
  Write-Host "Removed VERSIONINFO from $resolvedTarget"
} finally {
  if (Test-Path -LiteralPath $temporaryOutput) {
    [System.IO.File]::Delete($temporaryOutput)
  }
}
