"""Policy Search MCP Server - 高校政策查询系统"""

import json
import asyncio
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
            "功能：加载高校政策文档（PDF或文本文件），使用LLM自动解析并结构化存储到知识库。\n"
            "触发条件：当用户提到以下关键词时使用此工具：\n"
            "- 加载政策、导入政策、解析政策文档\n"
            "- 上传政策文件、添加新政策、录入政策\n"
            "- 上传奖学金文件、上传保研文件、上传助学金文件\n"
            "- 政策入库、文档入库\n"
            "适用场景：用户提供了一个PDF或文本文件路径，要求系统解析其中的政策内容。\n"
            "支持的政策类型：保研/推免、奖学金、助学金、学业管理、纪律处分、交流交换、就业创业等。\n"
            "注意：此工具专门用于政策类文档的结构化解析。如果是普通文档问答，请使用RAG的load_pdf工具。\n"
            "示例：用户说'帮我加载这个保研政策PDF：d:/docs/policy.pdf'时调用此工具。"
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "document_path": {
                    "type": "string",
                    "description": "PDF 或文本文件的绝对路径，例如 d:/documents/policy.pdf",
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
            "返回结果包含：\n"
            "- overall_verdict：总体判定（likely_eligible/not_eligible/needs_review等）\n"
            "- condition_matches：逐条匹配结果\n"
            "- source_quote：原文引用（必须展示给用户）\n"
            "- missing_info：缺失信息\n"
            "示例：用户说'我的GPA3.7，有1篇SCI论文，符合哪些保研政策？'时调用此工具。"
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
                        "extra": {
                            "type": "object",
                            "description": "自定义扩展字段，如志愿服务时长等",
                        },
                    },
                    "required": [],
                },
                "category": {
                    "type": "string",
                    "description": "筛选分类（可选），不填则查询所有分类",
                    "enum": list(Config.CATEGORIES.keys()),
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
        name="clear_knowledge_base",
        description=(
            "【清空知识库工具】\n"
            "功能：清空知识库中的所有政策数据。此操作不可恢复，请谨慎使用。\n"
            "触发条件：当用户明确要求清空或删除所有政策时使用此工具：\n"
            "- 清空知识库、删除所有政策、重置知识库\n"
            "- 清除所有数据、清空政策库\n"
            "注意：此操作会删除所有已加载的政策文档，执行前建议确认用户意图。"
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
        elif name == "clear_knowledge_base":
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

        if not policies:
            return [
                TextContent(
                    type="text",
                    text=json.dumps(
                        {"error": "知识库中没有找到相关政策，请先使用 load_policy_document 加载政策文档"},
                        ensure_ascii=False,
                    ),
                )
            ]

        # 2. 逐条匹配
        results = matcher.match_all_policies(user_info, policies)

        # 3. 按 verdict 排序
        verdict_order = {"likely_eligible": 0, "needs_review": 1, "needs_more_info": 2, "not_eligible": 3}
        results.sort(key=lambda x: verdict_order.get(x["overall_verdict"], 99))

        output = {
            "total_policies": len(results),
            "results": results,
        }
        return [TextContent(type="text", text=json.dumps(output, ensure_ascii=False, indent=2))]

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
    """清空知识库"""
    try:
        result = store.clear()
        return [TextContent(type="text", text=json.dumps({"success": True, "message": result}, ensure_ascii=False))]
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
