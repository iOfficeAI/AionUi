"""配置管理模块"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """全局配置"""

    # DashScope API Key
    DASHSCOPE_API_KEY: str = os.getenv("DASHSCOPE_API_KEY", "")

    # LLM 模型
    LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen3.7-plus")

    # Embedding 模型
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-v4")

    # ChromaDB 持久化目录
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")

    # 文档分块参数
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "500"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "50"))
