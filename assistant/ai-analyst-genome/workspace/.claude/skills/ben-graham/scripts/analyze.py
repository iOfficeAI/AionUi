#!/usr/bin/env python3
"""CANSLIM growth-momentum analysis — William O'Neil framework.

Usage: python .claude/skills/canslim/scripts/analyze.py TICKER END_DATE
Example: python .claude/skills/canslim/scripts/analyze.py NVDA 2026-02-19
"""
import sys
import json
from datetime import datetime, timedelta

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics, get_prices, search_line_items


# ---------------------------------------------------------------------------
# C — Current quarterly earnings growth (EPS > 25% YoY most recent quarter)
# ---------------------------------------------------------------------------

def analyze_current_earnings(quarterly_items: list) -> dict:
    """C factor: Most recent quarter EPS growth > 25% year-over-year."""
    if not quarterly_items or len(quarterly_items) < 5:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": ">25% quarterly EPS growth YoY",
            "details": "Insufficient quarterly EPS history (need at least 5 quarters)"
        }

    eps_vals = [
        (item.earnings_per_share, item.report_period)
        for item in quarterly_items
        if item.earnings_per_share is not None
    ]

    if len(eps_vals) < 5:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": ">25% quarterly EPS growth YoY",
            "details": "Insufficient quarterly EPS data"
        }

    # Most recent quarter vs same quarter one year ago (4 quarters back)
    latest_eps, latest_period = eps_vals[0]
    yoy_eps, yoy_period = eps_vals[4]

    if yoy_eps == 0:
        return {
            "score": 0, "pass": False,
            "actual": "N/A (base EPS = 0)",
            "threshold": ">25% quarterly EPS growth YoY",
            "details": f"Prior-year quarter EPS was 0, cannot compute YoY growth"
        }

    if yoy_eps < 0:
        # Negative base: if latest is positive, it's a turnaround (pass), else fail
        if latest_eps > 0:
            passes = True
            actual = f"Turnaround: ${yoy_eps:.2f} → ${latest_eps:.2f}"
            details = f"EPS turned from ${yoy_eps:.2f} to ${latest_eps:.2f} (turnaround qualifies)"
        else:
            passes = False
            actual = f"${yoy_eps:.2f} → ${latest_eps:.2f}"
            details = f"EPS remains negative year-over-year"
        return {
            "score": 1 if passes else 0, "pass": passes,
            "actual": actual, "threshold": ">25% quarterly EPS growth YoY",
            "details": details
        }

    growth_pct = (latest_eps - yoy_eps) / abs(yoy_eps) * 100
    passes = growth_pct >= 25.0

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"{growth_pct:+.1f}% EPS growth YoY (${yoy_eps:.2f} → ${latest_eps:.2f})",
        "threshold": ">25% quarterly EPS growth YoY",
        "details": (
            f"Most recent quarter ({latest_period}) EPS ${latest_eps:.2f} vs "
            f"prior year ({yoy_period}) EPS ${yoy_eps:.2f}: {growth_pct:+.1f}% growth"
        )
    }


# ---------------------------------------------------------------------------
# A — Annual earnings growth (EPS CAGR > 25% over 3-5 years)
# ---------------------------------------------------------------------------

def analyze_annual_earnings(annual_items: list) -> dict:
    """A factor: Annual EPS CAGR > 25% over 3-5 years."""
    if not annual_items:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": ">25% annual EPS CAGR over 3-5 years",
            "details": "No annual EPS data available"
        }

    eps_vals = [
        (item.earnings_per_share, item.report_period)
        for item in annual_items
        if item.earnings_per_share is not None
    ]

    if len(eps_vals) < 2:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": ">25% annual EPS CAGR over 3-5 years",
            "details": "Insufficient annual EPS history"
        }

    latest_eps, latest_period = eps_vals[0]
    # Use up to 5 years back; take whatever is available
    oldest_eps, oldest_period = eps_vals[-1]
    years = len(eps_vals) - 1  # number of annual intervals

    if oldest_eps <= 0:
        return {
            "score": 0, "pass": False,
            "actual": "N/A (base EPS ≤ 0)",
            "threshold": ">25% annual EPS CAGR over 3-5 years",
            "details": f"Earliest EPS {oldest_eps:.2f} — cannot compute CAGR from non-positive base"
        }

    if latest_eps <= 0:
        return {
            "score": 0, "pass": False,
            "actual": f"${latest_eps:.2f} (negative)",
            "threshold": ">25% annual EPS CAGR over 3-5 years",
            "details": f"Current EPS is negative — no earnings growth"
        }

    cagr = ((latest_eps / oldest_eps) ** (1 / years) - 1) * 100
    passes = cagr >= 25.0

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"{cagr:.1f}% CAGR over {years}yr (${oldest_eps:.2f} → ${latest_eps:.2f})",
        "threshold": ">25% annual EPS CAGR over 3-5 years",
        "details": (
            f"Annual EPS CAGR {cagr:.1f}% over {years} years "
            f"({oldest_period} to {latest_period})"
        )
    }


# ---------------------------------------------------------------------------
# N — New: product / high / management (price within 5% of 52-week high)
# ---------------------------------------------------------------------------

def analyze_new_high(prices: list) -> dict:
    """N factor: Price within 5% of 52-week high (breakout proxy)."""
    if not prices or len(prices) < 20:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": "Price within 5% of 52-week high",
            "details": "Insufficient price history"
        }

    # Use up to last 252 trading days for 52-week high
    window = prices[-252:] if len(prices) >= 252 else prices
    high_52w = max(p.high for p in window)
    current_price = prices[-1].close

    if high_52w <= 0:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": "Price within 5% of 52-week high",
            "details": "Cannot determine 52-week high"
        }

    proximity_pct = (current_price / high_52w) * 100
    passes = proximity_pct >= 95.0  # within 5% of 52-week high

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"${current_price:.2f} ({proximity_pct:.1f}% of 52W high ${high_52w:.2f})",
        "threshold": "Price within 5% of 52-week high (≥95%)",
        "details": (
            f"Current price ${current_price:.2f} is {proximity_pct:.1f}% of "
            f"52-week high ${high_52w:.2f} — "
            f"{'near highs (breakout zone)' if passes else 'below breakout zone'}"
        )
    }


# ---------------------------------------------------------------------------
# S — Supply and demand / volume (accumulation signal)
# ---------------------------------------------------------------------------

def analyze_supply_demand(prices: list) -> dict:
    """S factor: Recent volume > 50-day average AND up-volume days > down-volume days."""
    if not prices or len(prices) < 10:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": "Volume accumulation: recent vol > avg, up days > down days",
            "details": "Insufficient price/volume history"
        }

    # 50-day average volume
    window_50 = prices[-50:] if len(prices) >= 50 else prices
    avg_volume = sum(p.volume for p in window_50) / len(window_50)

    # Recent 10-day volume vs average
    recent = prices[-10:]
    recent_avg_volume = sum(p.volume for p in recent) / len(recent)
    volume_above_avg = recent_avg_volume > avg_volume

    # Up-volume days vs down-volume days in recent 20 sessions
    recent_20 = prices[-20:] if len(prices) >= 20 else prices
    up_days = sum(1 for p in recent_20 if p.close > p.open and p.volume > avg_volume)
    down_days = sum(1 for p in recent_20 if p.close < p.open and p.volume > avg_volume)

    accumulating = up_days > down_days
    passes = volume_above_avg and accumulating

    vol_ratio = recent_avg_volume / avg_volume if avg_volume > 0 else 0

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": (
            f"Recent vol {vol_ratio:.2f}x avg; "
            f"up-vol days {up_days} vs down-vol days {down_days} (last 20)"
        ),
        "threshold": "Recent vol > 50-day avg AND up-vol days > down-vol days",
        "details": (
            f"10-day avg volume is {vol_ratio:.2f}x the 50-day average. "
            f"In last 20 sessions: {up_days} accumulation days vs {down_days} distribution days. "
            f"{'Accumulation pattern present.' if accumulating else 'Distribution pattern detected.'}"
        )
    }


# ---------------------------------------------------------------------------
# L — Leader vs. laggard (12-month return proxy for RS Rating)
# ---------------------------------------------------------------------------

def analyze_leader(prices: list) -> dict:
    """L factor: 12-month return > 0 (proxy for relative strength leadership)."""
    if not prices or len(prices) < 20:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": "Positive 12-month return (relative strength proxy)",
            "details": "Insufficient price history"
        }

    current_price = prices[-1].close

    # Use ~252 trading days for 12-month return
    if len(prices) >= 252:
        price_12m_ago = prices[-252].close
        period_desc = "12 months"
    else:
        price_12m_ago = prices[0].close
        period_desc = f"{len(prices)} trading days"

    if price_12m_ago <= 0:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": "Positive 12-month return",
            "details": "Cannot compute return — invalid base price"
        }

    return_pct = (current_price / price_12m_ago - 1) * 100
    passes = return_pct > 0

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"{return_pct:+.1f}% over {period_desc}",
        "threshold": "Positive 12-month return (RS proxy)",
        "details": (
            f"{period_desc.capitalize()} return: {return_pct:+.1f}% "
            f"(${price_12m_ago:.2f} → ${current_price:.2f}). "
            f"{'Positive momentum — leader.' if passes else 'Negative momentum — laggard.'}"
        )
    }


# ---------------------------------------------------------------------------
# I — Institutional sponsorship
# ---------------------------------------------------------------------------

def analyze_institutional(metrics: list) -> dict:
    """I factor: Institutional ownership present and increasing (approximated from metrics)."""
    if not metrics:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": "Institutional ownership > 0% (and increasing)",
            "details": "No metrics data available"
        }

    # Check for institutional_ownership_percentage via dynamic model fields
    inst_vals = []
    for m in metrics:
        val = getattr(m, 'institutional_ownership_percentage', None)
        if val is None:
            # Try model_extra dict (pydantic extra fields)
            if hasattr(m, 'model_extra') and m.model_extra:
                val = m.model_extra.get('institutional_ownership_percentage')
        if val is not None:
            inst_vals.append(val)

    if not inst_vals:
        # Fall back to market cap as a size proxy (larger companies more likely to have institutional interest)
        mc_vals = [m.market_cap for m in metrics if m.market_cap is not None]
        if mc_vals and mc_vals[0] and mc_vals[0] > 1e9:
            return {
                "score": 1, "pass": True,
                "actual": f"Approximated: market cap ${mc_vals[0] / 1e9:.1f}B (institutional ownership data unavailable)",
                "threshold": "Institutional ownership > 0% (approximated for large caps)",
                "details": (
                    f"Direct institutional ownership data not available via API. "
                    f"Market cap ${mc_vals[0] / 1e9:.1f}B — large-cap stocks typically have "
                    f"significant institutional ownership. Flagged as approximated."
                )
            }
        return {
            "score": 0, "pass": False,
            "actual": "Not available",
            "threshold": "Institutional ownership > 0%",
            "details": "Institutional ownership data not available for this ticker"
        }

    latest_inst = inst_vals[0]
    passes = latest_inst > 0

    # Check trend if we have multiple data points
    trend = ""
    if len(inst_vals) >= 2:
        if inst_vals[0] > inst_vals[-1]:
            trend = " (increasing)"
        elif inst_vals[0] < inst_vals[-1]:
            trend = " (decreasing)"
        else:
            trend = " (stable)"

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": f"{latest_inst:.1f}%{trend}",
        "threshold": "Institutional ownership > 0% and increasing",
        "details": f"Institutional ownership at {latest_inst:.1f}%{trend}"
    }


# ---------------------------------------------------------------------------
# M — Market direction (200-day SMA proxy)
# ---------------------------------------------------------------------------

def analyze_market_direction(prices: list) -> dict:
    """M factor: Current price above 200-day simple moving average."""
    if not prices or len(prices) < 20:
        return {
            "score": 0, "pass": False,
            "actual": "N/A",
            "threshold": "Price above 200-day SMA",
            "details": "Insufficient price history"
        }

    current_price = prices[-1].close

    # 200-day SMA (use whatever history we have, minimum 20 days)
    window = prices[-200:] if len(prices) >= 200 else prices
    sma = sum(p.close for p in window) / len(window)
    period_label = f"{len(window)}-day" if len(window) < 200 else "200-day"

    passes = current_price > sma
    pct_above = (current_price / sma - 1) * 100

    return {
        "score": 1 if passes else 0,
        "pass": passes,
        "actual": (
            f"${current_price:.2f} vs {period_label} SMA ${sma:.2f} "
            f"({pct_above:+.1f}%)"
        ),
        "threshold": "Price above 200-day SMA",
        "details": (
            f"Current price ${current_price:.2f} is {pct_above:+.1f}% "
            f"{'above' if passes else 'below'} the {period_label} SMA ${sma:.2f}. "
            f"{'Uptrend confirmed.' if passes else 'Downtrend — O\\'Neil: do not fight the tape.'}"
        )
    }


# ---------------------------------------------------------------------------
# Signal Generation
# ---------------------------------------------------------------------------

def generate_signal(factor_results: dict) -> dict:
    """Derive CANSLIM signal from factor scores."""
    score = sum(v["score"] for v in factor_results.values())
    max_score = len(factor_results)

    if score >= 6:
        signal = "bullish"
        confidence = 75 + (score - 6) * 15  # 75 for 6/7, 90 for 7/7
    elif score >= 4:
        signal = "neutral"
        confidence = 50 + (score - 4) * 7   # 50 for 4/7, 64 for 5/7
    else:
        signal = "bearish"
        confidence = 60 + (3 - score) * 7   # 60 for 3/7, up to ~81 for 0/7

    confidence = min(confidence, 90)

    passed_letters = [k for k, v in factor_results.items() if v["pass"]]
    failed_letters = [k for k, v in factor_results.items() if not v["pass"]]

    summary_parts = [f"{score}/{max_score} CANSLIM criteria pass."]
    if passed_letters:
        summary_parts.append(f"Pass: {', '.join(passed_letters)}.")
    if failed_letters:
        summary_parts.append(f"Fail: {', '.join(failed_letters)}.")

    if signal == "bullish":
        summary_parts.append("Strong growth-momentum stock meeting O'Neil's criteria.")
    elif signal == "neutral":
        summary_parts.append("Mixed signals — not a full CANSLIM setup.")
    else:
        summary_parts.append("Does not meet CANSLIM growth-momentum criteria.")

    return {
        "signal": signal,
        "confidence": confidence,
        "score": score,
        "max_score": max_score,
        "canslim_summary": " ".join(summary_parts)
    }


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE")
        print("Example: analyze.py NVDA 2026-02-19")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]

    # Date calculations
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    start_dt = end_dt - timedelta(days=400)  # ~13 months for 12M return + buffer
    start_date = start_dt.strftime("%Y-%m-%d")

    # Fetch data
    metrics = get_financial_metrics(ticker, end_date, "annual", 5)
    prices = get_prices(ticker, start_date, end_date)
    quarterly_items = search_line_items(ticker, ["earnings_per_share"], end_date, "quarterly", 8)
    annual_items = search_line_items(ticker, ["earnings_per_share"], end_date, "annual", 5)

    price_list = prices.prices if prices and hasattr(prices, 'prices') else []

    # Compute all 7 CANSLIM factors
    factor_C = analyze_current_earnings(quarterly_items)
    factor_A = analyze_annual_earnings(annual_items)
    factor_N = analyze_new_high(price_list)
    factor_S = analyze_supply_demand(price_list)
    factor_L = analyze_leader(price_list)
    factor_I = analyze_institutional(metrics)
    factor_M = analyze_market_direction(price_list)

    factors = {
        "C": factor_C,
        "A": factor_A,
        "N": factor_N,
        "S": factor_S,
        "L": factor_L,
        "I": factor_I,
        "M": factor_M,
    }

    signal_data = generate_signal(factors)

    result = {
        "ticker": ticker,
        "signal": signal_data["signal"],
        "confidence": signal_data["confidence"],
        "score": signal_data["score"],
        "max_score": signal_data["max_score"],
        "factors": factors,
        "canslim_summary": signal_data["canslim_summary"],
    }

    print(json.dumps(result, indent=2, default=str))
