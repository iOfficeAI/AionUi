#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
AUTH_DIR = PROJECT_ROOT / ".auth"
DEFAULT_RUNTIME_METADATA_PATH = AUTH_DIR / "1688-browser-runtime.json"
DEFAULT_PROFILE_DIR = AUTH_DIR / "1688-chrome-profile"
DEFAULT_FETCH_LOCK_DIR = AUTH_DIR / "1688-playwright-fetch.lock"
DEFAULT_CDP_HOST = "127.0.0.1"
DEFAULT_CDP_PORT = 9222


def _platform_name() -> str:
    return sys.platform.lower()


def _process_exists(pid: int) -> bool:
    if not pid or int(pid) <= 0:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False


def detect_browser_executable(explicit_path: str = "") -> str:
    candidates = []
    for env_key in ("CHROME_PATH", "GOOGLE_CHROME_BIN", "EDGE_PATH"):
        value = (os.environ.get(env_key) or "").strip()
        if value:
            candidates.append(value)
    if explicit_path:
        candidates.insert(0, explicit_path)

    if _platform_name().startswith("darwin"):
        candidates.extend([
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ])
    elif _platform_name().startswith("win"):
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        program_files = os.environ.get("PROGRAMFILES", "")
        program_files_x86 = os.environ.get("PROGRAMFILES(X86)", "")
        candidates.extend([
            os.path.join(local_app_data, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(program_files, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(program_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(local_app_data, "Chromium", "Application", "chrome.exe"),
            os.path.join(program_files, "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(program_files_x86, "Microsoft", "Edge", "Application", "msedge.exe"),
        ])
    else:
        for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable", "chrome"):
            path = shutil.which(name)
            if path:
                candidates.append(path)

    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return ""


def normalize_cdp_endpoint(endpoint: str = "", port: int = DEFAULT_CDP_PORT, host: str = DEFAULT_CDP_HOST) -> str:
    endpoint = (endpoint or "").strip().rstrip("/")
    if endpoint:
        return endpoint
    return f"http://{host}:{int(port)}"


def probe_cdp_endpoint(endpoint: str) -> dict:
    endpoint = normalize_cdp_endpoint(endpoint)
    try:
        with urllib.request.urlopen(f"{endpoint}/json/version", timeout=2) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return {
            "status": "ready",
            "endpoint": endpoint,
            "browser": payload.get("Browser", ""),
            "web_socket_debugger_url": payload.get("webSocketDebuggerUrl", ""),
        }
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        return {
            "status": "unavailable",
            "endpoint": endpoint,
            "error": str(e),
        }


def wait_for_cdp_endpoint(endpoint: str, timeout: int = 20) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        status = probe_cdp_endpoint(endpoint)
        if status.get("status") == "ready":
            return status
        time.sleep(1)
    return {
        "status": "timeout",
        "endpoint": normalize_cdp_endpoint(endpoint),
    }


def resolve_browser_app_name(chrome_path: str) -> str:
    chrome_path = str(chrome_path or "")
    if "Canary" in chrome_path:
        return "Google Chrome Canary"
    if "Chromium" in chrome_path:
        return "Chromium"
    if "Edge" in chrome_path or "msedge" in chrome_path.lower():
        return "Microsoft Edge"
    return "Google Chrome"


def read_runtime_metadata(path: str = "") -> dict:
    target = Path(path or DEFAULT_RUNTIME_METADATA_PATH)
    if not target.exists():
        return {}
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_runtime_metadata(payload: dict, path: str = "") -> str:
    target = Path(path or DEFAULT_RUNTIME_METADATA_PATH)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload or {}, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(target)


def get_runtime_status(
    cdp_endpoint: str = "",
    metadata_path: str = "",
    cdp_port: int = DEFAULT_CDP_PORT,
) -> dict:
    resolved_metadata_path = str(Path(metadata_path or DEFAULT_RUNTIME_METADATA_PATH))
    runtime_meta = read_runtime_metadata(metadata_path)
    endpoint = normalize_cdp_endpoint(
        cdp_endpoint or str(runtime_meta.get("cdp_endpoint") or ""),
        port=cdp_port,
    )
    probe = probe_cdp_endpoint(endpoint)
    payload = {
        "status": probe.get("status", "unavailable"),
        "cdp_endpoint": endpoint,
        "probe": probe,
        "metadata_path": resolved_metadata_path,
        "metadata_exists": bool(Path(resolved_metadata_path).exists()),
        "runtime_metadata": runtime_meta,
        "user_data_dir": str(runtime_meta.get("user_data_dir") or ""),
        "chrome_path": str(runtime_meta.get("chrome_path") or ""),
        "chrome_pid": runtime_meta.get("chrome_pid"),
        "chrome_pid_running": _process_exists(int(runtime_meta.get("chrome_pid") or 0)),
        "platform": _platform_name(),
    }
    if probe.get("status") == "ready":
        payload["browser"] = probe.get("browser", "")
        payload["web_socket_debugger_url"] = probe.get("web_socket_debugger_url", "")
    return payload


def get_runtime_endpoint(default_endpoint: str = "") -> str:
    env_keys = [
        "ALIBABA_1688_CDP_ENDPOINT",
        "COOKIE_1688_CDP_ENDPOINT",
    ]
    for key in env_keys:
        value = (os.environ.get(key) or "").strip()
        if value:
            return value.rstrip("/")
    metadata = read_runtime_metadata()
    endpoint = str(metadata.get("cdp_endpoint") or "").strip()
    if endpoint:
        return endpoint.rstrip("/")
    return normalize_cdp_endpoint(default_endpoint)


def get_runtime_profile_dir() -> str:
    env_keys = [
        "ALIBABA_1688_CHROME_USER_DATA_DIR",
        "COOKIE_1688_CHROME_USER_DATA_DIR",
    ]
    for key in env_keys:
        value = (os.environ.get(key) or "").strip()
        if value:
            return value
    metadata = read_runtime_metadata()
    profile_dir = str(metadata.get("user_data_dir") or "").strip()
    if profile_dir:
        return profile_dir
    return str(DEFAULT_PROFILE_DIR)


def _is_port_free(port: int, host: str = DEFAULT_CDP_HOST) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex((host, int(port))) != 0


def choose_cdp_port(preferred_port: int = DEFAULT_CDP_PORT, host: str = DEFAULT_CDP_HOST) -> int:
    if _is_port_free(preferred_port, host=host):
        return int(preferred_port)
    for port in range(int(preferred_port) + 1, int(preferred_port) + 50):
        if _is_port_free(port, host=host):
            return port
    raise RuntimeError("No free CDP port available in scan range")


def build_browser_runtime_command(
    resolved_chrome_path: str,
    profile_dir: str,
    port: int,
    start_url: str,
) -> list[str]:
    if _platform_name().startswith("darwin"):
        return [
            "open",
            "-na",
            resolve_browser_app_name(resolved_chrome_path),
            "--args",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            start_url,
        ]
    return [
        resolved_chrome_path,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        start_url,
    ]


def launch_browser_runtime(
    chrome_path: str = "",
    user_data_dir: str = "",
    cdp_port: int = DEFAULT_CDP_PORT,
    start_url: str = "https://login.1688.com/member/signin.htm",
    metadata_path: str = "",
) -> dict:
    resolved_chrome_path = detect_browser_executable(chrome_path)
    if not resolved_chrome_path:
        return {"status": "error", "message": "No Chrome/Chromium/Edge executable detected"}

    profile_dir = str(user_data_dir or get_runtime_profile_dir())
    Path(profile_dir).mkdir(parents=True, exist_ok=True)
    port = choose_cdp_port(cdp_port)
    endpoint = normalize_cdp_endpoint(port=port)
    cmd = build_browser_runtime_command(resolved_chrome_path, profile_dir, port, start_url)

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=not _platform_name().startswith("win"),
        shell=False,
    )

    status = wait_for_cdp_endpoint(endpoint, timeout=20)
    payload = {
        "status": "launched" if status.get("status") == "ready" else status.get("status", "error"),
        "chrome_path": resolved_chrome_path,
        "chrome_pid": process.pid,
        "cdp_port": port,
        "cdp_endpoint": endpoint,
        "user_data_dir": profile_dir,
        "command": cmd,
        "metadata_path": str(Path(metadata_path or DEFAULT_RUNTIME_METADATA_PATH)),
        "platform": _platform_name(),
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    if status.get("status") != "ready":
        payload["message"] = status.get("error") or "CDP endpoint not ready"
    write_runtime_metadata(payload, metadata_path)
    return payload


def ensure_browser_runtime(
    chrome_path: str = "",
    user_data_dir: str = "",
    cdp_endpoint: str = "",
    cdp_port: int = DEFAULT_CDP_PORT,
    metadata_path: str = "",
    start_url: str = "https://www.1688.com/",
) -> dict:
    endpoint = normalize_cdp_endpoint(cdp_endpoint, port=cdp_port)
    current = probe_cdp_endpoint(endpoint)
    if current.get("status") == "ready":
        payload = {
            "status": "ready",
            "cdp_endpoint": current["endpoint"],
            "browser": current.get("browser", ""),
            "user_data_dir": user_data_dir or get_runtime_profile_dir(),
            "metadata_path": str(Path(metadata_path or DEFAULT_RUNTIME_METADATA_PATH)),
            "platform": _platform_name(),
        }
        write_runtime_metadata(payload, metadata_path)
        return payload

    meta = read_runtime_metadata(metadata_path)
    meta_endpoint = str(meta.get("cdp_endpoint") or "").strip()
    if meta_endpoint:
        meta_status = probe_cdp_endpoint(meta_endpoint)
        if meta_status.get("status") == "ready":
            payload = {
                "status": "ready",
                "cdp_endpoint": meta_status["endpoint"],
                "browser": meta_status.get("browser", ""),
                "user_data_dir": str(meta.get("user_data_dir") or user_data_dir or get_runtime_profile_dir()),
                "chrome_path": str(meta.get("chrome_path") or chrome_path or ""),
                "chrome_pid": meta.get("chrome_pid"),
                "metadata_path": str(Path(metadata_path or DEFAULT_RUNTIME_METADATA_PATH)),
                "platform": _platform_name(),
            }
            write_runtime_metadata(payload, metadata_path)
            return payload

    launch = launch_browser_runtime(
        chrome_path=chrome_path or str(meta.get("chrome_path") or ""),
        user_data_dir=user_data_dir or str(meta.get("user_data_dir") or ""),
        cdp_port=cdp_port,
        start_url=start_url,
        metadata_path=metadata_path,
    )
    return launch


@contextmanager
def acquire_fetch_lock(lock_dir: str = "", timeout: int = 120):
    target = Path(lock_dir or DEFAULT_FETCH_LOCK_DIR)
    deadline = time.time() + max(timeout, 1)
    acquired = False
    while time.time() < deadline:
        try:
            target.mkdir(parents=True, exist_ok=False)
            acquired = True
            owner_file = target / "owner.json"
            owner_file.write_text(json.dumps({
                "pid": os.getpid(),
                "created_at": time.time(),
                "platform": _platform_name(),
            }, ensure_ascii=False), encoding="utf-8")
            break
        except FileExistsError:
            try:
                owner_file = target / "owner.json"
                owner = json.loads(owner_file.read_text(encoding="utf-8")) if owner_file.exists() else {}
                created_at = float(owner.get("created_at") or 0)
                owner_pid = int(owner.get("pid") or 0)
                stale_by_age = created_at > 0 and (time.time() - created_at) > max(timeout, 1)
                stale_by_pid = owner_pid > 0 and not _process_exists(owner_pid)
                if stale_by_age or stale_by_pid:
                    for child in target.iterdir():
                        child.unlink(missing_ok=True)
                    target.rmdir()
                    continue
            except Exception:
                pass
            time.sleep(0.5)
    if not acquired:
        raise TimeoutError(f"Timed out waiting for 1688 fetch lock: {target}")
    try:
        yield str(target)
    finally:
        try:
            for child in target.iterdir():
                child.unlink(missing_ok=True)
            target.rmdir()
        except Exception:
            pass
