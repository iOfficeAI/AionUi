# Chisel

> A team of AI agents that build code together.

Chisel is an **agentic coding platform** built around multiple AI agents collaborating on your codebase. Where tools like Cursor, Aider, and Cline pair you with a single agent, Chisel coordinates a team — planner, coder, reviewer, tester — working in parallel on different parts of your project.

This repository (`chisel-ui`) is the desktop client. The Rust backend lives in [`chisel-core`](https://github.com/schlambos/chisel-core).

---

## Status

**Early-stage personal project.** Not ready for general use. The codebase is changing fast and the public surface is unstable. If you’re here from a link or search, expect rough edges.

No releases yet. No installer. No docs. No tests of brand promises. Don’t file feature requests yet.

---

## Why Chisel

Most agentic coding tools assume a single agent handles everything: read the code, plan the change, write it, verify it. That’s a useful abstraction, and it works for small changes — but a single LLM context has to juggle planning, recall, edits, and review all at once, and quality drops as scope grows.

Chisel bets the other direction: **specialization beats generalism at the agent layer too.** A planner that only plans, a coder that only edits, a reviewer that only critiques. Each agent gets a focused context window, a focused prompt, and a focused job. The platform handles the handoffs.

That’s the thesis. Whether it pans out is what this project is for.

---

## Architecture

Chisel is a desktop application with a separate backend service:

| Repo                                                              | What it is                                                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`chisel-ui`](https://github.com/schlambos/chisel-ui) (this repo) | Electron + React desktop client. The window you interact with.                                                                      |
| [`chisel-core`](https://github.com/schlambos/chisel-core)         | Rust backend (Axum + Tokio). Owns agent orchestration, remote agent protocols, conversation state, and IPC with the desktop client. |

The two run as separate processes and communicate over a local socket / HTTP. Agents themselves run either embedded in `chisel-core` or as external CLI tools (Claude Code, Codex, OpenCode, etc.) that Chisel detects and routes work to.

---

## Heritage

Chisel is a personal-project fork of [AionUi](https://github.com/iOfficeAI/AionUi) and [AionCore](https://github.com/iOfficeAI/AionCore) by iOfficeAI. The desktop multi-agent foundation is borrowed from that project. The repositioning toward agentic coding — feature focus, branding, product direction — is the divergence. **Not affiliated with the AionUi project or its maintainers.**

If you’re looking for the original AionUi product (a general-purpose multi-agent cowork platform with office productivity assistants), go to the upstream — that’s a different product solving a different problem.

---

## License

Inherits [Apache-2.0](LICENSE) from the upstream AionUi project. See `LICENSE` for terms.
