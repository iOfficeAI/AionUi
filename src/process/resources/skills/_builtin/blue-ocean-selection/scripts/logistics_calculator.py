#!/usr/bin/env python3
"""
Ozon rFBS物流与利润计算器 v2
============================
基于Ozon官方rFBS(远程FBS)模式，支持RETS/OYX/GUOO三家承运商。

核心修正:
- rFBS模式下物流费为重量一口价(中国→俄罗斯全程)，无头程/尾程拆分
- 物流费按Ozon货件分组×配送速度×交货方式查表
- 利润校验标准: 实际利润率 >= 目标利润率(非仅profit>0)
- 定价公式需迭代求解(分组依赖售价)

完整成本核算公式:
售价(CNY) = (采购成本 + 物流费 + 包装费) / (1 - 佣金率) / (1 - 汇率预留) / (1 - 目标利润率)

其中:
- 采购成本: 1688货源价(CNY)
- 物流费: 承运商×分组×速度×交货方式查表(CNY)，计费=首重+重量×续重/克
- 包装费: 默认3元/单
- 佣金率: 按Ozon类目和价格阶梯(rFBS比FBP高1%)
- 汇率波动预留: 5%-8%(默认6%)
- 目标利润率: 35%-50%(默认40%)
"""

import argparse
import json
import math
import os
import sys

# ============================================================
# 汇率
# ============================================================
RUB_TO_CNY = 0.082  # 1 RUB ≈ 0.082 CNY

# ============================================================
# Ozon货件分组 (官方6组)
# ============================================================
OZON_SHIPPING_GROUPS = {
    "extra_small":    {"weight_min_g": 1,     "weight_max_g": 500,   "price_min_rub": 1,      "price_max_rub": 1500,    "label": "Extra Small"},
    "budget":         {"weight_min_g": 501,   "weight_max_g": 25000, "price_min_rub": 1,      "price_max_rub": 1500,    "label": "Budget"},
    "small":          {"weight_min_g": 1,     "weight_max_g": 2000,  "price_min_rub": 1501,   "price_max_rub": 7000,    "label": "Small"},
    "big":            {"weight_min_g": 2001,  "weight_max_g": 25000, "price_min_rub": 1501,   "price_max_rub": 7000,    "label": "Big"},
    "premium_small":  {"weight_min_g": 1,     "weight_max_g": 5000,  "price_min_rub": 7001,   "price_max_rub": 250000,  "label": "Premium Small"},
    "premium_big":    {"weight_min_g": 5001,  "weight_max_g": 25000, "price_min_rub": 7001,   "price_max_rub": 250000,  "label": "Premium Big"},
}

# ============================================================
# rFBS类目佣金费率表 (2025年最新，rFBS比FBP高1%)
# 格式: (价格上限RUB, 佣金率)
# ============================================================
RFBS_COMMISSION_RATES = {
    "电子产品配件":   [(1500, 0.12), (999999, 0.20)],
    "服装配饰":       [(1500, 0.12), (999999, 0.205)],
    "家居用品":       [(1500, 0.12), (999999, 0.18)],
    "美容保健":       [(1500, 0.10), (999999, 0.15)],
    "汽车用品":       [(999999, 0.08)],
    "儿童用品":       [(1500, 0.05), (999999, 0.15)],
    "成人用品":       [(999999, 0.15)],
    "图书":           [(999999, 0.15)],
    "存储卡":         [(999999, 0.05)],
    "手机配件":       [(1500, 0.12), (999999, 0.20)],
    "内衣袜类":       [(1500, 0.12), (5000, 0.14), (999999, 0.225)],
    "鞋类":           [(1500, 0.12), (999999, 0.18)],
    "鞋类配件":       [(1500, 0.12), (999999, 0.18)],
    "default":        [(1500, 0.12), (999999, 0.17)],
}

# ============================================================
# rFBS物流费率表 — 三大承运商完整数据
# 格式: {承运商: {分组: {速度: {交货方式: (首重CNY, 续重CNY/克)}}}}
# 数据来源: Ozon官方 docs.ozon.ru (2025年5月)
# ============================================================
RFBS_LOGISTICS_RATES = {
    "RETS": {
        "extra_small": {
            "express":  {"pickup": (2.72, 0.0373), "courier": None},
            "standard": {"pickup": (2.80, 0.0256), "courier": None},
            "economy":  {"pickup": (2.83, 0.022),  "courier": None},
        },
        "budget": {
            "express":  {"pickup": (17.0, 0.0317), "courier": None},
            "standard": {"pickup": (16.35, 0.0239), "courier": None},
            "economy":  {"pickup": (21.58, 0.0158), "courier": None},
        },
        "small": {
            "express":  {"pickup": (14.9, 0.03994), "courier": (18.4, 0.03994)},
            "standard": {"pickup": (14.0, 0.02698), "courier": (17.5, 0.02698)},
            "economy":  {"pickup": (16.0, 0.019), "courier": (19.5, 0.019)},
        },
        "big": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (16.0, 0.025), "courier": (19.5, 0.025)},
            "economy":  {"pickup": (22.0, 0.017), "courier": (25.5, 0.017)},
        },
        "premium_small": {
            "express":  {"pickup": (16.0, 0.045), "courier": (19.5, 0.045)},
            "standard": {"pickup": (17.0, 0.028), "courier": (20.5, 0.028)},
            "economy":  {"pickup": None, "courier": None},
        },
        "premium_big": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (22.0, 0.025), "courier": (25.5, 0.025)},
            "economy":  {"pickup": (28.0, 0.017), "courier": (31.5, 0.017)},
        },
    },
    "OYX": {
        "extra_small": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (2.90, 0.0268), "courier": None},
            "economy":  {"pickup": (2.90, 0.0248), "courier": None},
        },
        "budget": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (17.0, 0.0248), "courier": None},
            "economy":  {"pickup": None, "courier": None},
        },
        "small": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (14.0, 0.027), "courier": (17.5, 0.027)},
            "economy":  {"pickup": (16.0, 0.021), "courier": (19.5, 0.021)},
        },
        "big": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (17.0, 0.025), "courier": (20.5, 0.025)},
            "economy":  {"pickup": None, "courier": None},
        },
        "premium_small": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (17.0, 0.028), "courier": (20.5, 0.028)},
            "economy":  {"pickup": None, "courier": None},
        },
        "premium_big": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": None, "courier": None},
            "economy":  {"pickup": None, "courier": None},
        },
    },
    "GUOO": {
        "extra_small": {
            "express":  {"pickup": (3.0, 0.045), "courier": None},
            "standard": {"pickup": (3.0, 0.035), "courier": None},
            "economy":  {"pickup": (3.0, 0.025), "courier": None},
        },
        "budget": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": (23.0, 0.025), "courier": None},
            "economy":  {"pickup": (23.0, 0.017), "courier": None},
        },
        "small": {
            "express":  {"pickup": (16.0, 0.045), "courier": (19.5, 0.045)},
            "standard": {"pickup": (16.0, 0.035), "courier": (19.5, 0.035)},
            "economy":  {"pickup": None, "courier": None},
        },
        "big": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": None, "courier": None},
            "economy":  {"pickup": None, "courier": None},
        },
        "premium_small": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": None, "courier": None},
            "economy":  {"pickup": None, "courier": None},
        },
        "premium_big": {
            "express":  {"pickup": None, "courier": None},
            "standard": {"pickup": None, "courier": None},
            "economy":  {"pickup": None, "courier": None},
        },
    },
}

# 默认包装费(CNY)
DEFAULT_PACKAGING_FEE_CNY = 3.0

# 默认汇率波动预留比例
DEFAULT_EXCHANGE_RATE_BUFFER = 0.06  # 6%

# 默认目标利润率
DEFAULT_TARGET_PROFIT_RATE = 0.40  # 40%

# 体积重量系数
VOLUMETRIC_DIVISOR = 5000

# 默认承运商/速度/交货方式
DEFAULT_PROVIDER = "RETS"
DEFAULT_SPEED = "standard"
DEFAULT_DELIVERY_TYPE = "pickup"


def determine_shipping_group(weight_g, price_rub):
    """根据重量(g)和价格(RUB)判定Ozon官方货件分组"""
    for group_key, group in OZON_SHIPPING_GROUPS.items():
        if (weight_g >= group["weight_min_g"] and
            weight_g <= group["weight_max_g"] and
            price_rub >= group["price_min_rub"] and
            price_rub <= group["price_max_rub"]):
            return group_key, group["label"]
    # 兜底: 按重量和价格找最接近的
    if price_rub > 7000:
        return ("premium_small" if weight_g <= 5000 else "premium_big"), \
               ("Premium Small" if weight_g <= 5000 else "Premium Big")
    if price_rub <= 1500:
        return ("extra_small" if weight_g <= 500 else "budget"), \
               ("Extra Small" if weight_g <= 500 else "Budget")
    return ("small" if weight_g <= 2000 else "big"), \
           ("Small" if weight_g <= 2000 else "Big")


def get_commission_rate(category, price_rub):
    """获取rFBS类目佣金费率"""
    rates = RFBS_COMMISSION_RATES.get(category, RFBS_COMMISSION_RATES["default"])
    for price_cap, rate in rates:
        if price_rub <= price_cap:
            return rate
    return rates[-1][1]


def calculate_logistics_cost(weight_kg, price_rub,
                             provider=DEFAULT_PROVIDER,
                             speed=DEFAULT_SPEED,
                             delivery_type=DEFAULT_DELIVERY_TYPE,
                             length_cm=None, width_cm=None, height_cm=None):
    """
    计算rFBS物流费用(CNY) — 承运商×分组×速度×交货方式

    Args:
        weight_kg: 商品物理重量(kg)
        price_rub: 商品售价(卢布) — 影响货件分组判定
        provider: 承运商 RETS/OYX/GUOO
        speed: 配送速度 express/standard/economy
        delivery_type: 交货方式 pickup/courier
        length_cm/width_cm/height_cm: 包装尺寸(cm)，用于体积重计算

    Returns:
        dict: 物流费明细
    """
    # 体积重计算
    volumetric_weight_kg = 0
    if length_cm and width_cm and height_cm:
        volumetric_weight_kg = (length_cm * width_cm * height_cm) / VOLUMETRIC_DIVISOR

    billing_weight_kg = max(weight_kg, volumetric_weight_kg)
    billing_weight_g = math.ceil(billing_weight_kg * 1000)

    # 确定货件分组
    group_key, group_label = determine_shipping_group(billing_weight_g, price_rub)

    # 查费率表
    provider_rates = RFBS_LOGISTICS_RATES.get(provider, RFBS_LOGISTICS_RATES[DEFAULT_PROVIDER])

    # 尝试获取费率，如果当前分组无数据则回退
    group_rates = provider_rates.get(group_key, {})

    # 尝试指定速度，回退到standard
    speed_rates = group_rates.get(speed)
    if not speed_rates:
        speed_rates = group_rates.get("standard")
        actual_speed = "standard"
    else:
        actual_speed = speed

    # 尝试指定交货方式，回退到pickup
    rate = speed_rates.get(delivery_type) if speed_rates else None
    if rate is None:
        rate = speed_rates.get("pickup") if speed_rates else None
        actual_delivery = "pickup"
    else:
        actual_delivery = delivery_type

    # 如果仍无费率，回退到RETS Standard Pickup
    if rate is None:
        fallback_group = "small" if billing_weight_g <= 2000 else "big"
        rate = RFBS_LOGISTICS_RATES["RETS"][fallback_group]["standard"]["pickup"]
        provider = "RETS"
        actual_speed = "standard"
        actual_delivery = "pickup"
        group_key = fallback_group
        group_label = OZON_SHIPPING_GROUPS[fallback_group]["label"]

    base_fee, per_gram_rate = rate
    shipping_cost = base_fee + per_gram_rate * billing_weight_g

    return {
        "provider": provider,
        "speed": actual_speed,
        "delivery_type": actual_delivery,
        "actual_weight_kg": weight_kg,
        "volumetric_weight_kg": round(volumetric_weight_kg, 3),
        "billing_weight_kg": round(billing_weight_kg, 3),
        "billing_weight_g": billing_weight_g,
        "shipping_group": group_key,
        "shipping_group_label": group_label,
        "base_fee_cny": base_fee,
        "per_gram_rate_cny": per_gram_rate,
        "shipping_cost_cny": round(shipping_cost, 2),
    }


def calculate_sell_price(cost_cny, weight_kg, category="default",
                         packaging_fee_cny=DEFAULT_PACKAGING_FEE_CNY,
                         exchange_rate_buffer=DEFAULT_EXCHANGE_RATE_BUFFER,
                         target_profit_rate=DEFAULT_TARGET_PROFIT_RATE,
                         provider=DEFAULT_PROVIDER,
                         speed=DEFAULT_SPEED,
                         delivery_type=DEFAULT_DELIVERY_TYPE,
                         length_cm=None, width_cm=None, height_cm=None):
    """
    反算建议售价(CNY) — 基于完整成本核算公式(迭代求解)

    公式:
    售价 = (采购成本 + 物流费 + 包装费) / (1 - 佣金率) / (1 - 汇率预留) / (1 - 目标利润率)

    迭代逻辑:
    1. 先用默认佣金率估算售价
    2. 用估算售价确定货件分组→查物流费→重算售价
    3. 用售价查佣金率→重算售价
    4. 重复直到收敛(通常2-3次)
    """
    # 初始佣金率(用最高档保守估计)
    commission_rate = RFBS_COMMISSION_RATES.get(category, RFBS_COMMISSION_RATES["default"])[-1][1]
    sell_price_cny = None
    logistics_result = None
    total_base_cost = 0

    for iteration in range(5):  # 最多5次迭代
        # 预估售价(RUB)用于查分组和佣金率
        if sell_price_cny is None:
            # 首次: 用采购成本粗估
            est_sell_rub = round(cost_cny * 3 / RUB_TO_CNY) if cost_cny > 0 else 3000
        else:
            est_sell_rub = round(sell_price_cny / RUB_TO_CNY)

        # 物流费(分组依赖售价)
        logistics_result = calculate_logistics_cost(
            weight_kg, est_sell_rub,
            provider=provider, speed=speed, delivery_type=delivery_type,
            length_cm=length_cm, width_cm=width_cm, height_cm=height_cm
        )
        logistics_cost_cny = logistics_result["shipping_cost_cny"]

        # 基础成本 = 采购 + 物流 + 包装
        total_base_cost = cost_cny + logistics_cost_cny + packaging_fee_cny

        # 查佣金率(依赖售价)
        new_commission_rate = get_commission_rate(category, est_sell_rub)

        # 计算售价
        new_sell_price = total_base_cost / (1 - new_commission_rate) / (1 - exchange_rate_buffer) / (1 - target_profit_rate)

        # 检查收敛(0.5元内)
        if sell_price_cny and abs(new_sell_price - sell_price_cny) < 0.5:
            sell_price_cny = round(new_sell_price, 2)
            commission_rate = new_commission_rate
            break

        sell_price_cny = round(new_sell_price, 2)
        commission_rate = new_commission_rate

    # 最终计算
    sell_price_rub = round(sell_price_cny / RUB_TO_CNY)
    commission_cny = round(sell_price_cny * commission_rate, 2)
    profit_cny = round(sell_price_cny - total_base_cost - commission_cny, 2)
    profit_rate = round(profit_cny / sell_price_cny * 100, 2) if sell_price_cny > 0 else 0

    # 利润校验: 实际利润率 >= 目标利润率
    meets_target = profit_rate >= target_profit_rate * 100

    return {
        "mode": "rFBS",
        "provider": logistics_result["provider"] if logistics_result else provider,
        "speed": logistics_result["speed"] if logistics_result else speed,
        "delivery_type": logistics_result["delivery_type"] if logistics_result else delivery_type,
        "sell_price_cny": sell_price_cny,
        "sell_price_rub": sell_price_rub,
        "cost_cny": cost_cny,
        "category": category,
        "weight_kg": weight_kg,
        "packaging_fee_cny": packaging_fee_cny,
        "exchange_rate_buffer": exchange_rate_buffer,
        "target_profit_rate": target_profit_rate,
        # 费用明细
        "logistics": logistics_result,
        "logistics_cost_cny": logistics_result["shipping_cost_cny"] if logistics_result else 0,
        "commission_rate": commission_rate,
        "commission_cny": commission_cny,
        "shipping_group": logistics_result["shipping_group"] if logistics_result else "unknown",
        "shipping_group_label": logistics_result["shipping_group_label"] if logistics_result else "Unknown",
        # 成本汇总
        "total_base_cost_cny": round(total_base_cost, 2),
        "total_cost_with_commission_cny": round(total_base_cost + commission_cny, 2),
        # 利润
        "profit_cny": profit_cny,
        "profit_rate": profit_rate,
        "target_profit_rate_pct": target_profit_rate * 100,
        "is_profitable": profit_cny > 0,
        "meets_profit_target": meets_target,
        "rub_to_cny": RUB_TO_CNY,
    }


def calculate_profit(sell_price_cny, cost_cny, weight_kg, category="default",
                     packaging_fee_cny=DEFAULT_PACKAGING_FEE_CNY,
                     provider=DEFAULT_PROVIDER,
                     speed=DEFAULT_SPEED,
                     delivery_type=DEFAULT_DELIVERY_TYPE,
                     target_profit_rate=DEFAULT_TARGET_PROFIT_RATE,
                     exchange_rate_buffer=DEFAULT_EXCHANGE_RATE_BUFFER,
                     length_cm=None, width_cm=None, height_cm=None,
                     sell_price_rub=None):
    """
    正算利润 — 给定售价,计算实际利润(用于验证)
    """
    if not sell_price_rub:
        sell_price_rub = round(sell_price_cny / RUB_TO_CNY)

    # 1. Ozon销售佣金
    commission_rate = get_commission_rate(category, sell_price_rub)
    commission_cny = round(sell_price_cny * commission_rate, 2)

    # 2. 物流费
    logistics_result = calculate_logistics_cost(
        weight_kg, sell_price_rub,
        provider=provider, speed=speed, delivery_type=delivery_type,
        length_cm=length_cm, width_cm=width_cm, height_cm=height_cm
    )
    logistics_cost_cny = logistics_result["shipping_cost_cny"]

    # 3. 利润计算
    total_cost = cost_cny + commission_cny + logistics_cost_cny + packaging_fee_cny
    profit_cny = round(sell_price_cny - total_cost, 2)
    profit_rate = round(profit_cny / sell_price_cny * 100, 2) if sell_price_cny > 0 else 0

    # 利润校验
    meets_target = profit_rate >= target_profit_rate * 100

    return {
        "mode": "rFBS",
        "provider": provider,
        "speed": speed,
        "delivery_type": delivery_type,
        "sell_price_cny": sell_price_cny,
        "sell_price_rub": sell_price_rub,
        "cost_cny": cost_cny,
        "category": category,
        "weight_kg": weight_kg,
        "packaging_fee_cny": packaging_fee_cny,
        "shipping_group": logistics_result["shipping_group"],
        "shipping_group_label": logistics_result["shipping_group_label"],
        "commission_rate": commission_rate,
        "commission_cny": commission_cny,
        "logistics": logistics_result,
        "logistics_cost_cny": logistics_cost_cny,
        "total_cost_cny": round(total_cost, 2),
        "profit_cny": profit_cny,
        "profit_rate": profit_rate,
        "target_profit_rate_pct": target_profit_rate * 100,
        "is_profitable": profit_cny > 0,
        "meets_profit_target": meets_target,
        "rub_to_cny": RUB_TO_CNY,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ozon rFBS物流与利润计算器 v2")
    sub = parser.add_subparsers(dest="command")

    # 反算售价
    price_cmd = sub.add_parser("price", help="反算建议售价")
    price_cmd.add_argument("--cost", type=float, required=True, help="1688采购成本(CNY)")
    price_cmd.add_argument("--weight", type=float, required=True, help="商品重量(kg)")
    price_cmd.add_argument("--category", default="default", help="Ozon类目")
    price_cmd.add_argument("--provider", default="RETS", choices=["RETS", "OYX", "GUOO"], help="物流承运商(默认RETS)")
    price_cmd.add_argument("--speed", default="standard", choices=["express", "standard", "economy"], help="配送速度(默认standard)")
    price_cmd.add_argument("--delivery", default="pickup", choices=["pickup", "courier"], help="交货方式(默认pickup)")
    price_cmd.add_argument("--packaging", type=float, default=3.0, help="包装费(CNY,默认3)")
    price_cmd.add_argument("--exchange-buffer", type=float, default=0.06, help="汇率预留(0.05-0.08,默认0.06)")
    price_cmd.add_argument("--profit-rate", type=float, default=0.40, help="目标利润率(0.35-0.50,默认0.40)")
    price_cmd.add_argument("--length", type=float, help="包装长度(cm)")
    price_cmd.add_argument("--width", type=float, help="包装宽度(cm)")
    price_cmd.add_argument("--height", type=float, help="包装高度(cm)")

    # 正算利润
    profit_cmd = sub.add_parser("profit", help="正算实际利润")
    profit_cmd.add_argument("--sell-price", type=float, required=True, help="Ozon售价(CNY)")
    profit_cmd.add_argument("--cost", type=float, required=True, help="1688采购成本(CNY)")
    profit_cmd.add_argument("--weight", type=float, required=True, help="商品重量(kg)")
    profit_cmd.add_argument("--category", default="default", help="Ozon类目")
    profit_cmd.add_argument("--provider", default="RETS", choices=["RETS", "OYX", "GUOO"], help="物流承运商")
    profit_cmd.add_argument("--speed", default="standard", choices=["express", "standard", "economy"], help="配送速度")
    profit_cmd.add_argument("--delivery", default="pickup", choices=["pickup", "courier"], help="交货方式")
    profit_cmd.add_argument("--packaging", type=float, default=3.0, help="包装费(CNY,默认3)")
    profit_cmd.add_argument("--profit-rate", type=float, default=0.40, help="目标利润率(默认0.40)")
    profit_cmd.add_argument("--exchange-buffer", type=float, default=0.06, help="汇率预留(默认0.06)")

    # 查看费率表
    rates_cmd = sub.add_parser("rates", help="查看物流费率表")
    rates_cmd.add_argument("--provider", default=None, choices=["RETS", "OYX", "GUOO"], help="筛选承运商")
    rates_cmd.add_argument("--group", default=None, help="筛选分组")

    args = parser.parse_args()

    if args.command == "price":
        result = calculate_sell_price(
            cost_cny=args.cost,
            weight_kg=args.weight,
            category=args.category,
            packaging_fee_cny=args.packaging,
            exchange_rate_buffer=args.exchange_buffer,
            target_profit_rate=args.profit_rate,
            provider=args.provider,
            speed=args.speed,
            delivery_type=args.delivery,
            length_cm=args.length,
            width_cm=args.width,
            height_cm=args.height,
        )
    elif args.command == "profit":
        result = calculate_profit(
            sell_price_cny=args.sell_price,
            cost_cny=args.cost,
            weight_kg=args.weight,
            category=args.category,
            packaging_fee_cny=args.packaging,
            provider=args.provider,
            speed=args.speed,
            delivery_type=args.delivery,
            target_profit_rate=args.profit_rate,
            exchange_rate_buffer=args.exchange_buffer,
        )
    elif args.command == "rates":
        result = {"note": "Ozon rFBS物流费率表", "providers": {}}
        for prov, groups in RFBS_LOGISTICS_RATES.items():
            if args.provider and prov != args.provider:
                continue
            result["providers"][prov] = {}
            for grp, speeds in groups.items():
                if args.group and grp != args.group:
                    continue
                result["providers"][prov][grp] = {}
                for spd, del_types in speeds.items():
                    for dt, rate in del_types.items():
                        if rate:
                            result["providers"][prov][grp][f"{spd}_{dt}"] = {
                                "base_cny": rate[0],
                                "per_gram_cny": rate[1],
                                "example_200g": round(rate[0] + 200 * rate[1], 2),
                            }
    else:
        parser.print_help()
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False, indent=2))
