"""对比引擎：LLM 语义对比 + 规则降级

输入两篇政策文本 → 输出"政策对比模块-MCP接口契约 v1"的 changes 列表。

- 首选 LLM（DashScope）做语义对齐、变化类型判定与解读（aiExplanation）
- 无 key / 调用失败 / JSON 解析失败 → 自动降级为本地规则对齐（difflib）
- 两条路径的结果都会经过同一套契约校验：字段裁剪（content≤500、解读≤100、上下文≤2条）、
  变化数量≤20、changeId 重编、summary 由代码计算（不信任模型统计）
"""

import logging
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from config import Config

logger = logging.getLogger(__name__)

# ============================================================
# 条款切分（规则降级用）
# ============================================================

# 行首装饰（markdown 井号 / 加粗星号）可选，便于兼容 .md 与 PDF 转文本的标题样式
_MD_LEAD = r"^[#*\s]*"

_HEADER_PATTERNS = [
    re.compile(_MD_LEAD + r"第[一二三四五六七八九十百零〇0-9]+条"),
    re.compile(_MD_LEAD + r"第[一二三四五六七八九十百零〇0-9]+章"),
    re.compile(_MD_LEAD + r"[一二三四五六七八九十]+、"),
    re.compile(_MD_LEAD + r"（[一二三四五六七八九十0-9]{1,3}）"),
    re.compile(_MD_LEAD + r"\([0-9]{1,3}\)"),
    re.compile(_MD_LEAD + r"\d{1,2}\s*[、.．]"),
]


def _is_header(line: str) -> bool:
    return any(p.match(line) for p in _HEADER_PATTERNS)


def split_clauses(text: str) -> List[Dict[str, str]]:
    """把政策全文切成条款单元：{title, content}"""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    segments: List[List[str]] = []
    current: Optional[List[str]] = None
    for line in lines:
        if _is_header(line):
            if current:
                segments.append(current)
            current = [line]
        else:
            if current is None:
                current = [line]
            else:
                current.append(line)
    if current:
        segments.append(current)

    # 条款头太少 → 退回按空行分段
    from_headers = True
    if len(segments) < 3:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        if len(paragraphs) > len(segments):
            segments = [[p] for p in paragraphs]
            from_headers = False

    # 编号结构成立时，首个无编号段落是题名/文头（不含条款），不参与对比，
    # 避免“（2024版）→（2025版）”之类题名变化被当成条款修改
    if from_headers and len(segments) >= 2 and not _is_header(segments[0][0]):
        segments = segments[1:]

    clauses = []
    for seg in segments:
        content = "\n".join(seg)
        clauses.append({"title": seg[0][:60], "content": content})
    return clauses


# 编号/标题前缀（第X条、一、、（一）、(1)、1. 及 markdown 井号）
_ENUM_PREFIX = re.compile(
    r"^[#*\s]*(?:第[一二三四五六七八九十百零0-9]+[条章节]|[一二三四五六七八九十]+、|（[一二三四五六七八九十0-9]+）|\([0-9]+\)|[0-9]+[.、])"
)


def _norm_clause(clause: Dict[str, str]) -> str:
    """条款归一化（用于对齐比较；剥离编号前缀，避免“仅条号平移”被误判为修改）"""
    text = _ENUM_PREFIX.sub("", (clause.get("content") or "").strip())
    return re.sub(r"[\s《》〈〉“”\"'‘’（）()【】\[\]、，。,.：:；;！!？?—－\-_·/\\|~]+", "", text).lower()


def _ctx_item(clause: Dict[str, str]) -> str:
    return _clip(clause.get("content") or "", Config.MAX_CONTEXT_ITEM_CHARS)


def _clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


# ============================================================
# 规则对比（difflib 降级路径）
# ============================================================


def rule_compare(old_text: str, new_text: str) -> List[Dict[str, Any]]:
    """基于条款单元的 LCS 对齐：modified / added / removed"""
    old_clauses = split_clauses(old_text)
    new_clauses = split_clauses(new_text)
    old_keys = [_norm_clause(c) for c in old_clauses]
    new_keys = [_norm_clause(c) for c in new_clauses]

    matcher = SequenceMatcher(None, old_keys, new_keys, autojunk=False)
    changes: List[Dict[str, Any]] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "replace":
            pairs = min(i2 - i1, j2 - j1)
            for k in range(pairs):
                changes.append(_mk_rule_change("modified", old_clauses, new_clauses, i1 + k, j1 + k))
            for k in range(pairs, i2 - i1):
                changes.append(_mk_rule_change("removed", old_clauses, new_clauses, i1 + k, -1))
            for k in range(pairs, j2 - j1):
                changes.append(_mk_rule_change("added", old_clauses, new_clauses, -1, j1 + k))
        elif tag == "delete":
            for k in range(i1, i2):
                changes.append(_mk_rule_change("removed", old_clauses, new_clauses, k, -1))
        elif tag == "insert":
            for k in range(j1, j2):
                changes.append(_mk_rule_change("added", old_clauses, new_clauses, -1, k))
    return changes


def _mk_rule_change(
    change_type: str,
    old_clauses: List[Dict[str, str]],
    new_clauses: List[Dict[str, str]],
    old_idx: int,
    new_idx: int,
) -> Dict[str, Any]:
    """组装一条规则对比变化（含上下文）"""
    old_side = old_clauses[old_idx] if old_idx >= 0 else None
    new_side = new_clauses[new_idx] if new_idx >= 0 else None

    # context.before：变化前的上下文（modified/removed 取旧版；added 取新版）
    # context.after ：变化后的上下文（modified/added 取新版；removed 取旧版）
    before_src = old_clauses if change_type in ("modified", "removed") else new_clauses
    after_src = new_clauses if change_type in ("modified", "added") else old_clauses
    before_anchor = old_idx if change_type in ("modified", "removed") else new_idx
    after_anchor = new_idx if change_type in ("modified", "added") else old_idx

    before = [_ctx_item(before_src[i]) for i in range(max(0, before_anchor - Config.MAX_CONTEXT_ITEMS), before_anchor)]
    after = [
        _ctx_item(after_src[i])
        for i in range(after_anchor + 1, min(len(after_src), after_anchor + 1 + Config.MAX_CONTEXT_ITEMS))
    ]

    return {
        "type": change_type,
        "old": {"section": old_side["title"], "content": old_side["content"]} if old_side else None,
        "new": {"section": new_side["title"], "content": new_side["content"]} if new_side else None,
        "context": {"before": before, "after": after},
    }


# ============================================================
# LLM 对比
# ============================================================

_SYSTEM_PROMPT = (
    "你是高校政策文件对比专家。用户会给你同一份政策文件的两个版本（旧版、新版）全文，"
    "你需要找出所有有实质意义的条款变化（修改/新增/删除），并以严格 JSON 返回。"
    "只对比实质内容：数值门槛、资格条件、材料流程、奖惩措施等；忽略纯排版、标点、编号样式差异。"
)

_USER_PROMPT_TEMPLATE = """请对比以下两个版本的政策文件，找出所有实质性条款变化。

【旧政策】{old_name}（{old_version}）全文：
{old_text}

【新政策】{new_name}（{new_version}）全文：
{new_text}

输出要求（严格遵守）：
1. 只输出一个 JSON 对象：{{"changes": [...]}}，不要输出任何解释文字或 markdown。
2. 每条变化包含字段：
   - type: "modified" | "added" | "removed"
   - old: {{"section": "条款标题", "content": "条款原文"}}，modified/removed 必填，added 为 null
   - new: {{"section": "条款标题", "content": "条款原文"}}，modified/added 必填，removed 为 null
   - context: {{"before": ["变化前1-2条上下文条款原文"], "after": ["变化后1-2条上下文条款原文"]}}（可省略）
   - aiExplanation: "一句话说明变化影响，不超过100字"
3. content 必须是条款原文（≤500字）；section 为条款标题（如"第五条 学习成绩要求"）。
4. 变化总数不超过 20 条，优先保留最重要的变化。
5. 若确实没有实质性变化，返回 {{"changes": []}}。
"""


def _cap_text(text: str) -> str:
    if len(text) <= Config.MAX_TEXT_CHARS:
        return text
    logger.warning(f"文本超过 {Config.MAX_TEXT_CHARS} 字符，已截断（原长 {len(text)}）")
    return text[: Config.MAX_TEXT_CHARS] + "\n\n（注：文本过长，已截断）"


def llm_compare(old_doc: Dict[str, Any], new_doc: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """LLM 语义对比；失败返回 None（由上层降级到规则对比）"""
    from llm_client import LLMClient

    user_prompt = _USER_PROMPT_TEMPLATE.format(
        old_name=old_doc.get("name") or "旧政策",
        old_version=old_doc.get("version") or "旧版",
        old_text=_cap_text(old_doc.get("text") or ""),
        new_name=new_doc.get("name") or "新政策",
        new_version=new_doc.get("version") or "新版",
        new_text=_cap_text(new_doc.get("text") or ""),
    )
    # 不重试：单次超时即可降级规则对比，需控制在前端 30s 轮询预算内
    result = LLMClient().extract_json(_SYSTEM_PROMPT, user_prompt, max_retries=0)
    if not result.get("success"):
        logger.warning(f"LLM 对比失败: {str(result.get('content'))[:200]}")
        return None

    data = result.get("data")
    raw_changes = data.get("changes") if isinstance(data, dict) else data
    if not isinstance(raw_changes, list):
        logger.warning("LLM 返回结构中没有 changes 数组")
        return None
    return raw_changes


# ============================================================
# 契约校验 / 裁剪（LLM 与规则两条路径共用）
# ============================================================

_TYPE_ALIASES = {
    "modified": "modified",
    "modify": "modified",
    "change": "modified",
    "修改": "modified",
    "added": "added",
    "add": "added",
    "insert": "added",
    "新增": "added",
    "removed": "removed",
    "remove": "removed",
    "delete": "removed",
    "deleted": "removed",
    "删除": "removed",
}


def _to_content(obj: Any) -> Optional[Dict[str, str]]:
    if not isinstance(obj, dict):
        return None
    section = _clip(str(obj.get("section") or ""), 120)
    content = _clip(str(obj.get("content") or ""), Config.MAX_CONTENT_CHARS)
    if not section and not content:
        return None
    return {"section": section, "content": content}


def _str_list(value: Any, limit: int) -> List[str]:
    if not isinstance(value, list):
        return []
    return [_clip(str(v), Config.MAX_CONTEXT_ITEM_CHARS) for v in value[:limit] if str(v).strip()]


def sanitize_changes(raw_changes: List[Any]) -> List[Dict[str, Any]]:
    """把任意来源的变化列表规整成契约结构：类型校准、字段裁剪、去重、限流、重编 changeId"""
    cleaned: List[Dict[str, Any]] = []

    for raw in raw_changes or []:
        if not isinstance(raw, dict):
            continue
        type_raw = str(raw.get("type") or "").strip().lower()
        change_type = _TYPE_ALIASES.get(type_raw)

        old = _to_content(raw.get("old"))
        new = _to_content(raw.get("new"))

        if change_type is None:
            if old and new:
                change_type = "modified"
            elif new:
                change_type = "added"
            elif old:
                change_type = "removed"
            else:
                continue

        # 类型与两侧内容校准
        if change_type == "modified":
            if old and not new:
                change_type = "removed"
            elif new and not old:
                change_type = "added"
            elif not old and not new:
                continue
            elif _norm_text(old["content"]) == _norm_text(new["content"]) and _norm_text(old["section"]) == _norm_text(new["section"]):
                continue  # 两侧实质一致，视为噪声
        if change_type == "added":
            if not new:
                continue
            old = None
        if change_type == "removed":
            if not old:
                continue
            new = None

        context_raw = raw.get("context") if isinstance(raw.get("context"), dict) else {}
        before = _str_list(context_raw.get("before"), Config.MAX_CONTEXT_ITEMS)
        after = _str_list(context_raw.get("after"), Config.MAX_CONTEXT_ITEMS)
        context = {}
        if before:
            context["before"] = before
        if after:
            context["after"] = after

        explanation = _clip(str(raw.get("aiExplanation") or ""), Config.MAX_EXPLANATION_CHARS)

        item: Dict[str, Any] = {"type": change_type, "old": old, "new": new}
        if context:
            item["context"] = context
        if explanation:
            item["aiExplanation"] = explanation
        cleaned.append(item)

    # 去重（同类型 + 同内容）
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for item in cleaned:
        key = (
            item["type"],
            (item["old"] or {}).get("content", ""),
            (item["new"] or {}).get("content", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    # 限流
    if len(deduped) > Config.MAX_CHANGES:
        logger.warning(f"变化数量 {len(deduped)} 超过 {Config.MAX_CHANGES}，截取前 {Config.MAX_CHANGES} 条")
        deduped = deduped[: Config.MAX_CHANGES]

    # 重编 changeId（前端左右联动依赖稳定编号）
    result = []
    for idx, item in enumerate(deduped, 1):
        ordered = {"changeId": f"change-{idx:03d}", "type": item["type"], "old": item["old"], "new": item["new"]}
        if "context" in item:
            ordered["context"] = item["context"]
        if "aiExplanation" in item:
            ordered["aiExplanation"] = item["aiExplanation"]
        result.append(ordered)
    return result


def _norm_text(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


# ============================================================
# 对外入口
# ============================================================


def _strip_version_marks(name: str) -> str:
    """去掉名称中的版本标记，用于推断文档名"""
    name = re.sub(r"[（(][^）)]*20\d{2}[^）)]*[）)]", "", name or "")
    name = re.sub(r"20\d{2}\s*年?\s*(修订版?|修订稿|版)?", "", name)
    name = re.sub(r"[（(](修订版?|修订稿|试行版?|征求意见稿)[）)]", "", name)
    return name.strip(" -_·—")


def _common_name(old_name: str, new_name: str) -> str:
    a = _strip_version_marks(old_name) or old_name or "政策文件"
    b = _strip_version_marks(new_name) or new_name or "政策文件"
    na, nb = _norm_text(a).lower(), _norm_text(b).lower()
    if na == nb:
        return a
    if na and na in nb:
        return a
    if nb and nb in na:
        return b
    return a


def compare_policies(old_doc: Dict[str, Any], new_doc: Dict[str, Any], overrides: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    对比两个版本文档，返回契约 v1 的 PolicyDiffResult。

    Args:
        old_doc/new_doc: doc_loader.resolve_document 的返回值
        overrides: 可选覆盖 {document_name, old_version, new_version}
    """
    overrides = overrides or {}
    document = {
        "name": overrides.get("document_name") or _common_name(old_doc.get("name") or "", new_doc.get("name") or ""),
        "oldVersion": overrides.get("old_version") or old_doc.get("version") or "旧版",
        "newVersion": overrides.get("new_version") or new_doc.get("version") or "新版",
    }

    changes: Optional[List[Dict[str, Any]]] = None
    engine = "rule"

    if not Config.LLM_DISABLED and Config.DASHSCOPE_API_KEY:
        try:
            raw_changes = llm_compare(old_doc, new_doc)
            if raw_changes is not None:
                changes = sanitize_changes(raw_changes)
                engine = "llm"
                logger.info(f"LLM 对比完成，变化数: {len(changes)}")
                if not changes:
                    # LLM 没检出变化时用规则交叉验证，避免漏报
                    rule_changes = sanitize_changes(rule_compare(old_doc.get("text") or "", new_doc.get("text") or ""))
                    if rule_changes:
                        logger.warning(f"LLM 未检出变化但规则检出 {len(rule_changes)} 条，采用规则结果")
                        changes = rule_changes
                        engine = "rule(fallback)"
            else:
                logger.warning("LLM 对比失败，降级规则对比")
        except Exception as e:
            logger.error(f"LLM 对比异常，降级规则对比: {type(e).__name__}: {e}")
    else:
        reason = "已禁用 LLM" if Config.LLM_DISABLED else "未配置 DASHSCOPE_API_KEY"
        logger.info(f"{reason}，直接使用规则对比")

    if changes is None:
        changes = sanitize_changes(rule_compare(old_doc.get("text") or "", new_doc.get("text") or ""))
        engine = "rule"
        logger.info(f"规则对比完成，变化数: {len(changes)}")

    summary = {
        "total": len(changes),
        "modified": sum(1 for c in changes if c["type"] == "modified"),
        "added": sum(1 for c in changes if c["type"] == "added"),
        "removed": sum(1 for c in changes if c["type"] == "removed"),
    }
    logger.info(f"对比结果: engine={engine}, summary={summary}")
    return {"document": document, "summary": summary, "changes": changes, "engine": engine}
