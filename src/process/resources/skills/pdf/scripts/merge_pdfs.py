#!/usr/bin/env python3
"""
Merge multiple PDF files into one.

Usage: python merge_pdfs.py <output.pdf> <input1.pdf> <input2.pdf> ...
"""

import sys
from pypdf import PdfReader, PdfWriter


def merge_pdfs(output_path: str, input_paths: list) -> None:
    """Merge multiple PDFs into one."""
    writer = PdfWriter()

    total_pages = 0
    for pdf_path in input_paths:
        try:
            reader = PdfReader(pdf_path)
            for page in reader.pages:
                writer.add_page(page)
            total_pages += len(reader.pages)
            print(f"  Added {len(reader.pages)} page(s) from {pdf_path}")
        except Exception as e:
            print(f"  Error reading {pdf_path}: {e}")

    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"\nMerged {len(input_paths)} PDFs ({total_pages} total pages) into {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python merge_pdfs.py <output.pdf> <input1.pdf> <input2.pdf> ...")
        sys.exit(1)

    output = sys.argv[1]
    inputs = sys.argv[2:]

    print(f"Merging {len(inputs)} PDFs...")
    merge_pdfs(output, inputs)
