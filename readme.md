<p align="center">
  <img src="packages/desktop/src/renderer/assets/logos/brand/wordmark.png" alt="Chisl" width="360" />
</p>

<p align="center">
  <strong>A desktop interface forge for OpenCode remote agents and local coding-agent CLIs.</strong>
</p>

<p align="center">
  <img src="packages/desktop/src/renderer/assets/logos/brand/app.png" alt="Chisl app icon" width="72" />
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-b4480c?style=flat-square" /></a>
  <img alt="OpenCode Remote" src="https://img.shields.io/badge/OpenCode-remote%20agent-b4480c?style=flat-square" />
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

## What Chisl Does

Chisl is a desktop client for driving coding agents through a durable UI instead of a raw terminal. Its primary path is connecting to a registered **OpenCode remote agent**, and it also drives local CLI-backed agents. Project files, secrets, and tools come from whatever agent runtime and MCP connectors you configure — Chisl doesn't lock you into a layout.

Supported agents:

| Workflow              | What Chisl exposes                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenCode remote agent | Register a remote endpoint, test/handshake it, fetch model metadata, send messages, attach files, use OpenCode modes, slash commands, stop active runs, and inspect context usage when reported. |
| OpenCode local        | Use a detected local OpenCode-style agent from the same chat interface.                                                                                                                          |
| Claude Code           | Use detected Claude Code sessions through the local-agent flow.                                                                                                                                  |
| Gemini CLI            | Use Gemini CLI-backed sessions and Gemini modes.                                                                                                                                                 |
| Codex                 | Use Codex sessions with Chisl conversation, tool-call, and permission UI.                                                                                                                        |
| Custom local agent    | Define an ACP-style command, args, env, icon, and advanced settings from the Agent settings page.                                                                                                |

## Features

| Capability            | What you can do                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote agent registry | Add, edit, delete, and list remote agents — name, protocol, URL, auth (token or basic), avatar, description, insecure-TLS toggle — and test/handshake before saving.     |
| Model selection       | Refresh and pick from the models a connected OpenCode server advertises.                                                                                                |
| Unified agent picker  | Remote agents sit alongside detected local agents on the start page.                                                                                                    |
| Chat & context        | Send prompts with attached files and selected workspace items; see token/context usage when the agent reports it.                                                       |
| Command queue         | Queue, reorder, pause, resume, edit, remove, or clear prompts while a run is busy.                                                                                       |
| Run control           | Stop an active run, switch OpenCode modes, attach server-side skills (sticky across messages), and use slash commands.                                                   |
| Session actions       | Fork, revert/restore, share/unshare a link, summarize/compact, view file changes (diff), and edit the server config — all from the conversation header.                 |
| Compaction            | Get notified (with tokens reclaimed) when a session is compacted, manually or automatically.                                                                            |
| Server-state pills    | See the connected server (with one-click switch) and tool-host mode; in server-tool-host mode, LSP status and VCS branch/changes too.                                    |
| Multi-server          | Live per-agent health in settings and a default-server preference.                                                                                                      |
| Permissions & approvals | Approve tool and question requests via per-request cards, a pending banner, and a dedicated Approvals tab — including bulk approve.                                    |
| Sub-agents            | Watch delegated child sessions as inline, collapsible subtask cards.                                                                                                    |
| Message editing       | Edit or delete your own messages in a remote conversation.                                                                                                              |
| Local & custom agents | Use detected local CLIs (Claude Code, Gemini CLI, Codex, local OpenCode), or define your own ACP-style command agent.                                                   |
| MCP & tools           | Add, import, edit, enable/disable, test, authenticate, and sync MCP servers; configure speech-to-text.                                                                  |
| Skills                | Browse built-in, custom, and extension skills; import folders or symlinks; search, refresh, and delete.                                                                 |
| Appearance            | Ships with Chisl's retro palette; a toggle hands control to a CSS theme preset (Catppuccin included).                                                                    |

## Remote OpenCode Flow

Configure the remote OpenCode path as a remote-agent entry in Agent settings.

| Step               | What happens                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Register endpoint  | Add a remote agent with protocol `opencode`, a URL, an auth type, and an optional token/password.                                    |
| Test connection    | The settings modal can test the endpoint before you save.                                                                            |
| Save and handshake | Saving an OpenCode remote agent runs a handshake.                                                                                    |
| Select in chat     | The agent shows up in the start-page picker alongside your local agents.                                                             |
| Fetch models       | Refresh the model list the server advertises.                                                                                        |
| Chat               | Send prompts, attaching files and selected workspace items as needed.                                                                |
| Control the run    | Stop a run, queue more prompts, switch modes, attach skills.                                                                          |
| Manage the session | Fork, revert/restore, share/unshare, summarize/compact, view file changes, or edit the server config from the conversation header.   |
| Inspect server state | In server-tool-host mode, header pills show the connected server (with quick-switch), LSP status, and VCS branch/changes; permission and question prompts route to the Approvals tab. |

## Local Agent Flow

Local CLI-backed agents are a secondary path.

| Feature          | Behavior                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Detected agents  | The Agent settings page reads detected local agents and shows them as chat targets.                                   |
| Custom agents    | Users can define a command, args, env, icon, and advanced options for a custom agent.                                 |
| Agent launch     | The start page restores or preselects available agents and routes to conversation creation.                           |
| Modes and models | The start page resolves mode/model metadata from agent config, handshake data, or remote model cache where available. |

## MCP, Skills, And Context

Chisl includes UI for managing MCP servers and skills — this is where tools and context come from, rather than any fixed filesystem or secret layout.

| Area        | Behavior                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| MCP servers | Add, import, edit, delete, enable/disable, test, authenticate, and sync MCP servers to agents.          |
| Skills      | Browse built-in/custom/extension skills, import skill folders, search, refresh, and delete user skills. |
| Voice       | Configure speech-to-text providers for voice input.                                                     |

## Branding

Brand assets live in the repo and are shared with the application.

| Asset         | Path                                                                 |
| ------------- | -------------------------------------------------------------------- |
| Wordmark      | `packages/desktop/src/renderer/assets/logos/brand/wordmark.png`      |
| App mark      | `packages/desktop/src/renderer/assets/logos/brand/app.png`           |
| Gray wordmark | `packages/desktop/src/renderer/assets/logos/brand/wordmark-gray.png` |
| Packaged icon | `resources/app.png`                                                  |

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

Install dependencies:

```bash
bun install
```

Run the desktop app:

```bash
bun run dev
```

Build the app output:

```bash
bun run package
```

Create packaged desktop artifacts:

```bash
bun run dist
```

## Development Checks

Useful local checks:

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

## Status

Chisl is under active development.

## License

Licensed under [Apache-2.0](LICENSE).

## Attribution

Chisl is derived from an Apache-2.0 licensed project. Substantial modifications have been made, including changes to branding, UI, workflows, agent integrations, and application behavior.

Original copyright and license notices are preserved in accordance with the Apache License 2.0.
