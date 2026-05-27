# Star Office Troubleshooting

## 1. `Unauthorized` on `127.0.0.1:<port>`

Common causes:

- Backend started but session/auth state not initialized.
- Opened backend port directly instead of frontend port.
- `state.json` missing or invalid.

Actions:

1. Ensure `state.json` exists (copy from `state.sample.json` if needed).
2. Start backend with venv Python:
   - `cd backend && ../.venv/bin/python app.py`
3. Open frontend URL (usually `http://127.0.0.1:19000`) instead of backend API port.
4. Run `bash skills/star-office-helper/scripts/star_office_doctor.sh` and check port + HTTP status.

## 2. `pip install` fails with `externally-managed-environment`

Cause:

- macOS/Homebrew Python follows PEP 668 and blocks system-wide pip write.

Fix:

1. `python3 -m venv .venv`
2. `.venv/bin/python -m pip install --upgrade pip`
3. `.venv/bin/python -m pip install -r backend/requirements.txt`

Avoid:

- `--break-system-packages` unless user explicitly requires system install.

## 3. Aion connected but preview does not move

Cause:

- Aion can talk to OpenClaw, but Star Office is only a visualization layer.
- No event bridge from OpenClaw task stream to Star Office backend.
- Wrong preview URL.

Checklist:

1. Confirm Star Office frontend port (default `19000`) is reachable.
2. Confirm backend is running and receiving events.
3. Confirm Aion preview panel URL exactly matches frontend URL.
4. Trigger a real OpenClaw task and observe backend logs.

## 4. Port confusion (`18791` vs `19000`)

Typical mapping:

- `18791`: backend/service/auth endpoint (may return `Unauthorized`).
- `19000`: frontend visual UI for browser preview.

Rule:

- In Aion preview panel, use frontend URL.
