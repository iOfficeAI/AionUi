# AionUI Development Justfile
# Usage: just <recipe>

# On Windows, simple recipes (no shebang) use PowerShell
set windows-shell := ["powershell.exe", "-NoProfile", "-Command"]

# Default recipe: show available commands
default:
    @just --list --unsorted

# ============================================================
# Development
# ============================================================

# Local phase workflow. Use `just local audit` before expensive builds.
local MODE *ARGS:
    node scripts/local-build.js {{MODE}} {{ARGS}}

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
# Environment Checks (requires pwsh)
# ============================================================

# Check all build prerequisites are met
[no-exit-message]
preflight:
    #!/usr/bin/env pwsh
    $ErrorActionPreference = 'Continue'
    $failed = $false
    Write-Host "=========================================="
    Write-Host "  AionUI Build Preflight Check"
    Write-Host "=========================================="
    Write-Host ""
    Write-Host "[1/6] Node.js..."
    try {
        $nodeVer = (node --version 2>&1).Trim()
        $major = [int]($nodeVer -replace '^v','').Split('.')[0]
        if ($major -ge 22) { Write-Host "  OK  Node.js $nodeVer" }
        else { Write-Host "  WARN  Node.js $nodeVer (recommend >= 22)" }
    } catch { Write-Host "  FAIL  Node.js not found"; $failed = $true }
    Write-Host "[2/6] bun..."
    try {
        $bunVer = (bun --version 2>&1).Trim()
        Write-Host "  OK  bun $bunVer"
    } catch { Write-Host "  FAIL  bun not found"; $failed = $true }
    Write-Host "[3/6] Python (for native modules)..."
    try {
        $pyVer = (python --version 2>&1).Trim()
        Write-Host "  OK  $pyVer"
    } catch { Write-Host "  WARN  Python not found (needed for native module compilation)" }
    Write-Host "[4/6] Dependencies (node_modules)..."
    if ((Test-Path "node_modules") -and ((Test-Path "bun.lock") -or (Test-Path "package-lock.json"))) {
        Write-Host "  OK  node_modules exists"
    } else {
        Write-Host "  WARN  node_modules missing - running: just install"
        just install
        if (Test-Path "node_modules") { Write-Host "  OK  node_modules installed" }
        else { Write-Host "  FAIL  Failed to install dependencies"; $failed = $true }
    }
    Write-Host "[5/6] Native modules (better-sqlite3)..."
    $nativeOk = (Test-Path "node_modules/better-sqlite3/build/Release/better_sqlite3.node") -or (Test-Path "node_modules/better-sqlite3/prebuilds")
    if ($nativeOk) { Write-Host "  OK  better-sqlite3 native module found" }
    else { Write-Host "  WARN  better-sqlite3 native binary missing - run: just rebuild-native" }
    Write-Host "[6/6] Electron version..."
    try {
        $electronVer = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim()
        Write-Host "  OK  Electron $electronVer"
    } catch { Write-Host "  FAIL  Cannot read Electron version"; $failed = $true }
    Write-Host ""
    Write-Host "=========================================="
    if ($failed) { Write-Host "  PREFLIGHT FAILED"; exit 1 }
    else { Write-Host "  PREFLIGHT PASSED" }
    Write-Host "=========================================="

# Show current build environment info
info:
    #!/usr/bin/env bash
    echo "AionUI Build Environment"
    echo "========================"
    echo "Node:     $(node --version)"
    echo "bun:      $(bun --version)"
    electronVer=$(node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')")
    appVer=$(node -p "require('./package.json').version")
    echo "App:      v$appVer"
    echo "Electron: $electronVer"
    echo "Branch:   $(git branch --show-current)"
    echo "Commit:   $(git rev-parse --short HEAD)"

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
    #!/usr/bin/env pwsh
    $ErrorActionPreference = 'Stop'
    $electronVer = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim()
    Write-Host "=========================================="
    Write-Host "Rebuilding native modules for Electron $electronVer"
    Write-Host "=========================================="
    Write-Host ""
    Write-Host "[Step 1] electron-rebuild..."
    bunx electron-rebuild -f -w better-sqlite3
    Write-Host "  OK  electron-rebuild completed"
    Write-Host ""
    Write-Host "[Verify] Checking native modules..."
    $verified = $true
    $sqliteNode = "node_modules/better-sqlite3/build/Release/better_sqlite3.node"
    if (Test-Path $sqliteNode) {
        $size = [math]::Round((Get-Item $sqliteNode).Length / 1MB, 1)
        Write-Host "  OK  better-sqlite3 ($size MB)"
    } elseif (Test-Path "node_modules/better-sqlite3/prebuilds") {
        Write-Host "  OK  better-sqlite3 (prebuilds)"
    } else {
        Write-Host "  FAIL  better-sqlite3 native module not found"
        $verified = $false
    }
    Write-Host ""
    if ($verified) {
        Write-Host "  All native modules verified"
    } else {
        Write-Host "  NATIVE MODULE VERIFICATION FAILED"
        exit 1
    }

# Verify native modules can actually be loaded by Node.js
[no-exit-message]
verify-native:
    #!/usr/bin/env pwsh
    Write-Host "Verifying native modules can be loaded..."
    $result = node -e "try { require('better-sqlite3'); console.log('OK'); } catch(e) { console.log('FAIL: ' + e.message); process.exit(1); }" 2>&1
    if ($result -match "OK") {
        Write-Host "  OK  better-sqlite3 loads correctly"
    } else {
        Write-Host "  FAIL  better-sqlite3: $result"
        Write-Host "  Run: just rebuild-native"
        exit 1
    }
    Write-Host "All native modules verified and loadable."

# ============================================================
# Build (mirrors CI workflow environment setup)
# ============================================================

# Build for current platform (preflight → build)
build: preflight
    #!/usr/bin/env bash
    export NODE_OPTIONS="--max-old-space-size=8192"
    bun run build

# Quick build - uses cached Vite output if available
build-quick: preflight
    #!/usr/bin/env bash
    export NODE_OPTIONS="--max-old-space-size=8192"
    node scripts/build-with-builder.js auto --skip-native

# Build package only (no installer) - fastest iteration
build-package: preflight
    #!/usr/bin/env bash
    export NODE_OPTIONS="--max-old-space-size=8192"
    node scripts/build-with-builder.js auto --pack-only --skip-native

# Force full rebuild (clears cache)
build-force: preflight clean
    #!/usr/bin/env bash
    export NODE_OPTIONS="--max-old-space-size=8192"
    node scripts/build-with-builder.js auto --force

# Build for Windows x64
build-win-x64: preflight
    #!/usr/bin/env pwsh
    Write-Host "Ensuring npm dependencies..."
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }
    $env:NODE_OPTIONS = "--max-old-space-size=8192"
    $env:npm_config_runtime = "electron"
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim()
    $env:npm_config_arch = "x64"
    $env:npm_config_target_arch = "x64"
    $env:npm_config_disturl = "https://electronjs.org/headers"
    $env:npm_config_build_from_source = "true"
    $env:MSVS_VERSION = "2022"
    $env:GYP_MSVS_VERSION = "2022"
    node scripts/build-with-builder.js x64 --win --x64

# Build for Windows arm64
build-win-arm64: preflight
    #!/usr/bin/env pwsh
    Write-Host "Ensuring npm dependencies..."
    if (-not (Test-Path "node_modules")) { npm install } else { npm install --prefer-offline }
    $env:NODE_OPTIONS = "--max-old-space-size=8192"
    $env:npm_config_runtime = "electron"
    $env:npm_config_target = (node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')" 2>&1).Trim()
    $env:npm_config_arch = "arm64"
    $env:npm_config_target_arch = "arm64"
    $env:npm_config_disturl = "https://electronjs.org/headers"
    $env:npm_config_build_from_source = "true"
    $env:MSVS_VERSION = "2022"
    $env:GYP_MSVS_VERSION = "2022"
    node scripts/build-with-builder.js arm64 --win --arm64

# Build for Windows (auto-detect arch)
build-win: preflight
    #!/usr/bin/env pwsh
    Write-Host "Cleaning output directory..."
    Get-Process -Name "AionUI","electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    if (Test-Path "out") { Remove-Item -Recurse -Force "out" -ErrorAction SilentlyContinue }
    npm install
    npm run postinstall; if ($LASTEXITCODE -ne 0) { Write-Host "postinstall failed (continuing)"; $LASTEXITCODE = 0 }
    $env:NODE_OPTIONS = "--max-old-space-size=8192"
    $env:MSVS_VERSION = "2022"
    $env:GYP_MSVS_VERSION = "2022"
    bun run build-win

# Build for macOS ARM64
build-mac-arm64: preflight
    #!/usr/bin/env bash
    echo "Ensuring npm dependencies..."
    [ -d "node_modules" ] && npm install --prefer-offline || npm install
    export NODE_OPTIONS="--max-old-space-size=8192"
    export npm_config_runtime="electron"
    export npm_config_target=$(node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')")
    export npm_config_disturl="https://electronjs.org/headers"
    node scripts/build-with-builder.js arm64 --mac --arm64

# Build for macOS x64
build-mac-x64: preflight
    #!/usr/bin/env bash
    echo "Ensuring npm dependencies..."
    [ -d "node_modules" ] && npm install --prefer-offline || npm install
    export NODE_OPTIONS="--max-old-space-size=8192"
    export npm_config_runtime="electron"
    export npm_config_target=$(node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')")
    export npm_config_disturl="https://electronjs.org/headers"
    node scripts/build-with-builder.js x64 --mac --x64

# Build for macOS (arm64 + x64)
build-mac: preflight
    #!/usr/bin/env bash
    echo "Ensuring npm dependencies..."
    [ -d "node_modules" ] && npm install --prefer-offline || npm install
    export NODE_OPTIONS="--max-old-space-size=8192"
    export npm_config_runtime="electron"
    export npm_config_target=$(node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')")
    export npm_config_disturl="https://electronjs.org/headers"
    bun run build-mac

# Build for Linux
build-linux: preflight
    #!/usr/bin/env bash
    echo "Ensuring npm dependencies..."
    [ -d "node_modules" ] && npm install --prefer-offline || npm install
    export NODE_OPTIONS="--max-old-space-size=8192"
    export npm_config_runtime="electron"
    export npm_config_target=$(node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')")
    export npm_config_disturl="https://electronjs.org/headers"
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

# Run i18n type generation and validation
i18n-check:
    bun run i18n:types
    node scripts/check-i18n.js

# Run all checks (lint + format + typecheck + i18n) — mirrors CI code-quality job
check: lint fmt-check typecheck i18n-check

# Fast local gate for iteration. Run this before the targeted tests for a change.
# Uses --quiet to suppress warnings (exit code is still non-zero on errors).
quick-check: lint-strict fmt-check typecheck i18n-check

# Final local gate. Run once on the final commit before pushing.
gate: quick-check test

# Validate the final commit, then push it.
push *ARGS: gate
    git push {{ ARGS }}

# Wait for one PR's checks without manual status polling. Defaults to origin.
[no-exit-message]
watch-pr pr remote='origin':
    #!/usr/bin/env bash
    set -euo pipefail
    repo=$(gh repo view "$(git remote get-url "{{ remote }}")" --json nameWithOwner --jq .nameWithOwner)
    gh pr checks "{{ pr }}" --repo "$repo" --watch --interval 30

# Serialize one personal-fork PR integration in this clone. This updates and merges the PR.
[no-exit-message]
integrate-pr pr remote='origin':
    #!/usr/bin/env bash
    set -euo pipefail

    pr="{{ pr }}"
    repo=$(gh repo view "$(git remote get-url "{{ remote }}")" --json nameWithOwner --jq .nameWithOwner)
    common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
    lock_dir="$common_dir/aionui-integrate-pr.lock"

    if ! mkdir "$lock_dir" 2>/dev/null; then
      echo "Another integration is already running in this clone: $lock_dir" >&2
      exit 1
    fi
    trap 'rmdir "$lock_dir"' EXIT

    state=$(gh pr view "$pr" --repo "$repo" --json state --jq .state)
    is_draft=$(gh pr view "$pr" --repo "$repo" --json isDraft --jq .isDraft)
    base=$(gh pr view "$pr" --repo "$repo" --json baseRefName --jq .baseRefName)
    if [[ "$state" != "OPEN" || "$is_draft" != "false" || "$base" != "main" ]]; then
      echo "PR must be open, ready for review, and target main (state=$state draft=$is_draft base=$base)." >&2
      exit 1
    fi

    gh pr update-branch "$pr" --repo "$repo"
    head_sha=$(gh pr view "$pr" --repo "$repo" --json headRefOid --jq .headRefOid)

    required_count=0
    for _ in {1..12}; do
      required_count=$(gh pr checks "$pr" --repo "$repo" --required --json name --jq 'length' 2>/dev/null || true)
      if [[ "$required_count" =~ ^[1-9][0-9]*$ ]]; then
        break
      fi
      sleep 5
    done
    if ! [[ "$required_count" =~ ^[1-9][0-9]*$ ]]; then
      echo "No required checks appeared for PR $pr after its branch update; refusing to merge." >&2
      exit 1
    fi

    gh pr checks "$pr" --repo "$repo" --required --watch --interval 30
    current_head=$(gh pr view "$pr" --repo "$repo" --json headRefOid --jq .headRefOid)
    if [[ "$current_head" != "$head_sha" ]]; then
      echo "PR head changed while checks were running; rerun this command." >&2
      exit 1
    fi
    gh pr merge "$pr" --repo "$repo" --squash --match-head-commit "$head_sha"

# Lint with only errors reported (for CI/push gates)
lint-strict:
    bun run lint -- --quiet

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

# Run the real AionCore + mocked Lark identity boundary and macOS safeStorage restart E2E.
# Usage: AIONUI_AIONCORE_BINARY=/absolute/path/to/aioncore just test-lark-core-boundary
[no-exit-message]
test-lark-core-boundary:
    #!/usr/bin/env bash
    set -euo pipefail
    : "${AIONUI_AIONCORE_BINARY:?set AIONUI_AIONCORE_BINARY to a real aioncore executable}"
    test -x "$AIONUI_AIONCORE_BINARY"
    bun run --cwd packages/web-host test -- tests/integration/renewable-core-session.integration.test.ts
    bun run package
    AIONUI_BACKEND_BIN="$AIONUI_AIONCORE_BINARY" bunx playwright test --config playwright.config.ts tests/e2e/features/auth/desktop-lark-credential-restart.e2e.ts

# Run the explicit 24-hour wall-clock session/refresh/CSRF soak on a durable runner.
# GitHub-hosted runners cannot cover this duration; use a supervised machine.
[no-exit-message]
test-lark-core-soak:
    #!/usr/bin/env bash
    set -euo pipefail
    : "${AIONUI_AIONCORE_BINARY:?set AIONUI_AIONCORE_BINARY to a real aioncore executable}"
    test -x "$AIONUI_AIONCORE_BINARY"
    ISSUE133_LONG_RUNTIME=1 bun run --cwd packages/web-host test -- tests/integration/renewable-core-session.integration.test.ts

# Verify packaged artifact contains complete renderer assets (i18n safety)
test-packaged-i18n:
    bun run test:packaged:i18n

# Run E2E tests (Playwright + Electron — auto-launches app)
# Builds main+preload+renderer into out/ first to ensure fresh artifacts.
e2e-test:
    bun run package
    bunx playwright test --config playwright.config.ts

# Run only extension-related E2E tests (faster iteration)
e2e-test-ext:
    bun run package
    bunx playwright test --config playwright.config.ts tests/e2e/specs/ext-*.e2e.ts

# Run E2E tests with headed browser (for debugging)
e2e-test-headed:
    bun run package
    bunx playwright test --config playwright.config.ts --headed

# Open Playwright HTML report after test run
e2e-report:
    bunx playwright show-report tests/e2e/report

# ============================================================
# Extension System (RFC-001)
# ============================================================

# Start dev server with example extensions loaded
# CDP remote debugging is enabled by default on port 9222 in dev mode
dev-ext:
    node scripts/dev-bootstrap.mjs launch start --extensions

# Start WebUI with example extensions loaded
webui-ext:
    node scripts/dev-bootstrap.mjs launch webui --extensions

# Start CLI with example extensions loaded
cli-ext:
    node scripts/dev-bootstrap.mjs launch cli --extensions

# Cross-platform diagnosis for dev extension startup
dev-ext-doctor:
    node scripts/dev-bootstrap.mjs doctor

# Launch packaged (unpacked) app with example extensions for one-click debugging
# Requires out/*-unpacked artifacts
packaged-ext:
    node scripts/packaged-launch.mjs

# Build package first, then launch with example extensions
packaged-ext-build: build-package
    node scripts/packaged-launch.mjs

# Validate extension system types compile correctly
ext-typecheck:
    bunx tsc --noEmit --project tsconfig.json

# Run extension system tests
ext-test:
    bunx vitest run tests/extensions/ --passWithNoTests

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
    #!/usr/bin/env bash
    rm -rf out dist
    echo "Build artifacts cleaned."

# Deep clean (build artifacts + node_modules)
clean-all: clean
    #!/usr/bin/env bash
    if [ -d "node_modules" ]; then
        echo "Removing node_modules..."
        rm -rf node_modules
    fi
    echo "Full clean complete. Run: just setup"

# List build output artifacts
list-artifacts:
    #!/usr/bin/env bash
    if [ -d "out" ]; then
        find out -type f \( -name "*.exe" -o -name "*.msi" -o -name "*.dmg" -o -name "*.deb" -o -name "*.AppImage" -o -name "*.zip" \) -exec ls -lh {} \; | awk '{print "  " $NF "  (" $5 ")"}'
    else
        echo "No build output found. Run: just build"
    fi

# CI-like full build validation (mirrors GitHub Actions workflow)
ci-local: check test build
    @echo "CI-local pipeline passed!"
