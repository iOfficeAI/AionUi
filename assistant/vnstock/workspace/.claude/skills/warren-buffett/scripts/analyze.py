#!/usr/bin/env python3
"""Warren Buffett style stock analysis."""
import sys
import json

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics, get_market_cap, search_line_items


def analyze_fundamentals(metrics: list) -> dict:
    """Analyze company fundamentals based on Buffett's criteria."""
    if not metrics:
        return {"score": 0, "details": "Insufficient fundamental data"}

    latest_metrics = metrics[0]
    score = 0
    reasoning = []

    # Check ROE (Return on Equity)
    if latest_metrics.return_on_equity and latest_metrics.return_on_equity > 0.15:
        score += 2
        reasoning.append(f"Strong ROE of {latest_metrics.return_on_equity:.1%}")
    elif latest_metrics.return_on_equity:
        reasoning.append(f"Weak ROE of {latest_metrics.return_on_equity:.1%}")
    else:
        reasoning.append("ROE data not available")

    # Check Debt to Equity
    if latest_metrics.debt_to_equity and latest_metrics.debt_to_equity < 0.5:
        score += 2
        reasoning.append("Conservative debt levels")
    elif latest_metrics.debt_to_equity:
        reasoning.append(f"High debt to equity ratio of {latest_metrics.debt_to_equity:.1f}")
    else:
        reasoning.append("Debt to equity data not available")

    # Check Operating Margin
    if latest_metrics.operating_margin and latest_metrics.operating_margin > 0.15:
        score += 2
        reasoning.append("Strong operating margins")
    elif latest_metrics.operating_margin:
        reasoning.append(f"Weak operating margin of {latest_metrics.operating_margin:.1%}")
    else:
        reasoning.append("Operating margin data not available")

    # Check Current Ratio
    if latest_metrics.current_ratio and latest_metrics.current_ratio > 1.5:
        score += 1
        reasoning.append("Good liquidity position")
    elif latest_metrics.current_ratio:
        reasoning.append(f"Weak liquidity with current ratio of {latest_metrics.current_ratio:.1f}")
    else:
        reasoning.append("Current ratio data not available")

    return {"score": score, "max_score": 7, "details": "; ".join(reasoning)}


def analyze_moat(metrics: list) -> dict:
    """Evaluate whether the company likely has a durable competitive advantage (moat)."""
    if not metrics or len(metrics) < 5:
        return {"score": 0, "max_score": 5, "details": "Insufficient data for comprehensive moat analysis"}

    reasoning = []
    moat_score = 0
    max_score = 5

    # Return on Capital Consistency
    historical_roes = [m.return_on_equity for m in metrics if m.return_on_equity is not None]

    if len(historical_roes) >= 5:
        high_roe_periods = sum(1 for roe in historical_roes if roe > 0.15)
        roe_consistency = high_roe_periods / len(historical_roes)

        if roe_consistency >= 0.8:
            moat_score += 2
            avg_roe = sum(historical_roes) / len(historical_roes)
            reasoning.append(f"Excellent ROE consistency: {high_roe_periods}/{len(historical_roes)} periods >15% (avg: {avg_roe:.1%})")
        elif roe_consistency >= 0.6:
            moat_score += 1
            reasoning.append(f"Good ROE performance: {high_roe_periods}/{len(historical_roes)} periods >15%")
        else:
            reasoning.append(f"Inconsistent ROE: only {high_roe_periods}/{len(historical_roes)} periods >15%")

    # Operating Margin Stability
    historical_margins = [m.operating_margin for m in metrics if m.operating_margin is not None]
    if len(historical_margins) >= 5:
        avg_margin = sum(historical_margins) / len(historical_margins)
        recent_margins = historical_margins[:3]
        older_margins = historical_margins[-3:]

        recent_avg = sum(recent_margins) / len(recent_margins)
        older_avg = sum(older_margins) / len(older_margins)

        if avg_margin > 0.2 and recent_avg >= older_avg:
            moat_score += 1
            reasoning.append(f"Strong and stable operating margins (avg: {avg_margin:.1%}) indicate pricing power moat")
        elif avg_margin > 0.15:
            reasoning.append(f"Decent operating margins (avg: {avg_margin:.1%})")

    # Performance Stability
    if len(historical_roes) >= 5 and len(historical_margins) >= 5:
        roe_avg = sum(historical_roes) / len(historical_roes)
        roe_variance = sum((roe - roe_avg) ** 2 for roe in historical_roes) / len(historical_roes)
        roe_stability = 1 - (roe_variance ** 0.5) / roe_avg if roe_avg > 0 else 0

        margin_avg = sum(historical_margins) / len(historical_margins)
        margin_variance = sum((margin - margin_avg) ** 2 for margin in historical_margins) / len(historical_margins)
        margin_stability = 1 - (margin_variance ** 0.5) / margin_avg if margin_avg > 0 else 0

        overall_stability = (roe_stability + margin_stability) / 2

        if overall_stability > 0.7:
            moat_score += 2
            reasoning.append(f"High performance stability ({overall_stability:.1%}) suggests strong competitive moat")

    moat_score = min(moat_score, max_score)

    return {
        "score": moat_score,
        "max_score": max_score,
        "details": "; ".join(reasoning) if reasoning else "Limited moat analysis available",
    }


def analyze_consistency(financial_line_items: list) -> dict:
    """Analyze earnings consistency and growth."""
    if len(financial_line_items) < 4:
        return {"score": 0, "max_score": 3, "details": "Insufficient historical data"}

    score = 0
    reasoning = []

    earnings_values = [item.net_income for item in financial_line_items if item.net_income]
    if len(earnings_values) >= 4:
        earnings_growth = all(earnings_values[i] > earnings_values[i + 1] for i in range(len(earnings_values) - 1))

        if earnings_growth:
            score += 3
            reasoning.append("Consistent earnings growth over past periods")
        else:
            reasoning.append("Inconsistent earnings growth pattern")

        if len(earnings_values) >= 2 and earnings_values[-1] != 0:
            growth_rate = (earnings_values[0] - earnings_values[-1]) / abs(earnings_values[-1])
            reasoning.append(f"Total earnings growth of {growth_rate:.1%} over past {len(earnings_values)} periods")

    return {"score": score, "max_score": 3, "details": "; ".join(reasoning)}


def analyze_management_quality(financial_line_items: list) -> dict:
    """Check for share dilution or consistent buybacks, and dividend track record."""
    if not financial_line_items:
        return {"score": 0, "max_score": 2, "details": "Insufficient data for management analysis"}

    reasoning = []
    mgmt_score = 0

    latest = financial_line_items[0]
    if hasattr(latest, "issuance_or_purchase_of_equity_shares") and latest.issuance_or_purchase_of_equity_shares:
        if latest.issuance_or_purchase_of_equity_shares < 0:
            mgmt_score += 1
            reasoning.append("Company has been repurchasing shares (shareholder-friendly)")
        elif latest.issuance_or_purchase_of_equity_shares > 0:
            reasoning.append("Recent common stock issuance (potential dilution)")

    if hasattr(latest, "dividends_and_other_cash_distributions") and latest.dividends_and_other_cash_distributions:
        if latest.dividends_and_other_cash_distributions < 0:
            mgmt_score += 1
            reasoning.append("Company has a track record of paying dividends")

    return {"score": mgmt_score, "max_score": 2, "details": "; ".join(reasoning) if reasoning else "No management data available"}


def calculate_owner_earnings(financial_line_items: list) -> dict:
    """Calculate owner earnings (Buffett's preferred measure of true earnings power)."""
    if not financial_line_items or len(financial_line_items) < 2:
        return {"owner_earnings": None, "details": ["Insufficient data for owner earnings calculation"]}

    latest = financial_line_items[0]
    details = []

    net_income = latest.net_income
    depreciation = latest.depreciation_and_amortization
    capex = latest.capital_expenditure

    if not all([net_income is not None, depreciation is not None, capex is not None]):
        return {"owner_earnings": None, "details": ["Missing components for owner earnings"]}

    # Estimate maintenance capex as 85% of total capex
    maintenance_capex = abs(capex) * 0.85 if capex else depreciation

    owner_earnings = net_income + depreciation - maintenance_capex

    details.extend([
        f"Net income: ${net_income:,.0f}",
        f"Depreciation: ${depreciation:,.0f}",
        f"Estimated maintenance capex: ${maintenance_capex:,.0f}",
        f"Owner earnings: ${owner_earnings:,.0f}"
    ])

    return {"owner_earnings": owner_earnings, "details": details}


def calculate_intrinsic_value(financial_line_items: list) -> dict:
    """Calculate intrinsic value using enhanced DCF with owner earnings."""
    if not financial_line_items or len(financial_line_items) < 3:
        return {"intrinsic_value": None, "details": ["Insufficient data for reliable valuation"]}

    earnings_data = calculate_owner_earnings(financial_line_items)
    if not earnings_data["owner_earnings"]:
        return {"intrinsic_value": None, "details": earnings_data["details"]}

    owner_earnings = earnings_data["owner_earnings"]
    latest = financial_line_items[0]
    shares_outstanding = latest.outstanding_shares

    if not shares_outstanding or shares_outstanding <= 0:
        return {"intrinsic_value": None, "details": ["Missing shares outstanding data"]}

    details = []

    # Calculate historical growth rate
    historical_earnings = [item.net_income for item in financial_line_items[:5] if hasattr(item, 'net_income') and item.net_income]

    if len(historical_earnings) >= 3:
        oldest_earnings = historical_earnings[-1]
        latest_earnings = historical_earnings[0]
        years = len(historical_earnings) - 1

        if oldest_earnings > 0:
            historical_growth = ((latest_earnings / oldest_earnings) ** (1 / years)) - 1
            historical_growth = max(-0.05, min(historical_growth, 0.15))
            conservative_growth = historical_growth * 0.7
        else:
            conservative_growth = 0.03
    else:
        conservative_growth = 0.03

    # Three-stage DCF
    stage1_growth = min(conservative_growth, 0.08)
    stage2_growth = min(conservative_growth * 0.5, 0.04)
    terminal_growth = 0.025
    discount_rate = 0.10
    stage1_years = 5
    stage2_years = 5

    # Stage 1
    stage1_pv = 0
    for year in range(1, stage1_years + 1):
        future_earnings = owner_earnings * (1 + stage1_growth) ** year
        pv = future_earnings / (1 + discount_rate) ** year
        stage1_pv += pv

    # Stage 2
    stage2_pv = 0
    stage1_final_earnings = owner_earnings * (1 + stage1_growth) ** stage1_years
    for year in range(1, stage2_years + 1):
        future_earnings = stage1_final_earnings * (1 + stage2_growth) ** year
        pv = future_earnings / (1 + discount_rate) ** (stage1_years + year)
        stage2_pv += pv

    # Terminal value
    final_earnings = stage1_final_earnings * (1 + stage2_growth) ** stage2_years
    terminal_earnings = final_earnings * (1 + terminal_growth)
    terminal_value = terminal_earnings / (discount_rate - terminal_growth)
    terminal_pv = terminal_value / (1 + discount_rate) ** (stage1_years + stage2_years)

    intrinsic_value = stage1_pv + stage2_pv + terminal_pv
    conservative_intrinsic_value = intrinsic_value * 0.85

    details.extend([
        f"Stage 1 PV: ${stage1_pv:,.0f}",
        f"Stage 2 PV: ${stage2_pv:,.0f}",
        f"Terminal PV: ${terminal_pv:,.0f}",
        f"Total IV: ${intrinsic_value:,.0f}",
        f"Conservative IV (15% haircut): ${conservative_intrinsic_value:,.0f}",
    ])

    return {
        "intrinsic_value": conservative_intrinsic_value,
        "raw_intrinsic_value": intrinsic_value,
        "owner_earnings": owner_earnings,
        "details": details,
    }


def analyze_book_value_growth(financial_line_items: list) -> dict:
    """Analyze book value per share growth - a key Buffett metric."""
    if len(financial_line_items) < 3:
        return {"score": 0, "max_score": 5, "details": "Insufficient data for book value analysis"}

    book_values = [
        item.shareholders_equity / item.outstanding_shares
        for item in financial_line_items
        if hasattr(item, 'shareholders_equity') and hasattr(item, 'outstanding_shares')
        and item.shareholders_equity and item.outstanding_shares
    ]

    if len(book_values) < 3:
        return {"score": 0, "max_score": 5, "details": "Insufficient book value data"}

    score = 0
    reasoning = []

    growth_periods = sum(1 for i in range(len(book_values) - 1) if book_values[i] > book_values[i + 1])
    growth_rate = growth_periods / (len(book_values) - 1)

    if growth_rate >= 0.8:
        score += 3
        reasoning.append("Consistent book value per share growth")
    elif growth_rate >= 0.6:
        score += 2
        reasoning.append("Good book value per share growth pattern")
    elif growth_rate >= 0.4:
        score += 1
        reasoning.append("Moderate book value per share growth")

    # Calculate CAGR
    if len(book_values) >= 2 and book_values[-1] > 0 and book_values[0] > 0:
        years = len(book_values) - 1
        cagr = ((book_values[0] / book_values[-1]) ** (1 / years)) - 1
        if cagr > 0.15:
            score += 2
            reasoning.append(f"Excellent book value CAGR: {cagr:.1%}")
        elif cagr > 0.1:
            score += 1
            reasoning.append(f"Good book value CAGR: {cagr:.1%}")

    return {"score": score, "max_score": 5, "details": "; ".join(reasoning)}


def generate_signal(analysis_data: dict) -> dict:
    """Generate investment signal based on analysis."""
    total_score = (
        analysis_data["fundamentals"]["score"] +
        analysis_data["moat"]["score"] +
        analysis_data["consistency"]["score"] +
        analysis_data["management"]["score"] +
        analysis_data["book_value"]["score"]
    )

    max_score = (
        analysis_data["fundamentals"]["max_score"] +
        analysis_data["moat"]["max_score"] +
        analysis_data["consistency"]["max_score"] +
        analysis_data["management"]["max_score"] +
        analysis_data["book_value"]["max_score"]
    )

    score_pct = total_score / max_score if max_score > 0 else 0
    margin_of_safety = analysis_data.get("margin_of_safety")

    # Determine signal
    if score_pct >= 0.7 and margin_of_safety and margin_of_safety > 0:
        signal = "bullish"
        confidence = min(90, int(score_pct * 100))
    elif score_pct <= 0.3 or (margin_of_safety and margin_of_safety < -0.3):
        signal = "bearish"
        confidence = min(80, int((1 - score_pct) * 100))
    else:
        signal = "neutral"
        confidence = 50 + int(abs(score_pct - 0.5) * 40)

    return {
        "signal": signal,
        "confidence": confidence,
        "score": total_score,
        "max_score": max_score,
    }


LINE_ITEMS = [
    "capital_expenditure",
    "depreciation_and_amortization",
    "net_income",
    "outstanding_shares",
    "total_assets",
    "total_liabilities",
    "shareholders_equity",
    "dividends_and_other_cash_distributions",
    "issuance_or_purchase_of_equity_shares",
    "gross_profit",
    "revenue",
    "free_cash_flow",
]


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE")
        print("Example: analyze.py AAPL 2024-12-01")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]

    # Fetch data
    metrics = get_financial_metrics(ticker, end_date, "ttm", 10)
    market_cap = get_market_cap(ticker, end_date)
    line_items = search_line_items(ticker, LINE_ITEMS, end_date, "ttm", 10)

    # Run analyses
    fundamentals = analyze_fundamentals(metrics)
    moat = analyze_moat(metrics)
    consistency = analyze_consistency(line_items)
    management = analyze_management_quality(line_items)
    book_value = analyze_book_value_growth(line_items)
    intrinsic_value_data = calculate_intrinsic_value(line_items)

    # Calculate margin of safety
    margin_of_safety = None
    intrinsic_value = intrinsic_value_data.get("intrinsic_value")
    if intrinsic_value and market_cap:
        margin_of_safety = (intrinsic_value - market_cap) / market_cap

    analysis_data = {
        "fundamentals": fundamentals,
        "moat": moat,
        "consistency": consistency,
        "management": management,
        "book_value": book_value,
        "margin_of_safety": margin_of_safety,
    }

    signal_data = generate_signal(analysis_data)

    result = {
        "ticker": ticker,
        "signal": signal_data["signal"],
        "confidence": signal_data["confidence"],
        "score": signal_data["score"],
        "max_score": signal_data["max_score"],
        "fundamentals": fundamentals,
        "moat": moat,
        "consistency": consistency,
        "management": management,
        "book_value": book_value,
        "intrinsic_value": intrinsic_value_data,
        "market_cap": market_cap,
        "margin_of_safety": margin_of_safety,
    }

    print(json.dumps(result, indent=2, default=str))
