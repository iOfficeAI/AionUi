#!/usr/bin/env python3
"""
Rank stocks in a universe by factor scores.
"""

import argparse
import json
import sys
from datetime import datetime


def get_universe_symbols(universe: str) -> list[str]:
    """
    Get list of symbols for a given universe.

    TODO: Integrate with vnstock listing API.
    """
    universes = {
        "VN30": ["VCB", "VHM", "VIC", "HPG", "TCB", "VPB", "MBB", "ACB", "CTG", "GAS",
                 "MSN", "SAB", "VRE", "VNM", "BID", "PLX", "POW", "SSI", "MWG", "FPT",
                 "HDB", "TPB", "VJC", "STB", "PDR", "GVR", "VIB", "SHB", "NVL", "BCM"],
        "HOSE_TOP100": ["VCB", "VHM", "VIC", "HPG", "TCB"],  # Abbreviated for demo
        "ALL": ["VCB", "ACB", "TCB", "VPB", "MBB"]  # Abbreviated for demo
    }

    return universes.get(universe.upper(), [])


def calculate_universe_rankings(symbols: list[str]) -> list[dict]:
    """
    Calculate factor scores for all symbols and rank.

    TODO: Call calculate_factors.py for each symbol.
    """
    # Simulated rankings
    rankings = []
    for i, symbol in enumerate(symbols):
        rankings.append({
            "rank": i + 1,
            "symbol": symbol,
            "composite_score": 5.0 - (i * 0.3),
            "percentile": 90 - (i * 5),
            "value_zscore": 1.2 - (i * 0.2),
            "momentum_zscore": 1.5 - (i * 0.3),
            "quality_zscore": 1.0 - (i * 0.1),
            "growth_zscore": 0.8 - (i * 0.15),
            "volatility_zscore": -0.5 - (i * 0.1)
        })

    return rankings


def main():
    parser = argparse.ArgumentParser(
        description="Rank stocks in a universe by factor scores"
    )
    parser.add_argument("--universe", type=str, required=True,
                       choices=["VN30", "HOSE_TOP100", "ALL"],
                       help="Stock universe to analyze")
    parser.add_argument("--output", type=str,
                       help="Output JSON file path (optional)")

    args = parser.parse_args()

    # Get symbols
    symbols = get_universe_symbols(args.universe)

    # Calculate rankings
    rankings = calculate_universe_rankings(symbols)

    # Build output
    result = {
        "universe": args.universe.upper(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "count": len(rankings),
        "rankings": rankings,
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
