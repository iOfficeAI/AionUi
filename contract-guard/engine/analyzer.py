"""DashScope/qwen-plus 适配器 — 替换 ContractGuard 原版的 OpenRouter 调用。

保持 analyze_contract() 函数签名不变，确保上游调用不受影响。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

# 加载 .env 文件（如果存在）
_this_dir = Path(__file__).parent
_env_file = _this_dir.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file)

from openai import OpenAI
from pydantic import ValidationError

from engine.models import AnalysisResult
from engine.prompts_zh import get_prompts

DEFAULT_MODEL = "qwen-plus"
MAX_CONTRACT_CHARS = 120_000  # ~30K tokens


def get_client(
    api_key: str | None = None,
    base_url: str | None = None,
) -> OpenAI:
    """Create a DashScope-compatible OpenAI client."""
    api_key = api_key or os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("OPENAI_API_KEY")
    base_url = base_url or os.environ.get("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")

    if not api_key:
        raise ValueError(
            "No API key found. Set one of:\n"
            "  export DASHSCOPE_API_KEY=sk-...\n"
            "  export OPENAI_API_KEY=sk-...\n"
            "Or pass --api-key to the CLI."
        )

    return OpenAI(api_key=api_key, base_url=base_url)


def analyze_contract(
    contract_text: str,
    model: str = DEFAULT_MODEL,
    api_key: str | None = None,
    base_url: str | None = None,
    lang: str = "zh",
) -> AnalysisResult:
    """Analyze a contract and return structured results.

    Args:
        contract_text: The full text of the contract.
        model: The LLM model to use (DashScope model ID).
        api_key: API key for the LLM provider.
        base_url: Base URL for the LLM API.
        lang: Language for prompts (default: "zh").

    Returns:
        AnalysisResult with red flags, warnings, and fairness score.
    """
    if len(contract_text.strip()) < 50:
        raise ValueError("Contract text is too short. Please provide a complete document.")

    # Truncate if too long
    if len(contract_text) > MAX_CONTRACT_CHARS:
        contract_text = contract_text[:MAX_CONTRACT_CHARS] + "\n\n[... document truncated ...]"

    client = get_client(api_key=api_key, base_url=base_url)
    system_prompt, analysis_prompt = get_prompts(lang)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": analysis_prompt.format(contract_text=contract_text)},
        ],
        temperature=0.1,
        max_tokens=4096,
    )

    content = response.choices[0].message.content.strip()

    # Strip markdown code block if present
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        content = "\n".join(lines)

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Failed to parse LLM response as JSON: {e}\n"
            f"Raw response:\n{content[:500]}"
        )

    # Normalize LLM output to match expected schema
    # LLM may return synonyms like "lease" instead of "rental"
    _TYPE_MAP = {
        "lease": "rental",
        "rent": "rental",
        "rental": "rental",
        "internship": "internship",
        "intern": "internship",
        "employment": "employment",
        "labor": "employment",
        "work": "employment",
        "nda": "nda",
        "confidential": "nda",
        "nda": "nda",
        "unknown": "unknown",
    }

    if "contract_type" in data and isinstance(data["contract_type"], str):
        normalized = _TYPE_MAP.get(data["contract_type"].lower(), data["contract_type"])
        data["contract_type"] = normalized

    try:
        return AnalysisResult(**data)
    except ValidationError as e:
        raise RuntimeError(f"LLM response did not match expected schema: {e}")
