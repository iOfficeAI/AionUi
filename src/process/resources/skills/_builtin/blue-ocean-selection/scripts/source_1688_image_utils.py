#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""1688 图片 URL 提取与规范化辅助函数。"""

import html
import re


def normalize_1688_image_url(url: str) -> str:
    if not url:
        return ""

    clean = html.unescape(str(url)).replace("\\/", "/").strip().strip("\"'")
    if clean.startswith("//"):
        clean = f"https:{clean}"

    clean = clean.split(".sum_")[0] if ".sum_" in clean else clean
    clean = re.sub(r'(\.(?:jpg|jpeg|png))(?:_)?\.webp(?=$|[?&#])', r'\1', clean, flags=re.IGNORECASE)
    clean = re.sub(r'(\.(?:jpg|jpeg|png|webp))_[0-9]+x[0-9]+\.(?:jpg|jpeg|png|webp)(?=$|[?&#])', r'\1', clean, flags=re.IGNORECASE)
    clean = re.sub(r'_[0-9]+x[0-9]+q\d+\.(?:jpg|jpeg|png|webp)(?=$|[?&#])', '', clean, flags=re.IGNORECASE)
    clean = clean.rstrip(',"\'> )]')

    if not re.search(r'\.(?:jpg|jpeg|png|webp)(?:$|[?&#])', clean, re.IGNORECASE):
        return ""
    if "alicdn" not in clean and "taobaocdn" not in clean:
        return ""
    return clean


def extract_1688_image_urls(text: str) -> list[str]:
    if not text:
        return []

    text = html.unescape(text).replace("\\/", "/")
    patterns = [
        r'<img[^>]+class=["\'][^"\']*preview-img[^"\']*["\'][^>]+src=["\']([^"\']+)["\']',
        r'((?:https?:)?//[a-z0-9._/-]+(?:alicdn|taobaocdn)[^"\\\'<>\s]+?\.(?:jpg|png|jpeg|webp)(?:\?[^"\\\'<>\s]*)?)',
        r'((?:https?:)?//[^"\\\'<>\s]+?/img/ibank/[^"\\\'<>\s]+)',
    ]

    image_urls = []
    for pattern in patterns:
        image_urls.extend(re.findall(pattern, text, re.IGNORECASE))

    seen = set()
    filtered_images = []
    for url in image_urls:
        clean = normalize_1688_image_url(url)
        if not clean or clean in seen:
            continue
        seen.add(clean)
        filtered_images.append(clean)
    return filtered_images


def score_1688_image_url(url: str) -> int:
    clean = normalize_1688_image_url(url)
    if not clean:
        return -10000
    lower = clean.lower()
    score = 0
    if 'cbu01.alicdn.com' in lower or '/img/ibank/' in lower:
        score += 120
    if 'overseas_pic' in lower or '-0-cib' in lower:
        score += 80
    if 'imgextra' in lower and 'o1cn' in lower:
        score += 30
    if 'gw.alicdn.com' in lower:
        score -= 160
    if '-tps-' in lower:
        score -= 140
    if '/tfs/' in lower:
        score -= 40
    m = re.search(r'[_-](\d{2,3})x(\d{2,3})\.', lower)
    if m:
        w, h = map(int, m.groups())
        if min(w, h) <= 160:
            score -= 120
    m2 = re.search(r'-(\d{2,3})-(\d{2,3})\.(?:png|jpg|jpeg|webp)$', lower)
    if m2:
        w, h = map(int, m2.groups())
        if min(w, h) <= 160:
            score -= 120
    return score


def choose_best_1688_image_url(image_urls: list[str]) -> str:
    candidates = [normalize_1688_image_url(u) for u in (image_urls or [])]
    candidates = [u for u in candidates if u]
    if not candidates:
        return ''

    strict_primary = [
        u for u in candidates
        if ('cbu01.alicdn.com' in u.lower() or '/img/ibank/' in u.lower())
        and ('overseas_pic' in u.lower() or '-0-cib' in u.lower() or '!!' in u)
    ]
    if strict_primary:
        return sorted(strict_primary, key=score_1688_image_url, reverse=True)[0]

    ibank_only = [u for u in candidates if 'cbu01.alicdn.com' in u.lower() or '/img/ibank/' in u.lower()]
    if ibank_only:
        return sorted(ibank_only, key=score_1688_image_url, reverse=True)[0]

    ranked = sorted(candidates, key=score_1688_image_url, reverse=True)
    return ranked[0]
