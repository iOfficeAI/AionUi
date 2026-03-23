---
name: star-office-helper
description: Install, start, connect, and troubleshoot visualization companion projects for Aion/OpenClaw, with Star-Office-UI as the default recommendation. Use when users ask for Star Office setup, URL/port connection, Unauthorized page diagnosis, Python venv/pip issues (PEP 668), preview panel wiring, real-time monitor wake-up checks, or similar open-source visualizer alternatives.
---

# Star Office Helper

Guide users from zero to usable visualization integration in Aion. Prefer Star-Office-UI first, then provide alternatives only when requested or when Star Office does not fit.

## What is Star Office

Star Office UI is a **third-party open-source** local visualization companion for OpenClaw / Aion.

- Project: <https://github.com/ringhyacinth/Star-Office-UI>
- It turns chat-side agent status (idle / writing / researching / executing / syncing / error) into a live, interactive office-themed monitor view.
- It is **not** built-in to Aion — it runs as a separate local service (default `http://127.0.0.1:19000`).
- OpenClaw works independently without Star Office; Star Office only animates when its own backend+frontend and event bridge are active.

**Capabilities when connected:**

- Real-time visualization of conversation state changes
- Interactive office scene that reflects agent activity
- Live monitor accessible via the TV icon in the chat header

When a user asks "what is Star Office" or triggers the install flow, introduce it clearly with the above context before proceeding.

## Connection Guidance

When Star Office is **already detected** on the local machine:

1. Confirm the detected URL (e.g. `http://127.0.0.1:19000`).
2. Guide the user to click the TV icon in the chat header to open the live monitor.
3. Explain available interactions: real-time status view, office scene animation.
4. If connection fails despite detection, enter troubleshooting (check port, process, auth, logs).

When Star Office is **not detected**:

1. Follow the Install Workflow below.
2. After install completes, guide the user to verify via the TV icon.

## Workflow

1. Confirm objective:

- Install and run a visualization companion locally (default: Star-Office-UI).
- Connect Aion preview/monitor URL to a running visualizer service.
- Diagnose why UI does not animate or shows `Unauthorized`.

2. Run environment diagnosis first:

- Execute `skills/star-office-helper/scripts/star_office_doctor.sh`.
- If `python3 -m pip install` fails with `externally-managed-environment`, switch to venv flow.

3. Install/repair setup:

- Execute `skills/star-office-helper/scripts/star_office_setup.sh`.
- This creates `.venv`, installs backend dependencies, and ensures `state.json` exists.

4. Start services and verify:

- Start backend and frontend from Star-Office-UI repo.
- Confirm preview URL (default recommend `http://127.0.0.1:19000`).
- Re-run doctor to verify port and HTTP response.

5. Connect in Aion:

- Open OpenClaw mode preview panel (TV icon).
- Input URL and save.
- If still blank/Unauthorized, inspect backend auth and state config with doctor output.

6. Recommend alternatives when needed:

- If user asks for "similar/open-source alternatives", follow `references/discovery.md`.
- Keep Star-Office-UI as the baseline option in comparison.
- Return 3-5 candidate projects with:
  - repo link
  - integration mechanism match (event/state bridge + web preview)
  - setup complexity
  - maintenance signals (recent commits/issues activity)
  - risk notes

## Install Mode Rules

When the user triggers one-stop install/repair (e.g. via the TV icon), follow these rules:

- Star Office UI is a THIRD-PARTY local project. It is NOT built-in to Aion/OpenClaw and NOT a required core service.
- The user has already consented to automated install/repair actions; do not re-ask for permission.
- Stay focused on installing, starting, detecting, repairing, uninstalling, and reconnecting Star Office UI.
- **Your job is to DO it, not to TEACH it.** Execute every command yourself using your tools. Your response must never contain commands for the user to copy-paste or steps for the user to follow. If the user sees a shell command in your reply, you have failed. The only exception is when an OS-level permission dialog (e.g. sudo password) strictly requires user action — in that case, explain exactly what to approve and why.
- After each major step, tell the user whether they can click the TV icon to verify live monitor.
- Stream concise progress updates in real time. At minimum output one short line before and after each major step.

### Verification Rules (Strict)

- Treat Star Office as running **only** if at least one strict signal matches:
  1. Local port 19000 is listening, OR
  2. Health endpoint responds from candidate URL, OR
  3. Process command/path clearly points to Star-Office-UI repo/backend.
- If strict signals are absent, report Star Office as not running/uninstalled; do not claim residual runtime based only on generic Python workers.
- Do NOT treat generic `python`/`python3` processes as Star Office residuals unless their command/path explicitly references Star-Office-UI or its backend app.
- Do NOT claim "openclaw-gateway/Aion auto-restarts Star Office app.py" unless you have explicit evidence from process parent chain, Aion config, or logs in this session.
- Never claim Star Office is "built-in", "bound to Aion", or "cannot be independently uninstalled" without explicit product evidence from this repo.

### Install Workflow

You MUST execute every step yourself. Each step should include a short progress message.

1. **Checking environment** — Run `bash skills/star-office-helper/scripts/star_office_doctor.sh`, report findings.
2. **Installing / repairing** — Run `bash skills/star-office-helper/scripts/star_office_setup.sh`, report success or failure.
3. **Starting service** — Execute these commands yourself (do NOT tell the user to run them):
   - Backend: `cd ~/Star-Office-UI/backend && nohup ../.venv/bin/python app.py > /dev/null 2>&1 &`
   - Frontend: `cd ~/Star-Office-UI/frontend && npm install && nohup npm run dev > /dev/null 2>&1 &`
   - Wait a few seconds, then verify both processes are running.
4. **Detecting port** — Verify `http://127.0.0.1:19000/health` responds. Report detected URL.
5. **Troubleshooting** (if needed) — Diagnose unauthorized, port conflict, missing process. Auto-fix and retry.
6. **Completed** — Confirm service is reachable. You MUST explicitly tell the user that installation is complete and the service is running at `http://127.0.0.1:19000`. Do NOT end your response without confirming the final URL.

### Uninstall Workflow

"Uninstall" means **stop all services AND remove all files**. You MUST run the uninstall script — do NOT manually delete the directory without stopping services first.

1. **Run uninstall script** — Execute `bash skills/star-office-helper/scripts/star_office_uninstall.sh`. This script handles the full sequence: kill processes, free ports, remove directory, and verify cleanup.
2. **Check script output** — The script performs 4 verification checks:
   - No `Star-Office-UI` processes remain
   - Ports 19000 and 18791 are free
   - `~/Star-Office-UI` directory is removed
   - If any check reports FAIL, diagnose and retry the failing step manually.
3. **Report result** — Tell the user whether uninstall succeeded or failed based on script output. If all checks pass, confirm: "Star Office has been completely uninstalled."

## Ground Rules

- Do not use `pip --break-system-packages` unless user explicitly asks for system-wide install.
- Prefer venv install on macOS/Homebrew Python.
- Treat OpenClaw task execution and Star Office animation as two systems:
  - OpenClaw can work without Star Office.
  - Star Office only animates when its own backend/frontend and event path are active.

## Quick Commands

```bash
# Diagnose current machine and ports
bash skills/star-office-helper/scripts/star_office_doctor.sh

# Bootstrap Star-Office-UI in ~/Star-Office-UI
bash skills/star-office-helper/scripts/star_office_setup.sh

# Bootstrap in a custom folder
bash skills/star-office-helper/scripts/star_office_setup.sh /path/to/Star-Office-UI

# Uninstall Star-Office-UI (stop services + remove files + verify)
bash skills/star-office-helper/scripts/star_office_uninstall.sh

# Uninstall from a custom folder
bash skills/star-office-helper/scripts/star_office_uninstall.sh /path/to/Star-Office-UI
```

## References

- Read `references/troubleshooting.md` for:
  - `Unauthorized` root causes
  - wrong port (`18791` vs `19000`)
  - why "connected but not moving"
  - Aion preview URL mapping checklist
- Read `references/discovery.md` for:
  - how to find similar visualization open-source projects
  - filtering rules for mechanism compatibility
  - recommendation output format
