#!/usr/bin/env python3
"""
Extract key metrics from agent notebooks for programmatic access.

Usage:
    python scripts/extract_agent_metrics.py analyses/VCB_2026-02-20/
"""

import argparse
import json
import re
from pathlib import Path
from typing import Dict, Any


def extract_kv_from_markdown(md_content: str) -> Dict[str, str]:
    """
    Extract key-value pairs from notebookmd-generated markdown.

    Looks for tables in the format:
    | Key | Value |
    |-----|-------|
    | ROE | 22.5% |
    """
    kv_pairs = {}

    # Find all markdown tables
    table_pattern = r'\|([^|]+)\|([^|]+)\|'
    lines = md_content.split('\n')

    in_table = False
    for i, line in enumerate(lines):
        # Skip header separator lines (|-----|-----|)
        if re.match(r'^\|[\s-]+\|[\s-]+\|', line):
            in_table = True
            continue

        # Extract key-value pairs from table rows
        if in_table and '|' in line:
            match = re.match(table_pattern, line)
            if match:
                key = match.group(1).strip().strip('*')
                value = match.group(2).strip().strip('*')
                # Skip header rows
                if key.lower() not in ['key', 'metric', 'indicator']:
                    kv_pairs[key] = value
        elif in_table and '|' not in line:
            in_table = False

    return kv_pairs


def extract_agent_metrics(analysis_dir: Path) -> Dict[str, Any]:
    """
    Extract metrics from all agent notebooks in an analysis directory.

    Args:
        analysis_dir: Path to analysis directory (e.g., analyses/VCB_2026-02-20/)

    Returns:
        Dictionary with metrics from each agent
    """
    drafts_dir = analysis_dir / 'drafts'
    if not drafts_dir.exists():
        raise FileNotFoundError(f"Drafts directory not found: {drafts_dir}")

    agents = ['macro', 'fundamentals', 'factors', 'technicals', 'valuation', 'sentiment']
    metrics = {}

    for agent in agents:
        insights_path = drafts_dir / agent / 'insights.md'
        if not insights_path.exists():
            print(f"  ⚠️  {agent}: insights.md not found")
            continue

        md_content = insights_path.read_text(encoding='utf-8')
        agent_metrics = extract_kv_from_markdown(md_content)

        if agent_metrics:
            metrics[agent] = agent_metrics
            print(f"  ✓ {agent}: {len(agent_metrics)} metrics extracted")
        else:
            print(f"  ⚠️  {agent}: no metrics found")

    return metrics


def main():
    parser = argparse.ArgumentParser(description='Extract metrics from agent notebooks')
    parser.add_argument('analysis_dir', type=Path, help='Analysis directory path')
    parser.add_argument('-o', '--output', type=Path, help='Output JSON file (default: metrics.json)')
    args = parser.parse_args()

    analysis_dir = args.analysis_dir
    output_file = args.output or (analysis_dir / 'metrics.json')

    print(f"Extracting metrics from: {analysis_dir}")
    print()

    try:
        metrics = extract_agent_metrics(analysis_dir)

        # Save to JSON
        output_file.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
        print()
        print(f"✓ Metrics saved to: {output_file}")
        print(f"  Total agents: {len(metrics)}")
        print(f"  Total metrics: {sum(len(m) for m in metrics.values())}")

    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

    return 0


if __name__ == '__main__':
    exit(main())
