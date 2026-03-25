# 05-premium-navy — Premium Navy & Gold

## Style Overview

Deep navy background paired with gold and steel blue accents, creating a premium enterprise-grade visual language.

- **Scene**: Premium enterprise, annual strategy, board reports
- **Mood**: Authoritative, refined, premium, trustworthy
- **Tone**: Deep navy base + gold highlights + steel blue auxiliary

## Color Palette

| Name          | Hex      | Usage                                                  |
| ------------- | -------- | ------------------------------------------------------ |
| Deep Navy     | `0C1B33` | Background                                             |
| Rich Gold     | `C9A84C` | Gold horizontal lines, frames, dots, number highlights |
| Pure White    | `FFFFFF` | Title text                                             |
| Mid Navy      | `1E3A5F` | Vertical lines, frame base color                       |
| Steel Blue    | `8EACC1` | Accent circles, description text                       |
| Navy Emphasis | `2C4F7C` | Card background                                        |

## Typography

| Role             | Font           | Size    | Color  |
| ---------------- | -------------- | ------- | ------ |
| Main Title       | Segoe UI Black | 60pt    | FFFFFF |
| Subtitle         | Segoe UI Light | 24pt    | C9A84C |
| Card Number      | Segoe UI Black | 48pt    | C9A84C |
| Card Title       | Segoe UI Black | 22pt    | FFFFFF |
| Card Description | Segoe UI Light | 14pt    | 8EACC1 |
| Data Numbers     | Segoe UI Black | 54-64pt | FFFFFF |
| Auxiliary Notes  | Segoe UI Light | 16-18pt | 8EACC1 |

## Design Techniques

- **Gold fine line separators**: Horizontal gold lines (height=0.08cm), vertical navy lines (width=0.06cm) building refined grid
- **Semi-transparent frames**: `roundRect` as card background (opacity 0.12-0.45), alternating gold and navy
- **Gold dot accents**: Small `ellipse` as visual anchors, gold opacity 0.6, white opacity 0.3
- **High contrast on dark background**: White titles + gold subtitles, forming strong hierarchy on deep navy
- **Morph animation**: Gold lines and frames rearrange between pages, frames transform into data area backgrounds

## Scene Elements

8 scene elements total, different positions on each page:

| Name             | preset    | fill   | opacity | Typical Size  | Description                 |
| ---------------- | --------- | ------ | ------- | ------------- | --------------------------- |
| `!!bar-gold`     | rect      | C9A84C | 1.0     | 18cm x 0.08cm | Gold horizontal line        |
| `!!bar-navy`     | rect      | 1E3A5F | 1.0     | 0.06cm x 14cm | Navy vertical line          |
| `!!frame-gold`   | roundRect | C9A84C | 0.15    | 8cm x 6cm     | Gold semi-transparent frame |
| `!!frame-navy`   | roundRect | 1E3A5F | 0.30    | 10cm x 6cm    | Navy semi-transparent frame |
| `!!accent-gold`  | ellipse   | C9A84C | 0.20    | 3cm x 3cm     | Gold accent circle          |
| `!!accent-steel` | ellipse   | 8EACC1 | 0.15    | 4cm x 4cm     | Steel blue accent circle    |
| `!!dot-gold`     | ellipse   | C9A84C | 0.60    | 1.5cm x 1.5cm | Gold small dot              |
| `!!dot-white`    | ellipse   | FFFFFF | 0.30    | 1cm x 1cm     | White small dot             |

## Page Structure

5 pages total, Slides 2-5 set `transition=morph`:

| Slide   | Type                  | Description                                                                                                          |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Slide 1 | Hero                  | Centered large title in white + gold subtitle, gold line across center                                               |
| Slide 2 | Statement             | Large statement text, gold lines and frames rearranged                                                               |
| Slide 3 | 3-Column Pillars      | Gold lines as column top separators, three roundRect cards (opacity 0.12) side by side, number + title + description |
| Slide 4 | Metrics / Performance | Gold frame enlarged as data background area, showing metrics like $128M / 34% / #1                                   |
| Slide 5 | CTA / Closing         | Frames shrink to corner accents, centered large title + gold subtitle                                                |

## Reference Script

Complete build script is in `build.sh`.
**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (Hero)** — Initial layout of 8 scene actors, combination of gold lines + frames + dots
- **Slide 3 (Pillars)** — Frames transform into card backgrounds, gold lines become column top separators
- **Slide 4 (Metrics)** — Advanced technique of frames enlarging and changing color to data area background

No need to read all — skim 2-3 representative slides.
