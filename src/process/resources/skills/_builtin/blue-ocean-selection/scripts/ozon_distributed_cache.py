#!/usr/bin/env python3
"""
Ozon分布式缓存 v3.8.0 — 本地优先 + Supabase异步代写

架构原则:
  终端本地执行 + 本地读缓存优先，Supabase只负责异步代写/校验入库
  主流程零网络阻塞: L1内存 → L2本地文件 → 源头API
  Supabase从读取路径移除，仅通过后台线程异步推送

读取路径: L1内存(0ms) → L2本地文件(0ms) → 源头API(秒级)
写入路径: 本地立即写入 → 推入异步写队列 → 立即返回 → 后台线程代写Supabase
启动时: 扫本地缓存 → 补推云端缺失条目(异步)
"""

import json
import os
import queue
import sys
import threading
import time

# 复用product_cache的Supabase配置
from product_cache import SUPABASE_URL, SUPABASE_ANON_KEY, _sb_headers

try:
    from http_client import requests as http_requests
except ImportError:
    import requests as http_requests


# ============================================================================
# 内存缓存 (L1)
# ============================================================================
_memory_cache = {}

SUPABASE_READ_COOLDOWN_SECONDS = int(os.environ.get("SUPABASE_READ_COOLDOWN_SECONDS", "300") or 300)
_sb_read_state = {
    "disabled_until": 0.0,
    "last_error": "",
}


def _mem_get(key: str):
    """L1: 内存缓存读取"""
    return _memory_cache.get(key)


def _mem_set(key: str, value):
    """L1: 内存缓存写入"""
    _memory_cache[key] = value


def _is_supabase_unreachable_error(error: Exception) -> bool:
    err_str = str(error).lower()
    markers = [
        "name or service not known",
        "name resolution",
        "nameresolutionerror",
        "nodename nor servname",
        "failed to resolve",
        "temporary failure in name resolution",
    ]
    return any(marker in err_str for marker in markers)


def _reset_supabase_read_circuit_breaker():
    _sb_read_state["disabled_until"] = 0.0
    _sb_read_state["last_error"] = ""


def _supabase_read_available() -> bool:
    if not SUPABASE_URL:
        return False
    disabled_until = float(_sb_read_state.get("disabled_until", 0.0) or 0.0)
    return time.time() >= disabled_until


def _disable_supabase_read(error: Exception):
    _sb_read_state["disabled_until"] = time.time() + max(1, SUPABASE_READ_COOLDOWN_SECONDS)
    _sb_read_state["last_error"] = str(error)
    print(
        f"[DistCache] Supabase read disabled for {SUPABASE_READ_COOLDOWN_SECONDS}s: {error}",
        file=sys.stderr,
    )


# ============================================================================
# 异步写队列 — 所有Supabase写操作通过此队列，主流程零阻塞
# ============================================================================

class AsyncWriteQueue:
    """后台线程异步代写Supabase，失败静默丢弃，不阻塞主流程"""

    def __init__(self, max_retries: int = 1):
        self._queue = queue.Queue()
        self._max_retries = max_retries
        self._started = False
        self._stats = {"queued": 0, "success": 0, "failed": 0}

    def start(self):
        """启动后台消费者线程(仅启动一次)"""
        if self._started:
            return
        self._started = True
        t = threading.Thread(target=self._consumer, daemon=True, name="SB-AsyncWrite")
        t.start()

    def push(self, table: str, data: dict, conflict_key: str = ""):
        """推入写队列，立即返回(不阻塞)"""
        if not self._started:
            self.start()
        self._queue.put((table, data, conflict_key))
        self._stats["queued"] += 1

    def _consumer(self):
        """后台消费者: 逐条执行Supabase写入，失败重试1次后丢弃"""
        while True:
            try:
                table, data, conflict_key = self._queue.get(timeout=1)
                success = False
                for attempt in range(self._max_retries + 1):
                    try:
                        if self._do_upsert(table, data, conflict_key):
                            success = True
                            break
                    except Exception as e:
                        if attempt < self._max_retries:
                            time.sleep(2)
                        else:
                            print(f"[AsyncSB] Write failed after {attempt+1} attempts: {table}: {e}", file=sys.stderr)
                if success:
                    self._stats["success"] += 1
                else:
                    self._stats["failed"] += 1
            except Exception:
                pass

    # Supabase可达性标志 — DNS解析失败后自动跳过后续写入
    _sb_available = True

    def _do_upsert(self, table: str, data: dict, conflict_key: str = "") -> bool:
        """执行Supabase upsert(在后台线程中调用)"""
        if not self._sb_available:
            return False
        try:
            url = f"{SUPABASE_URL}/rest/v1/{table}"
            headers = _sb_headers()
            headers["Prefer"] = "return=minimal,resolution=merge-duplicates"

            # 先检查是否存在
            if conflict_key and conflict_key in data:
                params = {conflict_key: f"eq.{data[conflict_key]}"}
                for k, v in data.items():
                    if k != conflict_key and isinstance(v, (int, float, str)):
                        params[k] = f"eq.{v}"
                        break
                params["select"] = "id"
                params["limit"] = "1"
                r = http_requests.get(url, headers=_sb_headers(), params=params, timeout=5)
                if r.status_code == 200 and r.json():
                    row_id = r.json()[0]["id"]
                    patch_url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}"
                    pr = http_requests.patch(patch_url, headers=_sb_headers(),
                                             json=data, timeout=5)
                    if pr.status_code in (200, 204):
                        return True
                    return False

            # 不存在 → INSERT
            r = http_requests.post(url, headers=headers, json=data, timeout=5)
            return r.status_code in (200, 201, 204)
        except Exception as e:
            err_str = str(e).lower()
            # DNS解析失败或连接超时 → 标记Supabase不可达，后续跳过
            if "name or service not known" in err_str or "name resolution" in err_str or "nodename nor servname" in err_str:
                self._sb_available = False
                print(f"[AsyncSB] Supabase unreachable, disabling writes", file=sys.stderr)
            else:
                print(f"[AsyncSB] upsert error {table}: {e}", file=sys.stderr)
            return False

    @property
    def stats(self) -> dict:
        return dict(self._stats)


# 全局单例 — 仅在Supabase可达时初始化
_async_queue = None

def _ensure_queue():
    global _async_queue
    if _async_queue is None:
        # 首次调用时检查Supabase是否可达
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return None
        try:
            import socket
            host = SUPABASE_URL.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
            socket.setdefaulttimeout(2)
            socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)
        except (socket.gaierror, OSError, Exception):
            return None
        _async_queue = AsyncWriteQueue()
    return _async_queue


def async_upload(table: str, data: dict, conflict_key: str = ""):
    """异步推送到Supabase — 主流程调用此函数，立即返回零阻塞"""
    try:
        q = _ensure_queue()
        if q is not None:
            q.push(table, data, conflict_key)
    except Exception:
        pass


# ============================================================================
# Supabase同步读 — 仅用于启动时批量同步，主流程不再调用
# ============================================================================

def _sb_load(table: str, filters: dict, select: str = "*"):
    """从Supabase表查询数据(同步，仅启动同步用)"""
    if not _supabase_read_available():
        return None
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        params = {"select": select, "limit": "1"}
        for k, v in filters.items():
            params[k] = f"eq.{v}"
        r = http_requests.get(url, headers=_sb_headers(), params=params, timeout=8)
        if r.status_code == 200:
            rows = r.json()
            if rows:
                _reset_supabase_read_circuit_breaker()
                return rows[0]
    except Exception as e:
        if _is_supabase_unreachable_error(e):
            _disable_supabase_read(e)
            return None
        print(f"[DistCache] Supabase load from {table}: {e}", file=sys.stderr)
    return None


# ============================================================================
# 字典值缓存 (ozon_category_attrs 表)
# ============================================================================

def load_dict_values_from_supabase(desc_cat_id: int, type_id: int, attr_id: int):
    """从Supabase加载字典值 — 仅启动同步用，主流程不再调用"""
    cache_key = f"dict_{desc_cat_id}_{type_id}_{attr_id}"
    cached = _mem_get(cache_key)
    if cached is not None:
        return cached
    row = _sb_load("ozon_category_attrs",
                   {"description_category_id": desc_cat_id, "type_id": type_id})
    if row and row.get("dictionary_values"):
        dict_values = row["dictionary_values"]
        if isinstance(dict_values, str):
            dict_values = json.loads(dict_values)
        values = dict_values.get(str(attr_id), [])
        if values:
            _mem_set(cache_key, values)
            return values
    return None


def upload_dict_values_to_supabase(desc_cat_id: int, type_id: int,
                                     all_dict_values: dict):
    """异步推送字典值到Supabase"""
    data = {
        "description_category_id": desc_cat_id,
        "type_id": type_id,
        "dictionary_values": all_dict_values,
    }
    async_upload("ozon_category_attrs", data, conflict_key="description_category_id")


# ============================================================================
# 类目属性缓存 (ozon_category_attrs 表)
# ============================================================================

def load_category_attrs_from_supabase(desc_cat_id: int, type_id: int):
    """从Supabase加载类目属性列表 — 仅启动同步用，主流程不再调用"""
    cache_key = f"attrs_{desc_cat_id}_{type_id}"
    cached = _mem_get(cache_key)
    if cached is not None:
        return cached
    row = _sb_load("ozon_category_attrs",
                   {"description_category_id": desc_cat_id, "type_id": type_id},
                   select="attributes")
    if row and row.get("attributes"):
        attrs = row["attributes"]
        if isinstance(attrs, str):
            attrs = json.loads(attrs)
        _mem_set(cache_key, attrs)
        return attrs
    return None


def upload_category_attrs_to_supabase(desc_cat_id: int, type_id: int,
                                        attributes: list):
    """异步推送类目属性到Supabase"""
    data = {
        "description_category_id": desc_cat_id,
        "type_id": type_id,
        "attributes": attributes,
    }
    async_upload("ozon_category_attrs", data, conflict_key="description_category_id")


# ============================================================================
# 属性填充结果缓存 (ozon_attr_fill_cache 表)
# ============================================================================

def _sanitize_cjk(text: str) -> str:
    """清除CJK字符"""
    if not text:
        return text
    return ''.join(ch for ch in text if not (
        '\u4e00' <= ch <= '\u9fff' or
        '\u3400' <= ch <= '\u4dbf' or
        '\uf900' <= ch <= '\ufaff' or
        '\u2f00' <= ch <= '\u2fdf' or
        '\u2e80' <= ch <= '\u2eff' or
        '\u3000' <= ch <= '\u303f' or
        '\uff00' <= ch <= '\uffef'
    ))


def _validate_filled_attributes(filled_attrs: list) -> bool:
    """验证属性填充结果格式正确，可安全回传Supabase"""
    if not filled_attrs or not isinstance(filled_attrs, list):
        return False
    for attr in filled_attrs:
        if not isinstance(attr, dict):
            return False
        if not attr.get("id"):
            return False
        for val in attr.get("values", []):
            if "value" in val and isinstance(val["value"], str):
                if _sanitize_cjk(val["value"]) != val["value"]:
                    return False
    return True


def load_fill_result_from_supabase(desc_cat_id: int, type_id: int,
                                     product_type_ru: str):
    """从Supabase加载属性填充结果 — 仅启动同步用，主流程不再调用"""
    cache_key = f"fill_{desc_cat_id}_{type_id}_{product_type_ru}"
    cached = _mem_get(cache_key)
    if cached is not None:
        return cached
    row = _sb_load("ozon_attr_fill_cache",
                   {"description_category_id": desc_cat_id,
                    "type_id": type_id,
                    "product_type_ru": product_type_ru},
                   select="filled_attributes")
    if row and row.get("filled_attributes"):
        attrs = row["filled_attributes"]
        if isinstance(attrs, str):
            attrs = json.loads(attrs)
        if _validate_filled_attributes(attrs):
            _mem_set(cache_key, attrs)
            return attrs
    return None


def upload_fill_result_to_supabase(desc_cat_id: int, type_id: int,
                                     product_type_ru: str,
                                     filled_attributes: list,
                                     fill_metadata: dict = None):
    """验证后异步推送属性填充结果到Supabase"""
    if not _validate_filled_attributes(filled_attributes):
        print(f"[DistCache] Fill result validation FAILED for {product_type_ru}, skip upload", file=sys.stderr)
        return
    data = {
        "description_category_id": desc_cat_id,
        "type_id": type_id,
        "product_type_ru": product_type_ru,
        "filled_attributes": filled_attributes,
        "fill_metadata": fill_metadata or {},
    }
    async_upload("ozon_attr_fill_cache", data, conflict_key="description_category_id")


# ============================================================================
# 类目映射缓存 (ozon_category_mapping 表)
# ============================================================================

def load_category_mapping_from_supabase(product_keyword: str):
    """从Supabase加载类目映射 — 仅启动同步用，主流程不再调用"""
    cache_key = f"catmap_{product_keyword}"
    cached = _mem_get(cache_key)
    if cached is not None:
        return cached
    row = _sb_load("ozon_category_mapping",
                   {"product_keyword": product_keyword})
    if row:
        _mem_set(cache_key, row)
        return row
    return None


def upload_category_mapping_to_supabase(product_keyword: str,
                                          desc_cat_id: int, type_id: int,
                                          category_name: str = "",
                                          type_name: str = "",
                                          category_path: str = ""):
    """异步推送类目映射到Supabase"""
    data = {
        "product_keyword": product_keyword,
        "description_category_id": desc_cat_id,
        "type_id": type_id,
        "category_name": category_name,
        "type_name": type_name,
        "category_path": category_path,
    }
    async_upload("ozon_category_mapping", data, conflict_key="product_keyword")


# ============================================================================
# 启动时同步: 扫本地缓存 → 补推Supabase
# ============================================================================

def sync_local_to_supabase():
    """启动时扫描本地缓存目录，将缺失条目异步推送到Supabase

    扫描目录:
      - assets/cache/ (Ozon类目/属性本地缓存)
      - assets/product_cache/ (产品分析本地缓存)

    每条本地缓存数据推入异步写队列，由后台线程执行实际HTTP请求。
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pushed = 0

    # 1. 扫描产品缓存 (assets/product_cache/)
    pc_dir = os.path.join(base_dir, "assets", "product_cache")
    if os.path.isdir(pc_dir):
        for fname in os.listdir(pc_dir):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(pc_dir, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                offer_id = data.get("offer_id", "")
                if not offer_id or not data.get("product_info"):
                    continue
                # 推入异步队列
                metadata_payload = {
                    "product_info": data.get("product_info", {}),
                    "bg_info": data.get("bg_info", {}),
                    "category_info": data.get("category_info", {}),
                    "generated_images": data.get("generated_images", []),
                }
                sb_data = {
                    "offer_id": offer_id,
                    "sku_name_ru": data.get("product_info", {}).get("sku_name_ru", offer_id),
                    "metadata": metadata_payload,
                    "source": "startup_sync",
                }
                async_upload("products", sb_data, conflict_key="offer_id")
                pushed += 1
            except Exception as e:
                print(f"[StartupSync] Skip {fname}: {e}", file=sys.stderr)

    if pushed > 0:
        print(f"[StartupSync] Pushed {pushed} local cache entries to async Supabase queue", file=sys.stderr)


# ============================================================================
# 统计
# ============================================================================

def sync_stats() -> dict:
    """返回分布式缓存统计信息"""
    stats = {
        "memory_cache_keys": len(_memory_cache),
        "memory_cache_size_estimate": sum(len(str(v)) for v in _memory_cache.values()),
        "supabase_read_available": _supabase_read_available(),
        "supabase_read_disabled_until": _sb_read_state.get("disabled_until", 0.0),
        "supabase_read_last_error": _sb_read_state.get("last_error", ""),
    }
    stats.update(_async_queue.stats)
    return stats
