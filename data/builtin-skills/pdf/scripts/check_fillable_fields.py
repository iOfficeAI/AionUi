#!/usr/bin/env python3
"""
Check if a PDF has fillable form fields.

Usage: python check_fillable_fields.py <input.pdf>

Returns exit code 0 if fillable fields found, 1 if not.
"""

import sys
from pypdf import PdfReader


def check_fillable_fields(pdf_path: str) -> bool:
    """Check if PDF has fillable form fields."""
    try:
        reader = PdfReader(pdf_path)
        fields = reader.get_fields()

        if fields:
            print(f"Found {len(fields)} fillable form field(s):")
            for name, field in fields.items():
                field_type = field.get('/FT', 'Unknown')
                print(f"  - {name}: {field_type}")
            return True
        else:
            print("No fillable form fields found in this PDF.")
            print("You'll need to use the annotation-based workflow to fill this form.")
            return False
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python check_fillable_fields.py <input.pdf>")
        sys.exit(1)

    has_fields = check_fillable_fields(sys.argv[1])
    sys.exit(0 if has_fields else 1)
