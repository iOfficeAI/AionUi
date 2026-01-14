#!/usr/bin/env python3
"""
Create validation image with bounding box overlays.

Usage: python create_validation_image.py <page_number> <fields.json> <input_image> <output_image>

Creates an image with:
- Red rectangles for entry bounding boxes (where text will be entered)
- Blue rectangles for label bounding boxes (label text areas)
"""

import json
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)


def create_validation_image(page_num: int, json_path: str, input_path: str, output_path: str) -> None:
    """Create validation image with bounding box overlays."""
    # Load fields data
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Open image
    img = Image.open(input_path)
    draw = ImageDraw.Draw(img)

    # Filter fields for this page
    form_fields = data.get('form_fields', [])
    page_fields = [f for f in form_fields if f.get('page_number', 1) == page_num]

    # Draw bounding boxes
    for field in page_fields:
        # Draw entry box in red
        entry_box = field.get('entry_bounding_box')
        if entry_box:
            left, top, right, bottom = entry_box
            draw.rectangle([left, top, right, bottom], outline='red', width=2)

        # Draw label box in blue
        label_box = field.get('label_bounding_box')
        if label_box:
            left, top, right, bottom = label_box
            draw.rectangle([left, top, right, bottom], outline='blue', width=2)

    # Save output
    img.save(output_path)
    print(f"Created validation image: {output_path}")
    print(f"  - Red boxes: {sum(1 for f in page_fields if f.get('entry_bounding_box'))} entry areas")
    print(f"  - Blue boxes: {sum(1 for f in page_fields if f.get('label_bounding_box'))} label areas")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python create_validation_image.py <page_number> <fields.json> <input_image> <output_image>")
        sys.exit(1)

    page_num = int(sys.argv[1])
    json_path = sys.argv[2]
    input_path = sys.argv[3]
    output_path = sys.argv[4]

    create_validation_image(page_num, json_path, input_path, output_path)
