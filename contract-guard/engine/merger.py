"""合并层 — 将 LLM 软检查 + 正则硬规则合并为最终统一 JSON。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from engine.models import AnalysisResult, StatuteCheck
from engine.cn_labor_rules import run_all_checks

# 加载法条数据库（用于 sources 引用）
_RULES_DB_PATH = Path(__file__).parent.parent / "data" / "cn_law_rules.json"
with open(_RULES_DB_PATH, "r", encoding="utf-8") as f:
    _RULES_DB = json.load(f)


def _build_sources(statute_checks: list[StatuteCheck]) -> list[dict]:
    """根据 statute_checks 的 rule_id 去 cn_law_rules.json 查 sources。"""
    sources = []
    seen = set()
    for check in statute_checks:
        if check.rule_id in seen:
            continue
        seen.add(check.rule_id)
        rule = _RULES_DB["rules"].get(check.rule_id)
        if rule:
            sources.append({
                "rule_id": check.rule_id,
                "document": rule.get("law", ""),
                "section": rule.get("article", ""),
                "text": rule.get("text", ""),
                "reference_source_id": rule.get("reference_source_id", ""),
            })
    return sources


def _deduplicate(
    llm_issues: list[dict],
    statute_checks: list[dict],
) -> tuple[list[dict], list[dict]]:
    """去重：如果 LLM 和正则都发现了同一问题，合并为一条。

    Returns:
        (deduplicated_issues, source_tags)
        source_tags: list of "llm" | "regex" | "both"
    """
    # 简单的标题相似度匹配
    llm_titles = {issue.get("title", "").lower() for issue in llm_issues}
    source_tags = []

    for check in statute_checks:
        rule_id = check.get("rule_id", "")
        title = check.get("title", "").lower()

        # 检查 LLM 是否也发现了类似问题
        matched_llm = False
        for lt in llm_titles:
            # 简单子串匹配
            if rule_id.replace("_", " ") in lt or any(
                keyword in lt for keyword in title.split() if len(keyword) > 2
            ):
                matched_llm = True
                break

        if matched_llm:
            source_tags.append("both")
        else:
            source_tags.append("regex")

    return statute_checks, source_tags


def merge_results(
    llm_result: AnalysisResult,
    statute_checks: list[StatuteCheck],
    contract_text: str = "",
) -> dict[str, Any]:
    """合并 LLM 产物和正则产物为最终统一 JSON。

    Args:
        llm_result: LLM 分析结果
        statute_checks: 正则规则检查结果
        contract_text: 原始合同文本（可选，用于生成 Mermaid 图）

    Returns:
        MergedResult 字典
    """
    # 转换 StatuteCheck 为 dict
    statute_dicts = [check.model_dump() for check in statute_checks]

    # 构建 sources
    sources = _build_sources(statute_checks)

    # 去重
    _, source_tags = _deduplicate(
        [issue.model_dump() for issue in llm_result.red_flags + llm_result.warnings],
        statute_dicts,
    )

    # 为 statute_checks 添加 source 标记
    for i, check_dict in enumerate(statute_dicts):
        if i < len(source_tags):
            check_dict["source"] = source_tags[i]
        else:
            check_dict["source"] = "regex"

    # 计算综合评分（取 LLM 评分和正则评分的加权平均）
    violation_count = sum(1 for c in statute_checks if c.status.value == "violation")
    ok_count = sum(1 for c in statute_checks if c.status.value == "ok")
    total_checks = len(statute_checks)

    if total_checks > 0:
        regex_score = max(0, min(100, int(100 * (ok_count - violation_count) / total_checks)))
    else:
        regex_score = llm_result.fairness_score

    # 加权平均：LLM 60% + 正则 40%
    fairness_score = int(llm_result.fairness_score * 0.6 + regex_score * 0.4)
    fairness_score = max(0, min(100, fairness_score))

    # 计算等级
    if fairness_score >= 90:
        fairness_grade = "A+"
    elif fairness_score >= 80:
        fairness_grade = "A"
    elif fairness_score >= 70:
        fairness_grade = "B+"
    elif fairness_score >= 60:
        fairness_grade = "B"
    elif fairness_score >= 50:
        fairness_grade = "C+"
    elif fairness_score >= 40:
        fairness_grade = "C"
    elif fairness_score >= 30:
        fairness_grade = "D"
    else:
        fairness_grade = "F"

    # 生成 Mermaid 图（条款风险分布）
    mermaid_chart = _generate_mermaid_chart(statute_checks, llm_result)

    return {
        "contract_type": llm_result.contract_type.value,
        "summary": llm_result.summary,
        "parties": llm_result.parties,
        "key_terms": llm_result.key_terms,
        "red_flags": [issue.model_dump() for issue in llm_result.red_flags],
        "warnings": [issue.model_dump() for issue in llm_result.warnings],
        "good_clauses": [p.model_dump() for p in llm_result.good_clauses],
        "missing_protections": llm_result.missing_protections,
        "statute_checks": statute_dicts,
        "fairness_score": fairness_score,
        "fairness_grade": fairness_grade,
        "sources": sources,
        "mermaid_chart": mermaid_chart,
    }


def _generate_mermaid_chart(
    statute_checks: list[StatuteCheck],
    llm_result: AnalysisResult,
) -> str:
    """生成 Mermaid 图表 — 条款风险分布图。"""
    lines = ["graph TD"]
    lines.append("    A[合同风险总览] --> B[正则规则检查]")
    lines.append("    A --> C[LLM 智能分析]")

    # 正则结果
    violation_rules = [c for c in statute_checks if c.status.value == "violation"]
    ok_rules = [c for c in statute_checks if c.status.value == "ok"]
    unknown_rules = [c for c in statute_checks if c.status.value == "unknown"]

    if violation_rules:
        lines.append(f"    B --> D[违规: {len(violation_rules)}项]")
        for r in violation_rules[:5]:  # 最多显示5个
            safe_title = r.title.replace('"', "'")[:20]
            lines.append(f'    D --> D_{r.rule_id}["{safe_title}"]')

    if ok_rules:
        lines.append(f"    B --> E[合规: {len(ok_rules)}项]")

    if unknown_rules:
        lines.append(f"    B --> F[未知: {len(unknown_rules)}项]")

    # LLM 结果
    if llm_result.red_flags:
        lines.append(f"    C --> G[红旗: {len(llm_result.red_flags)}项]")
    if llm_result.warnings:
        lines.append(f"    C --> H[警告: {len(llm_result.warnings)}项]")
    if llm_result.good_clauses:
        lines.append(f"    C --> I[保护: {len(llm_result.good_clauses)}项]")

    return "\n".join(lines)


def scan_contract(
    contract_text: str,
    contract_type: str = "unknown",
    lang: str = "zh",
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    skip_llm: bool = False,
) -> dict[str, Any]:
    """完整的合同扫描流程：正则硬规则 + LLM 软检查 + 合并。

    Args:
        contract_text: 合同全文
        contract_type: 合同类型
        lang: 语言
        api_key: API key
        base_url: API base URL
        model: LLM 模型名
        skip_llm: 是否跳过 LLM（仅运行正则规则）

    Returns:
        MergedResult 字典
    """
    from engine.analyzer import analyze_contract, DEFAULT_MODEL

    # 1. 运行正则硬规则
    statute_checks = run_all_checks(contract_text, contract_type, lang)

    if skip_llm:
        # 仅返回正则结果
        statute_dicts = [check.model_dump() for check in statute_checks]
        sources = _build_sources(statute_checks)
        violation_count = sum(1 for c in statute_checks if c.status.value == "violation")
        ok_count = sum(1 for c in statute_checks if c.status.value == "ok")
        total = len(statute_checks)
        score = max(0, min(100, int(100 * (ok_count - violation_count) / total))) if total > 0 else 50

        return {
            "contract_type": contract_type,
            "summary": "仅运行正则规则检查（未调用 LLM）",
            "parties": [],
            "key_terms": [],
            "red_flags": [],
            "warnings": [],
            "good_clauses": [],
            "missing_protections": [],
            "statute_checks": statute_dicts,
            "fairness_score": score,
            "fairness_grade": "N/A",
            "sources": sources,
            "mermaid_chart": None,
        }

    # 2. 调用 LLM
    use_model = model or DEFAULT_MODEL
    llm_result = analyze_contract(
        contract_text,
        model=use_model,
        api_key=api_key,
        base_url=base_url,
        lang=lang,
    )

    # 3. 合并
    return merge_results(llm_result, statute_checks, contract_text)
