# AionUI Development Justfile
# Usage: just <recipe>

# Use PowerShell on all platforms for consistency
set shell := ["pwsh", "-NoProfile", "-Command"]

# Default recipe: show available commands
default:
    @just --list --unsorted

# ============================================================
# Development
# ============================================================

# Start development server (Electron + Vite HMR)
dev:
    bun run start

# Start WebUI development mode
webui:
    bun run webui

# Start WebUI with remote access
webui-remote:
    bun run webui:remote

# Start WebUI production mode
webui-prod:
    bun run webui:prod

# Run CLI mode
cli:
    bun run cli

# ============================================================
# Environment Checks (from CI experience)
# ============================================================

# Check all build prerequisites are met
[no-exit-message]
preflight:
    $ErrorActionPreference = 'Continue'; \
    $failed = $false; \
    Write-Host "=========================================="; \
    Write-Host "  AionUI Build Preflight Check"; \
    Write-Host "=========================================="; \
    Write-Host ""; \
    Write-Host "[1/6] Node.js..."; \
    try { \
        $nodeVer = (node --version 2>&1).Trim(); \
        $major = [int]($nodeVer -replace '^v','').Split('.')[0]; \
        if ($major -ge 22) { Write-Host "  OK  Node.js $nodeVer" } \
        else { Write-Host "  WARN  Node.js $nodeVer (recommend >= 22)" } \
    } catch { Write-Host "  FAIL  Node.js not found"; $failed = $true }; \
    Write-Host "[2/6] bun..."; \
    try { \
        $bunVer = (bun --version 2>&1).Trim(); \
        Write-Host "  OK  bun $bunVer" \
    } catch { Write-Host "  FAIL  bun not found"; $failed = $true }; \
    Write-Host "[3/6] Python (for native modules)..."; \
    try { \
        $pyVer = (python --version 2>&1).Trim(); \
        Write-Host "  OK  $pyVer" \
    } catch { Write-Host "  WARN  Python not found (needed for native module compilation)" }; \
    Write-Host "[4/6] Dependencies (node_modules)..."; \
    if ((Test-Path "node_modules") -and ((Test-Path "bun.lock") -or (Test-Path "package-lock.json"))) { \
        Write-Host "  OK  node_modules exists" \
    } else { \
        Write-Host "  WARN  node_modules missing - running: just install"; \
        just install; \
        if (Test-Path "node_modules") { Write-Host "  OK  node_modules installed" } \
        else { Write-Host "  FAIL  Failed to install dependencies"; $failed = $true } \
    }; \
    Write-Host "[5/6] Native modules (better-sqlite3)..."; \
    $nativeOk = (Test-Path "node_modules/better-sqlite3/build/Release/better_sqlite3.node") -or (Test-Path "node_modules/better-sqlite3/prebuilds"); \
    if ($nativeOk) { Write-Host "  OK  better-sqlite3 native module found" } \
    else { Write-Host "  WARN  better-sqlite3 native binary missing - run: just rebuild-native" }; \
    Write-Host "[6/6] Electron version..."; \
    try { \
        $electronVer = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
        Write-Host "  OK  Electron $electronVer" \
    } catch { Write-Host "  FAIL  Cannot read Electron version"; $failed = $true }; \
    Write-Host ""; \
    Write-Host "=========================================="; \
    if ($failed) { Write-Host "  PREFLIGHT FAILED"; exit 1 } \
    else { Write-Host "  PREFLIGHT PASSED" }; \
    Write-Host "=========================================="

# Show current build environment info
info:
    Write-Host "AionUI Build Environment"; \
    Write-Host "========================"; \
    Write-Host "Node:     $((node --version 2>&1).Trim())"; \
    Write-Host "bun:      $((bun --version 2>&1).Trim())"; \
    $electronVer = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    $appVer = (node -p "require('./package.json').version" 2>&1).Trim(); \
    Write-Host "App:      v$appVer"; \
    Write-Host "Electron: $electronVer"; \
    Write-Host "Branch:   $((git branch --show-current 2>&1).Trim())"; \
    Write-Host "Commit:   $((git rev-parse --short HEAD 2>&1).Trim())"

# ============================================================
# Dependencies & Native Modules
# ============================================================

# Install dependencies (clean install)
install:
    bun install

# Install dependencies (with lockfile update)
install-update:
    bun install

# Full setup: install deps + rebuild native modules
setup: install rebuild-native

# Rebuild native modules for Electron (critical step!)
# On Windows, ensure MSVC build tools are installed via:
#   choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"
# or install Visual Studio 2022 with "Desktop development with C++" workload.
[no-exit-message]
rebuild-native:
    $ErrorActionPreference = 'Stop'; \
    $electronVer = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    Write-Host "=========================================="; \
    Write-Host "Rebuilding native modules for Electron $electronVer"; \
    Write-Host "=========================================="; \
    Write-Host ""; \
    Write-Host "[Step 1] electron-rebuild..."; \
    bunx electron-rebuild -f -w better-sqlite3; \
    Write-Host "  OK  electron-rebuild completed"; \
    Write-Host ""; \
    Write-Host "[Verify] Checking native modules..."; \
    $verified = $true; \
    $sqliteNode = "node_modules/better-sqlite3/build/Release/better_sqlite3.node"; \
    if (Test-Path $sqliteNode) { \
        $size = [math]::Round((Get-Item $sqliteNode).Length / 1MB, 1); \
        Write-Host "  OK  better-sqlite3 ($size MB)" \
    } elseif (Test-Path "node_modules/better-sqlite3/prebuilds") { \
        Write-Host "  OK  better-sqlite3 (prebuilds)" \
    } else { \
        Write-Host "  FAIL  better-sqlite3 native module not found"; \
        $verified = $false \
    }; \
    Write-Host ""; \
    if ($verified) { \
        Write-Host "  All native modules verified" \
    } else { \
        Write-Host "  NATIVE MODULE VERIFICATION FAILED"; \
        exit 1 \
    }

# Verify native modules can actually be loaded by Node.js
[no-exit-message]
verify-native:
    Write-Host "Verifying native modules can be loaded..."; \
    $result = node -e "try { require('better-sqlite3'); console.log('OK'); } catch(e) { console.log('FAIL: ' + e.message); process.exit(1); }" 2>&1; \
    if ($result -match "OK") { \
        Write-Host "  OK  better-sqlite3 loads correctly" \
    } else { \
        Write-Host "  FAIL  better-sqlite3: $result"; \
        Write-Host "  Run: just rebuild-native"; \
        exit 1 \
    }; \
    Write-Host "All native modules verified and loadable."

# ============================================================
# Build (mirrors CI workflow environment setup)
# ============================================================

# Build for current platform (preflight → build)
build: preflight
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    bun run build

# Quick build - uses cached Vite output if available
build-quick: preflight
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    node scripts/build-with-builder.js auto --skip-native

# Build package only (no installer) - fastest iteration
build-package: preflight
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    node scripts/build-with-builder.js auto --pack-only --skip-native

# Force full rebuild (clears cache)
build-force: preflight clean
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    node scripts/build-with-builder.js auto --force

# Build for Windows x64
build-win-x64: preflight
    Write-Host "Ensuring npm dependencies..."; \
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }; \
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    $env:npm_config_runtime = "electron"; \
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    $env:npm_config_arch = "x64"; \
    $env:npm_config_target_arch = "x64"; \
    $env:npm_config_disturl = "https://electronjs.org/headers"; \
    $env:npm_config_build_from_source = "true"; \
    $env:MSVS_VERSION = "2022"; \
    $env:GYP_MSVS_VERSION = "2022"; \
    node scripts/build-with-builder.js x64 --win --x64

# Build for Windows arm64
build-win-arm64: preflight
    Write-Host "Ensuring npm dependencies..."; \
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }; \
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    $env:npm_config_runtime = "electron"; \
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    $env:npm_config_arch = "arm64"; \
    $env:npm_config_target_arch = "arm64"; \
    $env:npm_config_disturl = "https://electronjs.org/headers"; \
    $env:npm_config_build_from_source = "true"; \
    $env:MSVS_VERSION = "2022"; \
    $env:GYP_MSVS_VERSION = "2022"; \
    node scripts/build-with-builder.js arm64 --win --arm64

# Build for Windows (auto-detect arch)
build-win: preflight
    Write-Host "Cleaning output directory..."; \
    Get-Process -Name "AionUI","electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; \
    if (Test-Path "out") { Remove-Item -Recurse -Force "out" -ErrorAction SilentlyContinue }; \
    npm install; \
    npm run postinstall || true; \
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    $env:MSVS_VERSION = "2022"; \
    $env:GYP_MSVS_VERSION = "2022"; \
    bun run build-win

# Build for macOS ARM64
build-mac-arm64: preflight
    Write-Host "Ensuring npm dependencies..."; \
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }; \
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    $env:npm_config_runtime = "electron"; \
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    $env:npm_config_disturl = "https://electronjs.org/headers"; \
    node scripts/build-with-builder.js arm64 --mac --arm64

# Build for macOS x64
build-mac-x64: preflight
    Write-Host "Ensuring npm dependencies..."; \
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }; \
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    $env:npm_config_runtime = "electron"; \
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    $env:npm_config_disturl = "https://electronjs.org/headers"; \
    node scripts/build-with-builder.js x64 --mac --x64

# Build for macOS (arm64 + x64)
build-mac: preflight
    Write-Host "Ensuring npm dependencies..."; \
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }; \
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    $env:npm_config_runtime = "electron"; \
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    $env:npm_config_disturl = "https://electronjs.org/headers"; \
    bun run build-mac

# Build for Linux
build-linux: preflight
    Write-Host "Ensuring npm dependencies..."; \
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }; \
    $env:NODE_OPTIONS = "--max-old-space-size=8192"; \
    $env:npm_config_runtime = "electron"; \
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim(); \
    $env:npm_config_disturl = "https://electronjs.org/headers"; \
    bun run build-deb

# Package only (electron-vite build, no installer)
package:
    bun run package

# Distribute (shortcut)
dist:
    bun run dist

# ============================================================
# Code Quality
# ============================================================

# Run linter
lint:
    bun run lint

# Run linter with auto-fix
lint-fix:
    bun run lint:fix

# Format code
fmt:
    bun run format

# Check formatting
fmt-check:
    bun run format:check

# Type check
typecheck:
    bunx tsc --noEmit

# Run all checks (lint + format + typecheck) — mirrors CI code-quality job
check: lint fmt-check typecheck

# ============================================================
# Testing
# ============================================================

# Run all tests
test:
    bun run test

# Run tests in watch mode
test-watch:
    bun run test:watch

# Run tests with coverage
test-coverage:
    bun run test:coverage

# Run contract tests
test-contract:
    bun run test:contract

# Run integration tests
test-integration:
    bun run test:integration

# ============================================================
# Extension System (RFC-001)
# ============================================================

# Start dev server with example extensions loaded
# CDP remote debugging is enabled by default on port 9222 in dev mode
dev-ext:
    $env:AIONUI_EXTENSIONS_PATH = (Resolve-Path "examples").Path; \
    Write-Host "Loading extensions from: $($env:AIONUI_EXTENSIONS_PATH)"; \
    bun run start

# Start WebUI with example extensions loaded
webui-ext:
    $env:AIONUI_EXTENSIONS_PATH = (Resolve-Path "examples").Path; \
    Write-Host "Loading extensions from: $($env:AIONUI_EXTENSIONS_PATH)"; \
    bun run webui

# Start CLI with example extensions loaded
cli-ext:
    $env:AIONUI_EXTENSIONS_PATH = (Resolve-Path "examples").Path; \
    Write-Host "Loading extensions from: $($env:AIONUI_EXTENSIONS_PATH)"; \
    bun run cli

# Validate extension system types compile correctly
ext-typecheck:
    bunx tsc --noEmit --project tsconfig.json

# Run extension system tests
ext-test:
    bunx vitest run tests/extensions/

# Run extension system tests in watch mode
ext-test-watch:
    bunx vitest tests/extensions/

# ============================================================
# Utilities
# ============================================================

# Reset WebUI password
reset-password:
    bun run resetpass

# Clean build artifacts
clean:
    if (Test-Path "out") { Remove-Item -Recurse -Force "out" }; \
    if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }; \
    Write-Host "Build artifacts cleaned."

# Deep clean (build artifacts + node_modules)
clean-all: clean
    if (Test-Path "node_modules") { \
        Write-Host "Removing node_modules..."; \
        Remove-Item -Recurse -Force "node_modules" \
    }; \
    Write-Host "Full clean complete. Run: just setup"

# List build output artifacts
list-artifacts:
    if (Test-Path "out") { \
        Get-ChildItem out -Recurse -Include *.exe,*.msi,*.dmg,*.deb,*.AppImage,*.zip | \
            ForEach-Object { \
                $size = [math]::Round($_.Length / 1MB, 1); \
                Write-Host "  $($_.Name)  ($size MB)" \
            } \
    } else { Write-Host "No build output found. Run: just build" }

# CI-like full build validation (mirrors GitHub Actions workflow)
ci-local: check test build
    Write-Host "CI-local pipeline passed!"
