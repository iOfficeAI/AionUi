#!/usr/bin/env python3
"""Multi-model valuation analysis."""
import sys
import json

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics, get_market_cap, search_line_items


def dcf_valuation(line_items: list, metrics: list) -> dict:
    """DCF valuation using free cash flow."""
    if not line_items:
        return {"value": None, "details": "No line item data"}

    latest = line_items[0]
    fcf = getattr(latest, 'free_cash_flow', None)

    if not fcf:
        # Estimate from components
        net_income = getattr(latest, 'net_income', None)
        depreciation = getattr(latest, 'depreciation_and_amortization', 0) or 0
        capex = abs(getattr(latest, 'capital_expenditure', 0) or 0)
        if net_income:
            fcf = net_income + depreciation - capex

    if not fcf or fcf <= 0:
        return {"value": None, "details": "Negative or missing FCF"}

    # Estimate growth
    growth = 0.05
    if metrics and metrics[0].earnings_growth:
        growth = min(max(metrics[0].earnings_growth * 0.7, 0.02), 0.12)

    # DCF parameters
    discount_rate = 0.10
    terminal_growth = 0.025
    years = 10

    # Calculate PV
    pv = 0
    projected_fcf = fcf
    for year in range(1, years + 1):
        fade = growth - (growth - terminal_growth) * min(year / years, 1)
        projected_fcf *= (1 + fade)
        pv += projected_fcf / ((1 + discount_rate) ** year)

    # Terminal value
    terminal_fcf = projected_fcf * (1 + terminal_growth)
    terminal_value = terminal_fcf / (discount_rate - terminal_growth)
    pv_terminal = terminal_value / ((1 + discount_rate) ** years)

    intrinsic_value = pv + pv_terminal

    return {
        "value": intrinsic_value,
        "current_fcf": fcf,
        "growth_rate": growth,
        "details": f"DCF Value: ${intrinsic_value:,.0f}"
    }


def relative_valuation(metrics: list, market_cap: float) -> dict:
    """Relative valuation using multiples."""
    if not metrics:
        return {"score": 0, "max_score": 5, "details": "No metrics"}

    latest = metrics[0]
    score = 0
    details = []

    # P/E analysis
    if latest.price_to_earnings_ratio:
        pe = latest.price_to_earnings_ratio
        if pe < 15:
            score += 2
            details.append(f"Attractive P/E: {pe:.1f}")
        elif pe < 25:
            score += 1
            details.append(f"Moderate P/E: {pe:.1f}")
        else:
            details.append(f"High P/E: {pe:.1f}")

    # P/B vs ROE
    if latest.price_to_book_ratio and latest.return_on_equity:
        pb = latest.price_to_book_ratio
        roe = latest.return_on_equity
        # Fair P/B ≈ ROE / Cost of Equity (simplified)
        fair_pb = roe / 0.10
        if pb < fair_pb * 0.8:
            score += 2
            details.append(f"P/B ({pb:.1f}) below fair value")
        elif pb < fair_pb * 1.2:
            score += 1
            details.append(f"P/B ({pb:.1f}) near fair value")

    # FCF yield
    if latest.free_cash_flow_yield:
        fcf_yield = latest.free_cash_flow_yield
        if fcf_yield > 0.08:
            score += 1
            details.append(f"High FCF yield: {fcf_yield:.1%}")

    return {"score": score, "max_score": 5, "details": "; ".join(details) if details else "N/A"}


def owner_earnings_valuation(line_items: list) -> dict:
    """Buffett-style owner earnings valuation."""
    if not line_items or len(line_items) < 2:
        return {"value": None, "details": "Insufficient data"}

    latest = line_items[0]
    net_income = getattr(latest, 'net_income', None)
    depreciation = getattr(latest, 'depreciation_and_amortization', 0) or 0
    capex = abs(getattr(latest, 'capital_expenditure', 0) or 0)

    if not net_income:
        return {"value": None, "details": "Missing net income"}

    # Maintenance capex estimate (85% of total)
    maintenance_capex = max(capex * 0.85, depreciation)

    owner_earnings = net_income + depreciation - maintenance_capex

    if owner_earnings <= 0:
        return {"value": None, "details": "Negative owner earnings"}

    # Simple multiple approach (10-15x owner earnings)
    low_value = owner_earnings * 10
    high_value = owner_earnings * 15
    mid_value = owner_earnings * 12.5

    return {
        "value": mid_value,
        "owner_earnings": owner_earnings,
        "range": {"low": low_value, "high": high_value},
        "details": f"Owner Earnings Value: ${mid_value:,.0f}"
    }


def generate_signal(valuations: dict, market_cap: float) -> dict:
    """Generate valuation signal based on gap to fair value."""
    values = []

    if valuations["dcf"].get("value"):
        values.append(valuations["dcf"]["value"])
    if valuations["owner_earnings"].get("value"):
        values.append(valuations["owner_earnings"]["value"])

    if not values or not market_cap:
        return {
            "signal": "neutral",
            "confidence": 50,
            "valuation_gap": None,
            "fair_value": None
        }

    fair_value = sum(values) / len(values)
    valuation_gap = (fair_value - market_cap) / market_cap

    relative_score = valuations["relative"]["score"]

    if valuation_gap > 0.25 and relative_score >= 3:
        signal = "bullish"
        confidence = min(85, int(50 + valuation_gap * 100))
    elif valuation_gap < -0.25 or relative_score <= 1:
        signal = "bearish"
        confidence = min(80, int(50 + abs(valuation_gap) * 80))
    else:
        signal = "neutral"
        confidence = 50

    return {
        "signal": signal,
        "confidence": confidence,
        "valuation_gap": valuation_gap,
        "fair_value": fair_value
    }


LINE_ITEMS = [
    "free_cash_flow",
    "net_income",
    "capital_expenditure",
    "depreciation_and_amortization",
    "outstanding_shares",
]


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE")
        print("Example: analyze.py AAPL 2024-12-01")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]

    metrics = get_financial_metrics(ticker, end_date, "ttm", 10)
    market_cap = get_market_cap(ticker, end_date)
    line_items = search_line_items(ticker, LINE_ITEMS, end_date, "ttm", 10)

    dcf = dcf_valuation(line_items, metrics)
    relative = relative_valuation(metrics, market_cap)
    owner = owner_earnings_valuation(line_items)

    valuations = {
        "dcf": dcf,
        "relative": relative,
        "owner_earnings": owner,
    }

    signal_data = generate_signal(valuations, market_cap)

    result = {
        "ticker": ticker,
        "signal": signal_data["signal"],
        "confidence": signal_data["confidence"],
        "fair_value": signal_data["fair_value"],
        "market_cap": market_cap,
        "valuation_gap": signal_data["valuation_gap"],
        "dcf_valuation": dcf,
        "relative_valuation": relative,
        "owner_earnings_valuation": owner,
    }

    print(json.dumps(result, indent=2, default=str))
