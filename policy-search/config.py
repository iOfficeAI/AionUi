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

    # 知识库根目录（始终解析为绝对路径，避免 MCP Server 被外部启动时 CWD 不对）
    _KB_DIR_RAW: str = os.getenv(
        "KNOWLEDGE_BASE_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge_base")
    )
    KNOWLEDGE_BASE_DIR: str = (
        _KB_DIR_RAW
        if os.path.isabs(_KB_DIR_RAW)
        else os.path.join(os.path.dirname(os.path.abspath(__file__)), _KB_DIR_RAW)
    )

    # 文档分块参数（用于长文档解析）
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "2000"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "200"))

    # 分类标识
    CATEGORIES = {
        "postgraduate_recommendation": "保研/推免",
        "scholarship": "奖学金",
        "financial_aid": "助学金/资助",
        "academic": "学业管理",
        "discipline": "纪律处分",
        "exchange": "交流交换",
        "employment": "就业创业",
        "other": "其他",
    }

    # 条件类型
    CONDITION_TYPES = {
        "hard": "硬性门槛",
        "scoring": "评分项",
        "ranking": "排名项",
        "bonus": "加分项",
        "preference": "优先条件",
        "procedural": "流程性要求",
        "qualitative": "模糊定性条件",
    }

    # 要求分类（用于结构化存储）
    REQUIREMENT_CATEGORIES = {
        "gpa": "绩点/成绩要求",
        "foreign_language": "外语要求",
        "academic": "学业表现要求",
        "disciplinary": "纪律/品行要求",
        "research": "科研/论文要求",
        "competition": "竞赛/获奖要求",
        "bonus": "加分项",
        "procedural": "流程性要求",
        "health": "健康要求",
        "other": "其他要求",
    }
