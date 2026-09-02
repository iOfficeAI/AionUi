"""RAG MCP Server - 通过 MCP 协议暴露 RAG 能力给 AionUi Agent"""

import asyncio
import os
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from rag_engine import RAGEngine
from llm_client import LLMClient

# 初始化组件
rag_engine = RAGEngine()
llm_client = LLMClient()

# 创建 MCP Server
server = Server("rag-mcp-server")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """列出所有可用的 MCP 工具"""
    return [
        Tool(
            name="load_pdf",
            description="加载本地 PDF 文件到知识库。提取文本、分块、向量化后存入向量数据库。",
            inputSchema={
                "type": "object",
                "properties": {
                    "pdf_path": {
                        "type": "string",
                        "description": "PDF 文件的绝对路径"
                    }
                },
                "required": ["pdf_path"]
            }
        ),
        Tool(
            name="query",
            description="基于知识库回答问题。先从知识库中检索相关文档片段，然后结合上下文生成回答。",
            inputSchema={
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "用户的问题"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "检索最相关的文档块数量，默认 3",
                        "default": 3
                    }
                },
                "required": ["question"]
            }
        ),
        Tool(
            name="clear_knowledge_base",
            description="清空知识库中的所有文档",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """处理工具调用"""

    if name == "load_pdf":
        pdf_path = arguments.get("pdf_path", "")
        result = rag_engine.load_pdf(pdf_path)
        return [TextContent(type="text", text=result)]

    elif name == "query":
        question = arguments.get("question", "")
        top_k = arguments.get("top_k", 3)

        # 1. 检索相关文档
        retrieval_result = rag_engine.query(question, top_k=top_k)

        if retrieval_result.get("error"):
            return [TextContent(type="text", text=f"检索失败: {retrieval_result['error']}")]

        context = retrieval_result["context"]
        sources = retrieval_result["sources"]

        if not context:
            return [TextContent(type="text", text="知识库中未找到相关信息。")]

        # 2. 基于上下文生成回答
        llm_result = llm_client.generate(question, context)

        if not llm_result["success"]:
            return [TextContent(type="text", text=llm_result["answer"])]

        # 3. 组装最终回答
        answer = llm_result["answer"]
        if sources:
            answer += f"\n\n---\n📚 参考来源: {', '.join(os.path.basename(s) for s in sources)}"

        return [TextContent(type="text", text=answer)]

    elif name == "clear_knowledge_base":
        result = rag_engine.clear()
        return [TextContent(type="text", text=result)]

    else:
        return [TextContent(type="text", text=f"未知工具: {name}")]


async def main():
    """启动 MCP Server"""
    print("[RAG MCP Server] 启动中...")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
