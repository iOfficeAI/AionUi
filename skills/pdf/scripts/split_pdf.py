#!/usr/bin/env python3
"""
Split a PDF into individual pages or page ranges.

Usage:
  python split_pdf.py <input.pdf> <output_dir>              # Split all pages
  python split_pdf.py <input.pdf> <output.pdf> 1-5          # Extract pages 1-5
  python split_pdf.py <input.pdf> <output.pdf> 1,3,5        # Extract specific pages
"""

import os
import sys
from pypdf import PdfReader, PdfWriter


def parse_page_range(range_str: str, total_pages: int) -> list:
    """Parse page range string into list of page numbers (0-indexed)."""
    pages = []
    for part in range_str.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-')
            start = int(start) - 1  # Convert to 0-indexed
            end = int(end)
            pages.extend(range(start, min(end, total_pages)))
        else:
            page = int(part) - 1  # Convert to 0-indexed
            if 0 <= page < total_pages:
                pages.append(page)
    return pages


def split_all_pages(input_path: str, output_dir: str) -> None:
    """Split PDF into individual pages."""
    os.makedirs(output_dir, exist_ok=True)
    reader = PdfReader(input_path)

    for i, page in enumerate(reader.pages, start=1):
        writer = PdfWriter()
        writer.add_page(page)
        output_path = os.path.join(output_dir, f"page_{i}.pdf")
        with open(output_path, 'wb') as f:
            writer.write(f)
        print(f"  Created: {output_path}")

    print(f"\nSplit {len(reader.pages)} pages into {output_dir}")


def extract_pages(input_path: str, output_path: str, page_range: str) -> None:
    """Extract specific pages from PDF."""
    reader = PdfReader(input_path)
    pages = parse_page_range(page_range, len(reader.pages))

    writer = PdfWriter()
    for page_num in pages:
        writer.add_page(reader.pages[page_num])

    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"Extracted {len(pages)} page(s) to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python split_pdf.py <input.pdf> <output_dir>              # Split all pages")
        print("  python split_pdf.py <input.pdf> <output.pdf> 1-5          # Extract pages 1-5")
        print("  python split_pdf.py <input.pdf> <output.pdf> 1,3,5        # Extract specific pages")
        sys.exit(1)

    input_path = sys.argv[1]
    output = sys.argv[2]

    if len(sys.argv) == 3:
        # Split all pages into directory
        split_all_pages(input_path, output)
    else:
        # Extract specific pages
        page_range = sys.argv[3]
        extract_pages(input_path, output, page_range)
