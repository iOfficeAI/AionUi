# Development Guide

## Prerequisites

- **Node.js** 22 or higher
- **bun** — Package manager & runtime ([install](https://bun.sh))
- **Python** 3.11+ (for native module compilation)
- **prek** — PR code checker (`npm install -g @j178/prek`)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/iOfficeAI/AionUi.git
cd AionUi

# Install dependencies
bun install

# Start development server (Electron desktop mode)
bun start
```

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
