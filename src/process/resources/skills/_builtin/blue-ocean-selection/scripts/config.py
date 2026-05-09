#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一配置管理
============

所有脚本通过 config.get_config() 获取配置，凭证只配一次。

读取优先级：COZE凭证变量 → 环境变量 → stores.json → 代码默认值

用法:
    from config import get_config
    cfg = get_config()           # 默认店铺
    cfg = get_config("副店铺")    # 指定店铺

    cfg.ozon_api_key
    cfg.ozon_client_id
    cfg.mxou_api_key
    cfg.mxou_model
    cfg.cos_secret_id
    ...
"""

import os
import json
import logging
import ntpath
from dataclasses import dataclass, asdict, field
from typing import Optional

logger = logging.getLogger(__name__)

SKILL_ID = "7634436791660773376"


def _candidate_store_config_paths(base_dir: Optional[str] = None) -> list[str]:
    """候选店铺配置路径：显式环境变量 -> local -> example -> legacy。"""
    resolved_base = base_dir or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    use_nt = "\\" in resolved_base or (len(resolved_base) >= 2 and resolved_base[1] == ":")
    pathmod = ntpath if use_nt else os.path
    assets_dir = pathmod.join(resolved_base, "assets")
    candidates = []

    explicit = os.environ.get("STORE_CONFIG_PATH", "").strip()
    if explicit:
        candidates.append(pathmod.normpath(explicit))

    candidates.extend([
        pathmod.normpath(pathmod.join(assets_dir, "stores.local.json")),
        pathmod.normpath(pathmod.join(assets_dir, "stores.json")),
        pathmod.normpath(pathmod.join(assets_dir, "stores.example.json")),
    ])
    return candidates


def _resolve_store_config_path(store_config_path: Optional[str] = None,
                               base_dir: Optional[str] = None) -> Optional[str]:
    """解析实际要读取的店铺配置文件路径。"""
    if store_config_path:
        return os.path.normpath(store_config_path)

    for candidate in _candidate_store_config_paths(base_dir=base_dir):
        if os.path.exists(candidate):
            return candidate
    return None


def _load_local_env(env_path: Optional[str] = None) -> None:
    """轻量加载项目 .env，已存在的环境变量不覆盖。"""
    candidate = env_path or os.environ.get("DOTENV_PATH", "")
    if not candidate:
        candidate = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.exists(candidate):
        return
    try:
        with open(candidate, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as e:
        logger.warning(f"加载 .env 失败: {e}")


def _read_credential(credential_name: str, fallback_env: str) -> str:
    """读取凭证：COZE凭证变量 → 环境变量"""
    coze_key = f"COZE_{credential_name.upper()}_{SKILL_ID}"
    value = os.environ.get(coze_key, "")
    if not value:
        value = os.environ.get(fallback_env, "")
    return value


def _safe_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass
class Config:
    """统一配置"""
    ozon_api_key: str = ""
    ozon_client_id: str = ""
    ozon_api_url: str = "https://api-seller.ozon.ru"
    mxou_api_key: str = ""
    mxou_api_url: str = "https://api.mxou.cn"
    mxou_model: str = "MiniMax-M2.7-highspeed"         # LLM文本模型
    mxou_vision_model: str = "doubao-seed-1-8-251228"   # 视觉理解模型(支持image_url)
    mxou_image_model: str = "nano-banana-fast"       # 图片生成模型
    mxou_image_scene_concurrency: int = 3
    cos_secret_id: str = ""
    cos_secret_key: str = ""
    cos_bucket: str = ""
    cos_region: str = "ap-guangzhou"
    ozon_proxy: str = ""
    source_proxy: str = ""
    store_name: str = "默认店铺"
    logistics_provider: str = "RETS"              # 承运商: RETS/OYX/GUOO
    delivery_speed: str = "standard"              # 配送速度: express/standard/economy
    delivery_type: str = "pickup"                 # 交货方式: pickup/courier
    target_profit_rate: float = 0.40              # 目标利润率(0.35-0.50, 默认40%)
    exchange_rate_buffer: float = 0.06            # 汇率波动预留(0.05-0.08, 默认6%)
    packaging_fee_cny: float = 3.0                # 单件包装费(CNY)
    default_commission_category: str = "default"  # 默认佣金类目
    ali_1688_ak: str = ""
    alibaba_app_key: str = ""
    alibaba_app_secret: str = ""
    @property
    def alibaba_access_token(self) -> str:
        return self.ali_1688_ak or ""

    def to_dict(self) -> dict:
        return asdict(self)


def _load_store_file(config_path: str, store_name: Optional[str] = None) -> Optional[dict]:
    """从stores.json加载指定店铺的配置"""
    if not os.path.exists(config_path):
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"读取店铺配置失败: {e}")
        return None

    stores = data.get("stores", [])
    if not stores:
        return None

    if store_name:
        for s in stores:
            if s.get("name") == store_name:
                return s
    return stores[0]


def get_config(store_name: Optional[str] = None,
               store_config_path: Optional[str] = None) -> Config:
    """
    获取统一配置

    优先级：COZE凭证变量 → 环境变量 → stores.json → 代码默认值
    """
    _load_local_env()

    ozon_api_key = _read_credential("ozon_api", "OZON_API_KEY")
    mxou_api_key = _read_credential("mxou_api", "MXOU_API_KEY")
    ozon_client_id = os.environ.get("OZON_CLIENT_ID", "")
    config_path = _resolve_store_config_path(store_config_path)

    store_data = _load_store_file(config_path, store_name) if config_path else None

    if store_data:
        resolved_client_id = ozon_client_id or str(store_data.get("ozon_client_id", ""))
        resolved_store_name = store_name or store_data.get("name", "默认店铺")
        if not ozon_api_key:
            ozon_api_key = store_data.get("ozon_api_key", "")
        if not mxou_api_key:
            mxou_api_key = store_data.get("mxou_api_key", "")
        mxou_image_model = os.environ.get("MXOU_IMAGE_MODEL", "") or store_data.get("mxou_image_model", Config.mxou_image_model)
        mxou_image_scene_concurrency = _safe_int(
            os.environ.get(
                "MXOU_IMAGE_SCENE_CONCURRENCY",
                store_data.get("mxou_image_scene_concurrency", Config.mxou_image_scene_concurrency),
            ),
            Config.mxou_image_scene_concurrency,
        )
        cos_sid = os.environ.get("COS_SECRET_ID", "") or store_data.get("cos_secret_id", Config.cos_secret_id)
        cos_skey = os.environ.get("COS_SECRET_KEY", "") or store_data.get("cos_secret_key", Config.cos_secret_key)
        cos_bkt = os.environ.get("COS_BUCKET", "") or store_data.get("cos_bucket", Config.cos_bucket)
        cos_rgn = os.environ.get("COS_REGION", "") or store_data.get("cos_region", Config.cos_region)
        ozon_proxy = os.environ.get("OZON_PROXY", "") or store_data.get("ozon_proxy", "")
        source_proxy = os.environ.get("SOURCE_PROXY", "") or store_data.get("source_proxy", "")
        logistics_provider = os.environ.get("LOGISTICS_PROVIDER", "") or store_data.get("logistics_provider", Config.logistics_provider)
        delivery_speed = os.environ.get("DELIVERY_SPEED", "") or store_data.get("delivery_speed", Config.delivery_speed)
        delivery_type = os.environ.get("DELIVERY_TYPE", "") or store_data.get("delivery_type", Config.delivery_type)
        ali_1688_ak = os.environ.get("ALI_1688_AK", "") or store_data.get("ali_1688_ak", "")
        alibaba_app_key = os.environ.get("ALI1688_APP_KEY", "") or store_data.get("alibaba_app_key", "")
        alibaba_app_secret = os.environ.get("ALI1688_APP_SECRET", "") or store_data.get("alibaba_app_secret", "")
        target_profit_rate = _safe_float(
            os.environ.get("TARGET_PROFIT_RATE", store_data.get("target_profit_rate", Config.target_profit_rate)),
            Config.target_profit_rate,
        )
        exchange_rate_buffer = _safe_float(
            os.environ.get("EXCHANGE_RATE_BUFFER", store_data.get("exchange_rate_buffer", Config.exchange_rate_buffer)),
            Config.exchange_rate_buffer,
        )
        packaging_fee_cny = _safe_float(
            os.environ.get("PACKAGING_FEE_CNY", store_data.get("packaging_fee_cny", Config.packaging_fee_cny)),
            Config.packaging_fee_cny,
        )
        default_commission_category = os.environ.get("DEFAULT_COMMISSION_CATEGORY", "") or store_data.get(
            "default_commission_category",
            Config.default_commission_category,
        )

        logger.info(f"加载店铺配置: {resolved_store_name}")
    else:
        resolved_client_id = ozon_client_id
        resolved_store_name = store_name or "默认店铺"
        if not ozon_api_key:
            ozon_api_key = os.environ.get("OZON_API_KEY", "")
        if not mxou_api_key:
            mxou_api_key = os.environ.get("MXOU_API_KEY", "")

        mxou_image_model = os.environ.get("MXOU_IMAGE_MODEL", Config.mxou_image_model)
        mxou_image_scene_concurrency = _safe_int(
            os.environ.get("MXOU_IMAGE_SCENE_CONCURRENCY", Config.mxou_image_scene_concurrency),
            Config.mxou_image_scene_concurrency,
        )

        cos_sid = os.environ.get("COS_SECRET_ID", Config.cos_secret_id)
        cos_skey = os.environ.get("COS_SECRET_KEY", Config.cos_secret_key)
        cos_bkt = os.environ.get("COS_BUCKET", Config.cos_bucket)
        cos_rgn = os.environ.get("COS_REGION", Config.cos_region)

        ozon_proxy = os.environ.get("OZON_PROXY", "")
        source_proxy = os.environ.get("SOURCE_PROXY", "")
        logistics_provider = os.environ.get("LOGISTICS_PROVIDER", Config.logistics_provider)
        delivery_speed = os.environ.get("DELIVERY_SPEED", Config.delivery_speed)
        delivery_type = os.environ.get("DELIVERY_TYPE", Config.delivery_type)
        ali_1688_ak = os.environ.get("ALI_1688_AK", "")
        alibaba_app_key = os.environ.get("ALI1688_APP_KEY", "")
        alibaba_app_secret = os.environ.get("ALI1688_APP_SECRET", "")
        target_profit_rate = _safe_float(os.environ.get("TARGET_PROFIT_RATE", Config.target_profit_rate), Config.target_profit_rate)
        exchange_rate_buffer = _safe_float(os.environ.get("EXCHANGE_RATE_BUFFER", Config.exchange_rate_buffer), Config.exchange_rate_buffer)
        packaging_fee_cny = _safe_float(os.environ.get("PACKAGING_FEE_CNY", Config.packaging_fee_cny), Config.packaging_fee_cny)
        default_commission_category = os.environ.get("DEFAULT_COMMISSION_CATEGORY", Config.default_commission_category)

        logger.info("未找到店铺配置文件，使用环境变量模式")

    return Config(
        ozon_api_key=ozon_api_key,
        ozon_client_id=resolved_client_id,
        ozon_api_url=os.environ.get("OZON_API_URL", "https://api-seller.ozon.ru"),
        mxou_api_key=mxou_api_key,
        mxou_api_url="https://api.mxou.cn",
        mxou_model=os.environ.get("MXOU_MODEL", "MiniMax-M2.7-highspeed"),
        mxou_vision_model=os.environ.get("MXOU_VISION_MODEL", "doubao-seed-1-8-251228"),
        mxou_image_model=mxou_image_model if 'mxou_image_model' in dir() else os.environ.get("MXOU_IMAGE_MODEL", "nano-banana-fast"),
        mxou_image_scene_concurrency=mxou_image_scene_concurrency if 'mxou_image_scene_concurrency' in dir() else _safe_int(os.environ.get("MXOU_IMAGE_SCENE_CONCURRENCY", 3), 3),
        cos_secret_id=cos_sid,
        cos_secret_key=cos_skey,
        cos_bucket=cos_bkt,
        cos_region=cos_rgn,
        ozon_proxy=ozon_proxy,
        source_proxy=source_proxy,
        store_name=resolved_store_name,
        logistics_provider=logistics_provider,
        delivery_speed=delivery_speed,
        delivery_type=delivery_type,
        target_profit_rate=target_profit_rate,
        exchange_rate_buffer=exchange_rate_buffer,
        packaging_fee_cny=packaging_fee_cny,
        default_commission_category=default_commission_category,
        ali_1688_ak=ali_1688_ak if 'ali_1688_ak' in dir() else os.environ.get("ALI_1688_AK", ""),
        alibaba_app_key=alibaba_app_key if 'alibaba_app_key' in dir() else os.environ.get("ALI1688_APP_KEY", ""),
        alibaba_app_secret=alibaba_app_secret if 'alibaba_app_secret' in dir() else os.environ.get("ALI1688_APP_SECRET", ""),
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="查看当前配置")
    parser.add_argument("--store", help="店铺名称")
    parser.add_argument("--show-keys", action="store_true", help="显示密钥(默认脱敏)")
    args = parser.parse_args()

    cfg = get_config(store_name=args.store)

    def mask(val: str, show: bool = False) -> str:
        if show or not val:
            return val or "(空)"
        if len(val) <= 8:
            return "****"
        return val[:4] + "****" + val[-4:]

    print(f"店铺: {cfg.store_name}")
    print(f"Ozon Client-Id: {cfg.ozon_client_id}")
    print(f"Ozon API Key: {mask(cfg.ozon_api_key, args.show_keys)}")
    print(f"Ozon API URL: {cfg.ozon_api_url}")
    print(f"mxou API Key: {mask(cfg.mxou_api_key, args.show_keys)}")
    print(f"mxou Model: {cfg.mxou_model}")
    print(f"COS SecretId: {mask(cfg.cos_secret_id, args.show_keys)}")
    print(f"COS SecretKey: {mask(cfg.cos_secret_key, args.show_keys)}")
    print(f"COS Bucket: {cfg.cos_bucket}")
    print(f"COS Region: {cfg.cos_region}")
    print(f"Ozon Proxy: {cfg.ozon_proxy or '(未设置)'}")
    print(f"Source Proxy: {cfg.source_proxy or '(未设置)'}")
