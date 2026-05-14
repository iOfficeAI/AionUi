#
# build-win.ps1 — 在 Windows 系统上打包 Windows 安装包
#
# 用法 (PowerShell):
#   .\build-win.ps1                    # 默认 x64
#   .\build-win.ps1 -Arch x64          # 显式指定 x64
#   .\build-win.ps1 -Arch arm64        # ARM64
#   .\build-win.ps1 -SkipVite          # 跳过 Vite 编译（增量构建）
#   .\build-win.ps1 -SkipNative        # 跳过原生模块重建
#
# 前置条件:
#   - Node.js >= 18
#   - bun
#   - Visual Studio Build Tools 2022 (用于编译原生模块)
#     安装: choco install visualstudio2022buildtools
#            choco install visualstudio2022-workload-vctools
#

[CmdletBinding()]
param(
    [ValidateSet("x64", "arm64")]
    [string]$Arch = "x64",

    [switch]$SkipVite,

    [switch]$SkipNative
)

$ErrorActionPreference = "Stop"

# --- 控制台编码 ─────────────────────────────────────────────
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 >$null 2>&1

# --- 颜色输出 ───────────────────────────────────────────────
function Write-Info($msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Blue }
function Write-Ok($msg)    { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# --- 项目根目录 ─────────────────────────────────────────────
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

# --- 1. 环境检查 ───────────────────────────────────────────
Write-Info "构建环境检查..."
Write-Info "目标架构: win32-$Arch"
Write-Info "平台: $([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)"

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Err "未找到 bun，请先安装: powershell -c `"irm bun.sh/install.ps1 | iex`""
    exit 1
}
Write-Ok "bun: $(bun --version)"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "未找到 node"
    exit 1
}
Write-Ok "node: $(node --version)"

if (-not $SkipNative) {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-Warn "未找到 python，原生模块重建可能失败"
        Write-Warn "  安装: https://www.python.org/downloads/"
        Write-Warn "  或跳过: .\build-win.ps1 -SkipNative"
    } else {
        Write-Ok "python: $(python --version 2>&1)"
    }
}

# --- 2. 原生模块重建 ───────────────────────────────────────
if (-not $SkipNative) {
    Write-Info "重建原生模块 (Electron $Arch)..."

    $pkg = Get-Content "$ProjectRoot/package.json" -Raw | ConvertFrom-Json
    $ElectronVer = $pkg.devDependencies.electron -replace '[\^~]', ''
    Write-Info "Electron 版本: $ElectronVer"

    # 设置 node-gyp 编译环境
    $env:npm_config_runtime = "electron"
    $env:npm_config_arch = $Arch
    $env:npm_config_target_arch = $Arch
    $env:npm_config_disturl = "https://electronjs.org/headers"

    # 策略: 先 prebuild-install（快），失败则 electron-rebuild
    Write-Info "尝试 prebuild-install..."
    $SqliteNode = "node_modules/better-sqlite3/build/Release/better_sqlite3.node"

    $prebuildOk = $false
    try {
        & npx prebuild-install --runtime=electron --target="$ElectronVer" --platform=win32 --arch="$Arch" --force 2>$null
        if ($LASTEXITCODE -eq 0) {
            $prebuildOk = $true
        }
    } catch {
        $prebuildOk = $false
    }

    if ($prebuildOk) {
        Write-Ok "prebuild-install 成功"
    } else {
        Write-Warn "prebuild-install 失败，尝试 electron-rebuild..."
        & npx electron-rebuild -f -w better-sqlite3
        if ($LASTEXITCODE -ne 0) {
            Write-Err "electron-rebuild 失败"
            exit 1
        }
    }

    # 验证关键原生模块
    Write-Info "验证原生模块..."
    if (Test-Path $SqliteNode) {
        $size = (Get-Item $SqliteNode).Length
        Write-Ok "better-sqlite3: $([math]::Round($size / 1024)) KB"
    } else {
        Write-Err "better-sqlite3 原生模块未找到"
        Write-Err "请确认已安装 Visual Studio Build Tools 2022"
        Write-Err "  choco install visualstudio2022buildtools visualstudio2022-workload-vctools"
        exit 1
    }

    $PtyPrebuildDir = "node_modules/node-pty/prebuilds/win32-$Arch"
    if (Test-Path $PtyPrebuildDir) {
        Write-Ok "node-pty: win32-$Arch prebuild 已就绪"
    } else {
        Write-Warn "node-pty: win32-$Arch prebuild 不存在，尝试下载..."
        try {
            Push-Location "node_modules/node-pty"
            & npx prebuild-install --runtime=electron --target="$ElectronVer" --platform=win32 --arch="$Arch" --force 2>$null
            Pop-Location
        } catch {
            Write-Warn "node-pty prebuild 下载失败"
            Pop-Location
        }
    }

    Write-Ok "原生模块验证完成"
}

# --- 3. 执行构建 ───────────────────────────────────────────
Write-Info "开始构建 Windows 安装包 (win32-$Arch)..."

$BuildArgs = @("auto", "--win", "--$Arch")

if ($SkipVite) {
    $BuildArgs += "--skip-vite"
}
if ($SkipNative) {
    $BuildArgs += "--skip-native"
}

Write-Info "构建命令: node scripts/build-with-builder.js $($BuildArgs -join ' ')"

# 压缩级别: 本地构建用 7（平衡速度与大小）
if (-not $env:ELECTRON_BUILDER_COMPRESSION_LEVEL) {
    $env:ELECTRON_BUILDER_COMPRESSION_LEVEL = "7"
}

# 禁用代码签名（本地开发构建无需签名）
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

Write-Info "压缩级别: $env:ELECTRON_BUILDER_COMPRESSION_LEVEL"
Write-Info "代码签名: 已禁用"

& node scripts/build-with-builder.js @BuildArgs
if ($LASTEXITCODE -ne 0) {
    Write-Err "构建失败"
    exit 1
}

# --- 4. 验证输出 ───────────────────────────────────────────
Write-Info "验证构建产物..."

$Found = $false
$artifacts = Get-ChildItem -Path "out" -Filter "*-win-*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in ".exe", ".zip" }

foreach ($f in $artifacts) {
    $sizeMB = [math]::Round($f.Length / 1MB, 1)
    $sizeStr = "$sizeMB MB"
    Write-Ok "$($f.Name)  ($sizeStr)"
    $Found = $true
}

if ($Found) {
    Write-Host ""
    Write-Ok "=================================================="
    Write-Ok "  Windows 安装包构建完成！"
    Write-Ok "  产物目录: $ProjectRoot\out\"
    Write-Ok ""
    Write-Ok "  注意："
    Write-Ok "    - 安装包未签名，Windows 可能提示 SmartScreen 警告"
    Write-Ok "    - 如需签名，请设置环境变量 CSC_LINK 和 CSC_KEY_PASSWORD"
    Write-Ok "=================================================="
} else {
    Write-Err "未找到 Windows 安装包产物，请检查上方日志"
    exit 1
}
