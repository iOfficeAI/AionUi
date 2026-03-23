"""
morph-template v35 — Vital Bloom: Wellness Brand
Ref: Image 1 (Aerial Yoga Y2K) + Image 5 (Мякиши organic blobs)
Techniques: starburst (fan of rotated thin rects), large organic blob ellipses,
            halftone corner dots, stacked ellipses for blob depth
Bold morph: !!bloom (large ellipse) shifts position, size, color each slide
7 slides — wellness app / yoga studio / mindful living
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v35.pptx")
CREAM  = "F5F0E8"
COBALT = "1A3FD8"
LIME   = "7DC840"
LILAC  = "9B8FD8"
SAND   = "E8D8B8"
DARK   = "0A1830"
MIST   = "E8ECFF"
DIM    = "8890B0"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def starburst(slide, cx, cy, rays, length, thick, color, opacity):
    """Fan of thin rects all centered at (cx, cy) at evenly-spaced angles."""
    items = []
    for i in range(rays):
        angle = i * (180 / rays)
        x = round(max(0.0, cx - length / 2), 2)
        y = round(max(0.0, cy - thick / 2), 2)
        items.append(s(slide, preset="rect", fill=color,
                       x=f"{x}cm", y=f"{y}cm",
                       width=f"{length}cm", height=f"{thick}cm",
                       rotation=str(round(angle)), opacity=opacity))
    return items


def halftone(slide, x0, y0, cols, rows, gap, dot_size, color, opacity):
    items = []
    for r in range(rows):
        for c in range(cols):
            x = round(x0 + c * gap, 2)
            y = round(y0 + r * gap, 2)
            if x < 0 or y < 0 or x + dot_size > 34 or y + dot_size > 20:
                continue
            items.append(s(slide, preset="ellipse", fill=color,
                           x=f"{x}cm", y=f"{y}cm",
                           width=f"{dot_size}cm", height=f"{dot_size}cm",
                           opacity=opacity))
    return items


# S1 HERO — large COBALT blob left, starburst top-right, cream BG
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s1_dots = halftone(1, 24, 13.5, 8, 5, 1.2, 0.22, COBALT, "0.10")
s1_star = starburst(1, 28, 5, 8, 8, 0.28, COBALT, "0.65")
batch(DECK, s1_dots + s1_star + [
    # !!bloom — left wide organic blob
    s(1, name="!!bloom", preset="ellipse", fill=COBALT,
      x="0cm", y="2cm", width="17cm", height="13cm", opacity="0.92"),
    s(1, preset="ellipse", fill=LIME, opacity="0.55",
      x="1cm", y="8.5cm", width="9cm", height="6cm"),
    # label + rule
    t(1, "VITAL BLOOM  ·  WELLNESS", "1.5cm", "2.5cm", "14cm", "0.9cm",
      "Segoe UI", 9, MIST),
    s(1, preset="rect", fill=LIME, x="1.5cm", y="3.8cm", width="4cm", height="0.12cm"),
    # hero title on blob
    t(1, "Move.\nBreathe.\nBecome.", "1.5cm", "4.2cm", "14cm", "10cm",
      "Segoe UI Black", 50, MIST, bold=True),
    # right content
    t(1, "Your daily ritual for\nmindful movement\nand lasting vitality.",
      "19cm", "4cm", "13cm", "4.5cm", "Segoe UI", 16, DARK),
    s(1, preset="rect", fill=COBALT, x="19cm", y="9cm", width="13cm", height="0.08cm"),
    t(1, "Yoga  ·  Breathwork  ·  Meditation  ·  Nutrition",
      "19cm", "9.5cm", "13cm", "1cm", "Segoe UI", 11, DIM),
    # secondary star accent
    *starburst(1, 23, 15.5, 6, 4, 0.20, LIME, "0.75"),
    t(1, "vitalbloom.app", "28cm", "17.8cm", "6cm", "1cm",
      "Segoe UI", 10, DIM, align="right"),
])

# S2 ABOUT — bloom shrinks to top-right, starburst center, stat bubbles
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s2_dots = halftone(2, 0, 15, 14, 4, 1.1, 0.20, LIME, "0.14")
s2_star = starburst(2, 16.93, 9.52, 8, 7, 0.26, COBALT, "0.45")
batch(DECK, s2_dots + s2_star + [
    s(2, name="!!bloom", preset="ellipse", fill=COBALT,
      x="22cm", y="0cm", width="12cm", height="8cm", opacity="0.88"),
    s(2, preset="ellipse", fill=LIME, opacity="0.50",
      x="24cm", y="1cm", width="8cm", height="5cm"),
    t(2, "ABOUT US", "1.5cm", "1cm", "16cm", "0.9cm", "Segoe UI", 9, COBALT),
    s(2, preset="rect", fill=COBALT, x="1.5cm", y="2.2cm", width="3.5cm", height="0.12cm"),
    t(2, "Born from the belief\nthat wellness is a\npractice, not a\ndestination.",
      "1.5cm", "2.8cm", "18cm", "10cm", "Segoe UI Black", 36, DARK, bold=True),
    t(2, "We built Vital Bloom for people who want to feel\ngood every day — not just on retreat weekends.",
      "1.5cm", "14cm", "17cm", "2.5cm", "Segoe UI", 13, DIM),
    # 3 stat bubbles bottom
    s(2, preset="ellipse", fill=COBALT,
      x="1.5cm", y="16.5cm", width="4cm", height="2.2cm"),
    t(2, "50K+", "1.5cm", "16.5cm", "4cm", "2.2cm",
      "Segoe UI Black", 15, MIST, bold=True, align="center", valign="c"),
    s(2, preset="ellipse", fill=LIME,
      x="6.5cm", y="16.5cm", width="4cm", height="2.2cm"),
    t(2, "4.9 ★", "6.5cm", "16.5cm", "4cm", "2.2cm",
      "Segoe UI Black", 15, DARK, bold=True, align="center", valign="c"),
    s(2, preset="ellipse", fill=LILAC,
      x="11.5cm", y="16.5cm", width="4cm", height="2.2cm"),
    t(2, "200+\nclasses", "11.5cm", "16.5cm", "4cm", "2.2cm",
      "Segoe UI Black", 11, MIST, bold=True, align="center", valign="c"),
])

# S3 PROGRAMS — bloom bottom-left (LIME), starburst top-right, 3 cards
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s3_star = starburst(3, 30, 3.5, 8, 7, 0.26, LIME, "0.75")
batch(DECK, s3_star + [
    s(3, name="!!bloom", preset="ellipse", fill=LIME,
      x="0cm", y="10cm", width="14cm", height="10cm", opacity="0.80"),
    s(3, preset="ellipse", fill=COBALT, opacity="0.35",
      x="1cm", y="12cm", width="8cm", height="7cm"),
    t(3, "PROGRAMS", "1.5cm", "1cm", "24cm", "0.9cm", "Segoe UI", 9, COBALT),
    s(3, preset="rect", fill=LIME, x="1.5cm", y="2.2cm", width="3.5cm", height="0.12cm"),
    t(3, "Find Your\nPractice.", "1.5cm", "2.8cm", "20cm", "4cm",
      "Segoe UI Black", 44, DARK, bold=True),
    # 3 program cards
    s(3, preset="roundRect", fill=COBALT,
      x="1.5cm", y="8cm", width="9.5cm", height="10cm"),
    t(3, "YOGA", "2cm", "8.5cm", "8.5cm", "1.2cm",
      "Segoe UI Black", 13, LIME, bold=True),
    t(3, "Hatha · Vinyasa · Yin\n50+ classes\n20 – 90 min sessions",
      "2cm", "10cm", "8.5cm", "3.5cm", "Segoe UI", 12, MIST),
    s(3, preset="roundRect", fill=SAND,
      x="12cm", y="8cm", width="9.5cm", height="10cm"),
    t(3, "BREATHWORK", "12.5cm", "8.5cm", "8.5cm", "1.2cm",
      "Segoe UI Black", 13, COBALT, bold=True),
    t(3, "Box · 4-7-8 · Wim Hof\n30+ guided sessions\nfor calm & energy",
      "12.5cm", "10cm", "8.5cm", "3.5cm", "Segoe UI", 12, DARK),
    s(3, preset="roundRect", fill=LILAC,
      x="22.5cm", y="8cm", width="9.5cm", height="10cm"),
    t(3, "MEDITATION", "23cm", "8.5cm", "8.5cm", "1.2cm",
      "Segoe UI Black", 13, MIST, bold=True),
    t(3, "Sleep · Focus · Stress\n40+ meditations\n3 – 30 min formats",
      "23cm", "10cm", "8.5cm", "3.5cm", "Segoe UI", 12, MIST),
])

# S4 PHILOSOPHY — COBALT BG, bloom wide center (LIME), 3 principle columns
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={COBALT}")
s4_star = starburst(4, 5, 16, 8, 7, 0.26, LIME, "0.55")
batch(DECK, s4_star + [
    s(4, name="!!bloom", preset="ellipse", fill=LIME,
      x="6cm", y="3.5cm", width="22cm", height="9cm", opacity="0.85"),
    s(4, preset="ellipse", fill=LILAC, opacity="0.30",
      x="8cm", y="5cm", width="16cm", height="6cm"),
    t(4, "OUR PHILOSOPHY", "1.5cm", "1cm", "24cm", "0.9cm", "Segoe UI", 9, MIST),
    s(4, preset="rect", fill=LIME, x="1.5cm", y="2.2cm", width="3.5cm", height="0.12cm"),
    t(4, "Consistency\nover perfection.", "1.5cm", "2.8cm", "30cm", "8cm",
      "Segoe UI Black", 50, MIST, bold=True),
    # 3 principle columns
    t(4, "LISTEN", "1.5cm", "13.5cm", "9cm", "1cm",
      "Segoe UI Black", 12, LIME, bold=True),
    t(4, "Your body already knows.\nWe help you tune in and\nrespond to what it tells you.",
      "1.5cm", "14.9cm", "9cm", "3cm", "Segoe UI", 11, MIST, opacity="0.80"),
    t(4, "ADAPT", "13cm", "13.5cm", "9cm", "1cm",
      "Segoe UI Black", 12, LIME, bold=True),
    t(4, "Every session, every day\nis different. Your practice\nflexes to match where you are.",
      "13cm", "14.9cm", "9cm", "3cm", "Segoe UI", 11, MIST, opacity="0.80"),
    t(4, "GROW", "24.5cm", "13.5cm", "9cm", "1cm",
      "Segoe UI Black", 12, LIME, bold=True),
    t(4, "Progress is personal. Track\nyour streaks, milestones,\nand how you feel — not reps.",
      "24.5cm", "14.9cm", "8cm", "3cm", "Segoe UI", 11, MIST, opacity="0.80"),
])

# S5 RESULTS — bloom top-right (COBALT), big starburst, data stats
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s5_dots = halftone(5, 17.5, 0, 9, 3, 1.5, 0.25, COBALT, "0.09")
s5_star = starburst(5, 21, 10, 10, 10, 0.30, COBALT, "0.40")
batch(DECK, s5_dots + s5_star + [
    s(5, name="!!bloom", preset="ellipse", fill=COBALT,
      x="19cm", y="0cm", width="15cm", height="11cm", opacity="0.88"),
    s(5, preset="ellipse", fill=LIME, opacity="0.55",
      x="21cm", y="1cm", width="10cm", height="7cm"),
    t(5, "RESULTS", "1.5cm", "1cm", "16cm", "0.9cm", "Segoe UI", 9, COBALT),
    s(5, preset="rect", fill=COBALT, x="1.5cm", y="2.2cm", width="3.5cm", height="0.12cm"),
    t(5, "Real change.\nReal people.", "1.5cm", "2.8cm", "16cm", "5cm",
      "Segoe UI Black", 44, DARK, bold=True),
    # 2 big stat cards
    s(5, preset="roundRect", fill=COBALT,
      x="1.5cm", y="9.5cm", width="12cm", height="5cm"),
    t(5, "87%", "1.5cm", "9.8cm", "12cm", "2.8cm",
      "Segoe UI Black", 52, LIME, bold=True, align="center"),
    t(5, "lower stress after 4 weeks", "1.5cm", "12.7cm", "12cm", "1.2cm",
      "Segoe UI", 11, MIST, align="center"),
    s(5, preset="roundRect", fill=LIME,
      x="14.5cm", y="9.5cm", width="12cm", height="5cm"),
    t(5, "3×", "14.5cm", "9.8cm", "12cm", "2.8cm",
      "Segoe UI Black", 52, DARK, bold=True, align="center"),
    t(5, "more consistent than solo", "14.5cm", "12.7cm", "12cm", "1.2cm",
      "Segoe UI", 11, DARK, align="center"),
    # testimonial quote
    s(5, preset="roundRect", fill=SAND,
      x="1.5cm", y="15.5cm", width="25cm", height="3cm"),
    t(5, '"I thought I was too busy for wellness. Vital Bloom proved me wrong — 15 mins changed everything."',
      "2.2cm", "16cm", "23.5cm", "2cm", "Segoe UI", 12, DARK),
])

# S6 COMMUNITY — bloom shifts bottom-right large (LIME), stats + social proof
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
s6_star = starburst(6, 3.5, 3.5, 8, 6, 0.24, COBALT, "0.60")
s6_dots = halftone(6, 22, 12, 8, 5, 1.1, 0.20, COBALT, "0.09")
batch(DECK, s6_star + s6_dots + [
    s(6, name="!!bloom", preset="ellipse", fill=LIME,
      x="15cm", y="7cm", width="19cm", height="14cm", opacity="0.78"),
    s(6, preset="ellipse", fill=COBALT, opacity="0.28",
      x="17cm", y="9cm", width="15cm", height="11cm"),
    t(6, "COMMUNITY", "1.5cm", "1cm", "14cm", "0.9cm", "Segoe UI", 9, COBALT),
    s(6, preset="rect", fill=COBALT, x="1.5cm", y="2.2cm", width="3.5cm", height="0.12cm"),
    t(6, "50,000+\nbloomers.", "1.5cm", "2.8cm", "13cm", "6cm",
      "Segoe UI Black", 48, DARK, bold=True),
    t(6, "A global community showing up\nfor themselves — every day.",
      "1.5cm", "9.5cm", "13cm", "2.5cm", "Segoe UI", 14, DIM),
    s(6, preset="rect", fill=COBALT, x="1.5cm", y="12.5cm", width="13cm", height="0.08cm"),
    t(6, "18 countries", "1.5cm", "13cm", "5cm", "1cm",
      "Segoe UI Black", 12, COBALT, bold=True),
    t(6, "4.9 App Store", "7cm", "13cm", "5cm", "1cm",
      "Segoe UI Black", 12, COBALT, bold=True),
    t(6, "95% retention", "13cm", "13cm", "5cm", "1cm",
      "Segoe UI Black", 12, COBALT, bold=True),
    t(6, "vitalbloom.app", "28cm", "17.8cm", "6cm", "1cm",
      "Segoe UI", 10, DIM, align="right"),
])

# S7 CTA — bloom fills entire slide (COBALT), starburst large, LIME text
print("\n[S7]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={COBALT}")
s7_dots = halftone(7, 0, 0, 30, 18, 1.1, 0.18, MIST, "0.05")
s7_star_bg = starburst(7, 8, 9.52, 12, 14, 0.33, LIME, "0.30")
s7_star_fg = starburst(7, 28, 15, 10, 9, 0.28, LIME, "0.50")
batch(DECK, s7_dots + s7_star_bg + s7_star_fg + [
    s(7, name="!!bloom", preset="ellipse", fill=COBALT,
      x="0cm", y="0cm", width="33.87cm", height="19.05cm", opacity="1.0"),
    t(7, "START TODAY", "1.5cm", "1cm", "24cm", "0.9cm", "Segoe UI", 9, LIME),
    s(7, preset="rect", fill=LIME, x="1.5cm", y="2.2cm", width="4cm", height="0.14cm"),
    t(7, "Your best self\nis one breath\naway.", "1.5cm", "2.8cm", "22cm", "11cm",
      "Segoe UI Black", 52, MIST, bold=True),
    s(7, preset="roundRect", fill=LIME,
      x="1.5cm", y="14.5cm", width="14cm", height="2.8cm"),
    t(7, "Download Free  →", "1.5cm", "14.5cm", "14cm", "2.8cm",
      "Segoe UI Black", 14, COBALT, bold=True, align="center", valign="c"),
    t(7, "iOS & Android  ·  vitalbloom.app",
      "1.5cm", "17.8cm", "20cm", "1cm", "Segoe UI", 10, MIST, opacity="0.55"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
