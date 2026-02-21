#!/usr/bin/env python3
"""
Classify Vietnam's macroeconomic regime based on GDP, credit, and inflation.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Literal

# Regime types
Regime = Literal["EXPANSION", "SLOWDOWN", "RECESSION", "RECOVERY"]

# Thresholds (calibrated for Vietnam economy)
GDP_HIGH = 6.5
GDP_LOW = 5.0
CREDIT_HIGH = 12.0
CREDIT_LOW = 8.0
INFLATION_HIGH = 5.0
INFLATION_VERY_HIGH = 7.0


def classify_regime(gdp: float, credit: float, inflation: float) -> tuple[Regime, float]:
    """
    Classify regime based on macroeconomic indicators.

    Returns:
        (regime, confidence) tuple
    """
    score = 0
    confidence = 0.0

    # Expansion signals
    expansion_score = 0
    if gdp > GDP_HIGH:
        expansion_score += 3
    if credit > CREDIT_HIGH:
        expansion_score += 3
    if inflation < INFLATION_HIGH:
        expansion_score += 2

    # Slowdown signals
    slowdown_score = 0
    if GDP_LOW < gdp <= GDP_HIGH:
        slowdown_score += 2
    if credit < CREDIT_HIGH:
        slowdown_score += 2
    if inflation > INFLATION_HIGH:
        slowdown_score += 3

    # Recession signals
    recession_score = 0
    if gdp < GDP_LOW:
        recession_score += 4
    if credit < CREDIT_LOW:
        recession_score += 3
    if inflation > INFLATION_VERY_HIGH:
        recession_score += 2

    # Recovery signals (improving from low base)
    recovery_score = 0
    if GDP_LOW <= gdp <= GDP_HIGH and credit > 10:
        recovery_score += 3
    if inflation < INFLATION_HIGH and gdp < GDP_HIGH:
        recovery_score += 2

    # Determine regime
    scores = {
        "EXPANSION": expansion_score,
        "SLOWDOWN": slowdown_score,
        "RECESSION": recession_score,
        "RECOVERY": recovery_score
    }

    regime = max(scores, key=scores.get)
    max_score = scores[regime]
    total_score = sum(scores.values())

    confidence = max_score / total_score if total_score > 0 else 0.5

    return regime, confidence


def get_favored_sectors(regime: Regime) -> list[str]:
    """Map regime to favored sectors."""
    sector_map = {
        "EXPANSION": ["BANKS", "REAL_ESTATE", "INDUSTRIALS", "CONSUMER_DISCRETIONARY"],
        "SLOWDOWN": ["CONSUMER_STAPLES", "UTILITIES", "HEALTHCARE", "TELECOM"],
        "RECESSION": ["GOLD", "CONSUMER_STAPLES", "UTILITIES"],
        "RECOVERY": ["FINANCIALS", "CONSUMER_DISCRETIONARY", "TECHNOLOGY", "INDUSTRIALS"]
    }
    return sector_map.get(regime, [])


def get_favored_factors(regime: Regime) -> list[str]:
    """Map regime to favored investment factors."""
    factor_map = {
        "EXPANSION": ["MOMENTUM", "GROWTH", "BETA"],
        "SLOWDOWN": ["QUALITY", "VALUE", "DIVIDEND_YIELD"],
        "RECESSION": ["QUALITY", "LOW_VOLATILITY", "VALUE"],
        "RECOVERY": ["VALUE", "MOMENTUM", "SMALL_CAP"]
    }
    return factor_map.get(regime, [])


def classify_regime_dict(gdp_growth: float, credit_growth: float, inflation: float) -> dict:
    """
    Main function for regime classification - can be imported by other modules.

    Args:
        gdp_growth: GDP growth rate (%)
        credit_growth: Credit growth rate (%)
        inflation: Inflation rate (%)

    Returns:
        Dict with regime classification and metadata
    """
    regime, confidence = classify_regime(gdp_growth, credit_growth, inflation)

    result = {
        "regime": regime,
        "confidence": round(confidence * 100),  # Convert to percentage
        "indicators": {
            "gdp_growth": gdp_growth,
            "credit_growth": credit_growth,
            "inflation": inflation
        },
        "favored_sectors": get_favored_sectors(regime),
        "favored_factors": get_favored_factors(regime),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

    return result


def auto_classify() -> dict:
    """Auto-classify regime using GSO and SBV data fetchers.

    Pulls the latest macro data from the enhanced fetchers
    (user config → market proxy → defaults) and classifies.
    """
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    if _script_dir not in sys.path:
        sys.path.insert(0, _script_dir)

    from fetch_gso_data import fetch_gso_data
    from fetch_sbv_data import fetch_sbv_data

    gso = fetch_gso_data()
    sbv = fetch_sbv_data()

    gdp = gso.get('gdp_growth', {}).get('current', 6.5)
    credit = sbv.get('credit_growth', {}).get('current', 12.0)
    inflation = gso.get('inflation', {}).get('cpi_yoy', 4.0)

    result = classify_regime_dict(gdp, credit, inflation)
    result['data_sources'] = {
        'gso': gso.get('data_source', 'unknown'),
        'sbv': sbv.get('data_source', 'unknown'),
    }

    # Include market proxy if available
    if 'market_proxy' in gso:
        result['market_proxy'] = gso['market_proxy']
    if 'banking_proxy' in sbv:
        result['banking_proxy'] = sbv['banking_proxy']

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Classify Vietnam's macroeconomic regime"
    )
    parser.add_argument("--gdp", type=float, default=None,
                       help="GDP growth rate (%%) — if omitted, auto-fetched")
    parser.add_argument("--credit", type=float, default=None,
                       help="Credit growth rate (%%) — if omitted, auto-fetched")
    parser.add_argument("--inflation", type=float, default=None,
                       help="Inflation rate (%%) — if omitted, auto-fetched")
    parser.add_argument("--auto", action="store_true",
                       help="Auto-fetch all indicators from data sources")
    parser.add_argument("--output", type=str,
                       help="Output JSON file path (optional)")

    args = parser.parse_args()

    if args.auto or (args.gdp is None and args.credit is None and args.inflation is None):
        result = auto_classify()
    else:
        gdp = args.gdp if args.gdp is not None else 6.5
        credit = args.credit if args.credit is not None else 12.0
        inflation = args.inflation if args.inflation is not None else 4.0

        regime, confidence = classify_regime(gdp, credit, inflation)

        result = {
            "regime": regime,
            "confidence": round(confidence, 2),
            "indicators": {
                "gdp_growth": gdp,
                "credit_growth": credit,
                "inflation": inflation
            },
            "favored_sectors": get_favored_sectors(regime),
            "favored_factors": get_favored_factors(regime),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    output_json = json.dumps(result, indent=2)
    print(output_json)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)

    return 0


if __name__ == "__main__":
    sys.exit(main())
