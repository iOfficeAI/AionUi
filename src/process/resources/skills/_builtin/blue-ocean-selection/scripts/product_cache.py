#!/usr/bin/env python3
"""
产品特征缓存 - 本地优先 + Supabase 异步共享

当前实现:
- 本地缓存: JSON文件，毫秒级读取，避免重复LLM调用
- Supabase: 云端共享，主要承担静默上传/跨端复用

读取路径: 本地缓存 → LLM实时分析
写入路径: 本地立即写入 → 静默上传Supabase

说明:
- `_load_from_supabase()` 仍保留为兼容/排障辅助函数，但当前主读取路径不依赖它
- 使用已有的 `products` 表，分析数据存储在 `metadata` JSONB 字段中
  - `metadata.product_info`  - 产品分析结果(LLM生成)
  - `metadata.bg_info`       - 产品背景适配(LLM生成)
  - `metadata.category_info` - 类目信息
"""

import hashlib
import json
import os
import sys
import time
from typing import Optional

# ── 配置 (内置，用户无需配置) ────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://kekmmpsuiiokdckdeolv.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtla21wcHN1aWlva2Rja2Rlb2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjAwNDQsImV4cCI6MjA5MDE5NjA0NH0.WBj1BCwQt_Oflka2wF3mOJ9pGsdOiR_SZF7pz3MXhwA")

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "product_cache")
TABLE_NAME = "products"

# ── 本地缓存 ──────────────────────────────────────────────


def _cache_key(offer_id: str) -> str:
    """用offer_id做缓存key(如pc-20260502-001)，避免同名不同外观产品碰撞"""
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in offer_id[:50])
    return safe


def _cache_path(offer_id: str) -> str:
    return os.path.join(CACHE_DIR, f"{_cache_key(offer_id)}.json")


def load_product_cache(offer_id: str, max_age_hours: int = 720) -> Optional[dict]:
    """加载产品缓存: 本地优先（Supabase已从读取路径移除，仅异步代写）
    
    Args:
        offer_id: 商品货号(如pc-20260502-001)，替代旧的sku_name避免碰撞
    """
    # 本地缓存
    path = _cache_path(offer_id)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            cached_at = data.get("cached_at", 0)
            if (time.time() - cached_at) / 3600 <= max_age_hours:
                data["_from_cache"] = "local"
                return data
        except (json.JSONDecodeError, KeyError):
            pass

    return None


def save_product_cache(offer_id: str, product_info: dict, bg_info: dict = None,
                       category_info: dict = None, generated_images: list = None) -> str:
    """保存产品缓存: 本地立即写入 + 静默上传Supabase
    
    Args:
        offer_id: 商品货号(如pc-20260502-001)
        product_info: LLM产品分析结果
        bg_info: 场景背景信息
        category_info: 类目信息
        generated_images: 已成功生成的图片列表 [{"slot":"main","url":"https://...","name":"电商主图"}, ...]
    """
    os.makedirs(CACHE_DIR, exist_ok=True)

    # 如果已有缓存，合并 generated_images（增量更新）
    existing = load_product_cache(offer_id)
    existing_images = existing.get("generated_images", []) if existing else []
    if generated_images is not None:
        # 用新列表覆盖：新成功的slot替换旧的，保留旧的不在新列表中的
        new_slot_map = {img["slot"]: img for img in generated_images if img.get("url")}
        old_slot_map = {img["slot"]: img for img in existing_images if img.get("url")}
        old_slot_map.update(new_slot_map)
        merged_images = [old_slot_map[s] for s in old_slot_map if s in old_slot_map]
    else:
        merged_images = existing_images

    data = {
        "offer_id": offer_id,
        "cached_at": time.time(),
        "product_info": product_info,
        "bg_info": bg_info or {},
        "category_info": category_info or {},
        "generated_images": merged_images,
    }

    path = _cache_path(offer_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 静默上传Supabase (不阻塞主流程)
    _upload_to_supabase(offer_id, data)

    return path


def invalidate_product_cache(offer_id: str) -> bool:
    path = _cache_path(offer_id)
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


# ── Supabase 操作 (静默，用户无感) ────────────────────────


def _sb_headers() -> dict:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _load_from_supabase(offer_id: str) -> Optional[dict]:
    """从Supabase products表加载产品分析缓存(兼容/排障辅助，不在主读路径中)。"""
    if not SUPABASE_URL:
        return None
    try:
        from http_client import requests as http_requests
        url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
        params = {
            "offer_id": f"eq.{offer_id}",
            "select": "metadata",
            "limit": "1",
        }
        r = http_requests.get(url, headers=_sb_headers(), params=params, timeout=8)
        if r.status_code == 200:
            rows = r.json()
            if rows and rows[0].get("metadata"):
                meta = rows[0]["metadata"]
                pi = meta.get("product_info", {})
                if pi:  # 有product_info才算是有效缓存
                    return {
                        "offer_id": offer_id,
                        "cached_at": time.time(),
                        "product_info": pi,
                        "bg_info": meta.get("bg_info", {}),
                        "category_info": meta.get("category_info", {}),
                        "generated_images": meta.get("generated_images", []),
                    }
    except Exception as e:
        print(f"[Cache] Supabase load: {e}", file=sys.stderr)
    return None


def _upload_to_supabase(offer_id: str, data: dict):
    """异步上传到Supabase products表 — 通过异步写队列，主流程零阻塞"""
    if not SUPABASE_URL:
        return
    try:
        from ozon_distributed_cache import async_upload

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
            "source": "cache_sync",
        }
        async_upload("products", sb_data, conflict_key="offer_id")
    except Exception as e:
        print(f"[Cache] Async Supabase upload queue: {e}", file=sys.stderr)


# ── 批量同步 ──────────────────────────────────────────────


def sync_to_supabase() -> dict:
    """将本地所有缓存异步推送到Supabase写队列（零阻塞）"""
    if not os.path.exists(CACHE_DIR):
        return {"status": "skip", "reason": "No local cache"}

    queued = 0
    for fname in os.listdir(CACHE_DIR):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(CACHE_DIR, fname), "r", encoding="utf-8") as f:
                data = json.load(f)
            # 兼容旧缓存用sku_name，新缓存用offer_id
            oid = data.get("offer_id", data.get("sku_name", ""))
            if oid:
                _upload_to_supabase(oid, data)
                queued += 1
        except Exception:
            pass

    return {"status": "ok", "queued": queued}


def sync_from_supabase(limit: int = 100) -> dict:
    """从Supabase下载最近缓存到本地"""
    try:
        from http_client import requests as http_requests
        url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
        params = {
            "select": "offer_id,sku_name,metadata",
            "order": "updated_at.desc",
            "limit": limit,
        }
        r = http_requests.get(url, headers=_sb_headers(), params=params, timeout=15)
        if r.status_code != 200:
            return {"status": "error", "detail": f"HTTP {r.status_code}"}

        rows = r.json()
        synced = 0
        for row in rows:
            # 优先用offer_id，兼容旧数据用sku_name
            oid = row.get("offer_id", "") or row.get("sku_name", "")
            meta = row.get("metadata", {})
            pi = meta.get("product_info", {}) if meta else {}
            if not oid or not pi:
                continue
            # 只下载本地没有的
            if not os.path.exists(_cache_path(oid)):
                save_product_cache(
                    oid,
                    pi,
                    meta.get("bg_info"),
                    meta.get("category_info"),
                )
                synced += 1

        return {"status": "ok", "total_rows": len(rows), "new_synced": synced}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ── CLI ────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="产品缓存管理")
    parser.add_argument("--sync-up", action="store_true", help="上传本地缓存到Supabase")
    parser.add_argument("--sync-down", action="store_true", help="从Supabase下载缓存到本地")
    parser.add_argument("--list", action="store_true", help="列出本地缓存")
    parser.add_argument("--stats", action="store_true", help="缓存统计")
    args = parser.parse_args()

    if args.sync_up:
        result = sync_to_supabase()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.sync_down:
        result = sync_from_supabase()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.list:
        if os.path.exists(CACHE_DIR):
            for f in sorted(os.listdir(CACHE_DIR)):
                if f.endswith(".json"):
                    with open(os.path.join(CACHE_DIR, f), "r", encoding="utf-8") as fh:
                        d = json.load(fh)
                    age_h = (time.time() - d.get("cached_at", 0)) / 3600
                    print(f"  {d.get('sku_name', '?'):30s}  {age_h:.0f}h ago  {f}")
        else:
            print("No local cache")
    elif args.stats:
        local_count = len([f for f in os.listdir(CACHE_DIR) if f.endswith(".json")]) if os.path.exists(CACHE_DIR) else 0
        print(json.dumps({
            "local_cache_count": local_count,
            "supabase_status": "configured",
            "cache_dir": CACHE_DIR,
        }, ensure_ascii=False, indent=2))
    else:
        parser.print_help()
