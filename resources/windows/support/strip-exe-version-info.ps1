param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath,

  [Parameter(Mandatory = $true)]
  [string]$ResourceHackerPath
)

$ErrorActionPreference = 'Stop'

function Test-PeCertificateTable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $stream = [System.IO.File]::OpenRead($Path)
  $reader = [System.IO.BinaryReader]::new($stream)
  try {
    if ($stream.Length -lt 64) {
      throw "Invalid PE executable (file is too small): $Path"
    }

    if ($reader.ReadUInt16() -ne 0x5A4D) {
      throw "Invalid PE executable (missing MZ header): $Path"
    }

    $stream.Position = 0x3C
    $peOffset = $reader.ReadUInt32()
    if ($peOffset -gt ($stream.Length - 24)) {
      throw "Invalid PE executable (PE header is out of range): $Path"
    }

    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550) {
      throw "Invalid PE executable (missing PE header): $Path"
    }

    $stream.Position = $peOffset + 20
    $optionalHeaderSize = $reader.ReadUInt16()
    $optionalHeaderOffset = $peOffset + 24
    if (($optionalHeaderOffset + $optionalHeaderSize) -gt $stream.Length) {
      throw "Invalid PE executable (optional header is out of range): $Path"
    }

    $stream.Position = $optionalHeaderOffset
    $optionalHeaderMagic = $reader.ReadUInt16()
    if ($optionalHeaderMagic -eq 0x10B) {
      $numberOfDataDirectoriesOffset = 92
      $dataDirectoriesOffset = 96
    } elseif ($optionalHeaderMagic -eq 0x20B) {
      $numberOfDataDirectoriesOffset = 108
      $dataDirectoriesOffset = 112
    } else {
      throw "Invalid PE executable (unsupported optional header): $Path"
    }

    $stream.Position = $optionalHeaderOffset + $numberOfDataDirectoriesOffset
    $numberOfDataDirectories = $reader.ReadUInt32()
    if ($numberOfDataDirectories -lt 5) {
      return $false
    }

    $certificateTableEntryOffset = $optionalHeaderOffset + $dataDirectoriesOffset + (4 * 8)
    if (($certificateTableEntryOffset + 8) -gt ($optionalHeaderOffset + $optionalHeaderSize)) {
      throw "Invalid PE executable (certificate table entry is out of range): $Path"
    }

    $stream.Position = $certificateTableEntryOffset
    $certificateTableFileOffset = $reader.ReadUInt32()
    $certificateTableSize = $reader.ReadUInt32()
    return $certificateTableFileOffset -ne 0 -or $certificateTableSize -ne 0
  } finally {
    $reader.Dispose()
  }
}

$resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
$resolvedResourceHacker = (Resolve-Path -LiteralPath $ResourceHackerPath).Path
$targetDirectory = Split-Path -Parent $resolvedTarget
$temporaryOutput = Join-Path $targetDirectory ('.' + [System.IO.Path]::GetFileName($resolvedTarget) + '.version-info-stripped.exe')

if (Test-PeCertificateTable -Path $resolvedTarget) {
  throw "Refusing to remove VERSIONINFO from an executable with an Authenticode certificate table: $resolvedTarget"
}

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
