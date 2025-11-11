<#
.SYNOPSIS
  Ensure Windows dev prerequisites (Python + VS Build Tools) for AionUi.
  为 AionUi 自动安装/检测 Windows 依赖（Python + VS Build Tools）。
.DESCRIPTION
  - Detects winget availability / 检查是否可用 winget
  - Installs/updates Python 3.11 and Visual Studio Build Tools with C++ workload
    安装/更新 Python 3.11 与 VS Build Tools (含 C++ 工作负载)
  - Configures npm's python path for node-gyp / 配置 npm 的 python 路径
  - Optionally runs `npm install` / 可选执行 `npm install`
#>

param(
  [switch]$SkipNpmInstall
)

function Assert-Admin {
  # Ensure elevated PowerShell because winget installations require admin
  # 确保以管理员身份运行 PowerShell，winget 安装需要管理员权限
  if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Error 'Please run this script in an elevated PowerShell session (Run as administrator).'
    exit 1
  }
}

function Assert-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error 'winget is required but not found. Install the App Installer package from Microsoft Store and retry.'
    exit 1
  }
}

function Ensure-Python {
  # Reuse existing python if available / 如果已有 python 则复用
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    Write-Host "Python detected at $($pythonCmd.Source)"
    return $pythonCmd.Source
  }
  Write-Host 'Installing Python 3.11 via winget...'
  winget install -e --id Python.Python.3.11 --source winget -h 0
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonCmd) {
    Write-Error 'Python installation failed. Please install Python manually and rerun.'
    exit 1
  }
  return $pythonCmd.Source
}

function Ensure-VSBuildTools {
  $isInstalled = winget list --id Microsoft.VisualStudio.2022.BuildTools -q | Select-String 'BuildTools'
  if ($isInstalled) {
    Write-Host 'Visual Studio Build Tools already installed.'
    return
  }
  Write-Host 'Installing Visual Studio Build Tools (C++ workload)... this may take a while.'
  winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart" --source winget
}

function Configure-NpmPython($pythonPath) {
  # Let node-gyp know where Python lives / 告诉 node-gyp Python 的路径
  Write-Host "Configuring npm to use Python at $pythonPath"
  npm config set python "$pythonPath" | Out-Null
}

Assert-Admin
Assert-Winget
$pythonPath = Ensure-Python
Ensure-VSBuildTools
Configure-NpmPython -pythonPath $pythonPath

if (-not $SkipNpmInstall) {
  if (Test-Path package-lock.json -or Test-Path package.json) {
    Write-Host 'Running npm install...'
    npm install
  } else {
    Write-Warning 'package.json not found in current directory. Skipping npm install.'
  }
}

Write-Host "Environment ready. You can now run 'npm start' or 'npm run webui'."
