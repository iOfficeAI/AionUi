#!/usr/bin/env python3
"""Cathie Wood style analysis - Disruptive Innovation focus."""
import sys
import json

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics, get_market_cap, search_line_items


def analyze_growth_trajectory(metrics: list) -> dict:
    """Assess high-growth trajectory - Wood's primary focus."""
    if not metrics:
        return {"score": 0, "max_score": 5, "details": "Insufficient data"}

    score = 0
    details = []

    # Revenue growth velocity
    rev_growth = [m.revenue_growth for m in metrics if m.revenue_growth is not None]
    if rev_growth:
        latest_growth = rev_growth[0]
        if latest_growth > 0.40:
            score += 3
            details.append(f"Exceptional revenue growth ({latest_growth:.1%}) - disruptor pace")
        elif latest_growth > 0.25:
            score += 2
            details.append(f"Strong revenue growth ({latest_growth:.1%})")
        elif latest_growth > 0.15:
            score += 1
            details.append(f"Moderate growth ({latest_growth:.1%})")

    # Growth acceleration
    if len(rev_growth) >= 3:
        if rev_growth[0] > rev_growth[1] > rev_growth[2]:
            score += 2
            details.append("Growth is accelerating - bullish sign for innovation")
        elif rev_growth[0] > (sum(rev_growth[1:]) / len(rev_growth[1:])):
            score += 1
            details.append("Recent growth above historical average")

    return {"score": min(score, 5), "max_score": 5, "details": "; ".join(details) if details else "Limited data"}


def analyze_innovation_investment(line_items: list, metrics: list) -> dict:
    """Assess investment in innovation (R&D, capex)."""
    if not metrics:
        return {"score": 0, "max_score": 3, "details": "Insufficient data"}

    score = 0
    details = []

    # Gross margin as innovation proxy (tech companies have high GM)
    latest = metrics[0]
    if latest.gross_margin:
        if latest.gross_margin > 0.60:
            score += 2
            details.append(f"High gross margin ({latest.gross_margin:.1%}) - tech/innovation profile")
        elif latest.gross_margin > 0.40:
            score += 1
            details.append(f"Decent gross margin ({latest.gross_margin:.1%})")

    # Capex investment (growth investment)
    if line_items:
        latest_li = line_items[0]
        if hasattr(latest_li, 'capital_expenditure') and hasattr(latest_li, 'revenue'):
            if latest_li.capital_expenditure and latest_li.revenue:
                capex_ratio = abs(latest_li.capital_expenditure) / latest_li.revenue
                if capex_ratio > 0.10:
                    score += 1
                    details.append("Significant capex investment - building for growth")

    return {"score": min(score, 3), "max_score": 3, "details": "; ".join(details) if details else "Limited data"}


def analyze_market_potential(metrics: list) -> dict:
    """Assess total addressable market expansion potential."""
    if not metrics or len(metrics) < 2:
        return {"score": 0, "max_score": 4, "details": "Insufficient data"}

    score = 0
    details = []

    # Revenue scale-up (proxy for TAM capture)
    revenues = [m.revenue_growth for m in metrics if m.revenue_growth is not None]
    if len(revenues) >= 2:
        if all(r > 0.20 for r in revenues[:3]):
            score += 2
            details.append("Sustained 20%+ growth suggests large TAM")

    # Margin expansion while growing (unit economics)
    margins = [m.gross_margin for m in metrics if m.gross_margin is not None]
    if len(margins) >= 2:
        if margins[0] >= margins[-1]:
            score += 1
            details.append("Maintaining/expanding margins while scaling - good unit economics")

    # Market position (revenue multiple as proxy)
    latest = metrics[0]
    if latest.price_to_sales_ratio and latest.revenue_growth:
        if latest.price_to_sales_ratio > 10 and latest.revenue_growth > 0.30:
            score += 1
            details.append("Premium valuation justified by hyper-growth")

    return {"score": min(score, 4), "max_score": 4, "details": "; ".join(details) if details else "Limited data"}


def analyze_competitive_position(metrics: list) -> dict:
    """Assess competitive moat in innovation space."""
    if not metrics or len(metrics) < 3:
        return {"score": 0, "max_score": 3, "details": "Insufficient data"}

    score = 0
    details = []

    # Sustained high returns suggest competitive advantage
    roes = [m.return_on_equity for m in metrics if m.return_on_equity is not None]
    if len(roes) >= 3:
        if all(r > 0.15 for r in roes):
            score += 2
            details.append("Consistent high ROE indicates competitive moat")

    # Growth without margin compression
    margins = [m.operating_margin for m in metrics if m.operating_margin is not None]
    if len(margins) >= 2:
        if margins[0] >= margins[-1] * 0.9:
            score += 1
            details.append("Maintaining margins while growing - competitive strength")

    return {"score": min(score, 3), "max_score": 3, "details": "; ".join(details) if details else "Limited data"}


def generate_signal(analysis_data: dict) -> dict:
    """Generate Wood-style signal - growth and innovation focus."""
    growth = analysis_data["growth"]["score"]
    innovation = analysis_data["innovation"]["score"]
    market = analysis_data["market"]["score"]
    competitive = analysis_data["competitive"]["score"]

    total = growth + innovation + market + competitive
    max_total = 15

    score_pct = total / max_total

    # Wood is aggressively bullish on high growth
    if score_pct >= 0.60 and growth >= 3:
        signal = "bullish"
        confidence = min(85, int(score_pct * 100))
    elif score_pct <= 0.35 or growth <= 1:
        signal = "bearish"
        confidence = min(75, int((1 - score_pct) * 100))
    else:
        signal = "neutral"
        confidence = 50

    return {"signal": signal, "confidence": confidence, "score": total, "max_score": max_total}


LINE_ITEMS = [
    "revenue",
    "capital_expenditure",
    "net_income",
]


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE")
        print("Example: analyze.py TSLA 2024-12-01")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]

    metrics = get_financial_metrics(ticker, end_date, "ttm", 10)
    market_cap = get_market_cap(ticker, end_date)
    line_items = search_line_items(ticker, LINE_ITEMS, end_date, "ttm", 10)

    growth = analyze_growth_trajectory(metrics)
    innovation = analyze_innovation_investment(line_items, metrics)
    market = analyze_market_potential(metrics)
    competitive = analyze_competitive_position(metrics)

    analysis_data = {
        "growth": growth,
        "innovation": innovation,
        "market": market,
        "competitive": competitive,
    }

    signal_data = generate_signal(analysis_data)

    result = {
        "ticker": ticker,
        "signal": signal_data["signal"],
        "confidence": signal_data["confidence"],
        "score": signal_data["score"],
        "max_score": signal_data["max_score"],
        "growth_trajectory": growth,
        "innovation_investment": innovation,
        "market_potential": market,
        "competitive_position": competitive,
        "market_cap": market_cap,
    }

    print(json.dumps(result, indent=2, default=str))
