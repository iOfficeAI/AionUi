#!/usr/bin/env python3
"""
Extract key metrics from all analyst drafts into a summary JSON.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


def extract_from_markdown(text: str, pattern: str) -> str | None:
    """Extract value using regex pattern from markdown text."""
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else None


def extract_macro_metrics(insights_path: Path) -> dict[str, Any]:
    """Extract metrics from macro analyst insights."""
    if not insights_path.exists():
        return {}

    text = insights_path.read_text()

    return {
        "regime": extract_from_markdown(text, r'\*\*Current Regime\*\*:\s*(\w+)'),
        "confidence": extract_from_markdown(text, r'\*\*Confidence\*\*:\s*([\d.]+)'),
        "gdp_growth": extract_from_markdown(text, r'\*\*GDP Growth\*\*:\s*([\d.]+)'),
        "credit_growth": extract_from_markdown(text, r'\*\*Credit Growth\*\*:\s*([\d.]+)'),
        "inflation": extract_from_markdown(text, r'\*\*Inflation.*?\*\*:\s*([\d.]+)'),
    }


def extract_fundamental_metrics(insights_path: Path) -> dict[str, Any]:
    """Extract metrics from fundamental analyst insights."""
    if not insights_path.exists():
        return {}

    text = insights_path.read_text()

    return {
        "health_score": extract_from_markdown(text, r'\*\*Overall\*\*:\s*(\w+)'),
        "roe": extract_from_markdown(text, r'\*\*ROE\*\*:\s*([\d.]+)'),
        "roa": extract_from_markdown(text, r'\*\*ROA\*\*:\s*([\d.]+)'),
        "net_margin": extract_from_markdown(text, r'\*\*Net Margin\*\*:\s*([\d.]+)'),
        "revenue_cagr": extract_from_markdown(text, r'\*\*Revenue CAGR.*?\*\*:\s*([\d.]+)'),
        "debt_equity": extract_from_markdown(text, r'\*\*Total Debt/Equity\*\*:\s*([\d.]+)'),
    }


def extract_factor_metrics(insights_path: Path) -> dict[str, Any]:
    """Extract metrics from factor analyst insights."""
    if not insights_path.exists():
        return {}

    text = insights_path.read_text()

    return {
        "composite_score": extract_from_markdown(text, r'\*\*Composite Score\*\*:\s*([-\d.]+)'),
        "percentile_rank": extract_from_markdown(text, r'\*\*Percentile Rank\*\*:\s*([\d]+)'),
        "value_zscore": extract_from_markdown(text, r'### Value.*?z-score:\s*([-\d.]+)'),
        "momentum_zscore": extract_from_markdown(text, r'### Momentum.*?z-score:\s*([-\d.]+)'),
        "quality_zscore": extract_from_markdown(text, r'### Quality.*?z-score:\s*([-\d.]+)'),
    }


def extract_technical_metrics(insights_path: Path) -> dict[str, Any]:
    """Extract metrics from technical analyst insights."""
    if not insights_path.exists():
        return {}

    text = insights_path.read_text()

    return {
        "trend": extract_from_markdown(text, r'\*\*Trend\*\*:\s*(\w+)'),
        "signal": extract_from_markdown(text, r'\*\*Recommendation\*\*:\s*(\w+)'),
        "rsi": extract_from_markdown(text, r'\*\*RSI.*?\*\*:\s*([\d.]+)'),
        "support": extract_from_markdown(text, r'\*\*Support\*\*:\s*([\d,]+)'),
        "resistance": extract_from_markdown(text, r'\*\*Resistance\*\*:\s*([\d,]+)'),
    }


def extract_valuation_metrics(insights_path: Path) -> dict[str, Any]:
    """Extract metrics from valuation analyst insights."""
    if not insights_path.exists():
        return {}

    text = insights_path.read_text()

    return {
        "fair_value": extract_from_markdown(text, r'\*\*Weighted Fair Value\*\*:\s*([\d,]+)'),
        "current_price": extract_from_markdown(text, r'\*\*Current Price\*\*:\s*([\d,]+)'),
        "upside": extract_from_markdown(text, r'\*\*Upside Potential\*\*:\s*([+-]?[\d.]+)'),
        "rating": extract_from_markdown(text, r'\*\*Rating\*\*:\s*(\w+)'),
        "target_price": extract_from_markdown(text, r'\*\*Target Price\*\*:\s*([\d,]+)'),
    }


def extract_sentiment_metrics(insights_path: Path) -> dict[str, Any]:
    """Extract metrics from sentiment analyst insights."""
    if not insights_path.exists():
        return {}

    text = insights_path.read_text()

    return {
        "sentiment": extract_from_markdown(text, r'\*\*Score\*\*:\s*(\w+)'),
        "confidence": extract_from_markdown(text, r'\*\*Confidence\*\*:\s*(\w+)'),
    }


def load_json_data(data_dir: Path) -> dict[str, Any]:
    """Load all JSON files from data directory."""
    data = {}
    if not data_dir.exists():
        return data

    for json_file in data_dir.glob("*.json"):
        try:
            with open(json_file) as f:
                data[json_file.stem] = json.load(f)
        except Exception:
            pass  # Skip malformed JSON

    return data


def extract_metrics(drafts_dir: Path) -> dict[str, Any]:
    """Extract metrics from all analyst drafts."""
    metrics = {}

    analysts = {
        "macro": extract_macro_metrics,
        "fundamentals": extract_fundamental_metrics,
        "factors": extract_factor_metrics,
        "technicals": extract_technical_metrics,
        "valuation": extract_valuation_metrics,
        "sentiment": extract_sentiment_metrics,
    }

    for analyst_name, extractor_func in analysts.items():
        analyst_dir = drafts_dir / analyst_name
        insights_file = analyst_dir / "insights.md"
        data_dir = analyst_dir / "data"

        analyst_metrics = {}

        # Extract from insights markdown
        if insights_file.exists():
            analyst_metrics["insights"] = extractor_func(insights_file)

        # Load JSON data files
        if data_dir.exists():
            analyst_metrics["data"] = load_json_data(data_dir)

        # Check if analyst produced any output
        if analyst_metrics:
            metrics[analyst_name] = analyst_metrics

    return metrics


def main():
    parser = argparse.ArgumentParser(
        description="Extract key metrics from analyst drafts"
    )
    parser.add_argument("--drafts", type=str, required=True,
                       help="Path to drafts directory")
    parser.add_argument("--output", type=str, required=True,
                       help="Output JSON file path")

    args = parser.parse_args()

    drafts_dir = Path(args.drafts)
    if not drafts_dir.exists():
        print(f"Error: Drafts directory not found: {drafts_dir}", file=sys.stderr)
        return 1

    # Extract metrics
    metrics = extract_metrics(drafts_dir)

    # Write output
    with open(args.output, 'w') as f:
        json.dump(metrics, f, indent=2)

    print(f"Extracted metrics from {len(metrics)} analysts")
    print(f"Output saved to: {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
