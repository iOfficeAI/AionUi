"""RAG MCP Server - 通过 MCP 协议向 Agent 暴露知识库检索能力

本 server 是检索型 (retrieval-only) 工具: 只负责返回相关文档块
(text + 来源 + 页码 + 相似度分数)，答案由调用方 Agent 自己的 LLM 生成。

注意: stdio 模式下 stdout 是 JSON-RPC 协议通道，任何 print 都会污染协议流，
因此这里统一使用 logging 输出到 stderr。
"""

import asyncio
import json
import logging
import sys

from mcp.server.fastmcp import FastMCP

from config import Config
from rag_engine import RAGEngine, results_to_text

# 日志必须先于任何组件初始化配置，且只写 stderr
logging.basicConfig(
    stream=sys.stderr,
    level=getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("rag_server")

engine = RAGEngine()
mcp = FastMCP("rag-mcp-server")


def _err_text(payload_or_message: object) -> str:
    """统一错误输出格式"""
    if isinstance(payload_or_message, dict):
        return json.dumps(payload_or_message, ensure_ascii=False, indent=2)
    return f"错误: {payload_or_message}"


@mcp.tool()
async def load_pdf(pdf_path: str) -> str:
    """加载本地 PDF 文件到知识库：解析为 Markdown、按句子智能分块、向量化入库。

    幂等: 同一文件重复加载会自动跳过；文件内容更新后重新加载会替换旧版本。
    仅支持 PDF；其他格式请使用 load_document。
    """
    try:
        if not pdf_path.lower().endswith(".pdf"):
            return "错误: load_pdf 仅支持 PDF 文件，其他格式请使用 load_document 工具"
        return await asyncio.to_thread(engine.load_document, pdf_path)
    except Exception as e:
        logger.exception("load_pdf 失败")
        return _err_text(f"加载失败 - {e}")


@mcp.tool()
async def load_document(file_path: str) -> str:
    """加载本地文档到知识库，支持 PDF / TXT / MD / DOCX，按扩展名自动识别。

    PDF 解析为 Markdown 并记录页码；TXT/MD 按原编码读取（utf-8/gbk 自动尝试）；
    DOCX 提取正文段落与表格文本。以上格式统一分块后向量化入库。

    幂等: 同一文件重复加载会自动跳过；文件内容更新后重新加载会替换旧版本。
    """
    try:
        return await asyncio.to_thread(engine.load_document, file_path)
    except Exception as e:
        logger.exception("load_document 失败")
        return _err_text(f"加载失败 - {e}")


@mcp.tool()
async def search(question: str, top_k: int | None = None) -> str:
    """在知识库中检索与问题最相关的文档块（向量语义检索）。

    返回 JSON: results 数组，每项含 text(文档块原文)、source(来源文件路径)、
    page(页码, 1-based，仅 PDF 有，其他格式为 null)、similarity(相似度 0~1)、chunk_index。

    相似度低于阈值的结果已被过滤。若 results 为空且响应含 best_similarity 与 hint 字段，
    说明知识库非空但没有与问题相关的内容（hint 中给出了最高候选相似度），
    此时请直接告知用户未找到相关内容，不要凭空编造，也不要盲目重试相同问题。
    请基于返回的文档块原文回答用户问题，并注明来源文件与页码。
    """
    try:
        payload = await asyncio.to_thread(engine.search, question, top_k)
        if payload.get("error"):
            return _err_text(payload)
        return results_to_text(payload)
    except Exception as e:
        logger.exception("search 失败")
        return _err_text(f"检索失败 - {e}")


@mcp.tool()
async def list_documents() -> str:
    """列出知识库中的所有文档（来源路径、文档块数量、页码范围）。"""
    try:
        return await asyncio.to_thread(lambda: results_to_text(engine.list_documents()))
    except Exception as e:
        logger.exception("list_documents 失败")
        return _err_text(f"列举失败 - {e}")


@mcp.tool()
async def delete_document(source: str) -> str:
    """从知识库中删除单个文档的全部内容。source 必须是 list_documents 返回的完整路径。"""
    try:
        return await asyncio.to_thread(engine.delete_document, source)
    except Exception as e:
        logger.exception("delete_document 失败")
        return _err_text(f"删除失败 - {e}")


@mcp.tool()
async def clear_knowledge_base() -> str:
    """清空知识库中的所有文档（危险操作，不可恢复）。"""
    try:
        return await asyncio.to_thread(engine.clear)
    except Exception as e:
        logger.exception("clear_knowledge_base 失败")
        return _err_text(f"清空失败 - {e}")


def main() -> None:
    logger.info("RAG MCP Server 启动 (stdio)")
    mcp.run()  # 默认 stdio transport


if __name__ == "__main__":
    main()
