"""RAG 核心引擎 - 文档加载、分块、向量化、检索"""

import os
from typing import List, Optional
import pdfplumber
import chromadb
from chromadb.config import Settings
from config import Config


class RAGEngine:
    """RAG 引擎：处理文档加载、分块、向量化和检索"""

    def __init__(self):
        """初始化 RAG 引擎"""
        # 初始化 ChromaDB 客户端
        self.chroma_client = chromadb.PersistentClient(path=Config.CHROMA_PERSIST_DIR)
        # 获取或创建集合
        self.collection = self.chroma_client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}  # 使用余弦相似度
        )
        print(f"[RAGEngine] 初始化完成，当前文档块数量: {self.collection.count()}")

    def load_pdf(self, pdf_path: str) -> str:
        """
        加载 PDF 文件，提取文本，分块，向量化并存储

        Args:
            pdf_path: PDF 文件路径

        Returns:
            处理结果信息
        """
        if not os.path.exists(pdf_path):
            return f"错误: 文件不存在 - {pdf_path}"

        print(f"[RAGEngine] 开始加载 PDF: {pdf_path}")

        # 1. 提取文本
        text = self._extract_text_from_pdf(pdf_path)
        if not text.strip():
            return f"错误: 无法从 PDF 提取到文本 - {pdf_path}"

        print(f"[RAGEngine] 提取文本长度: {len(text)} 字符")

        # 2. 分块
        chunks = self._split_text(text)
        print(f"[RAGEngine] 分块数量: {len(chunks)}")

        # 3. 向量化并存储
        self._embed_and_store(chunks, source=pdf_path)
        print(f"[RAGEngine] 向量化完成，总文档块数量: {self.collection.count()}")

        return f"成功加载 PDF: {os.path.basename(pdf_path)}，共 {len(chunks)} 个文档块"

    def _extract_text_from_pdf(self, pdf_path: str) -> str:
        """从 PDF 提取文本"""
        text_parts = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n\n".join(text_parts)

    def _split_text(self, text: str) -> List[str]:
        """将文本按固定大小分块，带重叠"""
        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = start + Config.CHUNK_SIZE
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - Config.CHUNK_OVERLAP  # 重叠部分

        return chunks

    def _embed_and_store(self, chunks: List[str], source: str):
        """将文档块向量化并存储到 ChromaDB"""
        if not chunks:
            return

        # 调用 DashScope Embedding API
        import dashscope
        from dashscope import TextEmbedding

        dashscope.api_key = Config.DASHSCOPE_API_KEY

        # DashScope text-embedding-v4 限制每次最多 10 条，分批处理
        batch_size = 10
        all_embeddings = []
        all_ids = []
        all_metadatas = []

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            response = TextEmbedding.call(
                model=Config.EMBEDDING_MODEL,
                input=batch
            )

            if response.status_code != 200:
                raise Exception(f"Embedding API 调用失败: {response.message}")

            embeddings = [item["embedding"] for item in response.output["embeddings"]]
            all_embeddings.extend(embeddings)

            # 生成 ID 和元数据
            for j, chunk in enumerate(batch):
                idx = i + j
                all_ids.append(f"{source}_chunk_{idx}")
                all_metadatas.append({
                    "source": source,
                    "chunk_index": idx,
                    "text": chunk
                })

        # 存储到 ChromaDB
        self.collection.add(
            ids=all_ids,
            embeddings=all_embeddings,
            metadatas=all_metadatas,
            documents=[m["text"] for m in all_metadatas]
        )

    def query(self, question: str, top_k: int = 3) -> dict:
        """
        查询知识库

        Args:
            question: 用户问题
            top_k: 返回最相关的 K 个文档块

        Returns:
            包含上下文和来源的字典
        """
        if self.collection.count() == 0:
            return {
                "context": "",
                "sources": [],
                "error": "知识库为空，请先加载 PDF 文档"
            }

        # 1. 将问题向量化
        import dashscope
        from dashscope import TextEmbedding

        dashscope.api_key = Config.DASHSCOPE_API_KEY

        response = TextEmbedding.call(
            model=Config.EMBEDDING_MODEL,
            input=[question]
        )

        if response.status_code != 200:
            return {
                "context": "",
                "sources": [],
                "error": f"Embedding API 调用失败: {response.message}"
            }

        query_embedding = response.output["embeddings"][0]["embedding"]

        # 2. 检索相关文档块
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )

        # 3. 组装结果
        contexts = []
        sources = set()

        if results["metadatas"] and results["metadatas"][0]:
            for metadata in results["metadatas"][0]:
                contexts.append(metadata["text"])
                sources.add(metadata["source"])

        context = "\n\n---\n\n".join(contexts)

        return {
            "context": context,
            "sources": list(sources),
            "error": None
        }

    def clear(self) -> str:
        """清空知识库"""
        # 删除集合并重新创建
        self.chroma_client.delete_collection("documents")
        self.collection = self.chroma_client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )
        return "知识库已清空"
