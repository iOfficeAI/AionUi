#!/usr/bin/env python3
"""
Extract form field information from a fillable PDF.

Usage: python extract_form_field_info.py <input.pdf> <output.json>

Creates a JSON file with field information including:
- field_id: unique identifier
- page: page number (1-based)
- rect: bounding box [left, bottom, right, top]
- type: text, checkbox, radio_group, or choice
"""

import json
import sys
from pypdf import PdfReader


def extract_form_fields(pdf_path: str, output_path: str) -> None:
    """Extract form field information to JSON."""
    reader = PdfReader(pdf_path)
    fields_info = []

    # Get form fields
    fields = reader.get_fields()
    if not fields:
        print("No form fields found in this PDF.")
        return

    for name, field in fields.items():
        field_type = str(field.get('/FT', '/Tx'))
        rect = field.get('/Rect', [0, 0, 0, 0])

        # Determine page number
        page_num = 1
        if '/P' in field:
            # Try to find page reference
            for i, page in enumerate(reader.pages):
                if page.indirect_reference == field['/P']:
                    page_num = i + 1
                    break

        field_info = {
            "field_id": name,
            "page": page_num,
            "rect": [float(x) for x in rect] if rect else [0, 0, 0, 0],
        }

        # Determine field type
        if field_type == '/Btn':
            # Check if checkbox or radio
            if '/Ff' in field and (int(field.get('/Ff', 0)) & (1 << 15)):
                field_info["type"] = "radio_group"
                # Extract radio options
                field_info["radio_options"] = []
                if '/Kids' in field:
                    for kid in field['/Kids']:
                        kid_obj = kid.get_object() if hasattr(kid, 'get_object') else kid
                        option_rect = kid_obj.get('/Rect', [0, 0, 0, 0])
                        ap_dict = kid_obj.get('/AP', {})
                        if '/N' in ap_dict:
                            for key in ap_dict['/N'].keys():
                                if key != '/Off':
                                    field_info["radio_options"].append({
                                        "value": key,
                                        "rect": [float(x) for x in option_rect] if option_rect else None
                                    })
            else:
                field_info["type"] = "checkbox"
                # Get checked/unchecked values
                field_info["checked_value"] = "/Yes"
                field_info["unchecked_value"] = "/Off"
                if '/AP' in field and '/N' in field['/AP']:
                    for key in field['/AP']['/N'].keys():
                        if key != '/Off':
                            field_info["checked_value"] = key
        elif field_type == '/Ch':
            field_info["type"] = "choice"
            # Extract choice options
            options = field.get('/Opt', [])
            field_info["choice_options"] = []
            for opt in options:
                if isinstance(opt, list):
                    field_info["choice_options"].append({
                        "value": str(opt[0]) if opt else "",
                        "text": str(opt[1]) if len(opt) > 1 else str(opt[0])
                    })
                else:
                    field_info["choice_options"].append({
                        "value": str(opt),
                        "text": str(opt)
                    })
        else:
            field_info["type"] = "text"

        fields_info.append(field_info)

    # Write to JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(fields_info, f, indent=2, ensure_ascii=False)

    print(f"Extracted {len(fields_info)} field(s) to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python extract_form_field_info.py <input.pdf> <output.json>")
        sys.exit(1)

    extract_form_fields(sys.argv[1], sys.argv[2])
