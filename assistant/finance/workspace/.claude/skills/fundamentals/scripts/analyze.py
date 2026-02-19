#!/usr/bin/env python3
"""Fundamental analysis of company financials."""
import sys
import json

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics


def analyze_profitability(metrics: list) -> dict:
    """Analyze profitability metrics."""
    if not metrics:
        return {"signal": "neutral", "score": 0, "details": "No data"}

    latest = metrics[0]
    signals = []

    thresholds = [
        (latest.return_on_equity, 0.15),
        (latest.net_margin, 0.20),
        (latest.operating_margin, 0.15),
    ]
    score = sum(metric is not None and metric > threshold for metric, threshold in thresholds)

    if score >= 2:
        signal = "bullish"
    elif score == 0:
        signal = "bearish"
    else:
        signal = "neutral"

    details = []
    if latest.return_on_equity:
        details.append(f"ROE: {latest.return_on_equity:.1%}")
    if latest.net_margin:
        details.append(f"Net Margin: {latest.net_margin:.1%}")
    if latest.operating_margin:
        details.append(f"Op Margin: {latest.operating_margin:.1%}")

    return {"signal": signal, "score": score, "max_score": 3, "details": ", ".join(details) if details else "N/A"}


def analyze_growth(metrics: list) -> dict:
    """Analyze growth metrics."""
    if not metrics:
        return {"signal": "neutral", "score": 0, "details": "No data"}

    latest = metrics[0]

    thresholds = [
        (latest.revenue_growth, 0.10),
        (latest.earnings_growth, 0.10),
        (latest.book_value_growth, 0.10),
    ]
    score = sum(metric is not None and metric > threshold for metric, threshold in thresholds)

    if score >= 2:
        signal = "bullish"
    elif score == 0:
        signal = "bearish"
    else:
        signal = "neutral"

    details = []
    if latest.revenue_growth:
        details.append(f"Revenue Growth: {latest.revenue_growth:.1%}")
    if latest.earnings_growth:
        details.append(f"Earnings Growth: {latest.earnings_growth:.1%}")

    return {"signal": signal, "score": score, "max_score": 3, "details": ", ".join(details) if details else "N/A"}


def analyze_financial_health(metrics: list) -> dict:
    """Analyze financial health metrics."""
    if not metrics:
        return {"signal": "neutral", "score": 0, "details": "No data"}

    latest = metrics[0]
    score = 0

    if latest.current_ratio and latest.current_ratio > 1.5:
        score += 1
    if latest.debt_to_equity and latest.debt_to_equity < 0.5:
        score += 1
    if latest.free_cash_flow_per_share and latest.earnings_per_share:
        if latest.free_cash_flow_per_share > latest.earnings_per_share * 0.8:
            score += 1

    if score >= 2:
        signal = "bullish"
    elif score == 0:
        signal = "bearish"
    else:
        signal = "neutral"

    details = []
    if latest.current_ratio:
        details.append(f"Current Ratio: {latest.current_ratio:.2f}")
    if latest.debt_to_equity:
        details.append(f"D/E: {latest.debt_to_equity:.2f}")

    return {"signal": signal, "score": score, "max_score": 3, "details": ", ".join(details) if details else "N/A"}


def analyze_valuation(metrics: list) -> dict:
    """Analyze valuation ratios."""
    if not metrics:
        return {"signal": "neutral", "score": 0, "details": "No data"}

    latest = metrics[0]

    # For valuation, HIGH ratios are bearish
    thresholds = [
        (latest.price_to_earnings_ratio, 25),
        (latest.price_to_book_ratio, 3),
        (latest.price_to_sales_ratio, 5),
    ]
    # Count how many are ABOVE threshold (bearish)
    high_count = sum(metric is not None and metric > threshold for metric, threshold in thresholds)

    if high_count >= 2:
        signal = "bearish"
        score = 0
    elif high_count == 0:
        signal = "bullish"
        score = 3
    else:
        signal = "neutral"
        score = 1

    details = []
    if latest.price_to_earnings_ratio:
        details.append(f"P/E: {latest.price_to_earnings_ratio:.1f}")
    if latest.price_to_book_ratio:
        details.append(f"P/B: {latest.price_to_book_ratio:.1f}")
    if latest.price_to_sales_ratio:
        details.append(f"P/S: {latest.price_to_sales_ratio:.1f}")

    return {"signal": signal, "score": score, "max_score": 3, "details": ", ".join(details) if details else "N/A"}


def generate_overall_signal(analysis: dict) -> dict:
    """Combine all fundamental signals."""
    signals = [
        analysis["profitability"]["signal"],
        analysis["growth"]["signal"],
        analysis["health"]["signal"],
        analysis["valuation"]["signal"],
    ]

    bullish = signals.count("bullish")
    bearish = signals.count("bearish")

    if bullish > bearish:
        signal = "bullish"
    elif bearish > bullish:
        signal = "bearish"
    else:
        signal = "neutral"

    total_score = (
        analysis["profitability"]["score"] +
        analysis["growth"]["score"] +
        analysis["health"]["score"] +
        analysis["valuation"]["score"]
    )
    max_score = 12

    confidence = round(max(bullish, bearish) / 4 * 100)

    return {
        "signal": signal,
        "confidence": confidence,
        "score": total_score,
        "max_score": max_score
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE")
        print("Example: analyze.py MSFT 2024-12-01")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]

    metrics = get_financial_metrics(ticker, end_date, "ttm", 10)

    profitability = analyze_profitability(metrics)
    growth = analyze_growth(metrics)
    health = analyze_financial_health(metrics)
    valuation = analyze_valuation(metrics)

    analysis = {
        "profitability": profitability,
        "growth": growth,
        "health": health,
        "valuation": valuation,
    }

    overall = generate_overall_signal(analysis)

    result = {
        "ticker": ticker,
        "signal": overall["signal"],
        "confidence": overall["confidence"],
        "score": overall["score"],
        "max_score": overall["max_score"],
        "profitability_signal": profitability,
        "growth_signal": growth,
        "financial_health_signal": health,
        "valuation_signal": valuation,
    }

    print(json.dumps(result, indent=2, default=str))
