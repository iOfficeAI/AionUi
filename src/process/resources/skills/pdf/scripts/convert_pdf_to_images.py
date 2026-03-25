#!/usr/bin/env python3
"""
Convert PDF pages to PNG images.

Usage: python convert_pdf_to_images.py <input.pdf> <output_directory>

Creates one PNG image per page: page_1.png, page_2.png, etc.

Dependencies: pip install pdf2image
Also requires: poppler-utils (brew install poppler on macOS)
"""

import os
import sys


def convert_pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 150) -> None:
    """Convert PDF pages to PNG images."""
    try:
        from pdf2image import convert_from_path
    except ImportError:
        print("Error: pdf2image is required. Install with: pip install pdf2image")
        print("Also requires poppler: brew install poppler (macOS) or apt-get install poppler-utils (Linux)")
        sys.exit(1)

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    print(f"Converting {pdf_path} to images...")

    # Convert PDF to images
    images = convert_from_path(pdf_path, dpi=dpi)

    for i, image in enumerate(images, start=1):
        output_path = os.path.join(output_dir, f"page_{i}.png")
        image.save(output_path, "PNG")
        print(f"  Created: {output_path} ({image.width}x{image.height})")

    print(f"\nConverted {len(images)} page(s) to {output_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert_pdf_to_images.py <input.pdf> <output_directory> [dpi]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 150

    convert_pdf_to_images(pdf_path, output_dir, dpi)
