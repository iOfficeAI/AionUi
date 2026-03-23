# Midnight Blueprint — Architecture Professional

## Style Overview
Sophisticated architecture and professional services design with navy gradient background, ghost numbers, and textFill fade effects. Features asymmetric corner glows and stark metrics layouts for high-end corporate presentations.

- **Scenario**: Architecture firms, professional services, corporate showcases, luxury real estate, high-end consultancies
- **Mood**: Sophisticated, professional, premium, architectural
- **Tone**: Deep navy gradient with electric blue and gold accents

## Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Background | #080B2A → #181B55 (gradient 135°) | Navy gradient |
| Ghost | #131650 | Barely visible numbers (on navy) |
| Electric Blue | #4B7FFF | Primary accent, glows |
| Gold | #F5B942 | Secondary accent |
| White | #FFFFFF | Primary text |
| Dim | #7A80BB | Supporting text |
| Pale | #B8C0F0 | Light blue for accents |
| Mid | #0F1242 | Card backgrounds |

## Typography
| Element | Font | Size |
|---------|------|------|
| Hero title | Segoe UI Black | 56pt |
| Stats | Segoe UI Black | 52pt |
| Section title | Segoe UI Black | 32pt |
| Body | Segoe UI | 13-14pt |
| Labels | Segoe UI | 10pt |

## Design Techniques
- **Ghost numbers**: Massive 200pt numbers in barely-visible color (#131650 on #080B2A)
- **TextFill fade**: Title text fades into background using gradient fill
- **Asymmetric corner glows**: Two ellipse actors with low opacity (0.06-0.13) that reposition across slides
- **Thin accent lines**: 0.14cm height rects in electric blue/gold
- **Stark metrics layout**: Vertical dividers creating clean 3-column stat display
- **Vertical bar cluster**: Decorative thin bars (0.25cm width) as architectural detail

## Key Morph Actors
- `!!glow-a`: Electric blue ellipse, repositions for asymmetric lighting effect
- `!!glow-b`: Purple ellipse, creates depth and atmosphere
- `!!accent`: Thin horizontal rect that moves and resizes as visual anchor

## Reference Script
Complete build script available in `build.py` (Python with officecli).
