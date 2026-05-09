#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ozon 候选选择器
================

用途：
- 对 Ozon 搜索/扫描得到的候选商品做轻量规则评分
- 选出更适合进入 1688 真货匹配链路的参考商品

注意：
- 这里只决定“优先送哪个 Ozon 候选去做 1688 找源”
- 不替代真实货源闸门
- 不直接决定 sellable 资格
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

BRAND_RISK_TERMS = {
    "nike", "adidas", "apple", "samsung", "lego", "disney", "xiaomi",
    "华为", "小米", "苹果", "迪士尼", "耐克", "阿迪达斯", "乐高",
}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _normalized_tokens(text: str) -> List[str]:
    if not text:
        return []
    lowered = str(text).lower().replace("/", " ").replace("-", " ")
    return [token.strip() for token in lowered.split() if token.strip()]


def _contains_brand_risk(title: str) -> bool:
    title_lower = (title or "").lower()
    return any(term in title_lower for term in BRAND_RISK_TERMS)


def score_candidate(item: Dict[str, Any], query: str = "") -> Dict[str, Any]:
    """对单个 Ozon 候选做规则评分。"""
    raw = dict(item or {})
    title = str(raw.get("name") or raw.get("title") or "").strip()
    image = str(raw.get("image") or raw.get("image_url") or "").strip()
    url = str(raw.get("url") or "").strip()
    category_text = str(raw.get("category") or raw.get("category_name") or raw.get("category_hint") or "").strip()
    price = _safe_float(raw.get("price"))
    rating = _safe_float(raw.get("rating"))
    reviews = _safe_int(raw.get("reviewsCount") or raw.get("reviews_count"))
    discount = _safe_int(raw.get("discount"))

    demand_score = 0.0
    competition_score = 0.0
    category_match_score = 0.0
    source_match_score = 0.0
    profit_score = 0.0
    fulfillment_score = 0.0
    reasons: List[str] = []
    risk_flags: List[str] = []

    if image:
        source_match_score += 3.0
        reasons.append("有主图，可进入1688以图搜款")
    else:
        risk_flags.append("missing_image")

    if title:
        source_match_score += 2.0
        reasons.append("有标题，可补充关键词搜源")
    else:
        risk_flags.append("missing_title")

    if url:
        source_match_score += 1.0
        reasons.append("有商品链接，可追溯竞品页面")

    if 50 <= price <= 50000:
        profit_score += 1.5
        reasons.append("价格带在合理候选区间")
    elif price > 0:
        profit_score += 0.5
        risk_flags.append("price_outlier")
    else:
        risk_flags.append("missing_price")

    if rating >= 4.5:
        demand_score += 1.5
        competition_score += 1.0
        reasons.append("评分较高，说明市场接受度较好")
    elif rating >= 4.0:
        demand_score += 1.0
        competition_score += 0.5

    if reviews >= 100:
        demand_score += 1.5
        reasons.append("评论量较高，需求验证更充分")
    elif reviews >= 20:
        demand_score += 0.8

    if 5 <= discount <= 70:
        competition_score += 0.5

    query_tokens = _normalized_tokens(query)
    title_tokens = _normalized_tokens(title)
    category_tokens = _normalized_tokens(category_text)
    if query_tokens and title_tokens:
        overlap = set(query_tokens) & set(title_tokens)
        if overlap:
            source_match_score += min(1.5, 0.5 * len(overlap))
            reasons.append("标题与查询词存在关键词重合")

    if query_tokens and category_tokens:
        overlap = set(query_tokens) & set(category_tokens)
        if overlap:
            category_match_score += 0.5
            reasons.append("类目与查询方向匹配")

    if image and title and url:
        fulfillment_score += 1.0

    if _contains_brand_risk(title):
        risk_flags.append("brand_risk")
        competition_score -= 0.5
        reasons.append("检测到明显品牌词，需人工复核侵权/授权风险")

    candidate_score = round(
        demand_score + competition_score + category_match_score + source_match_score + profit_score + fulfillment_score,
        2,
    )

    scored = {
        **raw,
        "candidate_score": candidate_score,
        "demand_score": round(demand_score, 2),
        "competition_score": round(competition_score, 2),
        "category_match_score": round(category_match_score, 2),
        "source_match_score": round(source_match_score, 2),
        "profit_score": round(profit_score, 2),
        "fulfillment_score": round(fulfillment_score, 2),
        "selection_reasons": reasons,
        "risk_flags": risk_flags,
        "has_image": bool(image),
        "has_title": bool(title),
        "has_url": bool(url),
    }
    return scored


def rank_candidates(items: List[Dict[str, Any]], query: str = "") -> List[Dict[str, Any]]:
    scored = [score_candidate(item, query=query) for item in (items or [])]
    scored.sort(
        key=lambda x: (
            x.get("candidate_score", 0),
            x.get("source_match_score", 0),
            x.get("category_match_score", 0),
            x.get("demand_score", 0),
            x.get("has_image", False),
            _safe_float(x.get("rating")),
            _safe_int(x.get("reviewsCount") or x.get("reviews_count")),
            _safe_float(x.get("price")),
        ),
        reverse=True,
    )
    return scored


def select_best_candidate(items: List[Dict[str, Any]], query: str = "") -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    ranked = rank_candidates(items, query=query)
    selected = ranked[0] if ranked else {}
    return selected, ranked



def build_candidate_attempt_report(ozon_query: str, attempts: List[Dict[str, Any]], summary: Dict[str, Any]) -> str:
    """把候选尝试结果整理成 markdown 复盘报告。"""
    lines = [
        "# Ozon自动选品候选尝试报告",
        "",
        f"- 查询词: {ozon_query or '-'}",
        f"- 排名候选总数: {summary.get('ranked_total', 0)}",
        f"- 实际尝试数: {summary.get('attempted', 0)}",
        f"- 成功数: {summary.get('success_count', 0)}",
        f"- 阻断数: {summary.get('blocked_count', 0)}",
        f"- 最终选中候选: {summary.get('selected_candidate_id') or '-'}",
        "",
        "## 尝试明细",
    ]
    if not attempts:
        lines.append("- 无可用候选")
        return "\n".join(lines) + "\n"

    for idx, item in enumerate(attempts, start=1):
        lines.extend([
            f"### {idx}. 候选 {item.get('id') or '-'}",
            f"- 标题: {item.get('name') or '-'}",
            f"- 状态: {item.get('pipeline_status') or '-'}",
            f"- 总分: {item.get('candidate_score', 0)}",
            f"- 货源匹配分: {item.get('source_match_score', 0)}",
            f"- 类目匹配分: {item.get('category_match_score', 0)}",
            f"- 需求分: {item.get('demand_score', 0)}",
            f"- 竞争分: {item.get('competition_score', 0)}",
            f"- 利润分: {item.get('profit_score', 0)}",
            f"- 履约分: {item.get('fulfillment_score', 0)}",
            f"- 风险标记: {', '.join(item.get('risk_flags', [])) or '-'}",
            f"- 阻断原因: {item.get('blocked_reason') or '-'}",
            f"- 选择理由: {'；'.join(item.get('selection_reasons', [])) or '-'}",
            "",
        ])
    return "\n".join(lines).strip() + "\n"


def build_ozon_pick_bundle_report(
    ozon_query: str,
    selected_reference: Dict[str, Any],
    summary: Dict[str, Any],
    ranking: List[Dict[str, Any]],
    attempt_report_md: str,
) -> str:
    """汇总 Ozon 选品关键结果，生成总览 markdown。"""
    selected_reference = selected_reference or {}
    summary = summary or {}
    ranking = ranking or []
    lines = [
        "# Ozon自动选品总览报告",
        "",
        f"- 查询词: {ozon_query or '-'}",
        f"- 最终选中候选: {selected_reference.get('id') or '-'}",
        f"- 选中标题: {selected_reference.get('name') or '-'}",
        f"- 选中总分: {selected_reference.get('candidate_score', 0)}",
        f"- 选中类目匹配分: {selected_reference.get('category_match_score', 0)}",
        f"- 排名候选总数: {summary.get('ranked_total', 0)}",
        f"- 实际尝试数: {summary.get('attempted', 0)}",
        f"- 成功数: {summary.get('success_count', 0)}",
        f"- 阻断数: {summary.get('blocked_count', 0)}",
        "",
        "## 失败原因聚类",
    ]
    buckets = summary.get("blocked_reason_buckets", {}) or {}
    if buckets:
        for reason, count in buckets.items():
            lines.append(f"- {reason}: {count}")
    else:
        lines.append("- 无")

    lines.extend([
        "",
        "## 候选榜单 Top 5",
    ])
    for idx, item in enumerate(ranking[:5], start=1):
        lines.append(
            f"- {idx}. {item.get('id') or '-'} | {item.get('name') or '-'} | score={item.get('candidate_score', 0)} | risk={','.join(item.get('risk_flags', [])) or '-'}"
        )

    lines.extend([
        "",
        "## 候选尝试报告",
        "",
        attempt_report_md.strip(),
        "",
    ])
    return "\n".join(lines).strip() + "\n"
