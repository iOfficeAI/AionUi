<p align="center">
  <img src="packages/desktop/src/renderer/assets/logos/brand/wordmark.png" alt="Chisel" width="360" />
</p>

<p align="center">
  <strong>An OpenCode remote-server-first interface forge for coding agents.</strong>
</p>

<p align="center">
  <img src="packages/desktop/src/renderer/assets/logos/brand/app.png" alt="Chisel app icon" width="72" />
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-b4480c?style=flat-square" /></a>
  <img alt="OpenCode Remote" src="https://img.shields.io/badge/OpenCode-remote%20server-b4480c?style=flat-square" />
  <img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-supported-607848?style=flat-square" />
  <img alt="Gemini CLI" src="https://img.shields.io/badge/Gemini%20CLI-supported-305460?style=flat-square" />
  <img alt="Codex" src="https://img.shields.io/badge/Codex-supported-c08418?style=flat-square" />
</p>

<p align="center">
  <strong>Chisl palette</strong><br />
  <img alt="rust #b4480c" src="https://img.shields.io/badge/rust-%23b4480c-b4480c?style=flat-square" />
  <img alt="parchment #f0e4b4" src="https://img.shields.io/badge/parchment-%23f0e4b4-f0e4b4?style=flat-square&labelColor=303024" />
  <img alt="ink #303024" src="https://img.shields.io/badge/ink-%23303024-303024?style=flat-square" />
  <img alt="olive #607848" src="https://img.shields.io/badge/olive-%23607848-607848?style=flat-square" />
  <img alt="slate #3c786c" src="https://img.shields.io/badge/slate-%233c786c-3c786c?style=flat-square" />
</p>

---

## What Chisel Does

Chisel gives coding agents a durable, remote-friendly interface. Run the agent environment on the machine that has your repositories, terminals, credentials, and tools; then drive it from the desktop app, a browser, or the mobile companion.

The main target is **OpenCode remote server** usage: Chisel turns a remote OpenCode session into a richer command center with chat, workspace files, permission handling, mode switching, model visibility, and mobile/browser access.

It also supports local agent workflows for:

| Agent          | Typical use                                                      |
| -------------- | ---------------------------------------------------------------- |
| OpenCode local | Run OpenCode directly on the current machine.                    |
| Claude Code    | Work with Claude Code sessions from the same Chisel interface.   |
| Gemini CLI     | Start and continue Gemini CLI-backed coding sessions.            |
| Codex          | Use Codex sessions with workspace, tool-call, and permission UI. |

## Why It Exists

Terminal-first coding agents are powerful, but raw terminals are not enough once you want to run them all day, from multiple devices, across multiple repositories.

Chisel adds the missing interface layer:

| Problem                                                         | Chisel answer                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Agents run on a remote box, but you are not always on that box. | Browser WebUI and mobile access over the Chisel server.                                 |
| Terminal output is hard to inspect later.                       | Persistent conversations, grouped history, streaming messages, and searchable sessions. |
| Tool calls and permission prompts need supervision.             | Dedicated permission, tool-call, and confirmation UI.                                   |
| Agents edit files, but you need context.                        | Workspace browser, file picker, code/markdown/diff/image previews, and file mentions.   |
| Different CLIs have different modes and model surfaces.         | One control plane for modes, models, messages, and session metadata.                    |
| You want to extend the interface.                               | Extension hooks for agents, tools, skills, themes, settings, and WebUI surfaces.        |

## Product Surfaces

### Remote Server

Chisel can run as a server-backed WebUI for a workstation, homelab, cloud VM, or development box. This is the preferred shape for remote OpenCode usage.

Use it when you want to:

| Goal                                | Result                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| Keep agents running near your code. | The server process has access to the workspace and local CLI tools. |
| Use Chisel from another machine.    | Open the WebUI in a browser.                                        |
| Check progress from a phone.        | Connect the mobile app with a QR login link.                        |
| Avoid exposing raw terminals.       | Interact through chat, file, preview, and confirmation screens.     |

### Desktop App

The desktop app is the full local control surface. It is useful when you are actively developing on the same machine as the agents.

It provides:

| Capability                 | Notes                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Agent launcher             | Start new sessions with supported local and remote agents.                               |
| Conversation workspace     | Chat, stream responses, inspect tool calls, stop runs, and continue history.             |
| File context               | Attach files, mention files, browse workspaces, and preview generated or edited files.   |
| Terminal-adjacent workflow | Keep the agent workflow close to the codebase without living entirely inside a terminal. |
| WebUI control              | Enable browser/mobile access, remote binding, passwords, and QR login.                   |
| Display control            | Switch between Gruvbox and Chisl color schemes, light/dark mode, and custom CSS themes.  |

### Browser WebUI

The WebUI serves Chisel in a browser and is designed for remote access. It supports password authentication and QR login for mobile pairing.

Common uses:

| Use               | Example                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| LAN access        | Run Chisel on a dev box and use it from a laptop or tablet.                |
| Server access     | Keep Chisel running on a remote machine with your agent tooling installed. |
| Mobile handoff    | Generate a QR login link and connect the mobile app.                       |
| Headless workflow | Use Chisel without launching the Electron desktop shell.                   |

### Mobile Companion

The mobile app is for monitoring and lightweight control, not replacing a full desktop IDE.

It can:

| Capability            | Notes                                                            |
| --------------------- | ---------------------------------------------------------------- |
| Connect by QR code    | Pair with a Chisel WebUI/server session.                         |
| Browse conversations  | Review history and current agent activity.                       |
| Send messages         | Continue a session from your phone.                              |
| Approve confirmations | Respond to permission and tool prompts while away from the desk. |
| Inspect files         | View workspace files, markdown, code, diffs, HTML, and images.   |

## Agent Workflows

### OpenCode Remote First

Chisel is optimized around OpenCode running remotely. The server stays close to the repository and OpenCode runtime; the UI can be somewhere else.

Remote OpenCode sessions get the richer parts of the interface:

| Feature                   | What it means                                                           |
| ------------------------- | ----------------------------------------------------------------------- |
| Remote session continuity | Continue work without tying the UI to one terminal window.              |
| Build/plan mode control   | Switch OpenCode modes from the UI where supported.                      |
| Model metadata            | Show the model/provider reported by the remote session when available.  |
| Slash-command support     | Surface OpenCode command affordances where the session supports them.   |
| Workspace file context    | Add files and browse the remote workspace through the Chisel interface. |

### Local CLI Agents

Chisel also works as a local front-end for supported CLI agents. Install and authenticate the CLI you want to use, then select it in Chisel when starting a session.

Supported local workflows currently include:

| Workflow       | Notes                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Claude Code    | Uses your local Claude Code setup and permissions.                       |
| OpenCode local | Runs OpenCode on the same machine as Chisel.                             |
| Gemini CLI     | Uses Gemini CLI-backed sessions and Gemini-oriented modes.               |
| Codex          | Uses Codex sessions with Chisel's conversation and permission interface. |

## Core Features

| Feature                  | Description                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| Multi-agent entry point  | Choose from remote OpenCode and supported local CLIs from one interface.        |
| Persistent conversations | Keep session history organized by workspace and agent.                          |
| Streaming chat           | Watch agent output as it happens and stop active runs when needed.              |
| Permission handling      | Review and answer confirmations without digging through terminal output.        |
| Tool-call summaries      | Inspect what the agent is doing at a higher level.                              |
| Workspace browser        | Browse directories, read files, preview images, and inspect diffs.              |
| File mentions            | Add precise file context to prompts from the workspace.                         |
| Model and mode controls  | Adjust supported agent modes and view model/provider information.               |
| MCP tools and skills     | Add tool servers and reusable skills for agent workflows.                       |
| Extensions               | Contribute agents, adapters, tools, themes, settings tabs, and WebUI additions. |
| Channels                 | Connect supported messaging channels for assistant interactions.                |
| Themes                   | Use the warm Chisl palette, Gruvbox, dark/light mode, or custom CSS.            |

## Branding

The README uses the same in-repo brand assets as the application.

| Asset         | Path                                                                 |
| ------------- | -------------------------------------------------------------------- |
| Wordmark      | `packages/desktop/src/renderer/assets/logos/brand/wordmark.png`      |
| App mark      | `packages/desktop/src/renderer/assets/logos/brand/app.png`           |
| Gray wordmark | `packages/desktop/src/renderer/assets/logos/brand/wordmark-gray.png` |
| Packaged icon | `resources/app.png`                                                  |
| PWA icons     | `public/pwa/icon-192.png`, `public/pwa/icon-512.png`                 |

The Chisl color scheme is a muted retro palette sampled from the logo and wordmark.

| Role              | Light     | Dark      |
| ----------------- | --------- | --------- |
| Rust primary      | `#b4480c` | `#e07820` |
| Parchment surface | `#f0e4b4` | `#28241d` |
| Ink text          | `#303024` | `#ecdfb6` |
| Olive success     | `#607848` | `#8aa860` |
| Gold warning      | `#c08418` | `#e4b430` |
| Slate info        | `#3c786c` | `#6caa9c` |

## Quick Start

### Requirements

| Requirement         | Notes                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Node.js             | `>=22 <25`                                                                                               |
| Bun                 | Used for install and project scripts.                                                                    |
| Supported agent CLI | Install and authenticate OpenCode, Claude Code, Gemini CLI, or Codex depending on the workflow you want. |
| Remote access       | For remote use, run Chisel where the repositories and agent CLI credentials live.                        |

Install dependencies:

```bash
bun install
```

Run the desktop app:

```bash
bun run dev
```

Run the browser WebUI locally:

```bash
bun run webui
```

Run the WebUI for remote/LAN access:

```bash
bun run webui:remote
```

Reset the WebUI password:

```bash
bun run resetpass
```

Build the app:

```bash
bun run package
```

## Mobile Quick Start

```bash
cd mobile
bun install
bun run start
```

Then open Chisel desktop or WebUI settings, generate a QR login link, and scan it from the mobile app.

## Useful Commands

| Command                | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `bun run dev`          | Start the desktop app in development mode. |
| `bun run webui`        | Start local WebUI mode.                    |
| `bun run webui:remote` | Start WebUI with remote access enabled.    |
| `bun run resetpass`    | Reset the WebUI password.                  |
| `bun run package`      | Build app output.                          |
| `bun run dist`         | Create packaged desktop artifacts.         |
| `bun run lint`         | Run lint checks.                           |
| `bun run format:check` | Check formatting.                          |
| `bunx tsc --noEmit`    | Type-check.                                |
| `bun run test`         | Run tests.                                 |

## Configuration Notes

| Topic               | Notes                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| WebUI port          | Use `AIONUI_PORT` to override the default port.                                      |
| Remote binding      | Use `bun run webui:remote` or configure remote access from desktop settings.         |
| Static WebUI assets | Use `AIONUI_STATIC_DIR` when serving a prebuilt renderer bundle.                     |
| Backend binary      | Use `AIONUI_BACKEND_BIN` when you need to point Chisel at a specific backend binary. |
| Data directory      | Use `AIONUI_DATA_DIR` for an isolated server data directory.                         |

Some environment variable and script names still contain `AIONUI` for compatibility with the existing app/runtime packaging.

## Development Checks

Before opening or pushing changes, the most useful local checks are:

```bash
bun run lint
bun run format:check
bunx tsc --noEmit
bun run test
```

If you change user-facing text or locale files, also run:

```bash
bun run i18n:types
node scripts/check-i18n.js
```

## Documentation

| Topic                | Path                                  |
| -------------------- | ------------------------------------- |
| Contributor guide    | `CONTRIBUTING.md`                     |
| Development setup    | `docs/contributing/development.md`    |
| File structure rules | `docs/contributing/file-structure.md` |
| WebUI guide          | `docs/guides/webui.md`                |
| Server deployment    | `docs/guides/deploy-server.md`        |
| Hub testing          | `docs/guides/hub-testing.md`          |

## Status

Chisel is moving quickly. The current center of gravity is remote OpenCode operation with a desktop/browser/mobile interface on top, while local Claude Code, OpenCode, Gemini CLI, and Codex workflows remain supported.

Expect some internal names, package metadata, and environment variables to lag behind the Chisel branding while the product surface stabilizes.

## License

Licensed under [Apache-2.0](LICENSE).
