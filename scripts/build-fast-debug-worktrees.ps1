param(
  [string[]]$Versions = @(),
  [string]$SentryDsnFile = '',
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\out-fast-builds'),
  [string]$WorktreeRoot = (Join-Path $PSScriptRoot '..\..\aionui-build-worktrees'),
  [int]$TimeoutSeconds = 1800,
  [switch]$Sequential
)

$ErrorActionPreference = 'Stop'

function Resolve-RepoRoot {
  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}

function Get-PackageVersion([string]$RepoRoot) {
  $packageJsonPath = Join-Path $RepoRoot 'package.json'
  $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
  if (-not $packageJson.version) {
    throw "package.json is missing version: $packageJsonPath"
  }
  return [string]$packageJson.version
}

function Resolve-SentryDsn([string]$Path) {
  if ($env:SENTRY_DSN) {
    Write-Host 'Using SENTRY_DSN from the current environment.'
    return $env:SENTRY_DSN.Trim()
  }

  if ($Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
      throw "SENTRY_DSN file not found: $Path"
    }
    Write-Host "Using SENTRY_DSN from file: $Path"
    return (Get-Content -LiteralPath $Path -Raw).Trim()
  }

  Write-Warning 'SENTRY_DSN is not set. Building without installer/app Sentry reporting.'
  return ''
}

function ConvertTo-ProcessArgument([string]$Value) {
  if ($null -eq $Value) {
    return '""'
  }
  return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Invoke-Git([string]$RepoRoot, [string[]]$GitArgs) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'git'
  $psi.WorkingDirectory = $RepoRoot
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $allArgs = @('-C', $RepoRoot) + $GitArgs
  $psi.Arguments = ($allArgs | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' '

  $process = [System.Diagnostics.Process]::Start($psi)
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $output = ($stdout + $stderr).Trim()
  if ($process.ExitCode -ne 0) {
    throw "git $($GitArgs -join ' ') failed:`n$output"
  }
  return $output
}

function Remove-LongPathTree([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $reparsePoints = @(
    Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } |
      Sort-Object FullName -Descending
  )
  foreach ($item in $reparsePoints) {
    try {
      Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c rmdir "' + $item.FullName + '"') -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
    } catch {
      Write-Warning "Failed to remove reparse point $($item.FullName): $($_.Exception.Message)"
    }
  }

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $longPath = if ($fullPath.StartsWith('\\')) { '\\?\UNC\' + $fullPath.TrimStart('\') } else { '\\?\' + $fullPath }
  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c rmdir /s /q "' + $longPath + '"') -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0 -and (Test-Path -LiteralPath $Path)) {
    throw "cmd rmdir failed with exit code $($process.ExitCode): $Path"
  }
}

function New-BuildCommandFile([string]$WorktreePath, [string]$Version, [string]$Dsn, [string]$LocalAioncoreBinary, [string]$LocalAioncoreBundleDir) {
  $scriptPath = Join-Path $WorktreePath "build-$Version.ps1"
  $dsnBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Dsn))
  $lines = @(
    '$ErrorActionPreference = ''Stop''',
    '$buildTemp = Join-Path $PSScriptRoot ''.tmp''',
    'New-Item -ItemType Directory -Force -Path $buildTemp | Out-Null',
    '$env:TEMP = $buildTemp',
    '$env:TMP = $buildTemp',
    '$env:SENTRY_DSN = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(''' + $dsnBase64 + '''))',
    '$env:AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION = ''' + $Version + '''',
    '$env:ELECTRON_BUILDER_COMPRESSION_LEVEL = ''1''',
    '$env:AIONUI_BACKEND_LOCAL_BINARY = ''' + ($LocalAioncoreBinary -replace "'", "''") + '''',
    '$env:AIONUI_BACKEND_LOCAL_BUNDLE_DIR = ''' + ($LocalAioncoreBundleDir -replace "'", "''") + '''',
    '$env:ELECTRON_CACHE = Join-Path $env:LOCALAPPDATA ''electron\Cache''',
    '& bun run build-win:x64:fast',
    'exit $LASTEXITCODE'
  )
  [System.IO.File]::WriteAllLines($scriptPath, $lines, (New-Object System.Text.UTF8Encoding $false))
  return $scriptPath
}

function Start-BuildProcess([string]$WorktreePath, [string]$Version, [string]$Dsn, [string]$LogDir, [string]$LocalAioncoreBinary, [string]$LocalAioncoreBundleDir) {
  $scriptPath = New-BuildCommandFile $WorktreePath $Version $Dsn $LocalAioncoreBinary $LocalAioncoreBundleDir
  $stdoutPath = Join-Path $LogDir "build-$Version.out.log"
  $stderrPath = Join-Path $LogDir "build-$Version.err.log"
  $process = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath) `
    -WorkingDirectory $WorktreePath `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  return [pscustomobject]@{
    version = $Version
    worktreePath = $WorktreePath
    process = $process
    stdoutPath = $stdoutPath
    stderrPath = $stderrPath
    startedAt = Get-Date
  }
}

function Copy-UntrackedBuildInputs([string]$RepoRoot, [string]$WorktreePath, [string[]]$UntrackedFiles) {
  foreach ($relative in $UntrackedFiles) {
    $normalized = $relative -replace '\\', '/'
    if (-not $normalized.StartsWith('resources/')) { continue }

    $source = Join-Path $RepoRoot $relative
    $target = Join-Path $WorktreePath $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
  }
}

function Wait-BuildProcess($Build, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while (-not $Build.process.HasExited) {
    if ((Get-Date) -gt $deadline) {
      Stop-Process -Id $Build.process.Id -Force -ErrorAction SilentlyContinue
      throw "build $($Build.version) timed out after $TimeoutSeconds seconds. Logs: $($Build.stdoutPath), $($Build.stderrPath)"
    }
    Start-Sleep -Seconds 5
    $Build.process.Refresh()
  }

  $Build.process.WaitForExit()
  $Build.process.Refresh()
  $exitCode = $Build.process.ExitCode
  $source = Join-Path $Build.worktreePath "out\AionUi-$($Build.version)-win-x64.exe"
  if (-not (Test-Path -LiteralPath $source)) {
    $tailParts = @()
    if (Test-Path -LiteralPath $Build.stderrPath) {
      $raw = Get-Content -LiteralPath $Build.stderrPath -Raw -ErrorAction SilentlyContinue
      if ($raw.Length -gt 12000) {
        $tailParts += "stderr tail:`n" + $raw.Substring($raw.Length - 12000)
      } else {
        $tailParts += "stderr tail:`n" + $raw
      }
    }
    if (Test-Path -LiteralPath $Build.stdoutPath) {
      $raw = Get-Content -LiteralPath $Build.stdoutPath -Raw -ErrorAction SilentlyContinue
      if ($raw.Length -gt 12000) {
        $tailParts += "stdout tail:`n" + $raw.Substring($raw.Length - 12000)
      } else {
        $tailParts += "stdout tail:`n" + $raw
      }
    }
    $tail = $tailParts -join "`n`n"
    throw "build $($Build.version) failed with exit code $exitCode and did not produce $source. Logs: $($Build.stdoutPath), $($Build.stderrPath)`n$tail"
  }

  if ($null -ne $exitCode -and $exitCode -ne 0) {
    throw "build $($Build.version) produced an artifact but exited with code $exitCode. Logs: $($Build.stdoutPath), $($Build.stderrPath)"
  }

  $sourceItem = Get-Item -LiteralPath $source
  if ($sourceItem.Length -lt 50MB) {
    throw "build $($Build.version) produced an unexpectedly small installer ($($sourceItem.Length) bytes): $source. Logs: $($Build.stdoutPath), $($Build.stderrPath)"
  }

  $target = Join-Path $script:OutputDirResolved "AionUi-$($Build.version)-win-x64.exe"
  Copy-Item -LiteralPath $source -Destination $target -Force
  $item = Get-Item -LiteralPath $target
  $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA512).Hash
  [pscustomobject]@{
    version = $Build.version
    artifact = $target
    size = $item.Length
    sha512 = $hash
    stdoutLog = $Build.stdoutPath
    stderrLog = $Build.stderrPath
  }
}

$repoRoot = Resolve-RepoRoot
$dsn = Resolve-SentryDsn $SentryDsnFile
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $WorktreeRoot $runId
$patchPath = Join-Path $runRoot 'current-worktree.patch'
$buildVersions = @($Versions | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

if ($buildVersions.Count -eq 0) {
  $buildVersions = @(Get-PackageVersion $repoRoot)
}

New-Item -ItemType Directory -Force -Path $runRoot, $OutputDir | Out-Null
$script:OutputDirResolved = (Resolve-Path -LiteralPath $OutputDir).Path

$untracked = @(git -C $repoRoot ls-files --others --exclude-standard)
$untrackedBuildInputs = @($untracked | Where-Object { ($_ -replace '\\', '/').StartsWith('resources/') })
$untrackedIgnored = @($untracked | Where-Object { -not (($_ -replace '\\', '/').StartsWith('resources/')) })
if ($untrackedBuildInputs.Count -gt 0) {
  Write-Warning "Copying untracked build inputs into worktrees: $($untrackedBuildInputs -join ', ')"
}
if ($untrackedIgnored.Count -gt 0) {
  Write-Warning "Untracked files are not copied into build worktrees: $($untrackedIgnored -join ', ')"
}

Invoke-Git $repoRoot @('diff', '--binary', 'HEAD', "--output=$patchPath") | Out-Null
$hasPatch = (Get-Item -LiteralPath $patchPath).Length -gt 0
$baseRef = (Invoke-Git $repoRoot @('rev-parse', 'HEAD')).Trim()
$nodeModules = Join-Path $repoRoot 'node_modules'
$localAioncoreBinary = Join-Path $repoRoot 'resources\bundled-aioncore\win32-x64\aioncore.exe'
$localAioncoreBundleDir = Join-Path $repoRoot 'out\win-unpacked\resources\bundled-aioncore\win32-x64'
if (-not (Test-Path -LiteralPath (Join-Path $localAioncoreBundleDir 'managed-resources') -PathType Container)) {
  $localAioncoreBundleDir = Join-Path $env:LOCALAPPDATA 'Programs\AionUi\resources\bundled-aioncore\win32-x64'
}
if (Test-Path -LiteralPath (Join-Path $localAioncoreBundleDir 'managed-resources') -PathType Container) {
  $localAioncoreBundleDir = (Resolve-Path -LiteralPath $localAioncoreBundleDir).Path
  Write-Host "=== using local aioncore bundle fallback: $localAioncoreBundleDir ==="
} else {
  $localAioncoreBundleDir = ''
  Write-Warning 'Local aioncore bundle fallback was not found; builds may need to prepare managed resources.'
}
if (Test-Path -LiteralPath $localAioncoreBinary -PathType Leaf) {
  $localAioncoreBinary = (Resolve-Path -LiteralPath $localAioncoreBinary).Path
  Write-Host "=== using local aioncore fallback: $localAioncoreBinary ==="
} else {
  $localAioncoreBinary = ''
  Write-Warning 'Local aioncore fallback was not found; builds may need to download aioncore.'
}
$worktrees = @()
$builds = @()
$results = @()
$completed = $false

try {
  foreach ($version in $buildVersions) {
    $worktreePath = Join-Path $runRoot "AionUi-$version"
    $worktrees += $worktreePath
    Write-Host "=== prepare worktree ${version}: $worktreePath ==="
    Invoke-Git $repoRoot @('worktree', 'add', '--detach', $worktreePath, $baseRef) | Out-Null

    if ($hasPatch) {
      Invoke-Git $worktreePath @('apply', '--whitespace=nowarn', $patchPath) | Out-Null
    }
    Copy-UntrackedBuildInputs $repoRoot $worktreePath $untrackedBuildInputs

    if ((Test-Path -LiteralPath $nodeModules) -and -not (Test-Path -LiteralPath (Join-Path $worktreePath 'node_modules'))) {
      New-Item -ItemType Junction -Path (Join-Path $worktreePath 'node_modules') -Target $nodeModules | Out-Null
    }
  }

  foreach ($version in $buildVersions) {
    $worktreePath = Join-Path $runRoot "AionUi-$version"
    Write-Host "=== build $version start: $(Get-Date -Format o) ==="
    $build = Start-BuildProcess $worktreePath $version $dsn $runRoot $localAioncoreBinary $localAioncoreBundleDir
    if ($Sequential) {
      $result = Wait-BuildProcess $build $TimeoutSeconds
      $results += $result
      Write-Host "=== build $version done: $(Get-Date -Format o) size=$($result.size) sha512=$($result.sha512) ==="
    } else {
      $builds += $build
    }
  }

  if (-not $Sequential) {
    foreach ($build in $builds) {
      $result = Wait-BuildProcess $build $TimeoutSeconds
      $results += $result
      Write-Host "=== build $($build.version) done: $(Get-Date -Format o) size=$($result.size) sha512=$($result.sha512) ==="
    }
  }

  $results
  $completed = $true
} finally {
  foreach ($build in $builds) {
    if ($build.process -and -not $build.process.HasExited) {
      Stop-Process -Id $build.process.Id -Force -ErrorAction SilentlyContinue
    }
  }

  if ($completed) {
    foreach ($worktreePath in $worktrees) {
      try {
        Invoke-Git $repoRoot @('worktree', 'remove', '--force', $worktreePath) | Out-Null
      } catch {
        Write-Warning "git worktree remove failed for $worktreePath; removing directory with long-path fallback. $($_.Exception.Message)"
        try {
          Remove-LongPathTree $worktreePath
        } catch {
          Write-Warning "long-path fallback cleanup failed for $worktreePath. $($_.Exception.Message)"
        }
        try {
          Invoke-Git $repoRoot @('worktree', 'prune') | Out-Null
        } catch {
          Write-Warning "git worktree prune failed. $($_.Exception.Message)"
        }
      }
    }

    try {
      Remove-LongPathTree $runRoot
    } catch {
      Write-Warning "run root cleanup failed for $runRoot. $($_.Exception.Message)"
    }
  } else {
    Write-Warning "Build failed; preserving worktrees and logs under $runRoot"
  }
}
