#!/usr/bin/env python3
"""
Ozon电商图片生成 v3.6.0 - 3:4原生生图 + EXTREME FILL构图 + ULTRA-BOLD字体

核心逻辑:
1. 白底图先生成(产品锚点): 使用1688货源图作为参考，生成纯净白底商品图(1:1)
2. 其余5张使用1688货源图作为参考: 确保产品外观与实物一致(3:4竖版)
3. 3:4原生输出: 通过 extra_body.google.image_config 控制生图比例，零裁剪
4. EXTREME FILL构图: 画面填充率80%+，零留白，杂志级密度
5. ULTRA-BOLD字体: 贴片文字10-12%图像高度，3米外可见

生成顺序(与展示顺序不同):
  GEN_ORDER:  white_bg → main → usp → detail → trust → scene2
  SLOT_ORDER: main → usp → detail → trust → scene2 → white_bg

Prompt公式: [参考指令] + [主体+动作+场景] + [文字贴片指令] + [质量关键词]
"""

import argparse
import base64
import io
import json
import mimetypes
import os
import re
import sys
import time
from PIL import Image, ImageDraw, ImageFont

try:
    from http_client import requests
except ImportError:
    import requests

from config import get_config

                                                                              
                                    
                                                                              
GEN_ORDER = ["white_bg", "main", "usp", "detail", "trust", "scene2"]

                  
SLOT_ORDER = ["main", "usp", "detail", "trust", "scene2", "white_bg"]

                                                                              
                                                    
                                              
                                    
                                                                              
IMAGE_SLOTS = {
    "white_bg": {
        "name": "白底商品图",
        "narrative_role": "ANCHOR - 产品锚点图，先生成，供后续5张图参考确保一致性",
        "aspect_ratio": "1:1",
        "prompt_template": (
            "CRITICAL REFERENCE FIDELITY: You MUST reproduce the EXACT product from the reference image with pixel-perfect accuracy. "
            "Same material texture, same surface finish (glossy/matte/textured), same color, same shape, same proportions. "
            "ZERO creative reinterpretation of the product itself. "
            "Product photography. Place this EXACT product on a 100% pure solid white background (hex #FFFFFF, no gradients, no tints). "
            "The product must DOMINATE the frame — fill at least 85% of the image, tight crop, no empty margins, ZERO breathing room. "
            "Professional studio lighting: key light from above-left, fill light from right, soft natural shadows on the white surface. "
            "45-degree angle view showing the product's best side. The product looks premium, inviting, and perfectly centered. "
            "ABSOLUTELY NO other objects, NO text, NO decorations, NO watermarks, NO color casts. "
            "Pure white #FFFFFF background everywhere outside the product. "
            "Professional product photography, 85mm lens, f/8, studio strobe lighting, 4K ultra-sharp."
        )
    },
    "main": {
        "name": "电商主图",
        "narrative_role": "HERO - 第一印象，定义产品定位与核心卖点",
        "aspect_ratio": "3:4",
        "prompt_template": (
            "CRITICAL REFERENCE FIDELITY: You MUST reproduce the EXACT product from the reference image. "
            "The product's material texture, surface finish (glossy/matte/textured), color, and shape MUST be IDENTICAL to the reference. "
            "ZERO additions — no accessories, no extra parts, no items not in the reference. "
            "Create a HIGH-IMPACT e-commerce hero photo: the product is being held by a person's hands in {hero_scene}. "
            "COMPOSITION: Product + hands fill 75-80% of frame. Clean, modern, premium look. "
            "GLASS-MORPHISM TEXT OVERLAYS: "
            "1) A slim frosted glass banner across the top with '{sku_name_ru}' — semi-transparent white/frosted glass background, "
            "subtle white gradient, soft diffused light, NO thick black outlines. Text is clean bold sans-serif in dark color, "
            "naturally readable through the frosted glass effect. Banner height ~6-8% of image. Elegant and modern. "
            "2) Three rounded-rectangle 'info chip' stickers floating on the sides reading '{usp1_ru}', '{usp2_ru}', '{usp3_ru}' — "
            "each chip has frosted glass/frosted background with subtle semi-transparent white-to-transparent gradient, "
            "small icon on left, clean bold text on right. Soft white glow border instead of thick dark outline. "
            "Each chip ~6-8% of image height. Refined, modern, premium feel. "
            "NO heavy black outlines, NO harsh borders, NO thick drop shadows. Use soft luminous glow and frosted glass instead. "
            "{main_bg_hint}. "
            "Warm professional studio lighting + natural ambient light, 50mm lens, f/2.8. "
            "Premium e-commerce photography, 4K. Modern glass-morphism design language."
        )
    },
    "usp": {
        "name": "卖点信息图",
        "narrative_role": "USP - 拆解功能优势，说服购买",
        "aspect_ratio": "3:4",
        "prompt_template": (
            "CRITICAL REFERENCE FIDELITY: You MUST reproduce the EXACT product from the reference image. "
            "The product's material texture, surface finish (glossy/matte/textured), color, and shape MUST be IDENTICAL to the reference. "
            "ZERO additions — no accessories, no extra parts, no items not in the reference. "
            "Create a lifestyle product photo: the product is displayed on {usp_surface} in {usp_scene}, shown from a slightly different angle. "
            "COMPOSITION: Product + info chips fill 70-75% of frame. Clean, organized, premium look. "
            "GLASS-MORPHISM INFO CHIPS: 4 rounded-rectangle callout stickers floating around the product, "
            "each with frosted glass/frosted background, small minimalist icon on left, clean bold Russian text on right: "
            "'{usp1_ru}', '{usp2_ru}', '{usp3_ru}', '{usp4_ru}'. "
            "Each chip has semi-transparent white-to-transparent gradient, soft white luminous glow border (NO thick dark outline), "
            "subtle background blur/bokeh visible through the frosted glass. Chip height ~6-8% of image. "
            "Elegant, modern, premium e-commerce style. Small icon + short text per chip. "
            "NO heavy outlines, NO harsh shadows. Soft frosted glass aesthetic. "
            "{usp_bg_hint}. "
            "Warm directional lighting, 85mm lens, f/5.6. Premium e-commerce look, 4K, photorealistic. Glass-morphism design."
        )
    },
    "detail": {
        "name": "细节特写图",
        "narrative_role": "DETAIL - 展示材质工艺，建立品质信任",
        "aspect_ratio": "3:4",
        "prompt_template": (
            "CRITICAL REFERENCE FIDELITY: You MUST reproduce the EXACT product from the reference image. "
            "The product's material texture, surface finish (glossy/matte/textured), color, and shape MUST be IDENTICAL to the reference. "
            "ZERO additions — no accessories, no extra parts, no items not in the reference. "
            "Create an EXTREME close-up macro photo: zoom into the {material_en} texture and craftsmanship on {detail_surface}. "
            "COMPOSITION: The texture fills the frame — close-up, product detail occupies 85%+ of image. "
            "GLASS-MORPHISM ANNOTATION: A frosted glass rounded-rectangle label at bottom-right corner with Russian text "
            "'{material_ru}: {quality_desc_ru}' — semi-transparent frosted glass background with subtle white gradient, "
            "soft luminous glow border (NO thick dark outline), clean bold text. Label height ~5-7% of image. "
            "Large number highlight for key spec (e.g. '100%' or '5x') with small unit text below — big number dominates the chip. "
            "Elegant, refined, premium. NO harsh borders. "
            "Side-angle warm ring lighting highlights the surface quality and fine details, every texture visible, 100mm macro lens, f/5.6. "
            "{detail_bg_hint} softly blurred in background. "
            "Professional macro product photography, shallow depth of field, 4K. Glass-morphism annotation style."
        )
    },
    "trust": {
        "name": "信任场景图",
        "narrative_role": "TRUST - 真人使用场景，建立情感连接",
        "aspect_ratio": "3:4",
        "prompt_template": (
            "CRITICAL REFERENCE FIDELITY: You MUST reproduce the EXACT product from the reference image. "
            "The product's material texture, surface finish (glossy/matte/textured), color, and shape MUST be IDENTICAL to the reference. "
            "ZERO additions — no accessories, no extra parts, no items not in the reference. "
            "MANDATORY REQUIREMENT: Create an authentic lifestyle photo with a REAL PERSON genuinely using the product in {trust_scene}. "
            "The person's hands AND face must be clearly visible, naturally interacting with the product with a warm satisfied smile. "
            "COMPOSITION: Person + product fill the frame, tight portrait crop from chest up. Magazine cover composition. "
            "The product is LARGE and prominent, the clear focal point of the image. "
            "GLASS-MORPHISM TRUST BADGE: A slim frosted glass horizontal bar near bottom with 'ПРОВЕРЕНО ПОКУПАТЕЛЯМИ' — "
            "semi-transparent frosted background with subtle green/gold accent, soft luminous glow border, "
            "small shield or checkmark icon on left, clean bold text. Bar height ~5-7% of image. "
            "Elegant, trustworthy, premium. NO thick borders, NO heavy shadows. Soft frosted glass aesthetic. "
            "Warm natural lighting, 50mm lens, f/2.8, cozy atmosphere, genuine happy emotion. "
            "Professional lifestyle photography, 4K, shallow depth of field on background. Glass-morphism badge."
        )
    },
    "scene2": {
        "name": "场景氛围图",
        "narrative_role": "ASPIRATIONAL - 展示不同使用场景，扩大需求联想",
        "aspect_ratio": "3:4",
        "prompt_template": (
            "CRITICAL REFERENCE FIDELITY: You MUST reproduce the EXACT product from the reference image. "
            "The product's material texture, surface finish (glossy/matte/textured), color, and shape MUST be IDENTICAL to the reference. "
            "ZERO additions — no accessories, no extra parts, no items not in the reference. "
            "MANDATORY REQUIREMENT: Create an aspirational lifestyle photo with a DIFFERENT person from the trust image, "
            "using the product in {scene2_desc} — a completely different setting and mood. "
            "COMPOSITION: Person + product fill the frame, tight crop, aspirational and inviting. "
            "The scene feels aspirational, inviting and desirable — the viewer wants to BE this person. "
            "GLASS-MORPHISM SCENE LABEL: A frosted glass rounded chip near top-right with '{scene_label_ru}' — "
            "semi-transparent frosted background, subtle accent color, soft luminous glow border, "
            "small location/scenario icon on left, clean bold text on right. Chip height ~5-7% of image. "
            "Elegant, modern, premium. NO thick borders, NO heavy shadows. Frosted glass aesthetic. "
            "Beautiful ambient lighting, 50mm lens, f/2.8, magazine-quality composition, 4K, shallow depth of field. Glass-morphism label."
        )
    }
}


                                                                              
                                  
                                                                              
PRODUCT_LOCK_TEMPLATE = (
    "[APPEARANCE LOCK] {visual_desc}. "
    "The product MUST have the EXACT same appearance: identical color, identical shape, identical size proportions. "
    "[MATERIAL LOCK] The product surface material, texture, finish, and reflectivity MUST be IDENTICAL to the reference image. "
    "If the reference shows glossy smooth plastic, it MUST remain glossy smooth plastic. "
    "If the reference shows matte rubber, it MUST remain matte rubber. "
    "If the reference shows brushed metal, it MUST remain brushed metal. "
    "NEVER change matte to glossy, plastic to metal, smooth to textured, or vice versa. "
    "[ACCESSORY LOCK] Show ONLY the single product from the reference image. "
    "DO NOT add, introduce, or imply ANY additional objects, parts, accessories, attachments, packaging, or items "
    "that are NOT visible in the reference image. Zero additions permitted. "
)

                                       
NEGATIVE_PROMPT = (
    "STRICT PROHIBITION: Do NOT add ANY objects, accessories, props, packaging, boxes, cases, "
    "attachments, cords, cables, manuals, bags, or items that are NOT visible in the reference image. "
    "If the reference image shows only the product with nothing else, then generate only the product with nothing else. "
    "Zero creative additions. Zero supplementary items. Zero background objects. "
)

BASE_FORBIDDEN_CLAIMS = [
    "Do not claim medical, orthopedic, safety, certification, or therapeutic benefits unless explicitly verified by source evidence.",
    "Do not claim accessories, packaging, bundles, or extra components that are not visible in the source product.",
    "Do not exaggerate compatibility, user group, protection level, or performance beyond what the source product visibly supports.",
]

SELLABLE_SAFE_USP_FALLBACKS = [
    "Проверенный товар",
    "Реальный материал",
    "Видимые детали",
    "Честная подача",
]


def _dedupe_keep_order(values):
    seen = set()
    result = []
    for value in values or []:
        if not isinstance(value, str):
            continue
        cleaned = " ".join(value.strip().split())
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
    return result


def _stringify_claim_value(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return " ".join(value.strip().split())
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        parts = []
        for key, sub_value in value.items():
            text = _stringify_claim_value(sub_value)
            if text:
                parts.append(f"{key}={text}")
        return ", ".join(parts)
    if isinstance(value, (list, tuple, set)):
        parts = [_stringify_claim_value(item) for item in value]
        return ", ".join([part for part in parts if part])
    return str(value)


def _pick_first_non_empty(mapping: dict, keys) -> str:
    for key in keys:
        value = mapping.get(key)
        text = _stringify_claim_value(value)
        if text:
            return text
    return ""


def _build_structured_claims(info: dict, product_1688: dict = None, vision_result: dict = None) -> dict:
    """从 1688 详情和视觉结果结构化产出 claim layers。"""
    info = info or {}
    product_1688 = product_1688 or {}
    vision_result = vision_result or {}

    verified_features = list(info.get("verified_features", []) or [])
    visible_features = list(info.get("visible_features", []) or [])
    inferred_features = list(info.get("inferred_features", []) or [])
    forbidden_claims = list(info.get("forbidden_claims", []) or [])

    title_1688 = _pick_first_non_empty(product_1688, ["product_title", "title", "subject", "_1688_title"])
    if title_1688:
        verified_features.append(f"1688 title evidence: {title_1688}")

    specs = product_1688.get("specs", []) or []
    for spec in specs[:4]:
        if isinstance(spec, dict):
            name = _pick_first_non_empty(spec, ["name", "attrName", "specName", "key", "label"])
            value = _pick_first_non_empty(spec, ["value", "attrValue", "specValue", "values", "options"])
            spec_text = f"{name}: {value}" if name and value else _stringify_claim_value(spec)
        else:
            spec_text = _stringify_claim_value(spec)
        if spec_text:
            verified_features.append(f"1688 spec evidence: {spec_text}")

    sale_props = product_1688.get("sale_props", []) or []
    for prop in sale_props[:4]:
        if isinstance(prop, dict):
            name = _pick_first_non_empty(prop, ["name", "key", "label"])
            value = _pick_first_non_empty(prop, ["values", "value", "options"])
            prop_text = f"{name}: {value}" if name and value else _stringify_claim_value(prop)
        else:
            prop_text = _stringify_claim_value(prop)
        if prop_text:
            verified_features.append(f"1688 sale property evidence: {prop_text}")

    skus = product_1688.get("skus", []) or []
    for sku in skus[:4]:
        if not isinstance(sku, dict):
            sku_text = _stringify_claim_value(sku)
        else:
            attrs = _pick_first_non_empty(sku, ["name", "skuAttrs", "attributes", "specAttrs"])
            amount = _pick_first_non_empty(sku, ["amountOnSale", "saleCount", "canBookCount"])
            price = _pick_first_non_empty(sku, ["price", "discountPrice", "skuPrice"])
            parts = []
            if attrs:
                parts.append(attrs)
            if price:
                parts.append(f"price={price}")
            if amount:
                parts.append(f"stock={amount}")
            sku_text = ", ".join(parts) if parts else _stringify_claim_value(sku)
        if sku_text:
            verified_features.append(f"1688 SKU evidence: {sku_text}")

    visual_desc = _stringify_claim_value(vision_result.get("visual_desc", ""))
    if visual_desc:
        visible_features.append(f"Visible appearance evidence: {visual_desc}")

    for item in vision_result.get("key_features_seen", []) or []:
        text = _stringify_claim_value(item)
        if text:
            visible_features.append(f"Visible feature: {text}")

    color_primary = _stringify_claim_value(vision_result.get("color_primary", ""))
    if color_primary:
        visible_features.append(f"Visible primary color: {color_primary}")

    shape = _stringify_claim_value(vision_result.get("shape", ""))
    if shape:
        visible_features.append(f"Visible shape: {shape}")

    material_likely = _stringify_claim_value(vision_result.get("material_likely", ""))
    if material_likely:
        visible_features.append(f"Visible material appearance: {material_likely}")

    for item in info.get("research_usp_items_ru", []) or info.get("usp_items_ru", []) or []:
        text = _stringify_claim_value(item)
        if text:
            inferred_features.append(text)

    for source_text in [info.get("usps_ru", ""), info.get("usage_scenario", ""), info.get("subtitle_ru", "")]:
        if isinstance(source_text, str):
            parts = [part.strip() for part in source_text.split("|") if part.strip()]
            inferred_features.extend(parts)

    evidence_blob = json.dumps(
        {
            "title": title_1688,
            "specs": specs,
            "sale_props": sale_props,
            "skus": skus,
            "vision": vision_result,
        },
        ensure_ascii=False,
    ).lower()

    if not any(token in evidence_blob for token in ["防水", "waterproof", "water resistant", "ipx", "ip67", "водонепро"]):
        forbidden_claims.append("Do not claim waterproofing or water resistance unless explicitly stated in 1688 source specs.")
    if not any(token in evidence_blob for token in ["认证", "cert", "ce", "fcc", "rohs", "серти"]):
        forbidden_claims.append("Do not claim certification, compliance, or tested approval unless explicitly shown in source evidence.")
    if not any(token in evidence_blob for token in ["medical", "医", "ортоп", "лечеб", "therapy", "therapeutic"]):
        forbidden_claims.append("Do not claim medical, orthopedic, or therapeutic outcomes unless explicitly stated by source evidence.")
    if not any(token in evidence_blob for token in ["compatible", "compatibility", "通用", "适配", "universal", "fit all"]):
        forbidden_claims.append("Do not claim universal compatibility, fit-for-all, or model-wide support unless explicit source specs prove it.")

    return {
        "verified_features": _dedupe_keep_order(verified_features),
        "visible_features": _dedupe_keep_order(visible_features),
        "inferred_features": _dedupe_keep_order(inferred_features),
        "forbidden_claims": _dedupe_keep_order(forbidden_claims),
    }


def _build_claim_layers(product_info: dict) -> dict:
    """构建卖点来源分层：verified / visible / inferred / forbidden。"""
    product_info = product_info or {}

    verified_features = _dedupe_keep_order(product_info.get("verified_features", []))
    visible_features = _dedupe_keep_order(product_info.get("visible_features", []))
    inferred_features = _dedupe_keep_order(product_info.get("inferred_features", []))
    forbidden_claims = _dedupe_keep_order(BASE_FORBIDDEN_CLAIMS + list(product_info.get("forbidden_claims", [])))

    key_features_seen = _dedupe_keep_order(product_info.get("_key_features_seen", []))
    visible_features.extend([f"Visible feature: {item}" for item in key_features_seen])

    if product_info.get("_vision_identified"):
        visual_bits = []
        if product_info.get("_color_primary"):
            visual_bits.append(f"Primary color confirmed: {product_info['_color_primary']}")
        if product_info.get("_shape"):
            visual_bits.append(f"Shape confirmed: {product_info['_shape']}")
        if product_info.get("_material_likely"):
            visual_bits.append(f"Material appearance confirmed: {product_info['_material_likely']}")
        verified_features.extend(visual_bits)
        visible_features.extend(visual_bits)

    usp_items = _dedupe_keep_order(product_info.get("usp_items_ru", []))
    inferred_features.extend(usp_items)

    usps_ru = product_info.get("usps_ru", "")
    if isinstance(usps_ru, str):
        inferred_features.extend([part.strip() for part in usps_ru.split("|") if part.strip()])

    verified_features = _dedupe_keep_order(verified_features)
    visible_features = _dedupe_keep_order(visible_features)
    inferred_features = _dedupe_keep_order([
        item for item in inferred_features
        if item.lower() not in {v.lower() for v in verified_features + visible_features}
    ])

    return {
        "verified_features": verified_features,
        "visible_features": visible_features,
        "inferred_features": inferred_features,
        "forbidden_claims": forbidden_claims,
        "verified_usp_items_ru": _dedupe_keep_order(product_info.get("verified_usp_items_ru", [])),
        "research_usp_items_ru": _dedupe_keep_order(
            product_info.get("research_usp_items_ru", product_info.get("usp_items_ru", []))
        ),
    }


def _select_claim_policy(product_info: dict, lane: str) -> dict:
    """根据 lane 选择允许使用的卖点与禁止声明。"""
    claim_layers = _build_claim_layers(product_info)
    lane_value = (lane or "").strip().lower()
    sellable_lane = lane_value == "sellable"

    if sellable_lane:
        allowed = _dedupe_keep_order(
            claim_layers["verified_features"] + claim_layers["visible_features"]
        )
        blocked = _dedupe_keep_order(
            claim_layers["forbidden_claims"] + claim_layers["inferred_features"]
        )
        policy_name = "sellable_verified_visible_only"
        usp_items = _dedupe_keep_order(claim_layers.get("verified_usp_items_ru", []))[:4]
    else:
        allowed = _dedupe_keep_order(
            claim_layers["verified_features"] + claim_layers["visible_features"] + claim_layers["inferred_features"]
        )
        blocked = _dedupe_keep_order(claim_layers["forbidden_claims"])
        policy_name = "research_can_use_inferred"
        usp_items = _dedupe_keep_order(
            claim_layers.get("verified_usp_items_ru", []) + claim_layers.get("research_usp_items_ru", [])
        )[:4]

    if not usp_items:
        usp_items = SELLABLE_SAFE_USP_FALLBACKS[:] if sellable_lane else []
    while len(usp_items) < 4:
        usp_items.append(
            (SELLABLE_SAFE_USP_FALLBACKS if sellable_lane else ["Премиум", "Качество", "Надёжность", "Комфорт"])[len(usp_items)]
        )

    return {
        **claim_layers,
        "policy_name": policy_name,
        "allowed_claims": allowed,
        "blocked_claims": blocked,
        "usp_items": usp_items[:4],
    }


def _build_claim_guidance(slot_key: str, claim_policy: dict, lane: str) -> str:
    """将卖点分层规则注入图片 prompt。"""
    allowed_claims = claim_policy.get("allowed_claims", [])
    blocked_claims = claim_policy.get("blocked_claims", [])
    lane_value = (lane or "").strip().lower()

    allowed_text = "; ".join(allowed_claims[:6]) if allowed_claims else "No verified/visible claims available; keep claims minimal and generic."
    blocked_text = "; ".join(blocked_claims[:6]) if blocked_claims else "No extra blocked claims."

    if lane_value == "sellable":
        lane_rule = (
            "SELLABLE CLAIM POLICY: Use ONLY verified or directly visible source-supported claims. "
            "Do NOT use inferred claims in stickers, captions, scenes, or trust messaging."
        )
    else:
        lane_rule = (
            "RESEARCH CLAIM POLICY: You may explore inferred claims as draft concepts, "
            "but they must not be phrased as verified facts."
        )

    slot_rule = ""
    if slot_key == "usp":
        slot_rule = "USP SLOT RULE: All callout stickers must come from ALLOWED CLAIMS only."
    elif slot_key == "trust":
        slot_rule = (
            "TRUST SLOT RULE: Never imply safety, certification, universal comfort, all-user fit, "
            "customer-proof, or every-scenario suitability unless verified by source evidence."
        )
    elif slot_key == "scene2":
        slot_rule = (
            "SCENE SLOT RULE: The second scenario must stay within verified product capability boundaries. "
            "Do not turn a single-scene item into a universal multi-scene product, and do not imply unsupported outdoor, travel, sports, or water-use scenarios."
        )
    elif slot_key == "detail":
        slot_rule = (
            "DETAIL SLOT RULE: Material, texture, finish, and craftsmanship claims must match visible texture and verified source truth. "
            "Do not upgrade plastic to metal, matte to glossy, or invent macro craftsmanship details not supported by the source."
        )

    return (
        f"{lane_rule} "
        f"ALLOWED CLAIMS: {allowed_text}. "
        f"BLOCKED CLAIMS: {blocked_text}. "
        f"{slot_rule} "
    )


def call_llm(prompt: str, config=None, max_tokens: int = 4096, timeout: int = 60) -> str:
    """调用LLM文本模型(MiniMax-M2.7-highspeed)"""
    if config is None:
        config = get_config()

    headers = {
        "Authorization": f"Bearer {config.mxou_api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": config.mxou_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }

    r = requests.post(
        f"{config.mxou_api_url}/v1/chat/completions",
        headers=headers, json=payload, timeout=timeout
    )

    result = r.json()
    msg = result.get("choices", [{}])[0].get("message", {})
    content = msg.get("content", "").strip()
    reasoning = msg.get("reasoning_content", "").strip()

    if content:
        if content.startswith('{') and not content.rstrip().endswith('}'):
            pass
        else:
            return content
    if reasoning:
        json_match = re.search(r'\{[\s\S]*\}', reasoning)
        if json_match:
            return json_match.group()
        cleaned = reasoning.strip()
        if cleaned:
            return cleaned

    return content


def analyze_product_with_vision(sku_name: str, source_image_url: str = "", config=None, product_1688: dict = None) -> dict:
    """
    视觉优先分析: 视觉模型看图识别产品 + 1688数据增强

    设计原理:
    - 视觉模型(doubao-seed-1-8-251228)能准确识别产品外观(颜色/形状/材质)
    - 1688标题是商家写的最准确产品描述
    - 两者结合: 视觉模型"看"+ 1688数据"想" → 零幻觉

    流程:
    1. 下载货源图 → 视觉模型看图 → 提取精确视觉特征
    2. 合并1688商品数据(标题/价格) → 增强卖点分析
    3. 生成PRODUCT_LOCK级别的visual_desc

    降级策略:
    - 图片下载失败 → 纯1688标题+文本分析
    - 视觉模型失败 → 纯1688标题+文本分析
    - 无1688数据 → 纯文本分析(最弱，仅sku_name)
    """
    if config is None:
        config = get_config()

    vision_result = None
    source_img_b64 = ""
    source_img = ""

    selected_source_url, source_img_b64, _ = _download_best_reference_image(
        source_image_url=source_image_url,
        product_1688=product_1688,
    )
    if selected_source_url:
        source_img = selected_source_url
        if product_1688 and isinstance(product_1688, dict):
            product_1688["source_image_url"] = selected_source_url
        print(f"  [Vision] 使用筛选后的参考图: {selected_source_url}", file=sys.stderr)
        print(f"  [Vision] 图片已下载 ({len(source_img_b64)} b64 chars)", file=sys.stderr)
    else:
        if product_1688 and isinstance(product_1688, dict):
            source_img = product_1688.get("source_image_url", "") or product_1688.get("main_image_url", "")
        if not source_img:
            source_img = source_image_url

    if source_img_b64:
        try:
            print(f"  [Vision] 使用 {config.mxou_vision_model} 进行视觉识别...", file=sys.stderr)
            vision_prompt = """You are a product identification expert. Analyze this product image carefully.

Return a JSON object with EXACTLY these fields:
{
    "product_identification": "What this product IS (be specific, e.g. 'baby crawling training toy with music buttons', NOT just 'toy')",
    "visual_desc": "Precise visual description: exact color names, exact shape, surface texture, material appearance (MUST specify: glossy/matte/brushed/textured, smooth/grained/ribbed), design elements, size proportion. Be extremely specific about the material surface finish so an image AI can reproduce the EXACT same product with the same texture and reflectivity.",
    "key_features_seen": ["feature 1 you can actually see", "feature 2 you can actually see", "feature 3 you can actually see"],
    "color_primary": "Primary color name",
    "color_secondary": "Secondary color name (or 'none')",
    "shape": "Shape description",
    "material_likely": "Likely material based on appearance",
    "size_estimate": "Estimated size (small/medium/large) and rough dimensions"
}

CRITICAL:
- Describe ONLY what you can SEE in the image. Do NOT guess or imagine anything not visible.
- Be specific about colors: not 'red' but 'cherry red', not 'blue' but 'navy blue'
- Be EXTREMELY specific about material surface: not 'plastic' but 'smooth glossy plastic', not 'metal' but 'brushed matte aluminum', not 'fabric' but 'woven cotton with visible grain'
- Mention any text, logos, or patterns visible on the product
- Do NOT add packaging, boxes, earphone cases, or accessories not in the image
- visual_desc is the MOST IMPORTANT field — it controls product consistency across all generated images

Output ONLY the JSON object, nothing else."""

            headers = {
                "Authorization": f"Bearer {config.mxou_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": config.mxou_vision_model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": vision_prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{source_img_b64}"}}
                    ]
                }],
                "temperature": 0.1,
                "max_tokens": 2048,
            }
            r = requests.post(
                f"{config.mxou_api_url}/v1/chat/completions",
                headers=headers, json=payload, timeout=120
            )
            result = r.json()

            if "error" in result:
                print(f"  [Vision] API error: {result['error']}", file=sys.stderr)
            else:
                msg = result.get("choices", [{}])[0].get("message", {})
                content = msg.get("content", "").strip()
                reasoning = msg.get("reasoning_content", "").strip()

                                                                           
                response_text = content
                if not response_text and reasoning:
                                                    
                    json_match = re.search(r'\{[\s\S]*\}', reasoning)
                    if json_match:
                        response_text = json_match.group()

                if response_text:
                    json_match = re.search(r'\{[\s\S]*\}', response_text)
                    if json_match:
                        vision_result = json.loads(json_match.group())
                        print(f"  [Vision] 识别成功: {vision_result.get('product_identification', '?')}", file=sys.stderr)
                        print(f"  [Vision] visual_desc: {vision_result.get('visual_desc', '')[:120]}", file=sys.stderr)
                        print(f"  [Vision] 主色: {vision_result.get('color_primary', '?')}, 形状: {vision_result.get('shape', '?')}", file=sys.stderr)

                if not vision_result:
                    print(f"  [Vision] JSON解析失败, content长度={len(content)}, reasoning长度={len(reasoning)}", file=sys.stderr)

        except Exception as e:
            print(f"  [Vision] 视觉识别异常: {e}", file=sys.stderr)

                                              
    title_1688 = ""
    price_1688 = ""
    shop_1688 = ""
    images_1688 = []
    sku_info_1688 = ""

    if product_1688 and isinstance(product_1688, dict):
        title_1688 = product_1688.get("product_title", "")
        price_1688 = product_1688.get("product_price", "")
        shop_1688 = product_1688.get("shop_name", "")
        images_1688 = product_1688.get("image_urls", [])
        sku_info_1688 = product_1688.get("sku_info", "")        
        if not source_img:
            source_img = product_1688.get("source_image_url", "") or product_1688.get("main_image_url", "")

                          
    vision_section = ""
    if vision_result:
        vision_section = f"""
VISION MODEL ANALYSIS (highly accurate — the model SAW the actual product):
- Product identified as: {vision_result.get('product_identification', '')}
- Visual description: {vision_result.get('visual_desc', '')}
- Primary color: {vision_result.get('color_primary', '')}
- Secondary color: {vision_result.get('color_secondary', '')}
- Shape: {vision_result.get('shape', '')}
- Material (likely): {vision_result.get('material_likely', '')}
- Key features seen: {vision_result.get('key_features_seen', [])}
- Size estimate: {vision_result.get('size_estimate', '')}

IMPORTANT: The visual_desc above is based on what the vision model ACTUALLY SAW. Use it as the ground truth for visual_desc field. You may enhance it slightly but do NOT contradict it.
"""

    data_section = ""
    if title_1688:
        data_section = f"""
1688 SUPPLIER DATA (from actual listing, highly accurate):
- Product title: {title_1688}
- Supplier price: ¥{price_1688}
- Shop: {shop_1688}
- SKU/Specs: {sku_info_1688}
- Number of product images: {len(images_1688)}
"""

    effective_name = title_1688 if title_1688 else sku_name

    prompt = f"""Analyze this product for generating consistent e-commerce images for Ozon marketplace.
{vision_section}
{data_section}
Category keyword: {sku_name}

Based on the above information, generate a comprehensive product analysis.
{f'The vision model has identified the product as "{vision_result.get("product_identification", "")}". Use this as the primary product identification.' if vision_result else f'The 1688 supplier title is "{title_1688}". Use this as the primary product identification.' if title_1688 else 'Identify the product based on the category keyword.'}

Return a JSON object with these fields:
{{
    "sku_name_en": "English product name (concise, 3-6 words)",
    "sku_name_ru": "Russian product name for Ozon (concise, 3-6 words, ALL CAPS for title)",
    "subtitle_ru": "Russian subtitle for use case (e.g. 'ДЛЯ ОФИСА И ДОМА', 'ДЛЯ КУХНИ И ГОТОВКИ')",
    "usps_en": "4 selling points in English, separated by |, each as: headline|description",
    "usps_ru": "4 selling points in RUSSIAN, separated by |, each as: headline|description",
    "usp_items_ru": ["Short Russian phrase for USP 1 sticker", "Short Russian phrase for USP 2 sticker", "Short Russian phrase for USP 3 sticker", "Short Russian phrase for USP 4 sticker"],
    "material_en": "Material description in English",
    "material_ru": "Material description in Russian",
    "quality_desc_ru": "Brief quality description in Russian for detail annotation",
    "visual_desc": "CRITICAL - Must be based on the vision model analysis above. If vision model provided visual_desc, use it directly with minor enhancements. If no vision data, describe based on product title. MUST include: exact color, shape, surface texture (glossy/matte/textured), material appearance and finish, design elements. The material surface finish MUST be explicitly stated (e.g. 'smooth glossy plastic', 'matte rubberized coating', 'brushed aluminum').",
    "product_type_ru": "Russian category type name",
    "usage_scenario": "Primary usage scenario in English",
    "scene_label_ru": "Short Russian label for scene2 image sticker",
    "verified_features": ["Claims backed by 1688 title/spec/SKU/sale_props only"],
    "visible_features": ["Claims backed by the actual product image only"],
    "inferred_features": ["Draft positioning ideas that are NOT verified facts"],
    "forbidden_claims": ["Risky claims that must be blocked unless explicitly verified by source evidence"],
    "verified_usp_items_ru": ["2-4 word Russian sticker text backed only by verified/visible evidence"],
    "research_usp_items_ru": ["2-4 word Russian draft sticker text that may use inferred ideas"]
}}

STRICT RULES:
- visual_desc MUST match the vision model's observation if available. Do NOT invent features not seen.
- Do NOT add packaging, earphone cases, boxes, or accessories not shown.
- verified_features must come only from 1688 title/specs/SKU/sale_props.
- visible_features must come only from what the vision model actually sees.
- inferred_features must be clearly separate from verified/visible claims.
- verified_usp_items_ru must be safe for sellable lane: short, source-supported, no inferred claims.
- usp_items_ru must be SHORT (2-4 words each)
- quality_desc_ru must be 1-3 words
- scene_label_ru must be 3-5 words

Output ONLY the JSON object, nothing else."""

    try:
        headers = {
            "Authorization": f"Bearer {config.mxou_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": config.mxou_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 4096,
        }
        r = requests.post(
            f"{config.mxou_api_url}/v1/chat/completions",
            headers=headers, json=payload, timeout=90
        )
        result = r.json()
        msg = result.get("choices", [{}])[0].get("message", {})
        content = msg.get("content", "").strip()
        reasoning = msg.get("reasoning_content", "").strip()

        response_text = content
        if not response_text and reasoning:
            json_match = re.search(r'\{[\s\S]*\}', reasoning)
            if json_match:
                response_text = json_match.group()

        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            info = json.loads(json_match.group())
        else:
            raise ValueError("No JSON found in text analysis response")
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"  [WARN] 分析失败: {e}, 降级到纯文本", file=sys.stderr)
        return analyze_product(sku_name, source_image_url, config)

                                             
    if vision_result and len(vision_result.get("visual_desc", "")) > len(info.get("visual_desc", "")):
                              
        info["visual_desc"] = vision_result["visual_desc"]
        print(f"  [Vision] visual_desc已用视觉识别结果覆盖(更精确)", file=sys.stderr)

    if vision_result:
        info["_vision_identified"] = True
        info["_color_primary"] = vision_result.get("color_primary", "")
        info["_color_secondary"] = vision_result.get("color_secondary", "")
        info["_material_likely"] = vision_result.get("material_likely", "")
        info["_shape"] = vision_result.get("shape", "")
        info["_key_features_seen"] = vision_result.get("key_features_seen", [])

            
    if len(info.get("visual_desc", "")) < 50:
        base = vision_result.get("visual_desc", "") if vision_result else ""
        if not base:
            base = f"{effective_name}, {info.get('material_en', '')} material"
        info["visual_desc"] = base

    if not info.get("usp_items_ru"):
        usps = info.get("usps_ru", "").split("|")
        info["usp_items_ru"] = [u.strip().split("|")[0].strip() if "|" in u else u.strip() for u in usps[:4]]
        while len(info["usp_items_ru"]) < 4:
            info["usp_items_ru"].append("Премиум")

    if not info.get("quality_desc_ru"):
        info["quality_desc_ru"] = "высокое качество"

    if not info.get("scene_label_ru"):
        info["scene_label_ru"] = info.get("subtitle_ru", "ДЛЯ ДОМА И ОФИСА")

    claim_layers = _build_structured_claims(info, product_1688=product_1688, vision_result=vision_result)
    info["verified_features"] = claim_layers["verified_features"]
    info["visible_features"] = claim_layers["visible_features"]
    info["inferred_features"] = claim_layers["inferred_features"]
    info["forbidden_claims"] = claim_layers["forbidden_claims"]
    info["verified_usp_items_ru"] = _dedupe_keep_order(info.get("verified_usp_items_ru", []))
    info["research_usp_items_ru"] = _dedupe_keep_order(
        info.get("research_usp_items_ru", info.get("usp_items_ru", []))
    )

                            
    info["_source_image_url"] = source_img
    info["_1688_title"] = effective_name
    if sku_info_1688:
        info["_1688_sku_info"] = sku_info_1688

    print(f"  [Analysis] Product RU: {info.get('sku_name_ru', '?')}", file=sys.stderr)
    print(f"  [Analysis] USPs RU: {info.get('usps_ru', '?')[:100]}", file=sys.stderr)
    print(f"  [Analysis] visual_desc: {info.get('visual_desc', '?')[:100]}", file=sys.stderr)

    return info


def analyze_product(sku_name: str, source_image_url: str = "", config=None) -> dict:
    """
    LLM深度分析产品 -> 提取精确视觉特征 + 俄语卖点 + 场景要素

    返回字段: sku_name_en, sku_name_ru, subtitle_ru, usps_en, usps_ru,
              material_en, material_ru, visual_desc, product_type_ru,
              usp_items_ru, quality_desc_ru, scene_label_ru
    """
    if config is None:
        config = get_config()

    prompt = f"""Analyze this product for generating consistent e-commerce images for Ozon marketplace.

Product name: {sku_name}
Source image URL: {source_image_url or "Not provided"}

You MUST extract PRECISE visual characteristics and scene elements for generating scene-narrative product photos.

Return a JSON object with these fields:
{{
    "sku_name_en": "English product name (concise, 3-6 words)",
    "sku_name_ru": "Russian product name for Ozon (concise, 3-6 words, ALL CAPS for title)",
    "subtitle_ru": "Russian subtitle for use case (e.g. 'ДЛЯ ОФИСА И ДОМА', 'ДЛЯ КУХНИ И ГОТОВКИ', 'ДЛЯ АКТИВНОГО ОТДЫХА')",
    "usps_en": "4 selling points in English, separated by |, each as: headline|description",
    "usps_ru": "4 selling points in RUSSIAN, separated by |, each as: headline|description",
    "usp_items_ru": ["Short Russian phrase for USP 1 sticker", "Short Russian phrase for USP 2 sticker", "Short Russian phrase for USP 3 sticker", "Short Russian phrase for USP 4 sticker"],
    "material_en": "Material description in English",
    "material_ru": "Material description in Russian",
    "quality_desc_ru": "Brief quality description in Russian for detail annotation (e.g. 'высокое качество', 'премиальная отделка', 'прочная конструкция')",
    "visual_desc": "CRITICAL - Precise visual description for consistency. Include: exact color name, exact shape, surface texture, specific design elements, size proportion. Be extremely specific so AI can reproduce the same product appearance across 6 images.",
    "product_type_ru": "Russian category type name (e.g. 'Стельки для обуви', 'Наушники')",
    "usage_scenario": "Primary usage scenario in English (e.g. 'kitchen cooking', 'outdoor camping', 'office work')",
    "scene_label_ru": "Short Russian label for scene2 image sticker (e.g. 'ИДЕАЛЬНО ДЛЯ ПИКНИКА', 'ДЛЯ ДОМА И ДАЧИ', 'ПОДХОДИТ ДЛЯ ПУТЕШЕСТВИЙ')"
}}

IMPORTANT: 
- visual_desc must be detailed enough that an image AI can reproduce the EXACT same product appearance
- usp_items_ru must be SHORT (2-4 words each) for sticker/badge text overlays
- quality_desc_ru must be 1-3 words for the detail image annotation
- scene_label_ru must be 3-5 words for the scene2 image sticker label

Output ONLY the JSON object, nothing else."""

    response = call_llm(prompt, config, max_tokens=4096, timeout=90)

    try:
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            info = json.loads(json_match.group())
        else:
            raise ValueError("No JSON found")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [WARN] Product analysis parse failed: {e}", file=sys.stderr)
        info = {
            "sku_name_en": sku_name,
            "sku_name_ru": sku_name,
            "subtitle_ru": "ДЛЯ ДОМА И ОФИСА",
            "usps_en": "high quality|durable|comfortable|practical",
            "usps_ru": "высокое качество|долговечность|комфорт|практичность",
            "usp_items_ru": ["Высокое качество", "Долговечность", "Комфорт", "Практичность"],
            "material_en": "premium material",
            "material_ru": "премиальный материал",
            "quality_desc_ru": "высокое качество",
            "visual_desc": f"standard {sku_name} product, typical shape and color",
            "product_type_ru": sku_name,
            "usage_scenario": "general household use",
            "scene_label_ru": "ДЛЯ ДОМА И ОФИСА",
        }

    if len(info.get("visual_desc", "")) < 50:
        info["visual_desc"] = f"{sku_name} product, {info.get('material_en', '')} material, {info.get('sku_name_en', '')} type"

                                      
    if not info.get("usp_items_ru"):
        usps = info.get("usps_ru", "").split("|")
        info["usp_items_ru"] = [u.strip().split("|")[0].strip() if "|" in u else u.strip() for u in usps[:4]]
        while len(info["usp_items_ru"]) < 4:
            info["usp_items_ru"].append("Премиум")

    if not info.get("quality_desc_ru"):
        info["quality_desc_ru"] = "высокое качество"

    if not info.get("scene_label_ru"):
        info["scene_label_ru"] = info.get("subtitle_ru", "ДЛЯ ДОМА И ОФИСА")

    info.setdefault("verified_features", [])
    info.setdefault("visible_features", [])
    info.setdefault("inferred_features", [])
    info.setdefault("forbidden_claims", [])

    print(f"  [Analysis] visual_desc: {info.get('visual_desc', '')[:100]}", file=sys.stderr)
    print(f"  [Analysis] usage_scenario: {info.get('usage_scenario', '')}", file=sys.stderr)
    print(f"  [Analysis] usp_items_ru: {info.get('usp_items_ru', [])}", file=sys.stderr)
    return info


def analyze_product_background(product_info: dict, config=None) -> dict:
    """
    LLM分析产品品类 → 为每张图生成真实场景描述(替代旧版渐变色)

    根据产品的使用场景(厨房/户外/办公室/家居等)，生成:
    - hero_scene: 主图中人物手拿产品的场景
    - main_bg_hint: 主图背景场景
    - usp_surface: 卖点图产品放置的表面
    - usp_scene: 卖点图场景
    - usp_bg_hint: 卖点图背景场景
    - detail_surface: 细节图特写表面
    - detail_bg_hint: 细节图背景
    - trust_scene: 信任场景图的真实使用场景
    - scene2_desc: 第二场景图描述
    """
    if config is None:
        config = get_config()

    sku_name = product_info.get("sku_name_en", "product")
    category = product_info.get("product_type_ru", "")
    scenario = product_info.get("usage_scenario", "general household use")
    usps = product_info.get("usps_en", "")

    prompt = f"""You are an e-commerce image design expert. Generate REAL SCENE descriptions for 6 Ozon marketplace product images.

PRODUCT: {sku_name}
CATEGORY: {category}
USAGE SCENARIO: {scenario}
SELLING POINTS: {usps}

IMPORTANT: Generate REAL PHOTOGRAPHIC SCENE descriptions, NOT gradient colors or abstract backgrounds.
Each description should paint a vivid picture that an AI image generator can turn into a realistic photograph.

Return a JSON object:
{{
    "hero_scene": "A vivid scene for the hero main image where a person holds the product (e.g. 'a bright modern kitchen with marble countertops, steam rising from a pot, warm golden afternoon light through window')",
    "main_bg_hint": "Background atmosphere for main image (e.g. 'Soft warm bokeh of a kitchen interior, golden afternoon light filtering through window, herbs on windowsill')",
    "usp_surface": "Surface where product sits for USP image (e.g. 'a rustic wooden cutting board')",
    "usp_scene": "Scene for USP image (e.g. 'a cozy kitchen with open shelves, potted herbs, warm morning light')",
    "usp_bg_hint": "Background for USP image (e.g. 'Rustic wooden kitchen table with scattered fresh vegetables, olive oil bottle, soft morning shadows')",
    "detail_surface": "Close-up surface for detail image (e.g. 'a smooth marble pastry board surface')",
    "detail_bg_hint": "Soft background for detail image (e.g. 'Warm blurred kitchen interior, subtle highlights on marble')",
    "trust_scene": "Authentic usage scene with a real person for trust image (e.g. 'a person's hands brushing sauce onto grilled chicken, stainless steel stove behind, warm overhead lighting, steam and fresh herbs nearby')",
    "scene2_desc": "Completely different aspirational scene for second lifestyle image (e.g. 'An outdoor barbecue party on a wooden deck, garden flowers, golden hour sunlight, friends chatting, product being used on the grill')",
    "color_palette": {{
        "primary": "HEX color - accent color matching product category",
        "secondary": "HEX color - secondary warm color",
        "accent": "HEX color - sticker/badge accent color"
    }}
}}

RULES:
- Every scene must be a REAL PHOTOGRAPHIC description, not a gradient or abstract pattern
- Scenes MUST match the product's actual use scenario
- trust_scene MUST include a person interacting with the product
- scene2_desc MUST be a DIFFERENT setting from trust_scene
- Kitchen products → real kitchen scenes with countertops, stoves, utensils, food
- Outdoor products → nature scenes with trees, mountains, campfires
- Office products → desk scenes with laptops, coffee, warm lighting
- Beauty products → bathroom/vanity scenes with mirrors, towels, candles
- Pet products → living room or garden with pets
- Home products → cozy interior scenes with furniture, warm lighting
- Fitness products → gym or home workout scenes

Output ONLY the JSON object, nothing else."""

    response = call_llm(prompt, config, max_tokens=4096, timeout=60)

    try:
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            bg_info = json.loads(json_match.group())
            print(f"  [BG] hero_scene: {bg_info.get('hero_scene', '')[:60]}...", file=sys.stderr)
            print(f"  [BG] trust_scene: {bg_info.get('trust_scene', '')[:60]}...", file=sys.stderr)
            return bg_info
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [WARN] Background analysis parse failed: {e}", file=sys.stderr)

                                                                
    defaults = _get_default_backgrounds(scenario)
    print(f"  [BG] Using default backgrounds for scenario: {scenario}", file=sys.stderr)
    return defaults


def _get_default_backgrounds(scenario: str) -> dict:
    """根据场景关键词返回默认场景描述(替代旧版渐变色)"""
    scenario_lower = scenario.lower()

    if any(kw in scenario_lower for kw in ["kitchen", "cooking", "food", "cook", "bakeware", "utensil"]):
        return {
            "hero_scene": "a bright modern kitchen with marble countertops, steam rising from a pot, warm golden afternoon light through window, soft bokeh",
            "main_bg_hint": "Soft warm bokeh of a kitchen interior, golden afternoon light filtering through window, herbs on windowsill",
            "usp_surface": "a rustic wooden cutting board",
            "usp_scene": "a cozy kitchen with open shelves, potted herbs, warm morning light",
            "usp_bg_hint": "A rustic wooden kitchen table with a linen tablecloth, scattered fresh vegetables, olive oil bottle, soft morning shadows",
            "detail_surface": "a smooth marble pastry board surface",
            "detail_bg_hint": "A smooth marble pastry board surface, subtle warm highlights, clean but not sterile",
            "trust_scene": "a person's hands brushing sauce onto grilled chicken, stainless steel stove behind, warm overhead lighting, steam and fresh herbs nearby",
            "scene2_desc": "An outdoor barbecue party on a wooden deck, garden flowers, golden hour sunlight, friends chatting, product being used on the grill",
            "color_palette": {"primary": "#D4A574", "secondary": "#F5E6D3", "accent": "#8B6914"}
        }
    elif any(kw in scenario_lower for kw in ["outdoor", "camping", "hiking", "garden", "fishing", "adventure"]):
        return {
            "hero_scene": "a scenic mountain overlook with pine trees, a person holding the product against the horizon, golden hour sunlight, soft clouds",
            "main_bg_hint": "Soft bokeh of forest and sky, golden sunlight filtering through pine trees, wildflowers in foreground",
            "usp_surface": "a flat rock surface in nature",
            "usp_scene": "a forest clearing with dappled sunlight, moss on rocks, fresh air atmosphere",
            "usp_bg_hint": "A forest clearing with dappled sunlight, moss on rocks, fern and wildflowers nearby",
            "detail_surface": "a weathered wooden surface with natural grain",
            "detail_bg_hint": "Softly blurred forest canopy, green and gold dappled light",
            "trust_scene": "a hiker using the product on a mountain trail, backpack visible, panoramic valley view behind, morning mist",
            "scene2_desc": "A cozy campsite at dusk with a small campfire, tent in background, stars appearing, product resting on a log",
            "color_palette": {"primary": "#5B8C5A", "secondary": "#87CEEB", "accent": "#DAA520"}
        }
    elif any(kw in scenario_lower for kw in ["office", "work", "desk", "stationery", "computer"]):
        return {
            "hero_scene": "a modern office desk near a large window, a person's hands holding the product, city skyline view, warm afternoon light",
            "main_bg_hint": "Soft bokeh of a modern office interior, large windows with natural light, minimal decor",
            "usp_surface": "a clean white desk surface with a subtle wood grain",
            "usp_scene": "a professional office desk with a laptop, coffee mug, and organized supplies",
            "usp_bg_hint": "A professional office desk with laptop, organized supplies, soft window light creating gentle shadows",
            "detail_surface": "a sleek glass desk surface with subtle reflections",
            "detail_bg_hint": "Softly blurred office interior, cool natural light, minimal and clean",
            "trust_scene": "a professional using the product at their desk, hands visible, focused expression, monitors and keyboard in background",
            "scene2_desc": "A home office setup with a bookshelf, warm desk lamp, coffee mug, cat sleeping nearby, cozy evening atmosphere",
            "color_palette": {"primary": "#4A90D9", "secondary": "#E8EDF2", "accent": "#2C5F8A"}
        }
    elif any(kw in scenario_lower for kw in ["beauty", "cosmetic", "skin", "hair", "personal", "spa", "health"]):
        return {
            "hero_scene": "a bright bathroom vanity with a large mirror, a person's hands holding the product, soft natural light, flowers in a vase",
            "main_bg_hint": "Soft bokeh of a bright bathroom, white marble vanity, natural light from frosted window, eucalyptus branch",
            "usp_surface": "a white marble vanity surface with rose petals",
            "usp_scene": "a bright vanity area with organized beauty products, soft diffused light",
            "usp_bg_hint": "A bright vanity with organized beauty products, rose gold accents, soft diffused window light",
            "detail_surface": "a smooth white ceramic surface with subtle reflections",
            "detail_bg_hint": "Softly blurred bathroom interior, white and rose gold tones, gentle highlights",
            "trust_scene": "a woman applying the product at her vanity, mirror reflection visible, soft smile, warm bathroom lighting",
            "scene2_desc": "A spa-like setting with white towels, candles, bamboo tray with products, orchids, relaxing ambient lighting",
            "color_palette": {"primary": "#F5C6D0", "secondary": "#FFFFFF", "accent": "#B76E79"}
        }
    elif any(kw in scenario_lower for kw in ["pet", "dog", "cat", "animal"]):
        return {
            "hero_scene": "a cozy living room with a person holding the product next to a happy pet, warm afternoon light, soft blanket on sofa",
            "main_bg_hint": "Soft bokeh of a cozy living room, warm tones, pet toys on carpet, afternoon sunlight",
            "usp_surface": "a soft fabric surface with subtle paw print pattern",
            "usp_scene": "a bright living room corner with pet bed and toys, warm ambient light",
            "usp_bg_hint": "A cozy living room corner with pet bed, colorful toys scattered, warm afternoon sunlight on carpet",
            "detail_surface": "a soft plush surface in warm tones",
            "detail_bg_hint": "Softly blurred cozy interior, warm tones, pet furniture visible",
            "trust_scene": "a pet owner playing with their happy dog using the product on the living room carpet, genuine joy on both faces",
            "scene2_desc": "A sunny garden or park with green grass, a person and their pet playing together outdoors, product in use, blue sky",
            "color_palette": {"primary": "#FF9A76", "secondary": "#FFE0D0", "accent": "#FF6B35"}
        }
    elif any(kw in scenario_lower for kw in ["baby", "child", "kids", "nursery", "toy"]):
        return {
            "hero_scene": "a soft-lit nursery room, a parent's hands gently holding the product, pastel colored walls, warm diffused light",
            "main_bg_hint": "Soft bokeh of a pastel nursery interior, gentle warm light, stuffed animals on shelf",
            "usp_surface": "a soft white changing mat surface",
            "usp_scene": "a bright nursery with soft toys and pastel colors, gentle morning light",
            "usp_bg_hint": "A bright nursery room with soft toys on shelves, pastel walls, gentle morning light through sheer curtains",
            "detail_surface": "a soft white cotton surface with gentle texture",
            "detail_bg_hint": "Softly blurred nursery interior, pastel tones, gentle highlights",
            "trust_scene": "a mother holding the product with her baby nearby, warm loving expression, soft nursery lighting, baby blanket visible",
            "scene2_desc": "A playful playroom with colorful foam mats, stuffed animals, a toddler reaching for the product, cheerful atmosphere",
            "color_palette": {"primary": "#E6D5F5", "secondary": "#D5F5E6", "accent": "#FFB6C1"}
        }
    elif any(kw in scenario_lower for kw in ["fitness", "sport", "gym", "exercise", "yoga"]):
        return {
            "hero_scene": "a modern gym with large windows, a fit person holding the product, morning sunlight, exercise equipment in background",
            "main_bg_hint": "Soft bokeh of a modern gym interior, large windows, morning light, exercise equipment",
            "usp_surface": "a yoga mat surface in cool tones",
            "usp_scene": "a home workout space with yoga mat, water bottle, dumbbells nearby, bright morning light",
            "usp_bg_hint": "A home workout space with yoga mat, water bottle, bright morning light through window, green plant nearby",
            "detail_surface": "a textured rubber grip surface",
            "detail_bg_hint": "Softly blurred gym interior, cool blue tones, bright natural light",
            "trust_scene": "an athlete using the product during a workout in a bright modern gym, sweat glistening, focused expression, equipment visible",
            "scene2_desc": "A home yoga session at sunrise, person using the product on a mat, living room with plants, soft golden light, peaceful atmosphere",
            "color_palette": {"primary": "#1E88E5", "secondary": "#FF8F00", "accent": "#26A69A"}
        }
    elif any(kw in scenario_lower for kw in ["car", "auto", "driving", "garage", "vehicle"]):
        return {
            "hero_scene": "a clean garage workshop, a person's hands holding the product, professional tools in background, bright overhead lighting",
            "main_bg_hint": "Soft bokeh of a clean garage interior, professional tools on wall, bright overhead lighting",
            "usp_surface": "a dark textured car dashboard surface",
            "usp_scene": "a car interior with leather seats, clean dashboard, warm ambient light",
            "usp_bg_hint": "A car interior with leather seats, clean dashboard, warm ambient lighting, steering wheel visible",
            "detail_surface": "a sleek metallic car surface",
            "detail_bg_hint": "Softly blurred garage interior, cool metallic tones, bright highlights",
            "trust_scene": "a person using the product in their car, hands on steering wheel area, garage or driveway setting, satisfied expression",
            "scene2_desc": "An open road on a sunny day, the product visible in the car interior, panoramic view through windshield, sense of freedom",
            "color_palette": {"primary": "#37474F", "secondary": "#78909C", "accent": "#D32F2F"}
        }
    else:
                                 
        return {
            "hero_scene": "a cozy modern living room, a person's hands holding the product, warm afternoon light, soft cushions on sofa behind",
            "main_bg_hint": "Soft bokeh of a cozy living room interior, warm tones, soft afternoon sunlight through curtains, houseplants",
            "usp_surface": "a smooth wooden coffee table surface",
            "usp_scene": "a cozy living room with warm lighting, bookshelf, and comfortable furniture",
            "usp_bg_hint": "A cozy living room with a bookshelf, warm lamp light, comfortable sofa, and houseplants nearby",
            "detail_surface": "a smooth warm wood surface with natural grain",
            "detail_bg_hint": "Softly blurred cozy interior, warm tones, gentle highlights on wood",
            "trust_scene": "a person relaxing at home using the product, comfortable couch, warm lamp, genuine contentment, cozy atmosphere",
            "scene2_desc": "A different room in the home, perhaps a bedroom or study, with the product naturally displayed, warm evening light, peaceful mood",
            "color_palette": {"primary": "#E8D5B7", "secondary": "#F5EDE0", "accent": "#8B7355"}
        }


def analyze_reference_image(source_image_url: str, sku_name: str, config=None) -> dict:
    """
    下载1688参考图 -> LLM视觉分析(完整base64) -> 提取精确产品外观特征

    关键: 发送完整base64给LLM视觉模型，不做截断，确保分析精度。
    """
    if not source_image_url:
        return {}

    if config is None:
        config = get_config()

    selected_source_url, img_b64, _ = _download_best_reference_image(source_image_url=source_image_url, product_1688=None)
    if not img_b64:
        print(f"  [WARN] Source image download failed: no valid reference from {source_image_url}", file=sys.stderr)
        return {}

    source_image_url = selected_source_url or source_image_url
    image_bytes = base64.b64decode(img_b64)

    max_b64_len = 4_000_000
    if len(img_b64) > max_b64_len:
        img = Image.open(io.BytesIO(image_bytes))
        scale = (max_b64_len / len(img_b64)) ** 0.5
        new_w = int(img.width * scale)
        new_h = int(img.height * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        img_b64 = base64.b64encode(buf.getvalue()).decode()

    prompt = f"""Analyze this product image in extreme detail for e-commerce image generation.

Product name: {sku_name}

Extract PRECISE visual characteristics that would allow an AI to reproduce the EXACT same product.

Return a JSON object:
{{
    "visual_summary": "Extremely detailed visual description including: exact color (with shade), exact shape, proportions, surface texture, material appearance, distinctive design elements, logo/branding, any text on product. Be as specific as possible.",
    "product_category": "Specific product category (e.g. 'kitchen basting brush', 'wireless earbuds')",
    "dominant_colors": ["List of dominant colors with approximate hex codes"],
    "key_features": ["List of 3-5 key visual features visible in the image"]
}}

Output ONLY the JSON object, nothing else."""

    headers = {
        "Authorization": f"Bearer {config.mxou_api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": config.mxou_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
    }

    try:
        r = requests.post(
            f"{config.mxou_api_url}/v1/chat/completions",
            headers=headers, json=payload, timeout=60
        )
        result = r.json()
        msg = result.get("choices", [{}])[0].get("message", {})
        content = msg.get("content", "").strip()

        if content:
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                ref_data = json.loads(json_match.group())
                print(f"  [Ref] Vision analysis OK: {ref_data.get('visual_summary', '')[:80]}...", file=sys.stderr)
                return ref_data
    except Exception as e:
        print(f"  [WARN] Vision analysis failed: {e}", file=sys.stderr)

    return {}


def generate_image_with_nano(prompt: str, config=None, reference_image_b64: str = "",
                              aspect_ratio: str = "3:4", max_retries: int = 2,
                              telemetry: dict = None) -> str:
    """
    调用 nano-banana-fast 生成图片，返回base64编码。
    优先走 Gemini native image generateContent 形状，兼容返回 inlineData。
    """
    if config is None:
        config = get_config()

    headers = {
        "Authorization": f"Bearer {config.mxou_api_key}",
        "Content-Type": "application/json"
    }

    parts = [{"text": prompt}]
    if reference_image_b64:
        parts.append({
            "inlineData": {
                "mimeType": "image/png",
                "data": reference_image_b64,
            }
        })

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": parts,
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": aspect_ratio,
                "imageSize": "1K",
            },
            "temperature": 0.15,
        },
    }

    def _extract_image_b64(result: dict) -> str:
        for candidate in result.get("candidates", []) or []:
            content = candidate.get("content", {}) or {}
            for part in content.get("parts", []) or []:
                inline = part.get("inlineData") or part.get("inline_data") or {}
                data = inline.get("data")
                if data:
                    return data.strip()
                text = part.get("text", "")
                b64_match = re.search(r"data:image/[a-zA-Z+]+;base64,([A-Za-z0-9+/=]+)", text)
                if b64_match:
                    return b64_match.group(1)
                if len(text) > 1000 and re.match(r"^[A-Za-z0-9+/=\s]+$", text.strip()):
                    return text.strip()
        return ""

    endpoint = f"{config.mxou_api_url.rstrip('/')}/v1beta/models/{config.mxou_image_model}:generateContent"
    last_error = None
    call_started_at = time.time()
    if telemetry is not None:
        telemetry.clear()
        telemetry.update({
            "success": False,
            "attempts": 0,
            "retries": 0,
            "elapsed_seconds": 0.0,
            "last_status_code": None,
            "last_error": "",
            "has_reference": bool(reference_image_b64),
            "aspect_ratio": aspect_ratio,
        })
    for attempt in range(max_retries + 1):
        status_code = None
        try:
            t0 = time.time()
            print(f"  [NanoAPI] POST attempt {attempt+1}, model={config.mxou_image_model}, ref={'yes' if reference_image_b64 else 'no'}...", file=sys.stderr)
            r = requests.post(endpoint, headers=headers, json=payload, timeout=180)
            status_code = r.status_code
            print(f"  [NanoAPI] Response in {time.time()-t0:.1f}s, status={r.status_code}", file=sys.stderr)
            result = r.json()

            if "error" in result:
                err_msg = result["error"].get("message", str(result["error"]))[:200]
                last_error = RuntimeError(f"API error: {err_msg}")
                if attempt < max_retries:
                    print(f"  [WARN] API error attempt {attempt+1}: {err_msg[:100]}, retrying...", file=sys.stderr)
                    time.sleep(5 * (attempt + 1))
                    continue
                break

            img_b64 = _extract_image_b64(result)
            if img_b64:
                if telemetry is not None:
                    telemetry.update({
                        "success": True,
                        "attempts": attempt + 1,
                        "retries": attempt,
                        "elapsed_seconds": round(time.time() - call_started_at, 1),
                        "last_status_code": status_code,
                        "last_error": "",
                    })
                return img_b64

            last_error = RuntimeError(
                f"No image in response (keys={list(result.keys())[:8]}, preview={json.dumps(result, ensure_ascii=False)[:240]})"
            )
            if attempt < max_retries:
                print(f"  [WARN] No image attempt {attempt+1}, retrying...", file=sys.stderr)
                time.sleep(5 * (attempt + 1))
                continue
        except requests.exceptions.Timeout:
            last_error = RuntimeError(f"Image generation timeout (attempt {attempt+1})")
            if attempt < max_retries:
                print(f"  [WARN] Timeout attempt {attempt+1}, retrying...", file=sys.stderr)
                time.sleep(10 * (attempt + 1))
                continue
            break
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                print(f"  [WARN] Error attempt {attempt+1}: {e}, retrying...", file=sys.stderr)
                time.sleep(5 * (attempt + 1))
                continue
            break

        finally:
            if telemetry is not None:
                telemetry.update({
                    "attempts": max(telemetry.get("attempts", 0), attempt + 1),
                    "retries": max(telemetry.get("retries", 0), attempt),
                    "elapsed_seconds": round(time.time() - call_started_at, 1),
                    "last_status_code": status_code if status_code is not None else telemetry.get("last_status_code"),
                    "last_error": "" if last_error is None else str(last_error)[:240],
                })

    if telemetry is not None:
        telemetry.update({
            "success": False,
            "elapsed_seconds": round(time.time() - call_started_at, 1),
            "last_error": "" if last_error is None else str(last_error)[:240],
        })
    raise last_error or RuntimeError("Image generation failed after all retries")


def _candidate_url_score(url: str) -> int:
    url = (url or "").strip()
    if not url:
        return -10000
    score = 0
    lower = url.lower()
    if "cbu01.alicdn.com" in lower or "/img/ibank/" in lower:
        score += 120
    if "overseas_pic" in lower:
        score += 60
    if "imgextra" in lower and "o1cn" in lower:
        score += 30
    if "gw.alicdn.com" in lower:
        score -= 160
    if "-tps-" in lower:
        score -= 140
    if "/tfs/" in lower:
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


def _build_reference_image_candidates(source_image_url: str = "", product_1688: dict = None) -> list:
    candidates = []
    seen = set()
    product_1688 = product_1688 or {}
    for url in [
        product_1688.get("source_image_url", ""),
        source_image_url,
        product_1688.get("main_image_url", ""),
        *(product_1688.get("image_urls", []) or []),
    ]:
        norm = (url or "").strip()
        if not norm or norm in seen:
            continue
        seen.add(norm)
        candidates.append(norm)
    return sorted(candidates, key=_candidate_url_score, reverse=True)


def _coerce_image_to_png_bytes(img_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode not in {"RGB", "RGBA"}:
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _download_best_reference_image(source_image_url: str = "", product_1688: dict = None) -> tuple:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://detail.1688.com/",
    }
    failures = []
    for candidate in _build_reference_image_candidates(source_image_url, product_1688):
        try:
            r = requests.get(candidate, timeout=20, headers=headers)
            if r.status_code != 200:
                failures.append(f"{candidate} status={r.status_code}")
                continue
            if len(r.content) < 1500:
                failures.append(f"{candidate} size={len(r.content)}")
                continue
            normalized = _coerce_image_to_png_bytes(r.content)
            img = Image.open(io.BytesIO(normalized))
            if min(img.size) < 240:
                failures.append(f"{candidate} dims={img.size[0]}x{img.size[1]}")
                continue
            raw_b64 = base64.b64encode(normalized).decode()
            resized_b64 = _resize_image_b64(raw_b64, 768)
            return candidate, raw_b64, resized_b64
        except Exception as e:
            failures.append(f"{candidate} error={e}")
            continue
    print(f"  [WARN] No usable reference image candidate. Failures: {' | '.join(failures[:6])}", file=sys.stderr)
    return "", "", ""


def add_watermark(image_bytes: bytes, watermark_text: str = "") -> bytes:
    """在图片右下角添加半透明白色水印"""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        if watermark_text:
            font_size = max(12, img.width // 30)
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

            bbox = draw.textbbox((0, 0), watermark_text, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            x = img.width - tw - 20
            y = img.height - th - 20
            draw.text((x, y), watermark_text, fill=(255, 255, 255, 120), font=font)

        result = Image.alpha_composite(img, overlay)
        buf = io.BytesIO()
        result.convert("RGB").save(buf, format="PNG", quality=95)
        return buf.getvalue()
    except Exception as e:
        print(f"  [WARN] Watermark failed: {e}", file=sys.stderr)
        return image_bytes


def upload_to_cos(image_bytes: bytes, filename: str, config=None) -> str:
    """上传图片到COS，返回公网URL"""
    if config is None:
        config = get_config()

    secret_id = config.cos_secret_id
    secret_key = config.cos_secret_key
    bucket = config.cos_bucket
    region = config.cos_region
    cos_path = f"ozon-images/{filename}"

    try:
        from qcloud_cos import CosConfig, CosS3Client
        cos_config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
        client = CosS3Client(cos_config)
        client.put_object(
            Bucket=bucket,
            Body=image_bytes,
            Key=cos_path,
            ContentType="image/png",
        )
        return f"https://{bucket}.cos.{region}.myqcloud.com/{cos_path}"
    except ImportError:
        pass

                                                
    import hashlib
    import hmac as hmac_mod
    from base64 import b64encode
    from email.utils import formatdate
    from urllib.parse import quote

    host = f"{bucket}.cos.{region}.myqcloud.com"
    url = f"https://{host}/{cos_path}"

    def _cos_encode(value: str) -> str:
        return quote(str(value), safe="-_.~")

    now = int(time.time())
    key_time = f"{now};{now + 3600}"
    sign_key = hmac_mod.new(secret_key.encode("utf-8"), key_time.encode("utf-8"), hashlib.sha1).hexdigest()

    content_md5 = b64encode(hashlib.md5(image_bytes).digest()).decode("utf-8")
    request_date = formatdate(timeval=now, localtime=False, usegmt=True)
    signed_headers = {
        "content-length": str(len(image_bytes)),
        "content-md5": content_md5,
        "content-type": "image/png",
        "date": request_date,
        "host": host,
    }
    header_keys = sorted(signed_headers.keys())
    header_list = ";".join(header_keys)
    http_headers = "&".join(
        f"{_cos_encode(key.lower())}={_cos_encode(signed_headers[key])}"
        for key in header_keys
    )
    http_string = f"put\n/{cos_path}\n\n{http_headers}\n"
    http_string_hash = hashlib.sha1(http_string.encode("utf-8")).hexdigest()
    string_to_sign = f"sha1\n{key_time}\n{http_string_hash}\n"
    signature = hmac_mod.new(sign_key.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha1).hexdigest()

    auth_str = (
        f"q-sign-algorithm=sha1"
        f"&q-ak={secret_id}"
        f"&q-sign-time={key_time}"
        f"&q-key-time={key_time}"
        f"&q-header-list={header_list}"
        f"&q-url-param-list="
        f"&q-signature={signature}"
    )

    headers = {
        "Host": host,
        "Date": request_date,
        "Content-Type": "image/png",
        "Content-Length": signed_headers["content-length"],
        "Content-MD5": content_md5,
        "Authorization": auth_str,
    }

    r = requests.put(url, headers=headers, data=image_bytes, timeout=30)
    if r.ok:
        return url
    else:
        raise RuntimeError(f"COS upload failed: {r.status_code} {r.text[:200]}")


def _resize_image_b64(img_b64: str, target_size: int = 768) -> str:
    """缩放base64图片到指定尺寸(保持正方形)，用于参考图"""
    try:
        img_bytes = base64.b64decode(img_b64)
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode not in {"RGB", "RGBA"}:
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.getchannel("A"))
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img = img.resize((target_size, target_size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        print(f"  [WARN] Failed to resize image: {e}", file=sys.stderr)
        return img_b64


def _build_visual_gate_state(product_info: dict, source_image_ready: bool) -> dict:
    """构建视觉真相门槛状态。"""
    product_info = product_info or {}
    vision_identified = bool(product_info.get("_vision_identified"))
    source_image_url = product_info.get("_source_image_url", "")
    visual_desc = product_info.get("visual_desc", "")

    blocked_reasons = []
    if not source_image_ready:
        blocked_reasons.append("missing_source_image_anchor")
    if not vision_identified:
        blocked_reasons.append("vision_not_verified")
    if not visual_desc:
        blocked_reasons.append("missing_visual_desc")

    visual_lock_ready = source_image_ready and vision_identified and bool(visual_desc)
    lane = "sellable" if visual_lock_ready else "research"
    status = "ready" if visual_lock_ready else "research-only"

    if visual_lock_ready:
        visual_lock_status = "locked"
    elif source_image_ready and visual_desc:
        visual_lock_status = "weak_visual_lock"
    elif source_image_url or source_image_ready:
        visual_lock_status = "source_only"
    else:
        visual_lock_status = "missing_anchor"

    return {
        "lane": lane,
        "status": status,
        "sellable_eligible": visual_lock_ready,
        "visual_lock_ready": visual_lock_ready,
        "visual_lock_status": visual_lock_status,
        "vision_verified": vision_identified,
        "source_image_ready": source_image_ready,
        "anchor_ready": visual_lock_ready,
        "blocked_reason": ";".join(blocked_reasons),
        "blocked_reasons": blocked_reasons,
    }


def _attach_generation_state(image_item: dict, gate_state: dict, **extra_fields) -> dict:
    """给图片结果附加统一状态字段，便于pipeline消费。"""
    enriched = dict(image_item or {})
    enriched.update({
        "lane": gate_state.get("lane"),
        "status": gate_state.get("status"),
        "sellable_eligible": gate_state.get("sellable_eligible"),
        "visual_lock_ready": gate_state.get("visual_lock_ready"),
        "visual_lock_status": gate_state.get("visual_lock_status"),
        "vision_verified": gate_state.get("vision_verified"),
        "source_image_ready": gate_state.get("source_image_ready"),
        "anchor_ready": gate_state.get("anchor_ready"),
        "blocked_reason": gate_state.get("blocked_reason", ""),
        "blocked_reasons": list(gate_state.get("blocked_reasons", [])),
    })
    enriched.update(extra_fields)
    return enriched


def _resolve_scene_concurrency(config, scene_count: int) -> int:
    configured = getattr(config, "mxou_image_scene_concurrency", 3)
    try:
        configured = int(configured)
    except (TypeError, ValueError):
        configured = 3
    configured = max(1, configured)
    if scene_count <= 0:
        return 1
    return min(scene_count, configured)


def generate_product_images(
    sku_name: str,
    source_image_url: str = "",
    count: int = 6,
    watermark_text: str = "",
    config=None,
    category_type: str = "",
    offer_id: str = "",
    product_1688: dict = None,
) -> list:
    """
    生成Ozon电商图片(6张场景叙事版式)

    核心逻辑 v3.7:
    1. 检查本地产品缓存(用offer_id做key) → 命中则跳过LLM分析(节省60-120秒)
    2. 未命中: LLM分析产品品类 → 场景叙事背景(bg_info) → 保存缓存
    3. 先生成白底图(锚点) - 使用1688货源图作为参考
    4. 其余5张使用1688货源图作为参考(双参考图策略)
    5. 按展示顺序排列: 主图→卖点→细节→信任→场景2→白底图(最后)

    Args:
        sku_name: 商品名称
        source_image_url: 1688商品图URL (用于作为参考图)
        count: 生成图片数量 (默认6)
        watermark_text: 水印文字 (空=不加水印)
        config: 配置对象
        category_type: Ozon类目类型名称
        offer_id: 商品货号(如pc-20260502-001)，用作缓存key和文件名前缀

    Returns:
        list of dicts: [{"slot": "main", "url": "https://...", "name": "电商主图"}, ...]
    """
    if config is None:
        config = get_config()

                                      
    cache_key = offer_id or sku_name
                          
    file_prefix = offer_id or sku_name

    print(f"[Image Gen] Starting for: {sku_name} (offer_id={offer_id})", file=sys.stderr)
    if category_type:
        print(f"[Image Gen] Category type: {category_type}", file=sys.stderr)

                                                                               
                                                   
                                                                               
    from product_cache import load_product_cache, save_product_cache

    cached = load_product_cache(cache_key)
    product_info = {}
    bg_info = {}
    cached_images = {}                                                        
    from_cache = False

    if cached and cached.get("product_info"):
        product_info = cached["product_info"]
        bg_info = cached.get("bg_info", {})
        from_cache = True
                                      
        for img in cached.get("generated_images", []):
            if img.get("slot") and img.get("url"):
                cached_images[img["slot"]] = img
        if cached_images:
            print(f"[Image Gen] CACHE HIT: {cache_key} + {len(cached_images)}/{count} images already generated", file=sys.stderr)
        else:
            print(f"[Image Gen] CACHE HIT: {cache_key} (saved ~90s LLM calls, no images yet)", file=sys.stderr)
        print(f"  Product RU: {product_info.get('sku_name_ru', sku_name)}", file=sys.stderr)
        print(f"  Scenario: {product_info.get('usage_scenario', '')}", file=sys.stderr)
    else:
                                                                               
                               
                                             
                                 
                                                              
                                                                   
                                                                               
        print("[Image Gen] Step 1: Analyzing product (vision + 1688 data)...", file=sys.stderr)
        product_info = analyze_product_with_vision(sku_name, source_image_url, config, product_1688=product_1688)
        print(f"  Product RU: {product_info.get('sku_name_ru', sku_name)}", file=sys.stderr)
        print(f"  USPs RU: {product_info.get('usps_ru', '')}", file=sys.stderr)
        print(f"  Scenario: {product_info.get('usage_scenario', '')}", file=sys.stderr)

                                                                               
                                 
                                                                               

                                                                               
                               
                                                                               
        print("[Image Gen] Step 3: Analyzing product scene backgrounds...", file=sys.stderr)
        bg_info = analyze_product_background(product_info, config)

                                
        save_product_cache(cache_key, product_info, bg_info)
        print(f"[Image Gen] Cached product analysis for: {cache_key}", file=sys.stderr)

                                             
                                              
    visual_ref = product_info.get("visual_desc", "")
    material_likely = product_info.get("_material_likely", "") or product_info.get("material_en", "")
    color_primary = product_info.get("_color_primary", "")
    shape_desc = product_info.get("_shape", "")

    if material_likely and material_likely.lower() not in visual_ref.lower():
        visual_ref = f"{visual_ref.rstrip('.')}. Material: {material_likely}"
    if color_primary and color_primary.lower() not in visual_ref.lower():
        visual_ref = f"{visual_ref.rstrip('.')}. Primary color: {color_primary}"
    if shape_desc and shape_desc.lower() not in visual_ref.lower():
        visual_ref = f"{visual_ref.rstrip('.')}. Shape: {shape_desc}"

                                                                               
                               
                                                                               
    source_image_b64_resized = ""
    source_image_b64_raw = ""

    print("[Image Gen] Step 4: Resolving 1688 source image (reference)...", file=sys.stderr)
    selected_source_url, source_image_b64_raw, source_image_b64_resized = _download_best_reference_image(
        source_image_url=source_image_url,
        product_1688=product_1688,
    )
    if selected_source_url:
        source_image_url = selected_source_url
        if product_1688 is not None:
            product_1688["source_image_url"] = selected_source_url
        product_info["_source_image_url"] = selected_source_url
        print(f"  [Source] Selected anchor image: {selected_source_url}", file=sys.stderr)
        print(f"  [Source] Raw base64 length: {len(source_image_b64_raw)}", file=sys.stderr)
        print(f"  [Source] Resized reference length: {len(source_image_b64_resized)}", file=sys.stderr)

                                                                               
                               
                                                                               
    gate_state = _build_visual_gate_state(product_info, bool(source_image_b64_resized))
    print(
        f"[Image Gen] Visual gate: lane={gate_state['lane']} "
        f"sellable_eligible={gate_state['sellable_eligible']} "
        f"visual_lock_status={gate_state['visual_lock_status']}",
        file=sys.stderr
    )
    if gate_state["blocked_reasons"]:
        print(f"[Image Gen] Visual gate blockers: {', '.join(gate_state['blocked_reasons'])}", file=sys.stderr)

    sku_en = product_info.get("sku_name_en", sku_name)
    sku_ru = product_info.get("sku_name_ru", sku_name)
    subtitle_ru = product_info.get("subtitle_ru", "ДЛЯ ДОМА И ОФИСА")
    usps_en = product_info.get("usps_en", "")
    usps_ru = product_info.get("usps_ru", "")
    claim_policy = _select_claim_policy(product_info, gate_state["lane"])
    material_en = product_info.get("material_en", "")
    material_ru = product_info.get("material_ru", "")
    cat_type = category_type or product_info.get("product_type_ru", sku_name)
    
                       
    usp_items = claim_policy.get("usp_items", product_info.get("usp_items_ru", []))
    usp1 = usp_items[0] if len(usp_items) > 0 else "Премиум"
    usp2 = usp_items[1] if len(usp_items) > 1 else "Качество"
    usp3 = usp_items[2] if len(usp_items) > 2 else "Надёжность"
    usp4 = usp_items[3] if len(usp_items) > 3 else "Комфорт"
    
                       
    quality_desc_ru = product_info.get("quality_desc_ru", "высокое качество")
    scene_label_ru = product_info.get("scene_label_ru", subtitle_ru)
    
                  
    hero_scene = bg_info.get("hero_scene", "a warm, well-lit interior with soft natural light")
    usp_surface = bg_info.get("usp_surface", "a clean wooden surface")
    usp_scene = bg_info.get("usp_scene", "a cozy room with warm ambient light")
    detail_surface = bg_info.get("detail_surface", "a smooth surface with natural texture")
    trust_scene = bg_info.get("trust_scene", "a person using the product at home, warm natural lighting, genuine expression")
    scene2_desc = bg_info.get("scene2_desc", "a different lifestyle setting, aspirational atmosphere, warm ambient light")
    
                          
    main_bg_hint = bg_info.get("main_bg_hint", "Soft warm bokeh of a cozy interior, natural light")
    usp_bg_hint = bg_info.get("usp_bg_hint", "A warm surface with natural textures, soft ambient light")
    detail_bg_hint = bg_info.get("detail_bg_hint", "Warm blurred interior, subtle highlights")

                                                                               
                                                    
                                                                               
    results = []

    slots = GEN_ORDER[:count]
    reused_count = 0
    to_generate = []
    for slot_key in slots:
        if slot_key in cached_images:
                            
            cached_item = cached_images[slot_key]
            cached_ref_mode = cached_item.get("reference_mode") or ("cached_white_bg_anchor" if slot_key == "white_bg" else "")
            results.append(_attach_generation_state(
                cached_item,
                gate_state,
                reference_mode=cached_ref_mode,
                anchor_role="primary_anchor" if slot_key == "white_bg" else "derived_scene",
                fallback=bool(cached_item.get("fallback")),
            ))
            reused_count += 1
            print(f"  [REUSE] {slot_key} already generated, reusing: {cached_images[slot_key]['url'][:60]}...", file=sys.stderr)
                                                      
            if slot_key == "white_bg" and source_image_b64_resized:
                anchor_b64_resized = source_image_b64_resized                
        else:
            to_generate.append(slot_key)

    if reused_count > 0:
        print(f"[Image Gen] Reusing {reused_count} cached images, generating {len(to_generate)} remaining...", file=sys.stderr)
    if not to_generate:
        print(f"[Image Gen] All {count} images already in cache, skipping generation", file=sys.stderr)
    else:
        print(f"[Image Gen] Step 6: Generating {len(to_generate)} images (dual reference strategy)...", file=sys.stderr)

    gen_start_time = time.time()
    MAX_TOTAL_GEN_SECONDS = 1200                 

                               
    anchor_b64_resized = ""                     
    if "white_bg" in to_generate:
        slot_key = "white_bg"
        slot_info = IMAGE_SLOTS["white_bg"]
        slot_aspect = slot_info.get("aspect_ratio", "3:4")
        ref_b64 = source_image_b64_resized              
        ref_label = "1688 source (anchor generation)"
        prompt = slot_info["prompt_template"]

        print(f"  [Anchor] Generating white_bg ({slot_info['name']}) [ref: {ref_label}]...", file=sys.stderr)
        if not ref_b64:
            print("  [ERROR] white_bg missing source reference image", file=sys.stderr)
            results.append(_attach_generation_state(
                {"slot": slot_key, "url": "", "name": slot_info["name"], "fallback": True},
                gate_state,
                reference_mode="source_image_anchor",
                anchor_role="primary_anchor",
                fallback=True,
            ))
        else:
            try:
                slot_started_at = time.time()
                nano_telemetry = {}
                img_b64 = generate_image_with_nano(
                    prompt,
                    config,
                    reference_image_b64=ref_b64,
                    aspect_ratio=slot_aspect,
                    telemetry=nano_telemetry,
                )
                img_bytes = base64.b64decode(img_b64)

                if img_b64:
                    try:
                        anchor_b64_resized = _resize_image_b64(img_b64, 768)
                        print(f"  [Anchor] White anchor saved ({len(anchor_b64_resized)} b64 chars)", file=sys.stderr)
                    except Exception as e:
                        print(f"  [WARN] Failed to resize white anchor: {e}", file=sys.stderr)

                if watermark_text:
                    img_bytes = add_watermark(img_bytes, watermark_text)
                filename = f"{file_prefix}_{slot_key}.png"
                try:
                    img_url = upload_to_cos(img_bytes, filename, config)
                    print(
                        f"  [Anchor] white_bg OK: {img_url[:60]}... "
                        f"(attempts={nano_telemetry.get('attempts', 1)}, elapsed={round(time.time() - slot_started_at, 1)}s)",
                        file=sys.stderr,
                    )
                except Exception as cos_err:
                    local_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "generated_images")
                    os.makedirs(local_dir, exist_ok=True)
                    local_path = os.path.join(local_dir, filename)
                    with open(local_path, "wb") as f:
                        f.write(img_bytes)
                    img_url = f"file://{local_path}"
                    print(f"  [Anchor] white_bg OK (local): {local_path}", file=sys.stderr)
                results.append(_attach_generation_state(
                    {
                        "slot": slot_key,
                        "url": img_url,
                        "name": slot_info["name"],
                        "generation_elapsed_seconds": round(time.time() - slot_started_at, 1),
                        "generation_attempts": nano_telemetry.get("attempts", 1),
                        "generation_retries": nano_telemetry.get("retries", 0),
                        "provider_status_code": nano_telemetry.get("last_status_code"),
                    },
                    gate_state,
                    reference_mode="source_image_anchor",
                    anchor_role="primary_anchor",
                    fallback=False,
                ))
            except Exception as e:
                print(f"  [ERROR] white_bg failed: {e}", file=sys.stderr)
                results.append(_attach_generation_state(
                    {
                        "slot": slot_key,
                        "url": "",
                        "name": slot_info["name"],
                        "fallback": True,
                        "generation_elapsed_seconds": round(time.time() - slot_started_at, 1) if 'slot_started_at' in locals() else 0.0,
                        "generation_attempts": nano_telemetry.get("attempts", 0) if 'nano_telemetry' in locals() else 0,
                        "generation_retries": nano_telemetry.get("retries", 0) if 'nano_telemetry' in locals() else 0,
                        "provider_status_code": nano_telemetry.get("last_status_code") if 'nano_telemetry' in locals() else None,
                    },
                    gate_state,
                    reference_mode="source_image_anchor",
                    anchor_role="primary_anchor",
                    fallback=True,
                ))

        to_generate.remove("white_bg")
    elif "white_bg" in cached_images:
                             
        anchor_b64_resized = source_image_b64_resized

                                     
    scene_slots = [s for s in to_generate if s != "white_bg"]

    def _generate_one_scene(slot_key):
        """生成单个场景图(线程安全)"""
        slot_info = IMAGE_SLOTS[slot_key]
        slot_aspect = slot_info.get("aspect_ratio", "3:4")

                       
        if anchor_b64_resized:
            ref_b64 = anchor_b64_resized
            ref_label = "white_bg anchor (star)"
            ref_mode = "white_bg_anchor"
        elif source_image_b64_resized:
            ref_b64 = source_image_b64_resized
            ref_label = "1688 source (fallback)"
            ref_mode = "source_image_fallback"
        else:
            ref_b64 = ""
            ref_label = "missing reference"
            ref_mode = "visual_desc_only"

                  
        if slot_key == "main":
            prompt = slot_info["prompt_template"].format(
                sku_name_ru=sku_ru, hero_scene=hero_scene,
                usp1_ru=usp1, usp2_ru=usp2, usp3_ru=usp3,
                main_bg_hint=main_bg_hint,
            )
        elif slot_key == "usp":
            prompt = slot_info["prompt_template"].format(
                usp_surface=usp_surface, usp_scene=usp_scene,
                usp1_ru=usp1, usp2_ru=usp2, usp3_ru=usp3, usp4_ru=usp4,
                usp_bg_hint=usp_bg_hint,
            )
        elif slot_key == "detail":
            prompt = slot_info["prompt_template"].format(
                material_en=material_en, detail_surface=detail_surface,
                material_ru=material_ru, quality_desc_ru=quality_desc_ru,
                detail_bg_hint=detail_bg_hint,
            )
        elif slot_key == "trust":
            prompt = slot_info["prompt_template"].format(
                trust_scene=trust_scene,
            )
        elif slot_key == "scene2":
            prompt = slot_info["prompt_template"].format(
                scene2_desc=scene2_desc, scene_label_ru=scene_label_ru,
            )
        else:
            prompt = slot_info["prompt_template"]

                       
        claim_guidance = _build_claim_guidance(slot_key, claim_policy, gate_state["lane"])
        if visual_ref:
            product_lock = PRODUCT_LOCK_TEMPLATE.format(visual_desc=visual_ref)
            prompt = product_lock + NEGATIVE_PROMPT + claim_guidance + prompt
        else:
            prompt = NEGATIVE_PROMPT + claim_guidance + prompt

        print(f"  [Scene] Generating {slot_key} ({slot_info['name']}) [ref: {ref_label}]...", file=sys.stderr)
        if not ref_b64:
            print(f"  [ERROR] {slot_key} missing required reference image", file=sys.stderr)
            return _attach_generation_state(
                {"slot": slot_key, "url": "", "name": slot_info["name"], "fallback": True},
                gate_state,
                reference_mode=ref_mode,
                anchor_role="derived_scene",
                fallback=True,
            )
        try:
            slot_started_at = time.time()
            nano_telemetry = {}
            img_b64 = generate_image_with_nano(
                prompt,
                config,
                reference_image_b64=ref_b64,
                aspect_ratio=slot_aspect,
                telemetry=nano_telemetry,
            )
            img_bytes = base64.b64decode(img_b64)
            if watermark_text:
                img_bytes = add_watermark(img_bytes, watermark_text)
            filename = f"{file_prefix}_{slot_key}.png"
            try:
                img_url = upload_to_cos(img_bytes, filename, config)
                print(
                    f"  [Scene] {slot_key} OK: {img_url[:60]}... "
                    f"(attempts={nano_telemetry.get('attempts', 1)}, elapsed={round(time.time() - slot_started_at, 1)}s)",
                    file=sys.stderr,
                )
            except Exception as cos_err:
                local_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "generated_images")
                os.makedirs(local_dir, exist_ok=True)
                local_path = os.path.join(local_dir, filename)
                with open(local_path, "wb") as f:
                    f.write(img_bytes)
                img_url = f"file://{local_path}"
                print(f"  [Scene] {slot_key} OK (local): {local_path}", file=sys.stderr)
            return _attach_generation_state(
                {
                    "slot": slot_key,
                    "url": img_url,
                    "name": slot_info["name"],
                    "generation_elapsed_seconds": round(time.time() - slot_started_at, 1),
                    "generation_attempts": nano_telemetry.get("attempts", 1),
                    "generation_retries": nano_telemetry.get("retries", 0),
                    "provider_status_code": nano_telemetry.get("last_status_code"),
                },
                gate_state,
                reference_mode=ref_mode,
                anchor_role="derived_scene",
                fallback=False,
            )
        except Exception as e:
            print(f"  [ERROR] {slot_key} failed: {e}", file=sys.stderr)
            return _attach_generation_state(
                {
                    "slot": slot_key,
                    "url": "",
                    "name": slot_info["name"],
                    "fallback": True,
                    "generation_elapsed_seconds": round(time.time() - slot_started_at, 1) if 'slot_started_at' in locals() else 0.0,
                    "generation_attempts": nano_telemetry.get("attempts", 0) if 'nano_telemetry' in locals() else 0,
                    "generation_retries": nano_telemetry.get("retries", 0) if 'nano_telemetry' in locals() else 0,
                    "provider_status_code": nano_telemetry.get("last_status_code") if 'nano_telemetry' in locals() else None,
                },
                gate_state,
                reference_mode=ref_mode,
                anchor_role="derived_scene",
                fallback=True,
            )

    if scene_slots:
        scene_count = len(scene_slots)
        scene_concurrency = _resolve_scene_concurrency(config, scene_count)
        print(
            f"[Image Gen] Generating {scene_count} scene images in parallel "
            f"(max {scene_concurrency} concurrent)...",
            file=sys.stderr,
        )
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=scene_concurrency) as executor:
            futures = {executor.submit(_generate_one_scene, s): s for s in scene_slots}
            for future in as_completed(futures):
                slot_key = futures[future]
                try:
                    result = future.result(timeout=300)
                    results.append(result)
                except Exception as e:
                    print(f"  [ERROR] {slot_key} thread exception: {e}", file=sys.stderr)
                    results.append(_attach_generation_state(
                        {"slot": slot_key, "url": "", "name": IMAGE_SLOTS[slot_key]["name"], "fallback": True},
                        gate_state,
                        reference_mode="thread_exception",
                        anchor_role="derived_scene",
                        fallback=True,
                    ))

                                                                               
                                                             
                                                                               
    slot_order_map = {s: i for i, s in enumerate(SLOT_ORDER)}
    results.sort(key=lambda x: slot_order_map.get(x.get("slot", ""), 99))

                             
    if results and results[-1].get("slot") != "white_bg":
        white = [r for r in results if r.get("slot") == "white_bg"]
        others = [r for r in results if r.get("slot") != "white_bg"]
        results = others + white
        print("[Image Gen] Reordered: white_bg moved to last position", file=sys.stderr)

                                                                               
                                         
                                                                               
    white_bg_item = next((r for r in results if r.get("slot") == "white_bg"), {})
    white_bg_ready = bool(white_bg_item.get("url")) and not bool(white_bg_item.get("fallback"))
    scene_truth_ok = all(
        (r.get("slot") == "white_bg") or
        (r.get("url") and r.get("reference_mode") in {"white_bg_anchor", "source_image_fallback"})
        for r in results
    )
    final_sellable_eligible = bool(gate_state["visual_lock_ready"] and white_bg_ready and scene_truth_ok)
    final_lane = "sellable" if final_sellable_eligible else "research"
    final_status = "ready" if final_sellable_eligible else "research-only"
    final_visual_lock_status = "locked" if final_sellable_eligible else (
        "anchor_missing_or_weak" if white_bg_item and not white_bg_ready else gate_state["visual_lock_status"]
    )
    final_blocked_reasons = list(gate_state["blocked_reasons"])
    if not white_bg_ready:
        final_blocked_reasons.append("white_bg_anchor_missing")
    if not scene_truth_ok:
        final_blocked_reasons.append("non_anchor_scene_generation_detected")

    final_gate_state = {
        **gate_state,
        "lane": final_lane,
        "status": final_status,
        "sellable_eligible": final_sellable_eligible,
        "visual_lock_ready": final_sellable_eligible,
        "visual_lock_status": final_visual_lock_status,
        "anchor_ready": white_bg_ready,
        "blocked_reasons": final_blocked_reasons,
        "blocked_reason": ";".join(final_blocked_reasons),
    }
    results = [_attach_generation_state(r, final_gate_state) for r in results]

    successful_images = [r for r in results if r.get("url") and not r.get("fallback")]
    if successful_images and cache_key:
        save_product_cache(cache_key, product_info, bg_info, generated_images=successful_images)
        print(f"[Image Gen] Cached {len(successful_images)} generated images for: {cache_key}", file=sys.stderr)

    success_count = len(successful_images)
    fallback_count = len([r for r in results if r.get("fallback")])
    print(f"[Image Gen] Total generation elapsed: {round(time.time() - gen_start_time, 1)}s", file=sys.stderr)
    print(f"[Image Gen] Complete: {success_count} success + {fallback_count} failed (total {len(results)})", file=sys.stderr)
    print(
        f"[Image Gen] Final gate: lane={final_gate_state['lane']} "
        f"sellable_eligible={final_gate_state['sellable_eligible']} "
        f"visual_lock_ready={final_gate_state['visual_lock_ready']} "
        f"anchor_ready={final_gate_state['anchor_ready']}",
        file=sys.stderr
    )
    print(f"[Image Gen] Display order: {' -> '.join(r['slot'] for r in results)}", file=sys.stderr)
    return results


def main():
    parser = argparse.ArgumentParser(description="Ozon电商图片自动生成 v3.7 - Glass-morphism+offer_id缓存")
    parser.add_argument("--sku-name", required=True, help="商品名称")
    parser.add_argument("--offer-id", default="", help="商品货号(如pc-20260502-001)，用作缓存key和文件名前缀")
    parser.add_argument("--source-image", default="", help="1688商品图URL(作为生图参考)")
    parser.add_argument("--count", type=int, default=6, help="生成图片数量 (默认6)")
    parser.add_argument("--watermark", default="", help="水印文字")
    parser.add_argument("--store-name", default="default", help="店铺名称")
    parser.add_argument("--category-type", default="", help="Ozon类目类型名称(确保图片与类型一致)")
    args = parser.parse_args()

    config = get_config(store_name=args.store_name)
    results = generate_product_images(
        sku_name=args.sku_name,
        source_image_url=args.source_image,
        count=args.count,
        watermark_text=args.watermark,
        config=config,
        category_type=args.category_type,
        offer_id=args.offer_id,
    )

    summary = {}
    if results:
        summary = {
            "lane": results[0].get("lane"),
            "status": results[0].get("status"),
            "sellable_eligible": results[0].get("sellable_eligible"),
            "visual_lock_ready": results[0].get("visual_lock_ready"),
            "visual_lock_status": results[0].get("visual_lock_status"),
            "anchor_ready": results[0].get("anchor_ready"),
            "all_slots_ready": results[0].get("all_slots_ready"),
            "all_images_reference_ready": results[0].get("all_images_reference_ready"),
            "blocked_reason": results[0].get("blocked_reason", ""),
            "blocked_reasons": results[0].get("blocked_reasons", []),
        }

    print(json.dumps({"success": True, "count": len(results), "summary": summary, "images": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
