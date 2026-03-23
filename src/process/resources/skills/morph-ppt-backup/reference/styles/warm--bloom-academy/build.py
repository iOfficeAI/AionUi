"""
morph-template v44-4 — Bloom Academy (EDU BLOBS + Soft Edges v2)
Layered soft-edge philosophy:
  Layer 0 (deepest bg)   - outer blob ellipse: softedge = round(avg_r * 5) pt
                           avg_r=15 → 75pt,  avg_r=8 → 40pt,  avg_r=4.5 → 22pt
  Layer 1 (mid)          - inner white overlay: NO softedge (crisp oval → depth contrast)
  Layer 2 (foreground)   - icon badges, dots, pie pieces → NO softedge
Color: text must contrast with background (DARK on light bg, WHITE on colored circles).
Morph transitions preserved.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v44-4.pptx")
CREAM   = "FAF5EC"
SKYBLUE = "4DAADD"
CORAL   = "E84444"
GREEN   = "44BB55"
YELLOW  = "F5C840"
DARK    = "1A1A2A"
DIM     = "6677AA"
WHITE   = "FFFFFF"
LSKY    = "D0EEF8"
LCORAL  = "FAD4D4"
LGREEN  = "CCEEDD"
LYELL   = "FEF5CC"


def blob(slide, name, cx, cy, rx, ry, color, opacity="0.88"):
    """Soft organic blob: outer + inner ellipse.
    Layered depth philosophy:
      - Outer (background): softedge = round(avg_r * 5) pt → very dissolved
      - Inner white overlay (mid-layer): NO softedge → crisp oval creates depth contrast
    """
    avg_r = (rx + ry) / 2
    outer_se = round(avg_r * 5)   # bigger blob = deeper bg = more blur

    x  = max(0.0, round(cx - rx, 2))
    y  = max(0.0, round(cy - ry, 2))
    ix = max(0.0, round(cx - rx * 0.70, 2))
    iy = max(0.0, round(cy - ry * 0.70, 2))

    items = [s(slide, name=name, preset="ellipse", fill=color,
               x=f"{x}cm", y=f"{y}cm",
               width=f"{min(rx*2, 33.87-x):.2f}cm",
               height=f"{min(ry*2, 19.05-y):.2f}cm",
               opacity=opacity,
               softedge=str(outer_se))]
    # Inner white overlay: NO softedge — crisp edge contrasts with dissolved outer,
    # creating a visible mid-layer that adds spatial depth
    items.append(s(slide, preset="ellipse", fill=WHITE,
                   x=f"{ix}cm", y=f"{iy}cm",
                   width=f"{rx * 1.4:.2f}cm", height=f"{ry * 1.4:.2f}cm",
                   opacity="0.20"))
    return items


def icon_badge(slide, cx, cy, r, color, icon_text, label, sub=""):
    """Icon circle + label below. Small softedge for slight depth."""
    x = max(0.0, round(cx - r, 2))
    y = max(0.0, round(cy - r, 2))
    items = [
        s(slide, preset="ellipse", fill=color,
          x=f"{x}cm", y=f"{y}cm", width=f"{r*2}cm", height=f"{r*2}cm"),
        t(slide, icon_text, f"{x}cm", f"{y}cm", f"{r*2}cm", f"{r*2}cm",
          "Segoe UI Black", max(8, int(r * 4.5)), WHITE,
          bold=True, align="center", valign="c"),
        t(slide, label, f"{cx-r-0.3:.2f}cm", f"{cy+r+0.2:.2f}cm",
          f"{r*2+0.6:.2f}cm", "0.9cm",
          "Segoe UI Black", 10, DARK, bold=True, align="center"),
    ]
    if sub:
        items.append(t(slide, sub, f"{cx-r-0.3:.2f}cm", f"{cy+r+1.2:.2f}cm",
                       f"{r*2+0.6:.2f}cm", "0.9cm",
                       "Segoe UI", 9, DIM, align="center"))
    return items


def table_row(slide, y, label, desc, is_header=False):
    color = DARK if not is_header else WHITE
    items = []
    if is_header:
        items.append(s(slide, preset="rect", fill=SKYBLUE,
                       x="1.5cm", y=f"{y}cm", width="16cm", height="1.1cm"))
    else:
        items.append(s(slide, preset="rect", fill=CREAM, opacity="0.01",
                       x="1.5cm", y=f"{y}cm", width="16cm", height="1.0cm"))
    items += [
        t(slide, label, "2cm", f"{y + 0.1:.2f}cm", "6cm", "0.9cm",
          "Segoe UI Black", 10, color, bold=True),
        t(slide, desc, "8.5cm", f"{y + 0.1:.2f}cm", "9cm", "0.9cm",
          "Segoe UI", 10, color if is_header else DIM),
    ]
    return items


if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


# ─── S1 HERO ───────────────────────────────────────────────────────────────────
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s1_blobTL = blob(1, "!!blob-tl", 0,     0,     9, 7, SKYBLUE, "0.85")
s1_blobTR = blob(1, "!!blob-tr", 33.87, 0,     9, 7, CORAL,   "0.85")
s1_blobBL = blob(1, "!!blob-bl", 0,     19.05, 8, 6, GREEN,   "0.80")
s1_blobBR = blob(1, "!!blob-br", 33.87, 19.05, 8, 6, YELLOW,  "0.80")
batch(DECK, s1_blobTL + s1_blobTR + s1_blobBL + s1_blobBR + [
    t(1, "BLOOM ACADEMY", "1.5cm", "1.5cm", "30cm", "0.9cm",
      "Segoe UI", 9, DIM, align="center"),
    t(1, "Special Needs\nEducation Center", "3cm", "5.5cm", "28cm", "7cm",
      "Segoe UI Black", 48, DARK, bold=True, align="center"),
    t(1, "Here is where your learning journey begins.",
      "3cm", "13.5cm", "28cm", "1.5cm",
      "Segoe UI", 16, DIM, align="center"),
    s(1, preset="rect", fill=DIM, opacity="0.30",
      x="13cm", y="15.3cm", width="8cm", height="0.05cm"),
    t(1, "27 modules  ·  Online & In-person  ·  All ages",
      "3cm", "15.8cm", "28cm", "1cm", "Segoe UI", 11, DIM, align="center"),
])

# ─── S2 CURRICULUM ─────────────────────────────────────────────────────────────
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
s2_blobTL = blob(2, "!!blob-tl", 0,     0,     10, 8, SKYBLUE, "0.80")
s2_blobTR = blob(2, "!!blob-tr", 33.87, 19.05, 7,  6, YELLOW,  "0.75")
s2_blobBL = blob(2, "!!blob-bl", 33.87, 0,     6,  5, GREEN,   "0.70")
s2_blobBR = blob(2, "!!blob-br", 0,     19.05, 6,  5, CORAL,   "0.75")
batch(DECK, s2_blobTL + s2_blobTR + s2_blobBL + s2_blobBR +
      table_row(2, 5.2, "SUBJECT", "DESCRIPTION", is_header=True) +
      table_row(2, 6.8, "Neptune", "Neptune is the farthest planet from the Sun.") +
      table_row(2, 8.5, "Jupiter", "Jupiter is the biggest planet in the Solar System.") +
      table_row(2, 10.2, "Mars", "Mars is actually a cold place full of iron-oxide dust.") +
      table_row(2, 11.9, "Venus", "Venus has a dense atmosphere and is the hottest planet.") +
      table_row(2, 13.6, "Saturn", "Saturn is the ringed one and a gas giant.") + [
    *[s(2, preset="rect", fill="DDDDDD", x="1.5cm", y=f"{y}cm",
        width="16cm", height="0.04cm")
      for y in [7.9, 9.6, 11.3, 13.0, 14.7]],
    t(2, "THE CURRICULUM", "1.5cm", "1.5cm", "18cm", "1cm",
      "Segoe UI Black", 16, DARK, bold=True),
    t(2, "Our Numbers", "19.5cm", "1.5cm", "13cm", "1cm",
      "Segoe UI Black", 16, DARK, bold=True),
    # Stat cards: use DARK for big numbers (same-hue text on same-hue-light bg = low contrast)
    s(2, preset="roundRect", fill=LSKY,
      x="19.5cm", y="3cm", width="5.5cm", height="5.5cm"),
    t(2, "35%", "19.5cm", "3.5cm", "5.5cm", "3cm",
      "Segoe UI Black", 32, DARK, bold=True, align="center"),
    t(2, "Mercury", "19.5cm", "6.5cm", "5.5cm", "0.9cm",
      "Segoe UI", 10, DIM, align="center"),
    s(2, preset="roundRect", fill=LGREEN,
      x="25.5cm", y="3cm", width="5.5cm", height="5.5cm"),
    t(2, "15%", "25.5cm", "3.5cm", "5.5cm", "3cm",
      "Segoe UI Black", 32, DARK, bold=True, align="center"),
    t(2, "Venus", "25.5cm", "6.5cm", "5.5cm", "0.9cm",
      "Segoe UI", 10, DIM, align="center"),
    s(2, preset="roundRect", fill=LYELL,
      x="19.5cm", y="9cm", width="5.5cm", height="5.5cm"),
    t(2, "30%", "19.5cm", "9.5cm", "5.5cm", "3cm",
      "Segoe UI Black", 32, DARK, bold=True, align="center"),
    t(2, "Mars", "19.5cm", "12.5cm", "5.5cm", "0.9cm",
      "Segoe UI", 10, DIM, align="center"),
    s(2, preset="roundRect", fill=LCORAL,
      x="25.5cm", y="9cm", width="5.5cm", height="5.5cm"),
    t(2, "20%", "25.5cm", "9.5cm", "5.5cm", "3cm",
      "Segoe UI Black", 32, DARK, bold=True, align="center"),
    t(2, "Jupiter", "25.5cm", "12.5cm", "5.5cm", "0.9cm",
      "Segoe UI", 10, DIM, align="center"),
    # 底部彩色点装饰 — 小圆 (1.5cm)，前景不加 softedge
    *[s(2, preset="ellipse", fill=c,
        x=f"{19.5 + i * 2.2:.1f}cm", y="15cm",
        width="1.5cm", height="1.5cm")
      for i, c in enumerate([SKYBLUE, GREEN, YELLOW, CORAL, GREEN, SKYBLUE])],
])

# ─── S3 STATISTICS ─────────────────────────────────────────────────────────────
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s3_blobTL = blob(3, "!!blob-tl", 33.87, 19.05, 9, 8, CORAL,   "0.80")
s3_blobTR = blob(3, "!!blob-tr", 0,     0,     9, 7, GREEN,   "0.78")
s3_blobBL = blob(3, "!!blob-bl", 0,     19.05, 7, 6, SKYBLUE, "0.70")
s3_blobBR = blob(3, "!!blob-br", 33.87, 0,     7, 6, YELLOW,  "0.72")
pie_cx, pie_cy, pie_r = 7, 11, 4.5
# pie chart — 前景数据元素，不加 softedge（保持清晰可读）
pie_shapes = [
    s(3, preset="ellipse", fill=SKYBLUE,
      x=f"{pie_cx:.1f}cm", y=f"{pie_cy - pie_r:.1f}cm",
      width=f"{pie_r}cm", height=f"{pie_r * 2:.1f}cm"),
    s(3, preset="ellipse", fill=GREEN,
      x=f"{pie_cx:.1f}cm", y=f"{pie_cy - pie_r:.1f}cm",
      width=f"{pie_r}cm", height=f"{pie_r:.1f}cm"),
    s(3, preset="ellipse", fill=YELLOW,
      x=f"{pie_cx - pie_r:.1f}cm", y=f"{pie_cy:.1f}cm",
      width=f"{pie_r}cm", height=f"{pie_r:.1f}cm"),
    s(3, preset="ellipse", fill=CORAL,
      x=f"{pie_cx - pie_r:.1f}cm", y=f"{pie_cy - pie_r:.1f}cm",
      width=f"{pie_r * 2:.1f}cm", height=f"{pie_r * 2:.1f}cm"),
    # Donut center mask — no softedge (crisp hole)
    s(3, preset="ellipse", fill=CREAM,
      x=f"{pie_cx - pie_r * 0.5:.1f}cm", y=f"{pie_cy - pie_r * 0.5:.1f}cm",
      width=f"{pie_r:.1f}cm", height=f"{pie_r:.1f}cm"),
]
batch(DECK, s3_blobTL + s3_blobTR + s3_blobBL + s3_blobBR + pie_shapes + [
    t(3, "Statistics", "1.5cm", "1.5cm", "16cm", "1.2cm",
      "Segoe UI Black", 20, DARK, bold=True),
    # Legend dots — 0.8cm 小圆，不加 softedge
    *[item for (c, pct, label) in [
        (SKYBLUE, "25%", "Mars"), (GREEN, "26%", "Venus"),
        (YELLOW, "16%", "Neptune"), (CORAL, "35%", "Saturn"),
      ] for item in [
        s(3, preset="ellipse", fill=c,
          x="14cm", y=f"{5.5 + [SKYBLUE,GREEN,YELLOW,CORAL].index(c)*1.8:.1f}cm",
          width="0.8cm", height="0.8cm"),
        t(3, f"●  {pct}  {label}",
          "15.2cm", f"{5.4 + [SKYBLUE,GREEN,YELLOW,CORAL].index(c)*1.8:.1f}cm",
          "8cm", "1.2cm", "Segoe UI", 11, DARK),
      ]],
    t(3, "To modify this graph, follow the link and\nchange the data and paste the new graph here.",
      "1.5cm", "16cm", "18cm", "2.5cm", "Segoe UI", 9, DIM),
    t(3, "Our Academic Areas", "19.5cm", "1.5cm", "14cm", "1.2cm",
      "Segoe UI Black", 16, DARK, bold=True),
    # Academic area circles — 1.5cm 小圆，不加 softedge
    *[item for i, (planet, desc) in enumerate([
        ("Mercury", "Mercury is the closest planet to the Sun"),
        ("Venus", "Venus has a beautiful name, but it's terribly hot"),
        ("Mars", "Despite being red, Mars is actually a cold place"),
        ("Jupiter", "Jupiter is the biggest planet in the Solar System"),
        ("Saturn", "Saturn is the ringed one and a gas giant"),
        ("Neptune", "Neptune is the farthest planet from the Sun"),
      ]) for item in [
        s(3, preset="ellipse", fill=[SKYBLUE,GREEN,CORAL,YELLOW,GREEN,SKYBLUE][i],
          x=f"{19.5 + (i % 3) * 4.8:.1f}cm",
          y=f"{3.5 + (i // 3) * 5:.1f}cm",
          width="1.5cm", height="1.5cm"),
        t(3, planet,
          f"{19.5 + (i % 3) * 4.8:.1f}cm",
          f"{5.3 + (i // 3) * 5:.1f}cm",
          "4.5cm", "0.8cm", "Segoe UI Black", 10, DARK, bold=True),
        t(3, desc,
          f"{19.5 + (i % 3) * 4.8:.1f}cm",
          f"{6.2 + (i // 3) * 5:.1f}cm",
          "4.5cm", "1.5cm", "Segoe UI", 9, DIM),
      ]],
])

# ─── S4 TOPICS GRID ────────────────────────────────────────────────────────────
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
s4_blobTL = blob(4, "!!blob-tl", 0,     0,     11, 9, GREEN,   "0.75")
s4_blobTR = blob(4, "!!blob-tr", 33.87, 0,     10, 8, SKYBLUE, "0.78")
s4_blobBL = blob(4, "!!blob-bl", 33.87, 19.05, 8,  6, CORAL,   "0.70")
s4_blobBR = blob(4, "!!blob-br", 0,     19.05, 8,  6, YELLOW,  "0.72")
topics = [
    (SKYBLUE, "☿", "Mercury", "Closest to Sun"),
    (GREEN,   "♀", "Venus",   "Hot & bright"),
    (CORAL,   "♂", "Mars",    "The red planet"),
    (YELLOW,  "♃", "Jupiter", "Giant of planets"),
    (GREEN,   "♄", "Saturn",  "Ring bearer"),
    (SKYBLUE, "♆", "Neptune", "Farthest out"),
]
badge_xs = [5.5, 16.5, 27.5]
badge_ys = [9.5, 14.5]
badge_shapes = []
for i, (color, icon, label, sub) in enumerate(topics):
    cx = badge_xs[i % 3]
    cy = badge_ys[i // 3]
    badge_shapes += icon_badge(4, cx, cy, 1.8, color, icon, label, sub)
batch(DECK, s4_blobTL + s4_blobTR + s4_blobBL + s4_blobBR + badge_shapes + [
    t(4, "Our Topics", "1.5cm", "1.5cm", "30cm", "1.2cm",
      "Segoe UI Black", 22, DARK, bold=True, align="center"),
    t(4, "Explore our full curriculum — something for every curious mind.",
      "3cm", "4cm", "28cm", "1.2cm", "Segoe UI", 13, DIM, align="center"),
    s(4, preset="rect", fill="DDDDDD", x="8cm", y="5.5cm", width="18cm", height="0.05cm"),
])

# ─── S5 NUMBERS ────────────────────────────────────────────────────────────────
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s5_blobTL = blob(5, "!!blob-tl", 0,     0,     13, 11, YELLOW, "0.82")
s5_blobTR = blob(5, "!!blob-tr", 33.87, 19.05, 12, 10, CORAL,  "0.80")
s5_blobBL = blob(5, "!!blob-bl", 0,     19.05, 8,  6,  SKYBLUE,"0.65")
s5_blobBR = blob(5, "!!blob-br", 33.87, 0,     8,  6,  GREEN,  "0.65")
batch(DECK, s5_blobTL + s5_blobTR + s5_blobBL + s5_blobBR + [
    t(5, "Our Numbers", "1.5cm", "1.5cm", "30cm", "1.2cm",
      "Segoe UI Black", 22, DARK, bold=True, align="center"),
    s(5, preset="roundRect", fill=WHITE, opacity="0.85",
      x="4cm", y="4cm", width="11.5cm", height="6.5cm"),
    t(5, "35%", "4cm", "4.5cm", "11.5cm", "4cm",
      "Segoe UI Black", 52, SKYBLUE, bold=True, align="center"),
    t(5, "Mercury  ·  It's close to the Sun",
      "4cm", "8.5cm", "11.5cm", "1.5cm", "Segoe UI", 11, DIM, align="center"),
    s(5, preset="roundRect", fill=WHITE, opacity="0.85",
      x="17cm", y="4cm", width="11.5cm", height="6.5cm"),
    t(5, "15%", "17cm", "4.5cm", "11.5cm", "4cm",
      "Segoe UI Black", 52, GREEN, bold=True, align="center"),
    t(5, "Venus  ·  It's terribly hot",
      "17cm", "8.5cm", "11.5cm", "1.5cm", "Segoe UI", 11, DIM, align="center"),
    s(5, preset="roundRect", fill=WHITE, opacity="0.85",
      x="4cm", y="11.5cm", width="11.5cm", height="6.5cm"),
    t(5, "30%", "4cm", "12cm", "11.5cm", "4cm",
      "Segoe UI Black", 52, CORAL, bold=True, align="center"),
    t(5, "Mars  ·  The cold place",
      "4cm", "16cm", "11.5cm", "1.5cm", "Segoe UI", 11, DIM, align="center"),
    s(5, preset="roundRect", fill=WHITE, opacity="0.85",
      x="17cm", y="11.5cm", width="11.5cm", height="6.5cm"),
    t(5, "20%", "17cm", "12cm", "11.5cm", "4cm",
      "Segoe UI Black", 52, YELLOW, bold=True, align="center"),
    t(5, "Jupiter  ·  The biggest of all",
      "17cm", "16cm", "11.5cm", "1.5cm", "Segoe UI", 11, DIM, align="center"),
    # Accent dot row — 0.9cm 小点，不加 softedge
    *[s(5, preset="ellipse", fill=c,
        x=f"{1.5 + i*1.5:.1f}cm", y="18cm",
        width="0.9cm", height="0.9cm")
      for i, c in enumerate([SKYBLUE, GREEN, YELLOW, CORAL, SKYBLUE, GREEN, YELLOW,
                              CORAL, SKYBLUE, GREEN, YELLOW, CORAL, SKYBLUE, GREEN])],
])

# ─── S6 ACADEMIC AREAS ─────────────────────────────────────────────────────────
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={WHITE}")
s6_blobTL = blob(6, "!!blob-tl", 33.87, 0,     10, 8, CORAL,   "0.78")
s6_blobTR = blob(6, "!!blob-tr", 0,     19.05, 10, 8, GREEN,   "0.78")
s6_blobBL = blob(6, "!!blob-bl", 0,     0,     8,  6, YELLOW,  "0.72")
s6_blobBR = blob(6, "!!blob-br", 33.87, 19.05, 8,  6, SKYBLUE, "0.72")
batch(DECK, s6_blobTL + s6_blobTR + s6_blobBL + s6_blobBR + [
    t(6, "Academic Areas", "3cm", "1.5cm", "28cm", "1.2cm",
      "Segoe UI Black", 22, DARK, bold=True, align="center"),
    # Area icon circles — 1.8cm 小圆有文字，不加 softedge
    *[item for i, (color, icon, planet, desc) in enumerate([
        (SKYBLUE, "☿", "Mercury", "Mercury is the closest planet to the Sun"),
        (GREEN,   "♀", "Venus",   "Venus has a beautiful name, but terribly hot"),
        (CORAL,   "♂", "Mars",    "Despite being red, Mars is actually cold"),
        (YELLOW,  "♃", "Jupiter", "Jupiter is the biggest planet in the System"),
        (GREEN,   "♄", "Saturn",  "Saturn is the ringed one and a gas giant"),
        (SKYBLUE, "♆", "Neptune", "Neptune is the farthest planet from the Sun"),
      ]) for item in [
        s(6, preset="ellipse", fill=color,
          x=f"{5 + (i % 2) * 14:.1f}cm",
          y=f"{4 + (i // 2) * 3.8:.1f}cm",
          width="1.8cm", height="1.8cm"),
        t(6, icon, f"{5 + (i % 2) * 14:.1f}cm", f"{4 + (i // 2) * 3.8:.1f}cm",
          "1.8cm", "1.8cm", "Segoe UI", 12, WHITE, align="center", valign="c"),
        t(6, planet,
          f"{7.3 + (i % 2) * 14:.1f}cm", f"{4 + (i // 2) * 3.8:.1f}cm",
          "10cm", "0.9cm", "Segoe UI Black", 12, DARK, bold=True),
        t(6, desc,
          f"{7.3 + (i % 2) * 14:.1f}cm", f"{5.1 + (i // 2) * 3.8:.1f}cm",
          "10cm", "1.5cm", "Segoe UI", 10, DIM),
      ]],
    t(6, "bloom-academy.edu  ·  27 free modules",
      "3cm", "17.5cm", "28cm", "0.9cm",
      "Segoe UI", 10, DIM, align="center"),
])

# ─── S7 CTA ────────────────────────────────────────────────────────────────────
print("\n[S7]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s7_blobTL = blob(7, "!!blob-tl", 0,     0,     16, 14, SKYBLUE, "0.90")
s7_blobTR = blob(7, "!!blob-tr", 33.87, 19.05, 16, 14, CORAL,   "0.90")
s7_blobBL = blob(7, "!!blob-bl", 0,     19.05, 5,  4,  GREEN,   "0.50")
s7_blobBR = blob(7, "!!blob-br", 33.87, 0,     5,  4,  YELLOW,  "0.50")
batch(DECK, s7_blobTL + s7_blobTR + s7_blobBL + s7_blobBR + [
    t(7, "ENROLL TODAY", "1.5cm", "1.5cm", "30cm", "0.9cm",
      "Segoe UI", 9, DIM, align="center"),
    t(7, "Bloom\nAcademy", "3cm", "4cm", "28cm", "7cm",
      "Segoe UI Black", 56, DARK, bold=True, align="center"),
    t(7, "Here is where your learning journey begins.",
      "3cm", "12cm", "28cm", "1.5cm",
      "Segoe UI", 15, DIM, align="center"),
    s(7, preset="roundRect", fill=DARK,
      x="9.5cm", y="14cm", width="15cm", height="2.8cm"),
    t(7, "Start Learning  →", "9.5cm", "14cm", "15cm", "2.8cm",
      "Segoe UI Black", 14, CREAM, bold=True, align="center", valign="c"),
    t(7, "bloom-academy.edu  ·  @bloomacademy",
      "3cm", "17.5cm", "28cm", "0.9cm",
      "Segoe UI", 10, DIM, align="center"),
])

# ─── Morph transitions ─────────────────────────────────────────────────────────
print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])

validate_and_outline(DECK)
print("\nDone ->", DECK)
