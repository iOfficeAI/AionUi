---
name: blue-ocean-selection
description: Execute the verified real Ozon workflow only: credential-check -> source -> image -> listing -> return-result. Use when the user wants real 1688 sourcing, profit-gated image generation, category/attribute completion, or real Ozon listing submission. Never fabricate products, sources, prices, URLs, or listing attributes.
dependency:
  python:
    - requests==2.32.5
    - Pillow==12.2.0
    - cos-python-sdk-v5==1.9.42
    - httpx[http2]==0.28.1
    - playwright==1.59.0
    - supabase==2.15.3
---

# Blue Ocean Selection

Use this skill only for the verified real business workflow.

## Fixed workflow

Always execute in this order:

```text
credential-check -> source -> image -> listing -> return-result
```

Do not reorder steps.
Do not skip formal-chain steps.
Do not fake completion.

## Allowed work

1. Verify credentials, runtime health, and platform readiness.
2. Run 1688 AK-first real source search.
3. Use H5 / PC / CDP only for detail verification and truth enhancement.
4. Run profit and fulfillment checks before image generation.
5. Generate anchored listing images.
6. Resolve Ozon category, type, attributes, and dictionary values.
7. Submit real Ozon listings.
8. Return real procurement evidence.

## Forbidden work

1. Do not let LLM invent or choose source products.
2. Do not fabricate 1688 price, URL, offer_id, image, supplier, or stock.
3. Do not use LLM fallback as a formal source for listing submission.
4. Do not continue if source evidence is incomplete.
5. Do not move the profit gate after image generation.
6. Do not submit raw 1688 images or temporary image URLs to Ozon.
7. Do not blindly guess category attributes.
8. Do not auto-set inventory unless the user explicitly asks.

## LLM boundary

LLM may be used only for:

1. product opportunity analysis
2. image analysis / visual description extraction
3. image prompt generation

LLM may not be used for:

1. source selection
2. source evidence generation
3. listing attribute blind fill
4. dictionary value fabrication

## Step 1 - credential-check

Verify these first:

1. Ozon Seller API
2. mxou API key
3. 1688 AK

Optional but important for detail verification:

4. 1688 Cookie / storage_state
5. shared browser runtime / CDP

Rules:

1. 1688 AK is the main source credential.
2. Cookie is not the main source credential.
3. If AK is missing, block the real source chain.
4. If Windows Playwright browser crashes, prefer CDP runtime recovery.

Useful commands:

```bash
python3 scripts/setup_1688_auth.py --runtime-status
python3 scripts/setup_1688_auth.py --ensure-browser-runtime
python3 scripts/setup_1688_auth.py --doctor-offer-id 795462506104
python3 scripts/setup_1688_auth.py --refresh-via-cdp --timeout 180 --health-offer-id 795462506104
```

## Step 2 - source

Use AK-first real sourcing.

Rules:

1. Mainline is 1688 AK text search or AK image search.
2. H5 / PC / CDP are verification paths, not the main search path.
3. Minimum usable source evidence is:
   - real image
   - real price
   - real URL or offer_id
4. If any of the three is missing, stop the formal chain.
5. If detail verification fails, block formal submission rather than degrading to invented or partial candidates.

Special diagnosis:

If AK search returns `FAIL_SYS_UNAUTHORIZED_ENTRANCE`, interpret it as:

1. webpage browsing may still work
2. current credential does not have 1688 search API permission

Do not misdiagnose this as a generic cookie failure.

Useful commands:

```bash
python3 scripts/source_1688_search.py --keywords "鞋垫" --sell-price 150 --cost 35 --weight 50
python3 scripts/source_1688_search.py --image-url https://example.com/source.jpg --sell-price 150 --weight 50
```

## Step 3 - profit gate

Run profit and fulfillment checks immediately after source succeeds.

Rules:

1. Profit gate happens before image generation.
2. If user target profit is not met, stop.
3. Formal chain may continue only if:
   - `profit_pass == true`
   - `fulfillment_pass == true`
4. `--smoke-bypass-profit-gate` is allowed only for real end-to-end smoke.
5. Smoke bypass may skip only the profit block, not truth or quality gates.

## Step 4 - image

Image generation is mandatory for the formal listing chain.

Required image set:

1. `white_bg`
2. `main`
3. `usp`
4. `detail`
5. `trust`
6. `scene2`

Anchor rules:

1. `white_bg` must use the real source image as anchor.
2. `main/usp/detail/trust/scene2` must use `white_bg` as anchor.
3. Every generated image must have a real upstream reference anchor.
4. No anchor means no formal submission.

COS rules:

1. Default COS is mandatory.
2. Submit only COS-hosted final URLs to Ozon.

Formal chain may continue only if:

1. all 6 images exist
2. `white_bg.reference_mode == source_image_anchor`
3. `main/usp/detail/trust/scene2.reference_mode == white_bg_anchor`
4. `vision_verified == true`

## Step 5 - listing

Use Ozon official APIs and verified category knowledge.

Primary API references:

1. Category tree: https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/DescriptionCategoryAPI_GetTree
2. Category attributes: https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/DescriptionCategoryAPI_GetAttributes
3. Attribute values: https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/DescriptionCategoryAPI_GetAttributeValues
4. Attribute value search: https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/DescriptionCategoryAPI_SearchAttributeValues
5. Product import: https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/ProductAPI_ImportProducts
6. Product attribute readback: https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/ProductAPI_GetProductInfoAttributesV4
7. Product content rating: https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/ProductAPI_GetProductRatingBySku

Supporting Ozon references:

1. API intro: https://docs.ozon.ru/global/zh-hans/api/intro/
2. Multicurrency: https://docs.ozon.ru/global/en/accounting/receiving-payments/multicurrency/
3. Indexing errors: https://docs.ozon.ru/global/en/analytics/fulfillment-reports/indexing-errors/

Rules:

1. Prefer `language=ZH_HANS` when supported.
2. Use cache path:
   `memory -> Supabase -> local cache -> Ozon API -> async write-back Supabase`
3. Official Ozon API is the final authority.
4. Do not blindly guess category attributes.
5. Do not submit if required attributes are missing.
6. Treat content rating and indexing visibility as post-submit quality checks, not substitutes for pre-submit completeness.

Formal submission may continue only if:

1. `description_category_id` exists
2. `type_id` exists
3. required attributes are complete
4. `quality_gate_pass == true`
5. `completeness_score >= 70`

Fallback order for category / attribute resolution:

1. in-memory result
2. Supabase shared knowledge
3. local cache
4. official Ozon API
5. async write-back after verified resolution

If category selection is ambiguous:

1. inspect the official tree first
2. prefer leaf categories only
3. fetch attributes for the candidate type
4. reject categories whose required attributes conflict with the actual product
5. do not let LLM “pick the closest one” without API-backed evidence

If listing quality is weak after submit:

1. read back product attributes
2. query product content rating by SKU
3. inspect missing media / missing attributes / weak groups
4. patch attributes or media with official payloads
5. re-check rating

## Step 6 - return-result

Return all of the following:

1. listing status
2. offer_id
3. product_id / task_id when available
4. source table
5. procurement links
6. procurement evidence summary
7. inventory warning if inventory is still unset

Always make it clear whether the chain was blocked and at which gate it was blocked.

## Multi-SKU rule

For multi-size / multi-color / multi-variant products:

1. use shared model binding through attribute `9048`
2. variants must belong to one real product family
3. only size / color / aspect differences may vary
4. do not fake variant grouping

## Cross-platform rule

Support:

1. macOS
2. Linux
3. Windows

If Playwright visible browser crashes on Windows:

1. do not abandon the chain immediately
2. prefer shared browser runtime and CDP recovery
3. keep AK-first sourcing unchanged

## Failure handling

If a step fails, handle it in this order:

1. identify the failing gate
2. identify whether the issue is credential, data, runtime, or platform related
3. try the supported fallback for that gate only
4. do not silently downgrade into a weaker business contract
5. if the formal chain is no longer valid, stop and report the exact repair action

Common fallback examples:

1. AK search unauthorized -> repair AK, do not switch to fabricated sourcing
2. detail verification blocked -> use shared browser runtime / CDP recovery
3. Windows visible browser crash -> prefer `--ensure-browser-runtime` and `--refresh-via-cdp`
4. category ambiguity -> query official tree and attribute APIs
5. weak content score -> query rating-by-sku and patch missing groups

## Primary files

1. `README.md`
2. `soul.md`
3. `scripts/pipeline.py`
4. `scripts/source_1688_search.py`
5. `scripts/setup_1688_auth.py`
6. `scripts/generate_images.py`
7. `scripts/attribute_mapper.py`
8. `scripts/ozon_listing.py`

## Final rule

If the request cannot satisfy the real-chain contract, do not fake completion.

Stop, report the failing gate, and give the exact next repair action.
