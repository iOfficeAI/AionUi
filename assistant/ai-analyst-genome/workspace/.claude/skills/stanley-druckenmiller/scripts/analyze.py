#!/usr/bin/env python3
"""Stanley Druckenmiller style analysis - Macro and Momentum."""
import sys
import json

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics, get_market_cap, get_prices


def analyze_price_momentum(ticker: str, start_date: str, end_date: str) -> dict:
    """Druckenmiller follows price momentum."""
    try:
        prices = get_prices(ticker, start_date, end_date)
    except:
        return {"score": 0, "max_score": 5, "details": "Could not fetch price data"}

    if not prices or len(prices) < 20:
        return {"score": 0, "max_score": 5, "details": "Insufficient price data"}

    score = 0
    details = []

    # Calculate returns
    closes = [p.close for p in prices if hasattr(p, 'close') and p.close]
    if len(closes) < 20:
        return {"score": 0, "max_score": 5, "details": "Insufficient price data"}

    latest = closes[-1]
    month_ago = closes[-min(21, len(closes))]
    three_months = closes[-min(63, len(closes))]

    # 1-month momentum
    one_month_return = (latest - month_ago) / month_ago if month_ago > 0 else 0
    if one_month_return > 0.10:
        score += 2
        details.append(f"Strong 1M momentum (+{one_month_return:.1%})")
    elif one_month_return > 0.03:
        score += 1
        details.append(f"Positive 1M momentum (+{one_month_return:.1%})")
    elif one_month_return < -0.10:
        details.append(f"Weak 1M momentum ({one_month_return:.1%})")

    # 3-month momentum
    three_month_return = (latest - three_months) / three_months if three_months > 0 else 0
    if three_month_return > 0.20:
        score += 2
        details.append(f"Strong 3M momentum (+{three_month_return:.1%})")
    elif three_month_return > 0.08:
        score += 1
        details.append(f"Positive 3M momentum (+{three_month_return:.1%})")

    # Trend direction (simple moving average comparison)
    if len(closes) >= 50:
        sma_20 = sum(closes[-20:]) / 20
        sma_50 = sum(closes[-50:]) / 50
        if latest > sma_20 > sma_50:
            score += 1
            details.append("Price above rising moving averages - strong trend")

    return {"score": min(score, 5), "max_score": 5, "returns": {"1m": one_month_return, "3m": three_month_return},
            "details": "; ".join(details) if details else "Neutral momentum"}


def analyze_fundamental_momentum(metrics: list) -> dict:
    """Earnings and revenue momentum."""
    if not metrics or len(metrics) < 2:
        return {"score": 0, "max_score": 3, "details": "Insufficient data"}

    score = 0
    details = []

    # Revenue acceleration
    rev_growth = [m.revenue_growth for m in metrics if m.revenue_growth is not None]
    if len(rev_growth) >= 2:
        if rev_growth[0] > rev_growth[1]:
            score += 1
            details.append("Revenue growth accelerating")

    # Earnings momentum
    earn_growth = [m.earnings_growth for m in metrics if m.earnings_growth is not None]
    if len(earn_growth) >= 2:
        if earn_growth[0] > 0.15:
            score += 2
            details.append(f"Strong earnings growth ({earn_growth[0]:.1%})")
        elif earn_growth[0] > earn_growth[1] and earn_growth[0] > 0:
            score += 1
            details.append("Earnings growth improving")

    return {"score": min(score, 3), "max_score": 3, "details": "; ".join(details) if details else "No fundamental momentum"}


def analyze_market_position(metrics: list) -> dict:
    """Relative market positioning."""
    if not metrics:
        return {"score": 0, "max_score": 3, "details": "Insufficient data"}

    score = 0
    details = []
    latest = metrics[0]

    # Strong returns on capital (market leader indicator)
    if latest.return_on_equity and latest.return_on_equity > 0.20:
        score += 1
        details.append("High ROE suggests market leadership")

    # Growth premium (market sees opportunity)
    if latest.price_to_earnings_ratio and latest.earnings_growth:
        peg = latest.price_to_earnings_ratio / (latest.earnings_growth * 100) if latest.earnings_growth > 0 else None
        if peg and peg < 1.5 and latest.earnings_growth > 0.15:
            score += 2
            details.append("Reasonable PEG with strong growth - market opportunity")

    return {"score": min(score, 3), "max_score": 3, "details": "; ".join(details) if details else "No clear positioning"}


def analyze_risk_reward(metrics: list) -> dict:
    """Druckenmiller's risk management assessment."""
    if not metrics:
        return {"score": 0, "max_score": 4, "details": "Insufficient data"}

    score = 0
    details = []
    latest = metrics[0]

    # Balance sheet strength (staying power)
    if latest.current_ratio and latest.current_ratio > 1.5:
        score += 1
        details.append("Strong liquidity for downside protection")

    if latest.debt_to_equity and latest.debt_to_equity < 0.5:
        score += 1
        details.append("Low leverage reduces risk")

    # Positive cash generation
    if latest.free_cash_flow_per_share and latest.free_cash_flow_per_share > 0:
        score += 1
        details.append("Positive FCF - self-funding growth")

    # Margin stability
    if len(metrics) >= 3:
        margins = [m.operating_margin for m in metrics if m.operating_margin is not None]
        if len(margins) >= 2 and margins[0] >= margins[-1]:
            score += 1
            details.append("Stable/expanding margins")

    return {"score": score, "max_score": 4, "details": "; ".join(details) if details else "Risk concerns"}


def generate_signal(analysis_data: dict) -> dict:
    """Generate Druckenmiller-style momentum signal."""
    momentum = analysis_data["momentum"]["score"]
    fundamental = analysis_data["fundamental"]["score"]
    position = analysis_data["position"]["score"]
    risk = analysis_data["risk"]["score"]

    total = momentum + fundamental + position + risk
    max_total = 15

    score_pct = total / max_total

    # Druckenmiller prioritizes momentum
    has_momentum = momentum >= 3
    has_fundamentals = fundamental >= 2

    if score_pct >= 0.60 and has_momentum:
        signal = "bullish"
        confidence = min(85, int(score_pct * 100))
    elif score_pct <= 0.35 or momentum <= 1:
        signal = "bearish"
        confidence = min(75, int((1 - score_pct) * 100))
    else:
        signal = "neutral"
        confidence = 50

    return {"signal": signal, "confidence": confidence, "score": total, "max_score": max_total}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE")
        print("Example: analyze.py NVDA 2024-12-01")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]

    # Calculate start date for price data (6 months back)
    from datetime import datetime, timedelta
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    start_dt = end_dt - timedelta(days=180)
    start_date = start_dt.strftime("%Y-%m-%d")

    metrics = get_financial_metrics(ticker, end_date, "ttm", 10)
    market_cap = get_market_cap(ticker, end_date)

    momentum = analyze_price_momentum(ticker, start_date, end_date)
    fundamental = analyze_fundamental_momentum(metrics)
    position = analyze_market_position(metrics)
    risk = analyze_risk_reward(metrics)

    analysis_data = {
        "momentum": momentum,
        "fundamental": fundamental,
        "position": position,
        "risk": risk,
    }

    signal_data = generate_signal(analysis_data)

    result = {
        "ticker": ticker,
        "signal": signal_data["signal"],
        "confidence": signal_data["confidence"],
        "score": signal_data["score"],
        "max_score": signal_data["max_score"],
        "price_momentum": momentum,
        "fundamental_momentum": fundamental,
        "market_position": position,
        "risk_reward": risk,
        "market_cap": market_cap,
    }

    print(json.dumps(result, indent=2, default=str))
