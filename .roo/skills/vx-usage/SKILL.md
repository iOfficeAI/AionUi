---
name: vx-usage
description: |
  This skill teaches AI coding agents how to use vx - the universal development tool manager.
  Use this skill whenever the user's project uses vx (has vx.toml or .vx/ directory),
  or when the user mentions vx, tool version management, or cross-platform development setup.
  vx transparently manages Node.js, Python, Go, Rust, and 50+ other tools with zero-config.
---

# VX - Universal Development Tool Manager

vx is a universal development tool manager that automatically installs and manages
development tools (Node.js, Python/uv, Go, Rust, etc.) with zero configuration.

## Core Concept

Instead of requiring users to manually install tools, prefix any command with `vx`:

```bash
vx node --version      # Auto-installs Node.js if needed
vx uv pip install x    # Auto-installs uv if needed
vx go build .          # Auto-installs Go if needed
vx cargo build         # Auto-installs Rust if needed
vx just test           # Auto-installs just if needed
```

vx is fully transparent - same commands, same arguments, just add `vx` prefix.

## Essential Commands

### Tool Execution (most common)

```bash
vx <tool> [args...]           # Run any tool (auto-installs if missing)
vx node app.js                # Run Node.js
vx python script.py           # Run Python (via uv)
vx npm install                # Run npm
vx npx create-react-app app   # Run npx
vx cargo test                 # Run cargo
vx just build                 # Run just (task runner)
vx git status                 # Run git
```

### Tool Management

```bash
vx install node@22            # Install specific version
vx install uv go rust         # Install multiple tools at once
vx list                       # List all available tools
vx list --installed           # List installed tools only
vx versions node              # Show available versions
vx switch node@20             # Switch active version
vx uninstall go@1.21          # Remove a version
```

### Project Management

```bash
vx init                       # Initialize vx.toml for project
vx sync                       # Install all tools from vx.toml
vx setup                      # Full project setup (sync + hooks)
vx dev                        # Enter dev environment with all tools
vx run test                   # Run project scripts from vx.toml
vx check                      # Verify tool constraints
vx lock                       # Generate vx.lock for reproducibility
```

### Environment & Config

```bash
vx env list                   # List environments
vx config show                # Show configuration
vx cache info                 # Show cache usage
vx search <query>             # Search available tools
vx info                       # System info and capabilities
```

## Project Configuration (vx.toml)

Projects use `vx.toml` in the root directory:

```toml
[tools]
node = "22"         # Major version
go = "1.22"         # Minor version
uv = "latest"       # Always latest
rust = "1.80"       # Specific version
just = "*"          # Any version

[scripts]
dev = "npm run dev"
test = "cargo test"
lint = "npm run lint && cargo clippy"
build = "just build"

[hooks]
pre_commit = ["vx run lint"]
post_setup = ["npm install"]
```

## Using `--with` for Multi-Runtime

When a command needs additional runtimes available:

```bash
vx --with bun node app.js     # Node.js + Bun in PATH
vx --with deno npm test        # npm + Deno available
```

## Package Aliases

vx supports **package aliases** — short commands that automatically route to ecosystem packages:

```bash
# These are equivalent:
vx vite              # Same as: vx npm:vite
vx vite@5.0          # Same as: vx npm:vite@5.0
vx rez               # Same as: vx uv:rez
vx pre-commit        # Same as: vx uv:pre-commit
vx meson             # Same as: vx uv:meson
vx release-please    # Same as: vx npm:release-please
```

**Benefits**:

- Simpler commands without remembering ecosystem prefixes
- Automatic runtime dependency management (node/python installed as needed)
- Respects project `vx.toml` version configuration

**Available Aliases**:
| Short Command | Equivalent | Ecosystem |
|--------------|------------|-----------|
| `vx vite` | `vx npm:vite` | npm |
| `vx release-please` | `vx npm:release-please` | npm |
| `vx rez` | `vx uv:rez` | uv |
| `vx pre-commit` | `vx uv:pre-commit` | uv |
| `vx meson` | `vx uv:meson` | uv |

## Companion Tool Environment Injection

When `vx.toml` includes tools like MSVC, vx automatically injects discovery environment variables into **all** subprocess environments. This allows any tool needing a C/C++ compiler to discover the vx-managed installation.

```toml
# vx.toml — MSVC env vars injected for ALL tools
[tools]
node = "22"
cmake = "3.28"
rust = "1.82"

[tools.msvc]
version = "14.42"
os = ["windows"]
```

Now tools like node-gyp, CMake, Cargo (cc crate) automatically find MSVC:

```bash
# node-gyp finds MSVC via VCINSTALLDIR
vx npx node-gyp rebuild

# CMake discovers the compiler
vx cmake -B build -G "Ninja"

# Cargo cc crate finds MSVC for C dependencies
vx cargo build
```

**Injected Environment Variables** (MSVC example):
| Variable | Purpose |
|----------|---------|
| `VCINSTALLDIR` | VS install path (node-gyp, CMake) |
| `VCToolsInstallDir` | Exact toolchain path |
| `VX_MSVC_ROOT` | vx MSVC root path |

## MSVC Build Tools (Windows)

Microsoft Visual C++ compiler for Windows development:

```bash
# Install MSVC Build Tools
vx install msvc@latest
vx install msvc 14.40       # Specific version

# Using MSVC tools via namespace
vx msvc cl main.cpp -o main.exe
vx msvc link main.obj
vx msvc nmake

# Direct aliases
vx cl main.cpp              # Same as: vx msvc cl
vx nmake                    # Same as: vx msvc nmake

# Version-specific usage
vx msvc@14.40 cl main.cpp
```

**Available MSVC Tools**:
| Tool | Command | Description |
|------|---------|-------------|
| cl | `vx msvc cl` | C/C++ compiler |
| link | `vx msvc link` | Linker |
| lib | `vx msvc lib` | Library manager |
| nmake | `vx msvc nmake` | Make utility |

## Supported Tools (50+)

| Category   | Tools                                                   |
| ---------- | ------------------------------------------------------- |
| JavaScript | node, npm, npx, bun, deno, pnpm, yarn, vite             |
| Python     | uv, uvx, python, pip                                    |
| Rust       | cargo, rustc, rustup                                    |
| Go         | go, gofmt                                               |
| System     | git, just, jq, cmake, make, ninja, meson                |
| Cloud      | docker, kubectl, helm, awscli, azcli, gcloud, terraform |
| .NET       | dotnet, msbuild, nuget                                  |
| Other      | zig, java, protoc, ffmpeg, gh, ollama, dagu, skills     |

## Important Rules for AI Agents

1. **Always use `vx` prefix** when running tools in vx-managed projects
2. **Use `vx just`** instead of `just` for task runner commands
3. **Use `vx npm`** instead of `npm` directly
4. **Use `vx cargo`** instead of `cargo` directly
5. **Check `vx.toml`** first to understand project tool requirements
6. **Use `vx run <script>`** for project-defined scripts
7. **Never suggest manual tool installation** - vx handles it automatically
8. Commands like `vx install` are for explicit pre-installation; normal usage auto-installs

## GitHub Actions Integration

vx provides a GitHub Action (`action.yml`) for CI/CD workflows. Use it in `.github/workflows/` files:

### Basic Usage

```yaml
- uses: loonghao/vx@main
  with:
    version: 'latest' # vx version (default: latest)
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Pre-install Tools

```yaml
- uses: loonghao/vx@main
  with:
    tools: 'node go uv' # Space-separated tools to pre-install
    cache: 'true' # Enable tool caching (default: true)
```

### Project Setup (vx.toml)

```yaml
- uses: loonghao/vx@main
  with:
    setup: 'true' # Run `vx setup --ci` for vx.toml projects
```

### Full Example

```yaml
name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v6

      - uses: loonghao/vx@main
        with:
          tools: 'node@22 uv'
          setup: 'true'
          cache: 'true'

      - run: vx node --version
      - run: vx npm test
```

### Action Inputs

| Input              | Default               | Description                              |
| ------------------ | --------------------- | ---------------------------------------- |
| `version`          | `latest`              | vx version to install                    |
| `github-token`     | `${{ github.token }}` | GitHub token for API requests            |
| `tools`            | `''`                  | Space-separated tools to pre-install     |
| `cache`            | `true`                | Enable caching of ~/.vx directory        |
| `cache-key-prefix` | `vx-tools`            | Custom prefix for cache key              |
| `setup`            | `false`               | Run `vx setup --ci` for vx.toml projects |

### Action Outputs

| Output      | Description               |
| ----------- | ------------------------- |
| `version`   | The installed vx version  |
| `cache-hit` | Whether the cache was hit |

## Docker Support

vx provides a Docker image for containerized workflows:

```dockerfile
# Use vx as base image
FROM ghcr.io/loonghao/vx:latest

# Tools are auto-installed on first use
RUN vx node --version
RUN vx uv pip install mypackage
```

### Multi-stage Build with vx

```dockerfile
FROM ghcr.io/loonghao/vx:latest AS builder
RUN vx node --version && vx npm ci && vx npm run build

FROM nginx:alpine
COPY --from=builder /home/vx/dist /usr/share/nginx/html
```

### GitHub Actions with Docker

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/loonghao/vx:latest
    steps:
      - uses: actions/checkout@v6
      - run: vx node --version
      - run: vx npm test
```
