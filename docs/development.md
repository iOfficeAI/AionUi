# Development Guide

## Prerequisites

- **Node.js** 22 or higher
- **bun** — Package manager & runtime ([install](https://bun.sh))
- **just** — Command runner (macOS: `brew install just`, Windows: `choco install just`, Linux: `apt install just`)
- **Python** 3.11+ (for native module compilation)
- **prek** — PR code checker (`npm install -g @j178/prek`)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/iOfficeAI/AionUi.git
cd AionUi

# Install dependencies
just install

# Start development server
just dev
```

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
