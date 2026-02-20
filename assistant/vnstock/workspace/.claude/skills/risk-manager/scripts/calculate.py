#!/usr/bin/env python3
"""Risk management and position sizing calculations."""
import sys
import json
import math

sys.path.insert(0, '.')

from src.tools.api import get_prices


def calculate_volatility(ticker: str, start_date: str, end_date: str) -> dict:
    """Calculate volatility metrics for position sizing."""
    try:
        prices = get_prices(ticker, start_date, end_date)
    except:
        return {
            "daily_volatility": 0.025,
            "annualized_volatility": 0.40,
            "current_price": None,
            "details": "Using default high volatility (no price data)"
        }

    if not prices or len(prices) < 20:
        return {
            "daily_volatility": 0.025,
            "annualized_volatility": 0.40,
            "current_price": None,
            "details": "Insufficient price data"
        }

    closes = [p.close for p in prices if hasattr(p, 'close') and p.close]

    if len(closes) < 20:
        return {
            "daily_volatility": 0.025,
            "annualized_volatility": 0.40,
            "current_price": closes[-1] if closes else None,
            "details": "Insufficient data for volatility"
        }

    # Calculate returns
    returns = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]

    # Daily volatility (std of returns)
    mean_return = sum(returns) / len(returns)
    variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
    daily_vol = math.sqrt(variance)

    # Annualized
    annual_vol = daily_vol * math.sqrt(252)

    return {
        "daily_volatility": round(daily_vol, 4),
        "annualized_volatility": round(annual_vol, 4),
        "current_price": closes[-1],
        "data_points": len(returns),
        "details": f"Annualized volatility: {annual_vol:.1%}"
    }


def calculate_position_limit(volatility: float, portfolio_value: float) -> dict:
    """Calculate volatility-adjusted position limit."""
    # Base allocation: 20%
    base_limit = 0.20

    # Volatility adjustment
    if volatility < 0.15:
        # Low volatility - allow higher allocation
        vol_multiplier = 1.25
    elif volatility < 0.30:
        # Medium volatility - scale down
        vol_multiplier = 1.0 - (volatility - 0.15) * 2
    elif volatility < 0.50:
        # High volatility - reduce significantly
        vol_multiplier = 0.70 - (volatility - 0.30) * 1.5
    else:
        # Very high volatility - minimum allocation
        vol_multiplier = 0.50

    # Bounds: 5% to 25%
    vol_multiplier = max(0.25, min(1.25, vol_multiplier))

    adjusted_limit_pct = base_limit * vol_multiplier
    position_limit = portfolio_value * adjusted_limit_pct

    return {
        "base_limit_pct": base_limit,
        "volatility_multiplier": round(vol_multiplier, 2),
        "adjusted_limit_pct": round(adjusted_limit_pct, 3),
        "position_limit_dollars": round(position_limit, 2),
        "details": f"Max position: ${position_limit:,.0f} ({adjusted_limit_pct:.1%} of portfolio)"
    }


def calculate_risk_metrics(ticker: str, start_date: str, end_date: str, portfolio_value: float) -> dict:
    """Full risk analysis for a ticker."""
    # Get volatility
    vol_data = calculate_volatility(ticker, start_date, end_date)

    # Calculate position limits
    annual_vol = vol_data["annualized_volatility"]
    position_data = calculate_position_limit(annual_vol, portfolio_value)

    # Risk warnings
    warnings = []
    if annual_vol > 0.50:
        warnings.append("Very high volatility - reduce position size")
    if annual_vol > 0.35:
        warnings.append("High volatility stock - consider smaller position")

    current_price = vol_data["current_price"]
    max_shares = 0
    if current_price and current_price > 0:
        max_shares = int(position_data["position_limit_dollars"] // current_price)

    return {
        "ticker": ticker,
        "volatility": vol_data,
        "position_limit": position_data,
        "max_shares": max_shares,
        "current_price": current_price,
        "warnings": warnings if warnings else ["No risk warnings"],
        "risk_level": "high" if annual_vol > 0.35 else "medium" if annual_vol > 0.20 else "low"
    }


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: calculate.py TICKER START_DATE END_DATE PORTFOLIO_VALUE")
        print("Example: calculate.py AAPL 2024-06-01 2024-12-01 100000")
        sys.exit(1)

    ticker = sys.argv[1]
    start_date = sys.argv[2]
    end_date = sys.argv[3]
    portfolio_value = float(sys.argv[4])

    result = calculate_risk_metrics(ticker, start_date, end_date, portfolio_value)

    print(json.dumps(result, indent=2, default=str))
