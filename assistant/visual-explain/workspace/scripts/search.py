#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Visual Explain Search - BM25 search for visualization techniques, palettes, and references
Usage: python3 search.py "<query>" [--domain <domain>] [-n <max_results>]

Domains: technique, palette, reference
"""

import argparse
from core import CSV_CONFIG, MAX_RESULTS, search


def format_output(result):
    """Format results for Claude consumption (token-optimized)"""
    if "error" in result:
        return f"Error: {result['error']}"

    output = []
    output.append(f"## Visual Explain Search Results")
    output.append(f"**Domain:** {result['domain']} | **Query:** {result['query']}")
    output.append(f"**Source:** {result['file']} | **Found:** {result['count']} results\n")

    for i, row in enumerate(result['results'], 1):
        output.append(f"### Result {i}")
        for key, value in row.items():
            value_str = str(value)
            if len(value_str) > 500:
                value_str = value_str[:500] + "..."
            output.append(f"- **{key}:** {value_str}")
        output.append("")

    return "\n".join(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Visual Explain Search")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--domain", "-d", choices=list(CSV_CONFIG.keys()), help="Search domain (technique, palette, reference)")
    parser.add_argument("--max-results", "-n", type=int, default=MAX_RESULTS, help="Max results (default: 3)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    result = search(args.query, args.domain, args.max_results)

    if args.json:
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(format_output(result))
