#!/usr/bin/env python3
"""
Calculate quantitative investment factors for a Vietnamese stock.
Uses vnstock_lib for real data (no CLI overhead).
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from typing import Any
import numpy as np

# Add workspace root to path
sys.path.insert(0, '.')

# Import vnstock_lib module
import importlib.util
import os

# Get absolute path to vnstock_lib.py
vnstock_lib_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    'vnstock-data',
    'vnstock_lib.py'
)

spec = importlib.util.spec_from_file_location("vnstock_lib", vnstock_lib_path)
vnstock_lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vnstock_lib)

# Import functions
fetch_quote = vnstock_lib.fetch_quote
fetch_ratios = vnstock_lib.fetch_ratios
fetch_income_statement = vnstock_lib.fetch_income_statement
list_symbols = vnstock_lib.list_symbols


def calculate_value_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate value factors (P/E, P/B, P/S) using real vnstock data.
    """
    try:
        ratios = fetch_ratios(symbol, period='annual')

        # Extract metrics from vnstock data structure
        # vnstock returns columns: ['item', 'item_id', '2025-Q4', '2025-Q3', ...]
        pe_ratio = None
        pb_ratio = None
        ps_ratio = None

        if 'item' in ratios.columns:
            # Get latest quarter column (first quarter column after item columns)
            value_cols = [col for col in ratios.columns if col not in ['item', 'item_id']]
            if value_cols:
                latest_col = value_cols[0]  # Most recent quarter

                # Find P/E ratio
                pe_rows = ratios[ratios['item'].str.contains('P/E', case=False, na=False)]
                if not pe_rows.empty:
                    pe_ratio = float(pe_rows[latest_col].iloc[0])

                # Find P/B ratio
                pb_rows = ratios[ratios['item'].str.contains('P/B', case=False, na=False)]
                if not pb_rows.empty:
                    pb_ratio = float(pb_rows[latest_col].iloc[0])

                # Find P/S ratio (if available)
                ps_rows = ratios[ratios['item'].str.contains('P/S', case=False, na=False)]
                if not ps_rows.empty:
                    ps_ratio = float(ps_rows[latest_col].iloc[0])

        # Calculate z-score (placeholder - needs cross-sectional data)
        z_score = 0.0  # Will be calculated by rank_universe.py

        return {
            "pe_ratio": pe_ratio,
            "pb_ratio": pb_ratio,
            "ps_ratio": ps_ratio,
            "z_score": z_score,
            "data_source": "vnstock"
        }
    except Exception as e:
        return {
            "pe_ratio": None,
            "pb_ratio": None,
            "ps_ratio": None,
            "z_score": 0.0,
            "error": str(e),
            "data_source": "vnstock"
        }


def calculate_momentum_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate momentum factors (12M/6M returns, RSI) using real price data.
    """
    try:
        # Fetch 1 year of price data
        end = datetime.now()
        start = end - timedelta(days=365)

        prices = fetch_quote(
            symbol,
            start=start.strftime('%Y-%m-%d'),
            end=end.strftime('%Y-%m-%d'),
            interval='1D'
        )

        if prices.empty:
            raise ValueError(f"No price data for {symbol}")

        closes = prices['close'].values

        # Calculate returns
        return_12m = (closes[-1] / closes[0] - 1) * 100 if len(closes) > 252 else None
        return_6m = (closes[-1] / closes[-126] - 1) * 100 if len(closes) > 126 else None

        # Calculate RSI (14-day)
        rsi = calculate_rsi(closes, period=14)

        return {
            "return_12m": return_12m,
            "return_6m": return_6m,
            "rsi": rsi,
            "z_score": 0.0,  # Will be calculated by rank_universe.py
            "data_source": "vnstock"
        }
    except Exception as e:
        return {
            "return_12m": None,
            "return_6m": None,
            "rsi": None,
            "z_score": 0.0,
            "error": str(e),
            "data_source": "vnstock"
        }


def calculate_rsi(prices: np.ndarray, period: int = 14) -> float:
    """Calculate Relative Strength Index."""
    if len(prices) < period + 1:
        return None

    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.mean(gains[-period:])
    avg_loss = np.mean(losses[-period:])

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return round(rsi, 2)


def calculate_quality_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate quality factors (ROE, ROA, leverage) using real financial data.
    """
    try:
        ratios = fetch_ratios(symbol, period='annual')

        roe = None
        roa = None
        debt_equity = None

        if 'item' in ratios.columns:
            # Get latest quarter column
            value_cols = [col for col in ratios.columns if col not in ['item', 'item_id']]
            if value_cols:
                latest_col = value_cols[0]

                # Find ROE
                roe_rows = ratios[ratios['item'].str.contains('ROE', case=False, na=False)]
                if not roe_rows.empty:
                    roe = float(roe_rows[latest_col].iloc[0])

                # Find ROA
                roa_rows = ratios[ratios['item'].str.contains('ROA', case=False, na=False)]
                if not roa_rows.empty:
                    roa = float(roa_rows[latest_col].iloc[0])

                # Find Debt/Equity
                de_rows = ratios[ratios['item'].str.contains('Debt.*Equity|D/E|Nợ', case=False, na=False)]
                if not de_rows.empty:
                    debt_equity = float(de_rows[latest_col].iloc[0])

        return {
            "roe": roe,
            "roa": roa,
            "debt_equity": debt_equity,
            "z_score": 0.0,  # Will be calculated by rank_universe.py
            "data_source": "vnstock"
        }
    except Exception as e:
        return {
            "roe": None,
            "roa": None,
            "debt_equity": None,
            "z_score": 0.0,
            "error": str(e),
            "data_source": "vnstock"
        }


def calculate_growth_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate growth factors (revenue/EPS growth) using real financial data.
    """
    try:
        # Fetch quarterly data for growth calculation
        income_q = fetch_income_statement(symbol, period='quarterly')

        revenue_growth_yoy = None
        revenue_cagr = None

        if 'item' in income_q.columns:
            # Find revenue rows
            revenue_rows = income_q[income_q['item'].str.contains('Revenue|Sales|Doanh thu', case=False, na=False)]

            if not revenue_rows.empty:
                # Get quarter columns
                value_cols = [col for col in income_q.columns if col not in ['item', 'item_id']]

                if len(value_cols) >= 5:  # Need at least 5 quarters for YoY
                    # Extract revenue values from quarters
                    revenues = revenue_rows[value_cols].values[0]
                    # YoY growth (Q0 vs Q4)
                    if len(revenues) > 4:
                        revenue_growth_yoy = ((revenues[0] / revenues[4]) - 1) * 100

                    # CAGR over available data
                    if len(revenues) > 1:
                        n_periods = len(revenues) - 1
                        revenue_cagr = ((revenues[0] / revenues[-1]) ** (4 / n_periods) - 1) * 100

        return {
            "revenue_cagr": revenue_cagr,
            "revenue_growth_yoy": revenue_growth_yoy,
            "eps_cagr": None,  # TODO: Calculate EPS CAGR
            "z_score": 0.0,  # Will be calculated by rank_universe.py
            "data_source": "vnstock"
        }
    except Exception as e:
        return {
            "revenue_cagr": None,
            "revenue_growth_yoy": None,
            "eps_cagr": None,
            "z_score": 0.0,
            "error": str(e),
            "data_source": "vnstock"
        }


def calculate_volatility_factors(symbol: str) -> dict[str, Any]:
    """
    Calculate volatility factors (std dev, max drawdown) using real price data.
    """
    try:
        # Fetch 1 year of price data
        end = datetime.now()
        start = end - timedelta(days=365)

        prices = fetch_quote(
            symbol,
            start=start.strftime('%Y-%m-%d'),
            end=end.strftime('%Y-%m-%d'),
            interval='1D'
        )

        if prices.empty:
            raise ValueError(f"No price data for {symbol}")

        closes = prices['close'].values
        returns = np.diff(closes) / closes[:-1]

        # Annualized std dev
        std_dev = np.std(returns) * np.sqrt(252) * 100

        # Max drawdown
        cumulative = np.maximum.accumulate(closes)
        drawdowns = (closes - cumulative) / cumulative
        max_drawdown = np.min(drawdowns) * 100

        return {
            "std_dev": round(std_dev, 2),
            "beta": None,  # TODO: Calculate vs market index
            "max_drawdown": round(max_drawdown, 2),
            "z_score": 0.0,  # Will be calculated by rank_universe.py
            "data_source": "vnstock"
        }
    except Exception as e:
        return {
            "std_dev": None,
            "beta": None,
            "max_drawdown": None,
            "z_score": 0.0,
            "error": str(e),
            "data_source": "vnstock"
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
