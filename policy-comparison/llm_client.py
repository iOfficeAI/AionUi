"""LLM 客户端 - 调用通义千问（通过 DashScope OpenAI 兼容模式）

与 policy-search/llm_client.py 保持同一约定：
- 推理模型必须走兼容模式 endpoint（原生 SDK 会返回 400）
- 关闭思考模式，加快响应、降低 token 消耗
- extract_json 内置多策略解析 + 重试
"""

import json
import logging
import re
import time
from typing import Optional

from openai import OpenAI

from config import Config

# 日志输出到 stderr
logger = logging.getLogger(__name__)

# DashScope OpenAI 兼容 endpoint
COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


class LLMClient:
    """通义千问 LLM 客户端（OpenAI 兼容模式）"""

    def __init__(self):
        """初始化 LLM 客户端"""
        self.model = Config.LLM_MODEL
        self.client = OpenAI(
            api_key=Config.DASHSCOPE_API_KEY,
            base_url=COMPATIBLE_BASE_URL,
        )
        logger.info(f"LLMClient 初始化完成，使用模型: {self.model} (兼容模式)")

    def generate(self, system_prompt: str, user_prompt: str, timeout: Optional[int] = None) -> dict:
        """
        调用 LLM 生成回答

        Returns:
            包含 content 和 success 状态的字典
        """
        timeout = timeout or Config.LLM_TIMEOUT
        try:
            logger.info(f"LLM 调用开始 (model={self.model}, prompt长度={len(user_prompt)}, timeout={timeout}s)")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                # 关闭思考模式：加快响应、降低 token 消耗，直接给 JSON
                extra_body={"enable_thinking": False},
                timeout=timeout,
            )

            if not response.choices:
                logger.error("LLM 返回 choices 为空")
                return {"content": "LLM 返回 choices 为空", "success": False}

            content = response.choices[0].message.content or ""
            if not content.strip():
                logger.warning("LLM 返回 content 为空字符串")
                return {"content": "", "success": False}

            logger.info(f"LLM 调用成功，返回内容长度: {len(content)}")
            return {"content": content, "success": True}

        except Exception as e:
            logger.error(f"LLM 调用异常: {type(e).__name__}: {e}")
            return {"content": f"生成时发生错误: {str(e)}", "success": False}

    def extract_json(self, system_prompt: str, user_prompt: str, max_retries: int = 1) -> dict:
        """
        调用 LLM 并尝试解析返回的 JSON，失败时自动重试

        Returns:
            包含解析后的 data 和成功状态的字典
        """
        last_result = None

        for attempt in range(max_retries + 1):
            if attempt > 0:
                logger.info(f"extract_json 重试第 {attempt}/{max_retries} 次...")
                time.sleep(1)

            result = self.generate(system_prompt, user_prompt)
            if not result["success"]:
                last_result = result
                continue

            content = result["content"].strip()
            if not content:
                last_result = {"content": "LLM 返回空内容", "success": False}
                continue

            parsed = self._try_parse_json(content)
            if parsed["success"]:
                return parsed

            logger.warning(f"第 {attempt + 1} 次 JSON 解析失败，原始内容前200字: {content[:200]}")
            last_result = parsed

        return last_result or {"content": "LLM 未返回有效内容", "success": False}

    def _try_parse_json(self, content: str) -> dict:
        """尝试多种策略解析 JSON 字符串"""
        original = content

        # 策略1：去除 markdown 代码块标记
        code_block_pattern = r"```(?:json)?\s*\n?(.*?)\n?\s*```"
        match = re.search(code_block_pattern, content, re.DOTALL)
        if match:
            content = match.group(1).strip()

        # 策略2：直接解析
        try:
            data = json.loads(content)
            return {"data": data, "success": True}
        except (json.JSONDecodeError, ValueError):
            pass

        # 策略3：提取第一个 { 到最后一个 } 之间的内容
        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(0))
                return {"data": data, "success": True}
            except (json.JSONDecodeError, ValueError):
                pass

        # 策略4：提取第一个 [ 到最后一个 ] 之间的内容（数组格式）
        array_match = re.search(r"\[.*\]", content, re.DOTALL)
        if array_match:
            try:
                data = json.loads(array_match.group(0))
                return {"data": data, "success": True}
            except (json.JSONDecodeError, ValueError):
                pass

        # 策略5：修复常见 JSON 错误（尾部逗号）
        try:
            fixed = re.sub(r",\s*}", "}", content)
            fixed = re.sub(r",\s*]", "]", fixed)
            json_match = re.search(r"\{.*\}", fixed, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(0))
                return {"data": data, "success": True}
        except (json.JSONDecodeError, ValueError):
            pass

        return {"content": f"JSON 解析失败\n原始内容: {original[:500]}", "success": False}
