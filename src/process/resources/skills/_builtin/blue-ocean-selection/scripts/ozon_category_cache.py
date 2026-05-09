#!/usr/bin/env python3
"""Ozon类目树缓存与搜索索引构建器

用途:
  1. 首次运行时抓取Ozon完整类目树(中文+俄语)并缓存到本地
  2. 构建扁平化双语搜索索引，支持毫秒级类目检索
  3. 后续pipeline运行直接读取本地缓存，无需重复请求API

用法:
  python scripts/ozon_category_cache.py              # 抓取+构建索引
  python scripts/ozon_category_cache.py --refresh     # 强制刷新缓存
  python scripts/ozon_category_cache.py --search "硅胶油刷"  # 搜索测试

缓存文件:
  assets/ozon_category_index.json  - 双语搜索索引 (中文+俄语合并)
"""

import argparse
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
ASSETS_DIR = os.path.join(PROJECT_DIR, "assets")

INDEX_CACHE_PATH = os.path.join(ASSETS_DIR, "ozon_category_index.json")
CACHE_TTL_SECONDS = 7 * 24 * 3600


def _get_ozon_headers():
    """获取Ozon API请求头"""
    try:
        from config import get_config
        config = get_config()
        return {
            "Client-Id": str(config.ozon_client_id),
            "Api-Key": config.ozon_api_key,
            "Content-Type": "application/json"
        }
    except Exception:
        return {
            "Client-Id": os.environ.get("OZON_CLIENT_ID", ""),
            "Api-Key": os.environ.get("OZON_API_KEY", ""),
            "Content-Type": "application/json"
        }


def _flatten_tree(nodes, path="", parent_cat_id="", lang="DEFAULT"):
    """将树结构扁平化为搜索条目列表"""
    entries = []
    for node in nodes:
        name = node.get("category_name", "")
        cat_id = node.get("description_category_id", "") or parent_cat_id
        children = node.get("children", [])
        type_id = node.get("type_id", "")
        type_name = node.get("type_name", "")
        current_path = f"{path}/{name}" if path and name else (path or name)

        if type_id and not node.get("disabled", False):
            search_text = f"{type_name} {name} {current_path}".lower()
            entries.append({
                "cat_id": int(cat_id) if cat_id else 0,
                "type_id": int(type_id) if type_id else 0,
                "path": current_path,
                "type_name": type_name,
                "type_name_lower": type_name.lower(),
                "path_lower": current_path.lower(),
                "search_text": search_text,
                "lang": lang
            })

        if children:
            entries.extend(_flatten_tree(children, current_path, cat_id, lang))
    return entries


def build_index(force=False):
    """构建双语搜索索引（中文+俄语合并）
    
    策略: 同一个type_id在中文树和俄语树中都有条目，
    搜索时中文/俄语关键词都能匹配。
    """
    # 检查缓存
    if not force and os.path.exists(INDEX_CACHE_PATH):
        try:
            with open(INDEX_CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if time.time() - data.get("cached_at", 0) < CACHE_TTL_SECONDS:
                entries = data.get("entries", [])
                if entries:
                    print(f"[Index] 使用本地搜索索引 ({len(entries)} 条)")
                    return entries
        except Exception:
            pass

    print("[Index] 构建双语搜索索引...")
    from http_client import requests as http_requests

    headers = _get_ozon_headers()
    all_entries = []

    # 抓取中文树 + 俄语树
    for lang in [("ZH_HANS", "中文"), ("DEFAULT", "俄语")]:
        lang_code, lang_label = lang
        try:
            r = http_requests.post(
                "https://api-seller.ozon.ru/v1/description-category/tree",
                headers=headers,
                json={"language": lang_code},
                timeout=30
            )
            if r.ok:
                tree = r.json().get("result", [])
                if tree:
                    entries = _flatten_tree(tree, lang=lang_code)
                    all_entries.extend(entries)
                    print(f"[Index] {lang_label}树: {len(entries)} 个可上架类目")
        except Exception as e:
            print(f"[Index] {lang_label}树获取失败: {e}")

    if not all_entries:
        print("[Index] 警告: 未能获取类目树")
        if os.path.exists(INDEX_CACHE_PATH):
            with open(INDEX_CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f).get("entries", [])
        return []

    # 去重: 同一个 (cat_id, type_id) 在两种语言中可能重复，保留中文条目（路径更友好）
    seen = set()
    unique = []
    # 先放中文，后放俄语，确保中文优先
    all_entries.sort(key=lambda e: 0 if e["lang"] == "ZH_HANS" else 1)
    for entry in all_entries:
        key = f"{entry['cat_id']}_{entry['type_id']}"
        if key not in seen:
            seen.add(key)
            unique.append(entry)
        else:
            # 合并搜索文本：把俄语type_name加入已有中文条目的search_text
            for existing in unique:
                ekey = f"{existing['cat_id']}_{existing['type_id']}"
                if ekey == key and entry["lang"] == "DEFAULT":
                    # 把俄语type_name加入中文条目的搜索文本
                    ru_text = f"{entry['type_name']} {entry['type_name_lower']}"
                    if ru_text not in existing["search_text"]:
                        existing["search_text"] += " " + ru_text.lower()
                    # 同时保存俄语type_name方便LLM匹配
                    if not existing.get("type_name_ru"):
                        existing["type_name_ru"] = entry["type_name"]
                    break

    print(f"[Index] 合并去重后: {len(unique)} 个类目 (含双语搜索文本)")

    # 保存
    os.makedirs(ASSETS_DIR, exist_ok=True)
    with open(INDEX_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "cached_at": time.time(),
            "entry_count": len(unique),
            "entries": unique
        }, f, ensure_ascii=False)
    print(f"[Index] 索引已缓存到 {INDEX_CACHE_PATH}")

    return unique


def search_category(keyword, index=None, top_k=5):
    """在本地索引中搜索类目（毫秒级）
    
    匹配策略:
    1. type_name精确匹配 (100分)
    2. type_name包含关键词 (80分)
    3. 关键词包含type_name (70分)
    4. 路径包含关键词 (50分)
    5. search_text包含关键词 (40分)
    6. 词根模糊匹配 (30分)
    """
    if index is None:
        index = _load_index()
    if not index:
        return []

    kw_lower = keyword.lower()
    scored = []

    for entry in index:
        type_lower = entry.get("type_name_lower", "")
        path_lower = entry.get("path_lower", "")
        search_text = entry.get("search_text", "")
        score = 0

        # 1. type_name精确匹配
        if type_lower == kw_lower:
            score += 100
        # 2. type_name包含关键词
        elif kw_lower in type_lower:
            score += 80
        # 3. 关键词包含type_name
        elif type_lower and type_lower in kw_lower:
            score += 70
        # 4. 路径包含关键词
        if kw_lower in path_lower:
            score += 50
        # 5. search_text包含关键词（含俄语合并文本）
        if score == 0 and kw_lower in search_text:
            score += 40
        # 6. 词根模糊匹配（俄语词形变化）
        if score == 0 and type_lower and len(kw_lower) >= 4:
            for stem_len in [7, 6, 5, 4]:
                if len(kw_lower) >= stem_len and kw_lower[:stem_len] in type_lower:
                    score += 30
                    break
                if len(type_lower) >= stem_len and type_lower[:stem_len] in kw_lower:
                    score += 30
                    break

        if score > 0:
            if entry.get("type_id"):
                score += 10
            scored.append((score, entry))

    scored.sort(key=lambda x: x[0], reverse=True)

    results = []
    seen = set()
    for score, entry in scored:
        key = f"{entry['cat_id']}_{entry['type_id']}"
        if key not in seen:
            seen.add(key)
            results.append({
                "description_category_id": entry["cat_id"],
                "type_id": entry["type_id"],
                "name": entry["path"],
                "type_name": entry["type_name"],
                "type_name_ru": entry.get("type_name_ru", ""),
                "score": score
            })
            if len(results) >= top_k:
                break

    return results


def _load_index():
    """从本地文件加载搜索索引"""
    if os.path.exists(INDEX_CACHE_PATH):
        try:
            with open(INDEX_CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("entries", [])
        except Exception:
            pass
    return []


def ensure_cache():
    """确保缓存存在，不存在则自动构建"""
    index = _load_index()
    if index:
        return index
    return build_index()


def main():
    parser = argparse.ArgumentParser(description="Ozon类目树缓存与搜索")
    parser.add_argument("--refresh", action="store_true", help="强制刷新缓存")
    parser.add_argument("--search", type=str, help="搜索关键词")
    parser.add_argument("--top-k", type=int, default=5, help="搜索返回数量")
    args = parser.parse_args()

    if args.search:
        ensure_cache()
        results = search_category(args.search, top_k=args.top_k)
        print(f"\n搜索 '{args.search}' 结果 ({len(results)} 条):")
        for r in results:
            ru = f" ({r['type_name_ru']})" if r.get('type_name_ru') else ""
            print(f"  [score={r['score']}] cat_id={r['description_category_id']} type_id={r['type_id']} {r['type_name']}{ru}")
            print(f"           路径: {r['name']}")
    else:
        build_index(force=args.refresh)
        # 快速测试
        print(f"\n快速搜索测试:")
        for kw in ["硅胶油刷", "厨房刷", "кисть кулинарная", "bluetooth speaker", "обувь"]:
            results = search_category(kw, top_k=2)
            if results:
                top = results[0]
                ru = f" ({top['type_name_ru']})" if top.get('type_name_ru') else ""
                print(f"  '{kw}' -> {top['type_name']}{ru} (score={top['score']})")
            else:
                print(f"  '{kw}' -> 无结果")


if __name__ == "__main__":
    main()
