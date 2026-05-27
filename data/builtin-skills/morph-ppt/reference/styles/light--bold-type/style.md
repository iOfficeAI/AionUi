# 08-bold-type — Bold Typography

## Style Overview

Using oversized text (200pt/300pt) to replace geometric shapes as visual protagonists, driven by editorial typography tension.

- **Scene**: Editorial typography, magazine style, brand manual
- **Mood**: Bold, modern, dynamic, editorial
- **Color Tone**: Warm gray base + near black + red accent

## Color Palette

| Name            | Hex      | Usage                                                |
| --------------- | -------- | ---------------------------------------------------- |
| Warm Light Gray | `F2F2F2` | Background                                           |
| Near Black      | `1A1A1A` | Title text, giant numbers (opacity 0.06), thin lines |
| Light Gray      | `E8E8E8` | Giant letters (opacity 0.08)                         |
| Red Accent      | `FF3C38` | Red lines, red dots, accent text                     |

## Typography

| Role                       | Font           | Size    | Color                |
| -------------------------- | -------------- | ------- | -------------------- |
| Giant Numbers (decorative) | Segoe UI Black | 200pt   | 1A1A1A, opacity 0.06 |
| Giant Letters (decorative) | Segoe UI Black | 300pt   | E8E8E8, opacity 0.08 |
| Large Title                | Segoe UI Black | 72pt    | 1A1A1A               |
| Section Title              | Segoe UI Black | 36pt    | 1A1A1A               |
| Number                     | Segoe UI Black | 48pt    | FF3C38               |
| Section Subtitle           | Segoe UI Black | 28pt    | 1A1A1A               |
| Data Numbers               | Segoe UI Black | 72pt    | 1A1A1A / FF3C38      |
| Subtitle/Body              | Segoe UI Light | 16-24pt | 1A1A1A               |
| Accent Subtitle            | Segoe UI Black | 72pt    | FF3C38               |

## Design Techniques

- **Giant Text as Scene Actor**: Using 200pt numbers (01-05) and 300pt letters (B/N/M/P/X) to replace traditional geometric decorations, extremely low opacity (0.06/0.08) forms background texture
- **Red Line System**: Red horizontal lines (height=0.1cm) and vertical lines (width=0.1cm) serve as editorial grid markers
- **Black Thin Lines**: Ultra-thin black lines (height=0.04cm) as auxiliary separators
- **Red Dots**: 1.5cm red `ellipse` as visual punctuation/focal points
- **Each Page Independently Created**: Unlike other templates, 5 pages are created separately (not copied from Slide 1), each page has independent giant text content
- **Morph Transition**: Giant numbers and letters morph across pages under the same `!!name`, when number changes from 01 to 02 the position transitions smoothly

## Scene Elements

6 scene elements total (same name on each page but different content):

| Name             | Type       | Fill                 | Description                                                          |
| ---------------- | ---------- | -------------------- | -------------------------------------------------------------------- |
| `!!giant-num`    | text shape | 1A1A1A, opacity 0.06 | 200pt page number (01/02/03/04/05), different position on each page  |
| `!!giant-letter` | text shape | E8E8E8, opacity 0.08 | 300pt decorative letter (B/N/M/P/X), different position on each page |
| `!!line-red-h`   | rect       | FF3C38               | Red horizontal line, length and position vary per page               |
| `!!line-red-v`   | rect       | FF3C38               | Red vertical line, length and position vary per page                 |
| `!!line-gray-h`  | rect       | 1A1A1A               | Black ultra-thin line, auxiliary separator                           |
| `!!dot-red`      | ellipse    | FF3C38               | 1.5cm red dot, drifts to different positions per page                |

## Page Structure

5 pages total, Slides 2-5 set `transition=morph`:

| Slide   | Type               | Giant Text | Description                                                                                |
| ------- | ------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| Slide 1 | Hero               | 01 + B     | "MAKE IT BOLD" large title left-aligned, red line L-shape frames title area                |
| Slide 2 | Statement          | 02 + N     | "Less Noise. / More Signal." double-line large text, second line in red                    |
| Slide 3 | 3-Column Pillars   | 03 + M     | Red and black lines as column separators, three columns Identity/Motion/Print              |
| Slide 4 | Evidence / Metrics | 04 + P     | Asymmetric layout, left side 340+ large number, right side 28/2015, red lines divide zones |
| Slide 5 | CTA / Closing      | 05 + X     | Centered "Get in Touch" + red email, red line frames bottom                                |

## Reference Script

Complete build script is in `build.sh`.
**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (Hero)** — Core innovation of giant numbers+letters as scene actors, red line L-shape composition
- **Slide 3 (Pillars)** — Editorial typography technique using red/black lines as column separators
- **Slide 4 (Evidence)** — Asymmetric data layout, red vertical line runs through entire page

No need to read all — skim 2-3 representative slides.
