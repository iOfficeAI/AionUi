"""
morph-template v42-softedge — Lumina: Design Portfolio  (AURORA DARK)
Same as v42, but adds layered soft-edge (柔化边缘) to aurora ellipses.

Soft-edge strategy:
  越靠背景 → softedge 越大，越靠前景 → softedge 越小
  Outer base  (r×1.00 = background) : softedge = r × 2.5 pt
  Middle glow (r×0.70 = midground)  : softedge = r × 1.0 pt
  Inner core  (r×0.38 = foreground) : softedge = r × 0.4 pt
  e.g. r=10 → outer 25 pt / middle 10 pt / inner 4 pt
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v42-softedge.pptx")
DARK    = "050510"
NAVY    = "0A0A20"
BLUE    = "1844FF"
ORANGE  = "FF6622"
PURPLE  = "8822EE"
TEAL    = "00DDBB"
AMBER   = "FFB830"
WHITE   = "FFFFFF"
DIM     = "8899BB"
LGRAY   = "334455"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def aurora(slide, name_suffix, cx, cy, r, color1, color2, angle, opacity="0.90"):
    """Aurora sphere: 3 layered ellipses — base + glow + core.
    Soft-edge strategy: outer (background) = largest, inner (foreground) = smallest.
    """
    x = max(0.0, round(cx - r, 2))
    y = max(0.0, round(cy - r, 2))
    r2 = round(r * 0.70, 2)
    x2 = max(0.0, round(cx - r2, 2))
    y2 = max(0.0, round(cy - r2, 2))
    r3 = round(r * 0.38, 2)
    x3 = max(0.0, round(cx - r3, 2))
    y3 = max(0.0, round(cy - r3, 2))

    # 越靠背景 → softedge 越大
    se_outer  = round(r * 2.5, 1)   # background layer: e.g. r=10 → 25 pt
    se_middle = round(r * 1.0, 1)   # mid layer:        e.g. r=10 → 10 pt
    se_inner  = round(r * 0.4, 1)   # foreground core:  e.g. r=10 →  4 pt

    return [
        s(slide, name=f"!!aurora{name_suffix}", preset="ellipse", fill=color1,
          gradient=f"{color1}-{color2}-{angle}",
          x=f"{x}cm", y=f"{y}cm",
          width=f"{min(r*2, 33.87 - x):.2f}cm",
          height=f"{min(r*2, 19.05 - y):.2f}cm",
          opacity=opacity, softedge=str(se_outer)),
        s(slide, preset="ellipse", fill=color2,
          gradient=f"{color2}-{PURPLE}-{(angle+60)%360}",
          x=f"{x2}cm", y=f"{y2}cm",
          width=f"{r2*2:.2f}cm", height=f"{r2*2:.2f}cm", opacity="0.55",
          softedge=str(se_middle)),
        s(slide, preset="ellipse", fill=AMBER,
          x=f"{x3}cm", y=f"{y3}cm",
          width=f"{r3*2:.2f}cm", height=f"{r3*2:.2f}cm", opacity="0.30",
          softedge=str(se_inner)),
    ]


def sparkle(slide, cx, cy, color="FFFFFF"):
    """4-pointed sparkle ✦ — named cross for morph."""
    x_h = max(0.0, round(cx - 1.5, 2))
    y_h = max(0.0, round(cy - 0.07, 2))
    x_v = max(0.0, round(cx - 0.07, 2))
    y_v = max(0.0, round(cy - 1.5, 2))
    x_d = max(0.0, round(cx - 0.9, 2))
    y_d = max(0.0, round(cy - 0.05, 2))
    return [
        s(slide, name="!!spark-h", preset="rect", fill=color,
          x=f"{x_h}cm", y=f"{y_h}cm", width="3cm", height="0.14cm"),
        s(slide, name="!!spark-v", preset="rect", fill=color,
          x=f"{x_v}cm", y=f"{y_v}cm", width="0.14cm", height="3cm"),
        s(slide, preset="rect", fill=color,
          x=f"{x_d}cm", y=f"{y_d}cm", width="1.8cm", height="0.07cm",
          rotation="45", opacity="0.55"),
        s(slide, preset="rect", fill=color,
          x=f"{x_d}cm", y=f"{y_d}cm", width="1.8cm", height="0.07cm",
          rotation="-45", opacity="0.55"),
    ]


def small_spark(slide, cx, cy, size, color, opacity="0.80"):
    """Tiny sparkle accent."""
    x = max(0.0, round(cx - size, 2))
    y = max(0.0, round(cy - 0.04, 2))
    xv = max(0.0, round(cx - 0.04, 2))
    yv = max(0.0, round(cy - size, 2))
    return [
        s(slide, preset="rect", fill=color,
          x=f"{x}cm", y=f"{y}cm", width=f"{size*2}cm", height="0.08cm", opacity=opacity),
        s(slide, preset="rect", fill=color,
          x=f"{xv}cm", y=f"{yv}cm", width="0.08cm", height=f"{size*2}cm", opacity=opacity),
    ]


def info_bar(slide, left_text, right_text):
    """Bottom info bar: thin line + two text labels."""
    return [
        s(slide, preset="rect", fill=DIM, opacity="0.40",
          x="1.5cm", y="17.8cm", width="30.87cm", height="0.04cm"),
        t(slide, left_text, "1.5cm", "18cm", "16cm", "0.8cm",
          "Segoe UI", 9, DIM),
        t(slide, right_text, "17.5cm", "18cm", "15cm", "0.8cm",
          "Segoe UI", 9, DIM, align="right"),
    ]


# ─── S1 HERO — dark, aurora top-right, centered title, sparkle left ───
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={DARK}")
s1_aurora = aurora(1, "", 26, 6, 10, ORANGE, PURPLE, 135)   # outer=25pt mid=10pt inner=4pt
s1_spark  = sparkle(1, 4, 3.5)
s1_sm     = small_spark(1, 30.5, 0.8, 0.6, WHITE, "0.70")
batch(DECK, s1_aurora + s1_spark + s1_sm + info_bar(1, "www.luminadesign.co", "By Jamie Chastain") + [
    s(1, preset="rect", fill=BLUE,
      x="28cm", y="1.5cm", width="0.9cm", height="0.9cm"),
    t(1, "Graphic\nDesign", "1.5cm", "6cm", "30.87cm", "8cm",
      "Segoe UI Black", 60, WHITE, bold=True, align="center"),
    s(1, preset="rect", fill=LGRAY, x="1.5cm", y="14.5cm", width="30.87cm", height="0.04cm"),
    t(1, "Portfolio", "1.5cm", "15cm", "16cm", "1.2cm",
      "Segoe UI", 16, WHITE),
    t(1, "By Jamie Chastain", "17.5cm", "15cm", "15cm", "1.2cm",
      "Segoe UI", 14, DIM, align="right"),
])

# ─── S2 INTRODUCTION — aurora bottom-left, bio text, orbital arc hint ───
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={NAVY}")
s2_aurora = aurora(2, "", 7, 14, 8, TEAL, BLUE, 160, "0.85")   # outer=20pt mid=8pt inner=3.2pt
s2_spark  = sparkle(2, 28, 4, WHITE)
s2_sm     = small_spark(2, 1.5, 8, 0.5, TEAL, "0.60")
batch(DECK, s2_aurora + s2_spark + s2_sm + info_bar(2, "www.luminadesign.co", "By Jamie Chastain") + [
    s(2, preset="rect", fill=BLUE,
      x="0.8cm", y="1.5cm", width="0.9cm", height="0.9cm"),
    t(2, "Introduction", "5cm", "1.8cm", "24cm", "2.5cm",
      "Segoe UI", 26, WHITE, align="center"),
    s(2, preset="rect", fill=LGRAY, opacity="0.50",
      x="5cm", y="4.5cm", width="24cm", height="0.04cm"),
    t(2, "About Me", "5cm", "5.5cm", "24cm", "1.2cm",
      "Segoe UI Black", 14, WHITE, bold=True),
    t(2, ("A multidisciplinary graphic designer with 8+ years of experience "
          "creating bold visual identities, motion campaigns, and interactive experiences "
          "for brands across fashion, tech, and culture.\n\n"
          "Previously at Pentagram, now working independently with clients worldwide."),
      "5cm", "7.2cm", "24cm", "6cm", "Segoe UI", 12, DIM),
    s(2, preset="rect", fill=LGRAY, opacity="0.50",
      x="5cm", y="13.5cm", width="24cm", height="0.04cm"),
    t(2, ("A multidisciplinary graphic designer with 8+ years "
          "creating bold visual identities and motion campaigns."),
      "5cm", "14.2cm", "24cm", "3cm", "Segoe UI", 12, DIM),
])

# ─── S3 SELECTED WORK — aurora center-right, work title full, project card ───
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={DARK}")
s3_aurora = aurora(3, "", 22, 10, 9, ORANGE, TEAL, 100, "0.80")   # outer=22.5pt mid=9pt inner=3.6pt
s3_spark  = sparkle(3, 7, 14)
s3_sm1    = small_spark(3, 1, 2, 0.5, WHITE, "0.65")
s3_sm2    = small_spark(3, 32, 17, 0.4, TEAL, "0.55")
batch(DECK, s3_aurora + s3_spark + s3_sm1 + s3_sm2 +
      info_bar(3, "Selected Work  2022 – 2025", "lumina.design/work") + [
    s(3, preset="rect", fill=BLUE,
      x="0.8cm", y="0.8cm", width="0.9cm", height="0.9cm"),
    t(3, "Selected\nWork", "1.5cm", "2cm", "18cm", "5cm",
      "Segoe UI Black", 44, WHITE, bold=True),
    s(3, preset="roundRect", fill=LGRAY, opacity="0.80",
      x="1.5cm", y="8cm", width="14cm", height="8cm"),
    t(3, "[ Project Preview ]", "1.5cm", "8cm", "14cm", "8cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.55"),
    t(3, "Orbit — Brand Identity", "1.5cm", "16.3cm", "14cm", "1cm",
      "Segoe UI Black", 12, WHITE, bold=True),
    t(3, "Identity  ·  Motion  ·  Web  ·  2024",
      "1.5cm", "17.5cm", "14cm", "0.8cm", "Segoe UI", 10, DIM),
])

# ─── S4 WORK 2 — aurora top-left, 2 project cards right ───
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={NAVY}")
s4_aurora = aurora(4, "", 5, 5, 7, PURPLE, ORANGE, 45, "0.82")   # outer=17.5pt mid=7pt inner=2.8pt
s4_spark  = sparkle(4, 26, 14, WHITE)
s4_sm     = small_spark(4, 32, 2, 0.5, ORANGE, "0.60")
batch(DECK, s4_aurora + s4_spark + s4_sm +
      info_bar(4, "Selected Work", "2 / 4") + [
    s(4, preset="rect", fill=PURPLE,
      x="0.8cm", y="0.8cm", width="0.9cm", height="0.9cm"),
    t(4, "More\nWork.", "1cm", "2.5cm", "12cm", "5cm",
      "Segoe UI Black", 40, WHITE, bold=True),
    s(4, preset="roundRect", fill=LGRAY, opacity="0.70",
      x="14cm", y="0.5cm", width="19.37cm", height="8.5cm"),
    t(4, "[ Neon Tokyo — Campaign ]", "14cm", "0.5cm", "19.37cm", "8.5cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.55"),
    t(4, "Neon Tokyo", "14cm", "9.3cm", "19.37cm", "1cm",
      "Segoe UI Black", 12, WHITE, bold=True),
    t(4, "Campaign  ·  Motion  ·  2023", "14cm", "10.5cm", "19.37cm", "0.8cm",
      "Segoe UI", 10, DIM),
    s(4, preset="roundRect", fill=LGRAY, opacity="0.70",
      x="14cm", y="11.5cm", width="9.2cm", height="7cm"),
    t(4, "[ Auris ]", "14cm", "11.5cm", "9.2cm", "7cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.55"),
    t(4, "Auris Audio", "14cm", "18.7cm", "9.2cm", "0.85cm",
      "Segoe UI Black", 11, WHITE, bold=True),
    s(4, preset="roundRect", fill=LGRAY, opacity="0.70",
      x="23.87cm", y="11.5cm", width="9.5cm", height="7cm"),
    t(4, "[ Mira ]", "23.87cm", "11.5cm", "9.5cm", "7cm",
      "Segoe UI", 10, DIM, align="center", valign="c", opacity="0.55"),
    t(4, "Mira Health", "23.87cm", "18.7cm", "9.5cm", "0.85cm",
      "Segoe UI Black", 11, WHITE, bold=True),
    t(4, "Brand, Motion, Web, Print.", "1cm", "8.5cm", "12cm", "1.5cm",
      "Segoe UI", 13, DIM),
    t(4, "60+\nprojects", "1cm", "11cm", "12cm", "5cm",
      "Segoe UI Black", 32, WHITE, bold=True),
])

# ─── S5 SKILLS & PROCESS — aurora center wide, skills grid ───
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={DARK}")
s5_aurora = aurora(5, "", 17, 8, 14, BLUE, ORANGE, 90, "0.60")   # outer=35pt mid=14pt inner=5.6pt
s5_spark  = sparkle(5, 4, 3.5)
s5_sm1    = small_spark(5, 32, 15, 0.5, WHITE, "0.55")
s5_sm2    = small_spark(5, 2, 16, 0.4, TEAL, "0.50")
batch(DECK, s5_aurora + s5_spark + s5_sm1 + s5_sm2 +
      info_bar(5, "Skills & Tools", "lumina.design") + [
    s(5, preset="rect", fill=DARK, opacity="0.45",
      x="0cm", y="0cm", width="33.87cm", height="19.05cm"),
    s(5, preset="rect", fill=BLUE,
      x="0.8cm", y="0.8cm", width="0.9cm", height="0.9cm"),
    t(5, "Skills &\nProcess.", "1.5cm", "1.8cm", "30cm", "5cm",
      "Segoe UI Black", 40, WHITE, bold=True, align="center"),
    t(5, "DESIGN", "1.5cm", "8cm", "7cm", "0.8cm", "Segoe UI Black", 10, TEAL, bold=True),
    t(5, "Brand Identity\nTypography\nArt Direction\nPackaging", "1.5cm", "9.2cm",
      "7cm", "5cm", "Segoe UI", 11, WHITE),
    t(5, "MOTION", "10.5cm", "8cm", "7cm", "0.8cm", "Segoe UI Black", 10, ORANGE, bold=True),
    t(5, "After Effects\nCinema 4D\nWebGL / Three.js\nPrototyping", "10.5cm", "9.2cm",
      "7cm", "5cm", "Segoe UI", 11, WHITE),
    t(5, "STRATEGY", "19.5cm", "8cm", "7cm", "0.8cm", "Segoe UI Black", 10, AMBER, bold=True),
    t(5, "Brand Positioning\nAudience Research\nNaming\nMessaging", "19.5cm", "9.2cm",
      "7cm", "5cm", "Segoe UI", 11, WHITE),
    t(5, "DIGITAL", "27cm", "8cm", "6cm", "0.8cm", "Segoe UI Black", 10, PURPLE, bold=True),
    t(5, "Webflow\nFigma\nFramer\nShopify", "27cm", "9.2cm",
      "6cm", "5cm", "Segoe UI", 11, WHITE),
])

# ─── S6 CONTACT — aurora expands to dominate, centered CTA ───
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={DARK}")
s6_aurora = aurora(6, "", 17, 9.5, 13, ORANGE, PURPLE, 135, "0.88")   # outer=32.5pt mid=13pt inner=5.2pt
s6_spark  = sparkle(6, 28, 3.5)
s6_sm1    = small_spark(6, 5, 1.5, 0.7, WHITE, "0.70")
s6_sm2    = small_spark(6, 1.5, 17, 0.5, TEAL, "0.55")
batch(DECK, s6_aurora + s6_spark + s6_sm1 + s6_sm2 +
      info_bar(6, "lumina.design", "©2025 Jamie Chastain") + [
    s(6, preset="rect", fill=DARK, opacity="0.55",
      x="0cm", y="0cm", width="33.87cm", height="19.05cm"),
    s(6, preset="rect", fill=BLUE,
      x="0.8cm", y="0.8cm", width="0.9cm", height="0.9cm"),
    t(6, "Let's create\nsomething\nunforgettable.", "1.5cm", "2cm", "30.87cm", "10cm",
      "Segoe UI Black", 48, WHITE, bold=True, align="center"),
    s(6, preset="roundRect", fill=WHITE,
      x="9cm", y="13cm", width="16cm", height="2.8cm"),
    t(6, "hello@luminadesign.co  →", "9cm", "13cm", "16cm", "2.8cm",
      "Segoe UI Black", 14, DARK, bold=True, align="center", valign="c"),
    t(6, "Available for new projects from Q3 2025",
      "1.5cm", "16.5cm", "30.87cm", "0.9cm",
      "Segoe UI", 11, DIM, align="center"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
