#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Policy Comparison MCP Server — 政策对比（接口契约 v1）

单工具服务：compare_policy_versions
输入两个政策版本（路径 / 规则库标题 / 文件名），输出契约 v1 的 PolicyDiffResult：
    {"document": {...}, "summary": {...}, "changes": [...]}

定位策略（前端只传“名称”，本服务需自行把名称解析为文档）：
    1) 路径：绝对/相对路径存在则直接读取（pdf/docx/txt/md/json）
    2) 规则库：在 policy-search 知识库 index.json 中按标题模糊匹配
    3) 搜索目录：在 POLICY_COMPARE_SEARCH_DIRS（默认桌面/下载/文档）中按文件名匹配

对比引擎：
    - 优先 LLM 语义对比（DashScope；Key 由宿主应用注入 env）
    - 未配置 Key / 调用失败 / 超时 → 自动降级 difflib 规则对比（无 aiExplanation）
"""

import asyncio
import json
import logging
import sys
import time
from typing import Any, Dict, List, Optional

# 配置日志输出到 stderr，避免污染 stdout 的 JSON-RPC 响应
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    stream=sys.stderr,
    force=True,
)
logger = logging.getLogger(__name__)

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Tool,
    TextContent,
    ListToolsResult,
)

from config import Config
from doc_loader import (
    DocumentError,
    DocumentNotFound,
    resolve_document,
)
from differ import compare_policies


# ============================================================
# 服务实例
# ============================================================

server = Server("policy_comparison")

_log_llm_state = "已配置 DASHSCOPE_API_KEY（将优先 LLM 语义对比）" if Config.DASHSCOPE_API_KEY else "未配置 DASHSCOPE_API_KEY（规则对比）"
logger.info(f"PolicyComparison MCP Server 启动: {_log_llm_state}")
logger.info(f"知识库目录: {Config.KNOWLEDGE_BASE_DIR}")
logger.info(f"搜索目录: {Config.SEARCH_DIRS or '（无可用目录）'}")


# ============================================================
# 工具定义
# ============================================================

TOOLS: List[Tool] = [
    Tool(
        name="compare_policy_versions",
        description=(
            "对比两个政策文件版本的差异，返回结构化的变化清单（PolicyDiffResult）。"
            "当用户需要对比 / 比较两份政策的版本差异时调用本工具。"
            "参数 old_policy / new_policy 直接传入用户给出的名称即可，支持三种形式："
            "① 文件绝对路径；② 规则库中的政策标题（如《重庆邮电大学学生奖学金管理办法》）；"
            "③ 桌面/下载/文档目录下的文件名。"
            "本工具会自动定位并读取文件全文（支持 pdf/docx/txt/md/json），调用方无需预读文件、无需传入文件内容。"
            "返回 JSON：document（政策名称与版本）、summary（变化统计）、changes（逐条变化："
            "类型 modified/added/removed、新旧条款内容、上下文、可选 AI 说明）。"
            "若定位失败，返回 errorType=document_not_found 及 candidates 候选列表，可据此请用户确认准确名称。"
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "old_policy": {
                    "type": "string",
                    "description": "旧政策：文件路径，或规则库标题 / 文件名，例如《学生奖学金管理办法》（2024版）",
                },
                "new_policy": {
                    "type": "string",
                    "description": "新政策：文件路径，或规则库标题 / 文件名，例如《学生奖学金管理办法》（2025版）",
                },
                "document_name": {
                    "type": "string",
                    "description": "可选：覆盖输出中的政策名称（默认由两个文件名自动推导）",
                },
                "old_version": {
                    "type": "string",
                    "description": "可选：覆盖旧版本号（默认从文件名/知识库元数据推断，如 2024版）",
                },
                "new_version": {
                    "type": "string",
                    "description": "可选：覆盖新版本号（默认从文件名/知识库元数据推断，如 2025版）",
                },
            },
            "required": ["old_policy", "new_policy"],
            "additionalProperties": False,
        },
    ),
]


# ============================================================
# 输出辅助
# ============================================================


def _error(message: str, error_type: str, **extra: Any) -> List[TextContent]:
    """构造错误输出（紧凑 JSON，附加信息仅在非空时携带）"""
    payload: Dict[str, Any] = {"error": message, "errorType": error_type}
    for key, value in extra.items():
        if value:
            payload[key] = value
    return [TextContent(type="text", text=json.dumps(payload, ensure_ascii=False, separators=(",", ":")))]


def _source_of(doc: Dict[str, Any]) -> Dict[str, str]:
    """文档来源摘要（用于 _meta / 排障）"""
    return {
        "origin": doc.get("origin") or "",
        "id": doc.get("doc_id") or doc.get("path") or "",
    }


# ============================================================
# MCP 协议处理
# ============================================================


@server.list_tools()
async def handle_list_tools() -> ListToolsResult:
    """返回所有可用工具"""
    return ListToolsResult(tools=TOOLS)


@server.call_tool()
async def handle_call_tool(name: str, arguments: Optional[Dict[str, Any]]) -> List[TextContent]:
    """处理工具调用"""
    try:
        if name == "compare_policy_versions":
            return await _handle_compare_policy_versions(arguments or {})
        return _error(f"未知工具: {name}", "unknown_tool")
    except Exception as e:
        logger.exception("工具调用异常")
        return _error(str(e), "internal_error")


# ============================================================
# 工具实现
# ============================================================


async def _handle_compare_policy_versions(arguments: Dict[str, Any]) -> List[TextContent]:
    """compare_policy_versions：定位两份政策 → 对比 → 契约化输出"""
    old_spec = str(arguments.get("old_policy") or "").strip()
    new_spec = str(arguments.get("new_policy") or "").strip()
    if not old_spec or not new_spec:
        return _error("参数 old_policy 与 new_policy 均不能为空", "invalid_arguments")

    started = time.perf_counter()

    # ---- 1. 定位两份文档（阻塞 IO 放线程池，保持事件循环可响应） ----
    try:
        old_doc = await asyncio.to_thread(resolve_document, old_spec)
    except DocumentNotFound as e:
        return _error(
            f"未找到政策文件（old_policy）：{e.spec}",
            "document_not_found",
            input=e.spec,
            candidates=e.candidates,
            hint="可改用文件绝对路径，或将文件放入桌面/下载/文档目录，或先将文档加入规则库",
        )
    except DocumentError as e:
        return _error(f"读取旧政策失败：{e}", "document_unreadable", input=old_spec)

    try:
        new_doc = await asyncio.to_thread(resolve_document, new_spec)
    except DocumentNotFound as e:
        return _error(
            f"未找到政策文件（new_policy）：{e.spec}",
            "document_not_found",
            input=e.spec,
            candidates=e.candidates,
            hint="可改用文件绝对路径，或将文件放入桌面/下载/文档目录，或先将文档加入规则库",
        )
    except DocumentError as e:
        return _error(f"读取新政策失败：{e}", "document_unreadable", input=new_spec)

    logger.info(
        f"文档定位完成: old={old_doc['name']}({old_doc['origin']}, {len(old_doc['text'])}字) "
        f"new={new_doc['name']}({new_doc['origin']}, {len(new_doc['text'])}字)"
    )

    # ---- 2. 对比（LLM 优先，失败自动降级规则引擎） ----
    overrides = {
        "document_name": str(arguments.get("document_name") or "").strip(),
        "old_version": str(arguments.get("old_version") or "").strip(),
        "new_version": str(arguments.get("new_version") or "").strip(),
    }
    overrides = {k: v for k, v in overrides.items() if v}

    try:
        result = await asyncio.to_thread(compare_policies, old_doc, new_doc, overrides)
    except Exception as e:
        logger.exception("对比过程异常")
        return _error(f"对比失败：{e}", "compare_failed")

    engine = result.pop("engine", "rule")
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    # ---- 3. 契约输出（document / summary / changes + _meta 辅助信息） ----
    output: Dict[str, Any] = result
    output["_meta"] = {
        "engine": engine,
        "oldSource": _source_of(old_doc),
        "newSource": _source_of(new_doc),
        "elapsedMs": elapsed_ms,
    }
    if old_doc.get("path") and old_doc.get("path") == new_doc.get("path"):
        output["warning"] = "两个输入定位到同一份文档，对比结果可能没有意义，请确认新旧版本是否正确"

    logger.info(
        f"对比完成: engine={engine}, changes={len(result.get('changes') or [])}, 耗时 {elapsed_ms}ms"
    )
    return [TextContent(type="text", text=json.dumps(output, ensure_ascii=False, separators=(",", ":")))]


# ============================================================
# 启动
# ============================================================


async def main():
    """启动 MCP Server"""
    logger.info("PolicyComparison MCP Server 启动中...")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
