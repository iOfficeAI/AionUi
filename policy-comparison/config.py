"""配置管理模块 — 政策对比 MCP Server"""

import os

from dotenv import load_dotenv

# 模块根目录（始终解析为绝对路径，避免 MCP Server 被外部启动时 CWD 不对）
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))

# 优先加载模块目录下的 .env（不随启动 CWD 变化），再兼容外部注入的环境变量
load_dotenv(os.path.join(MODULE_DIR, ".env"))
load_dotenv()


def _resolve_against_module(path: str) -> str:
    """相对路径统一按模块目录解析为绝对路径"""
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(MODULE_DIR, path))


def _parse_dirs(raw: str) -> list:
    """解析分号/逗号分隔的目录列表（支持 ~ 展开），过滤不存在的目录"""
    items = []
    for part in raw.replace(";", ",").split(","):
        part = part.strip().strip('"').strip("'")
        if not part:
            continue
        expanded = os.path.expanduser(part)
        if os.path.isdir(expanded):
            items.append(os.path.abspath(expanded))
    return items


class Config:
    """全局配置"""

    MODULE_DIR = MODULE_DIR

    # ---- LLM ----
    # DashScope API Key（应用侧会自动注入；无 key 时自动降级为规则对比）
    DASHSCOPE_API_KEY: str = os.getenv("DASHSCOPE_API_KEY", "")

    # LLM 模型：优先 POLICY_COMPARE_LLM_MODEL，其次 LLM_MODEL
    LLM_MODEL: str = os.getenv("POLICY_COMPARE_LLM_MODEL") or os.getenv("LLM_MODEL", "qwen3.7-plus")

    # LLM 超时（秒）。前端仅轮询 30s（含 Agent 决策耗时），超时即降级规则对比尽快返回
    LLM_TIMEOUT: int = int(os.getenv("POLICY_COMPARE_LLM_TIMEOUT", "20"))

    # 是否禁用 LLM（设置为 1/true 时强制走规则对比，便于离线调试）
    _disable_llm_raw: str = os.getenv("POLICY_COMPARE_DISABLE_LLM", "").strip().lower()
    LLM_DISABLED: bool = _disable_llm_raw in ("1", "true", "yes", "on")

    # ---- 输入文本控制 ----
    # 送入 LLM 的单篇文本最大字符数（超出截断并记录警告，保证时延可控）
    MAX_TEXT_CHARS: int = int(os.getenv("POLICY_COMPARE_MAX_TEXT_CHARS", "12000"))

    # ---- 输出契约限制（政策对比模块-MCP接口契约 v1）----
    MAX_CHANGES: int = int(os.getenv("POLICY_COMPARE_MAX_CHANGES", "20"))
    MAX_CONTENT_CHARS: int = int(os.getenv("POLICY_COMPARE_MAX_CONTENT_CHARS", "500"))
    MAX_EXPLANATION_CHARS: int = int(os.getenv("POLICY_COMPARE_MAX_EXPLANATION_CHARS", "100"))
    MAX_CONTEXT_ITEMS: int = 2
    MAX_CONTEXT_ITEM_CHARS: int = int(os.getenv("POLICY_COMPARE_MAX_CONTEXT_CHARS", "300"))

    # ---- 文件定位 ----
    # policy-search 知识库目录（"规则库"文件按标题解析；支持相对路径，按模块目录解析）
    _kb_raw: str = os.getenv("KNOWLEDGE_BASE_DIR", "")
    KNOWLEDGE_BASE_DIR: str = (
        _resolve_against_module(_kb_raw)
        if _kb_raw
        else os.path.normpath(os.path.join(MODULE_DIR, "..", "policy-search", "knowledge_base"))
    )

    # 按文件名搜索的目录（上传文件场景；分号/逗号分隔；默认常见用户目录）
    _search_raw: str = os.getenv(
        "POLICY_COMPARE_SEARCH_DIRS",
        ";".join(
            [
                os.path.join(os.path.expanduser("~"), "Desktop"),
                os.path.join(os.path.expanduser("~"), "Downloads"),
                os.path.join(os.path.expanduser("~"), "Documents"),
            ]
        ),
    )
    SEARCH_DIRS: list = _parse_dirs(_search_raw)

    # 搜索目录遍历限制（防止大目录阻塞）
    SEARCH_MAX_DEPTH: int = int(os.getenv("POLICY_COMPARE_SEARCH_MAX_DEPTH", "3"))
    SEARCH_MAX_FILES: int = int(os.getenv("POLICY_COMPARE_SEARCH_MAX_FILES", "3000"))

    # 支持的文件扩展名
    SUPPORTED_EXTS = (".pdf", ".docx", ".doc", ".txt", ".md", ".json")

    # 名称模糊匹配的最低相似度
    MATCH_THRESHOLD: float = float(os.getenv("POLICY_COMPARE_MATCH_THRESHOLD", "0.6"))
