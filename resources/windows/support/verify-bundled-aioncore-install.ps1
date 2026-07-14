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

function Get-CodexPlatformExecutable {
  param([string]$RuntimeKey)

  $vendorTriple = switch ($RuntimeKey) {
    "win32-x64" { "x86_64-pc-windows-msvc" }
    "win32-arm64" { "aarch64-pc-windows-msvc" }
    default { "" }
  }

  if (-not $vendorTriple) {
    return ""
  }

  return "node_modules\@openai\codex-$RuntimeKey\vendor\$vendorTriple\bin\codex.exe"
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
  Test-Directory $failures 'managed-resources' '' $managedRoot | Out-Null

  $nodeRoot = Join-Path $managedRoot 'node'
  if (Test-Directory $failures 'node' '' $nodeRoot) {
    $nodeVersions = @(Get-ChildItem -LiteralPath $nodeRoot -Directory)
    if ($nodeVersions.Count -eq 0) {
      $failures.Add((New-Failure 'publish_or_install_missing' 'node' '<version>' $nodeRoot 'missing_version_directory')) | Out-Null
    }
    foreach ($nodeVersion in $nodeVersions) {
      Test-NonEmptyFile $failures 'node' $nodeVersion.Name (Join-Path $nodeVersion.FullName 'node.exe') $true $nodeVersion.FullName | Out-Null
    }
  }

  $acpRoot = Join-Path $managedRoot 'acp'
  $tools = @(
    @{
      id = 'codex-acp'
      executable = (Get-CodexPlatformExecutable $RuntimeKey)
    },
    @{
      id = 'claude-agent-acp'
      executable = "node_modules\@anthropic-ai\claude-agent-sdk-$RuntimeKey\claude.exe"
    }
  )

  foreach ($tool in $tools) {
    $toolId = $tool.id
    $toolRoot = Join-Path $acpRoot $toolId
    if (-not (Test-Directory $failures $toolId '' $toolRoot)) {
      continue
    }

    $versions = @(Get-ChildItem -LiteralPath $toolRoot -Directory)
    if ($versions.Count -eq 0) {
      $failures.Add((New-Failure 'publish_or_install_missing' $toolId '<version>' $toolRoot 'missing_version_directory')) | Out-Null
      continue
    }

    foreach ($version in $versions) {
      $platformRoot = Join-Path $version.FullName $RuntimeKey
      if (-not (Test-Directory $failures $toolId $version.Name $platformRoot)) {
        continue
      }

      $manifestPath = Join-Path $platformRoot 'manifest.json'
      if (Test-NonEmptyFile $failures $toolId $version.Name $manifestPath $false $platformRoot) {
        $manifest = Read-JsonFile $manifestPath
        if (-not $manifest) {
          $failures.Add((New-Failure 'publish_or_install_missing' $toolId $version.Name $manifestPath 'invalid_json')) | Out-Null
        } elseif (-not $manifest.entrypoint) {
          $failures.Add((New-Failure 'publish_or_install_missing' $toolId $version.Name $manifestPath 'missing_entrypoint')) | Out-Null
        } else {
          Test-NonEmptyFile $failures $toolId $version.Name (Join-Path $platformRoot $manifest.entrypoint) $false $platformRoot | Out-Null
        }
      }

      Test-NonEmptyFile $failures $toolId $version.Name (Join-Path $platformRoot 'package.json') $false $platformRoot | Out-Null
      Test-NonEmptyFile $failures $toolId $version.Name (Join-Path $platformRoot 'package-lock.json') $false $platformRoot | Out-Null
      Test-Directory $failures $toolId $version.Name (Join-Path $platformRoot 'node_modules') | Out-Null
      Test-NonEmptyFile $failures $toolId $version.Name (Join-Path $platformRoot $tool.executable) $true $platformRoot | Out-Null
    }
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
