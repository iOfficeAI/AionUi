#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
1688认证/会话辅助工具
====================

AK 是 1688 真实搜源主链路；本工具负责 Cookie / storage_state 的扫码获取、
详情验证恢复、会话健康检查与风控诊断。

Cookie 获取方式:
1. --qr-scan: Playwright打开登录页 → 截取二维码base64 → 用户扫码 → 自动提取Cookie
2. --bookmarklet: 输出Bookmarklet JS代码，用户在浏览器执行一键复制Cookie
3. 手动: 用户在浏览器F12复制Cookie字符串

用法:
    python scripts/setup_1688_auth.py --qr-scan           # 扫码登录(推荐)
    python scripts/setup_1688_auth.py --qr-scan --timeout 180
    python scripts/setup_1688_auth.py --bookmarklet        # 输出Bookmarklet
    python scripts/setup_1688_auth.py --cookie "key=val;key2=val2"  # 手动验证Cookie
"""

import argparse
import base64
import json
import logging
import os
import re
import sys
import tempfile
import time
from pathlib import Path

try:
    from config import _load_local_env, get_config
except Exception:  # pragma: no cover - CLI fallback
    def _load_local_env():
        return None
    def get_config(*args, **kwargs):
        return None

from browser_runtime_1688 import (
    DEFAULT_CDP_PORT,
    DEFAULT_PROFILE_DIR as BROWSER_RUNTIME_PROFILE_DIR,
    detect_browser_executable,
    ensure_browser_runtime,
    get_runtime_status,
    normalize_cdp_endpoint,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_STORAGE_STATE_PATH = str((Path(__file__).resolve().parent.parent / ".auth" / "1688-storage-state.json"))
DEFAULT_CHROME_USER_DATA_DIR = str(BROWSER_RUNTIME_PROFILE_DIR)
DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9222"

BOOKMARKLET_JS = (
    "javascript:void((function(){"
    "var c=document.cookie;"
    "navigator.clipboard.writeText(c)"
    ".then(function(){alert('1688 Cookie已复制! 请粘贴到凭证配置中')})"
    "})())"
)

COOKIE_ENV_KEYS = [
    "COZE_1688_cookies_7634436791660773376",
    "ALIBABA_1688_COOKIE",
]

STORAGE_STATE_ENV_KEYS = [
    "ALIBABA_1688_STORAGE_STATE",
    "COZE_1688_storage_state_7634436791660773376",
]


def _extract_ak_from_env() -> dict:
    raw_ak = (os.environ.get("ALI_1688_AK") or "").strip()
    app_key = (os.environ.get("ALI1688_APP_KEY") or "").strip()
    app_secret = (os.environ.get("ALI1688_APP_SECRET") or "").strip()

    if not raw_ak and not (app_key and app_secret):
        try:
            cfg = get_config()
            if cfg is not None:
                raw_ak = (getattr(cfg, "ali_1688_ak", "") or "").strip()
                app_key = (getattr(cfg, "alibaba_app_key", "") or "").strip()
                app_secret = (getattr(cfg, "alibaba_app_secret", "") or "").strip()
        except Exception:
            pass

    if app_key and app_secret:
        return {
            "present": True,
            "mode": "app_key_secret",
            "app_key_suffix": app_key[-6:] if len(app_key) >= 6 else app_key,
            "secret_len": len(app_secret),
            "env_keys": ["ALI1688_APP_KEY", "ALI1688_APP_SECRET"],
        }

    if not raw_ak:
        return {
            "present": False,
            "mode": "missing",
            "app_key_suffix": "",
            "secret_len": 0,
            "env_keys": ["ALI_1688_AK", "ALI1688_APP_KEY", "ALI1688_APP_SECRET"],
        }

    decoded = raw_ak
    try:
        decoded = base64.urlsafe_b64decode(raw_ak).decode("utf-8")
    except Exception:
        pass

    app_secret = decoded[:32] if len(decoded) >= 32 else ""
    app_key = decoded[32:] if len(decoded) > 32 else ""
    return {
        "present": bool(app_key and app_secret),
        "mode": "ali_1688_ak",
        "app_key_suffix": app_key[-6:] if len(app_key) >= 6 else app_key,
        "secret_len": len(app_secret),
        "env_keys": ["ALI_1688_AK"],
    }


def get_cookie_via_playwright(timeout: int = 120, output_base64: bool = True,
                              storage_state_path: str = DEFAULT_STORAGE_STATE_PATH) -> dict:
    """
    通过Playwright扫码获取1688 cookie
    
    Args:
        timeout: 扫码等待超时(秒)
        output_base64: 是否输出二维码base64图片(供AI展示给用户)
    
    Returns:
        成功: {"status": "success", "cookies": {...}, "cookie_string": "...", "essential_cookies": {...}}
        二维码就绪: {"status": "qr_ready", "qr_image_base64": "...", "message": "..."}
        超时: {"status": "timeout", "message": "..."}
        错误: {"status": "error", "message": "..."}
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"status": "error", "message": "Playwright未安装，请运行: pip install playwright && playwright install chromium"}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            locale="zh-CN",
        )
        page = context.new_page()

        # 打开1688登录页
        logger.info("正在打开1688登录页...")
        try:
            page.goto("https://login.1688.com/member/signin.htm", timeout=30000)
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception as e:
            logger.warning(f"加载登录页异常(继续): {e}")

        # 等待页面渲染
        page.wait_for_timeout(3000)

        # 截取二维码区域 - 多种策略
        qr_base64 = None

        # 策略1: 定位二维码图片元素并截图
        qr_selectors = [
            "img[src*='qrcode']",
            "img[src*='QRCode']",
            "[class*='qrcode'] img",
            "[class*='scan'] img",
            "[class*='qr'] img",
            "#qrcode-img",
            ".qrcode-img",
            ".scan-img",
        ]
        for selector in qr_selectors:
            try:
                qr_el = page.query_selector(selector)
                if qr_el:
                    screenshot_bytes = qr_el.screenshot(type="png")
                    qr_base64 = base64.b64encode(screenshot_bytes).decode("utf-8")
                    logger.info(f"二维码截图成功(selector: {selector})")
                    break
            except Exception:
                continue

        # 策略2: 截取整个登录区域
        if not qr_base64:
            try:
                login_area = page.query_selector(".login-section, .login-content, #login, .signin-content, main")
                if login_area:
                    screenshot_bytes = login_area.screenshot(type="png")
                    qr_base64 = base64.b64encode(screenshot_bytes).decode("utf-8")
                    logger.info("登录区域截图成功")
            except Exception:
                pass

        # 策略3: 全页截图
        if not qr_base64:
            try:
                screenshot_bytes = page.screenshot(type="png")
                qr_base64 = base64.b64encode(screenshot_bytes).decode("utf-8")
                logger.info("全页截图成功")
            except Exception as e:
                logger.warning(f"截图失败: {e}")

        # 同时保存到临时文件(调试用)
        screenshot_path = "/tmp/1688_login_qr.png"
        try:
            page.screenshot(path=screenshot_path)
            logger.info(f"登录页截图已保存: {screenshot_path}")
        except Exception:
            pass

        # 输出二维码就绪状态
        qr_result = {
            "status": "qr_ready",
            "message": "请用阿里巴巴App/淘宝App扫描二维码登录",
            "timeout_seconds": timeout,
        }
        if qr_base64:
            qr_result["qr_image_base64"] = qr_base64
        if os.path.exists(screenshot_path):
            qr_result["screenshot_path"] = screenshot_path

        # 输出二维码就绪(供AI读取)
        print(json.dumps(qr_result, ensure_ascii=False))
        sys.stdout.flush()

        # 轮询等待登录成功
        logger.info(f"等待扫码登录 (超时{timeout}秒)...")
        start_time = time.time()
        logged_in = False

        while time.time() - start_time < timeout:
            try:
                current_url = page.url
                cookies = context.cookies()

                # 检查是否有登录态cookie
                has_login_cookie = any(
                    c.get("name") in ("_m_h5_tk", "cookie2", "sgcookie", "_nk_", "login_aliyunid")
                    for c in cookies
                    if ".1688.com" in c.get("domain", "") or ".alibaba.com" in c.get("domain", "")
                )

                # 检查URL是否跳转(登录成功后通常跳转到首页)
                url_indicates_login = (
                    "1688.com" in current_url
                    and "login" not in current_url.lower()
                    and "signin" not in current_url.lower()
                )

                if has_login_cookie or url_indicates_login:
                    logged_in = True
                    break

            except Exception as e:
                logger.warning(f"检查登录状态异常: {e}")

            time.sleep(3)

        if logged_in:
            # 导航到1688首页确保cookie完整
            try:
                page.goto("https://www.1688.com/", timeout=15000)
                time.sleep(2)
            except Exception:
                pass

            # 提取所有1688相关cookie
            all_cookies = context.cookies()
            cookie_dict = {}
            cookie_str_parts = []
            for c in all_cookies:
                if ".1688.com" in c.get("domain", "") or ".alibaba.com" in c.get("domain", ""):
                    name = c.get("name", "")
                    value = c.get("value", "")
                    cookie_dict[name] = value
                    cookie_str_parts.append(f"{name}={value}")

            cookie_str = "; ".join(cookie_str_parts)

            try:
                state_path = save_storage_state(context, storage_state_path)
            except Exception:
                state_path = ""
            browser.close()

            result = {
                "status": "success",
                "cookies": cookie_dict,
                "cookie_string": cookie_str,
                "essential_cookies": {
                    "_m_h5_tk": cookie_dict.get("_m_h5_tk", ""),
                    "_m_h5_tk_enc": cookie_dict.get("_m_h5_tk_enc", ""),
                    "cna": cookie_dict.get("cna", ""),
                },
                "cookie_count": len(cookie_dict),
            }
            if state_path:
                result["storage_state_path"] = state_path
            return result
        else:
            browser.close()
            return {"status": "timeout", "message": f"扫码超时({timeout}秒)，请使用--bookmarklet方式或重试"}


def _is_1688_cookie_domain(domain: str) -> bool:
    domain = str(domain or "")
    return ".1688.com" in domain or ".alibaba.com" in domain


def _cookie_lookup(cookies: list[dict]) -> dict[str, str]:
    lookup = {}
    for cookie in cookies or []:
        if not _is_1688_cookie_domain(cookie.get("domain", "")):
            continue
        name = str(cookie.get("name", "") or "").strip()
        if not name:
            continue
        lookup[name] = str(cookie.get("value", "") or "")
    return lookup


def _has_1688_login_cookie(cookies: list[dict], current_url: str = "") -> bool:
    lookup = _cookie_lookup(cookies)
    current_url = str(current_url or "")
    current_url_lower = current_url.lower()
    if "login.taobao.com" in current_url_lower:
        return False
    if "login.1688.com" in current_url_lower or "signin" in current_url_lower or "punish" in current_url_lower:
        return False
    if lookup.get("_m_h5_tk") and lookup.get("_m_h5_tk_enc"):
        return True
    cn_logon = lookup.get("__cn_logon__", "").lower()
    if cn_logon in {"true", "1"} and lookup.get("cookie2"):
        return True
    if lookup.get("login_aliyunid") and lookup.get("cookie2"):
        return True
    return False


def _extract_1688_cookie_payload(context) -> dict:
    all_cookies = context.cookies()
    cookie_dict = {}
    cookie_str_parts = []
    for c in all_cookies:
        if _is_1688_cookie_domain(c.get("domain", "")):
            name = c.get("name", "")
            value = c.get("value", "")
            if not name:
                continue
            cookie_dict[name] = value
            cookie_str_parts.append(f"{name}={value}")
    cookie_str = "; ".join(cookie_str_parts)
    return {
        "cookies": cookie_dict,
        "cookie_string": cookie_str,
        "essential_cookies": {
            "_m_h5_tk": cookie_dict.get("_m_h5_tk", ""),
            "_m_h5_tk_enc": cookie_dict.get("_m_h5_tk_enc", ""),
            "cna": cookie_dict.get("cna", ""),
        },
        "cookie_count": len(cookie_dict),
    }


def _wait_for_1688_login(page, context, timeout: int) -> dict:
    start_time = time.time()
    last_url = ""
    while time.time() - start_time < timeout:
        try:
            last_url = page.url
            cookies = context.cookies()
            has_login_cookie = _has_1688_login_cookie(cookies, last_url)
            url_indicates_login = (
                "1688.com" in last_url
                and "login" not in last_url.lower()
                and "signin" not in last_url.lower()
                and "punish" not in last_url.lower()
            )
            if has_login_cookie or url_indicates_login:
                return {
                    "status": "ok",
                    "final_url": last_url,
                    "cookie_count": len(cookies),
                }
        except Exception as e:
            logger.warning(f"检查登录状态异常: {e}")
        time.sleep(3)
    return {
        "status": "timeout",
        "final_url": last_url,
    }


def refresh_1688_session_interactive(timeout: int = 120,
                                     storage_state_path: str = DEFAULT_STORAGE_STATE_PATH,
                                     health_offer_id: str = "") -> dict:
    """可见浏览器交互刷新会话，适合人工完成验证后持久化 storage_state。"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"status": "error", "message": "Playwright未安装，请运行: pip install playwright && playwright install chromium"}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            viewport={"width": 1440, "height": 1200},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            locale="zh-CN",
        )
        page = context.new_page()
        page.goto("https://login.1688.com/member/signin.htm", timeout=30000)
        page.wait_for_timeout(3000)
        print(json.dumps({
            "status": "interactive_ready",
            "message": "请在打开的浏览器中完成1688登录/验证，完成后回到终端等待超时结束或手动关闭窗口。",
            "storage_state_path": storage_state_path,
        }, ensure_ascii=False))
        sys.stdout.flush()

        wait_result = _wait_for_1688_login(page, context, timeout)

        state_path = ""
        try:
            state_path = save_storage_state(context, storage_state_path)
        except Exception:
            state_path = ""
        cookie_payload = _extract_1688_cookie_payload(context)
        browser.close()
        if state_path:
            result = {
                "status": "session_saved",
                "storage_state_path": state_path,
                **cookie_payload,
            }
            if wait_result.get("final_url"):
                result["final_url"] = wait_result["final_url"]
            if health_offer_id:
                result["message"] = "storage_state 已保存，正在在独立步骤中执行会话健康校验"
                result["health_offer_id"] = health_offer_id
                result["next_command"] = f"python scripts/setup_1688_auth.py --check-session-health {health_offer_id}"
            else:
                result["message"] = "storage_state 已保存，请再运行 --health-offer-id 或 source_1688_search.py --session-health 验证会话是否健康"
            return result
        return {"status": "error", "message": "无法保存storage_state"}


def refresh_1688_session_via_cdp(timeout: int = 180,
                                 storage_state_path: str = DEFAULT_STORAGE_STATE_PATH,
                                 cdp_endpoint: str = "",
                                 cdp_port: int = DEFAULT_CDP_PORT,
                                 chrome_path: str = "",
                                 chrome_user_data_dir: str = DEFAULT_CHROME_USER_DATA_DIR,
                                 health_offer_id: str = "") -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"status": "error", "message": "Playwright未安装，请运行: pip install playwright && playwright install chromium"}

    runtime = ensure_browser_runtime(
        chrome_path=chrome_path or detect_browser_executable(""),
        user_data_dir=chrome_user_data_dir,
        cdp_endpoint=cdp_endpoint,
        cdp_port=cdp_port,
        start_url="https://login.1688.com/member/signin.htm",
    )
    endpoint = normalize_cdp_endpoint(runtime.get("cdp_endpoint") or cdp_endpoint, cdp_port)
    if runtime.get("status") not in {"ready", "launched"}:
        return {
            "status": "error",
            "message": runtime.get("message", "CDP 端点不可用"),
            "cdp_endpoint": endpoint,
            "chrome_launch": runtime,
        }

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(endpoint)
        contexts = browser.contexts
        if not contexts:
            browser.close()
            return {
                "status": "error",
                "message": "CDP 已连接，但没有可用浏览器上下文",
                "cdp_endpoint": endpoint,
            }
        context = contexts[0]
        pages = context.pages
        page = pages[0] if pages else context.new_page()
        try:
            page.goto("https://login.1688.com/member/signin.htm", timeout=30000)
        except Exception:
            pass
        print(json.dumps({
            "status": "interactive_ready",
            "message": "已启动支持远程调试的 Chrome，请在该窗口完成1688登录/验证。",
            "cdp_endpoint": endpoint,
            "storage_state_path": storage_state_path,
            "chrome_launch": runtime,
        }, ensure_ascii=False))
        sys.stdout.flush()

        wait_result = _wait_for_1688_login(page, context, timeout)
        state_path = ""
        try:
            state_path = save_storage_state(context, storage_state_path)
        except Exception:
            state_path = ""
        cookie_payload = _extract_1688_cookie_payload(context)
        final_url = ""
        try:
            final_url = page.url
        except Exception:
            final_url = ""
        browser.close()

        if not state_path:
            return {
                "status": "error",
                "message": "CDP 会话已连接，但无法保存 storage_state",
                "cdp_endpoint": endpoint,
            }
        result = {
            "status": "session_saved" if wait_result.get("status") == "ok" else "timeout",
            "storage_state_path": state_path,
            "cdp_endpoint": endpoint,
            "chrome_launch": runtime,
            **cookie_payload,
        }
        if final_url:
            result["final_url"] = final_url
        if wait_result.get("status") != "ok":
            result["message"] = f"等待1688登录超时({timeout}秒)，但已尝试保存当前会话，可继续做健康校验确认是否可用"
        elif health_offer_id:
            result["message"] = "storage_state 已保存，正在在独立步骤中执行会话健康校验"
            result["health_offer_id"] = health_offer_id
            result["next_command"] = f"python scripts/setup_1688_auth.py --check-session-health {health_offer_id}"
        else:
            result["message"] = "storage_state 已保存，可继续执行 1688 session health 校验"
        return result


def validate_cookie_string(cookie_str: str) -> dict:
    """验证Cookie字符串是否包含1688必需字段"""
    essential_keys = ["_m_h5_tk", "_m_h5_tk_enc", "cna"]
    found = {}
    missing = []

    for key in essential_keys:
        # 在cookie字符串中查找 key=value
        match = re.search(rf'{key}=([^;]+)', cookie_str)
        if match:
            found[key] = match.group(1)
        else:
            missing.append(key)

    return {
        "status": "valid" if not missing else "partial",
        "found_keys": list(found.keys()),
        "missing_keys": missing,
        "essential_cookies": found,
    }


def load_cookie_string(cookie_arg: str = "", cookie_file: str = "", cookie_stdin: bool = False) -> str:
    """统一读取 cookie 字符串，支持命令行、文件和 stdin。"""
    if isinstance(cookie_arg, str) and cookie_arg.strip():
        return cookie_arg.strip()
    if isinstance(cookie_file, str) and cookie_file.strip():
        return Path(cookie_file).read_text(encoding="utf-8").strip()
    if cookie_stdin:
        return sys.stdin.read().strip()
    return ""


def parse_cookie_string(cookie_str: str) -> dict:
    cookies = {}
    for item in (cookie_str or "").split(";"):
        item = item.strip()
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        key = key.strip()
        if key:
            cookies[key] = value.strip()
    return cookies


def build_storage_state_from_cookie_string(cookie_string: str) -> dict:
    """基于手工 cookie 生成最小可用 storage_state，便于后续 Playwright 复用。"""
    cookie_dict = parse_cookie_string(cookie_string)
    domains = [".1688.com", ".alibaba.com", ".taobao.com", ".tmall.com", ".mmstat.com"]
    cookies = []
    for domain in domains:
        for name, value in cookie_dict.items():
            cookies.append({
                "name": name,
                "value": str(value),
                "domain": domain,
                "path": "/",
                "expires": -1,
                "httpOnly": False,
                "secure": True,
                "sameSite": "Lax",
            })
    return {
        "cookies": cookies,
        "origins": [],
    }


def persist_cookie_storage_state(cookie_string: str, storage_state_path: str) -> str:
    payload = build_storage_state_from_cookie_string(cookie_string)
    target = Path(storage_state_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(target)




def upsert_env_var(env_path: str, key: str, value: str) -> str:
    """写入或更新 .env 中的指定变量。"""
    env_file = Path(env_path)
    env_file.parent.mkdir(parents=True, exist_ok=True)
    content = ''
    if env_file.exists():
        content = env_file.read_text(encoding='utf-8')
    lines = content.splitlines() if content else []
    new_line = f"{key}={value}"
    replaced = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = new_line
            replaced = True
            break
    if not replaced:
        lines.append(new_line)
    env_file.write_text("\n".join(lines).strip() + "\n", encoding='utf-8')
    return str(env_file)


def save_storage_state(context, output_path: str = DEFAULT_STORAGE_STATE_PATH) -> str:
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    context.storage_state(path=str(target))
    return str(target)


def check_offer_detail_with_cookie(offer_id: str) -> dict:
    from source_1688_search import get_1688_product_detail
    return get_1688_product_detail(offer_id)


def check_1688_session_health_cli(offer_id: str) -> dict:
    from source_1688_search import check_1688_session_health
    return check_1688_session_health(offer_id)


def attach_post_refresh_health_check(result: dict, offer_id: str) -> dict:
    """在 refresh Playwright 会话结束后，独立执行一次健康校验。"""
    result = dict(result or {})
    if not offer_id or result.get("status") not in {"session_saved", "success"}:
        return result
    session_health = check_1688_session_health_cli(offer_id)
    result["session_health"] = session_health
    result["status"] = "success" if session_health.get("status") == "healthy" else "blocked"
    result.setdefault("health_offer_id", offer_id)
    return result


def persist_1688_cookie_env(cookie_string: str, env_path: str) -> list[str]:
    """将 1688 cookie 持久化到技能变量和通用别名变量。"""
    written = []
    for key in COOKIE_ENV_KEYS:
        upsert_env_var(env_path, key, cookie_string)
        os.environ[key] = cookie_string
        written.append(key)
    return written


def persist_1688_storage_state_env(storage_state_path: str, env_path: str) -> list[str]:
    written = []
    for key in STORAGE_STATE_ENV_KEYS:
        upsert_env_var(env_path, key, storage_state_path)
        os.environ[key] = storage_state_path
        written.append(key)
    return written


def emit_json_result(payload: dict, output_path: str = "") -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    print(text)
    if output_path:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def build_1688_auth_doctor_report(offer_id: str = "") -> dict:
    """输出当前 1688 认证面、会话健康与推荐动作。"""
    try:
        _load_local_env()
    except Exception:
        pass
    ak_config = _extract_ak_from_env()
    cookie_string = load_cookie_string(
        os.environ.get("COZE_1688_cookies_7634436791660773376", "") or os.environ.get("ALIBABA_1688_COOKIE", "")
    )
    cookie_validation = validate_cookie_string(cookie_string) if cookie_string else {
        "status": "missing",
        "found_keys": [],
        "missing_keys": ["_m_h5_tk", "_m_h5_tk_enc", "cna"],
        "essential_cookies": {},
    }
    storage_state_path = Path(
        os.environ.get("ALIBABA_1688_STORAGE_STATE", "")
        or os.environ.get("COZE_1688_storage_state_7634436791660773376", "")
        or DEFAULT_STORAGE_STATE_PATH
    )
    report = {
        "status": "ok",
        "ak_config": ak_config,
        "cookie_config": {
            "present": bool(cookie_string),
            "cookie_count": len(parse_cookie_string(cookie_string)),
            "validation": cookie_validation,
            "env_keys": list(COOKIE_ENV_KEYS),
        },
        "storage_state": {
            "path": str(storage_state_path),
            "exists": storage_state_path.exists(),
            "env_keys": list(STORAGE_STATE_ENV_KEYS),
        },
        "recommended_action": "",
        "next_command": "",
    }
    if offer_id:
        session_health = check_1688_session_health_cli(offer_id)
        report["offer_id"] = offer_id
        report["session_health"] = session_health

    if not ak_config["present"]:
        report["status"] = "blocked"
        report["recommended_action"] = "缺少1688 AK，先配置 AK 再执行真实搜源；如还没有 API_KEY，请前往 https://clawhub.1688.com/ 获取"
        report["next_command"] = "python3 cli.py configure YOUR_AK"
        return report

    if not offer_id:
        report["recommended_action"] = "AK 已就绪，可继续执行真实1688搜源；Cookie / storage_state 仅在详情验证、风控恢复时需要"
        report["next_command"] = "python scripts/source_1688_search.py --keywords \"鞋垫\" --sell-price 150 --cost 35 --weight 50"
        return report

    if not report["cookie_config"]["present"]:
        report["status"] = "blocked"
        report["recommended_action"] = "AK 已就绪，但当前缺少 Cookie / storage_state，无法做 H5/PC 详情补真；请先扫码获取会话"
        report["next_command"] = "python scripts/setup_1688_auth.py --refresh-interactive --timeout 180 --health-offer-id 977653357635"
        return report

    if cookie_validation.get("status") != "valid":
        report["status"] = "blocked"
        report["recommended_action"] = "Cookie 缺少关键字段，无法稳定做详情补真；需重新获取完整会话"
        report["next_command"] = "python scripts/setup_1688_auth.py --refresh-interactive --timeout 180 --health-offer-id 977653357635"
        return report

    if not report["storage_state"]["exists"]:
        report["status"] = "blocked"
        report["recommended_action"] = "已存在 Cookie，但缺少 storage_state，建议补写浏览器态存档后再做详情验证"
        report["next_command"] = "python scripts/setup_1688_auth.py --cookie-file <cookie.txt> --write-env --storage-state-path .auth/1688-storage-state.json"
        return report

    session_health = report.get("session_health", {})
    if offer_id and session_health.get("status") != "healthy":
        report["status"] = "blocked"
        report["recommended_action"] = "当前会话仍被1688风控拦截，必须使用可见浏览器重新完成验证直到 session_health=healthy"
        report["next_command"] = f"python scripts/setup_1688_auth.py --refresh-interactive --timeout 180 --health-offer-id {offer_id}"
        return report

    report["recommended_action"] = "AK 与详情验证会话均已具备，可继续执行真实货源验证或完整链路验证"
    report["next_command"] = f"python scripts/run_live_chain_probe.py --offer-id {offer_id}" if offer_id else "python scripts/run_live_chain_probe.py --offer-id <offer_id>"
    return report


def build_1688_browser_runtime_report(cdp_endpoint: str = "",
                                      cdp_port: int = DEFAULT_CDP_PORT,
                                      chrome_user_data_dir: str = DEFAULT_CHROME_USER_DATA_DIR) -> dict:
    status = get_runtime_status(cdp_endpoint=cdp_endpoint, cdp_port=cdp_port)
    status["requested_user_data_dir"] = chrome_user_data_dir
    status["detected_browser_executable"] = detect_browser_executable("")
    return status

def main():
    parser = argparse.ArgumentParser(description="1688 AK / Cookie / storage_state 认证辅助工具")
    parser.add_argument("--qr-scan", action="store_true",
                        help="扫码模式: Playwright打开登录页，截取二维码供用户扫码(推荐)")
    parser.add_argument("--timeout", type=int, default=120,
                        help="扫码等待超时(秒，默认120)")
    parser.add_argument("--bookmarklet", action="store_true",
                        help="仅输出Bookmarklet代码(备选方案)")
    parser.add_argument("--cookie", type=str,
                        help="手动传入Cookie字符串进行验证")
    parser.add_argument("--cookie-file", type=str,
                        help="从文件读取Cookie字符串，适合超长cookie")
    parser.add_argument("--cookie-stdin", action="store_true",
                        help="从stdin读取Cookie字符串，适合管道/粘贴")
    parser.add_argument("--output", choices=["json", "cookie", "env"], default="json",
                        help="输出格式: json=完整JSON, cookie=cookie字符串, env=环境变量格式")
    parser.add_argument("--output-file", default="",
                        help="将 JSON 结果额外写入 UTF-8 文件，避免 Windows 重定向乱码")
    parser.add_argument("--write-env", action="store_true",
                        help="将Cookie写入项目 .env 文件")
    parser.add_argument("--env-path", default=".env",
                        help=".env 文件路径，默认项目根目录 .env")
    parser.add_argument("--check-detail", default="",
                        help="写入/验证Cookie后，立即验证指定offer_id详情是否可访问")
    parser.add_argument("--check-session-health", default="",
                        help="直接检查当前1688会话健康度(传offer_id)")
    parser.add_argument("--doctor-offer-id", default="",
                        help="输出1688认证/会话健康诊断报告(传offer_id更完整)")
    parser.add_argument("--runtime-status", action="store_true",
                        help="输出1688共享浏览器运行时状态（CDP endpoint / metadata / profile）")
    parser.add_argument("--ensure-browser-runtime", action="store_true",
                        help="确保1688共享浏览器运行时已启动，可用于后续CDP复用")
    parser.add_argument("--storage-state-path", default=DEFAULT_STORAGE_STATE_PATH,
                        help="Playwright storage_state 保存路径")
    parser.add_argument("--refresh-interactive", action="store_true",
                        help="打开可见浏览器，手工完成1688验证后保存新的storage_state")
    parser.add_argument("--refresh-via-cdp", action="store_true",
                        help="启动支持 remote debugging 的本机 Chrome，并通过 Playwright CDP 复用真人登录会话")
    parser.add_argument("--health-offer-id", default="",
                        help="刷新会话后立即用该1688 offer_id做健康校验")
    parser.add_argument("--cdp-endpoint", default=DEFAULT_CDP_ENDPOINT,
                        help="Chrome DevTools Protocol HTTP endpoint，默认 http://127.0.0.1:9222")
    parser.add_argument("--cdp-port", type=int, default=9222,
                        help="本地 Chrome remote debugging 端口，默认 9222")
    parser.add_argument("--chrome-path", default="",
                        help="Chrome/Chromium 可执行文件路径；未传时自动探测")
    parser.add_argument("--chrome-user-data-dir", default=DEFAULT_CHROME_USER_DATA_DIR,
                        help="用于 remote debugging Chrome 的用户数据目录")
    args = parser.parse_args()

    if args.refresh_via_cdp:
        result = refresh_1688_session_via_cdp(
            timeout=args.timeout,
            storage_state_path=args.storage_state_path,
            cdp_endpoint=args.cdp_endpoint,
            cdp_port=args.cdp_port,
            chrome_path=args.chrome_path,
            chrome_user_data_dir=args.chrome_user_data_dir,
            health_offer_id=args.health_offer_id,
        )
        if args.health_offer_id and result.get("status") in {"session_saved", "success", "timeout"}:
            result = attach_post_refresh_health_check(result, args.health_offer_id)
        emit_json_result(result, args.output_file)
        sys.exit(0 if result.get("status") in {"success", "session_saved"} else 1)

    if args.refresh_interactive:
        result = refresh_1688_session_interactive(
            timeout=args.timeout,
            storage_state_path=args.storage_state_path,
            health_offer_id=args.health_offer_id,
        )
        if args.health_offer_id:
            result = attach_post_refresh_health_check(result, args.health_offer_id)
        emit_json_result(result, args.output_file)
        sys.exit(0 if result.get("status") in {"success", "session_saved"} else 1)

    if args.ensure_browser_runtime:
        result = ensure_browser_runtime(
            chrome_path=args.chrome_path or detect_browser_executable(""),
            user_data_dir=args.chrome_user_data_dir,
            cdp_endpoint=args.cdp_endpoint,
            cdp_port=args.cdp_port,
            start_url="https://login.1688.com/member/signin.htm",
        )
        emit_json_result(result, args.output_file)
        sys.exit(0 if result.get("status") in {"ready", "launched"} else 1)

    if args.runtime_status:
        result = build_1688_browser_runtime_report(
            cdp_endpoint=args.cdp_endpoint,
            cdp_port=args.cdp_port,
            chrome_user_data_dir=args.chrome_user_data_dir,
        )
        emit_json_result(result, args.output_file)
        sys.exit(0 if result.get("status") == "ready" else 1)

    if args.check_session_health:
        result = check_1688_session_health_cli(args.check_session_health)
        emit_json_result(result, args.output_file)
        sys.exit(0 if result.get("status") == "healthy" else 1)

    if args.doctor_offer_id:
        result = build_1688_auth_doctor_report(args.doctor_offer_id)
        emit_json_result(result, args.output_file)
        sys.exit(0 if result.get("status") == "ok" else 1)

    # ── Bookmarklet模式 ──
    if args.bookmarklet:
        print("=== 1688 Cookie一键提取Bookmarklet ===")
        print("1. 在浏览器创建一个新书签")
        print("2. 将下面的代码作为书签的URL:")
        print(f"   {BOOKMARKLET_JS}")
        print("3. 访问 1688.com 并登录")
        print("4. 点击书签 → Cookie自动复制到剪贴板")
        print("5. 将复制的Cookie粘贴到凭证配置中")
        return

    # ── 手动Cookie验证模式 ──
    manual_cookie = load_cookie_string(args.cookie, args.cookie_file, args.cookie_stdin)
    if manual_cookie:
        result = validate_cookie_string(manual_cookie)
        if result["status"] == "valid":
            payload = {"status": "valid", "message": "Cookie包含所有必需字段",
                       "essential_cookies": result["essential_cookies"]}
            payload["cookie_count"] = len(parse_cookie_string(manual_cookie))
            if args.write_env:
                persist_1688_cookie_env(manual_cookie, args.env_path)
                payload["env_written"] = args.env_path
                payload["env_keys_written"] = list(COOKIE_ENV_KEYS)
                storage_state_path = persist_cookie_storage_state(manual_cookie, args.storage_state_path)
                payload["storage_state_path"] = storage_state_path
                payload["storage_state_env_keys_written"] = persist_1688_storage_state_env(storage_state_path, args.env_path)
            if args.check_detail:
                payload["detail_check"] = check_offer_detail_with_cookie(args.check_detail)
            emit_json_result(payload, args.output_file)
        else:
            emit_json_result({"status": "partial", "message": f"Cookie缺少必需字段: {result['missing_keys']}",
                              "found": result["found_keys"], "missing": result["missing_keys"]}, args.output_file)
            print("\n提示: 请确保在1688.com登录后复制完整Cookie")
        return

    # ── 扫码模式(默认) ──
    result = get_cookie_via_playwright(timeout=args.timeout, storage_state_path=args.storage_state_path)

    if result.get("status") == "success":
        env_key = "COZE_1688_cookies_7634436791660773376"
        if args.write_env:
            persist_1688_cookie_env(result["cookie_string"], args.env_path)
            result["env_written"] = args.env_path
            result["env_keys_written"] = [env_key, "ALIBABA_1688_COOKIE"]
            if result.get("storage_state_path"):
                result["storage_state_env_keys_written"] = persist_1688_storage_state_env(
                    result["storage_state_path"],
                    args.env_path,
                )
        if args.check_detail:
            result["detail_check"] = check_offer_detail_with_cookie(args.check_detail)
        if args.output == "cookie":
            print(result["cookie_string"])
        elif args.output == "env":
            print(f'export {env_key}="{result["cookie_string"]}"')
        else:
            emit_json_result(result, args.output_file)
    elif result.get("status") == "qr_ready":
        # qr_ready状态已在函数内部输出(含base64图片)
        pass
    else:
        emit_json_result(result, args.output_file)
        sys.exit(1)


if __name__ == "__main__":
    main()
