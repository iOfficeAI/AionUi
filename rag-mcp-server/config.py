"""配置管理模块"""

import os
from pathlib import Path

from dotenv import load_dotenv

# 显式按本文件所在目录定位 .env：stdio MCP 服务由宿主进程拉起，工作目录不可靠
# （可能被置为任意路径），绝不能用相对路径找配置。
# override=False：宿主注入的环境变量（如 DASHSCOPE_API_KEY）优先于 .env 兜底。
load_dotenv(Path(__file__).resolve().parent / ".env")


def _env_bool(name: str, default: bool) -> bool:
    """读取布尔型环境变量（1/true/yes/on 为真，不区分大小写）"""
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


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

    # —— 检索参数（两阶段：混合召回 + 重排序精排）——
    # TOP_K: 精排后实际返回给 Agent 的文档块数量
    TOP_K: int = int(os.getenv("TOP_K", "3"))
    # RECALL_TOP_N: 粗召回窗口大小（须显著大于 TOP_K，否则精排没有意义）
    RECALL_TOP_N: int = int(os.getenv("RECALL_TOP_N", "20"))
    # SCORE_THRESHOLD: 粗召回阶段的余弦下限（宽松粗筛「明显无关」）；
    # rerank 降级（不可调用）时也用它作为过滤阈值
    SCORE_THRESHOLD: float = float(os.getenv("SCORE_THRESHOLD", "0.3"))

    # DashScope text-embedding-v4 单次请求条数上限
    EMBED_BATCH_SIZE: int = int(os.getenv("EMBED_BATCH_SIZE", "10"))

    # Embedding API 失败重试次数
    EMBED_MAX_RETRIES: int = int(os.getenv("EMBED_MAX_RETRIES", "3"))

    # —— 重排序精排（DashScope TextReRank）——
    RERANK_ENABLED: bool = _env_bool("RERANK_ENABLED", True)
    # gte-rerank-v2: 分离度干净、适合阈值过滤（qwen3-rerank 底部噪声大）
    RERANK_MODEL: str = os.getenv("RERANK_MODEL", "gte-rerank-v2")
    # 精排分数下限，低于该值不返回（按真实知识库实测标定，见 .env 注释）
    RERANK_THRESHOLD: float = float(os.getenv("RERANK_THRESHOLD", "0.25"))
    # 单次送入精排的最大文档数（防超长请求）
    RERANK_MAX_DOCS: int = int(os.getenv("RERANK_MAX_DOCS", "500"))
    # 精排调用失败重试次数（总尝试次数）
    RERANK_MAX_RETRIES: int = int(os.getenv("RERANK_MAX_RETRIES", "2"))
    # HTTP 读超时（秒）。SDK 默认 300 秒过长；实现须以 request_timeout 传给
    # SDK（用 timeout 会被塞进请求体被服务端忽略，形成"假超时"）
    RERANK_TIMEOUT: int = int(os.getenv("RERANK_TIMEOUT", "30"))

    # —— BM25 关键词召回（补足文号/条款号/数字阈值等精确 token）——
    BM25_ENABLED: bool = _env_bool("BM25_ENABLED", True)
    # RRF 融合平滑常数，经验值 60
    RRF_K: int = int(os.getenv("RRF_K", "60"))

    # 日志级别（日志一律写 stderr，不污染 stdio 协议流）
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
