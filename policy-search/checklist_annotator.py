"""清单标注模块 (Checklist Annotator)

给 policy-search 解析出的每条 condition 打上三个"前端渲染字段"：
    board           : veto | base | bonus | other      —— 前端分组键
    input_kind      : yes_no | number | range | select | upload | text | none
    requires_evidence: bool                            —— 是否需要上传佐证

设计原则（与前端对接文档一致）：
  - 前端只按 board + input_kind 渲染，绝不出现中文关键词判断；
  - 判定发生在"后端数据层"，是单一可信来源；
  - 采用 LLM(抽取时打标) + 规则(兜底归一) 的混合，无需人工审核：
      * policy_parser 让 LLM 在抽取时直接产出 board/input_kind/requires_evidence；
      * 本模块 annotate_policy 负责：LLM 值合法则保留，缺失/非法则用规则补齐；
      * 少数"合法但高确定性错放"由 _correct_board 纠偏层统一修正（两条路径均生效）；
      * 存量回填/纠偏用本模块 CLI：默认全量按规则重推（force=True）；
        仅需"补缺失 + 纠偏、保留其余 LLM 值"时加 --no-force。

关于"一票否决(veto)"为何不能只靠关键词：同一个"处分/不及格/作弊"
在推免细则里是"一票否决"，在综合素质测评里是"扣 X 分"。因此规则里
先把"可量化 + 分值单位/加分语义"的项分流到 bonus，再让 veto 抢其余，
避免误升。最可靠的 veto 信号其实是"取消资格/否决"这一章节的语义标题，
所以本模块也识别 source_section 里带的这类标题（需 parser 把节名带出来）。
"""

import json
import os
import re
import sys
import glob
import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

# ---------------- 词表 ----------------
# 加分/评分相关类目或类型
BONUS_CATS = {"bonus", "competition", "research"}
BONUS_TYPES = {"bonus", "preference", "scoring", "ranking"}

# 上传/提交类动词（用于 requires_evidence 与 input_kind=upload）
MATERIAL_PAT = re.compile(
    r"(提交|出具|复印件|盖章|加盖公章|专用章|申请表|成绩单|证明材料|证明复印件|提交.{0,4}材料)"
)
# 结构性否决信号：source_section 携带"取消资格/否决"类章节标题
VETO_SECTION = re.compile(r"(取消资格|取消推免|取消.{0,3}资格|不予受理|不得推荐|一票否决|否决)")
# 显式否决词（碰了即不合格）。"扣分"类由 points 分流先行拦截，不在此列
VETO_TEXT = re.compile(
    r"(挂科|不及格|补考|纪律处分|受.{0,4}处分|记过|留校察看|通报批评|违纪|作弊|学术不端|"
    r"弄虚作假|造假|违规违法|违法违纪|一票否决|无处分|无挂科|无违规|无违纪)"
)
# 明显是"计分项"的语义（把量化加分项从 veto/other 里救回）
BONUS_HINT = re.compile(r"(加分|扣分|附加分|积分|获奖|荣誉|认证|竞赛|论文|专利|项目|实践|活动|测试|测评成绩)")
# 纯宣誓/品行/义务声明（仅展示）
OATH_PAT = re.compile(
    r"(拥护|爱国主义|社会主义|核心价值观|品行|品德|诚实守信|学风|积极向上|集体主义|"
    r"社会责任感|遵纪守法|回避|报备|承诺)"
)
# 计分口径/统计规则类信息（非学生可勾项）
INFO_PAT = re.compile(r"(统计|口径|纳入计算|不纳入|计算范围|计算方式|折算|就高不就低)")
# 行政/评委构成类信息（与申请者个人无关）
ADMIN_PAT = re.compile(r"(工作小组|成员占比|学生代表|评委|专家|人数为单数|不少于5人|不少于.?人)")
# 数字阈值常用单位
NUMERIC_UNITS = {"分", "%", "篇", "项", "门", "次", "个", "倍", "等功", "级", "小时", "周", "天"}

VALID_BOARDS = {"veto", "base", "bonus", "other"}
VALID_KINDS = {"yes_no", "number", "range", "select", "upload", "text", "none"}


def _text_of(c: Dict[str, Any]) -> str:
    return "".join(str(c.get(k, "") or "") for k in ("item", "description", "requirement"))


def _decide_board(c: Dict[str, Any]) -> Tuple[str, str]:
    """纯规则判定 board，返回 (board, rule)。rule 仅用于审计。"""
    cat = c.get("category")
    t = c.get("type")
    q = bool(c.get("quantifiable"))
    op = c.get("operator")
    val = c.get("value")
    unit = str(c.get("unit") or "")
    src = str(c.get("source_section") or "")
    text = _text_of(c)

    bonusish = (cat in BONUS_CATS) or (t in BONUS_TYPES)
    numeric_threshold = q and op not in (None, "none", "") and val is not None
    has_material = bool(MATERIAL_PAT.search(text))
    is_upload_only = has_material and not numeric_threshold
    veto_hit = bool(VETO_SECTION.search(src) or VETO_TEXT.search(text))
    # 量化"扣分/加分"计分项：先分流到 bonus，避免"受处分扣分"被误判为否决
    points = q and bonusish and (unit == "分" or bool(BONUS_HINT.search(text)))

    # ---- board 判定（优先级：points > veto > upload > 量化门槛/加分 > 定性门槛 > 声明/信息 > 其他）----
    if points:
        return "bonus", "量化扣分/加分(非否决)"
    if veto_hit:
        return "veto", "一票否决(否决节/否决词)"
    if is_upload_only:
        return "base", "待提交材料(上传)"
    if numeric_threshold and bonusish:
        return "bonus", "可量化加分/评分项"
    if numeric_threshold:
        return "base", "可量化门槛(带阈值)"
    if bonusish:
        return "bonus", "加分/评分类目(未量化)"
    if INFO_PAT.search(text) or ADMIN_PAT.search(text):
        return "other", "计分口径/行政信息(仅展示)"
    if cat == "health" and not q:
        return "other", "入学健康声明(仅展示)"
    if OATH_PAT.search(text):
        return "other", "宣誓/品行/义务声明(仅展示)"
    if cat in ("gpa", "foreign_language", "academic"):
        return "base", "定性门槛(完成/通过/身份类)"
    if cat == "procedural":
        return "other", "流程/承诺(仅展示)"
    return "other", "默认(仅展示)"


def _decide_kind(board: str, c: Dict[str, Any]) -> str:
    """按"最终采用的 board" + 条件自身字段判定 input_kind。"""
    if board == "veto":
        return "yes_no"
    if board == "other":
        return "none"

    text = _text_of(c)
    q = bool(c.get("quantifiable"))
    op = c.get("operator")
    val = c.get("value")
    unit = str(c.get("unit") or "")
    numeric_threshold = q and op not in (None, "none", "") and val is not None

    if board == "base" and bool(MATERIAL_PAT.search(text)) and not numeric_threshold:
        return "upload"
    if numeric_threshold and (unit in NUMERIC_UNITS or isinstance(val, (int, float))):
        return "number"
    if board == "bonus":
        if re.search(r"(等级|名次|排名|第一|主持|负责人|奖项|一等|二等|三等|等功)", text):
            return "select"
        return "number" if q else "select"
    return "yes_no"


def _needs_evidence(board: str, c: Dict[str, Any]) -> bool:
    """是否需要上传佐证：材料类动词命中，或 base/bonus 的可量化项。"""
    return bool(
        MATERIAL_PAT.search(_text_of(c))
        or (board in ("base", "bonus") and bool(c.get("quantifiable")))
    )


def classify_condition(c: Dict[str, Any]) -> Tuple[str, str, bool, str]:
    """纯规则路径：返回 (board, input_kind, requires_evidence, rule)，rule 便于审计。"""
    board, rule = _decide_board(c)
    kind = _decide_kind(board, c)
    return board, kind, _needs_evidence(board, c), rule


def _correct_board(c: Dict[str, Any], board: str) -> Tuple[str, bool]:
    """在给定 board 上做"规则可断言的错放"纠偏，返回 (board, 是否改动)。

    只修三类高确定性问题（其余与规则不一致但语义可辩护的合法值，一律尊重 LLM）：
      C1 部队立功等非量化"独有成就"被标成 base：类目属加分族且规则判 bonus
         ——它不提供也不影响申请，不应在前端基础板要求人人交材料；
      C2 计分口径/行政信息被标成 base：规则判 other 且文案命中 INFO/ADMIN
         ——没有任何学生"需要满足"它；
      C3 外语要求中的"满足其一"备选路径（TOEFL/IELTS）与特定主体分支
         （外语类专业条款）被标成 base：前端基础板只承载"必须逐条满足"的点，
         备选项全部并列会显示成多条未达标。
    """
    if board != "base":
        return board, False
    cat = c.get("category")
    rule_board, _ = _decide_board(c)
    text = _text_of(c)
    if rule_board == "bonus" and cat in BONUS_CATS:  # C1
        return "bonus", True
    if rule_board == "other" and (INFO_PAT.search(text) or ADMIN_PAT.search(text)):  # C2
        return "other", True
    if cat == "foreign_language":  # C3
        item = str(c.get("item") or "")
        up = item.upper()
        if "TOEFL" in up or "IELTS" in up or "外语类专业" in item:
            return "other", True
    return board, False


def annotate_condition(c: Dict[str, Any], force: bool = False) -> None:
    """就地给单条 condition 打字段。

    force=False 时保留合法的 LLM 值，仅补缺失/非法；且当 LLM 只给了 board 而
    input_kind 缺失/非法时，控件类型必须按"最终采用的 board"推导——避免出现
    LLM 标 bonus/veto 而规则按 other 分支给出 none 的控件错配。
    两条路径（force / 非 force）都会叠加 _correct_board 纠偏层：LLM 值"合法但
    高确定性错放"（部队立功类成就、计分口径、外语"满足其一"备选）也会被修正。
    """
    llm_board = c.get("board")
    llm_kind = c.get("input_kind")
    if (
        not force
        and llm_board in VALID_BOARDS
        and llm_kind in VALID_KINDS
        and isinstance(c.get("requires_evidence"), bool)
    ):
        # LLM 已给全且合法：其余字段尊重之，仅叠加确定性纠偏（详见 _correct_board）
        board, corrected = _correct_board(c, llm_board)
        if corrected:
            c["board"] = board
            if board == "other":
                c["input_kind"] = "none"  # 须知项不承载输入控件（与 parser 约定一致）
        return

    rule_board, _ = _decide_board(c)
    board = rule_board if force or llm_board not in VALID_BOARDS else llm_board
    board, corrected = _correct_board(c, board)
    if force or llm_kind not in VALID_KINDS or (corrected and board == "other"):
        kind = _decide_kind(board, c)
    else:
        kind = llm_kind

    c["board"] = board
    c["input_kind"] = kind
    if not isinstance(c.get("requires_evidence"), bool):
        c["requires_evidence"] = _needs_evidence(board, c)


def _iter_conditions(policy: Dict[str, Any]):
    reqs = policy.get("requirements", {})
    for cat_data in reqs.values():
        for cond in cat_data.get("conditions", []):
            if isinstance(cond, dict):
                yield cond


def annotate_policy(policy: Dict[str, Any], force: bool = False) -> Dict[str, int]:
    """给一份 policy 的所有 condition 打字段，返回板块计数统计。"""
    stat = {b: 0 for b in VALID_BOARDS}
    for cond in _iter_conditions(policy):
        annotate_condition(cond, force=force)
        stat[cond.get("board", "other")] = stat.get(cond.get("board", "other"), 0) + 1
    return stat


# ---------------- 存量回填 CLI ----------------
def backfill(kb_dir: str, force: bool = True, dry_run: bool = False) -> List[str]:
    """遍历 knowledge_base 下所有政策 JSON（跳过 index.json），回填 board/input_kind/requires_evidence。"""
    done = []
    pattern = os.path.join(kb_dir, "**", "*.json")
    for path in glob.glob(pattern, recursive=True):
        if os.path.basename(path) == "index.json":
            continue
        with open(path, "r", encoding="utf-8") as f:
            policy = json.load(f)
        if "requirements" not in policy:
            continue
        stat = annotate_policy(policy, force=force)
        # 校验：确保没有遗留非法值
        for cond in _iter_conditions(policy):
            assert cond.get("board") in VALID_BOARDS, f"board 非法: {path} {cond.get('id')}"
            assert cond.get("input_kind") in VALID_KINDS, f"kind 非法: {path} {cond.get('id')}"
        if not dry_run:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(policy, f, ensure_ascii=False, indent=2)
        done.append(f"{os.path.basename(path)}: {stat}")
    return done


def _default_kb_dir() -> str:
    try:
        from config import Config
        return Config.KNOWLEDGE_BASE_DIR
    except Exception:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge_base")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    dry = "--dry-run" in sys.argv
    no_force = "--no-force" in sys.argv
    kb = _default_kb_dir()
    lines = backfill(kb, force=(not no_force), dry_run=dry)
    out = ["[checklist] backfill @ " + kb] + lines
    msg = "\n".join(out)
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((msg + "\n").encode("utf-8"))
