#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
蓝海选品 - 完整Pipeline (三层降级架构)
=====================================

统一入口：选品 → 货源匹配 → 图片生成 → COS上传 → Ozon上架

三层降级：
- Tier 1 (核心): 纯API，LLM辅助
- Tier 2 (增强): +1688官方API
- Tier 3 (完整): +浏览器/代理

作者: haloclaw
版本: 5.4
"""

import os
import sys
import json
import time
import random
import re
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict

from policy_constants import ATTRIBUTE_QUALITY_THRESHOLD, REAL_SOURCE_EVIDENCE_BLOCK_REASON
from source_result_contract import has_real_procurement_mapping


SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')



_offer_counter_file = os.path.join(SCRIPTS_DIR, "..", "assets", ".offer_counter.json")
_default_runtime_root = os.path.join(SCRIPTS_DIR, "..", "artifacts", "runtime")


def _get_offer_counter_file() -> str:
    """允许测试/脚本重定向计数器路径，避免污染仓库默认计数文件。"""
    override = (os.environ.get("BLUE_OCEAN_OFFER_COUNTER_FILE") or "").strip()
    return override or _offer_counter_file


def _slugify_runtime_segment(value: str, fallback: str = "item") -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    normalized = re.sub(r"[\\\\/:*?\"<>|]+", "-", raw)
    normalized = re.sub(r"\s+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-._ ")
    return (normalized[:80] or fallback)


def _get_runtime_root_dir() -> str:
    override = (os.environ.get("BLUE_OCEAN_RUNTIME_ROOT") or "").strip()
    return override or _default_runtime_root


def _build_runtime_output_dir(store_id: str, product_id: str, category_slug: str) -> Tuple[str, str]:
    from datetime import datetime
    runtime_root = _get_runtime_root_dir()
    date_part = datetime.now().strftime("%Y%m%d")
    safe_store = _slugify_runtime_segment(store_id or "default", fallback="default")
    safe_slug = _slugify_runtime_segment(category_slug or "product", fallback="product")
    folder_name = f"{safe_store}-{product_id}-{safe_slug}"
    output_dir = os.path.join(runtime_root, date_part, folder_name)
    return folder_name, output_dir


def _generate_offer_id() -> str:
    """生成格式为pc-YYYYMMDD-NNN的offer_id，同一天内NNN自增"""
    from datetime import datetime
    today = datetime.now().strftime("%Y%m%d")
    counter_file = _get_offer_counter_file()


    counter_data = {}
    if os.path.exists(counter_file):
        try:
            with open(counter_file, "r") as f:
                counter_data = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass


    if counter_data.get("date") == today:
        counter_data["seq"] = counter_data.get("seq", 0) + 1
    else:
        counter_data = {"date": today, "seq": 1}


    os.makedirs(os.path.dirname(counter_file), exist_ok=True)
    try:
        with open(counter_file, "w") as f:
            json.dump(counter_data, f)
    except IOError:
        pass

    return f"pc-{today}-{counter_data['seq']:03d}"


def _contains_cyrillic(text: str) -> bool:
    return bool(re.search(r"[А-Яа-яЁё]", str(text or "")))


def _looks_like_latin_only_token(text: str) -> bool:
    cleaned = str(text or "").strip()
    if not cleaned:
        return False
    if _contains_cyrillic(cleaned):
        return False
    if re.search(r"[0-9]", cleaned):
        return False
    normalized = re.sub(r"[^A-Za-z ]", " ", cleaned)
    tokens = [token for token in normalized.split() if token]
    if len(tokens) != 1:
        return False
    token = tokens[0]
    return 2 <= len(token) <= 8 and token.upper() == token


def _category_conflict_reason(product_name: str, product_info: Dict = None, category_info: Dict = None) -> str:
    product_info = product_info or {}
    category_info = category_info or {}
    keyword_haystack = " ".join([
        str(product_name or ""),
        str(product_info.get("title") or ""),
        str(product_info.get("product_name") or ""),
        str(product_info.get("model") or ""),
        str(product_info.get("shop_name") or ""),
        " ".join(str(v) for v in (product_info.get("visible_fields") or [])),
    ]).lower()
    category_haystack = " ".join([
        str(category_info.get("name") or ""),
        str(category_info.get("type_name") or ""),
        str(category_info.get("type_name_ru") or ""),
        str(product_info.get("product_type") or ""),
        str(product_info.get("product_type_ru") or ""),
        str(product_info.get("category_type") or ""),
    ]).lower()

    toy_terms = ["婴儿", "婴幼儿", "宝宝", "儿童", "玩具", "益智", "爬行"]
    adult_terms = ["成人用品", "性爱", "情趣", "润滑剂", "清洁剂", "避孕套", "月经杯"]
    cleaning_terms = ["清洁剂", "清洗剂", "润滑剂", "护理液"]

    if any(term in keyword_haystack for term in toy_terms) and any(term in category_haystack for term in adult_terms):
        return "类目语义冲突: 婴儿/儿童/玩具商品命中成人用品类目"
    if not any(term in keyword_haystack for term in ["清洁", "清洗", "护理液", "润滑"]) and any(term in category_haystack for term in cleaning_terms):
        return "类目语义冲突: 非清洁/护理商品命中清洁剂/护理类目"
    return ""


@dataclass
class PipelineConfig:
    """Pipeline配置 - 统一从config.py加载，不再各自读取环境变量"""
    ozon_client_id: str = ""
    ozon_api_key: str = ""
    ozon_api_url: str = "https://api-seller.ozon.ru"

    mxou_api_key: str = ""
    mxou_api_url: str = "https://api.mxou.cn"
    mxou_model: str = "MiniMax-M2.7-highspeed"
    mxou_image_model: str = "nano-banana-fast"
    mxou_vision_model: str = "doubao-seed-1-8-251228"
    mxou_image_scene_concurrency: int = 3

    cos_secret_id: str = ""
    cos_secret_key: str = ""
    cos_bucket: str = ""
    cos_region: str = ""

    alibaba_app_key: str = ""
    alibaba_app_secret: str = ""
    alibaba_access_token: str = ""

    ozon_proxy: str = ""
    source_proxy: str = ""
    logistics_provider: str = "RETS"
    delivery_speed: str = "standard"
    delivery_type: str = "pickup"
    target_profit_rate: float = 0.40
    exchange_rate_buffer: float = 0.06
    packaging_fee_cny: float = 3.0

    @classmethod
    def from_config(cls, store_name: str = None) -> "PipelineConfig":
        """从统一config模块加载配置"""
        from config import get_config
        c = get_config(store_name=store_name)
        defaults = cls()
        return cls(
            ozon_api_key=getattr(c, "ozon_api_key", defaults.ozon_api_key),
            ozon_client_id=getattr(c, "ozon_client_id", defaults.ozon_client_id),
            ozon_api_url=getattr(c, "ozon_api_url", defaults.ozon_api_url),
            mxou_api_key=getattr(c, "mxou_api_key", defaults.mxou_api_key),
            mxou_api_url=getattr(c, "mxou_api_url", defaults.mxou_api_url),
            mxou_model=getattr(c, "mxou_model", defaults.mxou_model),
            mxou_image_model=getattr(c, "mxou_image_model", defaults.mxou_image_model),
            mxou_vision_model=getattr(c, "mxou_vision_model", defaults.mxou_vision_model),
            mxou_image_scene_concurrency=getattr(c, "mxou_image_scene_concurrency", defaults.mxou_image_scene_concurrency),
            cos_secret_id=getattr(c, "cos_secret_id", defaults.cos_secret_id),
            cos_secret_key=getattr(c, "cos_secret_key", defaults.cos_secret_key),
            cos_bucket=getattr(c, "cos_bucket", defaults.cos_bucket),
            cos_region=getattr(c, "cos_region", defaults.cos_region),
            ozon_proxy=getattr(c, "ozon_proxy", defaults.ozon_proxy),
            source_proxy=getattr(c, "source_proxy", defaults.source_proxy),
            logistics_provider=getattr(c, "logistics_provider", defaults.logistics_provider),
            delivery_speed=getattr(c, "delivery_speed", defaults.delivery_speed),
            delivery_type=getattr(c, "delivery_type", defaults.delivery_type),
            target_profit_rate=getattr(c, "target_profit_rate", defaults.target_profit_rate),
            exchange_rate_buffer=getattr(c, "exchange_rate_buffer", defaults.exchange_rate_buffer),
            packaging_fee_cny=getattr(c, "packaging_fee_cny", defaults.packaging_fee_cny),
        )

    @classmethod
    def from_env(cls) -> "PipelineConfig":
        """兼容旧调用方式，内部委托给from_config"""
        return cls.from_config()

    @classmethod
    def from_store_config(cls, store_name=None, store_config_path=None) -> "PipelineConfig":
        """兼容旧调用方式，内部委托给from_config"""
        return cls.from_config(store_name=store_name)


class OzonAPIClient:
    """Ozon API客户端（精简版）"""

    def __init__(self, client_id: str, api_key: str, api_url: str = "https://api-seller.ozon.ru"):
        self.client_id = client_id
        self.api_key = api_key
        self.api_url = api_url
        self.session = None

    def _get_session(self):
        if self.session is None:
            from http_client import requests
            self.session = requests.Session()
            self.session.headers.update({
                "Client-Id": self.client_id,
                "Api-Key": self.api_key,
                "Content-Type": "application/json"
            })
        return self.session

    def get_category_tree(self, language: str = "ZH_HANS") -> Optional[List[Dict]]:
        """按官方契约获取类目树，仅传 language。"""
        try:
            resp = self._get_session().post(
                f"{self.api_url}/v1/description-category/tree",
                json={"language": language or "DEFAULT"},
                timeout=30
            )
            if resp.ok:
                payload = resp.json()
                result = payload.get("result")
                if isinstance(result, list):
                    return result
                legacy = payload.get("categories")
                if isinstance(legacy, list):
                    return legacy
        except Exception as e:
            logger.error(f"获取类目树失败: {e}")
        return None

    def get_category_attributes(self, description_category_id: int, type_id: int) -> Optional[List[Dict]]:
        """获取类目属性"""
        try:
            resp = self._get_session().post(
                f"{self.api_url}/v1/description-category/attribute",
                json={
                    "description_category_id": description_category_id,
                    "type_id": type_id,
                    "language": "ZH_HANS",
                },
                timeout=30
            )
            if resp.ok:
                return resp.json().get("result", [])
        except Exception as e:
            logger.error(f"获取类目属性失败: {e}")
        return None


class MxouLLMClient:
    """mxou.cn LLM客户端（精简版）"""

    def __init__(self, api_key: str, api_url: str = "https://api.mxou.cn", model: str = "deepseek-v4-flash"):
        self.api_key = api_key
        self.api_url = api_url
        self.model = model

    def chat(self, prompt: str, model: str = "", max_tokens: int = 4096) -> Optional[str]:
        """发送对话请求"""
        try:
            from http_client import requests
            use_model = model or self.model
            resp = requests.post(
                f"{self.api_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": use_model,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.3
                },
                timeout=90
            )
            if resp.ok:
                data = resp.json()
                msg = data.get("choices", [{}])[0].get("message", {})
                content = msg.get("content", "").strip()
                if content:
                    return content

                reasoning = msg.get("reasoning_content", "").strip()
                if reasoning:
                    import re as _re

                    json_match = _re.search(r'[\[{].*[\]}]', reasoning, _re.DOTALL)
                    if json_match:
                        return json_match.group()

                    quoted = _re.findall(r'["\u201c\u201d\u00ab\u00bb](.+?)["\u201c\u201d\u00ab\u00bb]', reasoning)
                    if quoted:
                        return quoted[-1].strip()
                    lines = [l.strip() for l in reasoning.split('\n') if l.strip()]
                    return lines[-1] if lines else None
                return None
        except Exception as e:
            logger.error(f"LLM请求失败: {e}")
        return None

    def analyze_blue_ocean(self, keywords: List[str]) -> Dict:
        """分析蓝海选品机会"""
        prompt = f"""分析以下产品关键词的蓝海选品机会（Ozon俄罗斯市场）：

产品关键词: {', '.join(keywords)}

请输出JSON格式：
{{"demand_analysis": "需求分析", "competition_level": "low/medium/high",
  "profit_margin_estimate": "30-50%", "blue_ocean_opportunities": ["机会1", "机会2"],
  "recommended_products": ["产品建议1", "产品建议2"], "suggested_price_range": "500-1000 RUB"}}

请只输出JSON。"""

        result = self.chat(prompt)
        if result:
            try:
                if "```json" in result:
                    result = result.split("```json")[1].split("```")[0]
                return json.loads(result.strip())
            except:
                return {"error": "解析失败", "raw": result[:200]}
        return {"error": "LLM调用失败"}


class BlueOceanPipeline:
    """
    蓝海选品完整Pipeline

    流程：选品分析 → 货源匹配 → 图片生成 → COS上传 → Ozon上架
    """

    def __init__(self, config: PipelineConfig = None):
        self.config = config or PipelineConfig.from_env()
        self.tier = self._detect_tier()
        self._init_clients()

    def _detect_tier(self) -> str:
        """检测当前可用Tier"""

        tier1_ok = bool(self.config.ozon_api_key and self.config.mxou_api_key)
        if not tier1_ok:
            return "tier1_limited"


        has_alibaba_api = bool(self.config.alibaba_access_token)
        has_proxies = bool(self.config.ozon_proxy and self.config.source_proxy)

        if has_proxies:
            return "tier3_full"
        elif has_alibaba_api:
            return "tier2_enhanced"
        else:
            return "tier1_core"

    def _init_clients(self):
        """初始化客户端"""
        self.ozon_api = None
        self.llm = None

        if self.config.ozon_api_key:
            self.ozon_api = OzonAPIClient(
                self.config.ozon_client_id,
                self.config.ozon_api_key,
                self.config.ozon_api_url
            )

        if self.config.mxou_api_key:
            self.llm = MxouLLMClient(
                self.config.mxou_api_key,
                self.config.mxou_api_url,
                self.config.mxou_model
            )

    def run_selection(self, keywords: List[str]) -> Dict:
        """
        Step 1: 选品分析

        Tier 1: 使用LLM分析（无真实市场数据）
        Tier 2/3: 额外使用API数据分析
        """
        result = {
            "success": True,
            "tier": self.tier,
            "keywords": keywords,
            "stages": {}
        }

        logger.info(f"[Pipeline] 开始选品分析 (Tier: {self.tier})")


        if self.ozon_api:
            tree = self.ozon_api.get_category_tree()
            result["stages"]["category_tree"] = {"success": tree is not None, "data": tree[:3] if tree else None}


        if self.llm:
            logger.info("[Pipeline] 调用LLM分析蓝海机会...")
            llm_result = self.llm.analyze_blue_ocean(keywords)
            result["stages"]["llm_analysis"] = {"success": True, "data": llm_result}
            result["analysis"] = llm_result


            purchase_keywords = self._generate_purchase_keywords(keywords)
            result["purchase_keywords"] = purchase_keywords
        else:
            result["stages"]["llm_analysis"] = {"success": False, "error": "未配置LLM"}
            result["error"] = "请配置MXOU_API_KEY"

        return result

    def _generate_purchase_keywords(self, keywords: List[str]) -> List[str]:
        """生成1688采购关键词"""
        if not self.llm:
            return keywords

        prompt = f"""将以下俄语产品关键词翻译成中文1688采购关键词：

关键词: {', '.join(keywords)}

输出JSON数组，例如：["中文翻译 产品", "材质 产品 批发"]

只输出JSON。"""

        result = self.llm.chat(prompt)
        if result:
            try:
                if "```json" in result:
                    result = result.split("```json")[1].split("```")[0]
                kw_list = json.loads(result.strip())
                if isinstance(kw_list, list):
                    return kw_list
            except:
                pass

        return [f"{kw} 批发" for kw in keywords]

    def run_source_match(self, keywords: List[str], cost_cny: float, weight_kg: float = 0.3) -> Dict:
        """
        Step 2: 货源匹配

        优先使用 source_1688_search (AK签名搜索主链路)
        降级到旧1688搜索能力；禁止 LLM 伪造货源候选
        """
        logger.info(f"[Pipeline] 开始货源匹配")


        from logistics_calculator import calculate_sell_price
        pricing = calculate_sell_price(cost_cny=cost_cny, weight_kg=weight_kg)
        sell_price_cny = pricing["sell_price_cny"]


        try:
            from source_1688_search import search_1688
            result = search_1688(
                keywords=" ".join(keywords),
                sell_price=sell_price_cny,
                weight=int(weight_kg * 1000),
            )
            if isinstance(result, dict) and result.get("products"):
                return result
            logger.info("[Pipeline] source_1688_search无可用结果，降级到简单货源匹配")
        except Exception as e:
            logger.warning(f"[Pipeline] source_1688_search失败: {e}")
        return self._simple_source_match(keywords, cost_cny, weight_kg)

    def _simple_source_match(self, keywords: List[str], cost_cny: float, weight_kg: float = 0.3) -> Dict:
        """简单货源匹配（Tier 1降级实现，CNY计价含物流）"""

        from logistics_calculator import calculate_sell_price
        pricing = calculate_sell_price(
            cost_cny=cost_cny, weight_kg=weight_kg,
            provider=self.config.logistics_provider,
            speed=self.config.delivery_speed,
            delivery_type=self.config.delivery_type,
            packaging_fee_cny=self.config.packaging_fee_cny,
            exchange_rate_buffer=self.config.exchange_rate_buffer,
            target_profit_rate=self.config.target_profit_rate,
        )
        sell_price_cny = pricing["sell_price_cny"]
        logistics_cost = pricing["logistics_cost_cny"]
        logistics_channel = f"rFBS+{self.config.logistics_provider}({pricing['shipping_group']})"
        commission_rate = float(pricing.get("commission_rate", 0) or 0)
        target_profit_rate = float(self.config.target_profit_rate or 0)


        suggested_cost = sell_price_cny * (1 - commission_rate - target_profit_rate) - logistics_cost
        suggested_cost = max(0, suggested_cost)

        return {
            "status": "no_results",
            "success": True,
            "method": "manual_budget_only",
            "source": "manual_budget_only",
            "source_type": "manual_budget_only",
            "tier_used": "tier1_core",
            "lane": "research-only",
            "source_verified": False,
            "procurement_feasible": False,
            "sellable_eligible": False,
            "products": [],
            "items": [],
            "results": [],
            "sources": [],
            "count": 0,
            "profit_analysis": {
                "sell_price_cny": round(sell_price_cny, 2),
                "suggested_cost_cny": round(suggested_cost, 2),
                "logistics_cost_cny": round(logistics_cost, 2),
                "logistics_channel": logistics_channel,
                "weight_kg": weight_kg,
                "target_profit_rate": target_profit_rate,
                "ozon_commission_cny": round(sell_price_cny * commission_rate, 2),
            },
            "suggestions": [
                f"建议采购价: {round(suggested_cost * 0.8, 2)}-{round(suggested_cost * 1.2, 2)} CNY",
                f"物流费用: {round(logistics_cost, 2)} CNY ({logistics_channel}, {weight_kg}kg)",
                f"请在1688搜索: {' OR '.join(keywords)}"
            ]
        }

    def run_ozon_market_scan(self, query: str, sort: str = "popular",
                             price_min: int = None, price_max: int = None,
                             limit: int = 10) -> Dict:
        """
        Chain2 Step 0: Ozon市场扫描 (Playwright)

        扫描Ozon前台热销产品，为蓝海对标提供数据。
        返回产品列表(含图片URL)，供后续1688以图搜款使用。
        """
        logger.info(f"[Pipeline] Ozon市场扫描: query={query}")
        result = {"status": "pending", "query": query, "products": []}

        try:
            from ozon_search import OzonSearchClient
            client = OzonSearchClient()
            products = client.search(query, sort=sort,
                                     price_min=price_min, price_max=price_max,
                                     limit=limit)
            client._close()

            if products:
                result["status"] = "success"
                result["products"] = products
                result["count"] = len(products)
                logger.info(f"[Pipeline] Ozon扫描找到 {len(products)} 个产品")
            else:
                result["status"] = "no_results"
                result["message"] = "Ozon搜索无结果或被antibot拦截"

                if self.llm:
                    llm_result = self.llm.chat(
                        f"列出Ozon俄罗斯市场上热销的'{query}'产品类型和价格区间。"
                        "输出JSON数组: [{name, price_rub, category}]，仅输出JSON。",
                        max_tokens=2000
                    )
                    if llm_result:
                        try:
                            import re
                            json_match = re.search(r'\[.*\]', llm_result, re.DOTALL)
                            if json_match:
                                result["llm_products"] = json.loads(json_match.group())
                                result["status"] = "market_research_only"
                        except Exception:
                            pass
        except ImportError:
            result["status"] = "error"
            result["error"] = "Playwright未安装，无法执行Ozon市场扫描"
            result["hint"] = "运行: pip install playwright && playwright install chromium"
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error(f"[Pipeline] Ozon市场扫描失败: {e}")

        return result

    def run_image_source_chain(self, image_url: str, sell_price: float = 0,
                                cost_cny: float = None, weight_kg: float = 0.3) -> Dict:
        """
        Chain2 核心步骤: 以图搜款 → 1688货源匹配

        从Ozon产品图片出发，在1688找到同款货源。
        """
        logger.info(f"[Pipeline] 以图搜款: image_url={image_url[:80]}...")
        result = {"status": "pending", "image_url": image_url, "sources": []}

        try:
            from source_1688_search import search_1688
            search_result = search_1688(
                image_url=image_url,
                sell_price=sell_price,
                cost=cost_cny,
                weight=int(weight_kg * 1000),
                config=self.config if hasattr(self.config, 'mxou_api_key') else None,
            )
            if search_result.get("products"):
                result["status"] = "success"
                result["sources"] = search_result["products"]
                result["source_type"] = search_result.get("source", "unknown")
                result["count"] = len(search_result["products"])
            else:
                result["status"] = "no_results"
                result["message"] = "1688以图搜款未找到同款货源"
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error(f"[Pipeline] 以图搜款失败: {e}")

        return result

    def run_1688_product_fetch(self, offer_id_or_url: str) -> Dict:
        """通过1688 H5 API获取商品详情(标题/价格/图片/店铺)

        Args:
            offer_id_or_url: 1688商品ID或完整URL(如 https://detail.1688.com/offer/977653357635.html)

        Returns:
            {"status": "success", "title": ..., "price": ..., "images": [...], "shop_name": ..., ...}
        """
        result = {"status": "pending", "offer_id_or_url": offer_id_or_url}
        try:
            from source_1688_search import check_1688_session_health, get_1688_product_detail

            import re
            oid_match = re.search(r'(\d{8,})', str(offer_id_or_url))
            if not oid_match:
                result["status"] = "error"
                result["error"] = f"无法从输入中提取offer_id: {offer_id_or_url}"
                return result
            oid = oid_match.group(1)
            logger.info(f"[1688Fetch] 获取商品详情 offer_id={oid}")
            detail = get_1688_product_detail(oid)
            if detail and detail.get("status") == "success":
                result.update(detail)
                result["status"] = "success"
                result["source_image_url"] = detail.get("main_image_url", "")
                result["product_title"] = detail.get("title", "")
                result["product_price"] = detail.get("price", 0)
                logger.info(f"[1688Fetch] 成功: {detail.get('title','?')[:30]} | {len(detail.get('image_urls',[]))}张图 | 价格:{detail.get('price','?')}")
            elif detail:
                result.update(detail)
                result["status"] = detail.get("status") or "error"
                if "error" not in result and result.get("errors"):
                    result["error"] = "；".join(str(x) for x in result.get("errors", []) if x)
                logger.warning(f"[1688Fetch] 详情未通过: {result.get('error', result.get('errors', []))}")
            else:
                result["status"] = "error"
                result["error"] = f"1688 H5 API返回空(offer_id={oid})"
            if result.get("status") != "success":
                try:
                    result["session_health"] = check_1688_session_health(oid)
                except Exception as health_err:
                    result["session_health"] = {"status": "error", "error": str(health_err)}
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error(f"[1688Fetch] 失败: {e}")
        return result

    def run_full_pipeline(self, keywords: List[str], cost_cny: float = 15.0, weight_kg: float = 0.3,
                          mode: str = "text", ozon_query: str = None,
                          ozon_product_image: str = None,
                          sizes: List[str] = None,
                          min_profit: float = 0.0, min_profit_rub: float = 0.0,
                          source_url: str = "", submit_listing: bool = True,
                          smoke_bypass_profit_gate: bool = False) -> Dict:
        """
        运行完整Pipeline

        Args:
            keywords: 产品关键词
            cost_cny: 采购成本(CNY)
            weight_kg: 产品重量（kg），用于计算物流费用
            mode: 双链路模式 "text"(Chain1: 文本搜索) 或 "image"(Chain2: 以图搜款)
            ozon_query: Chain2用 - Ozon市场扫描关键词
            ozon_product_image: Chain2用 - Ozon产品图片URL，用于1688以图搜款
        """
        logger.info("=" * 60)
        logger.info(f"蓝海选品Pipeline开始 (模式: {mode})")
        logger.info(f"   Tier级别: {self.tier}")
        logger.info(f"   关键词: {keywords}")
        logger.info(f"   采购成本: {cost_cny} CNY")
        logger.info(f"   产品重量: {weight_kg} kg")
        logger.info("=" * 60)


        product_id = f"PROD{int(time.time())}"
        store_id = self.config.ozon_client_id or "default"
        category_slug = keywords[0] if keywords else "product"
        folder_name, output_dir = _build_runtime_output_dir(store_id, product_id, category_slug)
        os.makedirs(output_dir, exist_ok=True)

        result = {
            "pipeline_version": "6.0",
            "mode": mode,
            "tier": self.tier,
            "keywords": keywords,
            "cost_cny": cost_cny,
            "weight_kg": weight_kg,
            "product_id": product_id,
            "store_id": store_id,
            "folder_name": folder_name,
            "output_dir": output_dir,
            "runtime_root_dir": _get_runtime_root_dir(),
            "stages": {}
        }


        if mode == "image":

            if ozon_query:
                logger.info("\n[Stage 0/5] Ozon市场扫描(Chain2)...")
                ozon_scan = self.run_ozon_market_scan(ozon_query, limit=10)
                result["stages"]["ozon_scan"] = ozon_scan

                if not ozon_product_image and ozon_scan.get("products"):
                    first_product = ozon_scan["products"][0]
                    ozon_product_image = first_product.get("image")
                    if first_product.get("name"):
                        keywords = [first_product["name"]]
                    result["ozon_reference"] = first_product


            if ozon_product_image:
                logger.info("\n[Stage 1/5] 1688以图搜款(Chain2)...")
                source_result = self.run_image_source_chain(
                    ozon_product_image, sell_price=0, cost_cny=cost_cny, weight_kg=weight_kg
                )
                result["stages"]["source_match"] = source_result


                if source_result.get("sources"):
                    top_source = source_result["sources"][0]
                    cost_cny = top_source.get("price", cost_cny)
                    if not keywords or keywords == ["product"]:
                        keywords = [top_source.get("title", "product")]
            else:
                logger.warning("[Pipeline] Chain2模式但未提供ozon_product_image，回退到文本模式")
                mode = "text"





        from concurrent.futures import ThreadPoolExecutor, as_completed

        selection_result = {"analysis": {}}
        source_result = {}
        category_info = {}
        product_1688 = {}

        def _merge_product_1688_fields(payload: Dict, source: Dict) -> None:
            if not isinstance(payload, dict) or not isinstance(source, dict):
                return
            for key in [
                "source_image_url", "title", "price", "image_urls", "shop_name",
                "material", "brand", "model", "visible_fields", "product_url",
                "main_image_url", "offer_id", "price_range", "location", "min_batch",
            ]:
                value = source.get(key)
                if value not in (None, "", [], {}):
                    payload[key] = value

        if mode == "text":
            source_url_prechecked = False
            if source_url:
                logger.info("\n[Phase A] direct1688模式：先校验真实1688货源详情...")
                last_fetch_result = {}
                for attempt in range(2):
                    fetch_result = self.run_1688_product_fetch(source_url)
                    last_fetch_result = fetch_result or {}
                    if fetch_result.get("status") == "success":
                        source_result = {
                            "ok": True,
                            "status": "success",
                            "source": fetch_result.get("source", "1688_detail"),
                            "source_type": fetch_result.get("source_type", "1688_detail"),
                            "product_title": fetch_result.get("title", ""),
                            "product_price": fetch_result.get("price", 0),
                            "source_image_url": fetch_result.get("main_image_url", ""),
                            "image_urls": fetch_result.get("image_urls", []),
                            "shop_name": fetch_result.get("shop_name", ""),
                            "sales": fetch_result.get("sales", 0),
                            "offer_id": fetch_result.get("offer_id", ""),
                            "product_url": fetch_result.get("product_url", ""),
                            "source_verified": fetch_result.get("source_verified", True),
                            "procurement_feasible": fetch_result.get("procurement_feasible", True),
                            "sellable_eligible": fetch_result.get("sellable_eligible", True),
                            "access_state": fetch_result.get("access_state", ""),
                            "detail_channel": fetch_result.get("detail_channel", ""),
                            "fetch_meta": fetch_result.get("fetch_meta", {}),
                            "items": list(fetch_result.get("items", [])) if isinstance(fetch_result.get("items"), list) else [],
                        }
                        result["stages"]["source_match"] = source_result
                        _merge_product_1688_fields(product_1688, fetch_result)
                        product_1688["source_image_url"] = source_result.get("source_image_url", "") or product_1688.get("source_image_url", "")
                        product_1688["title"] = source_result.get("product_title", "") or product_1688.get("title", "")
                        product_1688["price"] = source_result.get("product_price", 0) or product_1688.get("price", 0)
                        product_1688["image_urls"] = source_result.get("image_urls", []) or product_1688.get("image_urls", [])
                        product_1688["shop_name"] = source_result.get("shop_name", "") or product_1688.get("shop_name", "")
                        product_1688["detail_verified"] = True
                        product_1688["source_level"] = "detail"
                        product_1688["detail_channel"] = fetch_result.get("detail_channel", "")
                        source_url_prechecked = True
                        break
                    if attempt == 0:
                        logger.warning(f"[Phase A] H5 API失败(重试): {fetch_result.get('error')}")
                        time.sleep(1)
                    else:
                        logger.warning(f"[Phase A] H5 API失败(最终): {fetch_result.get('error')}, 阻断direct1688真实链路")
                if not source_url_prechecked:
                    source_result = {
                        "status": "blocked",
                        "source": "1688_h5_detail",
                        "source_type": "1688_detail",
                        "lane": "sellable",
                        "source_verified": False,
                        "procurement_feasible": False,
                        "sellable_eligible": False,
                        "errors": list(last_fetch_result.get("errors", [])) if isinstance(last_fetch_result, dict) else [],
                        "error": (last_fetch_result.get("error") if isinstance(last_fetch_result, dict) else "") or "1688 H5 detail failed",
                        "blocked_reason": "1688真实货源详情未通过，禁止降级为搜索/LLM候选继续制图",
                        "access_state": (last_fetch_result.get("access_state") if isinstance(last_fetch_result, dict) else "") or "",
                        "blocked_reason_code": (last_fetch_result.get("blocked_reason_code") if isinstance(last_fetch_result, dict) else "") or "",
                        "fetch_meta": dict(last_fetch_result.get("fetch_meta", {})) if isinstance(last_fetch_result, dict) else {},
                        "session_health": dict(last_fetch_result.get("session_health", {})) if isinstance(last_fetch_result, dict) and isinstance(last_fetch_result.get("session_health"), dict) else {},
                    }
                    result["stages"]["source_match"] = source_result
                    offer_id = _generate_offer_id()
                    logger.info(f"[Phase B] offer_id: {offer_id}")
                    result["offer_id"] = offer_id
                    result["product_1688"] = product_1688
                    result["source_url"] = source_url or ""
                    source_gate = self._detect_source_truth(source_result, source_url=source_url, product_1688=product_1688)
                    lane = source_gate["lane"]
                    result.update({
                        "lane": lane,
                        "sellable_eligible": source_gate["sellable_eligible"],
                        "source_verified": source_gate["source_verified"],
                        "source_type": source_gate["source_type"],
                        "procurement_feasible": source_gate["procurement_feasible"],
                    })
                    result["stages"]["source_gate"] = source_gate
                    result["status"] = "blocked"
                    result["blocked_reason"] = source_result.get("blocked_reason") or source_result.get("error") or "1688真实货源详情未通过"
                    result["listing_ready"] = False
                    return result


            logger.info("\n[Phase A] 并行执行: 选品分析 + 1688货源 + 类目解析...")

            def _task_selection():
                return "selection", self.run_selection(keywords)

            def _task_1688():
                return "1688", self.run_source_match(keywords, cost_cny)

            def _task_category():
                cat_info = {}
                try:
                    from attribute_mapper import resolve_category
                    category_query = product_1688.get("title", "") or (keywords[0] if keywords else "product")
                    categories = resolve_category(
                        category_query,
                        ozon_client_id=self.config.ozon_client_id,
                        ozon_api_key=self.config.ozon_api_key,
                    )
                    if categories:
                        cat_info = categories[0]
                        logger.info(f"[Phase A] 类目: {cat_info.get('name', '')} (desc_cat_id={cat_info.get('description_category_id')})")
                except Exception as e:
                    logger.warning(f"[Phase A] 类目解析失败: {e}")
                return "category", cat_info

            max_workers = 2 if source_url_prechecked else 3
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(_task_selection): "selection",
                    executor.submit(_task_category): "category",
                }
                if not source_url_prechecked:
                    futures[executor.submit(_task_1688)] = "1688"
                for future in as_completed(futures, timeout=120):
                    try:
                        key, value = future.result(timeout=90)
                    except Exception as e:
                        logger.warning(f"[Phase A] Task异常: {e}")
                        continue
                    if key == "selection":
                        selection_result = value
                        result["stages"]["selection"] = value
                    elif key == "1688":
                        source_result = value
                        result["stages"]["source_match"] = value
                        if value.get("source") == "h5_api":
                            _merge_product_1688_fields(product_1688, value)
                            product_1688["source_image_url"] = value.get("source_image_url", "")
                            product_1688["title"] = value.get("product_title", "")
                            product_1688["price"] = value.get("product_price", 0)
                            product_1688["image_urls"] = value.get("image_urls", [])
                            product_1688["shop_name"] = value.get("shop_name", "")
                            product_1688["detail_verified"] = True
                            product_1688["source_level"] = "detail"
                            logger.info(f"[Phase A] 1688 H5货源图: {value.get('source_image_url','')[:80]}")
                        elif value.get("sources"):
                            top_source = value["sources"][0]
                            if top_source.get("image_url") and not product_1688.get("source_image_url"):
                                product_1688["source_image_url"] = top_source["image_url"]
                                product_1688["title"] = top_source.get("title", "")
                                product_1688["price"] = top_source.get("price", 0)
                                product_1688["detail_verified"] = False
                                product_1688["source_level"] = "search"
                                logger.info(f"[Phase A] 1688搜索货源图: {top_source['image_url'][:80]}")
                    elif key == "category":
                        category_info = value

            logger.info("[Phase A] 完成")
        elif mode == "image":
            logger.info("\n[Phase A] image模式补全真实货源详情 + 选品分析 + 类目解析...")


            top_source = {}
            image_items = self._extract_source_items(source_result)
            if image_items:
                top_source = image_items[0]
            top_offer_id = str(top_source.get("offer_id", "")).strip()
            if top_offer_id:
                fetch_result = self.run_1688_product_fetch(top_offer_id)
                result["stages"]["source_detail"] = fetch_result
                if fetch_result.get("status") == "success" and fetch_result.get("source_verified") is True:
                    source_result = fetch_result
                    result["stages"]["source_match"] = fetch_result
                    _merge_product_1688_fields(product_1688, fetch_result)
                    product_1688["source_image_url"] = fetch_result.get("source_image_url", "") or fetch_result.get("main_image_url", "")
                    product_1688["title"] = fetch_result.get("product_title", "") or fetch_result.get("title", "")
                    product_1688["price"] = fetch_result.get("product_price", 0) or fetch_result.get("price", 0)
                    product_1688["image_urls"] = fetch_result.get("image_urls", [])
                    product_1688["shop_name"] = fetch_result.get("shop_name", "")
                    product_1688["detail_verified"] = True
                    product_1688["source_level"] = "detail"
                    logger.info(f"[Phase A] image模式已升级到1688真实详情 offer_id={top_offer_id}")
                else:
                    logger.warning(f"[Phase A] image模式未能升级到1688真实详情: {fetch_result.get('error', fetch_result.get('errors', []))}")
            else:
                logger.warning("[Phase A] image模式未从图搜结果中拿到offer_id，保持research/partial语义")

            if not keywords:
                candidate_name = (
                    product_1688.get("title")
                    or top_source.get("title")
                    or ((result.get("ozon_reference") or {}).get("name", ""))
                    or ozon_query
                    or "product"
                )
                keywords = [candidate_name]
                result["keywords"] = keywords

            try:
                selection_result = self.run_selection(keywords)
                result["stages"]["selection"] = selection_result
            except Exception as e:
                logger.warning(f"[Phase A] image模式选品分析失败: {e}")
                selection_result = {"analysis": {}}

            try:
                from attribute_mapper import resolve_category
                categories = resolve_category(
                    product_1688.get("title", "") or keywords[0],
                    ozon_client_id=self.config.ozon_client_id,
                    ozon_api_key=self.config.ozon_api_key,
                )
                if categories:
                    category_info = categories[0]
                    logger.info(f"[Phase A] image模式类目: {category_info.get('name', '')} (desc_cat_id={category_info.get('description_category_id')})")
            except Exception as e:
                logger.warning(f"[Phase A] image模式类目解析失败: {e}")

            logger.info("[Phase A] image模式完成")




        offer_id = _generate_offer_id()
        logger.info(f"[Phase B] offer_id: {offer_id}")
        result["offer_id"] = offer_id


        source_image_url = product_1688.get("source_image_url", "") or\
                          (selection_result.get("analysis", {}) or {}).get("source_image_url", "") or\
                          (selection_result.get("analysis", {}) or {}).get("source_image", "")

        product_name = product_1688.get("title", "") or (keywords[0] if keywords else "product")
        logger.info(f"[Phase B] 产品名: {product_name[:30]}, 货源图: {'有' if source_image_url else '无'}")

        result["product_1688"] = product_1688
        result["source_url"] = source_url or ""

        source_gate = self._detect_source_truth(source_result, source_url=source_url, product_1688=product_1688)
        lane = source_gate["lane"]
        result.update({
            "lane": lane,
            "sellable_eligible": source_gate["sellable_eligible"],
            "source_verified": source_gate["source_verified"],
            "source_type": source_gate["source_type"],
            "procurement_feasible": source_gate["procurement_feasible"],
        })
        result["stages"]["source_gate"] = source_gate

        if source_url and source_result.get("status") == "blocked":
            logger.error("[Phase B] direct1688真实货源详情未通过，阻断整条链路")
            result["status"] = "blocked"
            result["blocked_reason"] = source_result.get("blocked_reason") or source_result.get("error") or "1688真实货源详情未通过"
            result["listing_ready"] = False
            return result


        if lane == "sellable" and (source_gate["source_verified"] is not True or not source_gate["procurement_feasible"]):
            logger.error("[Phase B] sellable lane 货源验真失败，阻断后续正式链路")
            result["status"] = "blocked"
            result["blocked_reason"] = "；".join(source_gate["blocked_reasons"]) or "货源真实性不足"
            result["listing_ready"] = False
            return result




        logger.info("\n[Phase B.5] 利润/履约闸门...")


        cost_cny = product_1688.get("price") or cost_cny
        source_profit_analysis = source_result.get("profit_analysis", {}) if source_result else {}
        if source_profit_analysis.get("suggested_cost_cny"):
            cost_cny = float(source_profit_analysis["suggested_cost_cny"])


        try:
            from logistics_calculator import calculate_sell_price
            pricing = calculate_sell_price(
                cost_cny=cost_cny if cost_cny > 0 else 0,
                weight_kg=weight_kg,
                provider=self.config.logistics_provider,
                speed=self.config.delivery_speed,
                delivery_type=self.config.delivery_type,
                packaging_fee_cny=self.config.packaging_fee_cny,
                exchange_rate_buffer=self.config.exchange_rate_buffer,
                target_profit_rate=self.config.target_profit_rate,
            )
            sell_price_cny = pricing["sell_price_cny"]
            logger.info(f"[Phase B.5] 成本核算: 采购={pricing['cost_cny']}CNY, 物流={pricing['logistics_cost_cny']}CNY, 利润率={pricing['profit_rate']}%")
        except Exception as e:
            logger.warning(f"[Phase B.5] 成本核算失败: {e}")
            sell_price_cny = cost_cny * 3 if cost_cny > 0 else 150
            pricing = {"sell_price_cny": sell_price_cny, "cost_cny": cost_cny}


        source_table = self._build_source_table(source_result)
        result["source_table"] = source_table
        result["pricing"] = pricing

        effective_min_profit = min_profit if min_profit > 0 else self.config.target_profit_rate
        commercial_gate = self._evaluate_commercial_gate(
            pricing,
            source_table=source_table,
            weight_kg=weight_kg,
            lane=lane,
            required_profit_rate=effective_min_profit,
            required_profit_rub=min_profit_rub,
        )
        result["stages"]["commercial_gate"] = commercial_gate
        result.update({
            "profit_pass": commercial_gate["profit_pass"],
            "fulfillment_pass": commercial_gate["fulfillment_pass"],
            "procurement_feasible": result.get("procurement_feasible") and commercial_gate["procurement_feasible"],
        })

        if lane == "sellable" and not commercial_gate["commercial_pass"]:
            only_profit_blocked = (
                commercial_gate.get("profit_pass") is False and
                commercial_gate.get("procurement_feasible") is True and
                commercial_gate.get("fulfillment_pass") is True
            )
            if smoke_bypass_profit_gate and only_profit_blocked:
                logger.warning("[Phase B.5] smoke_bypass_profit_gate=true，跳过利润门槛阻断，继续执行真实 smoke")
                commercial_gate["profit_gate_bypassed"] = True
                commercial_gate["commercial_pass"] = True
                commercial_gate["blocked_reasons"] = [
                    reason for reason in (commercial_gate.get("blocked_reasons") or [])
                    if "利润" not in str(reason)
                ]
                commercial_gate["blocked_reason_kind"] = ""
                result["smoke_bypass_profit_gate"] = True
                result["profit_gate_bypassed"] = True
                result["profit_summary"] = commercial_gate.get("pricing_summary", {})
                result["required_profit_rate"] = commercial_gate.get("target_profit_rate")
                result["config_target_profit_rate"] = commercial_gate.get("config_target_profit_rate")
                result["required_profit_rub"] = commercial_gate.get("required_profit_rub")
                result["suggested_sell_price_cny"] = commercial_gate.get("suggested_sell_price_cny")
                result["max_procurement_cost_cny"] = commercial_gate.get("max_procurement_cost_cny")
            else:
                logger.error("[Phase B.5] sellable lane 未通过利润/履约闸门，阻断图片生成与 run_listing()")
                result["status"] = "blocked"
                result["blocked_reason"] = "；".join(commercial_gate["blocked_reasons"]) or "利润/履约未通过"
                result["blocked_reason_kind"] = commercial_gate.get("blocked_reason_kind", "")
                result["profit_summary"] = commercial_gate.get("pricing_summary", {})
                result["required_profit_rate"] = commercial_gate.get("target_profit_rate")
                result["config_target_profit_rate"] = commercial_gate.get("config_target_profit_rate")
                result["required_profit_rub"] = commercial_gate.get("required_profit_rub")
                result["suggested_sell_price_cny"] = commercial_gate.get("suggested_sell_price_cny")
                result["max_procurement_cost_cny"] = commercial_gate.get("max_procurement_cost_cny")
                result["listing_ready"] = False
                return result




        logger.info("\n[Phase C] 图片生成...")
        images_dir = os.path.join(output_dir, "images")
        os.makedirs(images_dir, exist_ok=True)

        image_result = self.run_image_generation(
            product_name=product_name,
            images_dir=images_dir,
            product_info={**product_1688, "source_image_url": source_image_url, **selection_result.get("analysis", {})},
            category_type=category_info.get("name", ""),
            offer_id=offer_id,
            product_1688=product_1688,
        )
        result["stages"]["image_gen"] = image_result


        if image_result.get("status") != "success":
            logger.error("[Pipeline] 图片生成失败，阻止上架")
            result["status"] = "image_gen_failed"
            result["error"] = f"图片生成失败: {image_result.get('error', 'unknown')}"
            return result

        visual_gate = self._detect_visual_truth(image_result, source_image_url=source_image_url, lane=lane)
        result["stages"]["visual_gate"] = visual_gate
        result.update({
            "visual_lock_ready": visual_gate["visual_lock_ready"],
            "visual_lock_source": visual_gate["visual_lock_source"],
            "vision_confidence": visual_gate["vision_confidence"],
            "main_ready": visual_gate["main_ready"],
            "anchor_ready": visual_gate["anchor_ready"],
        })

        if lane == "sellable" and not visual_gate["visual_lock_ready"]:
            logger.error("[Phase C] sellable lane 缺少视觉真相锚点，阻断正式上架")
            result["status"] = "blocked"
            result["blocked_reason"] = "；".join(visual_gate["blocked_reasons"]) or "视觉锁未就绪"
            result["listing_ready"] = False
            return result


        cos_image_urls = [
            img.get("url", "") for img in image_result.get("generated_images", [])
            if img.get("url")
        ]




        logger.info("\n[Phase D] Ozon上架...")

        listing_gate = self._compute_listing_gate(lane, source_gate, visual_gate, commercial_gate, category_info, listing_result=None)
        result["stages"]["listing_gate"] = listing_gate
        result["listing_ready"] = listing_gate["listing_ready"]

        if lane == "sellable" and not listing_gate["listing_ready"]:
            logger.error("[Phase D.a] listing_ready=false，阻断 run_listing()")
            result["status"] = "blocked"
            result["blocked_reason"] = "；".join(listing_gate["blocked_reasons"]) or "正式上架资格未满足"
            return result

        if lane != "sellable":
            logger.info("[Phase D.b] research lane 跳过正式 listing submit")
            result["status"] = "research-only"
            result["listing_ready"] = False
            result["blocked_reason"] = "research lane 禁止正式listing提交"
            result["stages"]["listing"] = {
                "status": "skipped",
                "reason": "research lane 禁止正式listing提交",
                "listing_ready": False,
            }
            return result

        if not submit_listing:
            logger.info("[Phase D.b] submit_listing=false，已通过可售闸门但跳过正式提交")
            result["status"] = "ready_for_submit"
            result["stages"]["listing"] = {
                "status": "skipped",
                "reason": "submit_listing=false",
                "listing_ready": True,
            }
            return result

        listing_result = self.run_listing(
            product_name=product_name,
            price_cny=sell_price_cny,
            weight_kg=weight_kg,
            images_dir=images_dir,
            output_dir=output_dir,
            product_info={**product_1688, "source_image_url": source_image_url, **selection_result.get("analysis", {})},
            image_urls=cos_image_urls,
            offer_id=offer_id,
            sizes=sizes or [],
            category_info=category_info,
        )
        result["stages"]["listing"] = listing_result



        filtered_count = 0
        for item in source_table:
            profit_margin = item.get("profit_margin", "")
            profit_rub = item.get("profit_rub", "")


            item_profit_rate = 0.0
            if isinstance(profit_margin, str) and "%" in profit_margin:
                try:
                    item_profit_rate = float(profit_margin.replace("%", "")) / 100
                except ValueError:
                    pass
            elif isinstance(profit_margin, (int, float)):
                item_profit_rate = float(profit_margin)


            item_profit_rub = 0.0
            if isinstance(profit_rub, (int, float)):
                item_profit_rub = float(profit_rub)
            elif isinstance(profit_rub, str):
                try:
                    item_profit_rub = float(profit_rub.replace("₽", "").replace("RUB", "").strip())
                except ValueError:
                    pass


            below_rate = item_profit_rate < effective_min_profit
            below_rub = min_profit_rub > 0 and item_profit_rub < min_profit_rub

            if below_rate or below_rub:
                item["filtered"] = True
                reasons = []
                if below_rate:
                    reasons.append(f"利润率{item_profit_rate:.0%}低于目标{effective_min_profit:.0%}")
                if below_rub:
                    reasons.append(f"利润{item_profit_rub:.0f}₽低于{min_profit_rub:.0f}₽")
                item["filter_reason"] = "；".join(reasons)
                filtered_count += 1

        result["profit_filter"] = {
            "target_profit_rate": effective_min_profit,
            "min_profit_rub": min_profit_rub,
            "total_sources": len(source_table),
            "filtered_count": filtered_count,
            "passed_count": len(source_table) - filtered_count,
        }
        logger.info(f"[Pipeline] 利润过滤(目标{effective_min_profit:.0%}): {filtered_count}/{len(source_table)}个货源未达标")

        listing_gate = self._compute_listing_gate(lane, source_gate, visual_gate, commercial_gate, category_info, listing_result=listing_result)
        result["stages"]["listing_gate"] = listing_gate
        result["listing_ready"] = listing_gate["listing_ready"]


        result["status"] = listing_result.get("status", "unknown")
        result["product_id"] = listing_result.get("product_id", "")
        result["offer_id"] = listing_result.get("offer_id", "")
        result["listing_submit_ok"] = listing_result.get("listing_submit_ok")
        result["listing_submit_statuses"] = listing_result.get("listing_submit_statuses", [])
        result["failed_items"] = listing_result.get("failed_items", [])
        result["precheck"] = listing_result.get("precheck", {})
        result["task_id"] = None
        listing_tasks = ((listing_result.get("listing_result") or {}).get("tasks", [])
                         if isinstance(listing_result, dict) else [])
        if listing_tasks and isinstance(listing_tasks[0], dict):
            result["task_id"] = listing_tasks[0].get("task_id")


        procurement_links = []
        for s in source_table:
            link = s.get("link", "")
            shop = s.get("shop", "")
            price = s.get("price_cny", "")
            margin = s.get("profit_margin", "")
            if link:
                procurement_links.append({
                    "offer_id": result.get("offer_id", ""),
                    "shop": shop,
                    "price_cny": price,
                    "profit_margin": margin,
                    "1688_link": link,
                })
        result["procurement_links"] = procurement_links
        result["procurement_advice"] = (
            "采购建议: 以上1688货源仅供参考，建议您多渠道比价(拼多多/淘宝/义乌购/工厂直询)后再下单。"
            "1688链接可能因商品下架失效，请以实际可访问为准。"
        )


        result["inventory_warning"] = (
            "重要提醒: 产品已提交Ozon但未设置库存，目前不会在前台展示！"
            "请尽快前往Ozon卖家后台设置库存，或告诉我'帮我设置库存'来协助操作。"
            "未经您明确允许，我不会自动设置库存。"
        )

        logger.info("\n" + "=" * 60)
        logger.info("Pipeline完成")
        logger.info(f"   状态: {result['status']}")
        logger.info(f"   货源数: {len(source_table)}")
        logger.info(f"   采购链接: {len(procurement_links)}个")
        logger.info(f"   Tier: {self.tier}")
        logger.info("=" * 60)

        return result

    def run_image_generation(self, product_name: str, images_dir: str,
                             product_info: Dict = None, category_type: str = "",
                             offer_id: str = "", product_1688: Dict = None) -> Dict:
        """
        Step 3: 图片生成（强制执行，不跳过）

        调用 generate_images.py 生成6张产品图片(白底+5场景)
        图片prompt包含Ozon类目类型信息，确保图片与声明的"Тип"一致

        Args:
            offer_id: 商品货号(如pc-20260502-001)，用作缓存key和文件名前缀
            product_1688: 1688商品详情(含title/price/image_urls)，用于文本分析增强
        """
        result = {
            "status": "ready",
            "images_dir": images_dir,
            "product_name": product_name,
            "generated_images": []
        }

        try:
            from generate_images import generate_product_images
            source_image_url = (product_info or {}).get("source_image_url", "") or (product_info or {}).get("source_image", "")

            gen_result = generate_product_images(
                sku_name=product_name,
                source_image_url=source_image_url,
                count=6,
                watermark_text="",
                config=self.config,
                category_type=category_type,
                offer_id=offer_id,
                product_1688=product_1688,
            )
            result["status"] = "success"
            result["generated_images"] = gen_result
            result["command"] = f"python scripts/generate_images.py --sku-name '{product_name}' --offer-id '{offer_id}' --count 6"
        except ImportError:
            result["status"] = "error"
            result["hint"] = "generate_images.py不可用"
            result["command"] = f"python scripts/generate_images.py --sku-name '{product_name}' --count 6"
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)

        return result

    def _estimate_weight_dimensions(self, product_name: str, weight_kg: float,
                                     product_info: Dict = None, category_info: Dict = None) -> Tuple:
        product_info = product_info or {}
        product_reference = {
            "鞋垫": {"weight_g": 50, "dims": [120, 300, 10]},
            "耳机": {"weight_g": 60, "dims": [80, 80, 30]},
            "手机壳": {"weight_g": 30, "dims": [80, 160, 10]},
            "数据线": {"weight_g": 40, "dims": [50, 50, 20]},
            "手表": {"weight_g": 80, "dims": [80, 80, 50]},
            "袜子": {"weight_g": 50, "dims": [100, 150, 20]},
            "手套": {"weight_g": 60, "dims": [120, 200, 20]},
            "围巾": {"weight_g": 100, "dims": [150, 200, 30]},
            "水杯": {"weight_g": 200, "dims": [80, 80, 150]},
            "厨具": {"weight_g": 150, "dims": [100, 200, 50]},
        }

        def _parse_dims(value: Any) -> Optional[List[int]]:
            if isinstance(value, (list, tuple)) and len(value) >= 3:
                try:
                    return [max(int(float(v)), 1) for v in value[:3]]
                except (TypeError, ValueError):
                    return None
            if isinstance(value, str):
                match = re.search(r'(\d+(?:\.\d+)?)\s*[xX*хХ]\s*(\d+(?:\.\d+)?)\s*[xX*хХ]\s*(\d+(?:\.\d+)?)', value)
                if match:
                    return [max(int(float(group)), 1) for group in match.groups()]
            return None

        ref_weight = None
        ref_dims = None
        for key, ref in product_reference.items():
            if key in product_name:
                ref_weight = ref["weight_g"]
                ref_dims = ref["dims"]
                break

        parsed_dims = _parse_dims(product_info.get("dimensions"))
        try:
            declared_weight = float(product_info.get("weight", weight_kg) or 0)
        except (TypeError, ValueError):
            declared_weight = 0.0

        weight_g = int(declared_weight * 1000) if declared_weight and declared_weight < 20 else int(declared_weight or 0)
        if weight_g <= 0:
            try:
                weight_kg_value = float(weight_kg or 0)
            except (TypeError, ValueError):
                weight_kg_value = 0.0
            weight_g = int(weight_kg_value * 1000) if weight_kg_value > 0 else (ref_weight or 100)

        dimensions = parsed_dims or ref_dims or [100, 100, 50]
        return weight_g, dimensions

    def _sanitize_listing_text(self, text_value: Any) -> str:
        text_value = str(text_value or "").strip()
        if not text_value:
            return ""
        text_value = re.sub(r'[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff]', '', text_value)
        text_value = re.sub(r'\s+', ' ', text_value).strip()
        if not re.search(r'[A-Za-zА-Яа-яЁё0-9]', text_value):
            return ""
        return text_value

    def _build_listing_name(self, product_name: str, product_info: Dict = None, category_info: Dict = None) -> str:
        product_info = product_info or {}
        category_info = category_info or {}
        candidates = [
            product_info.get("sku_name_ru"),
            product_info.get("name_ru"),
            product_info.get("product_type_ru"),
            product_info.get("title_ru"),
            category_info.get("type_name_ru"),
            self._sanitize_listing_text(product_name),
            self._sanitize_listing_text(category_info.get("type_name", "")),
            self._sanitize_listing_text(category_info.get("name", "")),
        ]
        for candidate in candidates:
            cleaned = self._sanitize_listing_text(candidate)
            if cleaned and _looks_like_latin_only_token(cleaned):
                continue
            if cleaned:
                return cleaned[:200]
        return "Product"

    def _build_listing_description(self, listing_name: str, dimensions: List[int], product_info: Dict = None,
                                   category_info: Dict = None) -> str:
        product_info = product_info or {}
        category_info = category_info or {}
        material = self._sanitize_listing_text(product_info.get("material", "")) or "не указан"
        category_label = self._sanitize_listing_text(
            product_info.get("product_type_ru") or category_info.get("type_name") or category_info.get("name")
        )
        description_hint = self._sanitize_listing_text(product_info.get("description", ""))
        package_text = self._sanitize_listing_text(product_info.get("package") or product_info.get("kit") or "")
        if not package_text:
            package_text = f"1 × {listing_name}"

        lines = [f"Название продукта: {listing_name}", f"Материал: {material}"]
        if category_label:
            lines.append(f"Категория: {category_label}")
        if dimensions and len(dimensions) >= 3:
            lines.append(f"Размер: {dimensions[0]}×{dimensions[1]}×{dimensions[2]} мм")
        if description_hint:
            lines.append(f"Описание: {description_hint[:400]}")
        lines.append(f"Комплектация: {package_text}")
        return '\n'.join(lines)[:2000]

    def _as_bool(self, value: Any) -> bool:
        """宽松布尔化，兼容字符串/数字/None。"""
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "ok", "ready", "success", "verified"}
        return bool(value)

    def _normalize_lane(self, lane: str, sellable_eligible: bool = False) -> str:
        lane_value = (lane or "").strip().lower()
        if lane_value in {"sellable", "sellable_lane", "formal", "production"}:
            return "sellable"
        if lane_value in {"research", "research-only", "research_only", "draft", "explore"}:
            return "research"
        return "sellable" if sellable_eligible else "research"

    def _safe_float(self, value: Any, default: float = 0.0) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = value.replace("%", "").replace("₽", "").replace("RUB", "").replace("CNY", "").strip()
            try:
                return float(cleaned)
            except ValueError:
                return default
        return default

    def _extract_source_items(self, source_result: Dict) -> List[Dict]:
        """统一消费 products/results/items/sources 结构。"""
        if not isinstance(source_result, dict):
            return []

        candidates = []
        for key in ("items", "products", "results", "sources"):
            value = source_result.get(key)
            if isinstance(value, list):
                candidates = value
                break
            if isinstance(value, dict):
                for nested_key in ("items", "products", "results", "sources"):
                    nested = value.get(nested_key)
                    if isinstance(nested, list):
                        candidates = nested
                        break
                if candidates:
                    break

        normalized = []
        for item in candidates:
            if not isinstance(item, dict):
                continue
            normalized.append({
                **item,
                "offer_id": item.get("offer_id") or item.get("id") or item.get("num_iid") or item.get("product_id") or "",
                "product_url": item.get("product_url") or item.get("detail_url") or item.get("url") or item.get("offer_url") or "",
                "image_url": item.get("image_url") or item.get("main_image_url") or item.get("image") or item.get("img_url") or "",
                "price": item.get("price", item.get("sale_price", item.get("priceRange", item.get("price_cny", "")))),
                "profit": item.get("profit", item.get("profit_rub", item.get("profit_margin", ""))),
            })
        return normalized

    def _detect_source_truth(self, source_result: Dict, source_url: str = "", product_1688: Dict = None) -> Dict:
        items = self._extract_source_items(source_result)
        raw_source = (source_result or {}).get("source") or ""
        raw_source_type = (source_result or {}).get("source_type") or ""
        source_status = (source_result or {}).get("status") or ""
        source_status_blocked = source_status in {"blocked", "error", "image_gen_failed"}
        product_1688 = product_1688 or {}
        top_source_type = next(
            (
                item.get("source_type")
                for item in items
                if isinstance(item, dict) and item.get("source_type")
            ),
            "",
        )
        all_research_only = bool(items) and all(
            (item.get("lane") in {"research", "research-only", "research_only"}) or
            (item.get("sellable_eligible") is False and item.get("source_verified") is False)
            for item in items
            if isinstance(item, dict)
        )
        is_llm_fallback = raw_source == "llm_fallback" or raw_source_type == "llm_fallback" or top_source_type == "llm_fallback"
        product_detail_verified = self._as_bool(product_1688.get("detail_verified"))
        has_verified_detail = (not source_status_blocked) and any([
            product_detail_verified,
            raw_source in {"h5_api", "1688_h5_detail", "1688_pc_detail", "1688_detail"},
            raw_source_type == "1688_detail",
            top_source_type == "1688_detail",
            any(item.get("source_verified") is True for item in items),
        ])
        has_minimum_real_source_evidence = (not source_status_blocked) and any(
            has_real_procurement_mapping(item) for item in items
        )
        source_type = raw_source or raw_source_type or top_source_type or ("1688_detail" if has_verified_detail else "")
        source_type = source_type or ("search_result" if items else "unknown")

        if source_status_blocked or is_llm_fallback or all_research_only:
            source_verified = False
        else:
            source_verified = True if (has_verified_detail or has_minimum_real_source_evidence) else ("partial" if items else False)
        procurement_feasible = bool(
            (not source_status_blocked) and (not is_llm_fallback) and (
                has_verified_detail or has_minimum_real_source_evidence or any(
                item.get("procurement_feasible") or item.get("product_url") or item.get("offer_id")
                for item in items
            )
            )
        )
        sellable_eligible = source_verified is True and procurement_feasible
        lane = self._normalize_lane((source_result or {}).get("lane", ""), sellable_eligible=sellable_eligible)

        blocked_reasons = []
        if source_verified is not True:
            blocked_reasons.append(REAL_SOURCE_EVIDENCE_BLOCK_REASON)
        if not procurement_feasible:
            blocked_reasons.append("缺少可采购路径")

        return {
            "lane": lane,
            "source_type": source_type,
            "source_verified": source_verified,
            "procurement_feasible": procurement_feasible,
            "sellable_eligible": sellable_eligible,
            "blocked_reasons": blocked_reasons,
            "source_items": items,
        }

    def _detect_visual_truth(self, image_result: Dict, source_image_url: str, lane: str) -> Dict:
        generated_images = image_result.get("generated_images", []) if isinstance(image_result, dict) else []
        slot_names = ["main", "usp", "detail", "trust", "scene2", "white_bg"]
        slot_urls = {}
        slot_meta = {}
        summary = image_result.get("summary", {}) if isinstance(image_result, dict) else {}
        vision_verified = self._as_bool(summary.get("vision_verified"))

        for idx, img in enumerate(generated_images):
            if not isinstance(img, dict):
                continue
            url = img.get("url") or img.get("image_url") or ""
            if not url:
                continue
            slot = img.get("slot") or img.get("type") or img.get("name") or (slot_names[idx] if idx < len(slot_names) else f"img{idx}")
            slot_urls[slot] = url
            slot_meta[slot] = img
            if not vision_verified:
                vision_verified = self._as_bool(img.get("vision_verified"))

        required_slots = ["main", "usp", "detail", "trust", "scene2", "white_bg"]
        white_bg_allowed = {"source_image_anchor", "cached_white_bg_anchor"}
        main_allowed = {"white_bg_anchor"}
        scene_allowed = {"white_bg_anchor", "source_image_fallback"}
        reference_ready = {}
        blocked_reasons = []

        if not source_image_url:
            blocked_reasons.append("缺少真实货源视觉锚点")
        if not vision_verified:
            blocked_reasons.append("vision未通过验证")

        for slot in required_slots:
            slot_url = slot_urls.get(slot)
            slot_info = slot_meta.get(slot, {})
            ref_mode = slot_info.get("reference_mode", "")
            if not slot_url:
                blocked_reasons.append(f"缺少图片槽位: {slot}")
                reference_ready[slot] = False
                continue
            if slot == "white_bg":
                allowed_modes = white_bg_allowed
            elif slot == "main":
                allowed_modes = main_allowed
            else:
                allowed_modes = scene_allowed
            reference_ready[slot] = ref_mode in allowed_modes
            if not reference_ready[slot]:
                if slot == "white_bg":
                    blocked_reasons.append("white_bg未基于真实货源图生成")
                elif slot == "main":
                    blocked_reasons.append("主图未基于white_bg真实锚点生成")
                else:
                    blocked_reasons.append(f"{slot}未基于真实参考锚点生成")

        main_ready = bool(slot_urls.get("main"))
        white_bg_ready = bool(slot_urls.get("white_bg"))
        anchor_ready = bool(source_image_url and white_bg_ready and reference_ready.get("white_bg"))
        all_slots_ready = all(bool(slot_urls.get(slot)) for slot in required_slots)
        all_images_reference_ready = all(reference_ready.get(slot, False) for slot in required_slots)
        visual_lock_ready = bool(all_slots_ready and anchor_ready and all_images_reference_ready and vision_verified)

        if self._normalize_lane(lane) == "sellable" and not visual_lock_ready:
            blocked_reasons.append("sellable lane 禁止在缺少完整视觉锚定时继续正式链路")

        return {
            "lane": self._normalize_lane(lane, sellable_eligible=visual_lock_ready),
            "visual_lock_ready": visual_lock_ready,
            "visual_lock_source": "source_image+white_bg" if visual_lock_ready else ("source_image_only" if source_image_url else "none"),
            "vision_confidence": "high" if visual_lock_ready else ("medium" if source_image_url and main_ready else "low"),
            "vision_verified": vision_verified,
            "main_ready": main_ready,
            "anchor_ready": anchor_ready,
            "white_bg_ready": white_bg_ready,
            "all_slots_ready": all_slots_ready,
            "all_images_reference_ready": all_images_reference_ready,
            "slot_urls": slot_urls,
            "slot_meta": slot_meta,
            "reference_ready": reference_ready,
            "blocked_reasons": list(dict.fromkeys([reason for reason in blocked_reasons if reason])),
        }

    def _evaluate_commercial_gate(self, pricing: Dict, source_table: List[Dict], weight_kg: float, lane: str,
                                  required_profit_rate: float = 0.0, required_profit_rub: float = 0.0) -> Dict:
        profit_rate_pct = self._safe_float(pricing.get("profit_rate"), default=-999.0)
        requested_rate = required_profit_rate if required_profit_rate and required_profit_rate > 0 else self.config.target_profit_rate
        target_rate_pct = requested_rate * 100 if requested_rate <= 1 else requested_rate
        profit_rub = self._safe_float(pricing.get("profit_rub"), default=0.0)
        profit_rate_pass = profit_rate_pct >= target_rate_pct
        profit_rub_pass = True if required_profit_rub <= 0 else profit_rub >= required_profit_rub
        profit_pass = profit_rate_pass and profit_rub_pass
        procurement_feasible = any((row.get("link") or row.get("offer_id")) for row in source_table)
        fulfillment_pass = self._safe_float(weight_kg, 0.0) > 0 and bool(pricing.get("logistics_cost_cny") is not None)
        commercial_pass = profit_pass and procurement_feasible and fulfillment_pass
        config_target_rate_pct = self._safe_float(self.config.target_profit_rate, 0.0) * 100
        sell_price_cny = self._safe_float(pricing.get("sell_price_cny"), default=0.0)
        cost_cny = self._safe_float(pricing.get("cost_cny"), default=0.0)
        logistics_cost_cny = self._safe_float(pricing.get("logistics_cost_cny"), default=0.0)
        commission_cny = self._safe_float(pricing.get("commission_cny"), default=sell_price_cny * self._safe_float(pricing.get("commission_rate"), default=0.0))
        exchange_rate_buffer = self._safe_float(self.config.exchange_rate_buffer, 0.0)
        packaging_fee_cny = self._safe_float(self.config.packaging_fee_cny, 0.0)
        max_procurement_cost_cny = sell_price_cny - logistics_cost_cny - commission_cny - packaging_fee_cny - (sell_price_cny * (target_rate_pct / 100.0)) - (sell_price_cny * exchange_rate_buffer)
        max_procurement_cost_cny = round(max(0.0, max_procurement_cost_cny), 2)
        threshold_source = "user" if (
            (required_profit_rate and required_profit_rate > self.config.target_profit_rate) or
            (required_profit_rub and required_profit_rub > 0)
        ) else "system"

        blocked_reasons = []
        blocked_reason_kind = ""
        if not profit_rate_pass:
            if threshold_source == "user":
                blocked_reasons.append(f"用户要求利润率{target_rate_pct:.1f}%高于当前{profit_rate_pct:.1f}%")
                blocked_reason_kind = blocked_reason_kind or "user_profit_rate"
            else:
                blocked_reasons.append(f"系统目标利润率{target_rate_pct:.1f}%高于当前{profit_rate_pct:.1f}%")
                blocked_reason_kind = blocked_reason_kind or "system_profit_rate"
        if not profit_rub_pass and required_profit_rub > 0:
            blocked_reasons.append(f"用户要求利润{required_profit_rub:.0f}₽高于当前{profit_rub:.0f}₽")
            blocked_reason_kind = blocked_reason_kind or "user_profit_rub"
        if not procurement_feasible:
            blocked_reasons.append("缺少可采购货源，无法通过履约门槛")
            blocked_reason_kind = blocked_reason_kind or "procurement"
        if not fulfillment_pass:
            blocked_reasons.append("缺少有效物流/履约信息")
            blocked_reason_kind = blocked_reason_kind or "fulfillment"

        return {
            "lane": self._normalize_lane(lane, sellable_eligible=commercial_pass),
            "profit_pass": profit_pass,
            "fulfillment_pass": fulfillment_pass,
            "commercial_pass": commercial_pass,
            "procurement_feasible": procurement_feasible,
            "profit_rate": profit_rate_pct,
            "profit_rub": profit_rub,
            "target_profit_rate": target_rate_pct,
            "config_target_profit_rate": round(config_target_rate_pct, 2),
            "required_profit_rub": required_profit_rub,
            "threshold_source": threshold_source,
            "blocked_reason_kind": blocked_reason_kind,
            "sell_price_cny": round(sell_price_cny, 2),
            "suggested_sell_price_cny": round(sell_price_cny, 2),
            "current_cost_cny": round(cost_cny, 2),
            "max_procurement_cost_cny": max_procurement_cost_cny,
            "pricing_summary": {
                "sell_price_cny": round(sell_price_cny, 2),
                "current_cost_cny": round(cost_cny, 2),
                "logistics_cost_cny": round(logistics_cost_cny, 2),
                "commission_cny": round(commission_cny, 2),
                "packaging_fee_cny": round(packaging_fee_cny, 2),
                "exchange_rate_buffer": round(exchange_rate_buffer, 4),
                "profit_rate_pct": round(profit_rate_pct, 2),
                "profit_rub": round(profit_rub, 2),
                "target_profit_rate_pct": round(target_rate_pct, 2),
                "config_target_profit_rate_pct": round(config_target_rate_pct, 2),
                "required_profit_rub": round(required_profit_rub, 2),
                "max_procurement_cost_cny": max_procurement_cost_cny,
            },
            "blocked_reasons": blocked_reasons,
        }

    def _compute_listing_gate(self, lane: str, source_gate: Dict, visual_gate: Dict,
                              commercial_gate: Dict, category_info: Dict,
                              listing_result: Dict = None) -> Dict:
        category_resolved = bool((category_info or {}).get("description_category_id") and (category_info or {}).get("type_id"))
        attributes_ready = True
        if isinstance(listing_result, dict) and listing_result.get("attributes_ready") is not None:
            attributes_ready = self._as_bool(listing_result.get("attributes_ready"))
        main_ready = self._as_bool((visual_gate or {}).get("main_ready"))
        anchor_ready = self._as_bool((visual_gate or {}).get("anchor_ready"))

        profit_gate_ok = self._as_bool((commercial_gate or {}).get("profit_pass")) or self._as_bool((commercial_gate or {}).get("profit_gate_bypassed"))
        listing_ready = all([
            self._normalize_lane(lane) == "sellable",
            (source_gate or {}).get("source_verified") is True,
            self._as_bool((source_gate or {}).get("procurement_feasible")),
            self._as_bool((visual_gate or {}).get("visual_lock_ready")),
            profit_gate_ok,
            self._as_bool((commercial_gate or {}).get("fulfillment_pass")),
            category_resolved,
            attributes_ready,
            main_ready,
            anchor_ready,
        ])

        blocked_reasons = []
        blocked_reasons.extend((source_gate or {}).get("blocked_reasons", []))
        blocked_reasons.extend((visual_gate or {}).get("blocked_reasons", []))
        blocked_reasons.extend((commercial_gate or {}).get("blocked_reasons", []))
        if not category_resolved:
            blocked_reasons.append("类目未解析完成")
        if not attributes_ready:
            blocked_reasons.append("属性未就绪")

        return {
            "lane": self._normalize_lane(lane, sellable_eligible=listing_ready),
            "listing_ready": listing_ready,
            "category_resolved": category_resolved,
            "attributes_ready": attributes_ready,
            "main_ready": main_ready,
            "anchor_ready": anchor_ready,
            "blocked_reasons": list(dict.fromkeys([reason for reason in blocked_reasons if reason])),
        }

    def _precheck_listing_payload(self, product_data: Dict, slot_urls: Dict, product_info: Dict = None) -> Dict:
        """提交 Ozon 前的本地 payload 总预检。"""
        product_info = product_info or {}
        blocked_reasons = []

        listing_name = str(product_data.get("name") or "").strip()
        if not listing_name:
            blocked_reasons.append("缺少商品标题")
        else:
            if _looks_like_latin_only_token(listing_name):
                blocked_reasons.append("商品标题疑似拉丁占位词，禁止提交")

        desc_cat_id = product_data.get("description_category_id")
        type_id = product_data.get("type_id")
        if not desc_cat_id or not type_id:
            blocked_reasons.append("缺少description_category_id/type_id")

        try:
            price_value = float(product_data.get("price", 0) or 0)
        except (TypeError, ValueError):
            price_value = 0.0
        if price_value <= 0:
            blocked_reasons.append("价格无效")

        try:
            weight_value = float(product_data.get("weight", 0) or 0)
        except (TypeError, ValueError):
            weight_value = 0.0
        if weight_value <= 0:
            blocked_reasons.append("重量无效")

        dims = product_data.get("dimensions", [])
        if not isinstance(dims, (list, tuple)) or len(dims) < 3:
            blocked_reasons.append("尺寸缺失")
        else:
            try:
                normalized_dims = [float(d or 0) for d in dims[:3]]
            except (TypeError, ValueError):
                normalized_dims = [0, 0, 0]
            if any(d <= 0 for d in normalized_dims):
                blocked_reasons.append("尺寸无效")

        image_urls = product_data.get("images", []) or []
        if not isinstance(image_urls, list) or not image_urls:
            blocked_reasons.append("缺少图片列表")
        invalid_urls = [
            url for url in image_urls
            if not isinstance(url, str) or not url.startswith(("http://", "https://"))
        ]
        if invalid_urls:
            blocked_reasons.append("存在非法图片URL")
        file_scheme_urls = [
            url for url in image_urls
            if isinstance(url, str) and url.startswith("file://")
        ]
        if file_scheme_urls:
            blocked_reasons.append("正式listing禁止file://图片URL")

        if not slot_urls.get("main"):
            blocked_reasons.append("缺少主图(main)")
        if not slot_urls.get("white_bg"):
            blocked_reasons.append("缺少白底锚点图(white_bg)")
        if slot_urls.get("white_bg") and not product_info.get("source_image_url"):
            blocked_reasons.append("white_bg缺少真实货源锚点来源")

        return {
            "payload_ready": not blocked_reasons,
            "blocked_reasons": blocked_reasons,
            "main_ready": bool(slot_urls.get("main")),
            "anchor_ready": bool(slot_urls.get("white_bg") and product_info.get("source_image_url")),
            "image_count": len(image_urls) if isinstance(image_urls, list) else 0,
        }

    def _build_source_table(self, source_result: Dict) -> List[Dict]:
        """
        从Stage 2货源匹配结果中提取1688供应商信息表

        Returns:
            [{shop, price_cny, min_order, link, profit_rub, profit_margin}, ...]
        """
        table = []
        if not source_result:
            return table
        results = self._extract_source_items(source_result)

        for item in results[:10]:
            row = {
                "offer_id": item.get("offer_id", ""),
                "shop": item.get("shop_name", item.get("subject", item.get("title", ""))),
                "price_cny": item.get("price", item.get("sale_price", item.get("priceRange", item.get("price_cny", "")))),
                "min_order": item.get("min_order", item.get("moq", "")),
                "link": item.get("product_url", item.get("detail_url", item.get("url", ""))),
                "image_url": item.get("image_url", ""),
                "profit_rub": item.get("profit_rub", item.get("profit", "")),
                "profit_margin": item.get("profit_margin", item.get("margin", "")),
            }
            if row["shop"] or row["price_cny"] or row["link"]:
                table.append(row)

        return table

    def run_optimize_mode(self, sku_list: List[str]) -> Dict:
        """
        店铺优化模式: 拉取店铺商品 → AI诊断 → 输出优化方案

        Args:
            sku_list: Ozon SKU列表(字符串)

        Returns:
            优化方案: {status, products: [{sku, name, issues, actions, ...}]}
        """
        logger.info(f"[Pipeline] 店铺优化模式: SKUs={sku_list}")
        result = {"status": "pending", "mode": "optimize", "products": []}

        if not self.ozon_api:
            result["status"] = "error"
            result["error"] = "缺少Ozon API凭证，无法拉取商品数据"
            return result


        headers = {
            'Client-Id': str(self.config.ozon_client_id),
            'Api-Key': self.config.ozon_api_key,
            'Content-Type': 'application/json'
        }

        products_info = []
        try:
            from http_client import requests as http_requests


            offer_ids = [s.strip() for s in sku_list.split(",") if s.strip()]
            resp = http_requests.post(
                f"{self.config.ozon_api_url}/v3/product/info/list",
                headers=headers,
                json={"offer_id": offer_ids, "product_list_limit": len(offer_ids)},
                timeout=30
            )

            if resp.ok:
                items = resp.json().get("items", [])
                for item in items:
                    info = item.get("product", {})
                    products_info.append({
                        "sku": info.get("sku", ""),
                        "offer_id": info.get("offer_id", ""),
                        "name": info.get("name", ""),
                        "price": info.get("price", ""),
                        "status": info.get("status", ""),
                        "visibility": info.get("visibility", ""),
                    })
        except Exception as e:
            logger.warning(f"拉取商品详情失败: {e}")


        if not products_info:
            try:
                from http_client import requests as http_requests
                resp = http_requests.post(
                    f"{self.config.ozon_api_url}/v1/analytics/data",
                    headers=headers,
                    json={
                        "date_from": "2025-01-01",
                        "date_to": time.strftime("%Y-%m-%d"),
                        "metrics": ["revenue", "ordered_units", "hits_view_search", "hits_view_pdp"],
                        "dimension": ["sku"],
                        "limit": 100,
                        "offset": 0,
                    },
                    timeout=30
                )
                if resp.ok:
                    rows = resp.json().get("result", {}).get("data", [])
                    for row in rows:
                        dims = row.get("dimensions", [])
                        metrics = row.get("metrics", [])
                        if dims:
                            products_info.append({
                                "sku": dims[0].get("id", ""),
                                "name": dims[0].get("name", ""),
                                "revenue": metrics[0] if len(metrics) > 0 else 0,
                                "orders": metrics[1] if len(metrics) > 1 else 0,
                                "views": metrics[2] if len(metrics) > 2 else 0,
                                "pdp_views": metrics[3] if len(metrics) > 3 else 0,
                            })
            except Exception as e:
                logger.warning(f"拉取分析数据失败: {e}")


        if not products_info:
            result["status"] = "no_data"
            result["error"] = "无法拉取商品数据，请检查Ozon API凭证和SKU是否正确"
            return result

        if self.llm:
            diagnosis_prompt = f"""你是一个Ozon跨境电商优化专家。分析以下店铺商品数据，诊断每个商品的问题并提供优化方案。

商品数据:
{json.dumps(products_info[:20], ensure_ascii=False, indent=2)}

对每个商品，请诊断:
1. 曝光转化问题: 高曝光低转化(views/orders > 100) → 标题/图片/描述需优化
2. 退货问题: 退货率高 → 品质问题 → 需要换1688货源
3. 价格竞争力: 与市场价差距大 → 需要调整价格或换源降本
4. 缺失优化: 无评分/无评价 → 需要提升商品吸引力

返回JSON数组，每个元素:
{{
  "sku": "SKU",
  "name": "商品名",
  "issues": ["问题1", "问题2"],
  "actions": ["优化动作1", "优化动作2"],
  "priority": "high/medium/low",
  "estimated_impact": "预估效果说明"
}}

仅返回JSON数组。"""

            try:
                diagnosis = self.llm.chat(diagnosis_prompt, max_tokens=4000)
                if diagnosis:
                    import re
                    json_match = re.search(r'\[.*\]', diagnosis, re.DOTALL)
                    if json_match:
                        result["products"] = json.loads(json_match.group())
            except Exception as e:
                logger.warning(f"AI诊断失败: {e}")


        if not result["products"]:
            for p in products_info:
                issues = []
                actions = []
                views = p.get("views", 0) or 0
                orders = p.get("orders", 0) or 0


                if views > 0 and orders > 0 and views / max(orders, 1) > 100:
                    issues.append(f"高曝光低转化(曝光{views}/订单{orders})")
                    actions.append("优化标题和主图提升点击率")

                if not p.get("price"):
                    issues.append("未设置价格")
                    actions.append("设置有竞争力的定价")

                if not issues:
                    issues.append("数据不足以诊断")
                    actions.append("建议手动检查商品详情")

                result["products"].append({
                    "sku": p.get("sku", ""),
                    "name": p.get("name", ""),
                    "issues": issues,
                    "actions": actions,
                    "priority": "medium",
                    "estimated_impact": "需进一步分析"
                })

        result["status"] = "success"
        result["total_products"] = len(products_info)
        return result

    def run_listing(self, product_name: str, price_cny: float, weight_kg: float,
                    images_dir: str, output_dir: str, product_info: Dict = None,
                    image_urls: List[str] = None, offer_id: str = None,
                    sizes: List[str] = None, category_info: Dict = None) -> Dict:
        """
        Phase D: Ozon上架

        完整流程：
        1. resolve_category 查找类目（如已传入category_info则跳过）
        2. 并行执行: LLM翻译俄语名 + 估算重量尺寸 + 生成描述
        3. 填充属性 → 提交Ozon

        Args:
            image_urls: Phase C图片生成阶段产出的COS URL列表（必须传入）
            offer_id: 商品货号（pc-YYYYMMDD-NNN格式），如未传则自动生成
            sizes: 多SKU尺码列表(如["S","M","L"])，为空则单SKU
            category_info: Phase A已解析的类目信息，传入则跳过重复解析
        """
        result = {
            "status": "pending",
            "product_name": product_name,
            "price_cny": price_cny
        }

        if not self.ozon_api or not self.config.ozon_client_id or not self.config.ozon_api_key:
            result["status"] = "error"
            result["error"] = "缺少Ozon API凭证"
            return result

        try:
            from logistics_calculator import calculate_sell_price
            from attribute_mapper import resolve_category, UniversalAttributeFiller
            from ozon_listing import OzonConfig, OzonListingService, ProductImage


            if not offer_id:
                offer_id = _generate_offer_id()
            headers = {
                'Client-Id': str(self.config.ozon_client_id),
                'Api-Key': self.config.ozon_api_key,
                'Content-Type': 'application/json'
            }
            try:
                from http_client import requests as http_requests
                check_r = http_requests.post('https://api-seller.ozon.ru/v3/product/info/list',
                    headers=headers, json={'offer_id': [offer_id], 'product_list_limit': 1}, timeout=10)
                existing = check_r.json().get('items', [])
                if existing and existing[0].get('product_id'):
                    logger.warning(f"[Listing] offer_id {offer_id} 已存在产品, 重新生成")
                    offer_id = _generate_offer_id()
            except:
                pass


            if category_info and category_info.get("description_category_id"):
                cat = category_info
                logger.info(f"[Listing] 复用Phase A类目: {cat.get('name', '')} (跳过重复解析)")
            else:
                logger.info("[Listing] 解析Ozon类目...")
                categories = resolve_category(
                    product_name,
                    ozon_client_id=self.config.ozon_client_id,
                    ozon_api_key=self.config.ozon_api_key,
                )
                if not categories:
                    result["status"] = "error"
                    result["error"] = f"未找到匹配类目: {product_name}，请手动指定description_category_id和type_id"
                    result["hint"] = "调用: python scripts/attribute_mapper.py --category-id <ID> --type-id <ID> --list-attrs"
                    return result
                cat = categories[0]
            desc_cat_id = cat["description_category_id"]
            type_id = cat["type_id"]
            result["category"] = cat
            logger.info(f"[Listing] 匹配类目: {cat['name']} (desc_cat_id={desc_cat_id}, type_id={type_id})")

            category_conflict = _category_conflict_reason(product_name, product_info=product_info, category_info=cat)
            if category_conflict:
                logger.warning(f"[Listing] {category_conflict}")
                result["status"] = "blocked"
                result["error"] = category_conflict
                result["category"] = cat
                result["attributes_ready"] = False
                result["listing_submit_ok"] = False
                result["listing_ready"] = False
                result["blocked_reason"] = category_conflict
                return result

            ru_name = self._build_listing_name(product_name, product_info, cat)
            weight_g, dimensions = self._estimate_weight_dimensions(product_name, weight_kg, product_info, cat)
            product_description = self._build_listing_description(ru_name, dimensions, product_info, cat)


            sizes_list = sizes or (self.sizes if hasattr(self, 'sizes') and self.sizes else None)
            group_key = offer_id

            product_data = {
                "name": ru_name,
                "product_name": product_name,
                "offer_id": offer_id,
                "description_category_id": desc_cat_id,
                "type_id": type_id,
                "price": str(price_cny),
                "currency_code": "CNY",
                "weight": weight_g,
                "dimensions": dimensions,
                "images": [],
                "image_urls": image_urls or [],
            }
            if sizes_list:
                product_data["sizes"] = sizes_list
                product_data["group_key"] = group_key
                logger.info(f"[Listing] 多SKU模式: sizes={sizes_list}, group_key={group_key}")
            if product_description:
                product_data["description"] = product_description


            if product_info:
                for key in ["color", "material", "brand", "gender", "country", "model", "type", "product_type", "product_type_ru", "category_type", "type_name", "type_name_ru"]:
                    if key in product_info:
                        product_data[key] = product_info[key]
                for raw_name_key in ["title", "name", "subject"]:
                    raw_name_value = product_info.get(raw_name_key)
                    if raw_name_value:
                        product_data[raw_name_key] = raw_name_value
            product_data["category_type"] = product_data.get("category_type") or cat.get("type_name", "")
            product_data["type_name"] = product_data.get("type_name") or cat.get("type_name", "")
            product_data["type_name_ru"] = product_data.get("type_name_ru") or cat.get("type_name_ru", "")
            product_data["product_type"] = product_data.get("product_type") or cat.get("type_name", "")
            product_data["product_type_ru"] = product_data.get("product_type_ru") or cat.get("type_name_ru", "")


            if not image_urls:
                result["status"] = "need_images"
                result["error"] = "无产品图片，必须先完成图片生成阶段(Stage 3)"
                result["product_data"] = product_data
                return result



            slot_urls = {}
            if image_urls and isinstance(image_urls, list):
                slot_order = ["main", "usp", "detail", "trust", "scene2", "white_bg"]
                for i, url in enumerate(image_urls):
                    if isinstance(url, str) and url.startswith("http"):
                        slot_name = slot_order[i] if i < len(slot_order) else f"img{i}"
                        slot_urls[slot_name] = url

            missing_critical = []
            for req_slot in ["main", "white_bg"]:
                if not slot_urls.get(req_slot):
                    missing_critical.append(req_slot)

            if missing_critical:
                logger.warning(f"[Listing] 缺少关键图片: {missing_critical}，阻断正式上架")
                result["status"] = "need_images"
                result["error"] = f"缺少关键图片: {', '.join(missing_critical)}"
                result["product_data"] = product_data
                result["main_ready"] = "main" not in missing_critical
                result["anchor_ready"] = "white_bg" not in missing_critical and bool(product_info and product_info.get("source_image_url"))
                result["attributes_ready"] = False
                return result


            config = OzonConfig(
                client_id=self.config.ozon_client_id,
                api_key=self.config.ozon_api_key
            )
            service = OzonListingService(config)
            service.description_category_id = desc_cat_id
            service.type_id = type_id


            logger.info(f"[Listing] 使用 {len(image_urls)} 张COS图片URL...")
            product_data["images"] = image_urls

            payload_precheck = self._precheck_listing_payload(product_data, slot_urls, product_info=product_info)
            result["payload_precheck"] = payload_precheck
            if not payload_precheck["payload_ready"]:
                logger.warning(f"[Listing] payload 本地预检失败: {payload_precheck['blocked_reasons']}")
                result["status"] = "blocked"
                result["error"] = "；".join(payload_precheck["blocked_reasons"]) or "listing payload 本地预检失败"
                result["product_data"] = product_data
                result["main_ready"] = payload_precheck["main_ready"]
                result["anchor_ready"] = payload_precheck["anchor_ready"]
                result["attributes_ready"] = False
                result["listing_submit_ok"] = False
                return result

            if hasattr(service, "prepare_product_items"):
                local_attr_precheck = service.prepare_product_items(
                    [product_data],
                    image_urls={offer_id: product_data["images"]},
                    use_universal_filler=True,
                )
                result["local_attribute_precheck"] = local_attr_precheck.get("precheck", {})
                if not self._as_bool(result["local_attribute_precheck"].get("local_ready", True)):
                    missing_required = list(result["local_attribute_precheck"].get("missing_required_attributes", []))
                    logger.warning(f"[Listing] 本地属性预检失败: {missing_required}")
                    result["status"] = "blocked"
                    quality_score = result["local_attribute_precheck"].get("attribute_coverage_score")
                    quality_pass = self._as_bool(result["local_attribute_precheck"].get("attribute_quality_pass", True))
                    if missing_required:
                        result["error"] = "缺少本地必填属性: " + ", ".join(missing_required[:5])
                    elif not quality_pass:
                        result["error"] = f"属性完整度不足{ATTRIBUTE_QUALITY_THRESHOLD}分，当前{quality_score}"
                    else:
                        result["error"] = "本地属性预检失败"
                    result["product_data"] = product_data
                    result["main_ready"] = payload_precheck["main_ready"]
                    result["anchor_ready"] = payload_precheck["anchor_ready"]
                    result["attributes_ready"] = False
                    result["listing_submit_ok"] = False
                    return result


            logger.info("[Listing] 提交产品到Ozon...")
            listing_result = None
            max_submit_retries = 3
            for submit_attempt in range(max_submit_retries):
                try:
                    listing_result = service.create_product_listings(
                        [product_data],
                        image_urls={offer_id: product_data["images"]},
                        use_full_attributes=True,
                        use_universal_filler=True
                    )
                    break
                except Exception as submit_err:
                    if submit_attempt < max_submit_retries - 1:
                        wait_time = 5 * (2 ** submit_attempt)
                        logger.warning(f"[Listing] 提交失败(尝试{submit_attempt+1}/{max_submit_retries}): {submit_err}, {wait_time}s后重试...")
                        import time as _time
                        _time.sleep(wait_time)
                    else:
                        raise submit_err

            tasks = listing_result.get("tasks", []) if isinstance(listing_result, dict) else []
            precheck = listing_result.get("precheck", {}) if isinstance(listing_result, dict) else {}
            task_statuses = [task.get("status", "") for task in tasks if isinstance(task, dict)]
            failed_items = [
                failed
                for task in tasks if isinstance(task, dict)
                for failed in task.get("failed_items", [])
            ]
            precheck_local_ready = self._as_bool(precheck.get("local_ready", True))
            precheck_missing_required = list(precheck.get("missing_required_attributes", []))
            attributes_ready = not any(
                "attribute" in str(err).lower() or "атриб" in str(err).lower()
                for failed in failed_items
                for err in failed.get("errors", [])
            )
            if not precheck_local_ready or precheck_missing_required:
                attributes_ready = False
            submitted_ok = bool(tasks) and any(status in {"success", "partial"} for status in task_statuses)
            fully_success = bool(tasks) and all(status == "success" for status in task_statuses)
            if not precheck_local_ready:
                submitted_ok = False

            result["status"] = "submitted" if submitted_ok else "error"
            result["listing_result"] = listing_result
            result["offer_id"] = offer_id
            result["main_ready"] = bool(slot_urls.get("main"))
            result["anchor_ready"] = bool(slot_urls.get("white_bg") and product_info and product_info.get("source_image_url"))
            result["attributes_ready"] = attributes_ready
            result["listing_submit_ok"] = submitted_ok
            result["listing_submit_statuses"] = task_statuses
            result["failed_items"] = failed_items
            result["precheck"] = precheck
            if not submitted_ok:
                first_error = ""
                if failed_items:
                    first_errors = failed_items[0].get("errors", [])
                    first_error = "; ".join(map(str, first_errors[:3]))
                if not first_error and precheck_missing_required:
                    first_error = "缺少本地必填属性: " + ", ".join(precheck_missing_required[:5])
                result["error"] = first_error or "Ozon product import failed"
            elif not fully_success:
                result["warning"] = "Ozon导入部分成功，存在失败item"


            product_data_path = os.path.join(output_dir, "product_data.json")
            with open(product_data_path, 'w', encoding='utf-8') as f:
                json.dump(product_data, f, ensure_ascii=False, indent=2)
            result["product_data_path"] = product_data_path

        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error(f"[Listing] 上架失败: {e}")

        return result

    def run_copycat_mode(self, sku, name="", price=599.0, weight=0.3, keywords=None,
                         submit_listing: bool = False, submit_clone: bool = False,
                         smoke_bypass_profit_gate: bool = False):
        """Chain2: Ozon跟卖模式
        流程: Ozon竞品详情 → 1688以图搜款 → 1688真实详情 → 制图 → 上架/待提交
        默认不执行 import-by-sku / 正式提交，避免误操作生产店铺。
        """
        result = {
            "mode": "copycat",
            "sku": sku,
            "status": "pending",
            "steps": {}
        }

        try:
            from ozon_search import OzonSearchClient
            logger.info(f"[Copycat] Step 1: 获取Ozon竞品详情 SKU={sku}")
            client = OzonSearchClient()
            ozon_product = client.get_product_details(str(sku))
            client._close()
            result["steps"]["ozon_product"] = ozon_product or {}

            if not ozon_product:
                result["status"] = "error"
                result["error"] = "无法获取Ozon竞品详情或被antibot拦截"
                return result

            product_title = name or ozon_product.get("title") or f"Ozon SKU {sku}"
            image_candidates = list(ozon_product.get("images", []) or [])
            hero_image = image_candidates[0] if image_candidates else ""
            if not hero_image:
                result["status"] = "error"
                result["error"] = "竞品详情缺少可用图片，无法执行1688以图搜款"
                return result

            result["steps"]["copycat_reference"] = {
                "sku": sku,
                "title": product_title,
                "image": hero_image,
                "price_rub": ozon_product.get("price"),
                "seller": ozon_product.get("seller"),
            }

            if submit_clone:
                from ozon_listing import OzonConfig, OzonListingService
                from logistics_calculator import LogisticsCalculator
                logger.info("[Copycat] Step 2: 执行 import-by-sku 复制（显式开启）")
                ozon_config = OzonConfig(
                    client_id=self.config.ozon_client_id,
                    api_key=self.config.ozon_api_key
                )
                service = OzonListingService(ozon_config)
                offer_id = _generate_offer_id()
                calc = LogisticsCalculator()
                price_result = calc.calculate_sell_price(
                    cost_cny=price,
                    weight_kg=weight,
                    provider=self.config.logistics_provider,
                    speed=self.config.delivery_speed,
                    delivery_type=self.config.delivery_type,
                    target_profit_rate=self.config.target_profit_rate,
                    exchange_rate_buffer=self.config.exchange_rate_buffer,
                    packaging_fee_cny=self.config.packaging_fee_cny
                )
                sell_price_rub = price_result["sell_price_rub"]
                old_price_rub = round(sell_price_rub * 1.15)
                clone_result = service.client.import_by_sku([{
                    "sku": int(sku),
                    "name": product_title,
                    "offer_id": offer_id,
                    "price": str(int(round(sell_price_rub))),
                    "old_price": str(old_price_rub),
                    "currency_code": "RUB",
                    "vat": "0.0"
                }])
                result["steps"]["import_by_sku"] = clone_result
                result["clone_offer_id"] = offer_id

            logger.info("[Copycat] Step 3: 执行真实货源→制图→上架链路")
            chain_result = self.run_full_pipeline(
                keywords=keywords or [product_title],
                cost_cny=price,
                weight_kg=weight,
                mode="image",
                ozon_product_image=hero_image,
                min_profit=0.0,
                min_profit_rub=0.0,
                submit_listing=submit_listing,
                smoke_bypass_profit_gate=smoke_bypass_profit_gate,
            )
            result["steps"]["pipeline"] = chain_result
            result["status"] = chain_result.get("status", "unknown")
            result["lane"] = chain_result.get("lane", "")
            result["listing_ready"] = chain_result.get("listing_ready", False)
            result["procurement_links"] = chain_result.get("procurement_links", [])
            result["offer_id"] = chain_result.get("offer_id", "")
            result["product_id"] = chain_result.get("product_id", "")
            if chain_result.get("blocked_reason"):
                result["blocked_reason"] = chain_result.get("blocked_reason")
            if chain_result.get("error"):
                result["error"] = chain_result.get("error")

        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error(f"[Copycat] 跟卖失败: {e}")

        return result

    def run_ozon_pick_mode(self, ozon_query, price=599.0, weight=0.3, submit_listing: bool = False,
                          max_candidates: int = 3, smoke_bypass_profit_gate: bool = False):
        """Chain3: Ozon选品自建模式
        流程: 蓝海扫描 → Ozon候选排序 → TopN候选逐个尝试 → 1688真实详情 → 制图 → 上架/待提交
        """
        result = {
            "mode": "ozon-pick",
            "ozon_query": ozon_query,
            "status": "pending",
            "steps": {}
        }

        try:

            logger.info(f"[OzonPick] Step 1: 蓝海扫描 query={ozon_query}")
            market_scan = self.run_ozon_market_scan(ozon_query, limit=10)
            result["steps"]["blue_ocean_scan"] = market_scan

            from ozon_candidate_selector import select_best_candidate, rank_candidates
            ranked_candidates = rank_candidates(market_scan.get("products", []), query=ozon_query)
            selected, _ = select_best_candidate(market_scan.get("products", []), query=ozon_query)
            result["steps"]["candidate_ranking"] = ranked_candidates[:5]
            try:
                ranking_path = os.path.join("artifacts", "candidate_ranking.json")
                os.makedirs(os.path.dirname(ranking_path), exist_ok=True)
                with open(ranking_path, "w", encoding="utf-8") as f:
                    json.dump(ranked_candidates, f, ensure_ascii=False, indent=2)
                result["steps"]["candidate_ranking_path"] = ranking_path
            except Exception as ranking_err:
                logger.warning(f"[OzonPick] 候选榜单落盘失败: {ranking_err}")

            if not selected or not selected.get("image"):
                result["status"] = market_scan.get("status", "no_results")
                result["error"] = market_scan.get("error") or market_scan.get("message") or "未找到可用于1688搜款的Ozon竞品图"
                return result

            attempts = []
            chosen = None
            pipeline_result = None
            for candidate in ranked_candidates[: max(1, int(max_candidates or 1))]:
                if not candidate.get("image"):
                    continue
                attempt = {
                    "id": candidate.get("id"),
                    "name": candidate.get("name"),
                    "image": candidate.get("image"),
                    "price": candidate.get("price"),
                    "url": candidate.get("url"),
                    "candidate_score": candidate.get("candidate_score"),
                    "category_match_score": candidate.get("category_match_score"),
                    "source_match_score": candidate.get("source_match_score"),
                    "demand_score": candidate.get("demand_score"),
                    "competition_score": candidate.get("competition_score"),
                    "profit_score": candidate.get("profit_score"),
                    "fulfillment_score": candidate.get("fulfillment_score"),
                    "selection_reasons": candidate.get("selection_reasons", []),
                    "risk_flags": candidate.get("risk_flags", []),
                }
                chain_result = self.run_full_pipeline(
                    keywords=[candidate.get("name") or ozon_query],
                    cost_cny=price,
                    weight_kg=weight,
                    mode="image",
                    ozon_product_image=candidate.get("image"),
                    ozon_query=ozon_query,
                    submit_listing=submit_listing,
                    smoke_bypass_profit_gate=smoke_bypass_profit_gate,
                )
                attempt["pipeline_status"] = chain_result.get("status", "unknown")
                attempt["source_verified"] = chain_result.get("source_verified")
                attempt["procurement_feasible"] = chain_result.get("procurement_feasible")
                attempt["listing_ready"] = chain_result.get("listing_ready")
                attempt["blocked_reason"] = chain_result.get("blocked_reason", "")
                attempts.append(attempt)

                if chain_result.get("source_verified") is True and chain_result.get("procurement_feasible") is True and chain_result.get("listing_ready") is not False:
                    chosen = candidate
                    pipeline_result = chain_result
                    break
                if chain_result.get("status") in {"ready_for_submit", "sellable", "research-only"}:
                    chosen = candidate
                    pipeline_result = chain_result
                    break

            result["steps"]["candidate_attempts"] = attempts
            result["steps"]["candidate_attempt_summary"] = {
                "ranked_total": len(ranked_candidates),
                "attempted": len(attempts),
                "success_count": sum(1 for item in attempts if item.get("pipeline_status") in {"ready_for_submit", "sellable", "research-only"}),
                "blocked_count": sum(1 for item in attempts if item.get("pipeline_status") == "blocked"),
                "failed_candidate_ids": [item.get("id") for item in attempts if item.get("pipeline_status") == "blocked"],
                "blocked_reasons": [item.get("blocked_reason") for item in attempts if item.get("blocked_reason")],
                "selected_candidate_id": chosen.get("id") if chosen else "",
                "blocked_reason_buckets": {},
            }
            for reason in result["steps"]["candidate_attempt_summary"]["blocked_reasons"]:
                key = reason or "unknown"
                result["steps"]["candidate_attempt_summary"]["blocked_reason_buckets"][key] = (
                    result["steps"]["candidate_attempt_summary"]["blocked_reason_buckets"].get(key, 0) + 1
                )
            from ozon_candidate_selector import build_candidate_attempt_report, build_ozon_pick_bundle_report
            candidate_attempt_report_md = build_candidate_attempt_report(
                ozon_query=ozon_query,
                attempts=attempts,
                summary=result["steps"]["candidate_attempt_summary"],
            )
            result["steps"]["candidate_attempt_report_md"] = candidate_attempt_report_md
            try:
                report_path = os.path.join(
                    "artifacts",
                    "candidate_attempt_report.md",
                )
                os.makedirs(os.path.dirname(report_path), exist_ok=True)
                with open(report_path, "w", encoding="utf-8") as f:
                    f.write(candidate_attempt_report_md)
                result["steps"]["candidate_attempt_report_path"] = report_path
            except Exception as report_err:
                logger.warning(f"[OzonPick] 候选报告落盘失败: {report_err}")
            if not chosen or not pipeline_result:
                last_attempt = attempts[-1] if attempts else {}
                result["status"] = last_attempt.get("pipeline_status") or market_scan.get("status", "no_results")
                result["error"] = last_attempt.get("blocked_reason") or market_scan.get("error") or market_scan.get("message") or "TopN候选均未通过1688真实货源验证"
                result["steps"]["selected_reference"] = attempts[0] if attempts else {}
                return result

            result["steps"]["selected_reference"] = {
                "id": chosen.get("id"),
                "name": chosen.get("name"),
                "image": chosen.get("image"),
                "price": chosen.get("price"),
                "url": chosen.get("url"),
                "candidate_score": chosen.get("candidate_score"),
                "demand_score": chosen.get("demand_score"),
                "competition_score": chosen.get("competition_score"),
                "category_match_score": chosen.get("category_match_score"),
                "source_match_score": chosen.get("source_match_score"),
                "profit_score": chosen.get("profit_score"),
                "fulfillment_score": chosen.get("fulfillment_score"),
                "selection_reasons": chosen.get("selection_reasons", []),
                "risk_flags": chosen.get("risk_flags", []),
            }
            try:
                bundle_report_md = build_ozon_pick_bundle_report(
                    ozon_query=ozon_query,
                    selected_reference=result["steps"]["selected_reference"],
                    summary=result["steps"]["candidate_attempt_summary"],
                    ranking=ranked_candidates,
                    attempt_report_md=candidate_attempt_report_md,
                )
                bundle_path = os.path.join("artifacts", "ozon_pick_bundle_report.md")
                os.makedirs(os.path.dirname(bundle_path), exist_ok=True)
                with open(bundle_path, "w", encoding="utf-8") as f:
                    f.write(bundle_report_md)
                result["steps"]["ozon_pick_bundle_report_md"] = bundle_report_md
                result["steps"]["ozon_pick_bundle_report_path"] = bundle_path
            except Exception as bundle_err:
                logger.warning(f"[OzonPick] 总览报告落盘失败: {bundle_err}")

            result["steps"]["pipeline"] = pipeline_result
            result["status"] = pipeline_result.get("status", "unknown")
            result["lane"] = pipeline_result.get("lane", "")
            result["listing_ready"] = pipeline_result.get("listing_ready", False)
            result["procurement_links"] = pipeline_result.get("procurement_links", [])
            result["offer_id"] = pipeline_result.get("offer_id", "")
            result["product_id"] = pipeline_result.get("product_id", "")
            if pipeline_result.get("blocked_reason"):
                result["blocked_reason"] = pipeline_result.get("blocked_reason")
            if pipeline_result.get("error"):
                result["error"] = pipeline_result.get("error")

        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error(f"[OzonPick] 选品自建失败: {e}")

        return result


def main():
    """命令行入口"""
    import argparse

    parser = argparse.ArgumentParser(description="蓝海选品Pipeline (v7.0 三链路利润驱动)")
    parser.add_argument("--keywords", nargs="+", help="产品关键词")
    parser.add_argument("--price", type=float, default=599.0, help="Ozon目标售价(CNY，上架后Ozon自动显示RUB)")
    parser.add_argument("--weight", type=float, default=0.3, help="产品重量(kg)，用于计算物流费用")
    parser.add_argument("--mode", choices=["text", "image", "optimize", "copycat", "ozon-pick"], default="text",
                        help="链路模式: text=Chain1(1688文本搜索→Ozon), image=Chain2(Ozon→1688以图搜款→Ozon), optimize=店铺优化, copycat=Chain2(跟卖→1688找货→重制图→更新), ozon-pick=Chain3(蓝海→1688找货→自建上架)")
    parser.add_argument("--ozon-query", help="Chain2/3: Ozon市场扫描关键词")
    parser.add_argument("--ozon-image", help="Chain2: Ozon产品图片URL，用于1688以图搜款")
    parser.add_argument("--sku", type=int, help="Chain2 copycat: Ozon竞品SKU, 用于import-by-sku跟卖")
    parser.add_argument("--copycat-name", type=str, help="Chain2 copycat: 跟卖商品名称(俄语)")
    parser.add_argument("--copycat-price", type=float, help="Chain2 copycat: 跟卖商品售价(CNY)")
    parser.add_argument("--min-profit", type=float, default=0.0,
                        help="最低利润率过滤(0-1, 如0.3=30%%), 低于此值的商品被标记")
    parser.add_argument("--min-profit-rub", type=float, default=0.0,
                        help="最低单品利润额过滤(卢布), 与--min-profit取较大值")
    parser.add_argument("--optimize-sku", type=str,
                        help="店铺优化模式: 传入Ozon SKU列表(逗号分隔)")
    parser.add_argument("--sizes", type=str, help="多SKU尺码列表(逗号分隔, 如'S,M,L,XL')")
    parser.add_argument("--source-url", type=str, help="1688货源URL(offer页面链接或offer_id)，优先H5 API获取商品详情")
    parser.add_argument("--output", type=str, help="输出文件")
    parser.add_argument("--check-tier", action="store_true", help="仅检测Tier级别")
    parser.add_argument("--store", type=str, help="店铺名称（多店铺时指定）")
    parser.add_argument("--store-config", type=str, help="stores.json配置文件路径")
    parser.add_argument("--submit-listing", action="store_true", help="通过所有闸门后正式提交Ozon listing")
    parser.add_argument("--smoke-bypass-profit-gate", action="store_true", help="仅用于真实smoke，跳过利润门槛阻断，但不跳过真实性/履约/视觉/属性闸门")
    parser.add_argument("--submit-copycat-import", action="store_true", help="copycat模式下执行 import-by-sku 复制")

    args = parser.parse_args()


    if args.store or args.store_config:
        config = PipelineConfig.from_store_config(
            store_name=args.store,
            store_config_path=args.store_config
        )
    else:
        config = PipelineConfig.from_env()
    pipeline = BlueOceanPipeline(config)


    if args.check_tier:
        print(f"当前Tier: {pipeline.tier}")
        tier_descriptions = {
            "tier1_core": "核心层（纯API，无需代理）",
            "tier1_limited": "受限核心层（缺少关键配置）",
            "tier2_enhanced": "增强层（+1688 API）",
            "tier3_full": "完整层（+代理/浏览器）"
        }
        print(tier_descriptions.get(pipeline.tier, ""))
        missing = []
        if not config.ozon_api_key:
            missing.append("OZON_API_KEY（需在凭证管理中配置ozon_api）")
        if not config.mxou_api_key:
            missing.append("MXOU_API_KEY（需在凭证管理中配置mxou_api）")
        if not config.ozon_client_id:
            missing.append("OZON_CLIENT_ID（需在stores.json中配置）")
        if missing:
            print(f"\n缺少配置: {'; '.join(missing)}")
        return

    if not args.keywords and not args.ozon_query and not args.ozon_image and not args.optimize_sku and not args.sku:
        print("请提供 --keywords, --ozon-query, --ozon-image, --optimize-sku 或 --sku 参数")
        return


    if args.mode == "optimize" or args.optimize_sku:
        sku_list = args.optimize_sku or ""
        if not sku_list:
            print("店铺优化模式需要 --optimize-sku 参数(逗号分隔的SKU列表)")
            return
        result = pipeline.run_optimize_mode(sku_list)
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\n结果已保存到: {args.output}")
        else:
            print("\n" + json.dumps(result, ensure_ascii=False, indent=2))
        return


    if args.mode == "copycat":
        if not args.sku:
            print("跟卖模式需要 --sku 参数(Ozon竞品SKU)")
            return
        result = pipeline.run_copycat_mode(
            sku=args.sku,
            name=args.copycat_name or "",
            price=args.copycat_price or args.price,
            weight=args.weight,
            keywords=args.keywords or [],
            submit_listing=args.submit_listing,
            submit_clone=args.submit_copycat_import,
            smoke_bypass_profit_gate=args.smoke_bypass_profit_gate,
        )
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\n结果已保存到: {args.output}")
        else:
            print("\n" + json.dumps(result, ensure_ascii=False, indent=2))
        return


    if args.mode == "ozon-pick":
        if not args.ozon_query:
            print("Ozon选品自建模式需要 --ozon-query 参数(Ozon搜索关键词)")
            return
        result = pipeline.run_ozon_pick_mode(
            ozon_query=args.ozon_query,
            price=args.price,
            weight=args.weight,
            submit_listing=args.submit_listing,
            smoke_bypass_profit_gate=args.smoke_bypass_profit_gate,
        )
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\n结果已保存到: {args.output}")
        else:
            print("\n" + json.dumps(result, ensure_ascii=False, indent=2))
        return


    if args.mode == "image" and not args.keywords:
        args.keywords = ["product"]

    sizes_list = [s.strip() for s in args.sizes.split(",")] if args.sizes else None

    result = pipeline.run_full_pipeline(
        args.keywords, args.price, args.weight,
        mode=args.mode,
        ozon_query=args.ozon_query,
        ozon_product_image=args.ozon_image,
        min_profit=args.min_profit,
        min_profit_rub=args.min_profit_rub,
        sizes=sizes_list,
        source_url=args.source_url or "",
        submit_listing=args.submit_listing,
        smoke_bypass_profit_gate=args.smoke_bypass_profit_gate,
    )

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n结果已保存到: {args.output}")
    else:
        print("\n" + json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
