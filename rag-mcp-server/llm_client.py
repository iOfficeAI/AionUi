"""LLM 客户端 - 调用通义千问生成回答"""

from typing import Optional
import dashscope
from dashscope import Generation
from config import Config


class LLMClient:
    """通义千问 LLM 客户端"""

    def __init__(self):
        """初始化 LLM 客户端"""
        dashscope.api_key = Config.DASHSCOPE_API_KEY
        self.model = Config.LLM_MODEL
        print(f"[LLMClient] 初始化完成，使用模型: {self.model}")

    def generate(self, question: str, context: str) -> dict:
        """
        基于上下文生成回答

        Args:
            question: 用户问题
            context: 检索到的上下文

        Returns:
            包含回答和来源的字典
        """
        # 构建系统提示词
        system_prompt = """你是一个智能助手，负责回答用户问题。
请严格遵循以下规则：
1. 只根据提供的【参考资料】回答问题
2. 如果参考资料中没有相关信息，请明确告知"根据现有资料无法回答该问题"
3. 回答要简洁、准确、有条理
4. 如果引用了参考资料，请在回答末尾标注来源文件"""

        # 构建用户提示词
        user_prompt = f"""【参考资料】
{context}

【用户问题】
{question}

请根据上述参考资料回答用户问题。"""

        try:
            # 调用通义千问 API
            response = Generation.call(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                result_format="message"
            )

            if response.status_code != 200:
                return {
                    "answer": f"LLM API 调用失败: {response.message}",
                    "success": False
                }

            answer = response.output.choices[0].message.content

            return {
                "answer": answer,
                "success": True
            }

        except Exception as e:
            return {
                "answer": f"生成回答时发生错误: {str(e)}",
                "success": False
            }
