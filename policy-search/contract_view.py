# -*- coding: utf-8 -*-
"""契约 v3 视图构建：《政策解读模块 MCP 接口契约 v3》CampusRuleToolResult 顶层字段组装。

把 policy_matcher 单条政策的匹配结果（query_policy 的 results[0]）转成"规则分析"页
与对话内联卡片直接消费的顶层字段；原始 results[] 保持不变（超集输出，前端零改动）：
- "申请清单"面板继续读 results[0].condition_matches（board/input_kind/... 全量明细）；
- "规则分析"页读 conditionGroups（仅 门槛 base / 红线 veto / 加分 bonus 三类板块，
  统一映射为契约四态，顺序/字段名/key 大小写严格按契约）。

v3 新增（条件行级）：
- sourceFile：政策来源文件（《标题》年份版.pdf），供"政策依据"展开区展示；
- control：RowControl 输入控件配置（type/fieldKey/placeholder/options），
  由条件名称经 CONTROL_RULES 规则表映射到「我的信息」字段；未命中的条件不带 control，
  前端按名称兜底（契约 §四 优先级：有 control 用 control）。userValue 同步同样优先用
  control.fieldKey，避免按名称猜错字段（如"绩点排名要求"不能落到 GPA）。

后端 8 态 → 契约 4 态映射：
    met → met                        clear（否决未触发）→ met
    not_met → not_met                violated（否决命中）→ not_met
    missing_info → missing_info      optional（加分项）→ needs_manual_review
    needs_manual_review → 自身        informational（说明类，已被板块过滤）→ needs_manual_review 兜底
"""

import os
import re
from typing import Any, Dict, List, Optional, Tuple

CONTRACT_TYPE = "campus_rule_analysis"
TOOL_NAME = "query_policy"

# 解读页只收"门槛 / 红线 / 加分"；"其他"说明类不进链路（仍在 results[] 里供清单面板展示）
GROUP_BOARDS = ("base", "veto", "bonus")

MATCH_TO_CONTRACT = {
    "met": "met",
    "not_met": "not_met",
    "missing_info": "missing_info",
    "needs_manual_review": "needs_manual_review",
    "clear": "met",
    "violated": "not_met",
    "optional": "needs_manual_review",
    "informational": "needs_manual_review",
}

QUOTE_LIMIT = 200      # 契约 §九：sourceQuote 每条 ≤ 200 字
EVIDENCE_LIMIT = 5     # 契约 §九：evidences ≤ 5 条

# ---------- v3：条件名 → 输入控件（RowControl）映射 ----------
# 规则按顺序匹配（re.search，先到先得）；fieldKey=None 表示显式不提供控件。
# fieldKey 取前端 FIELD_DEFS 预设键（basic.*/academic.*/english.*/performance.*/
# awards.*/research.*/other.*）及契约 v3 示例键 academic.thesisGrade；
# 未命中/显式跳过的条件不返回 control，由前端按名称兜底（契约 §四 优先级）。
#
# 顺序注意（真实 KB 验证过的陷阱）：
#   - "本科阶段成绩单/外语成绩证明"等材料类先经 guard 跳过；
#   - "绩点排名要求"必须先命中 rank，否则会被 gpa 的"绩点"吞掉；
#   - "毕业设计/实训成绩要求"先于 courseMin，避免落到"课程成绩"；
#   - "外语类专业..."不得落到 basic.major，经 guard 跳过。
CONTROL_RULES: List[Tuple[str, Optional[str], Optional[str], Optional[str], Optional[List[str]]]] = [
    # 材料/证明类：不提供控件（前端兜底生成动态字段）
    (r"成绩单|成绩证明", None, None, None, None),
    # 毕业设计/实训成绩（契约 v3 示例：select 优秀/良好/中等/及格）
    (r"毕业设计|毕业论文|毕设|实训成绩", "academic.thesisGrade", "select", None, ["优秀", "良好", "中等", "及格"]),
    # 排名类（须先于 gpa）
    (r"排名|名次", "academic.rank", "input", "例如 5/120", None),
    (r"gpa|绩点|平均学分|平均成绩|学分绩", "academic.gpa", "number", "例如 3.72", None),
    (r"不及格|挂科|补考|重修", "academic.fail", "input", "例如：无", None),
    (r"课程成绩|单科成绩|必修课.{0,6}成绩|最低分", "academic.courseMin", "number", "例如 75", None),
    (r"cet[-\s_]?6|六级", "english.cet6", "number", "例如 523", None),
    (r"cet[-\s_]?4|四级", "english.cet4", "number", "例如 542", None),
    # 泛指 CET/英语成绩（如"非外语类CET成绩要求"）
    (r"cet.{0,8}成绩|英语成绩(?!证明)", "english.cet4", "number", "例如 542", None),
    # 外语类专业等限定条件：不提供控件（避免误落 basic.major）
    (r"外语类|专四|专八", None, None, None, None),
    (r"综合测评|综测|综合素质|德智体美", "performance.comprehensive", "number", "例如 88", None),
    (r"志愿|公益|义工|服务时长", "performance.volunteer", "input", "例如：32小时", None),
    (r"学术活动|社会实践|社团活动|讲座", "performance.activity", "input", "例如：参加校级学术讲座", None),
    (r"获奖|奖项|荣誉|奖学金|竞赛奖", "awards.awards", "input", "例如：校级一等奖学金", None),
    (r"论文|科研|专利|大创|课题|出版物|学术成果", "research.research", "input", "例如：SCI 二作 1 篇", None),
    (r"学籍|在读|应届|全日制|学生身份|入学资格", "basic.enrolled", "input", "例如：全日制在读本科生", None),
    (r"年级", "basic.grade", "input", "例如：大三", None),
    (r"专业|学院", "basic.major", "input", "例如：软件工程", None),
    (r"处分|违纪|作弊|诚信|记过|通报批评|学术不端|弄虚作假", "other.discipline", "input", "例如：无", None),
    (r"推荐信|导师推荐", "other.recommendation", "input", "例如：有（1封）", None),
    (r"申请材料|材料齐全|材料提交", "other.materials", "input", "例如：齐全", None),
]

# 判定为"不符合"时状态给 partial（沿用前端适配层先例：not_eligible → partial）
_PARTIAL_VERDICTS = ("disqualified", "not_eligible")

_BOARD_LABELS = {"base": "基础门槛", "veto": "一票否决", "bonus": "加分项"}


def _clip(text: Optional[str], limit: int = QUOTE_LIMIT) -> Optional[str]:
    """原文引用裁剪（契约：每条 ≤ 200 字）。"""
    if not isinstance(text, str):
        return text
    t = text.strip()
    return t if len(t) <= limit else t[: limit - 1] + "…"


def _file_name(result: Dict[str, Any]) -> str:
    """政策文件名（如《…实施细则》2024版），供摘要话术与「我的报告」展示。"""
    title = (result.get("policy_title") or "未知政策").strip()
    if not (title.startswith("《") and title.endswith("》")):
        title = f"《{title}》"
    year = result.get("policy_year")
    return f"{title}{year}版" if year else title


def _source_ext(result: Dict[str, Any]) -> str:
    """来源文件扩展名：取政策源文件（meta.source_file）的真实扩展名，缺省 .pdf。"""
    src = str(result.get("policy_source_file") or "").strip()
    ext = os.path.splitext(src)[1]
    return ext if ext else ".pdf"


def _source_file_name(result: Dict[str, Any]) -> str:
    """条件行来源文件（契约 v3 示例：《…》2024版.pdf）。"""
    return f"{_file_name(result)}{_source_ext(result)}"


def _control_for(item: Any) -> Optional[Dict[str, Any]]:
    """条件名 → RowControl 输入控件配置（契约 v3 §四）。

    规则表顺序匹配，先到先得；未命中或显式跳过（材料/证明类等）返回 None，
    由前端按条件名称兜底推断（契约优先级：有 control 用 control）。
    """
    if not isinstance(item, str) or not item.strip():
        return None
    t = item.replace(" ", "").replace("\u3000", "").lower()
    for pattern, field_key, ctype, placeholder, options in CONTROL_RULES:
        if re.search(pattern, t):
            if not field_key:
                return None  # 显式跳过
            ctrl: Dict[str, Any] = {"type": ctype, "fieldKey": field_key}
            if placeholder:
                ctrl["placeholder"] = placeholder
            if options:
                ctrl["options"] = options
            return ctrl
    return None


def _row(c: Dict[str, Any], source_file: Optional[str] = None) -> Dict[str, Any]:
    """单条条件 → 契约 ConditionRow（camelCase 字段名）。

    v3：附带 sourceFile（来源文件）与 control（可行时）；
    control 未命中映射时不携带，前端按名称兜底。
    """
    row: Dict[str, Any] = {
        "id": c.get("id"),
        "item": c.get("item"),
        "match": MATCH_TO_CONTRACT.get(c.get("match"), "needs_manual_review"),
        "userValue": c.get("user_value"),
        "requirement": c.get("requirement"),
        "sourceQuote": _clip(c.get("source_quote")),
    }
    if source_file:
        row["sourceFile"] = source_file
    ctrl = _control_for(c.get("item"))
    if ctrl:
        row["control"] = ctrl
    return row


def _build_groups(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """按 category_matches 分组（保持 KB 类目顺序），只收 门槛/红线/加分 三类板块。"""
    conds = [c for c in (result.get("condition_matches") or []) if isinstance(c, dict)]
    by_id = {c.get("id"): c for c in conds}
    cat_meta = result.get("category_matches") or {}
    source_file = _source_file_name(result)
    groups: List[Dict[str, Any]] = []
    for cat_key, meta in cat_meta.items():
        meta = meta or {}
        rows = []
        for cid in meta.get("ids") or []:
            c = by_id.get(cid)
            if not c or c.get("board") not in GROUP_BOARDS:
                continue
            rows.append(_row(c, source_file))
        if rows:
            groups.append({"id": f"group-{cat_key}", "label": meta.get("label", cat_key), "rows": rows})
    # 兜底：category_matches 缺失（理论不会发生）时按板块聚合，保证链路可渲染
    if not groups:
        for board in GROUP_BOARDS:
            rows = [_row(c, source_file) for c in conds if c.get("board") == board]
            if rows:
                groups.append({"id": f"group-{board}", "label": _BOARD_LABELS[board], "rows": rows})
    return groups


def _counts(groups: List[Dict[str, Any]]) -> Dict[str, int]:
    """按契约四态统计（与前端 summaryFromGroups 口径一致）。"""
    counts = {"met": 0, "missing_info": 0, "needs_manual_review": 0, "not_met": 0}
    for g in groups:
        for r in g["rows"]:
            m = r.get("match")
            if m in counts:
                counts[m] += 1
    return counts


def _veto_items(result: Dict[str, Any]) -> List[str]:
    return [t.get("item") for t in (result.get("triggered_vetoes") or []) if t.get("item")]


def _build_conclusion(result: Dict[str, Any], groups: List[Dict[str, Any]]) -> str:
    counts = _counts(groups)
    met, waiting = counts["met"], counts["missing_info"] + counts["needs_manual_review"]
    veto_items = _veto_items(result)
    if veto_items:
        return f"存在一票否决项：{'、'.join(veto_items)}，暂不具备申请资格。其余 {met} 项满足、{waiting} 项待确认。"
    if counts["not_met"]:
        return f"当前 {met} 项满足、{waiting} 项待确认、{counts['not_met']} 项未满足，建议针对未满足项改进后再申请。"
    if counts["missing_info"]:
        return f"当前 {met} 项满足、{waiting} 项待确认。建议补充缺失信息后重新分析。"
    if counts["needs_manual_review"]:
        return f"当前 {met} 项满足，另有 {counts['needs_manual_review']} 项需人工核实；初步符合申请条件。"
    return f"全部 {met} 项条件均已满足，初步符合申请条件。"


def _build_evidences(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """政策依据：按原文去重、最多 5 条（契约 §九）。"""
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for c in result.get("condition_matches") or []:
        if not isinstance(c, dict):
            continue
        q = (c.get("source_quote") or "").strip()
        if not q or q in seen:
            continue
        seen.add(q)
        out.append({
            "id": f"ev-{len(out) + 1}",
            "fileName": _file_name(result),
            "fileType": "pdf",
            "pageNum": 0,
            "quoteContent": _clip(q),
        })
        if len(out) >= EVIDENCE_LIMIT:
            break
    return out


def _build_risks(result: Dict[str, Any], groups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """风险/缺失：未满足逐条（一票否决优先），缺失信息/需核实各汇总一条。"""
    triggered_ids = {t.get("id") for t in (result.get("triggered_vetoes") or [])}
    by_id = {c.get("id"): c for c in (result.get("condition_matches") or []) if isinstance(c, dict)}
    veto_risks: List[Dict[str, Any]] = []
    other_risks: List[Dict[str, Any]] = []
    missing_items: List[str] = []
    review_items: List[str] = []
    for g in groups:
        for r in g["rows"]:
            if r["match"] == "not_met":
                detail = (by_id.get(r["id"]) or {}).get("detail") or f"未满足「{r.get('requirement') or r.get('item')}」"
                if r["id"] in triggered_ids:
                    veto_risks.append({"level": "high", "title": f"一票否决：{r['item']}", "description": detail})
                else:
                    other_risks.append({"level": "high", "title": f"未满足：{r['item']}", "description": detail})
            elif r["match"] == "missing_info":
                missing_items.append(r["item"])
            elif r["match"] == "needs_manual_review":
                review_items.append(r["item"])
    risks = veto_risks + other_risks
    if missing_items:
        risks.append({
            "level": "medium",
            "title": f"缺少信息（{len(missing_items)} 项）",
            "description": f"{'、'.join(missing_items)}。补充后可进一步判断。",
        })
    if review_items:
        risks.append({
            "level": "low",
            "title": f"需人工核实（{len(review_items)} 项）",
            "description": f"{'、'.join(review_items)}。请对照政策原文确认。",
        })
    return risks


def _build_suggestions(result: Dict[str, Any], groups: List[Dict[str, Any]]) -> List[str]:
    veto_items = _veto_items(result)
    not_met_items = [r["item"] for g in groups for r in g["rows"] if r["match"] == "not_met"]
    missing_items = [r["item"] for g in groups for r in g["rows"] if r["match"] == "missing_info"]
    review_items = [r["item"] for g in groups for r in g["rows"] if r["match"] == "needs_manual_review"]
    sug: List[str] = []
    if veto_items:
        sug.append(f"存在一票否决项（{'、'.join(veto_items)}），建议先核对政策原文并与学院确认后再考虑申请。")
    elif not_met_items:
        sug.append(f"当前不满足 {'、'.join(not_met_items[:3])}，可针对性地补充或提升后再尝试申请。")
    if missing_items:
        sug.append(f"请补充：{'、'.join(missing_items)}，以便更准确地评估符合情况。")
    if review_items:
        sug.append(f"以下项目需人工核实或确认：{'、'.join(review_items)}。")
    if not sug:
        sug.append("如需进一步确认，可提供更详细的个人信息或咨询相关部门。")
    return sug


def build_contract_view(result: Dict[str, Any]) -> Dict[str, Any]:
    """组装契约 v3 顶层字段（由 server 合并进 query_policy 输出，超集形态）。"""
    groups = _build_groups(result)
    verdict = result.get("overall_verdict", "")
    pv_name = _file_name(result)
    view: Dict[str, Any] = {
        "type": CONTRACT_TYPE,
        "toolName": TOOL_NAME,
        "status": "partial" if verdict in _PARTIAL_VERDICTS else "success",
        "summary": f"根据你当前提供的个人信息与{pv_name}进行逐项匹配分析，结果如下。",
        "conclusion": _build_conclusion(result, groups),
    }
    evidences = _build_evidences(result)
    if evidences:
        view["evidences"] = evidences
    risks = _build_risks(result, groups)
    if risks:
        view["risks"] = risks
    view["suggestions"] = _build_suggestions(result, groups)
    view["conditionGroups"] = groups
    view["policyVersionId"] = (result.get("policy_doc_id") or "").strip() or result.get("policy_title") or "pv-unknown"
    view["policyFileName"] = pv_name
    return view
