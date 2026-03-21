# 04-earth-organic — Earth and Sage

## Style Overview

A warm parchment background combined with organic ellipses and rounded rectangles creates a warm, natural narrative atmosphere.

- **Scene**: Environmental sustainability, organic brands, nature themes
- **Mood**: Warm, sincere, natural, storytelling
- **Tone**: Warm brown + sage green + terracotta + sandy gold, overall earth tone palette

## Color Palette

| Name                  | Hex      | Usage                             |
| --------------------- | -------- | --------------------------------- |
| Warm Parchment        | `F5F0E8` | Background                        |
| Warm Brown            | `8B6F47` | Leaves, pebbles, decorations      |
| Sage Green            | `A8C686` | Leaves, pebbles, card highlights  |
| Terracotta Orange     | `D4956B` | Stones, number highlights         |
| Sandy Gold            | `C2A878` | Stone decorations                 |
| Forest Green          | `6B8E6B` | Seed decorations, data highlights |
| Cream White           | `E8D5B0` | Seed decorations                  |
| Deep Brown (titles)   | `3C2415` | Title text                        |
| Warm Gray (body)      | `6B5B4A` | Body text                         |
| Soft Gray (secondary) | `9E8E7A` | Secondary text                    |

## Typography

| Role             | Font           | Size    | Color                    |
| ---------------- | -------------- | ------- | ------------------------ |
| Main Title       | Segoe UI Bold  | 64pt    | 3C2415                   |
| Subtitle         | Segoe UI Light | 24pt    | 6B5B4A                   |
| Card Number      | Segoe UI Bold  | 48pt    | D4956B / A8C686 / 6B8E6B |
| Card Title       | Segoe UI Bold  | 28pt    | 3C2415                   |
| Card Description | Segoe UI Light | 16pt    | 6B5B4A                   |
| Data Number      | Segoe UI Bold  | 64pt    | Various highlights       |
| Secondary Text   | Segoe UI Light | 14-16pt | 9E8E7A                   |

## Design Techniques

- **Organic shapes**: Use `ellipse` to simulate leaves and seeds (large ellipses 6-9cm), use `roundRect` to simulate stones (5-7cm), all with different opacity (0.12-0.5)
- **Semi-transparent layering**: Multiple organic shapes overlap with varying opacity to create natural texture
- **Morph animation**: Organic shapes slowly drift and scale across pages, simulating organic movement in nature
- **Slide 3 card design**: Three organic shapes morph into `roundRect` card backgrounds (opacity 0.12), forming three-column content areas
- **Slide 4 data narrative**: Organic shapes enlarge as data area backgrounds, data numbers highlighted with brand colors

## Scene Elements

8 scene elements with different positions and forms on each page:

| Name            | preset    | fill   | opacity | Typical Size  | Description        |
| --------------- | --------- | ------ | ------- | ------------- | ------------------ |
| `!!leaf-brown`  | ellipse   | 8B6F47 | 0.30    | 6cm x 5cm     | Brown leaf         |
| `!!leaf-sage`   | ellipse   | A8C686 | 0.25    | 8cm x 6cm     | Sage green leaf    |
| `!!stone-terra` | roundRect | D4956B | 0.20    | 5cm x 4cm     | Terracotta stone   |
| `!!stone-sand`  | roundRect | C2A878 | 0.30    | 7cm x 5cm     | Sandy gold stone   |
| `!!seed-forest` | ellipse   | 6B8E6B | 1.0     | 3cm x 2.5cm   | Forest green seed  |
| `!!seed-cream`  | ellipse   | E8D5B0 | 0.50    | 2cm x 2cm     | Cream seed         |
| `!!pebble-1`    | ellipse   | 8B6F47 | 0.40    | 1.5cm x 1.2cm | Small pebble       |
| `!!pebble-2`    | ellipse   | A8C686 | 0.35    | 1.8cm x 1.5cm | Green small pebble |

## Page Structure

5 pages total, Slides 2-5 set `transition=morph`:

| Slide   | Type             | Elements                                                                                                           | Description |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| Slide 1 | Hero             | Centered large title + subtitle, organic shapes scattered around                                                   |
| Slide 2 | Statement        | Large text statement "Nature Knows Best", organic shapes redistributed                                             |
| Slide 3 | 3-Column Pillars | Three organic shapes morph into card backgrounds (roundRect opacity 0.12), numbered 01/02/03 + title + description |
| Slide 4 | Metrics / Impact | Organic shapes enlarged as data area backgrounds, displaying data like 40%/2M/Carbon Neutral                       |
| Slide 5 | CTA / Closing    | Organic shapes return to natural distribution, centered CTA + contact info                                         |

## Reference Script

Complete build script available in `build.sh`.
**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (Hero)** — Initial layout and opacity settings for 8 organic scene actors
- **Slide 3 (Pillars)** — Key technique for morphing organic shapes into roundRect card backgrounds
- **Slide 4 (Metrics)** — Layout approach for enlarging organic shapes as data area backgrounds

No need to read all — skim 2-3 representative slides.
