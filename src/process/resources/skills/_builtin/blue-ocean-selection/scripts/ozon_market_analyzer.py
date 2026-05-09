#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ozon蓝海市场分析
================

通过Ozon Seller API获取类目结构、已上架产品数据，
结合LLM做类目蓝海分析，输出选品建议和1688搜索关键词。

两条选品链路:
  链路1: 1688→Ozon (从1688找品→上Ozon)
  链路2: Ozon→1688→Ozon (从Ozon找蓝海→去1688找源→再上Ozon)

用法:
    python scripts/ozon_market_analyzer.py --category "玩具" --depth 2
    python scripts/ozon_market_analyzer.py --list-categories
    python scripts/ozon_market_analyzer.py --blue-ocean --top 5
"""

import argparse
import json
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lib"))

from config import get_config
from http_client import requests as http_requests

logger = logging.getLogger(__name__)


class OzonMarketAnalyzer:
    """Ozon蓝海市场分析器"""

    # Ozon Seller API 基地址
    API_BASE = "https://api-seller.ozon.ru"

    # 类目竞争度评估阈值(基于LLM分析)
    LOW_COMPETITION_THRESHOLD = 0.4
    HIGH_DEMAND_THRESHOLD = 0.7

    # 类目佣金率参考(Ozon官方)
    CATEGORY_COMMISSION = {
        "鞋类": 0.15,
        "儿童用品": 0.10,
        "美容": 0.13,
        "家居装修": 0.10,
        "服装": 0.13,
        "电子产品": 0.08,
        "宠物用品": 0.10,
        "运动和休闲": 0.10,
        "汽车用品": 0.10,
        "办公用品": 0.08,
    }

    def __init__(self, config=None):
        self.config = config or get_config()
        self.headers = {
            "Client-Id": self.config.ozon_client_id,
            "Api-Key": self.config.ozon_api_key,
            "Content-Type": "application/json",
        }
        self._category_tree = None

    # ── 类目树 ─────────────────────────────────────────────

    def get_category_tree(self, language: str = "ZH_HANS") -> list:
        """获取Ozon完整类目树"""
        if self._category_tree is not None:
            return self._category_tree

        try:
            r = http_requests.post(
                f"{self.API_BASE}/v1/description-category/tree",
                headers=self.headers,
                json={"language": language},
                timeout=30,
            )
            if not r.ok:
                logger.error(f"类目树请求失败: {r.status_code} {r.text[:200]}")
                return []

            data = r.json()
            self._category_tree = data.get("result", [])
            return self._category_tree
        except Exception as e:
            logger.error(f"获取类目树失败: {e}")
            return []

    def search_category(self, keyword: str, language: str = "ZH_HANS") -> list:
        """搜索匹配关键词的类目"""
        tree = self.get_category_tree(language)
        if not tree:
            return []
        results = []
        keyword_lower = keyword.lower()
        self._search_category_recursive(tree, keyword_lower, results, [])
        return results

    def _search_category_recursive(self, nodes, keyword, results, path):
        """递归搜索类目树"""
        for node in nodes:
            cat_name = node.get("category_name", "")
            cat_id = node.get("description_category_id")
            type_name = node.get("type_name", "")
            type_id = node.get("type_id")

            current_path = path + [cat_name or type_name]

            # 匹配检查
            name_to_check = (cat_name or type_name or "").lower()
            if keyword in name_to_check or name_to_check in keyword:
                results.append({
                    "category_id": cat_id,
                    "type_id": type_id,
                    "name": cat_name or type_name,
                    "path": " > ".join(current_path),
                    "depth": len(current_path),
                    "has_children": bool(node.get("children")),
                })

            # 递归
            children = node.get("children", [])
            if children:
                self._search_category_recursive(children, keyword, results, current_path)

    def get_category_details(self, category_id: int, type_id: int = None) -> dict:
        """获取类目详细信息，包含属性要求"""
        details = {"category_id": category_id, "type_id": type_id}

        # 获取属性要求
        try:
            body = {
                "filter": {
                    "category_id": [category_id],
                    "limit": 100,
                },
                "language": "ZH_HANS",
            }
            if type_id:
                body["filter"]["type_id"] = type_id

            r = http_requests.post(
                f"{self.API_BASE}/v4/product/info/attributes",
                headers=self.headers,
                json=body,
                timeout=30,
            )
            if r.ok:
                attrs = r.json().get("result", [])
                required_attrs = [a for a in attrs if a.get("is_required")]
                optional_attrs = [a for a in attrs if not a.get("is_required")]
                details["total_attributes"] = len(attrs)
                details["required_attributes"] = len(required_attrs)
                details["optional_attributes"] = len(optional_attrs)
                details["attribute_names"] = [
                    a.get("name", "") for a in required_attrs[:10]
                ]
        except Exception as e:
            logger.warning(f"获取类目属性失败: {e}")

        return details

    # ── 产品分析 ───────────────────────────────────────────

    def get_store_products(self, limit: int = 100) -> list:
        """获取店铺已上架产品列表"""
        products = []
        last_id = ""

        while True:
            try:
                r = http_requests.post(
                    f"{self.API_BASE}/v2/product/list",
                    headers=self.headers,
                    json={
                        "filter": {"visibility": "ALL"},
                        "last_id": last_id,
                        "limit": min(limit - len(products), 100),
                    },
                    timeout=30,
                )
                if not r.ok:
                    logger.warning(f"获取产品列表失败: {r.status_code}")
                    break

                data = r.json()
                items = data.get("result", {}).get("items", [])
                if not items:
                    break

                products.extend(items)
                last_id = data.get("result", {}).get("last_id", "")

                if len(products) >= limit or not last_id:
                    break
            except Exception as e:
                logger.warning(f"获取产品列表异常: {e}")
                break

        return products

    def get_analytics(self, date_from: str, date_to: str,
                      metrics: list = None, dimension: list = None) -> dict:
        """获取店铺分析数据"""
        if metrics is None:
            metrics = ["revenue", "ordered_units", "delivered_units",
                       "hits_view_search", "hits_view_pdp"]
        if dimension is None:
            dimension = ["sku"]

        try:
            r = http_requests.post(
                f"{self.API_BASE}/v1/analytics/data",
                headers=self.headers,
                json={
                    "date_from": date_from,
                    "date_to": date_to,
                    "metrics": metrics,
                    "dimension": dimension,
                    "limit": 1000,
                    "offset": 0,
                },
                timeout=30,
            )
            if r.ok:
                return r.json().get("result", {})
            else:
                logger.warning(f"Analytics请求失败: {r.status_code}")
                return {}
        except Exception as e:
            logger.warning(f"Analytics请求异常: {e}")
            return {}

    # ── 蓝海分析 ───────────────────────────────────────────

    def analyze_blue_ocean(self, category_keyword: str = None,
                           top_n: int = 5) -> dict:
        """
        蓝海选品分析

        基于Ozon类目结构、属性要求、佣金率等数据，
        结合LLM分析推荐蓝海品类和1688采购建议。
        """
        # 1. 获取类目树
        tree = self.get_category_tree()
        if not tree:
            return {"status": "error", "message": "无法获取Ozon类目树"}

        # 2. 搜索相关类目
        categories = []
        if category_keyword:
            categories = self.search_category(category_keyword)
        else:
            # 无关键词时取全类目概览
            categories = self._flatten_top_categories(tree)

        if not categories:
            return {"status": "error", "message": f"未找到匹配'{category_keyword}'的类目"}

        # 3. 获取每个类目的详情
        analyzed = []
        for cat in categories[:20]:  # 限制分析数量
            cat_id = cat.get("category_id")
            type_id = cat.get("type_id")
            if cat_id:
                details = self.get_category_details(cat_id, type_id)
                cat.update(details)

                # 佣金率
                cat_name = cat.get("name", "")
                cat["commission_rate"] = self._estimate_commission(cat_name)

                analyzed.append(cat)

        # 4. LLM蓝海分析
        recommendations = self._llm_blue_ocean_analysis(analyzed, top_n)

        return {
            "status": "success",
            "category_keyword": category_keyword,
            "analyzed_categories": len(analyzed),
            "recommendations": recommendations,
        }

    def _flatten_top_categories(self, tree: list) -> list:
        """扁平化顶级类目"""
        results = []
        for node in tree:
            cat_name = node.get("category_name", "")
            cat_id = node.get("description_category_id")
            if cat_name and cat_id:
                results.append({
                    "category_id": cat_id,
                    "type_id": node.get("type_id"),
                    "name": cat_name,
                    "path": cat_name,
                    "depth": 1,
                    "has_children": bool(node.get("children")),
                })
        return results

    def _estimate_commission(self, category_name: str) -> float:
        """估算类目佣金率"""
        for key, rate in self.CATEGORY_COMMISSION.items():
            if key in category_name or category_name in key:
                return rate
        return 0.10  # 默认10%

    def _llm_blue_ocean_analysis(self, categories: list, top_n: int) -> list:
        """LLM分析蓝海品类"""
        if not self.config.mxou_api_key:
            # 无LLM可用，返回基础排序
            return self._basic_ranking(categories, top_n)

        # 构建分析prompt
        cat_descriptions = []
        for i, cat in enumerate(categories):
            cat_descriptions.append(
                f"{i + 1}. {cat.get('name', '')} (路径: {cat.get('path', '')})"
                f" | 属性数: {cat.get('total_attributes', '?')}"
                f" | 必填属性: {cat.get('required_attributes', '?')}"
                f" | 佣金率: {cat.get('commission_rate', 0.1) * 100:.0f}%"
            )

        prompt = f"""你是一个Ozon跨境电商选品专家。分析以下Ozon类目数据，推荐最适合中国卖家做蓝海选品的品类。

类目列表:
{chr(10).join(cat_descriptions)}

蓝海选品判断标准:
1. 竞争度低：属性要求少、入门门槛低的品类更容易进入
2. 中国供应链优势：中国制造有价格/品类优势的产品（玩具、家居、宠物用品等）
3. 利润空间：佣金率低、采购成本可控的品类
4. 市场需求：日常消费品、季节性需求品
5. 体积重量：小体积轻量产品物流成本低

请推荐top {top_n}蓝海品类，每个品类包含:
- category_name: 品类名称
- category_id: 品类ID
- reason: 为什么是蓝海(50字内)
- competition_score: 竞争度1-10(1最低)
- profit_potential: 利润潜力1-10(10最高)
- sourcing_keywords: 1688搜索关键词(3-5个中文关键词，逗号分隔)
- estimated_cost_cny: 预估1688采购成本(CNY)
- suggested_sell_price_cny: 建议Ozon售价(CNY)

返回JSON数组，仅返回JSON不要其他内容。"""

        try:
            r = http_requests.post(
                f"{self.config.mxou_api_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config.mxou_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.config.mxou_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 2048,
                },
                timeout=60,
            )
            if not r.ok:
                logger.warning(f"LLM蓝海分析请求失败: {r.status_code}")
                return self._basic_ranking(categories, top_n)

            content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")

            # 提取JSON
            import re
            json_match = re.search(r"\[.*\]", content, re.DOTALL)
            if not json_match:
                logger.warning("LLM蓝海分析返回非JSON格式")
                return self._basic_ranking(categories, top_n)

            recommendations = json.loads(json_match.group())
            return recommendations[:top_n]

        except Exception as e:
            logger.warning(f"LLM蓝海分析异常: {e}")
            return self._basic_ranking(categories, top_n)

    def _basic_ranking(self, categories: list, top_n: int) -> list:
        """基础排序(无LLM时的降级方案)"""
        scored = []
        for cat in categories:
            # 简单评分：必填属性少=易进入，佣金低=利润高
            score = 0
            req_attrs = cat.get("required_attributes", 10)
            if req_attrs <= 5:
                score += 3
            elif req_attrs <= 10:
                score += 2
            elif req_attrs <= 20:
                score += 1

            commission = cat.get("commission_rate", 0.10)
            if commission <= 0.08:
                score += 3
            elif commission <= 0.10:
                score += 2
            else:
                score += 1

            # 中国供应链优势品类加分
            advantage_keywords = ["玩具", "家居", "宠物", "厨房", "收纳", "装饰",
                                 "办公", "工具", "园艺", "运动"]
            cat_name = cat.get("name", "")
            for kw in advantage_keywords:
                if kw in cat_name:
                    score += 2
                    break

            scored.append({
                "category_name": cat_name,
                "category_id": cat.get("category_id"),
                "reason": f"属性要求{req_attrs}个，佣金{commission * 100:.0f}%，中国供应链有优势",
                "competition_score": max(1, 10 - score),
                "profit_potential": min(10, score),
                "sourcing_keywords": cat_name,
                "estimated_cost_cny": 0,
                "suggested_sell_price_cny": 0,
            })

        scored.sort(key=lambda x: x["profit_potential"], reverse=True)
        return scored[:top_n]

    # ── 品类推荐 ───────────────────────────────────────────

    def recommend_categories(self, top_n: int = 8) -> dict:
        """
        推荐适合中国卖家的Ozon热搜品类
        
        基于类目树数据 + LLM分析，推荐:
        - 低竞争、高需求的品类
        - 中国供应链有优势的品类
        - 含1688搜索关键词和预估成本
        
        Returns:
            {status, recommendations: [{category_name, reason, sourcing_keywords, ...}]}
        """
        # 1. 获取类目树
        tree = self.get_category_tree()
        if not tree:
            return {"status": "error", "message": "无法获取Ozon类目树"}

        # 2. 提取所有类目名称供LLM分析
        all_categories = []
        self._flatten_all_categories(tree, all_categories, [])

        # 3. LLM推荐
        if not self.config.mxou_api_key:
            # 无LLM，返回基础推荐
            return {
                "status": "success",
                "method": "basic",
                "recommendations": self._basic_category_recommendation(all_categories, top_n),
            }

        # 准备类目列表(截断避免过长)
        cat_text = "\n".join(
            f"{i+1}. {c['name']} (路径: {c['path']})"
            for i, c in enumerate(all_categories[:100])
        )

        prompt = f"""你是Ozon跨境电商选品专家。根据Ozon类目数据，推荐最适合中国卖家做蓝海选品的{top_n}个品类。

Ozon类目列表(前100个):
{cat_text}

推荐标准:
1. 中国供应链优势: 小商品、家居、宠物、母婴、汽配等
2. 物流友好: 体积小、重量轻(≤2kg)、不易碎
3. 利润空间: 佣金率低、采购成本可控、售价500-3000₽
4. 竞争度低: 细分品类、非标品、有差异化空间
5. 市场需求: 日常消耗品、季节性需求

每个推荐包含:
- category_name: 品类名称(中文)
- category_name_ru: 品类名称(俄语)
- reason: 推荐理由(30字内)
- competition_score: 竞争度1-10(1最低)
- profit_potential: 利润潜力1-10(10最高)
- sourcing_keywords: 1688搜索关键词(3-5个中文，逗号分隔)
- estimated_cost_cny: 预估1688采购成本(CNY)
- suggested_sell_price_rub: 建议Ozon售价(₽)
- logistics_friend: 物流友好度1-10(10最好)

返回JSON数组，仅返回JSON。"""

        try:
            r = http_requests.post(
                f"{self.config.mxou_api_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config.mxou_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.config.mxou_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 3000,
                },
                timeout=60,
            )
            if not r.ok:
                return {"status": "success", "method": "basic_fallback",
                        "recommendations": self._basic_category_recommendation(all_categories, top_n)}

            content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                # 尝试reasoning_content
                content = r.json().get("choices", [{}])[0].get("message", {}).get("reasoning_content", "")
            
            import re
            json_match = re.search(r"\[.*\]", content, re.DOTALL)
            if json_match:
                recommendations = json.loads(json_match.group())
                return {"status": "success", "method": "llm", "recommendations": recommendations[:top_n]}

        except Exception as e:
            logger.warning(f"LLM品类推荐失败: {e}")

        return {"status": "success", "method": "basic_fallback",
                "recommendations": self._basic_category_recommendation(all_categories, top_n)}

    def _flatten_all_categories(self, nodes, result, path):
        """递归扁平化所有类目"""
        for node in nodes:
            cat_name = node.get("category_name", "")
            type_name = node.get("type_name", "")
            cat_id = node.get("description_category_id")
            current_path = path + [cat_name or type_name]
            if cat_name or type_name:
                result.append({
                    "category_id": cat_id,
                    "type_id": node.get("type_id"),
                    "name": cat_name or type_name,
                    "path": " > ".join(current_path),
                })
            children = node.get("children", [])
            if children:
                self._flatten_all_categories(children, result, current_path)

    def _basic_category_recommendation(self, all_categories, top_n):
        """基础品类推荐(无LLM降级)"""
        # 推荐中国供应链优势品类
        advantage_kw = ["игрушки", "дом", "питомец", "кухня", "органайзер",
                        "авто", "спорт", "канцеляр", "сад", "детские"]
        scored = []
        for cat in all_categories:
            name_lower = cat.get("name", "").lower()
            score = 0
            for kw in advantage_kw:
                if kw in name_lower:
                    score += 3
                    break
            # 路径深度越深=越细分=越蓝海
            depth = cat.get("path", "").count(">")
            if depth >= 2:
                score += 2
            if score > 0:
                scored.append({**cat, "score": score})
        scored.sort(key=lambda x: x["score"], reverse=True)
        return [
            {
                "category_name": s["name"],
                "category_name_ru": "",
                "reason": "中国供应链优势品类",
                "competition_score": max(1, 8 - s["score"]),
                "profit_potential": min(10, s["score"]),
                "sourcing_keywords": s["name"],
                "estimated_cost_cny": 0,
                "suggested_sell_price_rub": 0,
                "logistics_friend": 7,
            }
            for s in scored[:top_n]
        ]

    # ── Ozon→1688链路 ─────────────────────────────────────

    def ozon_to_1688_pipeline(self, category_keyword: str, top_n: int = 3) -> dict:
        """
        Ozon→1688→Ozon 链路:
        1. Ozon蓝海分析找到优质品类
        2. 为每个品类生成1688采购关键词
        3. 返回选品建议(含1688搜索关键词)
        """
        analysis = self.analyze_blue_ocean(category_keyword, top_n)

        if analysis.get("status") != "success":
            return analysis

        recommendations = analysis.get("recommendations", [])

        # 为每个推荐品类生成1688搜索方案
        for rec in recommendations:
            keywords = rec.get("sourcing_keywords", "")
            if isinstance(keywords, str):
                keywords = [k.strip() for k in keywords.split(",")]
            rec["search_1688_keywords"] = keywords
            rec["search_1688_url"] = (
                f"https://s.1688.com/selloffer/offer_search.htm?keywords={keywords[0]}"
                if keywords else ""
            )

        return {
            "status": "success",
            "pipeline": "ozon_to_1688_to_ozon",
            "category_keyword": category_keyword,
            "recommendations": recommendations,
        }


# ── CLI ────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ozon蓝海市场分析")
    parser.add_argument("--list-categories", action="store_true",
                        help="列出Ozon顶级类目")
    parser.add_argument("--category", help="搜索类目关键词")
    parser.add_argument("--depth", type=int, default=2,
                        help="类目搜索深度")
    parser.add_argument("--blue-ocean", action="store_true",
                        help="执行蓝海选品分析")
    parser.add_argument("--recommend", action="store_true",
                        help="推荐适合中国卖家的Ozon热搜品类(含1688搜索关键词)")
    parser.add_argument("--top", type=int, default=5,
                        help="推荐品类数量")
    parser.add_argument("--pipeline", choices=["ozon-1688", "1688-ozon"],
                        help="选品链路")
    parser.add_argument("--store", help="店铺名称")
    args = parser.parse_args()

    config = get_config(store_name=args.store)
    analyzer = OzonMarketAnalyzer(config)

    if args.list_categories:
        tree = analyzer.get_category_tree()
        for node in tree:
            name = node.get("category_name", "")
            cat_id = node.get("description_category_id", "")
            children = node.get("children", [])
            print(f"  {name} (ID: {cat_id}, 子类目: {len(children)})")

    elif args.blue_ocean:
        result = analyzer.analyze_blue_ocean(args.category, args.top)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif args.recommend:
        result = analyzer.recommend_categories(args.top)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif args.pipeline == "ozon-1688":
        result = analyzer.ozon_to_1688_pipeline(args.category or "玩具", args.top)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif args.category:
        results = analyzer.search_category(args.category)
        print(f"搜索'{args.category}'找到 {len(results)} 个类目:")
        for r in results[:20]:
            print(f"  {r['path']} (ID: {r['category_id']}, "
                  f"type: {r.get('type_id', '-')})")

    else:
        parser.print_help()
