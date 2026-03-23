"""
morph-template v40 — Forma Nova: Creative Agency  (BAUHAUS)
Ref: Image 2 — electric blue + acid lime, bold geometric rects, asterisk ✳, parallelogram
Techniques:
  !!blockA (BLUE) + !!blockB (LIME) — twin-shape morph journey across 7 slides
  raw_geom → S1 !!blockA is a parallelogram; reverts to rect for dramatic morph in/out
  asterisk(): 4 crossed thin rects = 8-pointed star accent
  arrow: composed from 3 thin rects (shaft + 2 diagonal arms)
  flat Bauhaus color, no gradients, strong geometry
7 slides — brand / creative agency
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v40.pptx")
BLUE  = "1A19FF"
LIME  = "AAFF00"
WHITE = "FFFFFF"
BLACK = "0A0A0A"
LGRAY = "EBEBEB"
DIM   = "777777"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def asterisk(slide, cx, cy, arm, color, opacity="1.0"):
    """8-pointed star: 4 crossing thin rects sharing center (cx, cy)."""
    x = max(0.0, round(cx - arm, 2))
    y = max(0.0, round(cy - 0.06, 2))
    return [s(slide, preset="rect", fill=color,
               x=f"{x}cm", y=f"{y}cm",
               width=f"{arm * 2:.2f}cm", height="0.12cm",
               rotation=str(rot), opacity=opacity)
            for rot in [0, 45, 90, 135]]


def arrow(slide, x, y, length, color):
    """Horizontal arrow: shaft + two diagonal arms."""
    return [
        s(slide, preset="rect", fill=color,
          x=f"{x}cm", y=f"{y}cm", width=f"{length}cm", height="0.10cm"),
        s(slide, preset="rect", fill=color,
          x=f"{x + length - 0.9:.2f}cm", y=f"{max(0, y - 0.35):.2f}cm",
          width="0.9cm", height="0.10cm", rotation="40"),
        s(slide, preset="rect", fill=color,
          x=f"{x + length - 0.9:.2f}cm", y=f"{y + 0.35:.2f}cm",
          width="0.9cm", height="0.10cm", rotation="-40"),
    ]


# ─── S1 HERO — white bg, parallelogram top-right BLUE, LIME rect overlap ───
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
s1_star = asterisk(1, 21.0, 11.5, 1.8, LIME)
batch(DECK, s1_star + [
    s(1, name="!!blockA", preset="rect", fill=BLUE,
      x="22cm", y="0cm", width="11.87cm", height="11cm"),
    s(1, name="!!blockB", preset="rect", fill=LIME,
      x="25cm", y="6cm", width="8.87cm", height="9cm"),
    # dot accent (named for morph)
    s(1, name="!!dot", preset="ellipse", fill=BLUE,
      x="30cm", y="12.5cm", width="1.2cm", height="1.2cm"),
    t(1, "FORMA NOVA  ·  CREATIVE STUDIO", "1.5cm", "1.5cm", "19cm", "0.9cm",
      "Segoe UI", 9, BLUE),
    s(1, preset="rect", fill=BLUE, x="1.5cm", y="2.8cm", width="1cm", height="0.10cm"),
    t(1, "Design\nthat moves\nmarkets.", "1.5cm", "3.5cm", "19cm", "10cm",
      "Segoe UI Black", 54, BLACK, bold=True),
    s(1, preset="rect", fill=BLACK, x="1.5cm", y="15cm", width="19cm", height="0.10cm"),
    t(1, "Brand Strategy  ·  Visual Identity  ·  Motion",
      "1.5cm", "15.5cm", "19cm", "1cm", "Segoe UI", 11, DIM),
    t(1, "Oslo  ·  London  ·  Tokyo", "1.5cm", "17.2cm", "12cm", "1cm",
      "Segoe UI", 10, DIM),
    t(1, "formanova.studio", "26cm", "17.8cm", "7.87cm", "0.9cm",
      "Segoe UI", 9, DIM, align="right"),
])
# Make !!blockA a parallelogram (Bauhaus diagonal energy)
raw_geom(DECK, 1, "!!blockA", trapezoid_xml(11.87, 11, tan=0.35, is_para=True))

# ─── S2 ABOUT — white bg, photo left, text right, BLUE+LIME bottom-right ───
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
batch(DECK, arrow(2, 16.5, 17.3, 4.5, BLUE) + [
    s(2, name="!!blockA", preset="rect", fill=BLUE,
      x="27cm", y="10cm", width="6.87cm", height="9.05cm"),
    s(2, name="!!blockB", preset="rect", fill=LIME,
      x="28.5cm", y="14cm", width="5.37cm", height="5.05cm"),
    s(2, name="!!dot", preset="ellipse", fill=LIME,
      x="16cm", y="16.8cm", width="1.2cm", height="1.2cm"),
    # B&W photo area
    s(2, preset="roundRect", fill=LGRAY,
      x="1.5cm", y="1cm", width="13cm", height="17.5cm"),
    t(2, "[ Studio Photo ]", "1.5cm", "1cm", "13cm", "17.5cm",
      "Segoe UI", 11, DIM, align="center", valign="c", opacity="0.50"),
    t(2, "ABOUT", "16cm", "1.5cm", "10cm", "0.9cm", "Segoe UI", 9, BLUE),
    s(2, preset="rect", fill=BLUE, x="16cm", y="2.8cm", width="4cm", height="0.10cm"),
    t(2, "We build\nbrands that\nlast decades.", "16cm", "3.5cm", "16cm", "8cm",
      "Segoe UI Black", 36, BLACK, bold=True),
    t(2, "Forma Nova is a strategic creative studio\nspecialising in brand identity, visual\nsystems, and motion for ambitious companies.",
      "16cm", "12.5cm", "15cm", "3.5cm", "Segoe UI", 11, DIM),
    t(2, "Est. 2014  ·  12 years  ·  60+ brands", "16.5cm", "17cm", "12cm", "1cm",
      "Segoe UI Black", 10, BLUE, bold=True),
])

# ─── S3 SERVICES — white bg, 3 BLUE cards, LIME+BLUE blobs bottom ───
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
s3_star = asterisk(3, 16.5, 2.5, 1.2, BLUE, "0.20")
batch(DECK, s3_star + [
    s(3, name="!!blockA", preset="rect", fill=BLUE,
      x="0cm", y="13.5cm", width="11cm", height="5.55cm"),
    s(3, name="!!blockB", preset="rect", fill=LIME,
      x="22cm", y="13.5cm", width="11.87cm", height="5.55cm"),
    s(3, name="!!dot", preset="ellipse", fill=LIME,
      x="11.5cm", y="13.5cm", width="1.2cm", height="1.2cm"),
    t(3, "SERVICES", "1.5cm", "1.5cm", "20cm", "0.9cm", "Segoe UI", 9, BLUE),
    s(3, preset="rect", fill=BLUE, x="1.5cm", y="2.8cm", width="4cm", height="0.10cm"),
    t(3, "What we do best.", "1.5cm", "3.5cm", "30cm", "3cm",
      "Segoe UI Black", 34, BLACK, bold=True),
    # 3 service cards
    s(3, preset="roundRect", fill=BLUE,
      x="1.5cm", y="7cm", width="9.5cm", height="6cm"),
    t(3, "01", "2cm", "7.4cm", "8.5cm", "0.9cm", "Segoe UI", 10, LIME),
    t(3, "Brand\nStrategy", "2cm", "8.6cm", "8cm", "2.5cm",
      "Segoe UI Black", 18, WHITE, bold=True),
    t(3, "Positioning, naming,\nmessaging architecture.",
      "2cm", "11.5cm", "8cm", "1.5cm", "Segoe UI", 10, WHITE, opacity="0.75"),
    s(3, preset="roundRect", fill=BLUE,
      x="12.19cm", y="7cm", width="9.5cm", height="6cm"),
    t(3, "02", "12.69cm", "7.4cm", "8.5cm", "0.9cm", "Segoe UI", 10, LIME),
    t(3, "Visual\nIdentity", "12.69cm", "8.6cm", "8cm", "2.5cm",
      "Segoe UI Black", 18, WHITE, bold=True),
    t(3, "Logo, colour, type,\nsystem & guidelines.",
      "12.69cm", "11.5cm", "8cm", "1.5cm", "Segoe UI", 10, WHITE, opacity="0.75"),
    s(3, preset="roundRect", fill=BLUE,
      x="22.88cm", y="7cm", width="9.5cm", height="6cm"),
    t(3, "03", "23.38cm", "7.4cm", "8.5cm", "0.9cm", "Segoe UI", 10, LIME),
    t(3, "Motion\n& Digital", "23.38cm", "8.6cm", "8cm", "2.5cm",
      "Segoe UI Black", 18, WHITE, bold=True),
    t(3, "Campaign, UI motion,\nwebsite & social.",
      "23.38cm", "11.5cm", "8cm", "1.5cm", "Segoe UI", 10, WHITE, opacity="0.75"),
    # over-blob text
    t(3, "Award-winning strategy for ambitious brands.",
      "1cm", "14.5cm", "10cm", "4cm", "Segoe UI", 10, WHITE),
    t(3, "From startups to global institutions",
      "22cm", "14.5cm", "11.87cm", "4cm", "Segoe UI", 10, BLACK),
])

# ─── S4 CASE STUDIES — left BLUE full-panel, right white thumbnails ───
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
batch(DECK, [
    s(4, name="!!blockA", preset="rect", fill=BLUE,
      x="0cm", y="0cm", width="14cm", height="19.05cm"),
    s(4, name="!!blockB", preset="rect", fill=LIME,
      x="17cm", y="0cm", width="16.87cm", height="3.5cm"),
    s(4, name="!!dot", preset="ellipse", fill=LIME,
      x="14.2cm", y="0.5cm", width="1.2cm", height="1.2cm"),
    # Left panel text
    t(4, "SELECTED WORKS", "1cm", "1.5cm", "12cm", "0.9cm", "Segoe UI", 9, LIME),
    s(4, preset="rect", fill=LIME, x="1cm", y="2.8cm", width="4cm", height="0.10cm"),
    t(4, "2022—2025", "1cm", "3.5cm", "12cm", "2.5cm",
      "Segoe UI Black", 26, WHITE, bold=True),
    t(4, "Orbit Labs", "1cm", "8cm", "12cm", "1.2cm",
      "Segoe UI Black", 15, WHITE, bold=True),
    t(4, "Brand Identity  ·  2024", "1cm", "9.5cm", "12cm", "1cm",
      "Segoe UI", 10, LIME, opacity="0.80"),
    s(4, preset="rect", fill=WHITE, opacity="0.25",
      x="1cm", y="11cm", width="12cm", height="0.05cm"),
    t(4, "Nova Fintech", "1cm", "11.8cm", "12cm", "1.2cm",
      "Segoe UI Black", 15, WHITE, bold=True),
    t(4, "Visual System  ·  2024", "1cm", "13.3cm", "12cm", "1cm",
      "Segoe UI", 10, LIME, opacity="0.80"),
    s(4, preset="rect", fill=WHITE, opacity="0.25",
      x="1cm", y="14.8cm", width="12cm", height="0.05cm"),
    t(4, "Sable Studio", "1cm", "15.5cm", "12cm", "1.2cm",
      "Segoe UI Black", 15, WHITE, bold=True),
    t(4, "Motion Campaign  ·  2023", "1cm", "17cm", "12cm", "1cm",
      "Segoe UI", 10, LIME, opacity="0.80"),
    # Right thumbnails (below lime header bar)
    s(4, preset="roundRect", fill=LGRAY,
      x="17cm", y="4cm", width="15.87cm", height="6.5cm"),
    t(4, "[ Orbit Labs — Brand Identity ]", "17cm", "4cm", "15.87cm", "6.5cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.50"),
    t(4, "Orbit Labs", "17cm", "10.8cm", "15.87cm", "1cm",
      "Segoe UI Black", 11, BLACK, bold=True),
    t(4, "Brand Identity  ·  2024", "17cm", "12cm", "15.87cm", "0.9cm",
      "Segoe UI", 10, DIM),
    s(4, preset="roundRect", fill=LGRAY,
      x="17cm", y="13.2cm", width="15.87cm", height="5cm"),
    t(4, "[ Nova Fintech — Visual System ]", "17cm", "13.2cm", "15.87cm", "5cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.50"),
    t(4, "Nova Fintech", "17cm", "18.3cm", "15.87cm", "0.75cm",
      "Segoe UI Black", 11, BLACK, bold=True),
])

# ─── S5 APPROACH — thin BLUE left strip, LIME bottom bar, process steps ───
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
batch(DECK, [
    s(5, name="!!blockA", preset="rect", fill=BLUE,
      x="0cm", y="0cm", width="4cm", height="19.05cm"),
    s(5, name="!!blockB", preset="rect", fill=LIME,
      x="0cm", y="15cm", width="33.87cm", height="4.05cm"),
    s(5, name="!!dot", preset="ellipse", fill=BLUE,
      x="4.6cm", y="14.5cm", width="1.2cm", height="1.2cm"),
    t(5, "OUR APPROACH", "5.5cm", "1.5cm", "26cm", "0.9cm", "Segoe UI", 9, BLUE),
    s(5, preset="rect", fill=BLUE, x="5.5cm", y="2.8cm", width="4cm", height="0.10cm"),
    t(5, "How great brands\nare made.", "5.5cm", "3.5cm", "26cm", "4.5cm",
      "Segoe UI Black", 34, BLACK, bold=True),
    # 4 process steps (2×2 grid)
    t(5, "01", "5.5cm", "9.5cm", "4cm", "1cm", "Segoe UI Black", 11, BLUE, bold=True),
    t(5, "DISCOVER", "5.5cm", "10.7cm", "12cm", "1.2cm", "Segoe UI Black", 14, BLACK, bold=True),
    t(5, "Immerse, research, map\ncompetitors and audiences.",
      "5.5cm", "12.2cm", "12cm", "2cm", "Segoe UI", 11, DIM),
    t(5, "02", "19.5cm", "9.5cm", "4cm", "1cm", "Segoe UI Black", 11, BLUE, bold=True),
    t(5, "DEFINE", "19.5cm", "10.7cm", "12cm", "1.2cm", "Segoe UI Black", 14, BLACK, bold=True),
    t(5, "Crystallise positioning,\nnaming and visual direction.",
      "19.5cm", "12.2cm", "12cm", "2cm", "Segoe UI", 11, DIM),
    s(5, preset="rect", fill=LGRAY, x="5.5cm", y="9.2cm", width="12.5cm", height="0.05cm"),
    t(5, "03", "5.5cm", "14cm", "4cm", "1cm", "Segoe UI Black", 11, LIME, bold=True),
    t(5, "DESIGN", "5.5cm", "14.5cm", "12cm", "0.8cm", "Segoe UI Black", 14, WHITE, bold=True),
    t(5, "04", "19.5cm", "14cm", "4cm", "1cm", "Segoe UI Black", 11, LIME, bold=True),
    t(5, "DELIVER", "19.5cm", "14.5cm", "12cm", "0.8cm", "Segoe UI Black", 14, WHITE, bold=True),
])

# ─── S6 TEAM — top BLUE+LIME split bar, team cards below ───
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
s6_star = asterisk(6, 32, 3, 1.0, BLUE, "0.30")
batch(DECK, s6_star + [
    s(6, name="!!blockA", preset="rect", fill=BLUE,
      x="0cm", y="0cm", width="16cm", height="5cm"),
    s(6, name="!!blockB", preset="rect", fill=LIME,
      x="16cm", y="0cm", width="17.87cm", height="5cm"),
    s(6, name="!!dot", preset="ellipse", fill=WHITE,
      x="14.4cm", y="1.8cm", width="1.2cm", height="1.2cm"),
    # Split bar title
    t(6, "MEET THE", "1cm", "1cm", "14cm", "3cm",
      "Segoe UI Black", 32, WHITE, bold=True),
    t(6, "TEAM", "17cm", "1cm", "16cm", "3cm",
      "Segoe UI Black", 32, BLACK, bold=True),
    # 3 team cards
    s(6, preset="roundRect", fill=LGRAY,
      x="1.5cm", y="6.5cm", width="9.5cm", height="8cm"),
    t(6, "[ Photo ]", "1.5cm", "6.5cm", "9.5cm", "5cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.40"),
    t(6, "Clara Eriksen", "2cm", "11.8cm", "8.5cm", "1cm",
      "Segoe UI Black", 12, BLACK, bold=True),
    t(6, "Founder & Creative Director", "2cm", "13cm", "8.5cm", "0.9cm",
      "Segoe UI", 10, DIM),
    s(6, preset="roundRect", fill=LGRAY,
      x="12.19cm", y="6.5cm", width="9.5cm", height="8cm"),
    t(6, "[ Photo ]", "12.19cm", "6.5cm", "9.5cm", "5cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.40"),
    t(6, "James Osei", "12.69cm", "11.8cm", "8.5cm", "1cm",
      "Segoe UI Black", 12, BLACK, bold=True),
    t(6, "Strategy & Brand Partner", "12.69cm", "13cm", "8.5cm", "0.9cm",
      "Segoe UI", 10, DIM),
    s(6, preset="roundRect", fill=LGRAY,
      x="22.88cm", y="6.5cm", width="9.5cm", height="8cm"),
    t(6, "[ Photo ]", "22.88cm", "6.5cm", "9.5cm", "5cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.40"),
    t(6, "Yuki Tanaka", "23.38cm", "11.8cm", "8.5cm", "1cm",
      "Segoe UI Black", 12, BLACK, bold=True),
    t(6, "Motion & Digital Lead", "23.38cm", "13cm", "8.5cm", "0.9cm",
      "Segoe UI", 10, DIM),
    # Bottom quote
    s(6, preset="rect", fill=LGRAY, x="1.5cm", y="16cm", width="30.87cm", height="0.05cm"),
    t(6, '"We don\'t decorate. We communicate."  — Forma Nova Manifesto',
      "1.5cm", "16.5cm", "30cm", "1cm", "Segoe UI", 11, DIM),
])

# ─── S7 CTA — blue bg, LIME bottom band, white CTA ───
print("\n[S7]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={BLUE}")
s7_star = asterisk(7, 28, 5, 2.2, LIME)
batch(DECK, s7_star + [
    s(7, name="!!blockA", preset="rect", fill=BLUE,
      x="0cm", y="0cm", width="33.87cm", height="19.05cm", opacity="1.0"),
    s(7, name="!!blockB", preset="rect", fill=LIME,
      x="0cm", y="10cm", width="33.87cm", height="9.05cm"),
    s(7, name="!!dot", preset="ellipse", fill=BLUE,
      x="6cm", y="9.2cm", width="1.2cm", height="1.2cm"),
    t(7, "START A PROJECT", "1.5cm", "1.5cm", "20cm", "0.9cm", "Segoe UI", 9, LIME),
    s(7, preset="rect", fill=LIME, x="1.5cm", y="2.8cm", width="4cm", height="0.10cm"),
    t(7, "Let's build\nsomething\niconic.", "1.5cm", "3.5cm", "26cm", "8cm",
      "Segoe UI Black", 52, WHITE, bold=True),
    # CTA inside lime band
    s(7, preset="roundRect", fill=BLACK,
      x="1.5cm", y="11.5cm", width="14cm", height="2.8cm"),
    t(7, "Start a Project  →", "1.5cm", "11.5cm", "14cm", "2.8cm",
      "Segoe UI Black", 14, LIME, bold=True, align="center", valign="c"),
    t(7, "hello@formanova.studio", "1.5cm", "15.5cm", "18cm", "1cm",
      "Segoe UI Black", 12, BLACK, bold=True),
    t(7, "Oslo  ·  London  ·  Tokyo", "1.5cm", "17cm", "18cm", "1cm",
      "Segoe UI", 11, BLACK),
    t(7, "formanova.studio", "26cm", "17.8cm", "7.87cm", "0.9cm",
      "Segoe UI", 9, BLACK, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
