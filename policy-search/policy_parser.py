"""政策文档解析模块 - 调用 LLM 提取结构化信息"""

import os
import json
import re
import sys
import logging
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

# 日志输出到 stderr
logger = logging.getLogger(__name__)

from config import Config
from llm_client import LLMClient


class PolicyParser:
    """政策文档解析器：从 PDF/文本中提取结构化政策信息"""

    def __init__(self):
        """初始化解析器"""
        self.llm = LLMClient()
        logger.info("PolicyParser 初始化完成")

    def sanitize_text(self, text: str) -> str:
        """
        清理文本文本，确保输出为合法的 UTF-8

        处理：
        1. 移除无法编码的控制字符
        2. 替换特殊 Unicode 字符为 ASCII 等价物
        3. 规范化 Unicode（NFC）
        """
        if not text:
            return ""

        # Unicode NFC 规范化
        text = unicodedata.normalize('NFC', text)

        # 特殊字符替换表
        replacements = {
            '\u2212': '-',    # 数学减号 → 普通减号
            '\u2013': '-',    # en dash
            '\u2014': '--',   # em dash
            '\u2018': "'",    # 左单引号
            '\u2019': "'",    # 右单引号
            '\u201c': '"',    # 左双引号
            '\u201d': '"',    # 右双引号
            '\u2026': '...',  # 省略号
            '\u00a0': ' ',    # 不换行空格
            '\u200b': '',     # 零宽空格
            '\u200c': '',     # 零宽非连接符
            '\u200d': '',     # 零宽连接符
            '\ufeff': '',     # BOM
            '\u00ad': '',     # 软连字符
            '\ufffd': '?',    # 替换字符
        }
        for old, new in replacements.items():
            text = text.replace(old, new)

        # 移除控制字符（保留换行、回车、制表符）
        text = ''.join(
            ch for ch in text
            if ch in ('\n', '\r', '\t') or (unicodedata.category(ch)[0] != 'C')
        )

        # 清理多余空行
        text = re.sub(r'\n{3,}', '\n\n', text)

        return text

    def load_document(self, document_path: str) -> str:
        """
        读取文档内容（PDF 或纯文本）

        Returns:
            文档全文文本（已清理编码）
        """
        if not os.path.exists(document_path):
            raise FileNotFoundError(f"文件不存在: {document_path}")

        ext = os.path.splitext(document_path)[1].lower()

        if ext == ".pdf":
            raw_text = self._extract_pdf_text(document_path)
        elif ext in (".txt", ".md", ".text"):
            # 尝试多种编码读取文本文件
            raw_text = self._read_text_file(document_path)
        else:
            raise ValueError(f"不支持的文件格式: {ext}，仅支持 .pdf, .txt, .md")

        # 清理并规范化文本
        return self.sanitize_text(raw_text)

    def _read_text_file(self, file_path: str) -> str:
        """尝试多种编码读取文本文件"""
        encodings = ['utf-8', 'utf-8-sig', 'gbk', 'gb2312', 'gb18030', 'big5', 'latin-1']
        for enc in encodings:
            try:
                with open(file_path, 'r', encoding=enc) as f:
                    return f.read()
            except (UnicodeDecodeError, UnicodeError):
                continue
        # 最后兜底：忽略错误字符
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()

    def _extract_pdf_text(self, pdf_path: str) -> str:
        """
        从 PDF 提取文本（多引擎策略）

        优先级：PyPDF2 > pdfplumber > 兜底
        """
        # 策略1：PyPDF2（更稳定，兼容性好）
        text = self._extract_with_pypdf2(pdf_path)
        if text and len(text.strip()) > 100:
            logger.info(f"PyPDF2 提取成功，文本长度: {len(text)}")
            return text

        # 策略2：pdfplumber（对表格和复杂排版更好）
        text = self._extract_with_pdfplumber(pdf_path)
        if text and len(text.strip()) > 100:
            logger.info(f"pdfplumber 提取成功，文本长度: {len(text)}")
            return text

        # 策略3：如果两个引擎都失败，返回已提取的内容（即使较短）
        if text:
            logger.warning(f"PDF 提取文本较短（{len(text)} 字符）")
            return text

        raise ValueError(f"无法从 PDF 中提取文本: {pdf_path}")

    def _extract_with_pypdf2(self, pdf_path: str) -> str:
        """使用 PyPDF2 提取 PDF 文本"""
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(pdf_path)
            text_parts = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            return "\n\n".join(text_parts)
        except ImportError:
            logger.warning("PyPDF2 未安装，跳过")
            return ""
        except Exception as e:
            logger.warning(f"PyPDF2 提取失败: {e}")
            return ""

    def _extract_with_pdfplumber(self, pdf_path: str) -> str:
        """使用 pdfplumber 提取 PDF 文本"""
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
            return "\n\n".join(text_parts)
        except ImportError:
            logger.warning("pdfplumber 未安装，跳过")
            return ""
        except Exception as e:
            logger.warning(f"pdfplumber 提取失败: {e}")
            return ""

    def split_into_chunks(self, text: str) -> List[str]:
        """
        将长文档按段落/章节切分为多个块

        策略：
        1. 先按章节标题切分（如 "第一章"、"一、" 等）
        2. 如果单个块仍然超过 CHUNK_SIZE，按段落进一步切分
        """
        # 尝试按章节标题切分
        chapter_pattern = r"(?:第[一二三四五六七八九十百千\d]+[章节条篇部]|^[一二三四五六七八九十\d]+[、.．]\s)"
        sections = re.split(f"(?={chapter_pattern})", text, flags=re.MULTILINE)

        # 过滤空块
        sections = [s.strip() for s in sections if s.strip()]

        # 如果切分后块太大，进一步按段落切分
        final_chunks = []
        for section in sections:
            if len(section) <= Config.CHUNK_SIZE:
                final_chunks.append(section)
            else:
                # 按段落切分
                paragraphs = re.split(r"\n\s*\n", section)
                current_chunk = ""
                for para in paragraphs:
                    if len(current_chunk) + len(para) > Config.CHUNK_SIZE and current_chunk:
                        final_chunks.append(current_chunk.strip())
                        current_chunk = para
                    else:
                        current_chunk += "\n\n" + para if current_chunk else para
                if current_chunk.strip():
                    final_chunks.append(current_chunk.strip())

        return final_chunks

    def extract_metadata_from_filename(self, filename: str) -> Dict[str, Any]:
        """
        从文件名中提取元数据（学校、年份、分类等）
        
        Args:
            filename: 文件名（不含路径）
        
        Returns:
            部分元数据字典
        """
        metadata = {}
        
        # 提取学校名称（常见模式）
        school_patterns = [
            r'(重庆邮电大学|重邮|CQUPT)',
            r'(北京大学|北大)',
            r'(清华大学|清华)',
            r'(复旦大学|复旦)',
            r'(上海交通大学|上交)',
            r'(浙江大学|浙大)',
            r'(南京大学|南大)',
            r'(武汉大学|武大)',
            r'(中山大学|中大)',
            r'(四川大学|川大)',
            r'(华中科技大学|华科)',
            r'(西安交通大学|西交)',
            r'(哈尔滨工业大学|哈工大)',
        ]
        for pattern in school_patterns:
            match = re.search(pattern, filename, re.IGNORECASE)
            if match:
                metadata['school'] = match.group(1)
                break
        
        # 提取年份（4位数字，1990-2030）
        year_match = re.search(r'(199\d|20[0-3]\d)', filename)
        if year_match:
            metadata['year'] = int(year_match.group(1))
        
        # 提取分类关键词
        category_keywords = {
            'postgraduate_recommendation': ['保研', '推免', '推荐免试'],
            'scholarship': ['奖学金', '奖学'],
            'financial_aid': ['助学金', '资助', '困难补助'],
            'academic': ['学业', '学籍', '考试', '成绩'],
            'discipline': ['纪律', '处分', '违规'],
            'exchange': ['交流', '交换', '留学', '出国'],
            'employment': ['就业', '招聘', '毕业'],
        }
        for category, keywords in category_keywords.items():
            for keyword in keywords:
                if keyword in filename:
                    metadata['category'] = category
                    break
            if 'category' in metadata:
                break
        
        return metadata

    def extract_metadata(self, text: str, filename: str = None) -> Dict[str, Any]:
        """
        提取文档元数据（优先从文件名，其次从文本内容）

        Args:
            text: 文档文本内容
            filename: 文件名（可选，用于辅助提取）

        Returns:
            {
                "school": "学校名称",
                "department": "院系名称",
                "year": 2025,
                "title": "政策标题",
                "category": "分类标识",
                "tags": ["标签1", "标签2"],
                "effective_date": "生效日期",
            }
        """
        # 1. 先从文件名提取（如果有）
        filename_metadata = {}
        if filename:
            filename_metadata = self.extract_metadata_from_filename(filename)
            logger.info(f"从文件名提取的元数据: {filename_metadata}")
        
        # 2. 从文本内容提取（使用 LLM）
        system_prompt = """你是一个高校政策文档分析专家。请从文档中提取元数据信息，以 JSON 格式返回。

重要提示：
- 学校名称：请从文档中找出完整的学校名称，如"重庆邮电大学"、"北京大学"等。如果文档中明确提到了学校，必须填写。
- 年份：从文档标题、文件名或正文中提取年份，如 2025。
- 标题：提取文档的完整政策标题，通常在文档开头。
- 分类：根据文档内容判断分类。

分类标识（category）必须从以下选项中选择：
- postgraduate_recommendation: 保研/推免
- scholarship: 奖学金
- financial_aid: 助学金/资助
- academic: 学业管理
- discipline: 纪律处分
- exchange: 交流交换
- employment: 就业创业
- other: 其他

返回 JSON 格式：
{
    "school": "学校名称（必须从文档中提取，不要填'未知'除非文档确实没有提及）",
    "department": "院系名称（如果文档中未提及，填\"未知\"）",
    "year": 年份数字（如 2025，从文档中提取，如果无法确定填 0）,
    "title": "政策完整标题（从文档标题或开头提取）",
    "category": "分类标识",
    "tags": ["标签1", "标签2", "标签3"],
    "effective_date": "生效日期（YYYY-MM-DD 格式，如果无法确定填\"unknown\"）"
}

只返回 JSON，不要其他内容。"""

        # 取前 5000 字符用于元数据提取（更多内容提高准确率）
        text_sample = text[:5000]

        # 尝试 LLM 提取
        llm_metadata = None
        for attempt in range(2):
            result = self.llm.extract_json(system_prompt, text_sample)
            if result["success"]:
                llm_metadata = result["data"]
                school = llm_metadata.get("school", "未知")
                title = llm_metadata.get("title", "未命名政策文档")
                # 如果学校和标题都已提取，直接使用
                if school != "未知" and title != "未命名政策文档":
                    logger.info(f"LLM 提取成功: school={school}, title={title}")
                    return llm_metadata
                logger.warning(f"LLM 提取结果不完整（第{attempt+1}次）: school={school}, title={title}")
        
        # 3. 如果 LLM 提取失败或不完整，使用文件名提取结果作为兜底
        if filename_metadata:
            logger.info("使用文件名提取的元数据作为兜底")
            # 合并 LLM 结果和文件名结果（文件名优先）
            merged = {
                "school": filename_metadata.get('school', llm_metadata.get('school', '未知') if llm_metadata else '未知'),
                "department": llm_metadata.get('department', '未知') if llm_metadata else '未知',
                "year": filename_metadata.get('year', llm_metadata.get('year', 0) if llm_metadata else 0),
                "title": llm_metadata.get('title', '未命名政策文档') if llm_metadata else '未命名政策文档',
                "category": filename_metadata.get('category', llm_metadata.get('category', 'other') if llm_metadata else 'other'),
                "tags": llm_metadata.get('tags', []) if llm_metadata else [],
                "effective_date": llm_metadata.get('effective_date', 'unknown') if llm_metadata else 'unknown',
            }
            return merged
        
        # 4. 如果都没有，返回默认值
        logger.warning("元数据提取失败，返回默认值")
        return {
            "school": "未知",
            "department": "未知",
            "year": 0,
            "title": "未命名政策文档",
            "category": "other",
            "tags": [],
            "effective_date": "unknown",
        }

    def extract_conditions(self, text: str) -> Dict[str, Any]:
        """
        调用 LLM 从文档中提取结构化条件，按类别分组存储

        对于长文档，分块提取后合并。

        Returns:
            {
                "requirements": {
                    "gpa": {"label": "绩点/成绩要求", "conditions": [...]},
                    "foreign_language": {"label": "外语要求", "conditions": [...]},
                    ...
                },
                "logic_groups": [...],
                "important_dates": [...]
            }
        """
        chunks = self.split_into_chunks(text)
        logger.info(f"文档分为 {len(chunks)} 个块进行解析")

        all_conditions = []  # 临时存储所有条件（带 category）
        all_logic_groups = []
        all_important_dates = []

        system_prompt = """你是一个高校政策文档分析专家。请从文档片段中提取所有申请条件和关键信息。

**重要：每个条件必须标注所属分类（category）**

条件分类（category）必须从以下选项中选择：
- gpa: 绩点/成绩要求（如 GPA、学分绩点排名、必修课成绩等）
- foreign_language: 外语要求（如 CET4/6、TOEFL、IELTS、专业外语等）
- academic: 学业表现要求（如课程完成情况、学术研究能力等）
- disciplinary: 纪律/品行要求（如无处分记录、品行优良等）
- research: 科研/论文要求（如发表论文数量、期刊级别等）
- competition: 竞赛/获奖要求（如学科竞赛获奖级别等）
- bonus: 加分项（如竞赛获奖加分、论文加分、志愿服务加分等）
- procedural: 流程性要求（如提交申请表、参加面试等）
- health: 健康要求（如身心健康标准等）
- other: 其他要求

条件类型（type）必须从以下选项中选择：
- hard: 硬性门槛（不满足则不符合，如 GPA ≥ 3.5）
- scoring: 评分项（有具体分值，如学业成绩占80%）
- ranking: 排名项（如成绩排名前30%）
- bonus: 加分项（如 SCI 论文加5分）
- preference: 优先条件（如学生干部优先）
- procedural: 流程性要求（如需提交申请表）
- qualitative: 模糊定性条件（如综合素质突出）

对每个条件，请提取：
- id: 条件编号（如 condition_001）
- category: 条件分类（从上述10个分类中选择）
- item: 条件名称（如 "GPA要求"）
- description: 条件描述
- type: 条件类型
- quantifiable: 是否可量化（true/false）
- requirement: 要求描述（如 "GPA ≥ 3.5"）
- operator: 比较运算符（>=, <=, >, <, ==, 或 "none"）
- value: 数值（如果不可量化填 null）
- unit: 单位（如 "GPA", "分", "%", 或 "none"）
- source_quote: 原文引用（必须逐字引用，不得改写）
- source_section: 来源章节（如 "第二章 第六条"）

逻辑分组（logic_groups）：将相关条件分组，标注组内逻辑关系（AND/OR/SUM）。

重要日期（important_dates）：提取所有关键时间节点。

返回 JSON 格式：
{
    "conditions": [
        {
            "id": "condition_001",
            "category": "gpa",
            "item": "条件名称",
            "description": "描述",
            "type": "类型",
            "quantifiable": true,
            "requirement": "要求描述",
            "operator": ">=",
            "value": 3.5,
            "unit": "GPA",
            "source_quote": "原文引用",
            "source_section": "章节"
        }
    ],
    "logic_groups": [
        {
            "group_id": "group_basic",
            "description": "基本申请条件",
            "logic": "AND",
            "condition_ids": ["condition_001", "condition_002"]
        }
    ],
    "important_dates": [
        {"event": "申请截止", "date": "2025-06-15", "source_quote": "原文引用"}
    ]
}

只返回 JSON，不要其他内容。如果某个块中没有条件，返回空列表。"""

        condition_counter = 1

        for i, chunk in enumerate(chunks):
            logger.info(f"解析第 {i + 1}/{len(chunks)} 块...")
            result = self.llm.extract_json(system_prompt, chunk)

            if result["success"]:
                data = result["data"]

                # 兼容多种 JSON key 名称：conditions / requirements / items
                conditions = (
                    data.get("conditions")
                    or data.get("requirements")
                    or data.get("items")
                    or []
                )
                # 安全检查：确保 conditions 是列表
                if not isinstance(conditions, list):
                    logger.warning(f"第 {i + 1} 块 conditions 不是列表 (type={type(conditions).__name__})，尝试转换")
                    conditions = [conditions] if isinstance(conditions, dict) else []

                # 重新编号条件 ID，并收集所有条件
                for cond in conditions:
                    if not isinstance(cond, dict):
                        logger.warning(f"跳过非 dict 条件: {type(cond).__name__}")
                        continue
                    cond["id"] = f"condition_{condition_counter:03d}"
                    # 确保每个条件都有 category 字段
                    if "category" not in cond:
                        cond["category"] = "other"
                    condition_counter += 1
                    all_conditions.append(cond)

                # 更新 logic_groups 中的 condition_ids
                logic_groups = data.get("logic_groups") or data.get("groups") or []
                if isinstance(logic_groups, list):
                    for group in logic_groups:
                        all_logic_groups.append(group)

                important_dates = data.get("important_dates") or data.get("dates") or []
                if isinstance(important_dates, list):
                    all_important_dates.extend(important_dates)

                logger.info(f"第 {i + 1} 块提取 {len(conditions)} 个条件")
            else:
                logger.warning(f"第 {i + 1} 块解析失败: {result.get('content', '')[:200]}")

        # 按 category 分组
        requirements = self._group_conditions_by_category(all_conditions)

        logger.info(f"条件提取完成：共 {len(all_conditions)} 个条件，{len(requirements)} 个类别")

        return {
            "requirements": requirements,
            "logic_groups": all_logic_groups,
            "important_dates": all_important_dates,
        }

    def _group_conditions_by_category(self, conditions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        将条件按类别分组

        Returns:
            {
                "gpa": {"label": "绩点/成绩要求", "conditions": [...]},
                "foreign_language": {"label": "外语要求", "conditions": [...]},
                ...
            }
        """
        # 初始化所有分类
        requirements = {}
        for cat_key, cat_label in Config.REQUIREMENT_CATEGORIES.items():
            requirements[cat_key] = {
                "label": cat_label,
                "conditions": []
            }

        # 将条件分配到对应分类
        for cond in conditions:
            cat = cond.get("category", "other")
            if cat not in requirements:
                cat = "other"
            requirements[cat]["conditions"].append(cond)

        # 移除空分类
        requirements = {k: v for k, v in requirements.items() if v["conditions"]}

        return requirements

    def extract_metadata_from_filename(self, filename: str) -> Dict[str, Any]:
        """
        从文件名中提取元数据（学校、年份、分类等）
        
        Args:
            filename: 文件名（不含路径）
        
        Returns:
            部分元数据字典
        """
        metadata = {}
        
        # 提取学校名称（常见模式）
        school_patterns = [
            r'(重庆邮电大学|重邮|CQUPT)',
            r'(北京大学|北大)',
            r'(清华大学|清华)',
            r'(复旦大学|复旦)',
            r'(上海交通大学|上交)',
            r'(浙江大学|浙大)',
            r'(南京大学|南大)',
            r'(武汉大学|武大)',
            r'(中山大学|中大)',
            r'(四川大学|川大)',
            r'(华中科技大学|华科)',
            r'(西安交通大学|西交)',
            r'(哈尔滨工业大学|哈工大)',
        ]
        for pattern in school_patterns:
            match = re.search(pattern, filename, re.IGNORECASE)
            if match:
                metadata['school'] = match.group(1)
                break
        
        # 提取年份（4位数字，1990-2030）
        year_match = re.search(r'(199\d|20[0-3]\d)', filename)
        if year_match:
            metadata['year'] = int(year_match.group(1))
        
        # 提取分类关键词
        category_keywords = {
            'postgraduate_recommendation': ['保研', '推免', '推荐免试'],
            'scholarship': ['奖学金', '奖学'],
            'financial_aid': ['助学金', '资助', '困难补助'],
            'academic': ['学业', '学籍', '考试', '成绩'],
            'discipline': ['纪律', '处分', '违规'],
            'exchange': ['交流', '交换', '留学', '出国'],
            'employment': ['就业', '招聘', '毕业'],
        }
        for category, keywords in category_keywords.items():
            for keyword in keywords:
                if keyword in filename:
                    metadata['category'] = category
                    break
            if 'category' in metadata:
                break
        
        return metadata

    def parse_document(self, document_path: str) -> Dict[str, Any]:
        """
        完整解析流程：读取 → 提取元数据 → 提取条件

        Returns:
            完整的政策数据结构
        """
        logger.info(f"开始解析文档: {document_path}")

        # 1. 读取文档
        text = self.load_document(document_path)
        logger.info(f"文档长度: {len(text)} 字符")

        # 2. 先从文件名提取元数据
        filename = os.path.basename(document_path)
        filename_metadata = self.extract_metadata_from_filename(filename)
        logger.info(f"从文件名提取的元数据: {filename_metadata}")

        # 3. 调用 LLM 提取元数据
        metadata = self.extract_metadata(text)
        
        # 4. 用文件名元数据补充 LLM 提取的元数据
        if filename_metadata.get('school') and metadata.get('school') == '未知':
            metadata['school'] = filename_metadata['school']
        if filename_metadata.get('year') and metadata.get('year') == 0:
            metadata['year'] = filename_metadata['year']
        if filename_metadata.get('category') and metadata.get('category') == 'other':
            metadata['category'] = filename_metadata['category']
        
        logger.info(f"最终元数据: {metadata.get('title')} ({metadata.get('category')})")

        # 5. 提取条件（按类别分组）
        extracted = self.extract_conditions(text)
        requirements = extracted["requirements"]
        total_conditions = sum(len(v["conditions"]) for v in requirements.values())
        logger.info(f"提取到 {total_conditions} 个条件，分布在 {len(requirements)} 个类别中")

        # 6. 组装完整结构（新格式：按类别存储）
        policy_data = {
            "meta": {
                "doc_id": "",  # 由 policy_store 生成
                "school": metadata["school"],
                "department": metadata["department"],
                "year": metadata["year"],
                "category": metadata["category"],
                "title": metadata["title"],
                "source_file": os.path.basename(document_path),
                "effective_date": metadata["effective_date"],
                "tags": metadata["tags"],
            },
            "raw_text": text[:2000] + "..." if len(text) > 2000 else text,  # 只保留前2000字符作为参考
            "requirements": requirements,  # 按类别分组的条件
            "logic_groups": extracted["logic_groups"],
            "important_dates": extracted["important_dates"],
        }

        return policy_data
