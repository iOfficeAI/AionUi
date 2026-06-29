# Development Guide

## Prerequisites

- **Node.js** 22 or higher
- **bun** — Package manager & runtime ([install](https://bun.sh))
- **Rust stable + Cargo** — Required to build the local AionCore backend ([install](https://rustup.rs))
- **Python** 3.11+ (for native module compilation)
- **prek** — PR code checker (`npm install -g @j178/prek`)

On Windows, install the Rust MSVC toolchain. If Rust compilation fails because native build tools are missing, install **Microsoft C++ Build Tools** from the Visual Studio installer, then reopen your terminal.

## Repository Layout

AionUi development uses two repositories:

- **AionCore** (`https://github.com/iOfficeAI/AionCore.git`) builds the local backend binary: `aioncore` on macOS/Linux and `aioncore.exe` on Windows.
- **AionUi** (`https://github.com/iOfficeAI/AionUi.git`) starts the Electron desktop app and launches the backend binary automatically.

Keep the repositories side by side when possible:

```text
workspace/
|-- AionCore/
`-- AionUi/
```

The desktop development server resolves the backend from the `PATH` inherited by `bun run start`. Install AionCore first, verify the binary is discoverable in the same terminal, then start AionUi.

## Quick Start

### 1. Clone Both Repositories

```bash
git clone https://github.com/iOfficeAI/AionCore.git
git clone https://github.com/iOfficeAI/AionUi.git
```

Use the `main` branch for both repositories unless a maintainer asks you to test another branch.

### 2. Build and Install AionCore

Run these commands from the `AionCore` repository.

#### macOS / Linux

```bash
cd AionCore
cargo clean
cargo install --path crates/aionui-app --locked

# Make Cargo-installed binaries visible to this shell if needed.
export PATH="$HOME/.cargo/bin:$PATH"

# Verify that AionUi will be able to find the backend.
which aioncore
aioncore --help
```

If `which aioncore` prints nothing, add `export PATH="$HOME/.cargo/bin:$PATH"` to your shell profile (`~/.zshrc`, `~/.bashrc`, or your shell's equivalent), open a new terminal, and verify again.

#### Windows PowerShell

```powershell
cd AionCore
cargo clean
cargo install --path crates/aionui-app --locked

# Make Cargo-installed binaries visible to this PowerShell session if needed.
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# Verify that AionUi will be able to find the backend.
where.exe aioncore
aioncore --help
```

If `where.exe aioncore` prints nothing, make sure `%USERPROFILE%\.cargo\bin` is in your user `Path`, open a new PowerShell window, and verify again.

### 3. Start AionUi

Run these commands from the `AionUi` repository in a terminal where `aioncore` is discoverable.

```bash
cd AionUi

# Install dependencies
bun install

# Start the Electron desktop app in development mode
bun run start
```

During startup, AionUi launches `aioncore` automatically and passes the backend port to the renderer. You do not need to start AionCore in a separate terminal.

## Updating the Local Backend

When you pull or change AionCore, reinstall the backend binary and restart AionUi:

```bash
cd ../AionCore
cargo install --path crates/aionui-app --locked --force

cd ../AionUi
bun run start
```

Use `--force` when rebuilding local changes with the same AionCore package version; otherwise Cargo may keep the already installed binary.

## Backend Startup Troubleshooting

### `Cannot find "aioncore" binary`

AionUi cannot find the backend from the `PATH` inherited by `bun run start`.

Check from the same terminal where you start AionUi:

```bash
# macOS / Linux
which aioncore

# Windows PowerShell
where.exe aioncore
```

If the command fails, add Cargo's binary directory to `PATH` and start AionUi from a new terminal.

### `aioncore` Works in a Terminal but AionUi Still Cannot Find It

Make sure you start `bun run start` from the same terminal environment that can run `aioncore --help`. IDE terminals and GUI-launched shells can inherit a different `PATH`; restart the IDE or launch it from a terminal after updating `PATH`.

### Backend Changes Do Not Show Up

Quit AionUi, reinstall AionCore with `cargo install --path crates/aionui-app --locked --force`, then start AionUi again. The Electron app owns the backend subprocess during development, so a running AionUi instance will not pick up a newly installed binary until it restarts.

### Windows Rust Build Errors

Use the Rust MSVC toolchain and install Microsoft C++ Build Tools. After installing or changing toolchains, open a new PowerShell window and rerun the AionCore install command.

## Scripts Reference

### Development

| Command                     | Description                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `bun start`                 | Start Electron app in development mode (desktop)                                                               |
| `bun run start:multi`       | Start a second Electron instance alongside an existing one (see [Multi-Instance](#multi-instance-development)) |
| `bun run cli`               | Alias for `bun start`                                                                                          |
| `bun run webui`             | Start in WebUI mode (browser-based, no Electron window)                                                        |
| `bun run webui:remote`      | Start in WebUI mode with remote access enabled                                                                 |
| `bun run webui:prod`        | Start WebUI in production mode                                                                                 |
| `bun run webui:prod:remote` | Start WebUI in production mode with remote access                                                              |
| `bun run resetpass`         | Reset user password via CLI                                                                                    |

### Build & Distribution

| Command                   | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `bun run package`         | Build all processes (main, preload, renderer) to `out/` |
| `bun run make`            | Alias for `bun run package`                             |
| `bun run dist`            | Build and package distributable for current platform    |
| `bun run dist:mac`        | Build distributable for macOS                           |
| `bun run dist:win`        | Build distributable for Windows                         |
| `bun run dist:linux`      | Build distributable for Linux                           |
| `bun run build-mac`       | Build macOS distributable for both arm64 and x64        |
| `bun run build-mac:arm64` | Build macOS distributable for Apple Silicon only        |
| `bun run build-mac:x64`   | Build macOS distributable for Intel only                |
| `bun run build-win`       | Build Windows distributable                             |
| `bun run build-win:arm64` | Build Windows distributable for ARM64                   |
| `bun run build-win:x64`   | Build Windows distributable for x64                     |
| `bun run build-deb`       | Build Linux (.deb) distributable                        |
| `bun run build`           | Alias for `bun run build-mac`                           |

### Standalone Server (non-Electron)

| Command                            | Description                                                 |
| ---------------------------------- | ----------------------------------------------------------- |
| `bun run build:renderer:web`       | Build renderer for standalone web deployment                |
| `bun run build:server`             | Build standalone server bundle to `dist-server/`            |
| `bun run server:start`             | Run standalone server in development mode                   |
| `bun run server:start:remote`      | Run standalone server with remote access                    |
| `bun run server:start:prod`        | Run standalone server in production mode                    |
| `bun run server:start:prod:remote` | Run standalone server in production mode with remote access |
| `bun run server:resetpass`         | Reset password via standalone server CLI                    |
| `bun run server:resetpass:prod`    | Reset password via standalone server CLI (production)       |

### Code Quality

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `bun run lint`         | Check for lint issues (oxlint, read-only) |
| `bun run lint:fix`     | Auto-fix lint issues                      |
| `bun run format`       | Auto-format code (oxfmt)                  |
| `bun run format:check` | Check formatting without modifying files  |
| `bun run i18n:types`   | Generate TypeScript types for i18n keys   |

### Testing

| Command                      | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `bun run test`               | Run all unit tests (vitest)                       |
| `bun run test:watch`         | Run tests in watch mode                           |
| `bun run test:coverage`      | Run tests with coverage report                    |
| `bun run test:contract`      | Run contract tests                                |
| `bun run test:integration`   | Run integration tests                             |
| `bun run test:bun`           | Run Bun-specific database driver tests            |
| `bun run test:e2e`           | Run end-to-end tests (Playwright)                 |
| `bun run test:packaged:i18n` | Run i18n integration tests against packaged build |
| `bun run test:packaged:bun`  | Run Bun packaged integration tests                |

### Debug

| Command                      | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `bun run debug:perf`         | Start app with performance monitoring enabled   |
| `bun run debug:perf:report`  | Generate performance report from collected data |
| `bun run debug:mcp`          | Debug MCP server connections                    |
| `bun run debug:mcp:list`     | List configured MCP servers                     |
| `bun run debug:mcp:validate` | Validate MCP server configurations              |
| `bun run debug:custom-agent` | Debug custom agent connections                  |

## Multi-Instance Development

When you have two clones of the repository (e.g. `AionUi` and `AionUi-refactor`) and need to run both simultaneously, the second instance can be started with:

```bash
bun run start:multi
```

This sets `AIONUI_MULTI_INSTANCE=1`, which:

- Skips the Electron single-instance lock
- Uses a separate userData directory (`AionUi-Dev-2`) to avoid database and config conflicts
- Isolates data/config symlink paths (`~/.aionui-dev-2`, `~/.aionui-config-dev-2`)
- Vite renderer, CDP, and WebUI proxy ports auto-increment to avoid collisions

> **Note:** The multi-instance WebUI defaults to port 25810 (instead of 25809). When accessing WebUI in a browser, use an **incognito/private window** for the second instance — both instances share the `localhost` cookie jar, and their JWT secrets differ, causing authentication failures if the same browser session is reused.

## Code Checks (prek)

The project uses [prek](https://github.com/j178/prek) (a Rust implementation of pre-commit) for code checks, configured in `.pre-commit-config.yaml`:

```bash
# Install prek
npm install -g @j178/prek

# Install git hooks (optional, auto-check before commit)
prek install

# Run checks on staged files
prek run

# Run checks on changes vs main (same as CI)
prek run --from-ref origin/main --to-ref HEAD
```

## Build System

AionUi uses **electron-vite** for fast bundling:

- **Main process**: bundled with Vite (ESM)
- **Renderer process**: bundled with Vite (React + TypeScript)
- **Preload scripts**: bundled with Vite

The build output goes to `out/` directory:

- `out/main/` - Main process code
- `out/renderer/` - Renderer process code
- `out/preload/` - Preload scripts

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast bundler (via electron-vite)
- **UnoCSS** - Atomic CSS engine
- **better-sqlite3** - Local database
- **vitest** - Testing framework
