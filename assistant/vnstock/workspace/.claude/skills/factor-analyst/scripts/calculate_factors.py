#!/usr/bin/env python3
"""
Calculate quantitative investment factors for a Vietnamese stock.
"""

import argparse
import json
import sys
from datetime import datetime
from typing import Any


def calculate_value_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate value factors (P/E, P/B, EV/EBITDA).

    TODO: Integrate with vnstock API to fetch real data.
    """
    # Simulated data (replace with vnstock API calls)
    return {
        "pe_ratio": 12.5,
        "pb_ratio": 2.3,
        "ev_ebitda": 8.5,
        "z_score": 0.8  # vs universe
    }


def calculate_momentum_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate momentum factors (returns, RSI).

    TODO: Integrate with vnstock price data.
    """
    # Simulated data
    return {
        "return_12m": 25.5,
        "return_6m": 15.2,
        "rsi": 62.0,
        "z_score": 1.2
    }


def calculate_quality_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate quality factors (ROE, ROA, leverage).

    TODO: Integrate with vnstock financial statements.
    """
    # Simulated data
    return {
        "roe": 18.5,
        "roa": 1.2,
        "debt_equity": 6.5,
        "z_score": 1.5
    }


def calculate_growth_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate growth factors (revenue/EPS CAGR).

    TODO: Integrate with vnstock historical financials.
    """
    # Simulated data
    return {
        "revenue_cagr": 12.0,
        "eps_cagr": 15.0,
        "sales_growth_yoy": 14.0,
        "z_score": 0.9
    }


def calculate_volatility_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate volatility factors (std dev, beta, drawdown).

    TODO: Integrate with vnstock price data.
    """
    # Simulated data
    return {
        "std_dev": 18.5,
        "beta": 0.9,
        "max_drawdown": -15.0,
        "z_score": -0.5  # Lower volatility is better
    }


def calculate_composite_score(factors: dict) -> tuple[float, int]:
    """
    Calculate composite factor score and percentile rank.

    Simple equal-weighted average of z-scores.
    """
    z_scores = [
        factors["value"]["z_score"],
        factors["momentum"]["z_score"],
        factors["quality"]["z_score"],
        factors["growth"]["z_score"],
        -factors["volatility"]["z_score"]  # Invert (lower vol is better)
    ]

    composite = sum(z_scores) / len(z_scores)

    # Convert to percentile (assuming normal distribution)
    # Simple approximation: z-score 0 = 50th percentile, +1 = 84th, +2 = 98th
    percentile = int(50 + composite * 15)
    percentile = max(1, min(99, percentile))

    return composite, percentile


def main():
    parser = argparse.ArgumentParser(
        description="Calculate investment factors for a Vietnamese stock"
    )
    parser.add_argument("--symbol", type=str, required=True,
                       help="Stock symbol (e.g., VCB)")
    parser.add_argument("--output", type=str,
                       help="Output JSON file path (optional)")

    args = parser.parse_args()
    symbol = args.symbol.upper()

    # Calculate all factors
    factors = {
        "value": calculate_value_factors(symbol),
        "momentum": calculate_momentum_factors(symbol),
        "quality": calculate_quality_factors(symbol),
        "growth": calculate_growth_factors(symbol),
        "volatility": calculate_volatility_factors(symbol)
    }

    # Composite score
    composite_score, percentile = calculate_composite_score(factors)

    # Build output
    result = {
        "symbol": symbol,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "factors": factors,
        "composite_score": round(composite_score, 2),
        "percentile_rank": percentile,
        "note": "Simulated data - integrate with vnstock API for real calculations"
    }

    # Output
    output_json = json.dumps(result, indent=2)
    print(output_json)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)

    return 0


if __name__ == "__main__":
    sys.exit(main())
