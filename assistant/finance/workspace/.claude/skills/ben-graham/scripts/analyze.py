#!/usr/bin/env python3
"""Benjamin Graham defensive investor analysis — 7-criterion scorecard."""
import sys
import json
import math

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics, get_market_cap, search_line_items


# ---------------------------------------------------------------------------
# Criterion 1: Adequate Size (Security Analysis / Intelligent Investor Ch.14)
# ---------------------------------------------------------------------------

def analyze_adequacy(line_items: list) -> dict:
    """Criterion 1: Revenue > $100M — adequate size for a defensive investor."""
    if not line_items:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "Revenue > $100M",
            "details": "No data available"
        }

    revenues = [item.revenue for item in line_items if item.revenue is not None]
    if not revenues:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "Revenue > $100M",
            "details": "Revenue data not available"
        }

    latest_revenue = revenues[0]
    passes = latest_revenue > 100_000_000
    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"${latest_revenue / 1e6:,.0f}M",
        "threshold": "Revenue > $100M",
        "details": f"Latest revenue ${latest_revenue / 1e6:,.0f}M {'meets' if passes else 'does not meet'} adequacy threshold"
    }


# ---------------------------------------------------------------------------
# Criterion 2: Strong Financial Condition (current ratio ≥ 2.0)
# ---------------------------------------------------------------------------

def analyze_financial_strength(line_items: list) -> dict:
    """Criterion 2: Current ratio ≥ 2.0 — strong financial condition."""
    if not line_items:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "Current ratio ≥ 2.0",
            "details": "No data available"
        }

    latest = line_items[0]
    current_assets = latest.current_assets or 0
    current_liabilities = latest.current_liabilities or 0

    if current_liabilities <= 0:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "Current ratio ≥ 2.0",
            "details": "Cannot compute current ratio — no current liabilities data"
        }

    current_ratio = current_assets / current_liabilities
    passes = current_ratio >= 2.0

    # Score 0-2: 2 for ≥2.0, 1 for ≥1.5, 0 for <1.5
    if current_ratio >= 2.0:
        score = 2
    elif current_ratio >= 1.5:
        score = 1
    else:
        score = 0

    return {
        "score": score,
        "pass": passes,
        "actual": f"{current_ratio:.2f}",
        "threshold": "Current ratio ≥ 2.0",
        "details": f"Current ratio {current_ratio:.2f} — {'meets' if passes else 'does not meet'} Graham's 2.0 standard"
    }


# ---------------------------------------------------------------------------
# Criterion 3: Earnings Stability (positive EPS all 10 years)
# ---------------------------------------------------------------------------

def analyze_earnings_stability(line_items: list) -> dict:
    """Criterion 3: Positive EPS in each of the last 10 years."""
    if not line_items:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "Positive EPS each of last 10 years",
            "details": "No data available"
        }

    eps_vals = [item.earnings_per_share for item in line_items if item.earnings_per_share is not None]
    if len(eps_vals) < 2:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "Positive EPS each of last 10 years",
            "details": "Insufficient EPS history"
        }

    total = len(eps_vals)
    positive = sum(1 for e in eps_vals if e > 0)
    all_positive = positive == total

    # Score 0-2: 2 for all positive, 1 for ≥80%, 0 otherwise
    if all_positive:
        score = 2
    elif positive >= int(total * 0.8):
        score = 1
    else:
        score = 0

    return {
        "score": score,
        "pass": all_positive,
        "actual": f"{positive}/{total} years positive",
        "threshold": "Positive EPS each of last 10 years",
        "details": f"EPS positive in {positive} of {total} reported periods"
    }


# ---------------------------------------------------------------------------
# Criterion 4: Dividend Record (20+ years uninterrupted)
# ---------------------------------------------------------------------------

def analyze_dividend_record(line_items: list) -> dict:
    """Criterion 4: Uninterrupted dividend payments for 20+ years."""
    if not line_items:
        return {
            "score": 0, "pass": False,
            "actual": "0 years", "threshold": "20+ years uninterrupted dividends",
            "details": "No data available"
        }

    div_vals = [
        (item.dividends_and_other_cash_distributions, item.report_period)
        for item in line_items
        if item.dividends_and_other_cash_distributions is not None
    ]

    if not div_vals:
        return {
            "score": 0, "pass": False,
            "actual": "0 years", "threshold": "20+ years uninterrupted dividends",
            "details": "No dividend data available"
        }

    # Count consecutive years paying dividends (dividends are negative cash flows in this model)
    paying_years = sum(1 for d, _ in div_vals if d < 0)
    total_years = len(div_vals)
    passes = paying_years >= 20

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"{paying_years} of {total_years} available years",
        "threshold": "20+ years uninterrupted dividends",
        "details": f"Dividends paid in {paying_years} of {total_years} reported periods (20-year data availability limited by API)"
    }


# ---------------------------------------------------------------------------
# Criterion 5: Earnings Growth (+33% over 10 years)
# ---------------------------------------------------------------------------

def analyze_earnings_growth(line_items: list) -> dict:
    """Criterion 5: EPS grew by at least 33% from earliest to latest 10-year period."""
    if not line_items:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "+33% EPS over 10 years",
            "details": "No data available"
        }

    eps_vals = [item.earnings_per_share for item in line_items if item.earnings_per_share is not None]
    if len(eps_vals) < 2:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "+33% EPS over 10 years",
            "details": "Insufficient EPS history for growth calculation"
        }

    # line_items sorted newest first; earliest is last
    latest_eps = eps_vals[0]
    earliest_eps = eps_vals[-1]

    if earliest_eps <= 0:
        return {
            "score": 0, "pass": False,
            "actual": "N/A (base EPS ≤ 0)", "threshold": "+33% EPS over 10 years",
            "details": f"Earliest EPS {earliest_eps:.2f} — cannot compute growth from non-positive base"
        }

    growth_pct = (latest_eps - earliest_eps) / abs(earliest_eps) * 100
    passes = growth_pct >= 33.0

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"{growth_pct:+.1f}%",
        "threshold": "+33% EPS over 10 years",
        "details": f"EPS grew from ${earliest_eps:.2f} to ${latest_eps:.2f} ({growth_pct:+.1f}%)"
    }


# ---------------------------------------------------------------------------
# Criterion 6: Moderate P/E (≤ 15)
# ---------------------------------------------------------------------------

def analyze_pe_ratio(metrics: list) -> dict:
    """Criterion 6: P/E ratio ≤ 15 — moderate price relative to earnings."""
    if not metrics:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "P/E ≤ 15",
            "details": "No metrics data available"
        }

    pe_vals = [m.price_to_earnings_ratio for m in metrics if m.price_to_earnings_ratio is not None]
    if not pe_vals:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "P/E ≤ 15",
            "details": "P/E ratio not available in metrics"
        }

    latest_pe = pe_vals[0]
    passes = 0 < latest_pe <= 15

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"{latest_pe:.1f}x",
        "threshold": "P/E ≤ 15",
        "details": f"P/E of {latest_pe:.1f}x {'is within' if passes else 'exceeds'} Graham's 15x ceiling"
    }


# ---------------------------------------------------------------------------
# Criterion 7: Moderate P/B (≤ 1.5, or P/E × P/B ≤ 22.5)
# ---------------------------------------------------------------------------

def analyze_pb_ratio(metrics: list) -> dict:
    """Criterion 7: P/B ≤ 1.5, or P/E × P/B ≤ 22.5 (Graham's combined test)."""
    if not metrics:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "P/B ≤ 1.5 or P/E×P/B ≤ 22.5",
            "details": "No metrics data available"
        }

    pb_vals = [m.price_to_book_ratio for m in metrics if m.price_to_book_ratio is not None]
    pe_vals = [m.price_to_earnings_ratio for m in metrics if m.price_to_earnings_ratio is not None]

    if not pb_vals:
        return {
            "score": 0, "pass": False,
            "actual": "N/A", "threshold": "P/B ≤ 1.5 or P/E×P/B ≤ 22.5",
            "details": "P/B ratio not available"
        }

    latest_pb = pb_vals[0]
    latest_pe = pe_vals[0] if pe_vals else None

    pb_passes = latest_pb <= 1.5
    combined_passes = (latest_pe is not None and latest_pe > 0 and latest_pb > 0
                       and (latest_pe * latest_pb) <= 22.5)
    passes = pb_passes or combined_passes

    if latest_pe is not None and latest_pe > 0:
        combined_val = latest_pe * latest_pb
        actual = f"P/B {latest_pb:.2f}x, P/E×P/B {combined_val:.1f}"
    else:
        actual = f"P/B {latest_pb:.2f}x"

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": actual,
        "threshold": "P/B ≤ 1.5 or P/E×P/B ≤ 22.5",
        "details": f"P/B {latest_pb:.2f}x — {'passes' if passes else 'fails'} Graham's price-to-assets test"
    }


# ---------------------------------------------------------------------------
# Bonus: Graham Number & NCAV
# ---------------------------------------------------------------------------

def calculate_graham_number(line_items: list, market_cap: float) -> dict:
    """Calculate Graham Number and NCAV (bonus metrics, not part of 7-criterion score)."""
    if not line_items or not market_cap or market_cap <= 0:
        return {
            "graham_number": None,
            "ncav": None,
            "ncav_per_share": None,
            "price_per_share": None,
            "margin_of_safety": None,
            "net_net_qualifies": False,
            "details": "Insufficient data for Graham Number / NCAV calculation"
        }

    latest = line_items[0]
    current_assets = latest.current_assets or 0
    total_liabilities = latest.total_liabilities or 0
    book_value_ps = latest.book_value_per_share or 0
    eps = latest.earnings_per_share or 0
    shares_outstanding = latest.outstanding_shares or 0

    price_per_share = market_cap / shares_outstanding if shares_outstanding > 0 else None

    # NCAV
    ncav = current_assets - total_liabilities
    ncav_per_share = ncav / shares_outstanding if shares_outstanding > 0 and ncav > 0 else None
    net_net_qualifies = (
        ncav_per_share is not None and price_per_share is not None
        and price_per_share < ncav_per_share * 0.67
    )

    # Graham Number = √(22.5 × EPS × BVPS)
    graham_number = None
    if eps > 0 and book_value_ps > 0:
        graham_number = math.sqrt(22.5 * eps * book_value_ps)

    # Margin of safety vs Graham Number
    margin_of_safety = None
    if graham_number and price_per_share and price_per_share > 0:
        margin_of_safety = (graham_number - price_per_share) / price_per_share

    return {
        "graham_number": graham_number,
        "ncav": ncav,
        "ncav_per_share": ncav_per_share,
        "price_per_share": price_per_share,
        "margin_of_safety": margin_of_safety,
        "net_net_qualifies": net_net_qualifies,
        "details": (
            f"Graham Number ${graham_number:.2f}" if graham_number else "Graham Number not calculable (EPS or BVPS missing/negative)"
        )
    }


# ---------------------------------------------------------------------------
# Signal Generation
# ---------------------------------------------------------------------------

def generate_signal(criteria_scores: dict, margin_of_safety: float | None) -> dict:
    """Derive investment signal from criteria_passed count and margin of safety."""
    passed = sum(1 for v in criteria_scores.values() if v.get("pass"))
    mos = margin_of_safety or 0

    if passed >= 5 and mos > 0.33:
        signal = "bullish"
        confidence = min(90, 60 + passed * 4 + int(mos * 20))
    elif passed >= 3 or mos > 0:
        signal = "neutral"
        confidence = 40 + passed * 4
    else:
        signal = "bearish"
        confidence = min(80, 60 + (7 - passed) * 4)

    return {
        "signal": signal,
        "confidence": confidence,
        "criteria_passed": passed,
        "criteria_total": 7
    }


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

LINE_ITEMS = [
    "earnings_per_share",
    "revenue",
    "net_income",
    "book_value_per_share",
    "total_assets",
    "total_liabilities",
    "current_assets",
    "current_liabilities",
    "dividends_and_other_cash_distributions",
    "outstanding_shares",
]


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE")
        print("Example: analyze.py AAPL 2026-02-19")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]

    # Fetch data
    metrics = get_financial_metrics(ticker, end_date, "annual", 10)
    market_cap = get_market_cap(ticker, end_date)
    line_items = search_line_items(ticker, LINE_ITEMS, end_date, "annual", 10)

    # 7-criterion defensive investor scorecard
    c1 = analyze_adequacy(line_items)
    c2 = analyze_financial_strength(line_items)
    c3 = analyze_earnings_stability(line_items)
    c4 = analyze_dividend_record(line_items)
    c5 = analyze_earnings_growth(line_items)
    c6 = analyze_pe_ratio(metrics)
    c7 = analyze_pb_ratio(metrics)

    criteria_scores = {
        "1_adequate_size": c1,
        "2_financial_strength": c2,
        "3_earnings_stability": c3,
        "4_dividend_record": c4,
        "5_earnings_growth": c5,
        "6_moderate_pe": c6,
        "7_moderate_pb": c7,
    }

    # Bonus: Graham Number & NCAV
    valuation = calculate_graham_number(line_items, market_cap)

    # Signal
    signal_data = generate_signal(criteria_scores, valuation.get("margin_of_safety"))

    result = {
        "ticker": ticker,
        "signal": signal_data["signal"],
        "confidence": signal_data["confidence"],
        "criteria_passed": signal_data["criteria_passed"],
        "criteria_total": signal_data["criteria_total"],
        "criteria_scores": criteria_scores,
        "graham_number": valuation["graham_number"],
        "ncav": valuation["ncav"],
        "ncav_per_share": valuation["ncav_per_share"],
        "price_per_share": valuation["price_per_share"],
        "margin_of_safety": valuation["margin_of_safety"],
        "net_net_qualifies": valuation["net_net_qualifies"],
        "market_cap": market_cap,
    }

    print(json.dumps(result, indent=2, default=str))
