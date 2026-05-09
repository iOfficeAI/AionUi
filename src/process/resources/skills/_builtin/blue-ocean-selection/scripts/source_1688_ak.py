#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""1688 AK 搜源相关辅助函数。"""

import base64
import hashlib
import hmac
import json
import time
import uuid
from urllib.parse import urlparse


AK_FIND_PRODUCT_PATH = "/api/findProduct/1.0.0"
AK_GATEWAY_BASE_URL = "https://skills-gateway.1688.com"


def extract_ak_pair(load_local_env_fn=None) -> tuple[str, str]:
    """读取 1688 AK，兼容 ALI_1688_AK 编码串与显式 key/secret。"""
    if load_local_env_fn:
        try:
            load_local_env_fn()
        except Exception:
            pass

    import os

    app_key = (os.environ.get("ALI1688_APP_KEY") or "").strip()
    app_secret = (os.environ.get("ALI1688_APP_SECRET") or "").strip()
    if app_key and app_secret:
        return app_key, app_secret

    raw_ak = (os.environ.get("ALI_1688_AK") or "").strip()
    if not raw_ak:
        try:
            from config import get_config
            cfg = get_config()
            app_key = (getattr(cfg, "alibaba_app_key", "") or "").strip()
            app_secret = (getattr(cfg, "alibaba_app_secret", "") or "").strip()
            if app_key and app_secret:
                return app_key, app_secret
            raw_ak = (getattr(cfg, "ali_1688_ak", "") or getattr(cfg, "alibaba_access_token", "") or "").strip()
        except Exception:
            raw_ak = ""
    if not raw_ak:
        return "", ""

    decoded = raw_ak
    try:
        decoded = base64.urlsafe_b64decode(raw_ak).decode("utf-8")
    except Exception:
        pass

    if len(decoded) >= 33:
        app_secret = decoded[:32].strip()
        app_key = decoded[32:].strip()
        if app_key and app_secret:
            return app_key, app_secret

    return "", ""


def build_1688_source_error(error_code: str, raw_message: str = "", extra: dict = None) -> dict:
    mappings = {
        "ak_missing": {
            "user_message": "AK 未配置",
            "action_hint": "运行 python3 cli.py configure YOUR_AK 配置认证信息；如无 API_KEY，请前往 https://clawhub.1688.com/ 获取",
            "retryable": False,
        },
        "ak_unauthorized": {
            "user_message": "签名无效或 AK 已过期",
            "action_hint": "请检查 AK 是否正确或已过期",
            "retryable": False,
        },
        "ak_rate_limited": {
            "user_message": "1688 AK 请求被限流",
            "action_hint": "建议等待 1-2 分钟后重试",
            "retryable": True,
        },
        "image_path_invalid": {
            "user_message": "图片路径无效",
            "action_hint": "请检查图片路径是否存在",
            "retryable": False,
        },
        "image_input_missing": {
            "user_message": "无法自动获取商品主图",
            "action_hint": "请手动提供商品图片 URL，使用 --image 参数；如仍无法获取，可改走浏览器提图降级流程",
            "retryable": False,
        },
        "response_format_error": {
            "user_message": "格式异常",
            "action_hint": "请稍后重试，可能是 API 返回异常",
            "retryable": True,
        },
        "ak_business_error": {
            "user_message": "1688 AK 搜索失败",
            "action_hint": "请稍后重试；若持续失败请检查 AK 配置与上游接口状态",
            "retryable": True,
        },
        "request_error": {
            "user_message": "1688 AK 请求异常",
            "action_hint": "请稍后重试；若持续失败请检查网络与 AK 网关可用性",
            "retryable": True,
        },
    }
    payload = {
        "error_code": error_code,
        "source_stage": "source",
        "provider": "1688_ak",
        **mappings.get(error_code, {
            "user_message": raw_message or "1688 AK 搜索失败",
            "action_hint": "请稍后重试",
            "retryable": True,
        }),
    }
    if raw_message:
        payload["raw_message"] = raw_message
    if extra:
        payload.update(extra)
    return payload


def canonicalize_ak_resource(uri: str) -> str:
    parsed = urlparse(uri)
    if not parsed.query:
        return parsed.path
    from urllib.parse import parse_qs, quote

    params = parse_qs(parsed.query)
    pairs = []
    for key in sorted(params.keys()):
        for value in sorted(params[key]):
            pairs.append(f"{quote(key, safe='')}={quote(value, safe='')}")
    return f"{parsed.path}?{'&'.join(pairs)}"


def build_ak_headers(method: str, uri: str, body: str, app_key: str, app_secret: str) -> dict:
    content_type = "application/json"
    timestamp = str(int(time.time()))
    nonce = uuid.uuid4().hex[:8]
    body_md5 = base64.b64encode(hashlib.md5(body.encode("utf-8")).digest()).decode("utf-8") if body else ""
    csk_headers = {
        "x-csk-ak": app_key,
        "x-csk-time": timestamp,
        "x-csk-nonce": nonce,
        "x-csk-content-md5": body_md5,
        "x-csk-version": "1.0.0",
    }
    canonicalized_headers = "".join(
        f"{key.lower()}:{str(value).strip()}\n"
        for key, value in sorted(csk_headers.items())
    )
    string_to_sign = (
        method.upper() + "\n"
        + body_md5 + "\n"
        + content_type + "\n"
        + timestamp + "\n"
        + canonicalized_headers
        + canonicalize_ak_resource(uri)
    )
    signature = base64.b64encode(
        hmac.new(
            app_secret.encode("utf-8"),
            string_to_sign.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")
    return {
        "Content-Type": content_type,
        "x-csk-sign": signature,
        **csk_headers,
    }


def call_1688_ak_find_product(
    request_body: dict,
    *,
    logger,
    extract_ak_pair_fn,
    set_last_error_fn,
    requests_post_fn,
    timeout: int = 30,
    gateway_base_url: str = AK_GATEWAY_BASE_URL,
    path: str = AK_FIND_PRODUCT_PATH,
) -> list:
    app_key, app_secret = extract_ak_pair_fn()
    if not app_key or not app_secret:
        logger.info("1688 AK 未配置，跳过 AK 搜索主链路")
        set_last_error_fn(build_1688_source_error("ak_missing"))
        return []

    body = json.dumps({"request": request_body}, ensure_ascii=False)
    headers = build_ak_headers("POST", path, body, app_key, app_secret)
    try:
        set_last_error_fn(None)
        resp = requests_post_fn(
            f"{gateway_base_url}{path}",
            headers=headers,
            data=body.encode("utf-8"),
            timeout=timeout,
        )
        if resp.status_code == 401:
            logger.warning("1688 AK 搜索失败: 签名无效或已过期 (401)")
            set_last_error_fn(build_1688_source_error("ak_unauthorized", "401"))
            return []
        if resp.status_code == 429:
            logger.warning("1688 AK 搜索失败: 请求被限流 (429)")
            set_last_error_fn(build_1688_source_error("ak_rate_limited", "429"))
            return []
        if not resp.ok:
            logger.warning(f"1688 AK 搜索失败: HTTP {resp.status_code}")
            set_last_error_fn(build_1688_source_error(
                "request_error",
                f"HTTP {resp.status_code}",
                {"status_code": getattr(resp, "status_code", None)},
            ))
            return []

        payload = resp.json()
        if payload.get("success") is False:
            raw_message = payload.get("msgInfo") or payload.get("msgCode") or "unknown"
            logger.warning(f"1688 AK 搜索业务失败: {raw_message}")
            normalized_error_code = "ak_business_error"
            if "签名无效" in raw_message or str(payload.get("code")) == "401":
                normalized_error_code = "ak_unauthorized"
            elif "限流" in raw_message or str(payload.get("code")) == "429":
                normalized_error_code = "ak_rate_limited"
            set_last_error_fn(build_1688_source_error(
                normalized_error_code,
                raw_message,
                {
                    "msg_code": payload.get("msgCode"),
                    "upstream_code": payload.get("code"),
                },
            ))
            return []

        model = payload.get("model") if isinstance(payload.get("model"), dict) else payload.get("data")
        if not isinstance(model, dict):
            logger.warning("1688 AK 搜索返回格式异常: model/data 缺失")
            set_last_error_fn(build_1688_source_error("response_format_error", "model/data 缺失"))
            return []

        data = model.get("data")
        if not isinstance(data, list):
            logger.warning("1688 AK 搜索返回格式异常: data 不是列表")
            set_last_error_fn(build_1688_source_error("response_format_error", "data 不是列表"))
            return []

        set_last_error_fn(None)
        return data
    except Exception as e:
        logger.warning(f"1688 AK 搜索异常: {e}")
        set_last_error_fn(build_1688_source_error("request_error", str(e)))
        return []


def normalize_1688_ak_results(raw_products: list, source_name: str, normalize_source_item_fn) -> list:
    results = []
    for item in raw_products or []:
        offer_id = str(item.get("itemId") or item.get("product_id") or "")
        detail_url = item.get("detailUrl") or item.get("detail_url") or ""
        if not detail_url and offer_id:
            detail_url = f"https://detail.1688.com/offer/{offer_id}.html"
        results.append(normalize_source_item_fn({
            "source": source_name,
            "offer_id": offer_id,
            "title": item.get("title", ""),
            "price": item.get("currentPrice", item.get("price", 0)),
            "product_url": detail_url,
            "image_url": item.get("imageUrl") or item.get("image_url") or "",
            "company_name": item.get("company", item.get("supplier", "")),
            "sale_quantity": item.get("soldOut", item.get("sold_count", 0)),
            "stock_amount": item.get("storeAmount", item.get("stock_amount", 0)),
            "similarity_score": item.get("score", item.get("similarity_score", 0)),
            "member_id": item.get("memberId", ""),
            "user_id": item.get("userId", ""),
            "promotion_tags": item.get("promotionTags", []),
            "service_infos": item.get("serviceInfos", []),
            "selling_points": item.get("sellingPoints", []),
        }, source_name))
    return results
