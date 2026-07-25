param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [Parameter(Mandatory = $true)]
  [ValidateSet('win32-x64', 'win32-arm64')]
  [string]$RuntimeKey,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = 'SilentlyContinue'

function Write-VerifyLog {
  param([string]$Message)
  $payload = [ordered]@{
    schemaVersion = 1
    ts = (Get-Date -Format o)
    session = ''
    version = ''
    arch = $RuntimeKey
    updated = $false
    instDir = $InstallDir
    event = 'verify-bundled-aioncore'
    message = $Message
  }
  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ($payload | ConvertTo-Json -Compress -Depth 8)
}

function ConvertTo-RelativeResourcePath {
  param([string]$Path)
  $resourcesRoot = Join-Path $InstallDir 'resources'
  if ($Path.StartsWith($resourcesRoot, [System.StringComparison]::CurrentCultureIgnoreCase)) {
    return $Path.Substring($resourcesRoot.Length).TrimStart('\').Replace('\', '/')
  }
  return $Path.Replace('\', '/')
}

function New-Failure {
  param(
    [string]$Category,
    [string]$Component,
    [string]$Version,
    [string]$Path,
    [string]$Reason
  )

  [PSCustomObject]@{
    category  = $Category
    component = $Component
    version   = $Version
    platform  = $RuntimeKey
    path      = ConvertTo-RelativeResourcePath $Path
    reason    = $Reason
  }
}

function Test-NonEmptyFile {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Component,
    [string]$Version,
    [string]$Path,
    [bool]$Executable = $false,
    [string]$ComponentRoot = ''
  )

  $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $item -or $item.PSIsContainer) {
    $category = 'publish_or_install_missing'
    if ($Executable -and $ComponentRoot -and (Test-Path -LiteralPath $ComponentRoot)) {
      $category = 'possible_security_quarantine'
    }
    $Failures.Add((New-Failure $category $Component $Version $Path 'missing_file')) | Out-Null
    return $false
  }

  if ($item.Length -le 0) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'empty_file')) | Out-Null
    return $false
  }

  return $true
}

function Test-Directory {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Component,
    [string]$Version,
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'missing_directory')) | Out-Null
    return $false
  }

  return $true
}

function Read-JsonFile {
  param([string]$Path)
  try {
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-ContractRelativePath {
  param([object]$Value)
  if (-not ($Value -is [string]) -or -not $Value) {
    return $false
  }
  if ($Value.Contains('\') -or [System.IO.Path]::IsPathRooted($Value)) {
    return $false
  }
  foreach ($segment in $Value.Split('/')) {
    if (-not $segment -or $segment -eq '.' -or $segment -eq '..') {
      return $false
    }
  }
  return $true
}

function Join-ContractPath {
  param(
    [string]$Root,
    [string]$RelativePath
  )
  $current = $Root
  foreach ($segment in $RelativePath.Split('/')) {
    $current = Join-Path $current $segment
  }
  return $current
}

function Read-ManagedResourcesContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManifestPath
  )

  if (-not (Test-NonEmptyFile $Failures 'managed-resources' '' $ManifestPath $false (Split-Path -Parent $ManifestPath))) {
    return $null
  }

  $contract = Read-JsonFile $ManifestPath
  if (-not $contract) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManifestPath 'invalid_json')) | Out-Null
    return $null
  }
  return $contract
}

function Test-StringField {
  param(
    [object]$Object,
    [string]$Name
  )
  $value = $Object.$Name
  return ($value -is [string]) -and $value.Length -gt 0
}

function Test-StringArrayField {
  param(
    [object]$Object,
    [string]$Name
  )
  $value = $Object.$Name
  if ($null -eq $value -or $value -is [string]) {
    return $false
  }
  foreach ($entry in @($value)) {
    if (-not ($entry -is [string]) -or -not $entry) {
      return $false
    }
  }
  return $true
}

function Test-NumberField {
  param(
    [object]$Object,
    [string]$Name
  )
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $false
  }

  $value = $property.Value
  if ($null -eq $value -or $value -is [string] -or $value -is [bool]) {
    return $false
  }

  return ($value -is [byte]) -or
    ($value -is [sbyte]) -or
    ($value -is [int16]) -or
    ($value -is [uint16]) -or
    ($value -is [int]) -or
    ($value -is [uint32]) -or
    ($value -is [long]) -or
    ($value -is [uint64]) -or
    ($value -is [single]) -or
    ($value -is [double]) -or
    ($value -is [decimal])
}

function Test-ManagedNodeContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Node
  )

  if (-not $Node -or -not (Test-StringField $Node 'version') -or -not (Test-StringField $Node 'root') -or -not (Test-StringField $Node 'executable')) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'node' '' $ManagedRoot 'invalid_schema')) | Out-Null
    return
  }
  if (-not (Test-ContractRelativePath $Node.root) -or -not (Test-ContractRelativePath $Node.executable)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'node' $Node.version $ManagedRoot 'invalid_contract_path')) | Out-Null
    return
  }

  $nodeRoot = Join-ContractPath $ManagedRoot $Node.root
  Test-NonEmptyFile $Failures 'node' $Node.version (Join-ContractPath $nodeRoot $Node.executable) $true $nodeRoot | Out-Null
}

function Test-ManagedCliContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Cli
  )

  $name = $Cli.name
  foreach ($field in @('name', 'version', 'root', 'platformDirectory', 'executable')) {
    if (-not (Test-StringField $Cli $field)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $name '' $ManagedRoot 'invalid_schema')) | Out-Null
      return
    }
  }
  if ($Cli.platformDirectory -ne $RuntimeKey) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $name $Cli.version $ManagedRoot 'runtime_key_mismatch')) | Out-Null
    return
  }

  # requiredFiles / requiredDirectories default to empty (claude has none; codex
  # lists its vendor sidecar subtree). Absent is allowed.
  $requiredFiles = @($Cli.requiredFiles)
  $requiredDirectories = @($Cli.requiredDirectories)
  foreach ($pathValue in @($Cli.root, $Cli.executable) + $requiredFiles + $requiredDirectories) {
    if (-not (Test-ContractRelativePath $pathValue)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $name $Cli.version $ManagedRoot 'invalid_contract_path')) | Out-Null
      return
    }
  }

  $cliRoot = Join-ContractPath $ManagedRoot $Cli.root
  Test-NonEmptyFile $Failures $name $Cli.version (Join-ContractPath $cliRoot $Cli.executable) $true $cliRoot | Out-Null
  foreach ($requiredFile in $requiredFiles) {
    Test-NonEmptyFile $Failures $name $Cli.version (Join-ContractPath $cliRoot $requiredFile) $false $cliRoot | Out-Null
  }
  foreach ($requiredDirectory in $requiredDirectories) {
    Test-Directory $Failures $name $Cli.version (Join-ContractPath $cliRoot $requiredDirectory) | Out-Null
  }
}

function Test-ManagedClisContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Contract
  )

  if ($null -eq $Contract.clis -or $Contract.clis -is [string]) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManagedRoot 'invalid_schema')) | Out-Null
    return
  }

  $seen = @{}
  $validClis = @()
  foreach ($cli in @($Contract.clis)) {
    if (-not $cli -or -not (Test-StringField $cli 'name')) {
      $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManagedRoot 'invalid_schema')) | Out-Null
      continue
    }
    if ($seen.ContainsKey($cli.name)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $cli.name $cli.version $ManagedRoot 'duplicate_cli_name')) | Out-Null
      continue
    }
    $seen[$cli.name] = $true
    $validClis += $cli
  }

  foreach ($requiredName in @('claude', 'codex')) {
    if (-not $seen.ContainsKey($requiredName)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $requiredName '' $ManagedRoot 'missing_required_cli')) | Out-Null
    }
  }

  foreach ($cli in $validClis) {
    Test-ManagedCliContract $Failures $ManagedRoot $cli
  }
}

function Test-ManagedResourcesContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot
  )

  $contractPath = Join-Path $managedRoot 'manifest.json'
  $contract = Read-ManagedResourcesContract $Failures $contractPath
  if (-not $contract) {
    return
  }

  if (-not (Test-NumberField $contract 'schemaVersion')) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $contractPath 'invalid_schema')) | Out-Null
    return
  }
  if ([double]$contract.schemaVersion -ne 2) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $contractPath 'unsupported_schema_version')) | Out-Null
    return
  }
  if ($contract.runtimeKey -ne $RuntimeKey) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $contractPath 'runtime_key_mismatch')) | Out-Null
    return
  }

  Test-ManagedNodeContract $Failures $ManagedRoot $contract.node
  Test-ManagedClisContract $Failures $ManagedRoot $contract
}

function Test-BundledResourcesOnce {
  $failures = [System.Collections.Generic.List[object]]::new()
  $runtimeParts = $RuntimeKey.Split('-', 2)
  $expectedPlatform = $runtimeParts[0]
  $expectedArch = $runtimeParts[1]
  $resourcesDir = Join-Path $InstallDir 'resources'
  $baseDir = Join-Path $resourcesDir "bundled-aioncore\$RuntimeKey"

  if (-not (Test-Directory $failures 'aioncore' '' $baseDir)) {
    return $failures
  }

  Test-NonEmptyFile $failures 'aioncore' '' (Join-Path $baseDir 'aioncore.exe') $true $baseDir | Out-Null

  $bundleManifestPath = Join-Path $baseDir 'manifest.json'
  if (Test-NonEmptyFile $failures 'aioncore-manifest' '' $bundleManifestPath $false $baseDir) {
    $bundleManifest = Read-JsonFile $bundleManifestPath
    if (-not $bundleManifest) {
      $failures.Add((New-Failure 'publish_or_install_missing' 'aioncore-manifest' '' $bundleManifestPath 'invalid_json')) | Out-Null
    } else {
      if ($bundleManifest.platform -ne $expectedPlatform) {
        $failures.Add((New-Failure 'publish_or_install_missing' 'aioncore-manifest' '' $bundleManifestPath "platform_mismatch:$($bundleManifest.platform)")) | Out-Null
      }
      if ($bundleManifest.arch -ne $expectedArch) {
        $failures.Add((New-Failure 'publish_or_install_missing' 'aioncore-manifest' '' $bundleManifestPath "arch_mismatch:$($bundleManifest.arch)")) | Out-Null
      }
    }
  }

  $managedRoot = Join-Path $baseDir 'managed-resources'
  if (Test-Directory $failures 'managed-resources' '' $managedRoot) {
    Test-ManagedResourcesContract $failures $managedRoot
  }

  return $failures
}

for ($attempt = 1; $attempt -le 5; $attempt++) {
  $failures = @(Test-BundledResourcesOnce)
  if ($failures.Count -eq 0) {
    Write-VerifyLog "verify-bundled-aioncore result=ok runtime=$RuntimeKey attempts=$attempt"
    exit 0
  }

  $summary = ($failures | ConvertTo-Json -Compress -Depth 5)
  if ($attempt -lt 5) {
    Write-VerifyLog "verify-bundled-aioncore result=retry classification=resource_pending_landing runtime=$RuntimeKey attempt=$attempt failures=$summary"
    Start-Sleep -Milliseconds 500
  } else {
    Write-VerifyLog "verify-bundled-aioncore result=fail runtime=$RuntimeKey failures=$summary"
  }
}

exit 1
