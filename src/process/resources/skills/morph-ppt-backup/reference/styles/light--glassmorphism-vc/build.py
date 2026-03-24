"""
morph-template v39 — Horizon Ventures: VC Fund Deck
Ref: Image 7 (DECK Glassmorphism) — sky blue bg, 3D gradient spheres,
     frosted glass roundRect card, bar chart with gradient bars
Techniques: glassmorphism card (semi-transparent roundRect), gradient 3D spheres,
            stacked sphere cluster, bar chart, glassmorphism pill tags
Bold morph: !!glass (frosted card) shifts position each slide
            !!orb-a (main purple sphere) travels as secondary anchor
6 slides — venture capital fund / startup investor deck
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v39.pptx")
SKYB    = "C8E8FF"
SKYB2   = "A0D4F8"
PURPLE  = "8B5CF6"
PURPL2  = "C4B5FD"
ORANGE  = "F97316"
ORANGE2 = "FED7AA"
TEAL    = "14B8A6"
TEAL2   = "99F6E4"
YELLOW  = "EAB308"
YELL2   = "FEF08A"
PINK    = "EC4899"
WHITE   = "FFFFFF"
DARK    = "1E1B4B"
DIM     = "6B7280"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def sphere(slide, cx, cy, r, color, light_color, opacity, name=None):
    """Gradient ellipse simulating a 3D sphere (light top-left)."""
    x = round(max(0.0, cx - r), 2)
    y = round(max(0.0, cy - r), 2)
    kw = {"name": name} if name else {}
    return s(slide, preset="ellipse", fill=color,
             gradient=f"{light_color}-{color}-135",
             x=f"{x}cm", y=f"{y}cm",
             width=f"{r*2:.2f}cm", height=f"{r*2:.2f}cm",
             opacity=opacity, **kw)


def glass_card(slide, x, y, w, h, name=None):
    """Frosted glass card: white semi-transparent roundRect."""
    kw = {"name": name} if name else {}
    return s(slide, preset="roundRect", fill=WHITE,
             x=f"{x}cm", y=f"{y}cm",
             width=f"{w}cm", height=f"{h}cm",
             opacity="0.22", **kw)


def bars(slide, x0, base_y, values, labels, colors, w=2.5, gap=0.8, max_h=7.0):
    """Simple bar chart — rects of proportional height."""
    items = []
    max_v = max(values)
    for i, (val, label) in enumerate(zip(values, labels)):
        h = round(max_h * val / max_v, 2)
        x = round(x0 + i * (w + gap), 2)
        y = round(base_y - h, 2)
        items.append(s(slide, preset="roundRect", fill=colors[i % len(colors)],
                       gradient=f"{colors[i % len(colors)]}-{DARK}-180",
                       x=f"{x}cm", y=f"{y}cm",
                       width=f"{w}cm", height=f"{h}cm", opacity="0.85"))
        items.append(t(slide, label,
                       f"{x}cm", f"{base_y+0.2:.2f}cm",
                       f"{w}cm", "1cm", "Segoe UI", 10, DARK, align="center"))
    return items


# S1 HERO — large sphere cluster right, glass card center-left, fund name
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={SKYB}-{SKYB2}-135")
batch(DECK, [
    # Background spheres (atmospheric depth)
    sphere(1, 26, 9.5, 9, PURPLE, PURPL2, "0.70"),
    sphere(1, 30, 4, 5.5, ORANGE, ORANGE2, "0.65"),
    sphere(1, 22, 15, 5, TEAL, TEAL2, "0.60"),
    sphere(1, 32, 14, 3.5, YELLOW, YELL2, "0.55"),
    sphere(1, 20, 3, 3, PINK, "F9A8D4", "0.50"),
    sphere(1, 28, 17, 2.5, PURPLE, PURPL2, "0.45"),
    # !!orb-a main sphere
    sphere(1, 26, 9.5, 6, PURPLE, PURPL2, "0.88", name="!!orb-a"),
    # !!glass: frosted card center
    glass_card(1, 1.5, 2, 19, 15, name="!!glass"),
    # More glass overlay (darker rim effect)
    s(1, preset="roundRect", fill=WHITE, opacity="0.08",
      x="1.5cm", y="2cm", width="19cm", height="15cm"),
    # Content on glass
    t(1, "HORIZON VENTURES", "2.5cm", "2.8cm", "17cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(1, preset="rect", fill=PURPLE, x="2.5cm", y="4cm", width="4cm", height="0.12cm"),
    t(1, "HORIZON.", "2.5cm", "4.8cm", "17cm", "7cm",
      "Segoe UI Black", 64, DARK, bold=True),
    t(1, "Backing founders who build\nthe infrastructure of tomorrow.",
      "2.5cm", "12.5cm", "17cm", "2.5cm", "Segoe UI", 14, DIM),
    t(1, "Seed & Series A  ·  $180M AUM  ·  Est. 2018",
      "2.5cm", "15.5cm", "17cm", "1cm", "Segoe UI", 11, DIM, opacity="0.75"),
    t(1, "horizon.vc", "28cm", "17.8cm", "6cm", "1cm",
      "Segoe UI", 10, DARK, align="right", opacity="0.55"),
])

# S2 INVESTMENT THESIS — glass card left, spheres repositioned, thesis points
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={SKYB}-{SKYB2}-135")
batch(DECK, [
    # Background spheres
    sphere(2, 30, 5, 7, TEAL, TEAL2, "0.60"),
    sphere(2, 26, 15, 5, ORANGE, ORANGE2, "0.55"),
    sphere(2, 32, 12, 3.5, YELLOW, YELL2, "0.50"),
    sphere(2, 20, 2, 3, PURPLE, PURPL2, "0.45"),
    # !!orb-a shifts top-right
    sphere(2, 30, 5, 5, TEAL, TEAL2, "0.85", name="!!orb-a"),
    # !!glass: card left, narrower
    glass_card(2, 1.5, 1.5, 15, 16, name="!!glass"),
    s(2, preset="roundRect", fill=WHITE, opacity="0.06",
      x="1.5cm", y="1.5cm", width="15cm", height="16cm"),
    # Glass card content
    t(2, "INVESTMENT THESIS", "2.5cm", "2.2cm", "13cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(2, preset="rect", fill=TEAL, x="2.5cm", y="3.4cm", width="3.5cm", height="0.12cm"),
    t(2, "Where we\nbuild conviction.", "2.5cm", "4cm", "13cm", "4cm",
      "Segoe UI Black", 30, DARK, bold=True),
    t(2, "We invest at the intersection\nof infrastructure, AI, and\nhuman-centred systems.",
      "2.5cm", "8.5cm", "13cm", "3cm", "Segoe UI", 12, DIM),
    t(2, "Cheque size: $500K – $3M",
      "2.5cm", "12cm", "13cm", "1cm", "Segoe UI Black", 11, PURPLE, bold=True),
    t(2, "First-round reserve: 3× follow-on",
      "2.5cm", "13.2cm", "13cm", "1cm", "Segoe UI", 11, DIM),
    t(2, "Average holding: 7 years",
      "2.5cm", "14.4cm", "13cm", "1cm", "Segoe UI", 11, DIM),
    # Right content (sectors)
    t(2, "FOCUS SECTORS", "18cm", "2.5cm", "15cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(2, preset="roundRect", fill=PURPLE, opacity="0.75",
      x="18cm", y="4cm", width="14.5cm", height="2cm"),
    t(2, "AI Infrastructure", "18.5cm", "4cm", "13.5cm", "2cm",
      "Segoe UI Black", 12, WHITE, bold=True, valign="c"),
    s(2, preset="roundRect", fill=TEAL, opacity="0.75",
      x="18cm", y="6.8cm", width="14.5cm", height="2cm"),
    t(2, "Climate Tech", "18.5cm", "6.8cm", "13.5cm", "2cm",
      "Segoe UI Black", 12, WHITE, bold=True, valign="c"),
    s(2, preset="roundRect", fill=ORANGE, opacity="0.75",
      x="18cm", y="9.6cm", width="14.5cm", height="2cm"),
    t(2, "Developer Tools", "18.5cm", "9.6cm", "13.5cm", "2cm",
      "Segoe UI Black", 12, WHITE, bold=True, valign="c"),
    s(2, preset="roundRect", fill=YELLOW, opacity="0.75",
      x="18cm", y="12.4cm", width="14.5cm", height="2cm"),
    t(2, "Health Data", "18.5cm", "12.4cm", "13.5cm", "2cm",
      "Segoe UI Black", 12, DARK, bold=True, valign="c"),
    s(2, preset="roundRect", fill=PINK, opacity="0.75",
      x="18cm", y="15.2cm", width="14.5cm", height="2cm"),
    t(2, "Future of Work", "18.5cm", "15.2cm", "13.5cm", "2cm",
      "Segoe UI Black", 12, WHITE, bold=True, valign="c"),
])

# S3 PORTFOLIO — glass card top-wide, sphere cluster, company list
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={SKYB}-{SKYB2}-135")
batch(DECK, [
    sphere(3, 28, 15, 7, ORANGE, ORANGE2, "0.65"),
    sphere(3, 24, 17, 4.5, PURPLE, PURPL2, "0.55"),
    sphere(3, 32, 10, 4, TEAL, TEAL2, "0.50"),
    sphere(3, 30, 6, 3, YELLOW, YELL2, "0.45"),
    sphere(3, 28, 15, 5, ORANGE, ORANGE2, "0.85", name="!!orb-a"),
    # !!glass: tall center card
    glass_card(3, 1.5, 1.5, 22, 16, name="!!glass"),
    s(3, preset="roundRect", fill=WHITE, opacity="0.07",
      x="1.5cm", y="1.5cm", width="22cm", height="16cm"),
    t(3, "PORTFOLIO", "2.5cm", "2.2cm", "20cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(3, preset="rect", fill=ORANGE, x="2.5cm", y="3.4cm", width="3.5cm", height="0.12cm"),
    t(3, "23 companies.\n4 exits.", "2.5cm", "4cm", "20cm", "4cm",
      "Segoe UI Black", 38, DARK, bold=True),
    # Company rows
    t(3, "Archon AI", "2.5cm", "9cm", "9cm", "1cm",
      "Segoe UI Black", 12, DARK, bold=True),
    t(3, "AI Infrastructure · Series B", "2.5cm", "10.2cm", "9cm", "0.9cm",
      "Segoe UI", 10, DIM),
    s(3, preset="roundRect", fill=PURPLE, opacity="0.80",
      x="13cm", y="9cm", width="4cm", height="1.2cm"),
    t(3, "$48M raised", "13cm", "9cm", "4cm", "1.2cm",
      "Segoe UI Black", 9, WHITE, bold=True, align="center", valign="c"),
    s(3, preset="rect", fill="DDDDDD", x="2.5cm", y="11.4cm", width="19cm", height="0.05cm"),
    t(3, "Lumen Health", "2.5cm", "12cm", "9cm", "1cm",
      "Segoe UI Black", 12, DARK, bold=True),
    t(3, "Health Data · Seed", "2.5cm", "13.2cm", "9cm", "0.9cm",
      "Segoe UI", 10, DIM),
    s(3, preset="roundRect", fill=TEAL, opacity="0.80",
      x="13cm", y="12cm", width="4cm", height="1.2cm"),
    t(3, "$3.2M raised", "13cm", "12cm", "4cm", "1.2cm",
      "Segoe UI Black", 9, WHITE, bold=True, align="center", valign="c"),
    s(3, preset="rect", fill="DDDDDD", x="2.5cm", y="14.4cm", width="19cm", height="0.05cm"),
    t(3, "Gridline", "2.5cm", "15cm", "9cm", "1cm",
      "Segoe UI Black", 12, DARK, bold=True),
    t(3, "Climate Tech · Series A", "2.5cm", "16.2cm", "9cm", "0.9cm",
      "Segoe UI", 10, DIM),
    s(3, preset="roundRect", fill=ORANGE, opacity="0.80",
      x="13cm", y="15cm", width="4cm", height="1.2cm"),
    t(3, "$22M raised", "13cm", "15cm", "4cm", "1.2cm",
      "Segoe UI Black", 9, WHITE, bold=True, align="center", valign="c"),
])

# S4 PERFORMANCE — glass card right, bar chart + key metrics
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={SKYB}-{SKYB2}-135")
s4_bars = bars(4, 17.5, 17.2,
               [1.5, 0.89, 2.34, 0.67, 1.8],
               ["Archon", "Lumen", "Grid", "Flux", "Nova"],
               [PURPLE, TEAL, ORANGE, YELLOW, PINK],
               w=2.5, gap=0.6, max_h=7.0)
batch(DECK, s4_bars + [
    sphere(4, 8, 4, 6, YELLOW, YELL2, "0.55"),
    sphere(4, 4, 14, 4.5, TEAL, TEAL2, "0.50"),
    sphere(4, 12, 17, 3.5, ORANGE, ORANGE2, "0.45"),
    sphere(4, 8, 4, 4.5, YELLOW, YELL2, "0.82", name="!!orb-a"),
    # !!glass: right side chart area
    glass_card(4, 15.5, 1.5, 18, 17, name="!!glass"),
    s(4, preset="roundRect", fill=WHITE, opacity="0.06",
      x="15.5cm", y="1.5cm", width="18cm", height="17cm"),
    t(4, "FUND PERFORMANCE", "16.5cm", "2.2cm", "16cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(4, preset="rect", fill=YELLOW, x="16.5cm", y="3.4cm", width="3.5cm", height="0.12cm"),
    t(4, "Markups by\nportfolio company.", "16.5cm", "4cm", "16cm", "3cm",
      "Segoe UI Black", 22, DARK, bold=True),
    t(4, "x = current markup vs entry", "16.5cm", "7.5cm", "16cm", "0.9cm",
      "Segoe UI", 10, DIM),
    # Bar chart legend
    t(4, "2.34×", "22.5cm", "9.2cm", "5cm", "1cm",
      "Segoe UI Black", 14, ORANGE, bold=True),
    t(4, "Top performer", "22.5cm", "10.4cm", "5cm", "0.9cm",
      "Segoe UI", 10, DIM),
    # Left stats
    t(4, "FUND METRICS", "1.5cm", "2cm", "12cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(4, preset="rect", fill=DARK, x="1.5cm", y="3.2cm", width="12cm", height="0.08cm"),
    t(4, "1.6×", "1.5cm", "4cm", "12cm", "3cm",
      "Segoe UI Black", 48, PURPLE, bold=True),
    t(4, "TVPI (Total Value Paid-In)", "1.5cm", "7.2cm", "12cm", "1cm",
      "Segoe UI", 12, DIM),
    t(4, "0.3×", "1.5cm", "9cm", "12cm", "2.5cm",
      "Segoe UI Black", 40, TEAL, bold=True),
    t(4, "DPI (Distributions Paid-In)", "1.5cm", "11.7cm", "12cm", "1cm",
      "Segoe UI", 12, DIM),
    t(4, "2.1×", "1.5cm", "13.5cm", "12cm", "2.5cm",
      "Segoe UI Black", 40, ORANGE, bold=True),
    t(4, "RVPI (Residual Value)", "1.5cm", "16.2cm", "12cm", "1cm",
      "Segoe UI", 12, DIM),
])

# S5 TEAM — glass card wide center, sphere halo, partner bios
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={SKYB}-{SKYB2}-135")
batch(DECK, [
    sphere(5, 5, 4, 4, PINK, "F9A8D4", "0.55"),
    sphere(5, 30, 15, 5.5, TEAL, TEAL2, "0.55"),
    sphere(5, 28, 4, 4, PURPLE, PURPL2, "0.50"),
    sphere(5, 30, 15, 4, TEAL, TEAL2, "0.82", name="!!orb-a"),
    # !!glass: center wide card
    glass_card(5, 2, 2, 30, 15, name="!!glass"),
    s(5, preset="roundRect", fill=WHITE, opacity="0.06",
      x="2cm", y="2cm", width="30cm", height="15cm"),
    t(5, "THE TEAM", "3cm", "2.8cm", "28cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(5, preset="rect", fill=PINK, x="3cm", y="4cm", width="3.5cm", height="0.12cm"),
    t(5, "The partners.", "3cm", "4.8cm", "28cm", "2.5cm",
      "Segoe UI Black", 34, DARK, bold=True),
    # 3 partner cards
    s(5, preset="roundRect", fill=PURPLE, opacity="0.80",
      x="3cm", y="8cm", width="8cm", height="8cm"),
    t(5, "Mia Chen\nManaging Partner", "3.5cm", "8.5cm", "7cm", "2.5cm",
      "Segoe UI Black", 13, WHITE, bold=True),
    t(5, "Ex-Google Ventures.\n12 years in deep tech.\nFormer founder × 2.",
      "3.5cm", "11.5cm", "7cm", "3.5cm", "Segoe UI", 11, WHITE, opacity="0.85"),
    s(5, preset="roundRect", fill=TEAL, opacity="0.80",
      x="12.5cm", y="8cm", width="8cm", height="8cm"),
    t(5, "Jordan Ali\nGeneral Partner", "13cm", "8.5cm", "7cm", "2.5cm",
      "Segoe UI Black", 13, WHITE, bold=True),
    t(5, "Ex-Sequoia Capital.\nCFO background.\nOperator-first mindset.",
      "13cm", "11.5cm", "7cm", "3.5cm", "Segoe UI", 11, WHITE, opacity="0.85"),
    s(5, preset="roundRect", fill=ORANGE, opacity="0.80",
      x="22cm", y="8cm", width="8cm", height="8cm"),
    t(5, "Sam Reeves\nVenture Partner", "22.5cm", "8.5cm", "7cm", "2.5cm",
      "Segoe UI Black", 13, WHITE, bold=True),
    t(5, "Serial founder.\n3 exits above $100M.\nAdvisor to 20+ startups.",
      "22.5cm", "11.5cm", "7cm", "3.5cm", "Segoe UI", 11, WHITE, opacity="0.85"),
    t(5, "horizon.vc/team", "28cm", "17.5cm", "6cm", "1cm",
      "Segoe UI", 10, DARK, align="right", opacity="0.55"),
])

# S6 CTA — glass card full-center, big sphere cluster, CTA
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={SKYB}-{SKYB2}-135")
batch(DECK, [
    # Large dramatic sphere cluster
    sphere(6, 26, 9.5, 10, PURPLE, PURPL2, "0.65"),
    sphere(6, 31, 4, 6, ORANGE, ORANGE2, "0.60"),
    sphere(6, 22, 16, 5.5, TEAL, TEAL2, "0.55"),
    sphere(6, 32, 16, 4, YELLOW, YELL2, "0.50"),
    sphere(6, 20, 4, 3.5, PINK, "F9A8D4", "0.48"),
    sphere(6, 29, 12, 2.5, PURPLE, PURPL2, "0.45"),
    sphere(6, 26, 9.5, 7, PURPLE, PURPL2, "0.88", name="!!orb-a"),
    # !!glass: large center CTA card
    glass_card(6, 1.5, 2, 21, 15, name="!!glass"),
    s(6, preset="roundRect", fill=WHITE, opacity="0.10",
      x="1.5cm", y="2cm", width="21cm", height="15cm"),
    t(6, "WORK WITH US", "2.5cm", "2.8cm", "19cm", "0.9cm",
      "Segoe UI", 9, DARK),
    s(6, preset="rect", fill=PURPLE, x="2.5cm", y="4cm", width="4cm", height="0.12cm"),
    t(6, "Let's build\nthe future\ntogether.", "2.5cm", "4.8cm", "19cm", "9cm",
      "Segoe UI Black", 44, DARK, bold=True),
    t(6, "We back founders at the earliest stage.\nMeeting-to-term-sheet in 2 weeks.",
      "2.5cm", "14cm", "19cm", "2cm", "Segoe UI", 13, DIM),
    # CTA button inside glass
    s(6, preset="roundRect", fill=PURPLE,
      x="2.5cm", y="16.5cm", width="12cm", height="2.2cm"),
    t(6, "Pitch to Us  →", "2.5cm", "16.5cm", "12cm", "2.2cm",
      "Segoe UI Black", 13, WHITE, bold=True, align="center", valign="c"),
    t(6, "founders@horizon.vc  ·  horizon.vc",
      "2.5cm", "18.9cm", "19cm", "1cm", "Segoe UI", 10, DARK, opacity="0.55"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
