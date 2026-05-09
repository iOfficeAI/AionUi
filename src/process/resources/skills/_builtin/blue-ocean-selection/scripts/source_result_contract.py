def _is_truthy_url(value: str) -> bool:
    return isinstance(value, str) and value.startswith(("http://", "https://"))


def has_real_procurement_mapping(item: dict) -> bool:
    raw = dict(item or {})
    offer_id = str(raw.get("offer_id") or raw.get("offerId") or raw.get("id") or raw.get("num_iid") or "").strip()
    product_url = raw.get("product_url") or raw.get("detail_url") or raw.get("url") or raw.get("offer_url") or ""
    price = raw.get("price", raw.get("sale_price", raw.get("priceRange", raw.get("price_cny", 0))))
    try:
        price = float(price or 0)
    except (TypeError, ValueError):
        price = 0.0
    return bool(offer_id and _is_truthy_url(product_url) and price > 0)


def _normalize_source_item(item: dict, default_source: str = "") -> dict:
    raw = dict(item or {})
    source_name = raw.get("source", default_source or "unknown")
    offer_id = str(raw.get("offer_id") or raw.get("offerId") or "").strip()
    product_url = raw.get("product_url") or raw.get("detail_url") or raw.get("url") or ""
    image_url = raw.get("image_url") or raw.get("main_image_url") or raw.get("image") or ""

    price = raw.get("price", raw.get("sale_price", raw.get("priceRange", 0)))
    try:
        price = float(price or 0)
    except (TypeError, ValueError):
        price = 0.0

    is_llm_fallback = source_name == "llm_fallback"
    is_detail = source_name in {"1688_h5_detail", "1688_pc_detail", "1688_detail"}
    has_real_procurement_path = bool(offer_id and _is_truthy_url(product_url))
    has_real_mapping = has_real_procurement_mapping(raw)

    if is_llm_fallback:
        source_verified = False
        lane = "research-only"
        sellable_eligible = False
        source_type = "llm_fallback"
        procurement_feasible = False
    elif has_real_mapping:
        source_verified = True
        lane = "sellable"
        sellable_eligible = True
        source_type = "1688_detail" if is_detail else "1688_search"
        procurement_feasible = True
    else:
        source_verified = "partial"
        lane = "sellable"
        sellable_eligible = False
        source_type = "1688_search"
        procurement_feasible = has_real_procurement_path

    normalized = {
        **raw,
        "source": source_name,
        "source_type": source_type,
        "source_verified": source_verified,
        "procurement_feasible": procurement_feasible,
        "lane": lane,
        "sellable_eligible": sellable_eligible,
        "offer_id": offer_id,
        "title": raw.get("title") or raw.get("subject") or "",
        "price": price,
        "product_url": product_url,
        "image_url": image_url,
        "shop_name": raw.get("shop_name") or raw.get("company_name") or "",
        "sale_quantity": raw.get("sale_quantity", raw.get("saleNum", 0)),
    }

    procurement_link = normalized["product_url"] if procurement_feasible else ""
    normalized["procurement_link"] = procurement_link
    normalized["procurement_links"] = [procurement_link] if procurement_link else []
    normalized["verified_source"] = normalized["source_verified"] is True
    return normalized


def _merge_source_verified(items: list) -> object:
    if not items:
        return False
    if any(item.get("source_verified") is True for item in items):
        return True
    if any(item.get("source_verified") == "partial" for item in items):
        return "partial"
    return False


def _build_source_result(items: list, search_source: str, query: dict = None,
                         detail_mode: bool = False, error: str = "",
                         error_detail: dict = None) -> dict:
    normalized_items = [_normalize_source_item(item, search_source) for item in (items or [])]
    source_verified = _merge_source_verified(normalized_items)
    procurement_feasible = any(item.get("procurement_feasible") for item in normalized_items)
    sellable_eligible = any(item.get("sellable_eligible") for item in normalized_items)
    lane = "research-only" if normalized_items and all(
        item.get("lane") == "research-only" for item in normalized_items
    ) else "sellable"

    result = {
        "status": "success" if normalized_items else ("error" if error else "no_results"),
        "source": search_source or "none",
        "source_type": (
            "1688_detail" if detail_mode
            else ("llm_fallback" if search_source == "llm_fallback" else "1688_search")
        ),
        "lane": lane if normalized_items else "research-only",
        "source_verified": source_verified,
        "procurement_feasible": procurement_feasible,
        "sellable_eligible": sellable_eligible,
        "items": normalized_items,
        "count": len(normalized_items),
        "query": query or {},
        "errors": [error] if error else [],
    }
    if error:
        result["error"] = error
    if error_detail:
        result["error_detail"] = dict(error_detail)
    if query and "offer_id" in query:
        result["offer_id"] = str(query.get("offer_id") or "")

    result["products"] = result["items"]
    result["results"] = result["items"]
    result["sources"] = result["items"]
    result["primary_item"] = result["items"][0] if result["items"] else {}
    return result
