#!/usr/bin/env python3
"""
Calculate correlation matrix between factors to check independence.
"""

import argparse
import json
import sys
from datetime import datetime


def calculate_factor_correlation(symbols: list[str]) -> dict:
    """
    Calculate correlation between factors across a set of stocks.

    TODO: Integrate with real factor calculations.
    """
    # Simulated correlation matrix
    # Ideally, factors should be uncorrelated (values near 0)
    correlation_matrix = {
        "value": {
            "value": 1.0,
            "momentum": -0.15,
            "quality": 0.25,
            "growth": -0.10,
            "volatility": 0.05
        },
        "momentum": {
            "value": -0.15,
            "momentum": 1.0,
            "quality": 0.30,
            "growth": 0.45,
            "volatility": 0.55
        },
        "quality": {
            "value": 0.25,
            "momentum": 0.30,
            "quality": 1.0,
            "growth": 0.35,
            "volatility": -0.20
        },
        "growth": {
            "value": -0.10,
            "momentum": 0.45,
            "quality": 0.35,
            "growth": 1.0,
            "volatility": 0.40
        },
        "volatility": {
            "value": 0.05,
            "momentum": 0.55,
            "quality": -0.20,
            "growth": 0.40,
            "volatility": 1.0
        }
    }

    return correlation_matrix


def main():
    parser = argparse.ArgumentParser(
        description="Calculate factor correlation matrix"
    )
    parser.add_argument("--symbols", type=str, required=True,
                       help="Comma-separated stock symbols (e.g., VCB,ACB,TCB)")
    parser.add_argument("--output", type=str,
                       help="Output JSON file path (optional)")

    args = parser.parse_args()
    symbols = [s.strip().upper() for s in args.symbols.split(",")]

    # Calculate correlation
    correlation = calculate_factor_correlation(symbols)

    # Build output
    result = {
        "symbols": symbols,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "correlation_matrix": correlation,
        "note": "Simulated data - integrate with real factor calculations",
        "interpretation": {
            "high_correlation": "Values > 0.5 indicate factors are not independent",
            "low_correlation": "Values < 0.3 indicate good factor independence",
            "negative_correlation": "Negative values can indicate diversification benefit"
        }
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
