"""条件匹配模块 - 将用户信息与政策条件逐条匹配"""

import logging
import re
from typing import Any, Dict, List, Optional, Set
from config import Config

# 日志输出到 stderr
logger = logging.getLogger(__name__)


# 条件单位 → user_info 字段映射
UNIT_FIELD_MAP = {
    "GPA": "gpa",
    "绩点": "gpa",
    "分": None,  # 需根据 item 判断
    "%": None,  # 需根据 item 判断
    "篇": None,  # 论文数量
    "项": None,  # 竞赛数量
}


# 学生口语申报 → 条文用词的同义扩展表：
# 条文里可能写"不及格/补考"，但用户（或 agent）申报时说的是"挂科"。
# 仅用于"一票否决申报"的宽松匹配，命中即视为申报了该否决项。
VETO_SYNONYMS = {
    "挂科": ("不及格", "补考", "不合格"),
    "不及格": ("挂科", "补考"),
    "补考": ("不及格", "挂科"),
    "处分": ("记过", "违纪", "留校察看", "通报批评", "警告"),
    "违纪": ("处分", "违规", "通报批评"),
    "违规": ("违纪", "处分"),
    "作弊": ("学术不端", "弄虚作假", "造假", "抄袭"),
    "学术不端": ("作弊", "抄袭", "造假", "弄虚作假", "冒名"),
    "抄袭": ("学术不端", "作弊", "造假", "弄虚作假", "冒名"),
    "弄虚作假": ("造假", "作弊", "学术不端", "抄袭"),
    "造假": ("弄虚作假", "作弊", "学术不端", "抄袭"),
    # ---- 英文/程序化键名（agent 常以 snake_case 申报）→ 中文条文用词 ----
    "disciplinary_action": ("违纪", "处分"),
    "has_disciplinary_action": ("违纪", "处分"),
    "has_disciplinary": ("违纪", "处分"),
    "disciplinary": ("违纪", "处分"),
    "punishment": ("处分", "违纪"),
    "has_violation": ("违纪", "违规"),
    "violation": ("违纪", "违规"),
    "violated": ("违纪", "违规"),
    "cheating": ("作弊", "学术不端"),
    "misconduct": ("学术不端", "作弊"),
    "academic_misconduct": ("学术不端", "作弊"),
    "plagiarism": ("抄袭", "学术不端"),
    "fabrication": ("造假", "弄虚作假", "学术不端"),
    "failed_course": ("挂科", "不及格"),
    "failed_courses": ("挂科", "不及格"),
    "failed_subject": ("挂科", "不及格"),
}

# 否决项语义分组：用户申报的键/词命中某组，即视为触发该组对应的全部条文措辞。
# 用于打穿"申报用词"与"条文用词"之间的表述隔阂（如 failed_courses=2 → 无不及格课程条款）。
_VETO_GROUPS = {
    "fail": ("挂科", "不及格", "补考", "重修", "不合格"),
    "discipline": ("处分", "违纪", "违规", "处罚", "记过", "警告", "通报批评", "留校察看"),
    "misconduct": ("作弊", "学术不端", "抄袭", "造假", "弄虚作假", "冒名"),
}

_VETO_KEY_RE = re.compile(
    r"discipl|violat|punish|cheat|plagiar|fabricat|misconduct|misbehav|fail|"
    r"挂科|补考|重修|违纪|违规|处分|处罚|作弊|抄袭|造假|学术不端|记过|留校察看",
    re.IGNORECASE,
)

_VETO_NEGATION_RE = re.compile(r"^(无|没有|从未|未曾|不曾|未|不存在)")

# 前缀归一：把"曾有/受过/有过"等申报口吻剥掉，还原成条文用词再匹配
_VETO_PREFIX_RE = re.compile(r"^(曾被|曾经|曾|受过|受|有过|有|存在|被判)")

# 视为"否"的取值（declared_vetoes 的 dict value / answers 的 value 常见写法）
_FALSY_VALUES = frozenset({
    "", "否", "无", "没有", "不是", "未", "未曾", "从未", "无此情况",
    "false", "no", "none", "null", "0", "clear", "未触发", "未发生", "不存在",
})


def _is_truthy(v: Any) -> bool:
    """宽松真值判断：兼容 bool / 数字 / 中英文肯定否定字符串 / 非空集合。"""
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v.strip().lower() not in _FALSY_VALUES
    if isinstance(v, (list, tuple, set, dict)):
        return len(v) > 0
    return bool(v)


def _to_number(v: Any) -> Optional[float]:
    """从任意值中提取数值：数字原样；字符串提取首个数字（"90分"→90.0）。"""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.search(r"-?\d+(?:\.\d+)?", v.replace(",", ""))
        if m:
            return float(m.group())
    return None


def _fmt_number(v: float) -> str:
    """数值展示：整数值去掉小数点（90.0 → "90"）。"""
    return str(int(v)) if float(v).is_integer() else str(v)


def _veto_group(text: str) -> Optional[str]:
    """把否决相关词/键归入语义组（fail/discipline/misconduct），无则 None。"""
    t = str(text).lower()
    if re.search(r"fail|挂科|补考|重修|不及格|不合格", t):
        return "fail"
    if re.search(r"discipl|violat|punish|misbehav|违纪|违规|处分|处罚", t):
        return "discipline"
    if re.search(r"cheat|plagiar|fabricat|misconduct|作弊|抄袭|造假|学术不端", t):
        return "misconduct"
    return None


def _iter_number_fields(src: Dict[str, Any]):
    """遍历字典中的数值字段（支持一层嵌套，键名按 a.b 拼接）。

    yield (字段名, 数值, 原始值)；数字、数字字符串（"90"）、带单位文本（"90分"）均可提取。
    """
    for key, val in (src or {}).items():
        if isinstance(val, dict):
            for sub_key, sub_val in val.items():
                num = _to_number(sub_val)
                if num is not None:
                    yield f"{key}.{sub_key}", num, sub_val
        else:
            num = _to_number(val)
            if num is not None:
                yield str(key), num, val


# 流程性要求类目：查询响应中整体剔除，不进任何板块（前端对任何未知 board 值都会兜底
# 渲染到"其他"栏，因此不能靠改 board 值规避，必须不进入 condition_matches / 分组索引 /
# 判定统计等所有列表）。剔除项以精简索引形式留档到 procedural_notes（前端不消费）。
EXCLUDED_CATEGORIES = frozenset({"procedural"})


class PolicyMatcher:
    """政策条件匹配器"""

    # 概念识别表：把"条件措辞"与"用户字段名"映射到同一概念（跨中英文键名对齐取值）。
    # 注意：平均成绩与 GPA 是不同量纲，故意不共享概念；排名单独成概念防止被当分数使用。
    _CONCEPT_PATTERNS = {
        "gpa": (r"\bgpa\b|绩点",),
        "average_score": (r"平均成绩|平均分|均分|课程成绩|成绩均|average[_ ]?score|avg[_ ]?score",),
        "rank_percent": (r"排名|rank",),
        "cet4": (r"cet[ -]?4|四级",),
        "cet6": (r"cet[ -]?6|六级",),
        "toefl": (r"toefl|托福",),
        "ielts": (r"ielts|雅思",),
        "volunteer_hours": (r"志愿|义工|volunteer",),
        "social_practice": (r"社会实践|practice",),
        "training_hours": (r"培训|实训|学时|training",),
        "age": (r"年龄|age",),
        "work_years": (r"工作年限|工作经历|工作经验|work[_ ]?(?:year|experience)",),
        "publications": (r"论文|paper|publication",),
        "competitions": (r"竞赛|competition|获奖",),
    }

    @classmethod
    def _concepts_of(cls, text: str) -> Set[str]:
        """文本命中的概念集合。"""
        t = str(text).lower()
        return {
            name for name, pats in cls._CONCEPT_PATTERNS.items()
            if any(re.search(p, t) for p in pats)
        }

    def __init__(self):
        """初始化匹配器"""
        logger.info("PolicyMatcher 初始化完成")

    def _veto_declared(self, condition: Dict[str, Any], user_info: Dict[str, Any]) -> bool:
        """判断某条一票否决是否被用户申报触发。
        兼容多种入参：
          user_info['declared_vetoes']: List[str]（条件 id / item 关键词 / 口语说法）
                                       或 Dict{id|item|事实词: bool|中英文真值}
          user_info['answers']: List[{id, value}]，value 为真值视为触发
          user_info 顶层 / extra 中的否决字段（如 disciplinary_action=true）自动识别
        关键词匹配覆盖 item/description/requirement/source_quote，做口语同义扩展
        （挂科≈不及格/补考）与语义分组（failed_courses=2 → 无不及格课程条款），
        避免条文措辞或申报语言变化导致申报失效。
        """
        cid = condition.get("id")
        item = condition.get("item", "") or ""
        text = "".join(
            str(condition.get(k, "") or "")
            for k in ("item", "description", "requirement", "source_quote")
        )

        def hit(tk: str) -> bool:
            """某申报词是否命中本否决条件（id 精确 / 词形包含 / 同义扩展 / 语义分组）。"""
            tk = str(tk).strip()
            if not tk:
                return False
            if tk == cid:
                return True
            if len(tk) < 2:  # 单字符不做子串匹配，防误伤
                return False
            if item and (tk in item or item in tk):
                return True
            candidates = (tk, *VETO_SYNONYMS.get(tk, ()))
            if any(cd in text for cd in candidates):
                return True
            grp = _veto_group(tk)
            return bool(grp) and any(kw in text for kw in _VETO_GROUPS[grp])

        def normalize(tk: str) -> str:
            """剥掉"曾有/受过"等申报口吻前缀，还原条文用词（曾受处分 → 处分）。"""
            tk = str(tk).strip()
            for _ in range(3):
                stripped = _VETO_PREFIX_RE.sub("", tk, count=1)
                if stripped == tk:
                    break
                tk = stripped
            return tk

        # 1) declared_vetoes（列表或字典）
        declared = user_info.get("declared_vetoes") or []
        if isinstance(declared, dict):
            if _is_truthy(declared.get(cid)) or _is_truthy(declared.get(item)):
                return True
            tokens = [
                str(k) for k, v in declared.items()
                if _is_truthy(v) and not _VETO_NEGATION_RE.match(str(k).strip())
            ]
        elif isinstance(declared, (list, tuple, set)):
            tokens = [str(x) for x in declared]
        else:
            tokens = [str(declared)] if str(declared).strip() else []
        for raw in tokens:
            if _VETO_NEGATION_RE.match(raw.strip()):  # "无处分"这类否定申报=未发生
                continue
            if hit(raw) or hit(normalize(raw)):
                return True

        # 2) answers（前端清单回填：按条件 id / item 命中）
        for ans in user_info.get("answers", []) or []:
            if not isinstance(ans, dict):
                continue
            aid = str(ans.get("id") or "").strip()
            if _is_truthy(ans.get("value")) and aid and (aid == str(cid) or (item and aid == item)):
                return True

        # 3) 顶层 / extra 否决字段扫描（disciplinary_action=true、failed_courses=2 等）
        for src in (user_info, user_info.get("extra") or {}):
            if not isinstance(src, dict):
                continue
            for key, val in src.items():
                k = str(key)
                if k in ("declared_vetoes", "answers", "extra", "papers", "competitions", "english"):
                    continue
                if not _VETO_KEY_RE.search(k):
                    continue
                if not _is_truthy(val):
                    continue
                if hit(k) or hit(normalize(k)):
                    return True

        return False

    def _get_user_value(
        self,
        user_info: Dict[str, Any],
        unit: str,
        item: str,
        condition: Optional[Dict[str, Any]] = None,
    ) -> Optional[float]:
        """
        从 user_info 中提取条件所需的数值。

        取值优先级：
          1. answers（前端清单按条件 id / item 回填的答案）
          2. 标准字段（gpa / gpa_rank_percent / english{cet4,cet6} / 托福雅思）
          3. 概念对齐（条件措辞与用户字段名映射到同一概念，跨中英文键名）
          4. extra 键名与 item 子串互含的旧版兜底
          5. "平均成绩"类条件的 gpa 百分制回退（gpa ≥ 20 视为百分制分数）

        数字、数字字符串（"90"）与带单位文本（"90分"）均可识别。
        """
        extra = user_info.get("extra") or {}
        if not isinstance(extra, dict):
            extra = {}
        cid = condition.get("id") if isinstance(condition, dict) else None
        item_concepts = self._concepts_of(item)

        # 1) answers：按条件 id / item 精确命中
        for ans in user_info.get("answers", []) or []:
            if not isinstance(ans, dict):
                continue
            aid = str(ans.get("id") or "").strip()
            if aid and (aid == str(cid) or (item and aid == item)):
                num = _to_number(ans.get("value"))
                if num is not None:
                    return num

        # 2) 标准字段
        if unit in ("GPA", "绩点"):
            num = _to_number(user_info.get("gpa"))
            if num is not None:
                return num
        if unit == "%" or "排名" in item or "rank" in item.lower():
            num = _to_number(user_info.get("gpa_rank_percent"))
            if num is not None:
                return num
        if "英语" in item or "CET" in item.upper():
            eng = user_info.get("english") or {}
            cet4 = _to_number(eng.get("cet4"))
            cet6 = _to_number(eng.get("cet6"))
            # "CET4/6"这类组合条目：四级或六级任一达标即可 → 取两者更高分参与比较
            if "4/6" in item or "四六级" in item or ("四级" in item and "六级" in item):
                vals = [v for v in (cet4, cet6) if v is not None]
                if vals:
                    return max(vals)
            if "六级" in item or "cet6" in item.lower():
                if cet6 is not None:
                    return cet6
            if "四级" in item or "cet4" in item.lower():
                if cet4 is not None:
                    return cet4
            # 泛指英语成绩：优先四级，缺失时退回六级
            return cet4 if cet4 is not None else cet6
        if "TOEFL" in item.upper() or "托福" in item:
            for key in ("toefl", "TOEFL", "托福"):
                num = _to_number(extra.get(key))
                if num is not None:
                    return num
        if "IELTS" in item.upper() or "雅思" in item:
            for key in ("ielts", "IELTS", "雅思"):
                num = _to_number(extra.get(key))
                if num is not None:
                    return num

        # 3) 概念对齐：条件 item 与用户键名都命中同一概念即可取值
        #    （如 item "志愿服务时长" ← extra {"volunteer_hours": 25} / {"志愿服务": "25小时"}）
        if item_concepts:
            for source in (user_info, extra):
                if not isinstance(source, dict):
                    continue
                for key, num, _raw in _iter_number_fields(source):
                    if key in ("year", "school"):
                        continue
                    key_concepts = self._concepts_of(key)
                    if not (key_concepts & item_concepts):
                        continue
                    # 排名值不是分数值，不为其他概念代用（防 gpa_rank_percent 被当成绩）
                    if "rank_percent" in key_concepts and "rank_percent" not in item_concepts:
                        continue
                    return num

        # 4) 旧版兜底：extra 键名与 item 子串互含
        for key, val in extra.items():
            if val is None or isinstance(val, (dict, list, bool)):
                continue
            if str(key).lower() in item.lower() or item.lower() in str(key).lower():
                num = _to_number(val)
                if num is not None:
                    return num

        # 5) "平均成绩"类条件：用户只填了 gpa 且数值为百分制（≥20）时直接采用
        if "average_score" in item_concepts or unit == "分":
            gpa = _to_number(user_info.get("gpa"))
            if gpa is not None and gpa >= 20:
                return gpa

        return None

    def _check_papers(self, user_info: Dict[str, Any], condition: Dict[str, Any]) -> Dict[str, Any]:
        """检查论文相关条件"""
        papers = user_info.get("papers", [])
        cond_type = condition.get("type", "")
        cond_item = condition.get("item", "").lower()

        # 尝试从 condition 中提取论文要求
        required_type = None
        required_order = None
        required_count = condition.get("value")

        if "sci" in cond_item:
            required_type = "SCI"
        elif "ei" in cond_item:
            required_type = "EI"
        elif "核心" in cond_item:
            required_type = "核心"
        elif "一作" in cond_item or "第一作者" in cond_item:
            required_order = 1

        matched_papers = []
        for paper in papers:
            paper_type = paper.get("type", "")
            paper_order = paper.get("author_order", 999)
            paper_count = paper.get("count", 1)

            type_match = (required_type is None) or (required_type.upper() in paper_type.upper())
            order_match = (required_order is None) or (paper_order <= required_order)

            if type_match and order_match:
                matched_papers.append(paper)

        total_count = sum(p.get("count", 1) for p in matched_papers)

        if required_count is not None:
            if total_count >= required_count:
                return {"match": "met", "detail": f"用户有 {total_count} 篇符合条件的论文"}
            else:
                return {"match": "not_met", "detail": f"用户有 {total_count} 篇，要求 {required_count} 篇"}

        if matched_papers:
            return {"match": "met", "detail": f"用户有 {len(matched_papers)} 篇相关论文"}
        return {"match": "not_met", "detail": "用户无相关论文"}

    def _check_competitions(self, user_info: Dict[str, Any], condition: Dict[str, Any]) -> Dict[str, Any]:
        """检查竞赛相关条件"""
        competitions = user_info.get("competitions", [])
        cond_item = condition.get("item", "").lower()

        required_level = None
        if "国家" in cond_item or "national" in cond_item:
            required_level = "national"
        elif "省" in cond_item or "provincial" in cond_item:
            required_level = "provincial"
        elif "校" in cond_item or "school" in cond_item:
            required_level = "school"

        required_award = None
        if "一等" in cond_item:
            required_award = "一等奖"
        elif "二等" in cond_item:
            required_award = "二等奖"
        elif "三等" in cond_item:
            required_award = "三等奖"

        matched = []
        for comp in competitions:
            comp_level = comp.get("level", "")
            comp_award = comp.get("award", "")

            level_match = (required_level is None) or (required_level in comp_level.lower())
            award_match = (required_award is None) or (required_award in comp_award)

            if level_match and award_match:
                matched.append(comp)

        if matched:
            return {"match": "met", "detail": f"用户有 {len(matched)} 项符合条件的竞赛"}
        return {"match": "not_met", "detail": "用户无符合条件的竞赛"}

    def match_condition(self, user_info: Dict[str, Any], condition: Dict[str, Any]) -> Dict[str, Any]:
        """
        匹配单个条件

        Returns:
            {
                "item": "条件名称",
                "match": "met" | "not_met" | "missing_info" | "needs_manual_review"
                         | "optional" | "informational" | "violated" | "clear",
                "user_value": "用户实际值",
                "requirement": "政策要求",
                "detail": "匹配详情",
                "source_quote": "原文引用"
            }
        """
        cond_type = condition.get("type", "hard")
        item = condition.get("item", "")
        requirement = condition.get("requirement", "")
        operator = condition.get("operator", "")
        value = condition.get("value")
        unit = condition.get("unit", "")
        source_quote = condition.get("source_quote", "")

        result = {
            "item": item,
            "requirement": requirement,
            "source_quote": source_quote,
            "id": condition.get("id"),
            "board": condition.get("board"),
            "input_kind": condition.get("input_kind"),
            "requires_evidence": condition.get("requires_evidence"),
            # 阈值三件套透传：前端做本地即时校验/提示时无需再解析中文文案
            "operator": operator,
            "value": value,
            "unit": unit,
        }

        # === 一票否决：短路语义，由用户申报决定，不走数值比较 ===
        if condition.get("board") == "veto":
            violated = self._veto_declared(condition, user_info)
            result.update({
                "match": "violated" if violated else "clear",
                "user_value": "已触发" if violated else "未触发",
                "detail": (f"触发一票否决：{requirement or item}" if violated else "未触发否决项"),
            })
            return result

        # === 其他·须知：仅展示，不参与合格判定 ===
        if condition.get("board") == "other":
            result.update({
                "match": "informational",
                "user_value": "—",
                "detail": "不可量化条款，仅供知悉",
            })
            return result

        # === 加分项：可选，不计入门槛完整性（不产生 missing_info / not_met）===
        # 是否加分由用户提交材料 + 细则附件终判；前端按 evidence 统计"提供情况"
        if condition.get("board") == "bonus":
            result.update({
                "match": "optional",
                "user_value": "—",
                "detail": "加分项：不计入门槛，按提交材料由细则终判",
            })
            return result

        # === 硬性门槛 ===
        if cond_type == "hard":
            user_val = self._get_user_value(user_info, unit, item, condition)

            # 特殊处理：论文和竞赛
            if unit == "篇" or "论文" in item.lower():
                paper_result = self._check_papers(user_info, condition)
                result.update({"match": paper_result["match"], "user_value": paper_result["detail"]})
                return result

            if unit == "项" or "竞赛" in item.lower():
                comp_result = self._check_competitions(user_info, condition)
                result.update({"match": comp_result["match"], "user_value": comp_result["detail"]})
                return result

            if user_val is None:
                result.update({"match": "missing_info", "user_value": "未提供", "detail": f"缺少 {unit or item} 信息"})
                return result

            result["user_value"] = _fmt_number(user_val)

            # 比较
            try:
                if operator == ">=" and user_val >= value:
                    result["match"] = "met"
                elif operator == "<=" and user_val <= value:
                    result["match"] = "met"
                elif operator == ">" and user_val > value:
                    result["match"] = "met"
                elif operator == "<" and user_val < value:
                    result["match"] = "met"
                elif operator == "==" and user_val == value:
                    result["match"] = "met"
                elif operator == "none" or not operator:
                    result["match"] = "met"  # 无法比较，默认通过
                else:
                    result["match"] = "not_met"
            except (TypeError, ValueError):
                result["match"] = "not_met"

            if result.get("match") != "met":
                result["detail"] = f"要求 {requirement}，用户值为 {user_val}"
            else:
                result["detail"] = f"满足 {requirement}"

            return result

        # === 评分项 ===
        elif cond_type == "scoring":
            user_val = self._get_user_value(user_info, unit, item, condition)
            if user_val is not None and value is not None:
                score = user_val * (value / 100) if value <= 100 else user_val
                result.update({
                    "match": "met",
                    "user_value": _fmt_number(user_val),
                    "detail": f"得分: {score:.1f}（{requirement}）",
                })
            else:
                result.update({"match": "missing_info", "user_value": "未提供", "detail": f"缺少 {item} 信息"})
            return result

        # === 排名项 ===
        elif cond_type == "ranking":
            user_rank = self._get_user_value(user_info, "%", item, condition)
            if user_rank is not None and value is not None:
                # value 通常是前 X%，用户排名越小越好
                if user_rank <= value:
                    result.update({"match": "met", "user_value": f"前{_fmt_number(user_rank)}%", "detail": f"满足前{value}%要求"})
                else:
                    result.update({"match": "not_met", "user_value": f"前{_fmt_number(user_rank)}%", "detail": f"不满足前{value}%要求"})
            else:
                result.update({"match": "missing_info", "user_value": "未提供排名信息"})
            return result

        # === 加分项 ===
        elif cond_type == "bonus":
            if "论文" in item.lower() or unit == "篇":
                paper_result = self._check_papers(user_info, condition)
                result.update({"match": paper_result["match"], "user_value": paper_result["detail"]})
                return result
            if "竞赛" in item.lower() or unit == "项":
                comp_result = self._check_competitions(user_info, condition)
                result.update({"match": comp_result["match"], "user_value": comp_result["detail"]})
                return result
            result.update({"match": "needs_manual_review", "detail": "加分项需人工核实"})
            return result

        # === 优先条件 ===
        elif cond_type == "preference":
            result.update({"match": "needs_manual_review", "detail": "优先条件需人工评估"})
            return result

        # === 流程性要求 ===
        elif cond_type == "procedural":
            result.update({"match": "needs_manual_review", "detail": "流程性要求需用户自行确认"})
            return result

        # === 定性条件 ===
        elif cond_type == "qualitative":
            result.update({"match": "needs_manual_review", "detail": "定性条件需人工审核"})
            return result

        # === 未知类型 ===
        else:
            result.update({"match": "needs_manual_review", "detail": f"未知条件类型: {cond_type}"})
            return result

    @staticmethod
    def _is_procedural(cat_key: Optional[str], cond: Dict[str, Any]) -> bool:
        """是否流程性要求：类目组名或其自身 category 字段命中即算（双保险）。"""
        return cat_key in EXCLUDED_CATEGORIES or cond.get("category") in EXCLUDED_CATEGORIES

    def match_policy(self, user_info: Dict[str, Any], policy: Dict[str, Any]) -> Dict[str, Any]:
        """
        匹配用户信息与单个政策的所有条件

        Returns:
            {
                "policy_title": "政策标题",
                "overall_verdict": "likely_eligible" | "possibly_eligible" | "needs_review",
                "condition_matches": [...],
                "missing_info": [...],
                "needs_manual_review": [...],
                # 流程性事项备档（材料提交/承诺类等），不进任何板块、不参与判定，仅供对话参考
                "procedural_notes": [...]
            }
        """
        # 从 requirements 中提取所有条件（新格式）
        # 流程性要求整体剔除：前端对未知 board 值会兜底渲染到"其他"栏，靠改 board 值
        # 无法让其"消失"，因此在这里就不让它进入条件列表——condition_matches、
        # board_matches、category_matches、missing_info、needs_manual_review 与 verdict
        # 统计自然全部干净；剔除项仅留精简索引到 procedural_notes 备档
        conditions = []
        procedural_notes = []
        requirements = policy.get("requirements", {})
        for cat_key, cat_data in requirements.items():
            for cond in cat_data.get("conditions", []):
                if not isinstance(cond, dict):
                    continue
                if self._is_procedural(cat_key, cond):
                    procedural_notes.append({
                        "id": cond.get("id"),
                        "item": cond.get("item"),
                        "requirement": cond.get("requirement"),
                    })
                    continue
                conditions.append(cond)

        # 兼容旧格式（如果有 conditions 字段）
        if not conditions and "conditions" in policy:
            conditions = [
                c for c in policy.get("conditions", [])
                if isinstance(c, dict) and not self._is_procedural(c.get("category"), c)
            ]

        matches = []
        missing = []
        manual_review = []

        for cond in conditions:
            match_result = self.match_condition(user_info, cond)
            matches.append(match_result)

            if match_result["match"] == "missing_info":
                missing.append(match_result["item"])
            elif match_result["match"] == "needs_manual_review":
                manual_review.append(match_result["item"])

        # 一票否决短路
        triggered = [
            {"id": m.get("id"), "item": m["item"], "source_quote": m.get("source_quote", "")}
            for m in matches if m.get("match") == "violated"
        ]
        not_met_count = sum(1 for m in matches if m["match"] == "not_met")
        if triggered:
            verdict = "disqualified"
        elif not_met_count > 0:
            verdict = "not_eligible"
        elif missing:
            verdict = "needs_more_info"
        elif manual_review:
            verdict = "needs_review"
        else:
            verdict = "likely_eligible"

        # 按板块分组（前端直接消费）：只放精简索引 {id,item,match}，
        # 全量明细统一见 condition_matches，前端按 id 关联——
        # 避免同一批条件多处全量展开导致响应体过大被系统截断
        board_matches = {"veto": [], "base": [], "bonus": [], "other": []}
        for cond, m in zip(conditions, matches):
            b = cond.get("board")
            if b not in board_matches:
                b = "other"
            board_matches[b].append({
                "id": m.get("id"),
                "item": m.get("item"),
                "match": m.get("match"),
            })

        # 按类别分组的精简索引（label + 条件 id 列表）
        # 与条件提取口径一致：流程性类目组整体跳过，组内 id 也过滤，保证与 condition_matches 全对齐
        category_matches = {}
        for cat_key, cat_data in requirements.items():
            if cat_key in EXCLUDED_CATEGORIES:
                continue
            ids = [
                c.get("id") for c in cat_data.get("conditions", [])
                if isinstance(c, dict) and not self._is_procedural(cat_key, c)
            ]
            if ids:
                category_matches[cat_key] = {
                    "label": cat_data.get("label", cat_key),
                    "ids": ids,
                }

        policy_meta = policy.get("meta", {}) or {}
        return {
            "policy_title": policy_meta.get("title", "未知政策"),
            "policy_category": policy_meta.get("category", "other"),
            # 契约 v2：政策文件标识（server 侧组装 policyVersionId / policyFileName 用）
            "policy_doc_id": policy_meta.get("doc_id", "") or "",
            "policy_year": policy_meta.get("year"),
            # 契约 v3：来源文件名（contract_view 组装每行 sourceFile 的扩展名用）
            "policy_source_file": policy_meta.get("source_file", "") or "",
            "overall_verdict": verdict,
            "veto_blocked": bool(triggered),
            "triggered_vetoes": triggered,
            "board_matches": board_matches,        # 按 veto/base/bonus/other 分组
            "category_matches": category_matches,  # 按类别分组的匹配结果
            "condition_matches": matches,
            "missing_info": missing,
            "needs_manual_review": manual_review,
            "procedural_notes": procedural_notes,  # 流程性事项备档（不进任何板块、不参与判定）
        }

    def match_all_policies(self, user_info: Dict[str, Any], policies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        批量匹配用户信息与多个政策

        Args:
            user_info: 用户信息
            policies: 政策列表（已加载详情的完整结构）

        Returns:
            匹配结果列表
        """
        results = []
        for policy in policies:
            result = self.match_policy(user_info, policy)
            results.append(result)
        return results
