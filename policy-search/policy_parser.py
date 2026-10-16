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
    """政策文档解析器：从 PDF/DOCX/HTML/Excel/文本中提取结构化政策信息"""

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
        读取文档内容（PDF、DOCX、HTML、Excel 或纯文本）

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
        elif ext == ".docx":
            raw_text = self._extract_docx_text(document_path)
        elif ext in (".html", ".htm"):
            raw_text = self._extract_html_text(document_path)
        elif ext in (".xlsx", ".xls"):
            raw_text = self._extract_excel_text(document_path)
        elif ext == ".doc":
            raise ValueError(
                f"不支持 .doc 格式（旧版 Word 二进制格式），请将文件另存为 .docx 后重新上传。"
                f"\n提示：在 Word 中打开文件 → 文件 → 另存为 → 选择 .docx 格式"
            )
        else:
            raise ValueError(f"不支持的文件格式: {ext}，仅支持 .pdf, .docx, .html, .xlsx, .txt, .md")

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

    def _extract_docx_text(self, docx_path: str) -> str:
        """
        从 .docx 文件提取文本

        使用 python-docx 库，按段落顺序提取全部文本内容。
        """
        try:
            from docx import Document
            doc = Document(docx_path)
            text_parts = []

            # 提取正文段落
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)

            # 提取表格内容（政策文件常将条件放在表格中）
            for table in doc.tables:
                for row in table.rows:
                    row_cells = []
                    for cell in row.cells:
                        cell_text = cell.text.strip()
                        if cell_text:
                            row_cells.append(cell_text)
                    if row_cells:
                        text_parts.append(" | ".join(row_cells))

            full_text = "\n\n".join(text_parts)
            if full_text.strip():
                logger.info(f"docx 提取成功，文本长度: {len(full_text)}")
                return full_text
            else:
                raise ValueError(f"从 docx 文件中未提取到有效文本: {docx_path}")
        except ImportError:
            raise ImportError(
                "python-docx 未安装，无法解析 .docx 文件。"
                "请运行: pip install python-docx"
            )
        except Exception as e:
            raise ValueError(f"无法从 docx 文件中提取文本: {docx_path}，错误: {e}")

    def _extract_html_text(self, html_path: str) -> str:
        """
        从 HTML 文件提取文本

        使用 BeautifulSoup 提取网页文本，保留段落结构。
        """
        try:
            from bs4 import BeautifulSoup
            
            # 尝试多种编码读取
            encodings = ['utf-8', 'utf-8-sig', 'gbk', 'gb2312', 'gb18030', 'latin-1']
            html_content = None
            for enc in encodings:
                try:
                    with open(html_path, 'r', encoding=enc) as f:
                        html_content = f.read()
                    break
                except (UnicodeDecodeError, UnicodeError):
                    continue
            
            if not html_content:
                with open(html_path, 'r', encoding='utf-8', errors='replace') as f:
                    html_content = f.read()
            
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # 移除 script 和 style 标签
            for script in soup(['script', 'style']):
                script.decompose()
            
            # 提取文本，保留段落结构
            text_parts = []
            for element in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th']):
                text = element.get_text(strip=True)
                if text:
                    text_parts.append(text)
            
            full_text = "\n\n".join(text_parts)
            
            if full_text.strip():
                logger.info(f"HTML 提取成功，文本长度: {len(full_text)}")
                return full_text
            else:
                raise ValueError(f"从 HTML 文件中未提取到有效文本: {html_path}")
                
        except ImportError:
            raise ImportError(
                "beautifulsoup4 未安装，无法解析 HTML 文件。"
                "请运行: pip install beautifulsoup4"
            )
        except Exception as e:
            raise ValueError(f"无法从 HTML 文件中提取文本: {html_path}，错误: {e}")

    def _extract_excel_text(self, excel_path: str) -> str:
        """
        从 Excel 文件提取文本

        使用 openpyxl 提取所有工作表的表格数据，按行组织。
        """
        try:
            from openpyxl import load_workbook
            
            wb = load_workbook(excel_path, read_only=True, data_only=True)
            text_parts = []
            
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                text_parts.append(f"=== {sheet_name} ===")
                
                for row in ws.iter_rows(values_only=True):
                    # 过滤空行
                    row_cells = [str(cell).strip() for cell in row if cell is not None]
                    if row_cells:
                        text_parts.append(" | ".join(row_cells))
            
            wb.close()
            full_text = "\n".join(text_parts)
            
            if full_text.strip():
                logger.info(f"Excel 提取成功，文本长度: {len(full_text)}")
                return full_text
            else:
                raise ValueError(f"从 Excel 文件中未提取到有效文本: {excel_path}")
                
        except ImportError:
            raise ImportError(
                "openpyxl 未安装，无法解析 Excel 文件。"
                "请运行: pip install openpyxl"
            )
        except Exception as e:
            raise ValueError(f"无法从 Excel 文件中提取文本: {excel_path}，错误: {e}")

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
        3. 如果单个段落超长，强制按字符截断
        """
        # 尝试按章节标题切分
        chapter_pattern = r"(?:第[一二三四五六七八九十百千\d]+[章节条篇部]|^[一二三四五六七八九十\d]+[、.．]\s)"
        sections = re.split(f"(?={chapter_pattern})", text, flags=re.MULTILINE)

        # 过滤空块
        sections = [s.strip() for s in sections if s.strip()]

        final_chunks = []
        for section in sections:
            if len(section) <= Config.CHUNK_SIZE:
                final_chunks.append(section)
            else:
                # 按段落切分
                paragraphs = re.split(r"\n\s*\n", section)
                current_chunk = ""
                for para in paragraphs:
                    para = para.strip()
                    if not para:
                        continue
                    # 如果当前块加上新段落会超限，先保存当前块
                    if current_chunk and len(current_chunk) + 2 + len(para) > Config.CHUNK_SIZE:
                        final_chunks.append(current_chunk)
                        current_chunk = ""
                    # 如果单个段落本身就超长，强制按字符截断
                    if len(para) > Config.CHUNK_SIZE:
                        # 先保存已有的 chunk
                        if current_chunk:
                            final_chunks.append(current_chunk)
                            current_chunk = ""
                        # 按句号/分号截断超长段落
                        sub_parts = re.split(r"(?<=[。；;！!])", para)
                        sub_chunk = ""
                        for sp in sub_parts:
                            sp = sp.strip()
                            if not sp:
                                continue
                            if sub_chunk and len(sub_chunk) + len(sp) > Config.CHUNK_SIZE:
                                final_chunks.append(sub_chunk)
                                sub_chunk = sp
                            else:
                                sub_chunk += sp
                        if sub_chunk:
                            current_chunk = sub_chunk
                    else:
                        current_chunk = current_chunk + "\n\n" + para if current_chunk else para
                if current_chunk.strip():
                    final_chunks.append(current_chunk.strip())

        logger.info(f"切分完成: {len(sections)} 个章节 → {len(final_chunks)} 个块")
        for i, c in enumerate(final_chunks):
            logger.info(f"  块 {i+1}: {len(c)} 字符")

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

        system_prompt = """你是高校政策分析专家。从以下政策文本中提取申请条件和关键日期，返回 JSON。

【分类 category（选一个）】
gpa=成绩要求 | foreign_language=外语 | academic=学业 | disciplinary=纪律品行
research=科研论文 | competition=竞赛获奖 | bonus=加分项 | procedural=流程 | health=健康 | other=其他

【类型 type（选一个）】
hard=硬性门槛 | scoring=评分项 | ranking=排名 | bonus=加分 | preference=优先 | procedural=流程 | qualitative=定性

【输出 JSON 格式，严格遵循】
{"conditions":[{"id":"c001","category":"gpa","item":"GPA要求","description":"必修课加权平均成绩排名前50%","type":"hard","quantifiable":true,"requirement":"排名前50%","operator":"<=","value":50,"unit":"%","source_quote":"原文逐字引用","source_section":"第一章 第五条"}],"logic_groups":[{"group_id":"g1","description":"基本条件","logic":"AND","condition_ids":["c001"]}],"important_dates":[{"event":"申请截止","date":"2025-06-15","source_quote":"原文引用"}]}

【规则】
1. 每个条件必须填 category 和 type，从上面选项中选
2. source_quote 必须逐字引用原文，不可改写
3. 不可量化时 value 填 null，operator 填 "none"，unit 填 "none"
4. 没有条件的块返回 {"conditions":[],"logic_groups":[],"important_dates":[]}
5. 只返回 JSON，不要任何解释文字"""

        condition_counter = 1
        failed_chunks = []

        for i, chunk in enumerate(chunks):
            logger.info(f"解析第 {i + 1}/{len(chunks)} 块...")
            result = self.llm.extract_json(system_prompt, chunk, max_retries=3)

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
                failed_chunks.append((i, chunk))

        # 如果有失败的块，尝试用更简单的 prompt 重试
        if failed_chunks:
            logger.info(f"重试 {len(failed_chunks)} 个失败的块...")
            simple_prompt = """从以下文本中提取政策条件，返回 JSON 格式：
{"conditions":[{"category":"gpa","item":"条件名","description":"描述","type":"hard","quantifiable":false,"requirement":"要求","operator":"none","value":null,"unit":"none","source_quote":"原文引用","source_section":"章节"}],"logic_groups":[],"important_dates":[]}
只返回 JSON。"""
            
            for i, chunk in failed_chunks:
                logger.info(f"重试第 {i + 1} 块（简化 prompt）...")
                result = self.llm.extract_json(simple_prompt, chunk, max_retries=2)
                
                if result["success"]:
                    data = result["data"]
                    conditions = data.get("conditions") or []
                    if not isinstance(conditions, list):
                        conditions = [conditions] if isinstance(conditions, dict) else []
                    
                    for cond in conditions:
                        if not isinstance(cond, dict):
                            continue
                        cond["id"] = f"condition_{condition_counter:03d}"
                        if "category" not in cond:
                            cond["category"] = "other"
                        condition_counter += 1
                        all_conditions.append(cond)
                    
                    logger.info(f"重试成功，第 {i + 1} 块提取 {len(conditions)} 个条件")
                else:
                    logger.error(f"重试仍然失败，第 {i + 1} 块条件丢失")

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
