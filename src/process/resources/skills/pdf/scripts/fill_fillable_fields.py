#!/usr/bin/env python3
"""
Fill fillable PDF form fields.

Usage: python fill_fillable_fields.py <input.pdf> <field_values.json> <output.pdf>

field_values.json format:
[
  {
    "field_id": "last_name",
    "value": "Simpson"
  },
  {
    "field_id": "Checkbox12",
    "value": "/On"
  }
]
"""

import json
import sys
from pypdf import PdfReader, PdfWriter


def fill_form_fields(input_path: str, values_path: str, output_path: str) -> None:
    """Fill PDF form fields with values from JSON."""
    # Load field values
    with open(values_path, 'r', encoding='utf-8') as f:
        field_values = json.load(f)

    # Create a dictionary for quick lookup
    values_dict = {item['field_id']: item['value'] for item in field_values}

    reader = PdfReader(input_path)
    writer = PdfWriter()

    # Copy pages
    for page in reader.pages:
        writer.add_page(page)

    # Get existing fields
    fields = reader.get_fields()
    if not fields:
        print("Error: No fillable fields found in the PDF.")
        sys.exit(1)

    # Validate field IDs
    valid_fields = set(fields.keys())
    invalid_fields = []
    for field_id in values_dict.keys():
        if field_id not in valid_fields:
            invalid_fields.append(field_id)

    if invalid_fields:
        print(f"Error: The following field IDs are not valid:")
        for f in invalid_fields:
            print(f"  - {f}")
        print(f"\nValid field IDs are:")
        for f in sorted(valid_fields):
            print(f"  - {f}")
        sys.exit(1)

    # Update fields
    writer.update_page_form_field_values(
        writer.pages[0],
        values_dict,
        auto_regenerate=False
    )

    # Write output
    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"Successfully filled {len(values_dict)} field(s) and saved to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python fill_fillable_fields.py <input.pdf> <field_values.json> <output.pdf>")
        sys.exit(1)

    fill_form_fields(sys.argv[1], sys.argv[2], sys.argv[3])
