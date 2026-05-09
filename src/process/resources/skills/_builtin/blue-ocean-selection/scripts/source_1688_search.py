#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
1688货源搜索 + 利润计算
=====================

主链路使用 AK 签名接口做真实1688搜源，支持文本搜索和以图搜款。
历史 search1688api / 图搜 crawler 保留为降级搜索能力；LLM 不再参与选品/搜源。

依赖:
    pip install search1688api httpx[http2]

用法:
    python scripts/source_1688_search.py --keywords "鞋垫" --sell-price 150 --cost 35 --weight 50
    python scripts/source_1688_search.py --image-url https://img.alicdn.com/xxx.jpg --sell-price 150 --weight 50
"""

import argparse
import base64
import json
import logging
import os
import re
import sys
from urllib.parse import urlparse

               
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lib"))

from browser_runtime_1688 import acquire_fetch_lock, get_runtime_endpoint, probe_cdp_endpoint
from config import SKILL_ID, _load_local_env, get_config
from logistics_calculator import calculate_profit
import source_1688_ak as ak1688
from source_1688_image_utils import (
    choose_best_1688_image_url as _choose_best_1688_image_url,
    extract_1688_image_urls as _extract_1688_image_urls,
    normalize_1688_image_url as _normalize_1688_image_url,
)
from source_result_contract import (
    _build_source_result as _contract_build_source_result,
    _is_truthy_url as _contract_is_truthy_url,
    _merge_source_verified as _contract_merge_source_verified,
    _normalize_source_item as _contract_normalize_source_item,
)

logger = logging.getLogger(__name__)

_AK_FIND_PRODUCT_PATH = ak1688.AK_FIND_PRODUCT_PATH
_AK_GATEWAY_BASE_URL = ak1688.AK_GATEWAY_BASE_URL
_LAST_1688_SOURCE_ERROR = None


                                                       

def _is_truthy_url(value: str) -> bool:
    return _contract_is_truthy_url(value)


def _normalize_source_item(item: dict, default_source: str = "") -> dict:
    """统一单条货源结果结构，兼容旧字段并补充真实性标记。"""
    return _contract_normalize_source_item(item, default_source)


def _merge_source_verified(items: list) -> object:
    return _contract_merge_source_verified(items)


def _build_source_result(items: list, search_source: str, query: dict = None,
                         detail_mode: bool = False, error: str = "",
                         error_detail: dict = None) -> dict:
    """构建统一source_result，兼容旧的products/results/sources读取口径。"""
    return _contract_build_source_result(
        items,
        search_source,
        query=query,
        detail_mode=detail_mode,
        error=error,
        error_detail=error_detail,
    )


def _extract_ak_pair() -> tuple[str, str]:
    return ak1688.extract_ak_pair(_load_local_env)


def _set_last_1688_source_error(error_detail: dict = None) -> None:
    global _LAST_1688_SOURCE_ERROR
    _LAST_1688_SOURCE_ERROR = dict(error_detail) if error_detail else None


def _consume_last_1688_source_error() -> dict:
    global _LAST_1688_SOURCE_ERROR
    error_detail = dict(_LAST_1688_SOURCE_ERROR) if _LAST_1688_SOURCE_ERROR else None
    _LAST_1688_SOURCE_ERROR = None
    return error_detail


def _build_1688_source_error(error_code: str, raw_message: str = "", extra: dict = None) -> dict:
    return ak1688.build_1688_source_error(error_code, raw_message, extra)


def _canonicalize_ak_resource(uri: str) -> str:
    return ak1688.canonicalize_ak_resource(uri)


def _build_ak_headers(method: str, uri: str, body: str, app_key: str, app_secret: str) -> dict:
    return ak1688.build_ak_headers(method, uri, body, app_key, app_secret)


def _call_1688_ak_find_product(request_body: dict, timeout: int = 30) -> list:
    from http_client import requests as http_requests
    return ak1688.call_1688_ak_find_product(
        request_body,
        logger=logger,
        extract_ak_pair_fn=_extract_ak_pair,
        set_last_error_fn=_set_last_1688_source_error,
        requests_post_fn=http_requests.post,
        timeout=timeout,
        gateway_base_url=_AK_GATEWAY_BASE_URL,
        path=_AK_FIND_PRODUCT_PATH,
    )


                                                           

def _get_1688_cookie_string() -> str:
    """读取 1688 cookie 字符串，优先技能凭证变量，兼容通用环境变量别名。"""
    try:
        _load_local_env()
    except Exception:
        pass
    env_keys = [
        f"COZE_1688_cookies_{SKILL_ID}",
        "ALIBABA_1688_COOKIE",
        "ALIBABA_1688_COOKIES",
        "COOKIE_1688",
    ]
    for key in env_keys:
        value = os.environ.get(key, "")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _get_1688_storage_state_path() -> str:
    env_keys = [
        "ALIBABA_1688_STORAGE_STATE",
        f"COZE_1688_storage_state_{SKILL_ID}",
        "COOKIE_1688_STORAGE_STATE",
    ]
    for key in env_keys:
        value = os.environ.get(key, "")
        if isinstance(value, str) and value.strip():
            candidate = value.strip()
            if os.path.exists(candidate):
                return candidate
    default_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        ".auth",
        "1688-storage-state.json",
    )
    if os.path.exists(default_path):
        return default_path
    return ""


def _get_1688_cdp_endpoint() -> str:
    env_keys = [
        "ALIBABA_1688_CDP_ENDPOINT",
        f"COZE_1688_cdp_endpoint_{SKILL_ID}",
        "COOKIE_1688_CDP_ENDPOINT",
    ]
    for key in env_keys:
        value = os.environ.get(key, "")
        if isinstance(value, str) and value.strip():
            return value.strip().rstrip("/")
    return get_runtime_endpoint("http://127.0.0.1:9222")


def _probe_1688_cdp_endpoint(endpoint: str) -> dict:
    endpoint = str(endpoint or "").strip().rstrip("/")
    if not endpoint:
        return {"status": "missing"}
    return probe_cdp_endpoint(endpoint)

def _get_1688_custom_cookies() -> dict:
    """从环境变量获取1688自定义cookie，绕过反爬风控

    环境变量格式: COZE_1688_cookies_7634436791660773376
    Cookie字符串格式: "key1=value1; key2=value2; ..."
    必需cookie: _m_h5_tk, _m_h5_tk_enc, cna
    """
    cookies = {}
    cookie_str = _get_1688_cookie_string()
    if cookie_str:
        for item in cookie_str.split(";"):
            item = item.strip()
            if "=" in item:
                k, v = item.split("=", 1)
                cookies[k.strip()] = v.strip()
    storage_state_path = _get_1688_storage_state_path()
    if storage_state_path and os.path.exists(storage_state_path):
        try:
            with open(storage_state_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            for cookie in payload.get("cookies", []) or []:
                name = str(cookie.get("name", "") or "").strip()
                value = cookie.get("value")
                if name and value is not None and name not in cookies:
                    cookies[name] = str(value)
        except Exception:
            pass
    return cookies


def _read_1688_storage_state_summary() -> dict:
    path = _get_1688_storage_state_path()
    summary = {
        "path": path,
        "exists": bool(path and os.path.exists(path)),
        "cookie_count": 0,
        "origin_count": 0,
        "key_cookie_domains": {},
        "key_cookie_presence": {},
    }
    if not summary["exists"]:
        return summary
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        cookies = payload.get("cookies", []) or []
        origins = payload.get("origins", []) or []
        summary["cookie_count"] = len(cookies)
        summary["origin_count"] = len(origins)
        for key_name in ("cookie2", "_m_h5_tk", "_m_h5_tk_enc", "cna", "__cn_logon__", "tfstk"):
            domains = sorted({
                str(item.get("domain", ""))
                for item in cookies
                if item.get("name") == key_name and item.get("domain")
            })
            summary["key_cookie_presence"][key_name] = bool(domains)
            if domains:
                summary["key_cookie_domains"][key_name] = domains
    except Exception as e:
        summary["error"] = str(e)
    return summary


def _create_1688_session_with_cookies(proxies: dict = None) -> object:
    """创建带自定义cookie的1688搜索会话。

    关键点：先让 search1688api 自己初始化，再覆盖 cookie，避免 _m_h5_tk 重名冲突。
    """
    try:
        from search1688api import Sync1688Session
    except ImportError as e:
        raise RuntimeError("search1688api_missing") from e

    custom_cookies = _get_1688_custom_cookies()

    session = Sync1688Session(debug=False)

    if proxies:
        for scheme, url in proxies.items():
            session.proxies[scheme] = url

                                         
    session._ensure_initialized()

    if custom_cookies:
        logger.info(f"注入 {len(custom_cookies)} 个自定义1688 cookie")
                                                    
        for name in list(custom_cookies.keys()):
            try:
                session.cookies.set(name, None)
            except Exception:
                pass
            session.cookies_dict.pop(name, None)

        for name, value in custom_cookies.items():
            session.cookies_dict[name] = value
            try:
                session.cookies.set(name, value)
            except Exception:
                pass

        if "_m_h5_tk" in custom_cookies:
            session._token = custom_cookies["_m_h5_tk"]
            try:
                session._token_part = session._token.split('_')[0]
            except Exception:
                pass

    return session


def _is_1688_login_or_redirect_page(html: str) -> bool:
    if not html:
        return False
    lower = html.lower()
    tokens = [
        "login.1688.com",
        "login.taobao.com",
        "login.alibaba.com",
        "signin.htm",
        "login.jhtml",
        "redirecturl=",
        "redirecttype=topredirect",
        '"action":"login"',
        '"action":"sdklogin"',
        "member/signin",
    ]
    return any(token in lower for token in tokens)


def _is_1688_captcha_or_punish_page(html: str) -> bool:
    if not html:
        return False
    lower = html.lower()
    tokens = [
        "_____tmd_____",
        '"action":"captcha"',
        '"action":"punish"',
        "验证码拦截",
        "验证码验证",
        "请完成验证",
        "nocaptcha",
        "verifycode",
        "captcha",
        "secdev",
        "滑动验证",
        "安全验证",
    ]
    return any(token in lower for token in tokens)


def _is_1688_anti_crawler_page(html: str) -> bool:
    if not html:
        return False
    lower = html.lower()
    tokens = [
        "unusual traffic",
        "blocked by anti-crawler",
        "anti-crawler",
        "deny",
        "访问受限",
        "请求过于频繁",
        "频繁访问",
        "forbidden",
    ]
    return any(token in lower for token in tokens)


def _diagnose_1688_page_state(html: str) -> dict:
    if not html:
        return {
            "state": "empty",
            "message": "Empty HTML returned from 1688 detail page",
            "retry_with_cookie": True,
        }
    if _is_1688_captcha_or_punish_page(html):
        return {
            "state": "captcha_punish",
            "message": "Captcha/punish page detected; browser verification required",
            "retry_with_cookie": False,
        }
    if _is_1688_login_or_redirect_page(html):
        return {
            "state": "login_redirect",
            "message": "Login redirect page detected; authenticated cookie required",
            "retry_with_cookie": True,
        }
    if _is_1688_anti_crawler_page(html):
        return {
            "state": "anti_crawler",
            "message": "Blocked by anti-crawler",
            "retry_with_cookie": False,
        }
    return {
        "state": "ok",
        "message": "",
        "retry_with_cookie": False,
    }


def _fetch_1688_h5_html_with_cookie(offer_id: str, proxies: dict = None) -> tuple[str, dict]:
    """尝试用带 cookie 的 1688 会话抓取 H5 HTML。"""
    try:
        session = _create_1688_session_with_cookies(proxies)
    except Exception as e:
        return "", {"error": f"session init failed: {e}"}

    url = f"https://m.1688.com/offer/{offer_id}.html"
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                       "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
                       "Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "https://m.1688.com/",
    }
    try:
        resp = session.get(url, headers=headers, timeout=15)
        html = getattr(resp, "text", "") or ""
        return html, {
            "status_code": getattr(resp, "status_code", None),
            "used_cookie": True,
            "final_url": str(getattr(resp, "url", url)),
        }
    except Exception as e:
        return "", {"error": f"cookie fetch failed: {e}"}
    finally:
        try:
            session.close()
        except Exception:
            pass

def _extract_pc_detail_field(patterns: list[str], text: str, flags: int = 0) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            value = (match.group(1) or "").strip()
            value = re.sub(r"<[^>]+>", "", value).strip()
            return value
    return ""


def _extract_pc_price_candidates(text: str) -> list[str]:
    seen = []
    for token in re.findall(r'¥\s*([\d.]+)', text):
        token = token.strip()
        if token and token not in seen:
            seen.append(token)
    return seen


def _extract_pc_visible_fields(text: str) -> list[str]:
    if not text:
        return []
    visible_fields = []
    field_patterns = [
        r'(主营[:：]\s*[^\n]{2,80})',
        r'(商品3C认证码\s*[^\n]{2,80})',
        r'(货号\s*[^\n]{1,60})',
        r'(品牌\s*[^\n]{1,60})',
        r'(玩具材质\s*[^\n]{1,60})',
        r'(材质\s*[^\n]{1,60})',
    ]
    for pattern in field_patterns:
        field = _extract_pc_detail_field([pattern], text)
        if field and field not in visible_fields:
            visible_fields.append(field)
    return visible_fields[:10]


def _extract_structured_detail_fields(visible_fields: list[str], text: str = "") -> dict:
    combined = "\n".join([str(x) for x in (visible_fields or []) if x])
    if text:
        combined = f"{combined}\n{text}" if combined else str(text)

    def _pick(patterns: list[str]) -> str:
        return _extract_pc_detail_field(patterns, combined, flags=re.IGNORECASE)

    material = _pick([
        r'材质\s*[:：]?\s*([^\n\t]{1,40})',
        r'玩具材质\s*[:：]?\s*([^\n\t]{1,40})',
        r'Material\s*[:：]?\s*([^\n\t]{1,40})',
    ])
    brand = _pick([
        r'品牌\s*[:：]?\s*([^\n\t]{1,40})',
        r'Brand\s*[:：]?\s*([^\n\t]{1,40})',
    ])
    model = _pick([
        r'货号\s*[:：]?\s*([^\n\t]{1,40})',
        r'型号\s*[:：]?\s*([^\n\t]{1,40})',
        r'Model\s*[:：]?\s*([^\n\t]{1,40})',
    ])

    result = {}
    if material:
        result["material"] = material
    if brand:
        result["brand"] = brand
    if model:
        result["model"] = model
    return result


def _build_1688_detail_success_result(offer_id: str, source_name: str, detail_item: dict,
                                      fetch_meta: dict = None, detail_channel: str = "") -> dict:
    result = _build_source_result(
        [detail_item],
        source_name,
        query={"offer_id": offer_id},
        detail_mode=True,
    )
    result["access_state"] = "ok"
    result["fetch_meta"] = fetch_meta or {}
    result["blocked_reason_code"] = ""
    if detail_channel:
        result["detail_channel"] = detail_channel
    result.update(detail_item)
    return result


def _pc_detail_result_needs_browser_upgrade(result: dict) -> bool:
    if not isinstance(result, dict):
        return True
    if result.get("status") != "success":
        return True
    try:
        price = float(result.get("price") or 0)
    except Exception:
        price = 0.0
    if price <= 0:
        return True
    if not _is_truthy_url(result.get("main_image_url", "")):
        return True
    if not (result.get("title") or "").strip():
        return True
    return False


def _build_1688_pc_fetch_headers() -> dict:
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.1688.com/",
    }


def _fetch_1688_pc_html_with_cookie(offer_id: str, proxies: dict = None) -> tuple[str, str, dict]:
    """尝试用桌面态 cookie 获取 PC 详情页 HTML。"""
    try:
        import requests as raw_requests
    except ImportError as e:
        return "", "", {"error": f"requests unavailable: {e}", "strategy": "pc_http_cookie"}

    cookies = _get_1688_custom_cookies()
    if not cookies:
        return "", "", {"error": "no 1688 cookie configured", "strategy": "pc_http_cookie"}

    url = f"https://detail.1688.com/offer/{offer_id}.html"
    headers = _build_1688_pc_fetch_headers()
    try:
        resp = raw_requests.get(url, headers=headers, timeout=20, proxies=proxies, cookies=cookies)
        html = getattr(resp, "text", "") or ""
        return html, "", {
            "status_code": getattr(resp, "status_code", None),
            "used_cookie": True,
            "final_url": str(getattr(resp, "url", url)),
            "strategy": "pc_http_cookie",
        }
    except Exception as e:
        return "", "", {"error": f"pc cookie fetch failed: {e}", "used_cookie": True, "strategy": "pc_http_cookie"}


def _cookie_dict_to_playwright_cookies(cookie_dict: dict) -> list[dict]:
    cookies = []
    for domain in (".1688.com", ".alibaba.com"):
        for name, value in (cookie_dict or {}).items():
            if not name or value is None:
                continue
            cookies.append({
                "name": name,
                "value": str(value),
                "domain": domain,
                "path": "/",
                "httpOnly": False,
                "secure": True,
            })
    return cookies


def _persist_playwright_storage_state(context, target_path: str = "") -> str:
    path = target_path or _get_1688_storage_state_path()
    if not path:
        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            ".auth",
            "1688-storage-state.json",
        )
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        context.storage_state(path=path)
        return path
    except Exception:
        return ""


def _fetch_1688_pc_html_with_playwright(offer_id: str) -> tuple[str, str, dict]:
    """用 Playwright 复现浏览器态获取 PC 详情页。"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        return "", "", {"error": f"playwright unavailable: {e}", "strategy": "pc_playwright"}

    cookies = _get_1688_custom_cookies()
    storage_state_path = _get_1688_storage_state_path()
    if not cookies and not storage_state_path:
        return "", "", {"error": "no 1688 cookie or storage_state configured", "strategy": "pc_playwright"}

    url = f"https://detail.1688.com/offer/{offer_id}.html"
    screenshot_path = ""
    try:
        with acquire_fetch_lock(timeout=180):
            with sync_playwright() as p:
                cdp_probe = _probe_1688_cdp_endpoint(_get_1688_cdp_endpoint())
                browser = None
                context = None
                page = None
                using_cdp = False
                if cdp_probe.get("status") == "ready":
                    try:
                        browser = p.chromium.connect_over_cdp(cdp_probe["endpoint"])
                        contexts = browser.contexts
                        if contexts:
                            context = contexts[0]
                            pages = context.pages
                            page = pages[0] if pages else context.new_page()
                            using_cdp = True
                        else:
                            browser.close()
                            browser = None
                    except Exception:
                        browser = None
                        context = None
                        page = None
                        using_cdp = False
                if browser is None or context is None or page is None:
                    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
                    context_kwargs = dict(
                        viewport={"width": 1440, "height": 1200},
                        user_agent=_build_1688_pc_fetch_headers()["User-Agent"],
                        locale="zh-CN",
                    )
                    if storage_state_path:
                        context_kwargs["storage_state"] = storage_state_path
                    context = browser.new_context(**context_kwargs)
                    page = context.new_page()
                    if cookies:
                        try:
                            context.add_cookies(_cookie_dict_to_playwright_cookies(cookies))
                        except Exception:
                            pass
                try:
                    warm_urls = [
                        "https://www.1688.com/",
                        "https://login.1688.com/member/signin.htm",
                    ]
                    for warm_url in warm_urls:
                        try:
                            page.goto(warm_url, wait_until="domcontentloaded", timeout=20000)
                            page.wait_for_timeout(1500)
                        except Exception:
                            continue
                    page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_timeout(3000)
                    html = page.content() or ""
                    body_text = ""
                    try:
                        body_text = page.locator("body").inner_text(timeout=5000) or ""
                    except Exception:
                        body_text = ""
                    title = ""
                    try:
                        title = page.title()
                    except Exception:
                        title = ""
                    if body_text:
                        persisted_path = _persist_playwright_storage_state(context, storage_state_path)
                        fetch_meta = {
                            "status_code": 200,
                            "used_cookie": True,
                            "final_url": page.url,
                            "strategy": "pc_playwright_cdp" if using_cdp else "pc_playwright",
                            "title": title,
                        }
                        if using_cdp:
                            fetch_meta["cdp_endpoint"] = cdp_probe.get("endpoint", "")
                        if persisted_path:
                            fetch_meta["storage_state_path"] = persisted_path
                        browser.close()
                        return html, body_text, fetch_meta
                    screenshot_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".playwright-cli")
                    os.makedirs(screenshot_dir, exist_ok=True)
                    screenshot_path = os.path.join(screenshot_dir, f"pc-detail-{offer_id}.png")
                    try:
                        page.screenshot(path=screenshot_path, full_page=True)
                    except Exception:
                        screenshot_path = ""
                    fetch_meta = {
                        "status_code": 200,
                        "used_cookie": True,
                        "final_url": page.url,
                        "strategy": "pc_playwright_cdp" if using_cdp else "pc_playwright",
                        "title": title,
                    }
                    if using_cdp:
                        fetch_meta["cdp_endpoint"] = cdp_probe.get("endpoint", "")
                    if screenshot_path:
                        fetch_meta["screenshot"] = screenshot_path
                    persisted_path = _persist_playwright_storage_state(context, storage_state_path)
                    if persisted_path:
                        fetch_meta["storage_state_path"] = persisted_path
                    browser.close()
                    return html, body_text, fetch_meta
                except Exception as e:
                    browser.close()
                    error_payload = {
                        "error": f"pc playwright fetch failed: {e}",
                        "used_cookie": True,
                        "strategy": "pc_playwright_cdp" if using_cdp else "pc_playwright",
                    }
                    if using_cdp:
                        error_payload["cdp_endpoint"] = cdp_probe.get("endpoint", "")
                    return "", "", error_payload
    except Exception as e:
        return "", "", {"error": f"pc playwright init failed: {e}", "used_cookie": True, "strategy": "pc_playwright"}


def _parse_1688_pc_detail_result(offer_id: str, html: str, body_text: str = "",
                                 fetch_meta: dict = None) -> dict:
    """从 PC 详情页 HTML / 可见文本中提取 sellable 所需字段。"""
    combined_text = "\n".join([html or "", body_text or ""])
    diagnosis = _diagnose_1688_browser_fetch_state(
        fetch_meta=fetch_meta,
        html=html,
        body_text=body_text,
    )
    if diagnosis.get("state") != "ok":
        result = _build_source_result([], "1688_pc_detail", query={"offer_id": offer_id}, detail_mode=True, error=diagnosis.get("message", "1688 pc detail blocked"))
        result["access_state"] = diagnosis.get("state", "unknown")
        result["fetch_meta"] = fetch_meta or {}
        result["blocked_reason_code"] = diagnosis.get("state", "unknown")
        result["detail_channel"] = "pc_browser_fallback"
        return result

    title = _extract_pc_detail_field([
        r'<title>\s*([^<]+?)\s*</title>',
        r'"subject"\s*:\s*"([^"]+)"',
        r'"title"\s*:\s*"([^"]+)"',
        r'"offerTitle"\s*:\s*"([^"]+)"',
    ], html, flags=re.IGNORECASE | re.DOTALL)
    title = title.replace(" - 阿里巴巴", "").replace("- 阿里巴巴", "").replace("- 1688.com", "").strip()

    image_urls = _extract_1688_image_urls(combined_text)
    main_image = _choose_best_1688_image_url(image_urls) if image_urls else ""

    price_tokens = _extract_pc_price_candidates(body_text or combined_text)
    price = 0.0
    if price_tokens:
        try:
            price = min(float(token) for token in price_tokens)
        except Exception:
            price = 0.0
    price_range = " / ".join(f"¥{token}" for token in price_tokens[:5])

    shop_name = _extract_pc_detail_field([
        r'"companyName"\s*:\s*"([^"]+)"',
        r'"shopName"\s*:\s*"([^"]+)"',
        r'店铺[:：]\s*([^\n]{2,80})',
        r'公司名称[:：]?\s*([^\n]{2,80})',
        r'供应商[:：]?\s*([^\n]{2,80})',
        r'([^\s\n]{2,40}有限公司)',
    ], combined_text, flags=re.IGNORECASE)

    sale_quantity = 0
    sale_quantity_token = _extract_pc_detail_field([
        r'成交\s*([0-9]+)',
        r'销量\s*([0-9]+)',
        r'"saleNum"\s*:\s*([0-9]+)',
    ], combined_text, flags=re.IGNORECASE)
    if sale_quantity_token:
        try:
            sale_quantity = int(sale_quantity_token)
        except Exception:
            sale_quantity = 0

    location = _extract_pc_detail_field([
        r'(广东[^\s\n]{1,10})',
        r'(浙江[^\s\n]{1,10})',
        r'(江苏[^\s\n]{1,10})',
        r'(福建[^\s\n]{1,10})',
        r'(山东[^\s\n]{1,10})',
        r'(河北[^\s\n]{1,10})',
        r'(河南[^\s\n]{1,10})',
        r'(上海[^\s\n]{1,10})',
        r'(北京[^\s\n]{1,10})',
        r'(天津[^\s\n]{1,10})',
        r'(重庆[^\s\n]{1,10})',
    ], body_text or combined_text)
    min_batch = _extract_pc_detail_field([r'([0-9]+\s*[个件箱包套]\s*起批)'], body_text or combined_text)
    visible_fields = _extract_pc_visible_fields(body_text or combined_text)

    if not title and fetch_meta and fetch_meta.get("title"):
        title = str(fetch_meta.get("title")).replace(" - 阿里巴巴", "").strip()

    if not title:
        result = _build_source_result([], "1688_pc_detail", query={"offer_id": offer_id}, detail_mode=True, error="PC detail title not found")
        result["access_state"] = "pc_parse_failed"
        result["fetch_meta"] = fetch_meta or {}
        result["blocked_reason_code"] = "pc_parse_failed"
        result["detail_channel"] = "pc_browser_fallback"
        return result

    detail_fields = _extract_structured_detail_fields(visible_fields, body_text or combined_text)

    detail_item = _normalize_source_item({
        "source": "1688_pc_detail",
        "offer_id": str(offer_id),
        "title": title,
        "price": price,
        "price_range": price_range,
        "main_image_url": main_image,
        "image_urls": image_urls[:20],
        "product_url": f"https://detail.1688.com/offer/{offer_id}.html",
        "shop_name": shop_name,
        "sale_quantity": sale_quantity,
        "location": location,
        "min_batch": min_batch,
        "visible_fields": visible_fields,
        **detail_fields,
    }, "1688_pc_detail")
    return _build_1688_detail_success_result(
        offer_id,
        "1688_pc_detail",
        detail_item,
        fetch_meta=fetch_meta,
        detail_channel="pc_browser_fallback",
    )


def get_1688_product_detail_via_pc_browser(offer_id: str, proxies: dict = None) -> dict:
    """H5 被风控时的 PC 详情页备援：优先 cookie 请求，再回退 Playwright 浏览器态。"""
    html, body_text, fetch_meta = _fetch_1688_pc_html_with_cookie(offer_id, proxies=proxies)
    if html:
        parsed = _parse_1688_pc_detail_result(offer_id, html, body_text=body_text, fetch_meta=fetch_meta)
        if not _pc_detail_result_needs_browser_upgrade(parsed):
            return parsed

    playwright_html, playwright_body_text, playwright_meta = _fetch_1688_pc_html_with_playwright(offer_id)
    if playwright_html:
        return _parse_1688_pc_detail_result(
            offer_id,
            playwright_html,
            body_text=playwright_body_text,
            fetch_meta=playwright_meta,
        )

    result = _build_source_result([], "1688_pc_detail", query={"offer_id": offer_id}, detail_mode=True, error="PC detail fallback failed")
    result["access_state"] = "pc_detail_unavailable"
    result["blocked_reason_code"] = "pc_detail_unavailable"
    result["fetch_meta"] = {
        "http": fetch_meta or {},
        "playwright": playwright_meta or {},
    }
    result["detail_channel"] = "pc_browser_fallback"
    return result


def _diagnose_1688_browser_fetch_state(fetch_meta: dict = None, html: str = "", body_text: str = "") -> dict:
    final_url = str((fetch_meta or {}).get("final_url", "") or "")
    final_url_lower = final_url.lower()
    if any(token in final_url_lower for token in ("login.taobao.com", "login.alibaba.com", "login.1688.com", "signin.htm", "marketSigninJump.htm")):
        return {
            "state": "login_redirect",
            "message": "Login redirect detected from browser final_url",
            "retry_with_cookie": True,
        }
    if "detail.1688.com/offer/" in final_url_lower:
        visible_text = "\n".join([
            body_text or "",
            str((fetch_meta or {}).get("title", "") or ""),
        ])
        diagnosis = _diagnose_1688_page_state(visible_text)
        if diagnosis.get("state") == "login_redirect":
            return {
                "state": "ok",
                "message": "",
                "retry_with_cookie": False,
            }
        return diagnosis
    combined = "\n".join([
        html or "",
        body_text or "",
        final_url,
        str((fetch_meta or {}).get("title", "") or ""),
    ])
    return _diagnose_1688_page_state(combined)


def _extract_final_url_host(fetch_meta: dict = None) -> str:
    final_url = str((fetch_meta or {}).get("final_url", "") or "").strip()
    if not final_url:
        return ""
    try:
        return urlparse(final_url).netloc or ""
    except Exception:
        return ""


def _classify_redirect_kind(page_state: str, fetch_meta: dict = None) -> str:
    host = _extract_final_url_host(fetch_meta)
    if page_state == "login_redirect":
        if "taobao.com" in host:
            return "taobao_login_redirect"
        if "1688.com" in host:
            return "1688_login_redirect"
        if "alibaba.com" in host:
            return "alibaba_login_redirect"
        return "login_redirect"
    if page_state == "captcha_punish":
        return "captcha_punish"
    if page_state == "anti_crawler":
        return "anti_crawler"
    return page_state or "unknown"


def check_1688_session_health(offer_id: str) -> dict:
    """检查当前 1688 会话是否真的可用，而不只是 cookie/存储态存在。"""
    cookies = _get_1688_custom_cookies()
    storage_state_path = _get_1688_storage_state_path()
    storage_state_summary = _read_1688_storage_state_summary()
    key_cookie_presence = {
        "cookie2": "cookie2" in cookies,
        "_m_h5_tk": "_m_h5_tk" in cookies,
        "_m_h5_tk_enc": "_m_h5_tk_enc" in cookies,
        "cna": "cna" in cookies,
        "__cn_logon__": "__cn_logon__" in cookies,
        "tfstk": "tfstk" in cookies,
    }
    storage_key_cookie_presence = dict(storage_state_summary.get("key_cookie_presence", {}))
    auth_surface = {
        "env_cookie_string": bool(cookies),
        "storage_state": bool(storage_state_summary.get("exists")),
        "effective_cookie_surface": (
            "env+storage_state" if cookies and storage_state_summary.get("exists")
            else ("env" if cookies else ("storage_state" if storage_state_summary.get("exists") else "none"))
        ),
    }
    html, body_text, fetch_meta = _fetch_1688_pc_html_with_playwright(offer_id)
    if html or body_text:
        diagnosis = _diagnose_1688_browser_fetch_state(fetch_meta=fetch_meta, html=html, body_text=body_text)
        status = "healthy" if diagnosis.get("state") == "ok" else "blocked"
        final_url_host = _extract_final_url_host(fetch_meta)
        redirect_kind = _classify_redirect_kind(diagnosis.get("state", "unknown"), fetch_meta)
        return {
            "status": status,
            "offer_id": offer_id,
            "cookie_configured": bool(cookies),
            "auth_surface": auth_surface,
            "storage_state_path": storage_state_path,
            "storage_state_summary": storage_state_summary,
            "key_cookie_presence": key_cookie_presence,
            "storage_state_key_cookie_presence": storage_key_cookie_presence,
            "page_state": diagnosis.get("state", "unknown"),
            "redirect_kind": redirect_kind,
            "blocked_reason": diagnosis.get("message", "") if diagnosis.get("state") != "ok" else "",
            "fetch_meta": fetch_meta or {},
            "final_url": (fetch_meta or {}).get("final_url", ""),
            "final_url_host": final_url_host,
            "title": (fetch_meta or {}).get("title", ""),
        }
    return {
        "status": "error",
        "offer_id": offer_id,
        "cookie_configured": bool(cookies),
        "auth_surface": auth_surface,
        "storage_state_path": storage_state_path,
        "storage_state_summary": storage_state_summary,
        "key_cookie_presence": key_cookie_presence,
        "storage_state_key_cookie_presence": storage_key_cookie_presence,
        "page_state": "unreachable",
        "redirect_kind": "unreachable",
        "blocked_reason": (fetch_meta or {}).get("error", "1688 session health check failed"),
        "fetch_meta": fetch_meta or {},
        "final_url_host": _extract_final_url_host(fetch_meta),
    }


def _should_try_pc_detail_fallback(access_state: str, custom_cookies: dict) -> bool:
    if not custom_cookies:
        return False
    return access_state in {
        "captcha_punish",
        "login_redirect",
        "anti_crawler",
        "init_data_missing",
        "json_parse_failed",
        "http_error",
        "empty",
    }


def _handle_h5_detail_failure(offer_id: str, error: str, fetch_meta: dict = None,
                              access_state: str = "", proxies: dict = None) -> dict:
    fetch_meta = fetch_meta or {}
    access_state = access_state or "unknown"
    custom_cookies = _get_1688_custom_cookies()
    if _should_try_pc_detail_fallback(access_state, custom_cookies):
        pc_result = get_1688_product_detail_via_pc_browser(offer_id, proxies=proxies)
        if pc_result.get("status") == "success":
            pc_result["fetch_meta"] = {
                "strategy": "h5_then_pc_fallback",
                "h5": fetch_meta,
                "pc": pc_result.get("fetch_meta", {}),
            }
            pc_result["fallback_from"] = "1688_h5_detail"
            pc_result["h5_access_state"] = access_state
            pc_result["h5_error"] = error
            return pc_result
        result = _build_1688_detail_error_result(
            offer_id,
            error,
            fetch_meta={
                "strategy": "h5_then_pc_fallback_failed",
                "h5": fetch_meta,
                "pc": pc_result.get("fetch_meta", {}),
            },
            access_state=access_state,
        )
        result["pc_fallback"] = {
            "status": pc_result.get("status"),
            "access_state": pc_result.get("access_state", ""),
            "blocked_reason_code": pc_result.get("blocked_reason_code", ""),
            "error": pc_result.get("error", ""),
        }
        return result
    return _build_1688_detail_error_result(
        offer_id,
        error,
        fetch_meta=fetch_meta,
        access_state=access_state,
    )


                                                           

def search_1688_by_text(keywords: str, proxies: dict = None) -> list:
    """通过search1688api进行文本搜索，返回标准化的产品列表

    支持通过环境变量COZE_1688_cookies_7634436791660773376配置登录cookie绕过反爬。
    """
    try:
        from search1688api import Sync1688Session

        custom_cookies = _get_1688_custom_cookies()

        if custom_cookies:
                                 
            session = _create_1688_session_with_cookies(proxies)
            try:
                raw_products = session.search_by_text(keywords)
            finally:
                session.close()
        else:
                                 
            with Sync1688Session(debug=False) as session:
                raw_products = session.search_by_text(keywords)

        if not raw_products:
            return []
        return _normalize_search1688api_results(raw_products)
    except Exception as e:
        if "search1688api_missing" in str(e) or "No module named 'search1688api'" in str(e):
            logger.warning("search1688api文本搜索不可用: 当前环境未安装 search1688api，已跳过旧文本搜索降级链路")
            return []
        logger.warning(f"search1688api文本搜索失败: {e}")
        return []


def search_1688_by_image(image_path: str, proxies: dict = None) -> list:
    """通过search1688api进行图片搜索

    支持通过环境变量COZE_1688_cookies_7634436791660773376配置登录cookie绕过反爬。
    """
    try:
        from search1688api import Sync1688Session

        custom_cookies = _get_1688_custom_cookies()

        if custom_cookies:
            session = _create_1688_session_with_cookies(proxies)
            try:
                raw_products = session.search_by_image(image_path)
            finally:
                session.close()
        else:
            with Sync1688Session(debug=False) as session:
                raw_products = session.search_by_image(image_path)

        if not raw_products:
            return []
        return _normalize_search1688api_results(raw_products)
    except Exception as e:
        if "search1688api_missing" in str(e) or "No module named 'search1688api'" in str(e):
            logger.warning("search1688api图片搜索不可用: 当前环境未安装 search1688api，已跳过旧图搜降级链路")
            return []
        logger.warning(f"search1688api图片搜索失败: {e}")
        return []


def _normalize_search1688api_results(raw_products: list) -> list:
    """将search1688api原始结果标准化"""
    results = []
    for p in raw_products:
        data = p.get("data", p)
        title = data.get("title", "")
        offer_id = data.get("offerId", "")
        price_info = data.get("priceInfo", {})
        price = price_info.get("price", "0")

              
        try:
            price_float = float(price)
        except (ValueError, TypeError):
            price_float = 0.0

        results.append(_normalize_source_item({
            "source": "search1688api",
            "offer_id": str(offer_id),
            "title": title,
            "price": price_float,
            "product_url": f"https://detail.1688.com/offer/{offer_id}.html" if offer_id else "",
            "image_url": data.get("imageUrl", ""),
            "province": data.get("province", ""),
            "city": data.get("city", ""),
            "sale_quantity": data.get("saleQuantity", 0),
            "shop_name": data.get("shopAddition", {}).get("text", "") if isinstance(data.get("shopAddition"), dict) else "",
        }, "search1688api"))
    return results


def _normalize_1688_ak_results(raw_products: list, source_name: str) -> list:
    return ak1688.normalize_1688_ak_results(raw_products, source_name, _normalize_source_item)


def search_1688_by_text_ak(keywords: str) -> list:
    raw_products = _call_1688_ak_find_product({
        "query": keywords,
        "pageSize": 10,
    })
    return _normalize_1688_ak_results(raw_products, "1688_ak_text_search")


def search_1688_by_image_ak(image_path: str = None, image_url: str = None) -> list:
    request = {"pageSize": 6}
    if image_url:
        _set_last_1688_source_error(None)
        request["imageUrl"] = image_url
    elif image_path:
        abs_path = os.path.abspath(image_path)
        if not os.path.exists(abs_path):
            logger.warning(f"1688 AK 图搜失败: 图片路径无效 {abs_path}")
            _set_last_1688_source_error(_build_1688_source_error("image_path_invalid", abs_path, {"image_path": abs_path}))
            return []
        with open(abs_path, "rb") as f:
            request["imgBase64"] = base64.b64encode(f.read()).decode("utf-8")
    else:
        _set_last_1688_source_error(_build_1688_source_error("image_input_missing"))
        return []

    raw_products = _call_1688_ak_find_product(request)
    return _normalize_1688_ak_results(raw_products, "1688_ak_image_search")


                                                          


def _build_1688_detail_error_result(offer_id: str, error: str,
                                    fetch_meta: dict = None, access_state: str = "") -> dict:
    result = _build_source_result(
        [],
        "1688_h5_detail",
        query={"offer_id": offer_id},
        detail_mode=True,
        error=error,
    )
    result["access_state"] = access_state or "unknown"
    result["fetch_meta"] = fetch_meta or {}
    result["blocked_reason_code"] = access_state or "unknown"
    return result


def get_1688_product_detail(offer_id: str) -> dict:
    """通过1688 H5移动端API获取商品详情(标题、价格、图片列表)

    1688 PC端有严格反爬(需要登录cookie)，但H5移动端可以直接获取商品数据。
    此方法从H5页面HTML中提取 __INIT_DATA__ JSON，解析出商品详情。

    Args:
        offer_id: 1688商品ID(如 "977653357635")

    Returns:
        {
            "offer_id": str,
            "title": str,
            "price": float,
            "price_range": str,
            "main_image_url": str,
            "image_urls": [str],
            "product_url": str,
            "shop_name": str,
            "sale_quantity": int,
            "weight": float,  # 重量(kg)，可能为0
        }
        失败时返回 {"offer_id": offer_id, "error": "错误信息"}
    """
    try:
        import requests as raw_requests
    except ImportError:
        from urllib import request as urllib_request

    if not offer_id:
        return _build_1688_detail_error_result(
            offer_id,
            "offer_id is required",
            access_state="missing_offer_id",
        )

                      
    h5_url = f"https://m.1688.com/offer/{offer_id}.html"

    cfg = get_config()
    proxies = None
    if getattr(cfg, "source_proxy", ""):
        proxies = {"http": cfg.source_proxy, "https": cfg.source_proxy}

    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                       "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
                       "Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "https://m.1688.com/",
    }

    fetch_meta = {}
    try:
        import requests as raw_requests
        resp = raw_requests.get(h5_url, headers=headers, timeout=15, proxies=proxies)
        fetch_meta = {
            "status_code": getattr(resp, "status_code", None),
            "used_cookie": False,
            "final_url": str(getattr(resp, "url", h5_url)),
        }
        html = resp.text
    except Exception as e:
        html = ""
        fetch_meta = {"error": f"HTTP request failed: {e}", "used_cookie": False}

    diagnosis = _diagnose_1688_page_state(html)
    custom_cookies = _get_1688_custom_cookies()
    should_try_cookie = (
        bool(custom_cookies)
        and not fetch_meta.get("used_cookie")
        and diagnosis.get("state") in {"login_redirect", "anti_crawler", "empty"}
    ) or diagnosis.get("retry_with_cookie")

    if should_try_cookie:
        cookie_html, cookie_meta = _fetch_1688_h5_html_with_cookie(offer_id, proxies=proxies)
        if cookie_html:
            html = cookie_html
            fetch_meta = cookie_meta
            diagnosis = _diagnose_1688_page_state(html)
        elif cookie_meta.get("error"):
            fetch_meta = {**fetch_meta, **cookie_meta}

    if not html:
        return _handle_h5_detail_failure(
            offer_id,
            fetch_meta.get("error", "HTTP request failed"),
            fetch_meta=fetch_meta,
            access_state="empty",
            proxies=proxies,
        )

    if diagnosis.get("state") != "ok":
        return _handle_h5_detail_failure(
            offer_id,
            diagnosis.get("message", "1688 detail page blocked"),
            fetch_meta=fetch_meta,
            access_state=diagnosis.get("state", "unknown"),
            proxies=proxies,
        )

    if fetch_meta.get("status_code") not in {None, 200}:
        return _handle_h5_detail_failure(
            offer_id,
            f"HTTP {fetch_meta.get('status_code')}",
            fetch_meta=fetch_meta,
            access_state="http_error",
            proxies=proxies,
        )

                               
                                                                            
    init_match = re.search(
        r'(?:window\.)?__INIT_DATA\s*=\s*({.*?})\s*;?\s*(?:window\.|$)',
        html, re.DOTALL
    )
    if not init_match:
                              
        init_match = re.search(
            r'__INIT_DATA\s*=\s*(\{.+\})\s*;',
            html, re.DOTALL
        )

    if not init_match:
        diagnosis = _diagnose_1688_page_state(html)
        if diagnosis.get("state") != "ok":
            return _handle_h5_detail_failure(
                offer_id,
                diagnosis.get("message", "__INIT_DATA not found in HTML"),
                fetch_meta=fetch_meta,
                access_state=diagnosis.get("state", "unknown"),
                proxies=proxies,
            )
        return _handle_h5_detail_failure(
            offer_id,
            "__INIT_DATA not found in HTML",
            fetch_meta=fetch_meta,
            access_state="init_data_missing",
            proxies=proxies,
        )

    try:
        import json
        raw_json = init_match.group(1)
        data = json.loads(raw_json)
    except json.JSONDecodeError:
                                 
                                              
        try:
            import json
            decoder = json.JSONDecoder()
            data, _ = decoder.raw_decode(raw_json)
        except Exception:
                                  
            try:
                brace_count = 0
                end_pos = -1
                for i, ch in enumerate(raw_json):
                    if ch == '{':
                        brace_count += 1
                    elif ch == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            end_pos = i
                            break
                if end_pos > 0:
                    data = json.loads(raw_json[:end_pos+1])
                else:
                    return _handle_h5_detail_failure(
                        offer_id,
                        "JSON parse failed: no balanced braces",
                        fetch_meta=fetch_meta,
                        access_state="json_parse_failed",
                        proxies=proxies,
                    )
            except Exception as e:
                return _handle_h5_detail_failure(
                    offer_id,
                    f"JSON parse failed: {e}",
                    fetch_meta=fetch_meta,
                    access_state="json_parse_failed",
                    proxies=proxies,
                )

              
    data_str = json.dumps(data, ensure_ascii=False)

                                                           
    filtered_images = _extract_1688_image_urls("\n".join([data_str, html]))

                       
    title = ""
    for key in ["subject", "title", "offerTitle"]:
        match = re.search(rf'"{key}"\s*:\s*"([^"]+)"', data_str)
        if match:
            title = match.group(1)
            break
                              
    if not title:
        title_match = re.search(r'<title>(.*?)</title>', html)
        if title_match:
            title = title_match.group(1).replace("- 1688.com", "").strip()

          
    price = 0.0
    price_range = ""
                                         
    price_match = re.search(r'"price"\s*:\s*"([\d.]+)"', data_str)
    if price_match:
        try:
            price = float(price_match.group(1))
        except ValueError:
            pass
    if price == 0:
        price_match2 = re.search(r'"beginPrice"\s*:\s*"([\d.]+)"', data_str)
        if price_match2:
            try:
                price = float(price_match2.group(1))
            except ValueError:
                pass
    price_range_match = re.search(r'"priceInfo"\s*:\s*{[^}]*"price"\s*:\s*"([^"]+)"', data_str)
    if price_range_match:
        price_range = price_range_match.group(1)

           
    shop_name = ""
    shop_match = re.search(r'"shopName"\s*:\s*"([^"]+)"', data_str)
    if shop_match:
        shop_name = shop_match.group(1)

          
    sale_quantity = 0
    sale_match = re.search(r'"saleNum"\s*:\s*(\d+)', data_str)
    if sale_match:
        sale_quantity = int(sale_match.group(1))

              
    weight = 0.0
    weight_match = re.search(r'"weight"\s*:\s*([\d.]+)', data_str)
    if weight_match:
        try:
            weight = float(weight_match.group(1))
        except ValueError:
            pass

                                              
    skus = []
    sku_list_match = re.search(r'"skuList"\s*:\s*\[', data_str)
    if sku_list_match:
        try:
            sku_start = data_str.index("[", sku_list_match.start())
            brace = 0
            sku_end = sku_start
            for i, ch in enumerate(data_str[sku_start:], sku_start):
                if ch == '[':
                    brace += 1
                elif ch == ']':
                    brace -= 1
                    if brace == 0:
                        sku_end = i
                        break
            skus = json.loads(data_str[sku_start:sku_end + 1])
        except Exception:
            pass

                            
    specs = []
    if not skus:
        spec_match = re.search(r'"specList"\s*:\s*\[', data_str)
        if spec_match:
            try:
                spec_start = data_str.index("[", spec_match.start())
                brace = 0
                spec_end = spec_start
                for i, ch in enumerate(data_str[spec_start:], spec_start):
                    if ch == '[':
                        brace += 1
                    elif ch == ']':
                        brace -= 1
                        if brace == 0:
                            spec_end = i
                            break
                specs = json.loads(data_str[spec_start:spec_end + 1])
            except Exception:
                pass

                                      
    sale_props = []
    sp_match = re.search(r'"saleProp"\s*:\s*{', data_str)
    if sp_match:
        try:
            sp_start = data_str.index("{", sp_match.start())
            brace = 0
            sp_end = sp_start
            for i, ch in enumerate(data_str[sp_start:], sp_start):
                if ch == '{':
                    brace += 1
                elif ch == '}':
                    brace -= 1
                    if brace == 0:
                        sp_end = i
                        break
            sale_props_dict = json.loads(data_str[sp_start:sp_end + 1])
                                                           
            for k, v in sale_props_dict.items():
                if isinstance(v, str) and ',' in v:
                    sale_props.append({"name": k, "values": v.split(',')})
                elif isinstance(v, list):
                    sale_props.append({"name": k, "values": v})
        except Exception:
            pass

    main_image = _choose_best_1688_image_url(filtered_images) if filtered_images else ""

    detail_item = _normalize_source_item({
        "source": "1688_h5_detail",
        "offer_id": str(offer_id),
        "title": title,
        "price": price,
        "price_range": price_range,
        "main_image_url": main_image,
        "image_urls": filtered_images[:20],         
        "product_url": f"https://detail.1688.com/offer/{offer_id}.html",
        "shop_name": shop_name,
        "sale_quantity": sale_quantity,
        "weight": weight,
        "skus": skus[:10] if skus else [],
        "specs": specs[:10] if specs else [],
        "sale_props": sale_props,
    }, "1688_h5_detail")

    logger.info(f"[1688 Detail] offer_id={offer_id}, title={title}, "
                f"price={price}, images={len(filtered_images)}, weight={weight}kg, "
                f"skus={len(skus)}, specs={len(specs)}, sale_props={len(sale_props)}")

    return _build_1688_detail_success_result(
        offer_id,
        "1688_h5_detail",
        detail_item,
        fetch_meta=fetch_meta,
        detail_channel="h5_init_data",
    )


                                                             

def search_1688_by_image_rich(image_path: str = None, image_url: str = None,
                               max_page: int = 1, api_mode: bool = False,
                               proxies: dict = None) -> list:
    """通过内置ImgSearch1688引擎进行以图搜款，返回更丰富的结构化数据

    支持通过环境变量COZE_1688_cookies_7634436791660773376配置登录cookie绕过反爬。
    """
    try:
        from image_search_1688 import ImgSearch1688

        if image_path:
            results = ImgSearch1688.search_by_file(
                image_path, max_page=max_page, api_mode=api_mode, proxies=proxies)
        elif image_url:
            results = ImgSearch1688.search_by_url(
                image_url, max_page=max_page, api_mode=api_mode, proxies=proxies)
        else:
            return []

                                      
        normalized = []
        for item in results:
            normalized.append(_normalize_source_item({
                "source": "1688_image_search",
                "offer_id": str(item.get("offer_id", "")),
                "title": item.get("title", ""),
                "price": float(item.get("price", 0)),
                "product_url": item.get("product_url", ""),
                "image_url": item.get("image_url", ""),
                "province": item.get("province", ""),
                "city": item.get("city", ""),
                "company_name": item.get("company_name", ""),
                "brand": item.get("brand", ""),
                "quantity_begin": item.get("quantity_begin", 1),
                "quantity_prices": item.get("quantity_prices", []),
                "repurchase_rate": item.get("repurchase_rate", ""),
                "scores": item.get("scores", {}),
                "shop_tag": item.get("shop_tag", {}),
                "ali_talk_name": item.get("ali_talk_name", ""),
                "position_labels": item.get("position_labels", []),
                "sale_quantity": item.get("sale_quantity", 0),
            }, "1688_image_search"))
        return normalized
    except Exception as e:
        logger.warning(f"1688以图搜款失败: {e}")
        return []


                                                        

def calculate_profits(products: list, sell_price: float, cost_override: float = None,
                      weight: float = 100) -> list:
    """为搜索结果计算rFBS利润"""
    results = []
    for p in products:
        cost = cost_override if cost_override is not None else p.get("price", 0)
        if cost <= 0 or sell_price <= 0:
            continue

        profit_info = calculate_profit(
            sell_price_cny=sell_price,
            cost_cny=cost,
            weight_kg=weight / 1000,
        )
        p["profit"] = profit_info
        p["profit_margin"] = round(profit_info.get("profit_margin", 0), 2)
        results.append(p)
    return results


                                                        

def search_1688(keywords: str = None, image_path: str = None, image_url: str = None,
                sell_price: float = 0, cost: float = None, weight: float = 100,
                config=None) -> dict:
    """
    统一1688搜索入口

    Returns:
        {"status": "success", "source": "...", "products": [...], "count": N}
    """
    if config is None:
        config = get_config()

    proxies = None
    if config.source_proxy:
        proxies = {"http": config.source_proxy, "https": config.source_proxy}

    products = []
    search_source = "none"
    error_detail = None

                            
    if keywords:
        products = search_1688_by_text_ak(keywords)
        ak_error_detail = _consume_last_1688_source_error()
        if products:
            search_source = "1688_ak_text_search"
        elif ak_error_detail:
            error_detail = ak_error_detail

        if not products:
            products = search_1688_by_text(keywords, proxies)
            if products:
                search_source = "search1688api"
                error_detail = None

                                              
    elif image_path or image_url:
        products = search_1688_by_image_ak(image_path=image_path, image_url=image_url)
        ak_error_detail = _consume_last_1688_source_error()
        if products:
            search_source = "1688_ak_image_search"
        elif ak_error_detail:
            error_detail = ak_error_detail
        else:
            products = search_1688_by_image_rich(
                image_path=image_path, image_url=image_url, max_page=1, proxies=proxies
            )
            if products:
                search_source = "1688_image_search"
                error_detail = None
        if not products and image_path:
            products = search_1688_by_image(image_path, proxies)
            if products:
                search_source = "search1688api"
                error_detail = None

          
    if products and sell_price > 0:
        products = calculate_profits(products, sell_price, cost, weight)

    return _build_source_result(
        products,
        search_source,
        error=error_detail.get("user_message", "") if (error_detail and not products) else "",
        error_detail=error_detail if (error_detail and not products) else None,
        query={
            "keywords": keywords,
            "image_path": image_path,
            "image_url": image_url,
            "sell_price": sell_price,
            "cost": cost,
            "weight": weight,
        },
    )


                                                             

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="1688货源搜索 + 利润计算")
    parser.add_argument("--keywords", help="搜索关键词")
    parser.add_argument("--image", help="图片路径(以图搜款)")
    parser.add_argument("--image-url", help="图片URL(以图搜款)")
    parser.add_argument("--sell-price", type=float, default=0, help="Ozon售价(CNY)")
    parser.add_argument("--cost", type=float, default=None, help="采购成本(CNY)，不传则用搜索结果价格")
    parser.add_argument("--weight", type=float, default=100, help="包裹重量(g)")
    parser.add_argument("--store", help="店铺名称")
    parser.add_argument("--detail", help="获取商品详情(传offer_id)")
    parser.add_argument("--session-health", help="检查当前1688会话健康度(传offer_id)")
    parser.add_argument("--proxy", help="代理地址(http://...)")
    args = parser.parse_args()

            
    if args.detail:
        result = get_1688_product_detail(args.detail)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0)

    if args.session_health:
        result = check_1688_session_health(args.session_health)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0)

    if not args.keywords and not args.image and not args.image_url:
        parser.error("至少指定 --keywords, --image, --image-url, --detail 或 --session-health 其中之一")

    cfg = get_config(store_name=args.store)
    if args.proxy:
        cfg.source_proxy = args.proxy

    result = search_1688(
        keywords=args.keywords,
        image_path=args.image,
        image_url=args.image_url,
        sell_price=args.sell_price,
        cost=args.cost,
        weight=args.weight,
        config=cfg,
    )

    print(json.dumps(result, ensure_ascii=False, indent=2))
