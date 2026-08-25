"""知识库管理模块 - index.json + 政策详情文件的读写"""

import json
import os
import sys
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from config import Config

logger = logging.getLogger(__name__)

# Windows 不支持 fcntl，用 filelock 替代
if sys.platform == "win32":
    try:
        from filelock import FileLock
        HAS_FILELOCK = True
    except ImportError:
        HAS_FILELOCK = False
else:
    import fcntl
    HAS_FILELOCK = False


class PolicyStore:
    """政策知识库存储管理"""

    def __init__(self, base_dir: Optional[str] = None):
        """初始化知识库"""
        self.base_dir = base_dir or Config.KNOWLEDGE_BASE_DIR
        self.index_path = os.path.join(self.base_dir, "index.json")
        self._ensure_dirs()
        self._ensure_index()

    def _ensure_dirs(self):
        """确保知识库目录结构存在"""
        os.makedirs(self.base_dir, exist_ok=True)
        for category in Config.CATEGORIES:
            os.makedirs(os.path.join(self.base_dir, category), exist_ok=True)

    def _ensure_index(self):
        """确保 index.json 存在"""
        if not os.path.exists(self.index_path):
            index = {
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "categories": {cat: [] for cat in Config.CATEGORIES},
            }
            self._write_index(index)

    def _read_index(self) -> Dict[str, Any]:
        """读取索引文件"""
        with open(self.index_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_index(self, index: Dict[str, Any]):
        """写入索引文件（带文件锁）"""
        index["last_updated"] = datetime.now(timezone.utc).isoformat()
        if HAS_FILELOCK:
            lock = FileLock(self.index_path + ".lock")
            with lock:
                with open(self.index_path, "w", encoding="utf-8") as f:
                    json.dump(index, f, ensure_ascii=False, indent=2)
        else:
            with open(self.index_path, "w", encoding="utf-8") as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    json.dump(index, f, ensure_ascii=False, indent=2)
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    def _generate_doc_id(self, school: str, year: int, category: str) -> str:
        """生成文档 ID"""
        # 格式: {学校缩写}_{年份}_{序号}
        school_abbr = school.replace(" ", "_").replace("大学", "").replace("学院", "")[:6]
        existing = self._read_index()
        count = len(existing["categories"].get(category, [])) + 1
        return f"{school_abbr}_{year}_{count:03d}"

    def save_policy(
        self,
        policy_data: Dict[str, Any],
        category: str,
        school: str,
        year: int,
        title: str,
        tags: List[str],
        effective_date: str,
        source_file: str,
    ) -> str:
        """
        保存政策详情并更新索引（自动去重：相同 source_file 不会重复存储）

        Returns:
            doc_id: 生成的文档 ID（如果已存在则返回已存在的 ID）
        """
        # 去重检查：检查是否已存在相同的 source_file
        index = self._read_index()
        for cat in index["categories"]:
            for entry in index["categories"][cat]:
                # 检查 source_file 是否相同
                existing_policy = self.load_policy(entry["doc_id"], cat)
                if existing_policy and existing_policy.get("meta", {}).get("source_file") == source_file:
                    logger.info(f"文档已存在，跳过重复存储: {source_file} -> {entry['doc_id']}")
                    return entry["doc_id"]

        # 不存在则创建新文档
        doc_id = self._generate_doc_id(school, year, category)
        policy_data["meta"]["doc_id"] = doc_id
        policy_data["meta"]["school"] = school
        policy_data["meta"]["year"] = year
        policy_data["meta"]["category"] = category
        policy_data["meta"]["title"] = title
        policy_data["meta"]["source_file"] = source_file
        policy_data["meta"]["effective_date"] = effective_date
        policy_data["meta"]["tags"] = tags

        # 写入详情文件
        detail_path = os.path.join(self.base_dir, category, f"{doc_id}.json")
        with open(detail_path, "w", encoding="utf-8") as f:
            json.dump(policy_data, f, ensure_ascii=False, indent=2)

        # 更新索引
        index_entry = {
            "doc_id": doc_id,
            "school": school,
            "year": year,
            "title": title,
            "file": f"{category}/{doc_id}.json",
            "tags": tags,
            "effective_date": effective_date,
        }
        if category not in index["categories"]:
            index["categories"][category] = []
        index["categories"][category].append(index_entry)
        self._write_index(index)

        logger.info(f"新文档已保存: {source_file} -> {doc_id}")
        return doc_id

    def load_policy(self, doc_id: str, category: str) -> Optional[Dict[str, Any]]:
        """加载政策详情"""
        detail_path = os.path.join(self.base_dir, category, f"{doc_id}.json")
        if not os.path.exists(detail_path):
            return None
        with open(detail_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def list_policies(
        self,
        school: Optional[str] = None,
        category: Optional[str] = None,
        year: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        列出政策文件（支持筛选）

        Args:
            school: 筛选学校（模糊匹配）
            category: 筛选分类
            year: 筛选年份
        """
        index = self._read_index()
        results = []

        categories_to_search = [category] if category else list(Config.CATEGORIES.keys())

        for cat in categories_to_search:
            entries = index["categories"].get(cat, [])
            for entry in entries:
                if school and school.lower() not in entry.get("school", "").lower():
                    continue
                if year and entry.get("year") != year:
                    continue
                results.append(entry)

        return results

    def get_all_policies_in_category(self, category: str) -> List[Dict[str, Any]]:
        """获取某个分类下的所有政策详情"""
        index = self._read_index()
        entries = index["categories"].get(category, [])
        policies = []
        for entry in entries:
            policy = self.load_policy(entry["doc_id"], category)
            if policy:
                policies.append(policy)
        return policies

    def clear(self) -> str:
        """清空知识库"""
        for category in Config.CATEGORIES:
            cat_dir = os.path.join(self.base_dir, category)
            if os.path.exists(cat_dir):
                for f in os.listdir(cat_dir):
                    os.remove(os.path.join(cat_dir, f))
        index = {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "categories": {cat: [] for cat in Config.CATEGORIES},
        }
        self._write_index(index)
        return "知识库已清空"

    def get_index_summary(self) -> Dict[str, Any]:
        """获取知识库摘要"""
        index = self._read_index()
        summary = {
            "last_updated": index["last_updated"],
            "total_policies": 0,
            "categories": {},
        }
        for cat, entries in index["categories"].items():
            summary["categories"][Config.CATEGORIES.get(cat, cat)] = len(entries)
            summary["total_policies"] += len(entries)
        return summary
