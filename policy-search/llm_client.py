"""LLM 客户端 - 调用通义千问"""

import sys
import time
import logging
from typing import Optional
import dashscope
from dashscope import Generation
from config import Config

# 日志输出到 stderr
logger = logging.getLogger(__name__)


class LLMClient:
    """通义千问 LLM 客户端"""

    def __init__(self):
        """初始化 LLM 客户端"""
        dashscope.api_key = Config.DASHSCOPE_API_KEY
        self.model = Config.LLM_MODEL
        logger.info(f"LLMClient 初始化完成，使用模型: {self.model}")

    def generate(self, system_prompt: str, user_prompt: str, timeout: int = 120) -> dict:
        """
        调用 LLM 生成回答

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            timeout: 超时时间（秒），默认120秒

        Returns:
            包含回答和成功状态的字典
        """
        try:
            logger.info(f"LLM 调用开始 (model={self.model}, prompt长度={len(user_prompt)})")
            response = Generation.call(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                result_format="message",
                timeout=timeout,
            )

            if response.status_code != 200:
                logger.error(f"LLM API 调用失败 (status={response.status_code}): {response.message}")
                return {
                    "content": f"LLM API 调用失败 (status={response.status_code}): {response.message}",
                    "success": False,
                }

            # 安全检查：确保 output、choices 存在且非空
            output = getattr(response, "output", None)
            if output is None:
                logger.error("LLM 返回 output 为 None")
                return {"content": "LLM 返回 output 为 None", "success": False}

            choices = getattr(output, "choices", None)
            if not choices:
                logger.error(f"LLM 返回 choices 为空 (choices={choices!r})")
                return {"content": f"LLM 返回 choices 为空", "success": False}

            first_choice = choices[0]
            message = getattr(first_choice, "message", None)
            if message is None:
                logger.error("LLM 返回 message 为 None")
                return {"content": "LLM 返回 message 为 None", "success": False}

            content = getattr(message, "content", "")
            if not content:
                logger.warning("LLM 返回 content 为空字符串")
                return {"content": "", "success": False}

            logger.info(f"LLM 调用成功，返回内容长度: {len(content)}")
            return {"content": content, "success": True}

        except Exception as e:
            logger.error(f"LLM 调用异常: {type(e).__name__}: {e}")
            return {"content": f"生成时发生错误: {str(e)}", "success": False}

    def extract_json(self, system_prompt: str, user_prompt: str, max_retries: int = 2) -> dict:
        """
        调用 LLM 并尝试解析返回的 JSON，失败时自动重试

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            max_retries: 最大重试次数（默认2次，即最多调用3次）

        Returns:
            包含解析后的 dict 和成功状态
        """
        import json
        import re

        last_result = None

        for attempt in range(max_retries + 1):
            if attempt > 0:
                logger.info(f"extract_json 重试第 {attempt}/{max_retries} 次...")
                time.sleep(1)  # 短暂等待后重试

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

            # 解析失败，记录并重试
            logger.warning(f"第 {attempt + 1} 次 JSON 解析失败，原始内容前200字: {content[:200]}")
            last_result = parsed

        # 所有重试都失败
        return last_result

    def _try_parse_json(self, content: str) -> dict:
        """
        尝试多种策略解析 JSON 字符串

        Returns:
            包含解析后的 dict 和成功状态
        """
        import json
        import re

        original = content

        # 策略1：尝试去除 markdown 代码块标记
        # 匹配 ```json ... ``` 或 ``` ... ```
        code_block_pattern = r'```(?:json)?\s*\n?(.*?)\n?\s*```'
        match = re.search(code_block_pattern, content, re.DOTALL)
        if match:
            content = match.group(1).strip()

        # 策略2：尝试直接解析
        try:
            data = json.loads(content)
            return {"data": data, "success": True}
        except (json.JSONDecodeError, ValueError):
            pass

        # 策略3：尝试提取第一个 { 到最后一个 } 之间的内容
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(0))
                return {"data": data, "success": True}
            except (json.JSONDecodeError, ValueError):
                pass

        # 策略4：尝试提取第一个 [ 到最后一个 ] 之间的内容（数组格式）
        array_match = re.search(r'\[.*\]', content, re.DOTALL)
        if array_match:
            try:
                data = json.loads(array_match.group(0))
                return {"data": data, "success": True}
            except (json.JSONDecodeError, ValueError):
                pass

        # 策略5：修复常见 JSON 错误（尾部逗号、单引号等）
        try:
            # 去除尾部逗号: ,} -> } 和 ,] -> ]
            fixed = re.sub(r',\s*}', '}', content)
            fixed = re.sub(r',\s*]', ']', fixed)
            # 尝试提取修复后的 JSON
            json_match = re.search(r'\{.*\}', fixed, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(0))
                return {"data": data, "success": True}
        except (json.JSONDecodeError, ValueError):
            pass

        # 所有策略都失败
        return {
            "content": f"JSON 解析失败\n原始内容: {original[:500]}",
            "success": False,
        }
