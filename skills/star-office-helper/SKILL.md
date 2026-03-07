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
