#!/usr/bin/env python3
"""
Fill PDF form using text annotations (for non-fillable PDFs).

Usage: python fill_pdf_form_with_annotations.py <input.pdf> <fields.json> <output.pdf>

fields.json format:
{
  "pages": [
    {"page_number": 1, "image_width": 612, "image_height": 792}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "User's last name",
      "entry_bounding_box": [100, 125, 280, 142],
      "entry_text": {
        "text": "Johnson",
        "font_size": 14,
        "font_color": "000000"
      }
    }
  ]
}
"""

import json
import sys

try:
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import HexColor
    from io import BytesIO
except ImportError as e:
    print(f"Error: Required library missing. Install with: pip install pypdf reportlab")
    print(f"Details: {e}")
    sys.exit(1)


def fill_form_with_annotations(input_path: str, json_path: str, output_path: str) -> None:
    """Fill PDF form using text annotations."""
    # Load fields data
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    reader = PdfReader(input_path)
    writer = PdfWriter()

    # Get page dimensions from PDF or JSON
    pages_info = {p['page_number']: p for p in data.get('pages', [])}

    # Process each page
    for page_num, page in enumerate(reader.pages, start=1):
        # Get page dimensions
        page_box = page.mediabox
        page_width = float(page_box.width)
        page_height = float(page_box.height)

        # Get image dimensions from JSON for coordinate conversion
        page_info = pages_info.get(page_num, {})
        img_width = page_info.get('image_width', page_width)
        img_height = page_info.get('image_height', page_height)

        # Scale factors (image coords to PDF coords)
        scale_x = page_width / img_width
        scale_y = page_height / img_height

        # Get fields for this page
        page_fields = [f for f in data.get('form_fields', [])
                       if f.get('page_number', 1) == page_num]

        if page_fields:
            # Create overlay with annotations
            packet = BytesIO()
            c = canvas.Canvas(packet, pagesize=(page_width, page_height))

            for field in page_fields:
                entry_box = field.get('entry_bounding_box')
                entry_text = field.get('entry_text', {})

                if entry_box and entry_text:
                    # Convert image coordinates to PDF coordinates
                    # Note: PDF y=0 is at bottom, image y=0 is at top
                    left = entry_box[0] * scale_x
                    top = entry_box[1] * scale_y
                    right = entry_box[2] * scale_x
                    bottom = entry_box[3] * scale_y

                    # PDF y is from bottom
                    pdf_y = page_height - bottom

                    text = entry_text.get('text', '')
                    font_size = entry_text.get('font_size', 12)
                    font_color = entry_text.get('font_color', '000000')

                    # Set font and color
                    c.setFont('Helvetica', font_size)
                    try:
                        c.setFillColor(HexColor(f'#{font_color}'))
                    except ValueError:
                        c.setFillColor(HexColor('#000000'))

                    # Draw text
                    c.drawString(left, pdf_y, text)

            c.save()
            packet.seek(0)

            # Merge overlay with original page
            overlay_reader = PdfReader(packet)
            overlay_page = overlay_reader.pages[0]
            page.merge_page(overlay_page)

        writer.add_page(page)

    # Write output
    with open(output_path, 'wb') as f:
        writer.write(f)

    total_fields = len(data.get('form_fields', []))
    print(f"Successfully added {total_fields} annotation(s) and saved to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python fill_pdf_form_with_annotations.py <input.pdf> <fields.json> <output.pdf>")
        sys.exit(1)

    fill_form_with_annotations(sys.argv[1], sys.argv[2], sys.argv[3])
