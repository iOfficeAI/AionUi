"""Policy Search MCP Server - 高校政策查询系统"""

import json
import asyncio
import re
import sys
import logging
from typing import Any, Dict, List, Optional

# 配置日志输出到 stderr，避免污染 stdout 的 JSON-RPC 响应
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    stream=sys.stderr,
    force=True
)
logger = logging.getLogger(__name__)

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Tool,
    TextContent,
    CallToolResult,
    ListToolsResult,
)

from config import Config
from policy_store import PolicyStore
from policy_parser import PolicyParser
from policy_matcher import PolicyMatcher
from checklist_annotator import annotate_policy
from contract_view import build_contract_view


# ============================================================
# 单例初始化（避免重复初始化）
# ============================================================

_server_instance = None
_store_instance = None
_parser_instance = None
_matcher_instance = None

def get_server():
    global _server_instance
    if _server_instance is None:
        _server_instance = Server("policy_search")
    return _server_instance

def get_store():
    global _store_instance
    if _store_instance is None:
        _store_instance = PolicyStore()
        logger.info(f"PolicyStore 初始化完成，知识库路径: {_store_instance.base_dir}")
    return _store_instance

def get_parser():
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = PolicyParser()
        logger.info("PolicyParser 初始化完成")
    return _parser_instance

def get_matcher():
    global _matcher_instance
    if _matcher_instance is None:
        _matcher_instance = PolicyMatcher()
        logger.info("PolicyMatcher 初始化完成")
    return _matcher_instance

# 初始化实例
server = get_server()
store = get_store()
parser = get_parser()
matcher = get_matcher()

logger.info("PolicySearch MCP Server 启动完成")


# ============================================================
# 工具定义
# ============================================================

TOOLS = [
    Tool(
        name="load_policy_document",
        description=(
            "【政策文档入库工具】\n"
            "功能：加载高校政策文档（PDF、DOCX、HTML、Excel或文本文件），使用LLM自动解析并结构化存储到知识库。\n"
            "\n"
            "=== 触发条件（满足任一即触发） ===\n"
            "\n"
            "【条件A - 用户显式请求】用户提到以下关键词：\n"
            "- 加载政策、导入政策、解析政策文档、上传政策文件、添加新政策、录入政策\n"
            "- 上传奖学金文件、上传保研文件、上传助学金文件、政策入库、文档入库\n"
            "\n"
            "【条件B - 文件名/路径自动识别】用户提供了文件路径，且文件名或路径中包含以下任一特征词：\n"
            "- 政策通用类：政策、办法、规定、细则、条例、通知、意见、方案、管理办法、实施细则、评定办法、评选办法\n"
            "- 研究生推免/保研类：推免、保研、免试攻读、推荐免试、研究生推免、推免生、推免资格、推免办法、推免工作\n"
            "- 奖学金类：奖学金、国家奖学金、励志奖学金、社会奖学金、奖学金评定、奖学金评选、奖学金评审\n"
            "- 助学金/资助类：助学金、资助、助学金评定、助学金评审、困难补助、勤工助学、助学贷款、国家助学金\n"
            "- 综测/综合素质类：综测、综合素质测评、综合测评、素质测评、德育测评、综合考评、测评办法、测评细则\n"
            "- 转专业类：转专业、专业分流、专业调整、转入、转出、转专业办法、转专业条件\n"
            "- 学业管理类：学业、成绩、学分、绩点、GPA、考试、课程、培养、学籍、休学、退学、毕业、学位\n"
            "- 纪律处分类：纪律、处分、违规、违纪、警告、严重警告、记过、留校察看、开除、学生违纪、处分办法\n"
            "- 交流交换类：交流、交换、联合培养、出国、境外、访学、交换生、国际交流\n"
            "- 就业创业类：就业、创业、实习、招聘、毕业、校招、就业指导、创业扶持\n"
            "\n"
            "【条件C - 上下文推断】用户上传了文件（即使没有说话），且当前对话上下文涉及政策、保研、奖学金等高校管理话题。\n"
            "\n"
            "=== 重要判断规则 ===\n"
            "- 当用户上传了文件但什么都不说时，优先检查文件名是否包含上述特征词，如果包含则自动调用此工具。\n"
            "- 如果文件名模糊（如 'document1.pdf'）且用户没有说明，不要调用此工具，应主动询问用户。\n"
            "- 此工具专门用于高校政策类文档的结构化解析。如果是普通文档问答（非政策类），请使用RAG的load_pdf工具。\n"
            "\n"
            "支持的政策类型：研究生推免/保研、奖学金、助学金/资助、综测/综合素质测评、转专业、学业管理、纪律处分、交流交换、就业创业等。\n"
            "示例：\n"
            "- 用户说'帮我加载这个保研政策PDF：d:/docs/policy.pdf' → 调用此工具\n"
            "- 用户只发送了文件路径 'd:/docs/XX大学推免生管理办法2025.pdf' 但没说话 → 文件名包含'推免'和'管理办法'，自动调用此工具\n"
            "- 用户发送 'd:/docs/国家奖学金评定细则.pdf' 但没说话 → 文件名包含'奖学金'和'评定细则'，自动调用此工具\n"
            "- 用户发送 'd:/docs/综合素质测评实施办法.pdf' 但没说话 → 文件名包含'综测'和'测评办法'，自动调用此工具\n"
            "- 用户发送 'd:/docs/学生转专业管理办法.pdf' 但没说话 → 文件名包含'转专业'和'管理办法'，自动调用此工具\n"
            "- 用户发送 'd:/docs/助学金评审实施细则.pdf' 但没说话 → 文件名包含'助学金'和'实施细则'，自动调用此工具"
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "document_path": {
                    "type": "string",
                    "description": "文档文件的绝对路径，支持 .pdf、.docx、.html、.xlsx、.txt、.md 格式，例如 d:/documents/policy.pdf 或 d:/documents/policy.docx",
                },
                "metadata": {
                    "type": "object",
                    "description": "可选的元数据覆盖，如果不提供则自动从文档中提取",
                    "properties": {
                        "school": {"type": "string", "description": "学校名称"},
                        "year": {"type": "integer", "description": "年份，例如 2025"},
                        "category": {
                            "type": "string",
                            "description": "政策分类标识",
                            "enum": list(Config.CATEGORIES.keys()),
                        },
                    },
                },
            },
            "required": ["document_path"],
        },
    ),
    Tool(
        name="query_policy",
        description=(
            "【政策条件匹配工具】\n"
            "功能：根据用户个人信息（GPA、排名、论文、竞赛等）查询匹配的高校政策，"
            "返回每个政策的匹配状态、条件逐条对比结果和原文引用。\n"
            "触发条件：当用户提到以下关键词时使用此工具：\n"
            "- 我符合哪些政策、帮我匹配政策、查询政策\n"
            "- 我的GPA是、我有多少论文、保研条件、奖学金条件\n"
            "- 我能不能申请、我是否符合条件、政策eligibility\n"
            "- 帮我看看、帮我查一下、匹配一下\n"
            "适用场景：用户提供了个人信息，想知道自己符合哪些政策条件。\n"
            "\n"
            "=== 字段填写规范（重要，直接影响判定准确性） ===\n"
            "1. 数值字段分制：GPA/绩点填 gpa（4分/5分制小数）；百分制平均成绩填 average_score（如 90）；"
            "排名百分比填 gpa_rank_percent（前12.5% 填 12.5）。用户给百分制平均分时不要塞进 gpa。\n"
            "2. 所有数值字段接受数字或数字字符串（\"90\"、\"90分\"、\"前12.5%\"均可识别），按用户原话如实填写。\n"
            "3. 志愿时长/社会实践/培训学时等非标准项放入 extra，键名用中文或标准英文均可（如 "
            "{\"extra\": {\"志愿服务时长\": 25}} 或 {\"extra\": {\"volunteer_hours\": 25}}）；"
            "凡是对话里已提供的信息都必须填入对应字段，不要只停留在自然语言。\n"
            "4. 【一票否决必须显式申报】用户自述存在违纪处分/作弊/学术不端/挂科（不及格）等情形时，"
            "必须在字段里申报，否则会被误判为\"未触发\"。任选其一：\n"
            "   - 布尔字段：disciplinary_action: true（违纪处分）、cheating: true（作弊/学术不端）、"
            "plagiarism: true（抄袭）、failed_courses: 门数（挂科）；\n"
            "   - declared_vetoes 列出：[\"违纪\", \"挂科\"] 或 {\"违纪\": true}；\n"
            "   - answers 回填：[{\"id\": \"否决条件id\", \"value\": true}]。\n"
            "   用户明确表示\"没有\"的否决情形不要申报（不要传 false 项，留空即可）。\n"
            "5. 前端申请清单回填的答案放 answers：[{\"id\": \"条件id\", \"value\": 是/否/数值}]。\n"
            "6. 缺失信息如实留空（返回 missing_info）；严禁凭猜测填充数值、排名或否决申报。\n"
            "\n"
            "=== 路由规则 ===\n"
            "- 用户询问\"我是否符合XX政策/能不能申请/差多少\"等资格判定时必须调用本工具，不得凭常识直接作答；\n"
            "- 用户问的具体政策若不在知识库（先用 list_policies 或按本工具返回确认），如实告知\"未收录该政策\"，"
            "不得用知识库中其它学校/其它类型的政策顶替，也不得凭训练语料编造条款或分数线；\n"
            "- 同一轮对话中政策上下文应与上一轮一致（以返回的 policyFileName 为准）；若用户明确指定政策文件，"
            "将文件名传给 policy_name 参数以锁定匹配范围。\n"
            "返回结果包含：\n"
            "- overall_verdict：总体判定（disqualified/not_eligible/needs_more_info/needs_review/likely_eligible）\n"
            "- veto_blocked / triggered_vetoes：是否被一票否决及命中项（附带原文引用）\n"
            "- board_matches：按 veto/base/bonus/other 分组的精简索引（含 id/item/match）\n"
            "- condition_matches：逐条匹配全量明细（含 board/input_kind/requires_evidence 与逐条对比）\n"
            "- procedural_notes：流程性事项备档（材料提交/承诺类等；不进任何板块、不参与判定，仅供对话参考）\n"
            "- 契约 v3 顶层字段：type/toolName/status/summary/conclusion/conditionGroups/policyVersionId/policyFileName"
            "（\"规则分析\"页与对话内联卡片直接渲染；conditionGroups 只含 门槛/红线/加分，match 为契约四态；"
            "每行含 sourceFile（政策来源文件），可补充信息的条件行含 control（输入控件配置：type/fieldKey/placeholder/options））\n"
            "- evidences/risks/suggestions：政策依据（≤5 条）、风险/缺失信息、建议下一步\n"
            "- source_quote：原文引用（必须展示给用户）\n"
            "- missing_info：缺失信息\n"
            "示例：用户说'我的GPA3.7，有1篇SCI论文，符合哪些保研政策？'时调用此工具。\n"
            "【调用顺序】本工具应作为本轮对话的最后一次工具调用：调用后请直接基于返回结果组织回答，"
            "不要再调用通用知识库检索工具（search）重复查找同一政策内容——本工具结果已覆盖该政策全部门槛/红线/加分条款"
            "及原文引用（source_quote/evidences），重复检索通常不会返回新的政策信息。"
            "如确需配合通用检索，请安排在本工具之前调用。"
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "user_info": {
                    "type": "object",
                    "description": "用户个人信息对象",
                    "properties": {
                        "school": {"type": "string", "description": "学校名称，例如 北京大学"},
                        "year": {"type": "integer", "description": "年份，例如 2025"},
                        "gpa": {"type": "number", "description": "GPA 绩点，例如 3.7"},
                        "gpa_rank_percent": {
                            "type": "number",
                            "description": "GPA 排名百分比，例如 12.5 表示前12.5%",
                        },
                        "average_score": {
                            "type": ["number", "string"],
                            "description": "百分制平均成绩（如 90 或 \"90分\"）。与 gpa 分制不同，勿混填",
                        },
                        "english": {
                            "type": "object",
                            "description": "英语成绩",
                            "properties": {
                                "cet4": {"type": "number", "description": "CET-4 分数"},
                                "cet6": {"type": "number", "description": "CET-6 分数"},
                            },
                        },
                        "papers": {
                            "type": "array",
                            "description": "论文列表",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "type": {
                                        "type": "string",
                                        "description": "论文类型，如 SCI、EI、核心",
                                    },
                                    "author_order": {
                                        "type": "integer",
                                        "description": "作者排序，1表示第一作者",
                                    },
                                    "count": {
                                        "type": "integer",
                                        "description": "论文数量",
                                    },
                                },
                            },
                        },
                        "competitions": {
                            "type": "array",
                            "description": "竞赛获奖列表",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "level": {
                                        "type": "string",
                                        "description": "竞赛级别：national/provincial/school",
                                    },
                                    "award": {
                                        "type": "string",
                                        "description": "奖项：一等奖/二等奖/三等奖",
                                    },
                                },
                            },
                        },
                        "declared_vetoes": {
                            "type": ["array", "object"],
                            "description": (
                                "用户申报的一票否决事实（存在即申报，不存在不要填）。"
                                "数组形式 [\"违纪\", \"挂科\"]；对象形式 {\"违纪\": true}。"
                                "键/词可用条件id、条件名称或口语说法"
                            ),
                            "items": {"type": "string"},
                        },
                        "disciplinary_action": {
                            "type": "boolean",
                            "description": "用户是否受过违纪处分（true=有，触发相关一票否决）",
                        },
                        "cheating": {
                            "type": "boolean",
                            "description": "用户是否发生过考试作弊/学术不端（true=有，触发相关一票否决）",
                        },
                        "failed_courses": {
                            "type": ["number", "boolean"],
                            "description": "挂科（不及格）门数；有挂科记为 >0 数字或 true",
                        },
                        "answers": {
                            "type": "array",
                            "description": "申请清单回填的答案列表（按条件 id）",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string", "description": "条件 id"},
                                    "value": {"description": "答案：是/否/数值"},
                                },
                            },
                        },
                        "extra": {
                            "type": "object",
                            "description": "自定义扩展字段，如志愿服务时长/社会实践/培训学时等（键名中英文均可）",
                        },
                    },
                    "required": [],
                },
                "category": {
                    "type": "string",
                    "description": "筛选分类（可选），不填则查询所有分类",
                    "enum": list(Config.CATEGORIES.keys()),
                },
                "policy_name": {
                    "type": "string",
                    "description": (
                        "锁定匹配的政策文件名/标题（可选）。用户明确指定了某份政策时传入，"
                        "匹配范围将锁定到该文件；找不到时返回警告而不会用其它政策顶替"
                    ),
                },
            },
            "required": ["user_info"],
        },
    ),
    Tool(
        name="list_policies",
        description=(
            "【政策列表查询工具】\n"
            "功能：列出知识库中已加载的政策文件，支持按学校、分类、年份筛选。\n"
            "触发条件：当用户提到以下关键词时使用此工具：\n"
            "- 列出政策、有哪些政策、知识库政策\n"
            "- 政策列表、查看政策、显示政策\n"
            "- 保研政策有哪些、奖学金政策列表\n"
            "- 某个学校有哪些政策、某个分类下有哪些政策\n"
            "适用场景：用户想查看知识库里有哪些政策文件。\n"
            "示例：用户说'知识库里有哪些保研政策？'或'北京大学有哪些政策？'时调用此工具。"
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "school": {"type": "string", "description": "筛选学校（可选，模糊匹配）"},
                "category": {
                    "type": "string",
                    "description": "筛选分类（可选）",
                    "enum": list(Config.CATEGORIES.keys()),
                },
                "year": {"type": "integer", "description": "筛选年份（可选）"},
            },
            "required": [],
        },
    ),
    Tool(
        name="clear_policy_knowledge_base",
        description=(
            "【清空政策知识库工具】\n"
            "功能：仅清空「政策知识库」中所有结构化政策数据"
            "（policy-search：推免/奖学金/助学金等按条款结构化的 JSON 与 index.json）。此操作不可恢复。\n"
            "\n"
            "=== 重要区分 ===\n"
            "- 本工具只作用于「政策知识库」（结构化政策），绝不会清空「通用知识库」（RAG 向量库）。\n"
            "- 若用户想清空的是通用知识库/向量库/上传的文档问答库，"
            "请改用 rag-mcp-server 的 clear_general_knowledge_base 工具，不要用本工具。\n"
            "\n"
            "触发条件：仅当用户明确要清空政策/结构化政策库时使用：\n"
            "- 清空政策知识库、清空政策库、删除所有政策、重置政策库\n"
            "- 删除所有推免/奖学金/助学金政策、清空结构化政策\n"
            "示例：用户说'把政策知识库清空' → 调用本工具；"
            "用户说'清空通用知识库/清空RAG向量库' → 不要调用本工具，改用 clear_general_knowledge_base。"
        ),
        inputSchema={
            "type": "object",
            "properties": {},
            "required": [],
        },
    ),
]


# ============================================================
# MCP 协议处理
# ============================================================


@server.list_tools()
async def handle_list_tools() -> ListToolsResult:
    """返回所有可用工具"""
    return ListToolsResult(tools=TOOLS)


@server.call_tool()
async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
    """处理工具调用"""
    try:
        if name == "load_policy_document":
            return await _handle_load_policy(arguments)
        elif name == "query_policy":
            return await _handle_query_policy(arguments)
        elif name == "list_policies":
            return await _handle_list_policies(arguments)
        elif name == "clear_policy_knowledge_base":
            return await _handle_clear(arguments)
        else:
            return [TextContent(type="text", text=json.dumps({"error": f"未知工具: {name}"}, ensure_ascii=False))]
    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": str(e)}, ensure_ascii=False))]


# ============================================================
# 工具实现
# ============================================================


async def _handle_load_policy(arguments: Dict[str, Any]) -> List[TextContent]:
    """加载政策文档"""
    document_path = arguments.get("document_path", "")
    metadata_override = arguments.get("metadata", {})

    if not document_path:
        return [TextContent(type="text", text=json.dumps({"error": "document_path 不能为空"}, ensure_ascii=False))]

    try:
        logger.info(f"开始加载文档: {document_path}")

        # 1. 解析文档（同步阻塞操作，放到线程池执行，避免阻塞事件循环）
        policy_data = await asyncio.to_thread(parser.parse_document, document_path)

        # 统计条件总数（兼容新旧格式）
        total_conds = 0
        requirements = policy_data.get("requirements", {})
        logger.info(f"[DEBUG] requirements keys: {list(requirements.keys())}")
        for cat_key, cat_data in requirements.items():
            conds = cat_data.get("conditions", [])
            total_conds += len(conds)
            logger.info(f"[DEBUG]   {cat_key}: {len(conds)} conditions")
        logger.info(f"文档解析完成，条件数: {total_conds}")

        # 如果 requirements 为空，记录详细信息
        if total_conds == 0:
            logger.warning(f"[DEBUG] requirements 为空! policy_data keys: {list(policy_data.keys())}")
            logger.warning(f"[DEBUG] policy_data['requirements'] type: {type(requirements)}")
            logger.warning(f"[DEBUG] policy_data['requirements'] content: {requirements}")

        # 2. 应用元数据覆盖
        if metadata_override:
            if "school" in metadata_override:
                policy_data["meta"]["school"] = metadata_override["school"]
            if "year" in metadata_override:
                policy_data["meta"]["year"] = metadata_override["year"]
            if "category" in metadata_override:
                policy_data["meta"]["category"] = metadata_override["category"]

        # 3. 存储
        meta = policy_data["meta"]
        doc_id = store.save_policy(
            policy_data=policy_data,
            category=meta["category"],
            school=meta["school"],
            year=meta["year"],
            title=meta["title"],
            tags=meta["tags"],
            effective_date=meta["effective_date"],
            source_file=meta["source_file"],
        )
        logger.info(f"文档已存储，doc_id: {doc_id}")

        # 统计各类别条件数量
        requirements = policy_data.get("requirements", {})
        req_summary = {}
        for cat_key, cat_data in requirements.items():
            req_summary[cat_key] = {
                "label": cat_data.get("label", cat_key),
                "count": len(cat_data.get("conditions", []))
            }

        result = {
            "success": True,
            "doc_id": doc_id,
            "title": meta["title"],
            "category": Config.CATEGORIES.get(meta["category"], meta["category"]),
            "school": meta["school"],
            "year": meta["year"],
            "requirements_summary": req_summary,
            "total_conditions": sum(v["count"] for v in req_summary.values()),
            "logic_groups_count": len(policy_data["logic_groups"]),
            "important_dates_count": len(policy_data["important_dates"]),
            "message": f"政策文档已成功加载并存储，doc_id: {doc_id}",
        }
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except FileNotFoundError as e:
        logger.error(f"文件未找到: {e}")
        return [TextContent(type="text", text=json.dumps({"error": str(e)}, ensure_ascii=False))]
    except Exception as e:
        logger.error(f"加载失败: {e}", exc_info=True)
        return [TextContent(type="text", text=json.dumps({"error": f"加载失败: {str(e)}"}, ensure_ascii=False))]


async def _handle_query_policy(arguments: Dict[str, Any]) -> List[TextContent]:
    """查询匹配政策"""
    user_info = arguments.get("user_info", {})
    category_filter = arguments.get("category")
    policy_name = str(arguments.get("policy_name") or "").strip()

    if not user_info:
        return [TextContent(type="text", text=json.dumps({"error": "user_info 不能为空"}, ensure_ascii=False))]

    try:
        # 1. 获取相关政策
        if category_filter:
            policies = store.get_all_policies_in_category(category_filter)
        else:
            # 获取所有分类的政策
            policies = []
            for cat in Config.CATEGORIES:
                policies.extend(store.get_all_policies_in_category(cat))

        # 1.5) policy_name 路由锁定：明确指定了政策文件时只在该文件内匹配，
        #      命中不到绝不回退全库（防止"拿别的政策顶替回答"）
        if policy_name and policies:
            def _norm_key(s: Any) -> str:
                # 归一：去空白/连接符/全半角括号，忽略大小写与扩展名
                t = re.sub(r"[\s_\-—－–·（）()【】\[\]]+", "", str(s or "")).lower()
                return re.sub(r"\.(pdf|docx?|html?|xlsx|txt|md)$", "", t)

            key = _norm_key(policy_name)
            matched = []
            if key:
                for p in policies:
                    meta = p.get("meta") or {}
                    cands = (_norm_key(meta.get("title")), _norm_key(meta.get("source_file")))
                    if any(c and (key in c or c in key) for c in cands):
                        matched.append(p)
            if matched:
                policies = matched
            else:
                titles = [str((p.get("meta") or {}).get("title", "")) for p in policies]
                return [
                    TextContent(
                        type="text",
                        text=json.dumps(
                            {
                                "type": "campus_rule_analysis",
                                "toolName": "query_policy",
                                "status": "error",
                                "summary": f"知识库中未收录与“{policy_name}”匹配的政策文件，请勿使用其它政策顶替回答。",
                                "error": {
                                    "type": "warning",
                                    "title": "未找到指定政策",
                                    "description": "已收录政策：" + "；".join(t for t in titles if t),
                                },
                            },
                            ensure_ascii=False,
                            separators=(",", ":"),
                        ),
                    )
                ]

        if not policies:
            return [
                TextContent(
                    type="text",
                    text=json.dumps(
                        {
                            "type": "campus_rule_analysis",
                            "toolName": "query_policy",
                            "status": "error",
                            "summary": "知识库中没有可匹配的政策文件。",
                            "error": {
                                "type": "warning",
                                "title": "未找到相关政策",
                                "description": "请先使用 load_policy_document 加载政策文档后再查询。",
                            },
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                )
            ]

        # 2. 出数据前统一兜底：展示字段缺失/非法时用规则补齐（合法 LLM 值原样保留）
        #    使 board/input_kind/requires_evidence 永不为空，前端分组始终生效
        for policy in policies:
            annotate_policy(policy, force=False)

        # 3. 逐条匹配
        results = matcher.match_all_policies(user_info, policies)

        # 4. 按 verdict 排序
        verdict_order = {"likely_eligible": 0, "needs_review": 1, "needs_more_info": 2, "not_eligible": 3}
        results.sort(key=lambda x: verdict_order.get(x["overall_verdict"], 99))

        # 5. 组装契约 v2 超集输出：
        #    顶层直接携带"规则分析"页/对话内联卡片消费的契约字段（以 results[0] 为主政策视图），
        #    results[] 原样保留供右侧"申请清单"面板使用——两条前端链路均零改动
        if not results:
            return [
                TextContent(
                    type="text",
                    text=json.dumps(
                        {
                            "type": "campus_rule_analysis",
                            "toolName": "query_policy",
                            "status": "error",
                            "summary": "政策文件暂未解析出可匹配的条件。",
                            "error": {
                                "type": "warning",
                                "title": "暂无可匹配条件",
                                "description": "请确认政策文档已正确解析（含条件拆解）后重试。",
                            },
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                )
            ]
        output = {
            **build_contract_view(results[0]),
            "total_policies": len(results),
            "results": results,
        }
        # 响应体积敏感：紧凑 JSON（无缩进空白），避免大响应在管线中被截断
        return [TextContent(type="text", text=json.dumps(output, ensure_ascii=False, separators=(",", ":")))]

    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": f"查询失败: {str(e)}"}, ensure_ascii=False))]


async def _handle_list_policies(arguments: Dict[str, Any]) -> List[TextContent]:
    """列出政策"""
    school = arguments.get("school")
    category = arguments.get("category")
    year = arguments.get("year")

    try:
        entries = store.list_policies(school=school, category=category, year=year)

        # 为每个条目添加分类中文名
        for entry in entries:
            entry["category_name"] = Config.CATEGORIES.get(entry.get("category", ""), entry.get("category", ""))

        summary = store.get_index_summary()

        output = {
            "summary": summary,
            "total": len(entries),
            "policies": entries,
        }
        return [TextContent(type="text", text=json.dumps(output, ensure_ascii=False, indent=2))]

    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": f"列出失败: {str(e)}"}, ensure_ascii=False))]


async def _handle_clear(arguments: Dict[str, Any]) -> List[TextContent]:
    """清空政策知识库（仅结构化政策，不影响通用/RAG 知识库）"""
    try:
        result = store.clear()
        return [TextContent(type="text", text=json.dumps({"success": True, "message": "政策知识库已清空", "detail": result}, ensure_ascii=False))]
    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": f"清空失败: {str(e)}"}, ensure_ascii=False))]


# ============================================================
# 启动
# ============================================================


async def main():
    """启动 MCP Server"""
    logger.info("PolicySearch MCP Server 启动中...")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
