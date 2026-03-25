#!/usr/bin/env python3
"""
Check bounding boxes in fields.json for intersections and minimum heights.

Usage: python check_bounding_boxes.py <fields.json>

Validates:
- No label and entry bounding boxes intersect
- Entry bounding boxes are tall enough for text (minimum 15px)
"""

import json
import sys


def boxes_intersect(box1: list, box2: list) -> bool:
    """Check if two bounding boxes [left, top, right, bottom] intersect."""
    if not box1 or not box2:
        return False

    left1, top1, right1, bottom1 = box1
    left2, top2, right2, bottom2 = box2

    # Check for no intersection
    if right1 < left2 or right2 < left1:
        return False
    if bottom1 < top2 or bottom2 < top1:
        return False

    return True


def check_bounding_boxes(json_path: str) -> bool:
    """Check bounding boxes for issues."""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    errors = []
    MIN_HEIGHT = 15  # Minimum height in pixels for text entry

    form_fields = data.get('form_fields', [])

    for i, field in enumerate(form_fields):
        label_box = field.get('label_bounding_box')
        entry_box = field.get('entry_bounding_box')
        description = field.get('description', f'Field {i}')
        page = field.get('page_number', 1)

        # Check for intersection
        if label_box and entry_box and boxes_intersect(label_box, entry_box):
            errors.append(f"Page {page}: Label and entry boxes intersect for '{description}'")

        # Check minimum height
        if entry_box:
            height = entry_box[3] - entry_box[1]  # bottom - top
            if height < MIN_HEIGHT:
                errors.append(f"Page {page}: Entry box too short ({height}px < {MIN_HEIGHT}px) for '{description}'")

    if errors:
        print("Bounding box errors found:")
        for error in errors:
            print(f"  ✗ {error}")
        return False
    else:
        print("✓ All bounding boxes are valid")
        return True


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python check_bounding_boxes.py <fields.json>")
        sys.exit(1)

    valid = check_bounding_boxes(sys.argv[1])
    sys.exit(0 if valid else 1)
