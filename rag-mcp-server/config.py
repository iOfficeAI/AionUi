"""配置管理模块"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """全局配置"""

    # DashScope API Key
    DASHSCOPE_API_KEY: str = os.getenv("DASHSCOPE_API_KEY", "")

    # Embedding 模型
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-v4")

    # ChromaDB 持久化目录
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")

    # 文档分块参数（字符数，供 RecursiveCharacterTextSplitter 使用）
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "500"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "50"))

    # 检索参数：默认返回条数与相似度下限（cosine similarity，低于该值的块不返回）
    TOP_K: int = int(os.getenv("TOP_K", "3"))
    SCORE_THRESHOLD: float = float(os.getenv("SCORE_THRESHOLD", "0.3"))

    # DashScope text-embedding-v4 单次请求条数上限
    EMBED_BATCH_SIZE: int = int(os.getenv("EMBED_BATCH_SIZE", "10"))

    # Embedding API 失败重试次数
    EMBED_MAX_RETRIES: int = int(os.getenv("EMBED_MAX_RETRIES", "3"))

    # 日志级别（日志一律写 stderr，不污染 stdio 协议流）
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
