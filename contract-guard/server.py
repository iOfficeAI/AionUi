"""MCP Server — 基于 mcp SDK 的 FastMCP 实现。"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

# 确保项目根目录在 sys.path 中
_project_root = Path(__file__).parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

# 加载 .env 文件（如果存在）
_env_file = _project_root / ".env"
if _env_file.exists():
    load_dotenv(_env_file)
else:
    # 尝试从 .env.example 复制一份（仅用于提示）
    _example_file = _project_root / ".env.example"
    if _example_file.exists():
        print(
            "⚠️  警告: 未找到 .env 文件，请复制 .env.example 为 .env 并填入 API Key。",
            file=sys.stderr,
        )

# 日志只写 stderr
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("contract_scan_mcp")

from mcp.server.fastmcp import FastMCP

from engine.merger import scan_contract

mcp = FastMCP("contract-scan")


@mcp.tool()
def contract_scan(
    contract_text: str,
    contract_type: str = "unknown",
    city_min_wage: float = 0,
    skip_llm: bool = False,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> str:
    """【合同风险扫描工具】用户提供合同/协议文本后，必须先调用本工具做风险分析，不要自行阅读合同直接下结论。面向中国大学生和应届毕业生，支持租房合同、实习协议、劳动合同、保密协议的风险扫描，结合正则硬规则（中国法规）和 LLM 智能分析，输出结构化 JSON 报告。

    触发条件（满足任一即须调用，且应作为分析的第一步；合同/协议类问题以本工具为唯一分析入口）：
    - 用户粘贴/上传了合同、协议文本（含"甲方/乙方/试用期/违约金/押金/竞业限制"等特征词）；
    - 用户问"这份合同有没有问题/有没有坑/帮我看看/有什么风险/合不合理"等；
    - 用户就具体条款询问合法合规性：试用期工资比例、试用期时长、竞业补偿、押金退还、违约金等。

    反幻觉约定（必须遵守，保证结论可复现、可追溯）：
    - 严禁绕过本工具自行计算或推断结论（例如自行心算"3000÷5000=60%"、自行断定"试用期三个月合法"）；一切判定以本工具返回的检查结果为准。
    - statute_checks 中 status=unknown 表示规则无法从文本中提取判定所需信息（≠合规）：如实向用户说明"该项无法自动判定"并建议人工核对，不得用常识或经验补足具体数值。
    - 回答须区分"工具检查结论"（有 rule_id/basis/quote 依据）与自己的补充说明；不得给出工具未覆盖的具体法律结论。

    Args:
        contract_text: 合同全文（纯文本）
        contract_type: 合同类型，可选 rental/internship/employment/nda/unknown
        city_min_wage: 所在城市最低工资（元），用于竞业补偿等规则校验
        skip_llm: 是否跳过 LLM 分析（仅运行正则规则检查），默认 False 启用 LLM
        api_key: DashScope API key（如 DASHSCOPE_API_KEY 已配置在环境变量则无需传入）
        base_url: API 基础 URL（默认 https://dashscope.aliyuncs.com/compatible-mode/v1）
        model: LLM 模型名（默认 qwen-plus）

    返回 JSON 信封（ok/data/sources/warnings/meta），data 含：
    - statute_checks：逐条法规规则检查（rule_id、title、basis、status=ok/violation/unknown、detail、quote、source）；
    - red_flags / warnings / good_clauses / missing_protections、summary、key_terms；
    - fairness_score（0-100）/ fairness_grade（A+~F）、mermaid_chart（条款风险分布图）、sources（法规依据）。
    """
    start_time = time.time()
    request_id = str(uuid.uuid4())[:8]

    if len(contract_text.strip()) < 50:
        return json.dumps({
            "ok": False,
            "data": {},
            "sources": [],
            "warnings": ["合同文本过短（少于50字符），无法进行有效分析"],
            "meta": {"request_id": request_id, "tool": "contract_scan"},
        }, ensure_ascii=False, indent=2)

    try:
        result = scan_contract(
            contract_text=contract_text,
            contract_type=contract_type,
            lang="zh",
            skip_llm=skip_llm,
            api_key=api_key,
            base_url=base_url,
            model=model,
        )

        elapsed_ms = int((time.time() - start_time) * 1000)

        return json.dumps({
            "ok": True,
            "data": result,
            "sources": result.get("sources", []),
            "warnings": [],
            "meta": {
                "request_id": request_id,
                "tool": "contract_scan",
                "elapsed_ms": elapsed_ms,
            },
        }, ensure_ascii=False, indent=2)

    except ValueError as e:
        return json.dumps({
            "ok": False,
            "data": {},
            "sources": [],
            "warnings": [str(e)],
            "meta": {"request_id": request_id, "tool": "contract_scan"},
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "ok": False,
            "data": {},
            "sources": [],
            "warnings": [f"内部错误: {type(e).__name__}: {e}"],
            "meta": {"request_id": request_id, "tool": "contract_scan"},
        }, ensure_ascii=False, indent=2)


def main() -> None:
    logger.info("Contract Scan MCP Server 启动 (stdio)")
    mcp.run()  # 默认 stdio transport


if __name__ == "__main__":
    main()
