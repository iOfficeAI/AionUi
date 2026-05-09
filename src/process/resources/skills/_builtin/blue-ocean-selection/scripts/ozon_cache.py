"""
Ozon API本地缓存管理器

缓存类目树、类目属性、字典值等低频变更数据，减少API调用。
默认TTL=7天，过期自动刷新；支持手动强制刷新。

用法:
  from ozon_cache import OzonCache
  cache = OzonCache()
  data = cache.get_or_fetch(endpoint, params, fetch_fn)

CLI:
  python scripts/ozon_cache.py --refresh        # 清除全部缓存
  python scripts/ozon_cache.py --refresh tree    # 仅清除类目树缓存
  python scripts/ozon_cache.py --refresh attrs   # 仅清除属性缓存
  python scripts/ozon_cache.py --status          # 查看缓存状态
"""

import argparse
import hashlib
import json
import os
import time
from typing import Any, Callable, Dict, Optional

# 缓存目录（相对于Skill根目录的assets/cache/）
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_SKILL_DIR = os.path.dirname(_SCRIPT_DIR)
DEFAULT_CACHE_DIR = os.path.join(_SKILL_DIR, "assets", "cache")

# 默认TTL: 7天(秒)
DEFAULT_TTL = 7 * 24 * 3600

# 不缓存的端点（查询类，结果随参数变化大）
NO_CACHE_ENDPOINTS = ["/v1/description-category/attribute/values/search"]


class OzonCache:
    """Ozon API响应本地文件缓存"""

    def __init__(self, cache_dir: str = None, ttl: int = None):
        self.cache_dir = cache_dir or DEFAULT_CACHE_DIR
        self.ttl = ttl if ttl is not None else DEFAULT_TTL
        os.makedirs(self.cache_dir, exist_ok=True)

    @staticmethod
    def make_key(endpoint: str, params: Dict) -> str:
        """根据endpoint+params生成确定性缓存key"""
        raw = f"{endpoint}|{json.dumps(params, sort_keys=True, ensure_ascii=False)}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def _cache_path(self, key: str) -> str:
        return os.path.join(self.cache_dir, f"{key}.json")

    def get(self, key: str) -> Optional[Any]:
        """读取缓存，过期返回None"""
        path = self._cache_path(key)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                entry = json.load(f)
            cached_at = entry.get("cached_at", 0)
            if time.time() - cached_at > self.ttl:
                return None
            return entry.get("data")
        except (json.JSONDecodeError, OSError):
            return None

    def set(self, key: str, data: Any) -> None:
        """写入缓存"""
        path = self._cache_path(key)
        entry = {
            "cached_at": int(time.time()),
            "ttl": self.ttl,
            "data": data,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False, default=str)

    def invalidate(self, key: str = None) -> int:
        """
        清除缓存
        key=None: 清除全部
        key=具体key: 删除指定缓存
        返回删除的文件数
        """
        count = 0
        if key:
            path = self._cache_path(key)
            if os.path.exists(path):
                os.remove(path)
                count = 1
        else:
            for fname in os.listdir(self.cache_dir):
                if fname.endswith(".json"):
                    os.remove(os.path.join(self.cache_dir, fname))
                    count += 1
        return count

    def invalidate_by_prefix(self, endpoint_prefix: str) -> int:
        """
        按端点前缀清除缓存
        例如: endpoint_prefix="/v1/description-category/tree" 只删类目树缓存
        """
        count = 0
        for fname in os.listdir(self.cache_dir):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(self.cache_dir, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    entry = json.load(f)
                # 缓存元数据里存endpoint方便按前缀清理
                ep = entry.get("endpoint", "")
                if ep.startswith(endpoint_prefix):
                    os.remove(path)
                    count += 1
            except (json.JSONDecodeError, OSError):
                os.remove(path)
                count += 1
        return count

    def set_with_meta(self, key: str, data: Any, endpoint: str, params: Dict) -> None:
        """写入缓存并附带endpoint元数据（用于按前缀清理）"""
        path = self._cache_path(key)
        entry = {
            "cached_at": int(time.time()),
            "ttl": self.ttl,
            "endpoint": endpoint,
            "params_hash": hashlib.md5(
                json.dumps(params, sort_keys=True).encode()
            ).hexdigest()[:8],
            "data": data,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False, default=str)

    def get_or_fetch(
        self,
        endpoint: str,
        params: Dict,
        fetch_fn: Callable,
        force_refresh: bool = False,
    ) -> Any:
        """
        缓存优先获取数据
        1. 检查是否为不缓存端点 → 直接调用API
        2. 检查缓存是否存在且未过期 → 返回缓存
        3. 调用fetch_fn获取 → 写入缓存 → 返回数据
        """
        # 不缓存的端点直接请求
        for skip_ep in NO_CACHE_ENDPOINTS:
            if endpoint.startswith(skip_ep):
                return fetch_fn()

        key = self.make_key(endpoint, params)

        # 强制刷新或缓存过期 → 重新请求
        if not force_refresh:
            cached = self.get(key)
            if cached is not None:
                return cached

        # 调用API
        data = fetch_fn()
        if data is not None:
            self.set_with_meta(key, data, endpoint, params)
        return data

    def status(self) -> Dict:
        """查看缓存状态"""
        files = [f for f in os.listdir(self.cache_dir) if f.endswith(".json")]
        total_size = sum(
            os.path.getsize(os.path.join(self.cache_dir, f)) for f in files
        )
        endpoints = {}
        now = time.time()
        expired = 0
        for fname in files:
            path = os.path.join(self.cache_dir, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    entry = json.load(f)
                ep = entry.get("endpoint", "unknown")
                age = now - entry.get("cached_at", 0)
                if age > self.ttl:
                    expired += 1
                endpoints[ep] = endpoints.get(ep, 0) + 1
            except (json.JSONDecodeError, OSError):
                pass

        return {
            "cache_dir": self.cache_dir,
            "total_files": len(files),
            "total_size_kb": round(total_size / 1024, 1),
            "expired_files": expired,
            "ttl_days": self.ttl / 86400,
            "endpoints": endpoints,
        }


def prefetch_all(cache: OzonCache):
    """
    全量预拉取Ozon类目树、所有叶子类目属性和字典值。
    策略: 先拉类目树并缓存 → 遍历所有叶子节点(type_id)拉属性 → 对字典属性拉值。
    全量7415个叶子类目需约30分钟(API限速0.15s/请求)。
    """
    import sys
    _SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, _SCRIPT_DIR)
    from http_client import requests
    from config import get_config

    config = get_config()
    headers = {
        "Client-Id": str(config.ozon_client_id),
        "Api-Key": config.ozon_api_key,
        "Content-Type": "application/json",
    }

    # Step 1: 拉取类目树
    print("[1/3] 拉取类目树...")
    tree_params = {"language": "ZH_HANS"}
    tree_data = cache.get_or_fetch(
        "/v1/description-category/tree",
        tree_params,
        lambda: requests.post(
            "https://api-seller.ozon.ru/v1/description-category/tree",
            headers=headers, json=tree_params, timeout=30,
        ).json().get("result", []),
    )
    print(f"  类目树已缓存 ({len(tree_data)} 顶级节点)")

    # 收集所有 (desc_cat_id, type_id, name) 叶子节点
    leaf_nodes = []
    all_nodes = []

    def collect_leaves(nodes, path=""):
        for node in nodes:
            name = node.get("category_name", "")
            desc_id = node.get("description_category_id", "")
            type_id = node.get("type_id", "")
            children = node.get("children", [])
            cur_path = f"{path}/{name}" if path else name
            if type_id:
                leaf_nodes.append((desc_id, type_id, cur_path))
            all_nodes.append((desc_id, type_id, cur_path))
            if children:
                collect_leaves(children, cur_path)

    collect_leaves(tree_data)
    print(f"  发现 {len(leaf_nodes)} 个叶子类目 (含type_id)")

    # 保存叶子类目索引供快速查找
    index_path = os.path.join(cache.cache_dir, "category_index.json")
    index_data = {
        "generated_at": int(time.time()),
        "total_leaves": len(leaf_nodes),
        "leaves": [
            {"desc_cat_id": d, "type_id": t, "path": p}
            for d, t, p in leaf_nodes
        ],
    }
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False)
    print(f"  类目索引已保存: {len(leaf_nodes)} 条")

    # Step 2: 拉取每个叶子类目的属性
    print(f"[2/3] 拉取类目属性...")
    attr_count = 0
    dict_attrs = []
    for i, (desc_id, type_id, path) in enumerate(leaf_nodes):
        attr_params = {
            "description_category_id": desc_id,
            "type_id": type_id,
            "language": "ZH_HANS",
        }
        attrs = cache.get_or_fetch(
            "/v1/description-category/attribute",
            attr_params,
            lambda _d=desc_id, _t=type_id: requests.post(
                "https://api-seller.ozon.ru/v1/description-category/attribute",
                headers=headers,
                json={"description_category_id": _d, "type_id": _t, "language": "ZH_HANS"},
                timeout=30,
            ).json().get("result", []),
        )
        if isinstance(attrs, list):
            attr_count += len(attrs)
            for a in attrs:
                if a.get("dictionary_id") or a.get("is_dictionary"):
                    dict_attrs.append((desc_id, type_id, a))

        if (i + 1) % 100 == 0 or i == len(leaf_nodes) - 1:
            print(f"  [{i+1}/{len(leaf_nodes)}] 属性累计: {attr_count}, 字典属性: {len(dict_attrs)}")
        time.sleep(0.15)

    # Step 3: 拉取每个字典属性的可选值
    print(f"[3/3] 拉取字典值 ({len(dict_attrs)} 个字典属性)...")
    val_count = 0
    for i, (desc_id, type_id, attr) in enumerate(dict_attrs):
        attr_id = attr.get("id")
        all_values = []
        last_value_id = 0
        while True:
            val_params = {
                "attribute_id": attr_id,
                "description_category_id": desc_id,
                "type_id": type_id,
                "limit": 2000,
                "last_value_id": last_value_id,
                "language": "ZH_HANS",
            }
            val_response = cache.get_or_fetch(
                "/v1/description-category/attribute/values",
                val_params,
                lambda _a=attr_id, _d=desc_id, _t=type_id, _last=last_value_id: requests.post(
                    "https://api-seller.ozon.ru/v1/description-category/attribute/values",
                    headers=headers,
                    json={
                        "attribute_id": _a,
                        "description_category_id": _d,
                        "type_id": _t,
                        "limit": 2000,
                        "last_value_id": _last,
                        "language": "ZH_HANS",
                    },
                    timeout=30,
                ).json(),
            )
            if not isinstance(val_response, dict):
                break

            values = val_response.get("result", [])
            if not isinstance(values, list) or not values:
                break

            all_values.extend(values)
            has_next = val_response.get("has_next")
            if has_next is False:
                break
            if has_next is None and len(values) < 2000:
                break

            last_value_id = values[-1].get("id", 0) or 0
            if not last_value_id:
                break
        values = all_values
        val_count += len(values) if isinstance(values, list) else 0

        if (i + 1) % 100 == 0 or i == len(dict_attrs) - 1:
            print(f"  [{i+1}/{len(dict_attrs)}] 字典值累计: {val_count}")
        time.sleep(0.15)

    # 汇总
    s = cache.status()
    print(f"\n=== 预拉取完成 ===")
    print(f"叶子类目: {len(leaf_nodes)}")
    print(f"属性总数: {attr_count}")
    print(f"字典属性: {len(dict_attrs)}")
    print(f"字典值总数: {val_count}")
    print(f"缓存文件: {s['total_files']} 个 ({s['total_size_kb']} KB)")


def main():
    parser = argparse.ArgumentParser(description="Ozon API缓存管理")
    parser.add_argument(
        "--refresh",
        nargs="?",
        const="all",
        default=None,
        help="刷新缓存: all(默认)/tree/attrs/values",
    )
    parser.add_argument(
        "--status", action="store_true", help="查看缓存状态"
    )
    parser.add_argument(
        "--ttl", type=int, default=None, help="设置TTL(天)"
    )
    parser.add_argument(
        "--prefetch", action="store_true",
        help="全量预拉取: 遍历类目树，缓存所有类目属性+字典值"
    )
    args = parser.parse_args()

    ttl = args.ttl * 86400 if args.ttl else None
    cache = OzonCache(ttl=ttl)

    if args.status:
        s = cache.status()
        print(f"缓存目录: {s['cache_dir']}")
        print(f"缓存文件: {s['total_files']} 个")
        print(f"缓存大小: {s['total_size_kb']} KB")
        print(f"过期文件: {s['expired_files']} 个")
        print(f"TTL: {s['ttl_days']:.0f} 天")
        print(f"按端点分布:")
        for ep, count in sorted(s["endpoints"].items()):
            print(f"  {ep}: {count} 个")

    elif args.prefetch:
        prefetch_all(cache)

    elif args.refresh:
        target = args.refresh
        if target == "all":
            count = cache.invalidate()
            print(f"已清除全部缓存: {count} 个文件")
        elif target == "tree":
            count = cache.invalidate_by_prefix("/v1/description-category/tree")
            print(f"已清除类目树缓存: {count} 个文件")
        elif target == "attrs":
            count = cache.invalidate_by_prefix(
                "/v1/description-category/attribute"
            )
            # 清除属性缓存时同时清除字典值
            count2 = cache.invalidate_by_prefix(
                "/v1/description-category/attribute/values"
            )
            print(f"已清除属性+字典值缓存: {count + count2} 个文件")
        elif target == "values":
            count = cache.invalidate_by_prefix(
                "/v1/description-category/attribute/values"
            )
            print(f"已清除字典值缓存: {count} 个文件")
        else:
            print(f"未知刷新目标: {target}，可选: all/tree/attrs/values")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
