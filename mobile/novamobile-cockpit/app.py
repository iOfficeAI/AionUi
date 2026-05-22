#!/usr/bin/env python3
from __future__ import annotations

import hmac
import json
import os
import re
import shlex
import subprocess
import time
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
HEALTH_JSON = Path(os.environ.get("NOVAMOBILE_HEALTH_JSON", "/run/novamaster/health.json"))
DISCORD_DIR = Path(os.environ.get("NOVAMOBILE_DISCORD_DIR", "/root/novamaster/services/discord-secretary"))
NOIZ_HEALTH_URL = os.environ.get("NOVAMOBILE_NOIZ_HEALTH_URL", "http://127.0.0.1:8118/health")
DEFAULT_LINES = int(os.environ.get("NOVAMOBILE_DEFAULT_LOG_LINES", "80"))
COMMAND_TIMEOUT = int(os.environ.get("NOVAMOBILE_COMMAND_TIMEOUT", "90"))

SERVICE_ALLOWLIST = {
    "discord-secretary": "discord-secretary.service",
    "noiz": "nova-noiz-tts-bridge.service",
    "hermes": "hermes-gateway.service",
    "hermes-office": "hermes-office.service",
    "openclaw": "openclaw.service",
    "agent-spawner": "nova-agent-spawner.service",
    "novarouter": "novarouter.service",
    "www": "novamaster-www.service",
    "cloudflared": "cloudflared.service",
}

SECRET_PATTERNS = [
    re.compile(r"(?i)(token|secret|api[_-]?key|authorization|password)=\S+"),
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+"),
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"pk_[A-Za-z0-9_-]{12,}"),
]

security = HTTPBasic()
app = FastAPI(title="NovaMobile Cockpit API", version="0.1.0")


class ActionRequest(BaseModel):
    message: str = Field(default="Faramix, Nova Secretary draait op de VPS.", max_length=500)


def redact(text: str) -> str:
    clean = text
    for pattern in SECRET_PATTERNS:
        clean = pattern.sub(lambda m: f"{m.group(1) if m.lastindex else 'secret'}=<redacted>", clean)
    return clean


def auth_user(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    expected_user = os.environ.get("NOVAMOBILE_EMAIL", "").strip()
    expected_password = os.environ.get("NOVAMOBILE_PASSWORD", "").strip()
    if not expected_user or not expected_password:
        raise HTTPException(status_code=503, detail="NovaMobile credentials are not configured")
    user_ok = hmac.compare_digest(credentials.username, expected_user)
    pass_ok = hmac.compare_digest(credentials.password, expected_password)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Basic"})
    return credentials.username


def run(cmd: list[str], timeout: int = COMMAND_TIMEOUT) -> dict[str, Any]:
    started = time.time()
    proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    return {
        "ok": proc.returncode == 0,
        "exit": proc.returncode,
        "ms": round((time.time() - started) * 1000),
        "output": redact(proc.stdout.strip()),
    }


def run_shell(script: str, timeout: int = COMMAND_TIMEOUT) -> dict[str, Any]:
    return run(["bash", "-lc", script], timeout=timeout)


def service_unit(name: str) -> str:
    unit = SERVICE_ALLOWLIST.get(name)
    if not unit:
        raise HTTPException(status_code=404, detail="service is not in allowlist")
    return unit


def service_state(name: str) -> dict[str, Any]:
    unit = service_unit(name)
    active = run(["systemctl", "is-active", unit], timeout=8)
    enabled = run(["systemctl", "is-enabled", unit], timeout=8)
    return {
        "name": name,
        "unit": unit,
        "active": active["output"] or "unknown",
        "enabled": enabled["output"] or "unknown",
        "ok": active["exit"] == 0,
    }


def read_health() -> dict[str, Any]:
    if not HEALTH_JSON.exists():
        return {"ok": False, "error": "health json missing", "path": str(HEALTH_JSON)}
    try:
        return json.loads(HEALTH_JSON.read_text())
    except Exception as exc:
        return {"ok": False, "error": f"health json invalid: {exc}", "path": str(HEALTH_JSON)}


def noiz_health() -> dict[str, Any]:
    probe = run(["curl", "-fsS", "--max-time", "5", NOIZ_HEALTH_URL], timeout=8)
    if not probe["ok"]:
        return {"ok": False, "error": probe["output"]}
    try:
        data = json.loads(probe["output"])
    except Exception:
        data = {"raw": probe["output"]}
    return {"ok": True, **data}


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "service": "novamobile-cockpit"}


@app.get("/")
def index(_: str = Depends(auth_user)) -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/session")
def session(user: str = Depends(auth_user)) -> dict[str, Any]:
    return {"ok": True, "email": user}


@app.get("/api/status")
def status(_: str = Depends(auth_user)) -> dict[str, Any]:
    health = read_health()
    services = [service_state(name) for name in SERVICE_ALLOWLIST]
    return {
        "ok": bool(health.get("ok")) and all(s["ok"] for s in services if s["name"] in {"discord-secretary", "noiz"}),
        "timestamp": int(time.time()),
        "host": health.get("host"),
        "health": {
            "ok": health.get("ok"),
            "timestamp": health.get("timestamp"),
            "loadavg": health.get("loadavg"),
            "disk": health.get("disk"),
            "memory": health.get("memory"),
            "failedUnits": health.get("failedUnits", []),
            "highRiskExposureCount": health.get("highRiskExposureCount"),
        },
        "services": services,
        "noiz": noiz_health(),
    }


@app.get("/api/logs/{name}")
def logs(
    name: str,
    lines: int = Query(DEFAULT_LINES, ge=10, le=500),
    _: str = Depends(auth_user),
) -> dict[str, Any]:
    unit = service_unit(name)
    result = run(["journalctl", "-u", unit, "--no-pager", "-n", str(lines)], timeout=15)
    return {"ok": result["ok"], "service": name, "unit": unit, "lines": lines, "output": result["output"]}


@app.post("/api/services/{name}/restart")
def restart_service(name: str, _: str = Depends(auth_user)) -> dict[str, Any]:
    unit = service_unit(name)
    result = run(["systemctl", "restart", unit], timeout=45)
    state = service_state(name)
    return {"ok": result["ok"] and state["ok"], "service": name, "unit": unit, "restart": result, "state": state}


@app.post("/api/actions/noiz-smoke")
def action_noiz_smoke(_: str = Depends(auth_user)) -> dict[str, Any]:
    output = "/tmp/novamobile-noiz-smoke.mp3"
    result = run(["python3", "/root/bin/nova-noiz-tts-bridge", "smoke", "--output", output], timeout=90)
    size = Path(output).stat().st_size if Path(output).exists() else 0
    return {"ok": result["ok"] and size > 512, "bytes": size, "result": result}


@app.post("/api/actions/secretary-call")
def action_secretary_call(payload: ActionRequest, _: str = Depends(auth_user)) -> dict[str, Any]:
    message = shlex.quote(payload.message)
    script = f"""
set -euo pipefail
cd {shlex.quote(str(DISCORD_DIR))}
systemctl stop discord-secretary.service
set -a
. ./.env
set +a
status=0
timeout 80 node index.js --voice-smoke "$DISCORD_CALL_CHANNEL_ID" {message} || status=$?
systemctl start discord-secretary.service
exit "$status"
"""
    result = run_shell(script, timeout=100)
    state = service_state("discord-secretary")
    return {"ok": result["ok"] and state["ok"], "result": result, "state": state}


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": exc.detail}, headers=exc.headers)


@app.exception_handler(Exception)
async def exception_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"ok": False, "error": redact(str(exc))})


@app.get("/robots.txt")
def robots() -> PlainTextResponse:
    return PlainTextResponse("User-agent: *\nDisallow: /\n")
