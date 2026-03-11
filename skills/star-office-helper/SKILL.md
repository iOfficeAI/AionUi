---
name: star-office-helper
description: Install, start, connect, and troubleshoot visualization companion projects for Aion/OpenClaw, with Star-Office-UI as the default recommendation. Use when users ask for Star Office setup, URL/port connection, Unauthorized page diagnosis, Python venv/pip issues (PEP 668), preview panel wiring, real-time monitor wake-up checks, or similar open-source visualizer alternatives.
---

# Star Office Helper

Guide users from zero to usable visualization integration in Aion. Prefer Star-Office-UI first, then provide alternatives only when requested or when Star Office does not fit.

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
- Do not ask the user to manually type shell commands unless OS-level permission requires user action.
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

1. Run environment check first.
2. If missing/broken, install or repair automatically.
3. Start service and detect local URL/port.
4. If issues (unauthorized/port conflict), troubleshoot and retry.
5. End with concrete verification step via TV icon.

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
