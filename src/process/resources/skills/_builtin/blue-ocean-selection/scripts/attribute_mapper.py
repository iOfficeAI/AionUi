#!/usr/bin/env python3
"""
Ozon属性映射器 v6.0
- 全属性填充：必填+可选，字典+文本+数字
- LLM智能选择字典值（选不出则取最常见值）
- LLM生成俄文描述（Аннотация）
- deepseek-v4-flash reasoning_content回退
"""

import os
import re
import json
import logging
import sys
from typing import Dict, List, Optional, Tuple

from http_client import requests as http_requests
from policy_constants import ATTRIBUTE_QUALITY_THRESHOLD

logger = logging.getLogger(__name__)


def _extract_category_tree_nodes(response_json: dict) -> List[Dict]:
    """兼容 Ozon 类目树返回口径，优先取官方文档中的 result。"""
    if not isinstance(response_json, dict):
        return []
    nodes = response_json.get("result")
    if isinstance(nodes, list):
        return nodes
    legacy_nodes = response_json.get("categories")
    if isinstance(legacy_nodes, list):
        return legacy_nodes
    return []


def _fetch_category_tree(headers: Dict[str, str], languages: List[str] = None, timeout: int = 30) -> List[Dict]:
    """按官方 /v1/description-category/tree 契约获取类目树。"""
    from http_client import requests as http_requests

    tree_langs = languages or ["ZH_HANS", "DEFAULT"]
    for lang in tree_langs:
        try:
            response = http_requests.post(
                "https://api-seller.ozon.ru/v1/description-category/tree",
                headers=headers,
                json={"language": lang},
                timeout=timeout,
            )
            nodes = _extract_category_tree_nodes(response.json())
            if nodes:
                return nodes
        except Exception:
            continue
    return []

COLOR_NAME_MAPPING = {
    "черный": "Черный", "чёрный": "Чёрный", "black": "Черный",
    "белый": "Белый", "white": "Белый",
    "красный": "Красный", "red": "Красный",
    "синий": "Синий", "blue": "Синий",
    "зеленый": "Зелёный", "green": "Зелёный",
    "желтый": "Жёлтый", "yellow": "Жёлтый",
    "розовый": "Розовый", "pink": "Розовый",
    "серый": "Серый", "gray": "Серый", "grey": "Серый",
    "коричневый": "Коричневый", "brown": "Коричневый",
    "оранжевый": "Оранжевый", "orange": "Оранжевый",
    "фиолетовый": "Фиолетовый", "purple": "Фиолетовый",
    "бежевый": "Бежевый", "beige": "Бежевый",
    "голубой": "Голубой",
}

CATEGORY_KEYWORD_BOOSTS = {
    "鞋刷": ["衣鞋刷"],
    "衣鞋刷": ["衣鞋刷"],
    "鞋垫": ["鞋垫", "Стельки", "Вкладыш"],
    "保温杯": ["保暖杯", "热水瓶", "Термокружка", "Термос"],
    "保暖杯": ["保暖杯", "Термокружка"],
    "热水瓶": ["热水瓶", "Термос"],
    "收纳盒": ["收纳盒", "衣物收纳盒", "文具收纳盒", "Органайзер", "Кофр"],
    "厨房刷": ["刷", "Щетка"],
    "锅刷": ["刷", "Щетка"],
    "洗碗刷": ["刷", "Щетка"],
}

CATEGORY_NEGATIVE_GUARDS = [
    {
        "product_terms": ["婴儿", "婴幼儿", "宝宝", "儿童", "益智玩具", "爬行玩具", "玩具"],
        "forbidden_terms": ["成人用品", "性爱", "情趣", "润滑剂", "清洁剂", "避孕套", "月经杯"],
        "penalty": 5000,
    },
    {
        "product_terms": ["鞋垫", "鞋刷", "衣鞋刷", "保温杯", "收纳盒", "厨房刷", "刷子"],
        "forbidden_terms": ["成人用品", "性爱", "情趣"],
        "penalty": 5000,
    },
]

def _sanitize_cjk(text: str) -> str:
    """剥离所有CJK统一表意文字，防止Ozon提交报错'недопустимые символы и/или иероглифы'"""
    if not text:
        return text
    cleaned = re.sub(
        r'[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff]',
        '', text
    )
    cleaned = re.sub(r' {2,}', ' ', cleaned).strip()
    return cleaned


def _normalize_dict_value_text(text: str) -> str:
    """字典值匹配规范化：小写、ё→е、去常见分隔符、压缩空格。"""
    if not text:
        return ""
    normalized = str(text).strip().lower().replace("ё", "е")
    normalized = re.sub(r'[\(\)\[\]\{\},.;:/\\|+\-_]+', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized.strip()


def _score_dictionary_candidate(source_value: str, candidate: Dict) -> int:
    """对 search/values 的候选值打分，避免盲拿第一条。"""
    source_norm = _normalize_dict_value_text(source_value)
    value_norm = _normalize_dict_value_text(candidate.get("value", ""))
    info_norm = _normalize_dict_value_text(candidate.get("info", ""))

    if not source_norm or not value_norm:
        return -1

    score = 0
    if value_norm == source_norm:
        score += 1000
    if source_norm in value_norm:
        score += 400
    if value_norm in source_norm:
        score += 250
    if value_norm.startswith(source_norm):
        score += 120
    if source_norm.startswith(value_norm):
        score += 80

    source_tokens = set(source_norm.split())
    value_tokens = set(value_norm.split())
    info_tokens = set(info_norm.split())

    overlap = len(source_tokens & value_tokens)
    if overlap:
        score += overlap * 40
    info_overlap = len(source_tokens & info_tokens)
    if info_overlap:
        score += info_overlap * 15

    if len(value_norm) <= max(len(source_norm) * 2, len(source_norm) + 8):
        score += 10
    return score


def _pick_best_dictionary_candidate(source_value: str, candidates: List[Dict]) -> Optional[Dict]:
    scored = []
    for candidate in candidates or []:
        score = _score_dictionary_candidate(source_value, candidate)
        if score >= 0:
            scored.append((score, candidate))
    if not scored:
        return None
    scored.sort(
        key=lambda item: (
            item[0],
            -len(_normalize_dict_value_text(item[1].get("value", ""))),
            -int(item[1].get("id", 0) or 0),
        ),
        reverse=True,
    )
    return scored[0][1]


NUMBER_ATTR_DEFAULTS = {
    "количество в упаковке": "2",
    "количество товара": "2",
    "количество заводских": "2",
    "минимальный заказ": "2",
    "срок годности": "730",
    "длина стельки": "30",
    "длина": "25",
    "обхват": "M",
}

TEXT_ATTR_DEFAULTS = {
    "гарантий": "12 месяцев",
    "warranty": "12 месяцев",
    "保修": "12 месяцев",
    "комплект": "1 шт",
    "название цвета": "Базовый",
    "颜色名称": "Базовый",
    "страна": "Китай",
    "原产国": "Китай",
    "вес": "100",
    "длина": "25",
    "ширина": "10",
    "высота": "5",
    "количество в упаковке": "1",
    "一个包装中的数量": "1",
    "минимальный заказ": "1",
    "длина стельки": "30",
    "обхват": "M",
    "документ": "",
    "сертификат": "",
    "сертификат соответст": "",
}

DIRECT_FILL_ATTRS = {
    4180: "name",                                        
    4191: "description",              
    10097: "color",                               
    9024: "offer_id",                        
    23171: "hashtags",                            
}

OPTIONAL_SKIP_IDS = {
    4386,                       
    4385,                          
    5076,                     
}


class UniversalAttributeFiller:
    """通用Ozon属性填充器 — 全属性覆盖"""

    def __init__(self, description_category_id: int, type_id: int,
                 ozon_client_id: str = None, ozon_api_key: str = None):
        self.description_category_id = description_category_id
        self.type_id = type_id
        
                     
        try:
            from config import get_config
            _config = get_config()
            self.ozon_client_id = ozon_client_id or _config.ozon_client_id
            self.ozon_api_key = ozon_api_key or _config.ozon_api_key
            self.mxou_api_key = _config.mxou_api_key
            self.mxou_api_url = _config.mxou_api_url
            self.mxou_model = _config.mxou_model
        except Exception:
            self.ozon_client_id = ozon_client_id or os.environ.get("OZON_CLIENT_ID", "")
            self.ozon_api_key = ozon_api_key or os.environ.get("OZON_API_KEY", "")
            self.mxou_api_key = os.environ.get("MXOU_API_KEY", "")
            self.mxou_api_url = os.environ.get("MXOU_API_URL", "https://api.mxou.cn")
            self.mxou_model = os.environ.get("MXOU_MODEL", "MiniMax-M2.7-highspeed")
        
        self.ozon_api_url = "https://api-seller.ozon.ru"
        
            
        self._category_attrs = None
        self._dictionary_values_cache = {}
        self._product_description = ""           
        
                 
        try:
            from ozon_cache import OzonCache
            self._cache = OzonCache()
        except Exception:
            self._cache = None

    def _seed_local_cache(self, endpoint: str, data: dict) -> None:
        if not getattr(self, "_cache", None):
            return
        try:
            key = self._cache.make_key(endpoint, data)
            payload = None
            if endpoint == "/v1/description-category/attribute":
                payload = {"result": self._category_attrs or []}
            elif endpoint == "/v1/description-category/attribute/values":
                attr_id = data.get("attribute_id")
                cache_key = f"{attr_id}_{self.description_category_id}_{self.type_id}"
                payload = {
                    "result": self._dictionary_values_cache.get(cache_key, []),
                    "has_next": False,
                }
            if payload is not None:
                self._cache.set_with_meta(key, payload, endpoint, data)
        except Exception:
            pass

    def _request(self, endpoint: str, data: dict, use_cache: bool = True) -> dict:
        """发送Ozon API请求，支持缓存"""
        from http_client import requests as http_requests
        
        url = f"{self.ozon_api_url}{endpoint}"
        headers = {
            "Client-Id": str(self.ozon_client_id),
            "Api-Key": self.ozon_api_key,
            "Content-Type": "application/json"
        }
        
              
        if use_cache and self._cache:
            cache_key = self._cache.make_key(endpoint, data)
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached
        
        response = http_requests.post(url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()
        
                                          
        if use_cache and self._cache and "/values/search" not in endpoint:
            cache_key = self._cache.make_key(endpoint, data)
            self._cache.set(cache_key, result)
        
        return result

    def get_category_attributes(self) -> List[Dict]:
        """获取类目所有属性 — 内存 → Supabase → 本地缓存 → Ozon API → 异步回传"""
        if self._category_attrs is not None:
            return self._category_attrs

        request_data = {
            "description_category_id": self.description_category_id,
            "type_id": self.type_id,
            "language": "ZH_HANS"
        }

        try:
            from ozon_distributed_cache import load_category_attrs_from_supabase
            sb_attrs = load_category_attrs_from_supabase(self.description_category_id, self.type_id)
            if sb_attrs:
                self._category_attrs = sb_attrs
                self._seed_local_cache("/v1/description-category/attribute", request_data)
                return self._category_attrs
        except ImportError:
            pass
        except Exception as e:
            print(f"  [AttrMapper] Supabase load attrs: {e}", file=sys.stderr)

        data = self._request("/v1/description-category/attribute", request_data)
        self._category_attrs = data.get("result", [])

                      
        try:
            from ozon_distributed_cache import upload_category_attrs_to_supabase
            upload_category_attrs_to_supabase(self.description_category_id, self.type_id, self._category_attrs)
        except ImportError:
            pass
        except Exception as e:
            print(f"  [AttrMapper] Supabase upload attrs: {e}", file=sys.stderr)

        return self._category_attrs

    def is_dictionary_attribute(self, attr: Dict) -> bool:
        """判断属性是否为字典类型"""
        dict_id = attr.get("dictionary_id", 0)
        return dict_id and dict_id != 0

    def get_dictionary_values(self, attr_id: int) -> List[Dict]:
        """获取字典属性的所有值 — 内存 → Supabase → 本地缓存 → Ozon API → 异步回传"""
        cache_key = f"{attr_id}_{self.description_category_id}_{self.type_id}"
        if cache_key in self._dictionary_values_cache:
            return self._dictionary_values_cache[cache_key]

        request_data = {
            "attribute_id": attr_id,
            "description_category_id": self.description_category_id,
            "type_id": self.type_id,
            "limit": 2000,
            "last_value_id": 0,
            "language": "ZH_HANS"
        }

        try:
            from ozon_distributed_cache import load_dict_values_from_supabase
            sb_values = load_dict_values_from_supabase(self.description_category_id, self.type_id, attr_id)
            if sb_values:
                self._dictionary_values_cache[cache_key] = sb_values
                self._seed_local_cache("/v1/description-category/attribute/values", request_data)
                return sb_values
        except ImportError:
            pass
        except Exception as e:
            print(f"  [AttrMapper] Supabase load dict values: {e}", file=sys.stderr)

                             
        all_values = []
        last_value_id = 0

        while True:
            data = self._request("/v1/description-category/attribute/values", {
                "attribute_id": attr_id,
                "description_category_id": self.description_category_id,
                "type_id": self.type_id,
                "limit": 2000,
                "last_value_id": last_value_id,
                "language": "ZH_HANS"
            })

            values = data.get("result", [])
            if not values:
                break

            all_values.extend(values)
            has_next = data.get("has_next")
            if has_next is False:
                break
            if has_next is None and len(values) < 2000:
                break

            last_value_id = values[-1].get("id", 0)
            if not last_value_id:
                break

        self._dictionary_values_cache[cache_key] = all_values
        self._seed_local_cache("/v1/description-category/attribute/values", request_data)

                                         
        self._pending_dict_upload = getattr(self, '_pending_dict_upload', {})
        self._pending_dict_upload[str(attr_id)] = all_values
        if len(self._pending_dict_upload) >= 3:
            self._flush_dict_values_to_supabase()

        return all_values

    def _flush_dict_values_to_supabase(self):
        """批量回传字典值到Supabase"""
        if not getattr(self, '_pending_dict_upload', None):
            return
        try:
            from ozon_distributed_cache import upload_dict_values_to_supabase
            upload_dict_values_to_supabase(
                self.description_category_id, self.type_id,
                self._pending_dict_upload)
            self._pending_dict_upload = {}
        except ImportError:
            pass
        except Exception as e:
            print(f"  [AttrMapper] Supabase flush dict: {e}", file=sys.stderr)

    def search_dictionary_values(self, attr_id: int, query: str) -> List[Dict]:
        """搜索字典值（不缓存）"""
        normalized = str(query or "").strip()
        if len(normalized) < 2:
            return []
        try:
            data = self._request("/v1/description-category/attribute/values/search", {
                "attribute_id": attr_id,
                "description_category_id": self.description_category_id,
                "type_id": self.type_id,
                "value": normalized,
                "limit": 100,
                "language": "ZH_HANS",
            }, use_cache=False)
        except http_requests.HTTPError as exc:
            print(
                f"  [AttrMapper] dictionary search skipped attr={attr_id} query={normalized!r}: {exc}",
                file=sys.stderr,
            )
            return []

        return data.get("result", [])

    def _find_matching_value(self, attr_id: int, source_value: str) -> Optional[Dict]:
        """搜索匹配字典值"""
        if not source_value:
            return None
        
             
        results = self.search_dictionary_values(attr_id, source_value)
        if results:
            best = _pick_best_dictionary_candidate(source_value, results)
            if best:
                return best
            return results[0]

                                    
        all_values = self.get_dictionary_values(attr_id)
        best = _pick_best_dictionary_candidate(source_value, all_values)
        if best:
            return best
        
               
        translated = self._translate_to_russian(source_value)
        if translated and translated != source_value:
            results = self.search_dictionary_values(attr_id, translated)
            if results:
                best = _pick_best_dictionary_candidate(translated, results)
                if best:
                    return best
                return results[0]
            best = _pick_best_dictionary_candidate(translated, all_values or self.get_dictionary_values(attr_id))
            if best:
                return best
        
        return None

    def _translate_to_russian(self, text: str) -> Optional[str]:
        if not text:
            return None
        raw = str(text).strip()
        if not raw:
            return None
        if any('\u0400' <= ch <= '\u04FF' for ch in raw):
            return raw
        lowered = raw.lower()
        if lowered in COLOR_NAME_MAPPING:
            return COLOR_NAME_MAPPING[lowered]
        translated_tokens = []
        for token in re.split(r'[\s,/]+', lowered):
            token = token.strip()
            if not token:
                continue
            translated_tokens.append(COLOR_NAME_MAPPING.get(token, token.capitalize()))
        translated = ' '.join(translated_tokens).strip()
        return translated or None

    def _llm_select_dictionary_value(self, attr_info: Dict, product_info: Dict) -> Optional[Dict]:
        return None

    def _llm_fill_text_attribute(self, attr_info: Dict, product_info: Dict) -> Optional[str]:
        return None

    def _generate_product_description(self, product_info: Dict) -> str:
        if self._product_description:
            return self._product_description

        product_info = product_info or {}
        display_name = _sanitize_cjk(
            product_info.get("sku_name_ru") or product_info.get("name_ru") or product_info.get("name") or "Продукт"
        ) or "Продукт"
        material = _sanitize_cjk(product_info.get("material", "")) or "не указан"
        dimensions = product_info.get("dimensions", "")
        size_str = ""
        if isinstance(dimensions, (list, tuple)) and len(dimensions) >= 3:
            size_str = f"{int(float(dimensions[0]))}×{int(float(dimensions[1]))}×{int(float(dimensions[2]))} мм"
        elif isinstance(dimensions, str):
            size_str = _sanitize_cjk(dimensions)

        category_type = _sanitize_cjk(product_info.get("product_type_ru") or product_info.get("category_type", ""))
        package_text = _sanitize_cjk(product_info.get("package") or product_info.get("kit") or "")
        if not package_text:
            package_text = f"1 × {display_name}"

        lines = [f"Название продукта: {display_name}", f"Материал: {material}"]
        if category_type:
            lines.append(f"Категория: {category_type}")
        if size_str:
            lines.append(f"Размер: {size_str}")
        lines.append(f"Комплектация: {package_text}")
        raw_desc = '\n'.join(lines)[:500]
        self._product_description = _sanitize_cjk(raw_desc)
        return self._product_description

    def _generate_rich_content(self, product_info: Dict) -> str:
        """生成Ozon Rich-контент JSON（attr 11254）— raShowcase格式
        
        格式:
        {"content":[{"widgetName":"raShowcase","type":"billboard",
          "blocks":[{"img":{"src":"COS_URL","srcMobile":"COS_URL","width":1280,"height":853},
                     "text":{"content":["产品名","材质","功能"]}}]}],
         "version":0.3}
        """
        import json as _json
        
        name = product_info.get("name", "")
        material = product_info.get("material", "")
        category_type = product_info.get("category_type", "")
        
                                   
        image_urls = product_info.get("image_urls", [])
        first_image = image_urls[0] if image_urls else ""
        
                
        text_content = [name]
        if material:
            text_content.append(f"Материал: {material}")
        if category_type:
            text_content.append(category_type)
        
                             
        blocks = []
        
                              
        if first_image:
            blocks.append({
                "img": {
                    "src": first_image,
                    "srcMobile": first_image,
                    "width": 1280,
                    "height": 853,
                    "widthMobile": 640,
                    "heightMobile": 640
                },
                "text": {
                    "content": text_content[:3]
                }
            })
        
                                         
        for i, img_url in enumerate(image_urls[1:4], 1):
            sub_text = []
            if i == 1:
                sub_text = [f"Качество и надёжность", f"{name}"]
            elif i == 2:
                sub_text = [f"Удобство использования"]
            else:
                sub_text = [f"Отличный выбор"]
            
            blocks.append({
                "img": {
                    "src": img_url,
                    "srcMobile": img_url,
                    "width": 1280,
                    "height": 853,
                    "widthMobile": 640,
                    "heightMobile": 640
                },
                "text": {
                    "content": sub_text
                }
            })
        
                              
        if not blocks:
            blocks.append({
                "img": {
                    "src": "",
                    "srcMobile": ""
                },
                "text": {
                    "content": text_content
                }
            })
        
        rich = {
            "content": [
                {
                    "widgetName": "raShowcase",
                    "type": "billboard",
                    "blocks": blocks
                }
            ],
            "version": 0.3
        }
        return _json.dumps(rich, ensure_ascii=False)
    
    def _extract_value_from_product_info(self, attr_info: Dict, product_info: Dict) -> Optional[str]:
        """从产品信息中提取属性值"""
        attr_name = attr_info.get("name", "").lower()
        
        field_mappings = {
            "color": ["color", "colour", "颜色"],
            "material": ["material", "材质"],
            "gender": ["gender", "性别"],
            "brand": ["brand", "品牌"],
            "country": ["country", "country_of_origin", "产地"],
            "weight": ["weight", "重量"],
            "model": ["model", "型号"],
        }
        
        if "цвет" in attr_name or "color" in attr_name:
            for field in field_mappings["color"]:
                if product_info.get(field):
                    return product_info[field]
        elif "материал" in attr_name or "material" in attr_name or "材料" in attr_name or "材质" in attr_name:
            for field in field_mappings["material"]:
                if product_info.get(field):
                    return product_info[field]
            raw_name = " ".join([
                str(product_info.get("name", "") or ""),
                str(product_info.get("title", "") or ""),
                str(product_info.get("product_name", "") or ""),
            ])
            upper_name = raw_name.upper()
            for token in ["EVA", "PVC", "PU", "TPU", "TPE", "PE", "PP", "ABS"]:
                if token in upper_name:
                    return token
        elif "пол" in attr_name or "gender" in attr_name:
            for field in field_mappings["gender"]:
                if product_info.get(field):
                    return product_info[field]
        elif "бренд" in attr_name or "brand" in attr_name:
            for field in field_mappings["brand"]:
                if product_info.get(field):
                    return product_info[field]
        elif "страна" in attr_name or "country" in attr_name:
            for field in field_mappings["country"]:
                if product_info.get(field):
                    return product_info[field]
        elif "тип" in attr_name or "type" in attr_name or "类型" in attr_name or "类别" in attr_name:
            value = (
                product_info.get("type", "") or
                product_info.get("product_type", "") or
                product_info.get("category_type", "") or
                product_info.get("type_name", "") or
                product_info.get("product_type_ru", "") or
                product_info.get("type_name_ru", "")
            )
            if value:
                return value
            name = product_info.get("name", "")
            if name:
                return name
        
        return None

    def fill_attributes(self, product_info: Dict) -> Dict:
        attributes = []
        skipped_required = []
        eligible_count = 0

        if self._category_attrs is None:
            self.get_category_attributes()

        description = self._generate_product_description(product_info)

        for attr in self._category_attrs:
            attr_id = attr.get("id")
            attr_name = attr.get("name", "")
            attr_type = attr.get("type", "string").lower()
            is_required = attr.get("is_required", False)
            is_dict_attr = self.is_dictionary_attribute(attr)
            attr_name_lower = attr_name.lower()

            if attr_id in [4383, 4384]:
                continue
            if any(kw in attr_name_lower for kw in ["видео", "видеообложка", "pdf", "сертификат соответст", "视频", "视频封面", "ссылка", "链接", "ozon.видео", "臭氧。视频", "臭氧。视频封面"]):
                continue
            if attr_type == "url":
                continue
            if attr_id in OPTIONAL_SKIP_IDS and not is_required:
                continue

            eligible_count += 1
            before = len(attributes)
            filled = False

            if is_dict_attr:
                filled = self._fill_dict_attribute(attr, product_info, attributes)
            elif attr_type in ("string", "text"):
                filled = self._fill_text_attribute(attr, product_info, attributes, description)
            elif attr_type in ("number", "integer", "decimal"):
                filled = self._fill_number_attribute(attr, product_info, attributes)

            if not filled and is_required:
                skipped_required.append(f"[{attr_id}] {attr_name}")
            elif len(attributes) == before and filled and is_required:
                skipped_required.append(f"[{attr_id}] {attr_name}")

        for attr_data in attributes:
            for val_item in attr_data.get("values", []):
                if "value" in val_item and isinstance(val_item["value"], str):
                    val_item["value"] = _sanitize_cjk(val_item["value"])

        filled_count = len(attributes)
        completeness_ratio = (filled_count / eligible_count) if eligible_count else 1.0
        completeness_score = int(round(completeness_ratio * 100))
        quality_gate_pass = completeness_score >= ATTRIBUTE_QUALITY_THRESHOLD and not skipped_required

        product_type_ru = product_info.get("product_type_ru", product_info.get("sku_name", ""))
        try:
            from ozon_distributed_cache import upload_fill_result_to_supabase
            fill_meta = {
                "total_attrs": len(self._category_attrs) if self._category_attrs else 0,
                "filled_count": len(attributes),
                "skipped_required": len(skipped_required),
                "completeness_score": completeness_score,
                "timestamp": __import__('time').time(),
            }
            upload_fill_result_to_supabase(
                self.description_category_id, self.type_id,
                product_type_ru, attributes, fill_meta)
        except ImportError:
            pass
        except Exception as e:
            print(f"  [AttrMapper] Supabase upload fill: {e}", file=sys.stderr)

        self._flush_dict_values_to_supabase()

        return {
            "attributes": attributes,
            "skipped_required": skipped_required,
            "description": _sanitize_cjk(description) if description else description,
            "eligible_attribute_count": eligible_count,
            "filled_attribute_count": filled_count,
            "completeness_ratio": round(completeness_ratio, 4),
            "completeness_score": completeness_score,
            "quality_gate_pass": quality_gate_pass,
        }

    def _fill_dict_attribute(self, attr: Dict, product_info: Dict, attributes: list) -> bool:
        attr_id = attr.get("id")
        attr_name = attr.get("name", "")
        attr_name_lower = attr_name.lower()
        source_value = self._extract_value_from_product_info(attr, product_info)
        raw_name = " ".join([
            str(product_info.get("name", "") or ""),
            str(product_info.get("title", "") or ""),
            str(product_info.get("product_name", "") or ""),
            str(product_info.get("category_type", "") or ""),
            str(product_info.get("type_name", "") or ""),
        ]).lower()

        if attr_id == 9782 and not source_value:
            source_value = "不危险"
        if not source_value and any(kw in attr_name_lower for kw in ["страна", "原产国", "происхожден"]):
            source_value = "Китай"
        elif not source_value and any(kw in attr_name_lower for kw in ["бренд", "торговая марка", "品牌"]):
            source_value = product_info.get("brand", "") or "Нет бренда"
        elif not source_value and any(kw in attr_name_lower for kw in ["цвет", "color", "颜色"]):
            source_value = self._translate_to_russian(product_info.get("color", "") or "")
            if not source_value and any(token in raw_name for token in ["灰", "gray", "grey", "сер"]):
                source_value = "灰色"
            elif not source_value and any(token in raw_name for token in ["白", "white", "бел"]):
                source_value = "白色"
        elif not source_value and any(kw in attr_name_lower for kw in ["аудитор", "受众", "целевая аудитория", "目标受众"]):
            if any(token in raw_name for token in ["儿童", "小孩", "宝宝", "kid", "kids", "child", "дет"]):
                source_value = "儿童"
            else:
                source_value = "成人"
        elif not source_value and any(kw in attr_name_lower for kw in ["危险", "hazard", "опас"]):
            source_value = "不危险"
        elif not source_value and ("鞋垫类型" in attr_name or "用途" in attr_name):
            if any(token in raw_name for token in ["跑步", "运动", "sport", "run"]):
                source_value = "用于跑步" if "用途" in attr_name else "骨科"
            else:
                source_value = "经典"
        elif not source_value and any(kw in attr_name_lower for kw in ["加热", "heated"]):
            source_value = "不"

        matched = self._find_matching_value(attr_id, source_value) if source_value else None
        if matched:
            attributes.append({
                "id": attr_id,
                "values": [{"dictionary_value_id": matched.get("id")}]
            })
            return True

        return False

    def _fill_text_attribute(self, attr: Dict, product_info: Dict, attributes: list, description: str) -> bool:
        attr_id = attr.get("id")
        attr_name = attr.get("name", "")
        attr_name_lower = attr_name.lower()
        value = None
        display_name = _sanitize_cjk(
            product_info.get("sku_name_ru") or product_info.get("name_ru") or product_info.get("name", "")
        )

        if any(kw in attr_name_lower for kw in ["модель", "модел", "型号", "模型"]):
            value = product_info.get("model", "") or display_name
        elif any(kw in attr_name_lower for kw in ["название", "наименование", "名称"]):
            if any(kw in attr_name_lower for kw in ["цвет", "颜色"]):
                color = product_info.get("color", "") or "Базовый"
                value = self._translate_to_russian(color) or color
            else:
                value = display_name
        elif any(kw in attr_name_lower for kw in ["комплект", "套装", " комплект"]):
            value = product_info.get("kit", "") or product_info.get("package", "") or "1 шт"
        elif any(kw in attr_name_lower for kw in ["аннотация", "описание", "简介", "描述"]):
            value = product_info.get("description", "") or description
            if value:
                value = _sanitize_cjk(value)[:500]
        elif any(kw in attr_name_lower for kw in ["страна", "原产国", "происхожден"]):
            value = "Китай"
        elif any(kw in attr_name_lower for kw in ["бренд", "торговая марка", "品牌"]):
            value = product_info.get("brand", "") or "Нет бренда"
        elif any(kw in attr_name_lower for kw in ["материал", "材料", "材质"]):
            value = self._extract_value_from_product_info(attr, product_info)
        elif any(kw in attr_name_lower for kw in ["опас", "危险"]):
            value = "Не опасно"
        elif any(kw in attr_name_lower for kw in ["количество", "数量"]):
            value = "1"
        elif any(kw in attr_name_lower for kw in ["комплектация", "套装内容"]):
            value = product_info.get("kit", "") or product_info.get("package", "") or f"1 × {display_name}"
        elif any(kw in attr_name_lower for kw in ["объединить", "похожие", "组合成", "合并"]):
            raw = product_info.get("name", "")[:120]
            value = re.sub(r'[^0-9a-zA-Zа-яА-ЯёЁ!\?,:;\(\)\-\/&" ]', '', raw)
        elif any(kw in attr_name_lower for kw in ["хештег", "hashtag", "主题标签", "тег"]):
            name = product_info.get("name", "")
            category = product_info.get("category_type", "")
            tags = []
            for text in [name, category]:
                for w in re.split(r'[\s,]+', text):
                    if re.match(r'^[a-zA-Zа-яА-ЯёЁ]{2,}$', w) and f"#{w}" not in tags:
                        tags.append(f"#{w}")
            value = " ".join(tags[:5]) if tags else "#product"
        elif ("rich" in attr_name_lower and "json" in attr_name_lower) or ("json" in attr_name_lower and ("富内容" in attr_name or "rich" in attr_name_lower or "контент" in attr_name_lower)):
            rich_json = self._generate_rich_content(product_info)
            if rich_json:
                attributes.append({"id": attr_id, "values": [{"value": rich_json}]})
                return True
            return False
        elif any(kw in attr_name_lower for kw in ["код продавца", "卖家代码", "seller code"]):
            value = product_info.get("offer_id", "") or display_name[:30]
        elif any(kw in attr_name_lower for kw in ["цвет", "颜色"]) and not value:
            color = product_info.get("color", "") or "Базовый"
            value = self._translate_to_russian(color) or color
        elif any(kw in attr_name_lower for kw in ["материал", "material", "材质"]):
            value = product_info.get("material", "")
        elif any(kw in attr_name_lower for kw in ["тип", "type", "类别"]):
            value = product_info.get("product_type_ru", "") or product_info.get("category_type", "")
        elif any(kw in attr_name_lower for kw in ["保修", "гарант"]):
            value = product_info.get("warranty", "") or "30 дней"
        elif any(kw in attr_name_lower for kw in ["包装", "упаков"]):
            value = product_info.get("package", "") or "Пакет"

        if value:
            attributes.append({"id": attr_id, "values": [{"value": str(value)[:500]}]})
            return True

        return False

    def _fill_number_attribute(self, attr: Dict, product_info: Dict, attributes: list) -> bool:
        attr_id = attr.get("id")
        attr_name = attr.get("name", "").lower()
        attr_type = attr.get("type", "").lower()

        dims = product_info.get("dimensions", [100, 100, 50])
        if isinstance(dims, str):
            dims = self._parse_dimensions(dims)
        elif isinstance(dims, (list, tuple)) and len(dims) >= 3:
            dims = {"width": float(dims[0]), "height": float(dims[1]), "depth": float(dims[2])}
        else:
            dims = {"width": 100.0, "height": 100.0, "depth": 50.0}

        if any(kw in attr_name for kw in ["размер", "尺寸", "长宽"]):
            attributes.append({
                "id": attr_id,
                "values": [
                    {"value": str(int(dims['width']))},
                    {"value": str(int(dims['height']))},
                    {"value": str(int(dims['depth']))}
                ]
            })
            return True

        elif any(kw in attr_name for kw in ["вес", "重量"]):
            weight = product_info.get("weight", "")
            if weight:
                parsed = self._parse_weight(weight)
                if parsed > 0:
                    attributes.append({"id": attr_id, "values": [{"value": str(int(parsed))}]})
                    return True
        if any(kw in attr_name for kw in ["количество", "штук", "数量", "包装"]):
            attributes.append({"id": attr_id, "values": [{"value": "1"}]})
            return True

        if any(kw in attr_name for kw in ["длина", "长度"]):
            length_cm = max(int(round(float(dims['height']) / 10)), 1)
            if attr.get('dictionary_id'):
                matched = self._find_matching_value(attr_id, str(length_cm))
                if matched:
                    attributes.append({"id": attr_id, "values": [{"dictionary_value_id": matched.get("id")}]})
                    return True
            attributes.append({"id": attr_id, "values": [{"value": str(length_cm)}]})
            return True
        if any(kw in attr_name for kw in ["ширина", "宽度"]):
            attributes.append({"id": attr_id, "values": [{"value": str(int(dims['width']))}]})
            return True
        if any(kw in attr_name for kw in ["высота", "高度", "глубина", "厚度"]):
            attributes.append({"id": attr_id, "values": [{"value": str(int(dims['depth']))}]})
            return True

        if attr_type in ("integer", "decimal", "number"):
            return False

        return False

    def _parse_dimensions(self, dims_str: str) -> Dict[str, float]:
        """解析尺寸字符串"""
        result = {"width": 50.0, "height": 50.0, "depth": 20.0}
        if not dims_str:
            return result
        patterns = [
            r'(\d+(?:\.\d+)?)\s*[xX*хХ]\s*(\d+(?:\.\d+)?)\s*[xX*хХ]\s*(\d+(?:\.\d+)?)',
            r'(\d+(?:\.\d+)?)\s*[xX*хХ]\s*(\d+(?:\.\d+)?)',
        ]
        for pattern in patterns:
            match = re.search(pattern, str(dims_str))
            if match:
                groups = match.groups()
                if len(groups) >= 3:
                    result["width"] = float(groups[0])
                    result["height"] = float(groups[1])
                    result["depth"] = float(groups[2])
                elif len(groups) >= 2:
                    result["width"] = float(groups[0])
                    result["height"] = float(groups[0])
                    result["depth"] = float(groups[1])
                break
        return result

    def _parse_weight(self, weight_str: str) -> float:
        """解析重量"""
        if not weight_str:
            return 0.0
        match = re.search(r'[\d.]+', str(weight_str))
        if match:
            try:
                return float(match.group())
            except ValueError:
                pass
        return 0.0


def _extract_core_terms(keywords: str) -> list:
    """从中文关键词中提取核心品类词，用于本地索引搜索。
    策略: 去掉常见修饰词(硅胶/不锈钢/电动/便携等)，保留品类核心词。
    同时生成多种组合尝试匹配。
    """
    if not keywords:
        return []

    normalized = re.sub(r'[\s/|,，;；:_\-]+', '', str(keywords).strip())
    if not normalized:
        return []

                
    MODIFIERS = [
        "硅胶", "不锈钢", "电动", "便携", "迷你", "防水", "智能", "无线", "可折叠",
        "多功能", "大容量", "加厚", "升级", "新款", "创意", "可爱", "简约", "复古",
        "北欧", "日式", "韩式", "欧式", "儿童", "婴儿", "宠物", "汽车", "户外",
        "家用", "商用", "专业", "医用", "食品级", "高温", "耐热", "防滑", "抗菌",
        "发光", "LED", "USB", "充电", "太阳能", "自动", "手动", "电子", "数字",
    ]
    NOISE_WORDS = [
        "宝宝", "婴幼儿", "神器", "引导", "训练", "练习", "学爬", "抬头", "早教", "启蒙",
        "同款", "专用", "热卖", "爆款", "跨境", "外贸", "厂家", "工厂", "现货", "批发",
    ]
    CATEGORY_PATTERNS = [
        "爬行玩具", "益智玩具", "婴儿玩具", "宝宝玩具", "儿童玩具", "训练玩具",
        "音乐玩具", "毛绒玩具", "收纳盒", "置物架", "保温杯", "水杯", "餐具",
        "刷子", "烹饪刷", "油刷", "玩具", "玩偶", "灯", "鞋", "包", "桌", "椅",
    ]
          
    SUFFIXES = ["款", "型", "版", "装", "套", "组"]

    core = normalized
    for s in SUFFIXES:
        if core.endswith(s) and len(core) > len(s):
            core = core[:-len(s)]

    terms = [core]

    for pattern in CATEGORY_PATTERNS:
        if pattern in core:
            terms.append(pattern)

    if "爬行" in core and "玩具" in core:
        terms.append("爬行玩具")
    if "益智" in core and "玩具" in core:
        terms.append("益智玩具")
    if any(token in core for token in ["婴儿", "婴幼儿", "宝宝"]) and "玩具" in core:
        terms.append("婴儿玩具")

    stripped_core = core
    for noise in NOISE_WORDS:
        stripped_core = stripped_core.replace(noise, "")
    if stripped_core and stripped_core != core and len(stripped_core) >= 2:
        terms.append(stripped_core)

    for mod in MODIFIERS:
        if mod in core:
            stripped = core.replace(mod, "").strip()
            if stripped and len(stripped) >= 2:
                terms.append(stripped)

    for mod1 in MODIFIERS:
        for mod2 in MODIFIERS:
            combined = mod1 + mod2
            if combined in core:
                stripped = core.replace(combined, "").strip()
                if stripped and len(stripped) >= 2:
                    terms.append(stripped)

    CATEGORY_MAP = {
        "油刷": "烹饪刷", "刷子": "刷", "勺子": "勺", "铲子": "铲",
        "杯子": "杯", "盘子": "盘", "碗": "碗", "锅": "锅",
        "灯": "灯", "椅": "椅", "桌": "桌", "包": "包",
    }
    for k, v in CATEGORY_MAP.items():
        if k in core:
            mapped = core.replace(k, v)
            if mapped != core:
                terms.append(mapped)
            terms.append(v)

    if len(core) >= 8:
        short_terms = []
        if "玩具" in core:
            short_terms.append("玩具")
        if "刷" in core:
            short_terms.append("刷")
        if "杯" in core:
            short_terms.append("杯")
        if "包" in core:
            short_terms.append("包")
        if "灯" in core:
            short_terms.append("灯")
        terms.extend(short_terms)

    seen = set()
    unique = []
    for t in terms:
        if t and t not in seen:
            seen.add(t)
            unique.append(t)

    return unique


def _apply_keyword_category_boost(keyword: str, candidates: List[Dict]) -> List[Dict]:
    keyword = str(keyword or "").strip()
    if not keyword or not candidates:
        return candidates
    boosted_aliases = []
    for trigger, aliases in CATEGORY_KEYWORD_BOOSTS.items():
        if trigger in keyword:
            boosted_aliases.extend(aliases)
    if not boosted_aliases:
        return candidates

    def _boost_score(item: Dict) -> int:
        score = int(item.get("score", 0) or 0)
        haystack = " ".join([
            str(item.get("type_name", "") or ""),
            str(item.get("type_name_ru", "") or ""),
            str(item.get("name", "") or ""),
        ]).lower()
        for alias in boosted_aliases:
            alias_lower = str(alias).lower()
            if alias_lower and alias_lower in haystack:
                score += 500
        if keyword in str(item.get("type_name", "") or ""):
            score += 300
        return score

    ranked = []
    for item in candidates:
        clone = dict(item)
        clone["score"] = _boost_score(item)
        ranked.append(clone)
    ranked.sort(key=lambda x: x.get("score", 0), reverse=True)
    return ranked


def _apply_category_negative_guards(keyword: str, candidates: List[Dict]) -> List[Dict]:
    keyword = str(keyword or "").strip().lower()
    if not keyword or not candidates:
        return candidates

    ranked = []
    for item in candidates:
        clone = dict(item)
        score = int(clone.get("score", 0) or 0)
        haystack = " ".join([
            str(clone.get("type_name", "") or ""),
            str(clone.get("type_name_ru", "") or ""),
            str(clone.get("name", "") or ""),
        ]).lower()
        penalties = []
        for rule in CATEGORY_NEGATIVE_GUARDS:
            if any(term.lower() in keyword for term in rule["product_terms"]) and any(
                bad.lower() in haystack for bad in rule["forbidden_terms"]
            ):
                score -= int(rule.get("penalty", 0) or 0)
                penalties.append(",".join(rule["forbidden_terms"]))
        clone["score"] = score
        if penalties:
            clone["category_guard_conflict"] = True
            clone["category_guard_penalties"] = penalties
        ranked.append(clone)
    ranked.sort(key=lambda x: x.get("score", 0), reverse=True)
    return ranked


def _build_category_pool_from_tree(keywords: str, categories: List[Dict]) -> List[Dict]:
    matched = []
    expanded_keywords = [keywords]

    def search_tree(nodes, path="", parent_cat_id=""):
        for node in nodes:
            name = node.get("category_name", "")
            cat_id = node.get("description_category_id", "") or parent_cat_id
            children = node.get("children", [])
            type_id = node.get("type_id", "")
            type_name = node.get("type_name", "")

            if not children or (type_id and not node.get("disabled", False)):
                for kw in expanded_keywords:
                    kw_l = kw.lower()
                    if kw_l in name.lower() or (type_name and kw_l in type_name.lower()):
                        matched.append({
                            "description_category_id": cat_id,
                            "type_id": type_id,
                            "name": f"{path}/{name}" if path else name,
                            "type_name": type_name,
                        })
                    elif type_name and len(kw_l) >= 4:
                        type_l = type_name.lower()
                        for stem_len in [7, 6, 5, 4]:
                            if len(kw_l) >= stem_len and kw_l[:stem_len] in type_l:
                                matched.append({
                                    "description_category_id": cat_id,
                                    "type_id": type_id,
                                    "name": f"{path}/{name}" if path else name,
                                    "type_name": type_name,
                                })
                                break
                            if len(type_l) >= stem_len and type_l[:stem_len] in kw_l:
                                matched.append({
                                    "description_category_id": cat_id,
                                    "type_id": type_id,
                                    "name": f"{path}/{name}" if path else name,
                                    "type_name": type_name,
                                })
                                break

            if children:
                search_tree(children, f"{path}/{name}" if path else name, cat_id)

    search_tree(categories)
    return matched


def _score_category_text_fit(candidate: Dict, query_terms: List[str], raw_query: str) -> int:
    haystack = " ".join([
        str(candidate.get("type_name", "") or ""),
        str(candidate.get("type_name_ru", "") or ""),
        str(candidate.get("name", "") or ""),
    ]).lower()
    type_name = str(candidate.get("type_name", "") or "").lower()
    raw_query = str(raw_query or "").strip().lower()

    score = 0
    if raw_query:
        if type_name == raw_query:
            score += 300
        if raw_query in haystack:
            score += 180
    for term in query_terms:
        term_l = str(term or "").strip().lower()
        if not term_l:
            continue
        if type_name == term_l:
            score += 260
        elif term_l in type_name:
            score += 180 if len(term_l) >= 4 else 90
        elif term_l in haystack:
            score += 120 if len(term_l) >= 4 else 60
        elif type_name and len(term_l) >= 4 and type_name in term_l:
            score += 70
    return score


def _extract_material_terms(text: str) -> List[str]:
    raw = str(text or "")
    upper_raw = raw.upper()
    terms = []
    known_tokens = [
        "EVA", "PVC", "PU", "TPU", "TPE", "PE", "PP", "ABS",
        "硅胶", "塑胶", "塑料", "棉", "无纺布", "金属", "不锈钢", "木", "橡胶",
    ]
    for token in known_tokens:
        if token in raw or token in upper_raw:
            terms.append(token)
    return terms


def _build_category_context(keywords: str, product_info: Optional[Dict] = None) -> Dict:
    product_info = dict(product_info or {})
    visible_fields = product_info.get("visible_fields", [])
    if not isinstance(visible_fields, list):
        visible_fields = [visible_fields] if visible_fields else []

    text_parts = [
        keywords,
        product_info.get("title", ""),
        product_info.get("name", ""),
        product_info.get("product_name", ""),
        product_info.get("category_type", ""),
        product_info.get("type_name", ""),
        product_info.get("type_name_ru", ""),
        product_info.get("brand", ""),
        product_info.get("material", ""),
        " ".join(str(item) for item in visible_fields if item),
    ]
    combined_text = " ".join(str(part) for part in text_parts if part).strip()

    query_terms = []
    for seed in [keywords, combined_text]:
        query_terms.extend(_extract_core_terms(seed))
    query_terms.append(str(keywords or "").strip())
    query_terms.append(str(product_info.get("category_type", "") or "").strip())
    query_terms.append(str(product_info.get("type_name", "") or "").strip())

    normalized = []
    seen = set()
    for term in query_terms:
        term = str(term or "").strip()
        if not term:
            continue
        if term not in seen:
            seen.add(term)
            normalized.append(term)

    product_info["_resolver_text"] = combined_text
    product_info["_resolver_terms"] = normalized
    return product_info


def _attribute_query_hints(attr: Dict, context: Dict) -> List[str]:
    attr_name = str(attr.get("name", "") or "").lower()
    combined_text = str(context.get("_resolver_text", "") or "")
    query_terms = list(context.get("_resolver_terms", []) or [])
    hints = []

    def add_hint(value: str):
        value = str(value or "").strip()
        if len(value) >= 2 and value not in hints:
            hints.append(value)

    if any(mark in attr_name for mark in ["受众", "аудитор", "целевая аудитория", "возраст", "для детей", "дет"]):
        if any(token in combined_text for token in ["婴儿", "婴幼儿", "宝宝"]):
            add_hint("婴儿")
            add_hint("儿童")
        elif any(token in combined_text for token in ["儿童", "小孩", "益智玩具", "玩具", "дет"]):
            add_hint("儿童")
    elif any(mark in attr_name for mark in ["危险", "hazard", "опас"]):
        add_hint("不危险")
    elif any(mark in attr_name for mark in ["страна", "原产国", "происхожден"]):
        add_hint("中国")
        add_hint("Китай")
    elif any(mark in attr_name for mark in ["материал", "material", "材料", "材质"]):
        for material in _extract_material_terms(combined_text):
            add_hint(material)
    elif any(mark in attr_name for mark in ["бренд", "торговая марка", "品牌"]):
        add_hint(context.get("brand", ""))
    elif any(mark in attr_name for mark in ["тип", "type", "类别", "类目", "вид"]):
        for term in query_terms:
            add_hint(term)
    elif any(mark in attr_name for mark in ["цвет", "color", "颜色"]):
        add_hint(context.get("color", ""))
    else:
        for term in query_terms:
            add_hint(term)

    return hints[:5]


def _score_category_candidate(
    candidate: Dict,
    context: Dict,
    ozon_client_id: str,
    ozon_api_key: str,
) -> Optional[Dict]:
    description_category_id = int(candidate.get("description_category_id") or 0)
    type_id = int(candidate.get("type_id") or 0)
    if not description_category_id or not type_id:
        return None

    filler = UniversalAttributeFiller(
        description_category_id,
        type_id,
        ozon_client_id=ozon_client_id,
        ozon_api_key=ozon_api_key,
    )
    attrs = filler.get_category_attributes() or []
    if not attrs:
        return None

    required_attrs = [attr for attr in attrs if attr.get("is_required")]
    dictionary_required_attrs = [attr for attr in required_attrs if attr.get("dictionary_id")]

    query_terms = list(context.get("_resolver_terms", []) or [])
    raw_query = str(context.get("title", "") or context.get("name", "") or context.get("_resolver_text", "") or "")
    score = int(candidate.get("score", 0) or 0)
    score += _score_category_text_fit(candidate, query_terms, raw_query)

    matched_required = 0
    matched_dictionary_required = 0
    attempted_dictionary_required = 0

    for attr in required_attrs[:10]:
        hints = _attribute_query_hints(attr, context)
        if not hints:
            continue

        if attr.get("dictionary_id"):
            attempted_dictionary_required += 1
            matched = None
            for hint in hints[:3]:
                results = filler.search_dictionary_values(attr.get("id"), hint)
                if results:
                    matched = _pick_best_dictionary_candidate(hint, results) or results[0]
                if matched:
                    break
            if not matched and hints:
                all_values = filler.get_dictionary_values(attr.get("id"))
                for hint in hints[:2]:
                    matched = _pick_best_dictionary_candidate(hint, all_values)
                    if matched:
                        break
            if matched:
                matched_required += 1
                matched_dictionary_required += 1
                score += 220
            else:
                score -= 120
        else:
            matched_required += 1
            score += 80

    required_count = len(required_attrs)
    dictionary_required_count = len(dictionary_required_attrs)
    required_ratio = (matched_required / required_count) if required_count else 1.0
    dictionary_ratio = (matched_dictionary_required / dictionary_required_count) if dictionary_required_count else 1.0

    score += int(required_ratio * 260)
    score += int(dictionary_ratio * 220)
    score -= max(required_count - matched_required, 0) * 18
    score -= max(dictionary_required_count - matched_dictionary_required, 0) * 30

    scored = dict(candidate)
    scored["score"] = score
    scored["required_attribute_count"] = required_count
    scored["matched_required_attribute_count"] = matched_required
    scored["dictionary_required_count"] = dictionary_required_count
    scored["attempted_dictionary_required_count"] = attempted_dictionary_required
    scored["matched_dictionary_required_count"] = matched_dictionary_required
    scored["required_attribute_match_ratio"] = round(required_ratio, 4)
    scored["dictionary_required_match_ratio"] = round(dictionary_ratio, 4)
    scored["category_resolution_source"] = "official_tree_attribute_values"
    return scored


def _dedupe_category_candidates(candidates: List[Dict]) -> List[Dict]:
    seen = set()
    unique = []
    for item in candidates or []:
        key = f"{item.get('description_category_id', item.get('cat_id', ''))}_{item.get('type_id', '')}"
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def _collect_category_candidates(keywords: str, headers: Dict[str, str]) -> Tuple[List[Dict], List[Dict]]:
    supabase_results = []
    local_results = []
    tree_results = []

    try:
        from ozon_distributed_cache import load_category_mapping_from_supabase
        sb_mapping = load_category_mapping_from_supabase(keywords)
        if sb_mapping and sb_mapping.get("description_category_id") and sb_mapping.get("type_id"):
            supabase_results.append({
                "description_category_id": sb_mapping.get("description_category_id"),
                "type_id": sb_mapping.get("type_id"),
                "name": sb_mapping.get("category_path") or sb_mapping.get("category_name") or "",
                "type_name": sb_mapping.get("type_name") or "",
                "score": 260,
                "category_resolution_source": "supabase_mapping_cache",
            })
    except ImportError:
        pass
    except Exception as e:
        logger.debug(f"[CategoryCache] Supabase 类目映射读取失败: {e}")

    try:
        from ozon_category_cache import ensure_cache, search_category
        index = ensure_cache()
        if index:
            local_results = search_category(keywords, index=index, top_k=10)
            core_terms = _extract_core_terms(keywords)
            for term in core_terms:
                term_results = search_category(term, index=index, top_k=5)
                if term_results:
                    local_results.extend(term_results)
    except Exception as e:
        logger.debug(f"[CategoryCache] 本地索引不可用: {e}")

    categories = _fetch_category_tree(headers)
    if categories:
        tree_results = _build_category_pool_from_tree(keywords, categories)

    return supabase_results + local_results, tree_results


def resolve_category(
    keywords: str,
    ozon_client_id: str = None,
    ozon_api_key: str = None,
    product_info: Dict = None,
) -> List[Dict]:
    """解析 Ozon 类目：官方 tree + attribute + values/search 驱动评分。"""
    from http_client import requests as http_requests

    try:
        from config import get_config
        _config = get_config()
        ozon_client_id = ozon_client_id or _config.ozon_client_id
        ozon_api_key = ozon_api_key or _config.ozon_api_key
    except Exception:
        pass

    headers = {
        "Client-Id": str(ozon_client_id),
        "Api-Key": ozon_api_key,
        "Content-Type": "application/json"
    }

    context = _build_category_context(keywords, product_info=product_info)
    local_results, tree_results = _collect_category_candidates(keywords, headers)
    if local_results:
        logger.info(f"[CategoryCache] 本地索引命中 {len(local_results)} 个类目")
    if tree_results:
        logger.info(f"[CategoryAPI] 官方类目树命中 {len(tree_results)} 个候选")

    candidates = _dedupe_category_candidates(local_results + tree_results)
    if not candidates:
        return []

    candidates = _apply_keyword_category_boost(keywords, candidates)
    candidates = _apply_category_negative_guards(keywords, candidates)
    candidates.sort(key=lambda x: x.get("score", 0), reverse=True)

    scored_candidates = []
    for candidate in candidates[:6]:
        try:
            scored = _score_category_candidate(
                candidate,
                context=context,
                ozon_client_id=ozon_client_id,
                ozon_api_key=ozon_api_key,
            )
        except Exception as exc:
            logger.debug(f"[CategoryAPI] 官方评分失败: {candidate} err={exc}")
            scored = None
        if scored:
            scored_candidates.append(scored)

    ranked = scored_candidates or _validate_categories(candidates[:5], headers) or candidates[:5]
    ranked = _apply_category_negative_guards(keywords, ranked)
    ranked.sort(
        key=lambda item: (
            int(item.get("score", 0) or 0),
            float(item.get("required_attribute_match_ratio", 0.0) or 0.0),
            float(item.get("dictionary_required_match_ratio", 0.0) or 0.0),
        ),
        reverse=True,
    )
    result = ranked[:5]

    if result:
        _cache_category_mapping(keywords, result[0])
    return result


def _validate_categories(candidates, headers):
    """验证类目是否有属性（仅验证top 3，减少API调用）"""
    from http_client import requests as http_requests
    valid = []
    for m in candidates[:3]:
        try:
            r = http_requests.post("https://api-seller.ozon.ru/v1/description-category/attribute",
                headers=headers,
                json={"description_category_id": m["description_category_id"], "type_id": m["type_id"], "language": "ZH_HANS"},
                timeout=30)
            if r.ok and r.json().get("result"):
                valid.append(m)
        except Exception:
            pass
    return valid


def _cache_category_mapping(keywords: str, cat_result: dict):
    """静默回传类目映射到Supabase"""
    if not cat_result:
        return
    try:
        from ozon_distributed_cache import upload_category_mapping_to_supabase
        upload_category_mapping_to_supabase(
            product_keyword=keywords,
            desc_cat_id=cat_result.get("description_category_id", 0),
            type_id=cat_result.get("type_id", 0),
            category_name=cat_result.get("name", ""),
            type_name=cat_result.get("type_name", ""),
            category_path=cat_result.get("name", ""))
    except ImportError:
        pass
    except Exception as e:
        print(f"  [DistCache] Category mapping upload: {e}", file=sys.stderr)


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Ozon属性映射器 v6.0")
    parser.add_argument("--category-id", "-c", type=int, required=True)
    parser.add_argument("--type-id", "-t", type=int, required=True)
    parser.add_argument("--source-file", "-f", help="产品信息JSON文件")
    parser.add_argument("--output", "-o", help="输出文件路径")
    parser.add_argument("--list-attrs", "-l", action="store_true")
    
    args = parser.parse_args()
    
    filler = UniversalAttributeFiller(args.category_id, args.type_id)
    
    if args.list_attrs:
        attrs = filler.get_category_attributes()
        print(f"\n类目 {args.category_id}/{args.type_id} 共 {len(attrs)} 个属性:")
        for a in attrs:
            req = "必填" if a.get("is_required") else "可选"
            dict_id = a.get("dictionary_id", 0)
            dict_mark = f"[字典id={dict_id}]" if dict_id else ""
            print(f"  [{a.get('id')}] {a.get('name')} ({req}, type={a.get('type')}) {dict_mark}")
        return
    
    if args.source_file:
        with open(args.source_file, 'r', encoding='utf-8') as f:
            product_info = json.load(f)
    else:
        product_info = {"name": "тестовый товар", "material": "", "color": ""}
    
    result = filler.fill_attributes(product_info)
    
    output = {
        "attributes": result["attributes"],
        "description": result.get("description", ""),
        "skipped_required": result.get("skipped_required", [])
    }
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"结果已保存到 {args.output}")
    else:
        print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
