#!/usr/bin/env python3
"""Growth analyst - evaluates revenue growth trajectory, TAM penetration, and S-curve positioning."""
import json
import sys

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics, search_line_items


def classify_growth_stage(revenue_growth: float) -> str:
    if revenue_growth > 0.40:
        return "hypergrowth"
    elif revenue_growth > 0.20:
        return "high_growth"
    elif revenue_growth > 0.10:
        return "growth"
    elif revenue_growth > 0.05:
        return "mature_growth"
    else:
        return "mature"


def assess_growth_trend(metrics: list) -> str:
    """Determine if growth is accelerating or decelerating."""
    if len(metrics) < 2:
        return "insufficient_data"
    recent = metrics[0].revenue_growth
    prior = metrics[1].revenue_growth
    if recent is None or prior is None:
        return "insufficient_data"
    if recent > prior + 0.02:
        return "accelerating"
    elif recent < prior - 0.02:
        return "decelerating"
    return "stable"


def calculate_rule_of_40(metrics) -> float | None:
    """Rule of 40: revenue growth rate + FCF margin (good if > 0.40)."""
    if metrics.revenue_growth is None or metrics.free_cash_flow_yield is None:
        return None
    # FCF yield approximates FCF margin for this heuristic
    return metrics.revenue_growth + (metrics.free_cash_flow_yield or 0)


def assess_earnings_leverage(metrics: list) -> str:
    """Check if margins are expanding as revenue grows (operating leverage)."""
    if len(metrics) < 2:
        return "insufficient_data"
    recent_margin = metrics[0].operating_margin
    prior_margin = metrics[1].operating_margin
    if recent_margin is None or prior_margin is None:
        return "insufficient_data"
    if recent_margin > prior_margin + 0.02:
        return "expanding"
    elif recent_margin < prior_margin - 0.02:
        return "contracting"
    return "stable"


def generate_signal(
    growth_stage: str,
    growth_trend: str,
    rule_of_40: float | None,
    earnings_leverage: str,
) -> dict:
    score = 0
    reasoning = []

    # Growth stage scoring
    stage_scores = {
        "hypergrowth": 4,
        "high_growth": 3,
        "growth": 2,
        "mature_growth": 1,
        "mature": 0,
    }
    stage_score = stage_scores.get(growth_stage, 0)
    score += stage_score
    reasoning.append(f"Growth stage: {growth_stage} ({stage_score}/4 points)")

    # Growth trend
    if growth_trend == "accelerating":
        score += 2
        reasoning.append("Growth is accelerating (+2)")
    elif growth_trend == "stable":
        score += 1
        reasoning.append("Growth is stable (+1)")
    elif growth_trend == "decelerating":
        reasoning.append("Growth is decelerating (0)")

    # Rule of 40
    if rule_of_40 is not None:
        if rule_of_40 > 0.60:
            score += 3
            reasoning.append(f"Excellent Rule of 40: {rule_of_40:.1%} (+3)")
        elif rule_of_40 > 0.40:
            score += 2
            reasoning.append(f"Good Rule of 40: {rule_of_40:.1%} (+2)")
        elif rule_of_40 > 0.20:
            score += 1
            reasoning.append(f"Moderate Rule of 40: {rule_of_40:.1%} (+1)")
        else:
            reasoning.append(f"Weak Rule of 40: {rule_of_40:.1%} (0)")

    # Earnings leverage
    if earnings_leverage == "expanding":
        score += 2
        reasoning.append("Margins expanding (operating leverage) (+2)")
    elif earnings_leverage == "stable":
        score += 1
        reasoning.append("Margins stable (+1)")
    elif earnings_leverage == "contracting":
        reasoning.append("Margins contracting (0)")

    max_score = 11
    confidence = min(score / max_score, 1.0)

    if score >= 7:
        signal = "bullish"
    elif score >= 4:
        signal = "neutral"
    else:
        signal = "bearish"

    return {
        "signal": signal,
        "confidence": round(confidence, 2),
        "score": score,
        "max_score": max_score,
        "reasoning": reasoning,
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE", file=sys.stderr)
        print("Example: analyze.py NVDA 2026-02-19", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    end_date = sys.argv[2]

    try:
        metrics = get_financial_metrics(ticker, end_date, period="ttm", limit=4)
        if not metrics:
            print(json.dumps({
                "ticker": ticker,
                "signal": "neutral",
                "confidence": 0.0,
                "error": "No financial metrics available",
            }))
            return

        latest = metrics[0]
        revenue_growth = latest.revenue_growth or 0.0
        growth_stage = classify_growth_stage(revenue_growth)
        growth_trend = assess_growth_trend(metrics)
        rule_of_40 = calculate_rule_of_40(latest)
        earnings_leverage = assess_earnings_leverage(metrics)

        signal_data = generate_signal(growth_stage, growth_trend, rule_of_40, earnings_leverage)

        result = {
            "ticker": ticker,
            "end_date": end_date,
            "signal": signal_data["signal"],
            "confidence": signal_data["confidence"],
            "growth_stage": growth_stage,
            "revenue_growth_rate": revenue_growth,
            "growth_trend": growth_trend,
            "rule_of_40_score": rule_of_40,
            "earnings_leverage": earnings_leverage,
            "score": signal_data["score"],
            "reasoning": signal_data["reasoning"],
        }
        print(json.dumps(result, indent=2, default=str))

    except Exception as e:
        print(json.dumps({"ticker": ticker, "signal": "neutral", "confidence": 0.0, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
