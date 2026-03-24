"""
morph-template v30 — Fluid Gradient + Rays
Ref: Image 2 (Windsurf) — smooth gradient BG, fan of rotated rays, halftone dots, orbital ellipses
Techniques: gradient bg, rotated thin rects (ray fan), dot-grid halftone, orbital ring decoration
Bold morph: !!orb (bright accent ellipse) travels + !!ray-anchor shifts fan origin
6 slides — re-use: AI/tech product / SaaS
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v30.pptx")
PURPLE = "2D0050"; PURPLE2 = "4A0090"
LIME   = "B4FF20"; CYAN  = "00C8B8"; PINK  = "D870FF"
CREAM  = "F0ECD8"; MIST  = "E0E8FF"; DIM   = "887799"
WHITE  = "FFFFFF"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def halftone(slide, x0, y0, cols, rows, gap, dot_size, color, opacity):
    """Grid of small ellipses — halftone dot pattern."""
    ops = []
    for r in range(rows):
        for c in range(cols):
            x = round(x0 + c * gap, 2)
            y = round(y0 + r * gap, 2)
            if x < 0 or y < 0 or x + dot_size > 34 or y + dot_size > 20:
                continue
            ops.append(s(slide, preset="ellipse", fill=color,
                        x=f"{x}cm", y=f"{y}cm",
                        width=f"{dot_size}cm", height=f"{dot_size}cm",
                        opacity=opacity))
    return ops


def ray_fan(slide, cx, cy, count, length, thick, color, base_angle, spread, max_op):
    """Fan of rotated thin rects — approximates diagonal light rays."""
    ops = []
    for i in range(count):
        angle = base_angle + spread * i / max(count - 1, 1)
        x = round(max(0.0, cx - length / 2), 2)
        y = round(max(0.0, cy - thick / 2), 2)
        op = round(max_op * (1 - i * 0.05), 3)
        ops.append(s(slide, preset="rect", fill=color,
                    x=f"{x}cm", y=f"{y}cm",
                    width=f"{length}cm", height=f"{thick}cm",
                    rotation=str(round(angle)), opacity=str(op)))
    return ops


# S1 HERO — PURPLE→LIME gradient, ray fan, orb upper-right, halftone bottom-left
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={PURPLE}-{CYAN}-135")
dots1 = halftone(1, 0.2, 13.5, 12, 5, 1.1, 0.28, LIME, "0.18")
rays1 = ray_fan(1, 4.0, 19.05, 10, 28, 0.25, LIME, 300, 50, 0.18)
batch(DECK, rays1 + dots1 + [
    s(1, name="!!orb", preset="ellipse", fill=LIME, opacity="0.22",
      x="20cm", y="0cm", width="16cm", height="16cm"),
    s(1, preset="ellipse", fill=CYAN, opacity="0.15",
      x="22cm", y="2cm", width="12cm", height="12cm"),
    # Orbital rings
    s(1, preset="ellipse", fill=LIME, opacity="0.14",
      x="23cm", y="5cm", width="10cm", height="6cm"),
    s(1, preset="ellipse", fill=PINK, opacity="0.12",
      x="25cm", y="3cm", width="6cm", height="10cm"),
    # Content
    t(1, "NOVA PLATFORM", "2cm", "1.5cm", "18cm", "0.9cm", "Segoe UI", 10, LIME),
    s(1, preset="rect", fill=LIME, x="2cm", y="2.8cm", width="3.5cm", height="0.12cm"),
    t(1, "Effortless flow.\nLimitless brilliance.", "2cm", "3.5cm", "20cm", "7cm",
      "Segoe UI Black", 48, WHITE, bold=True),
    t(1, "Nova is where developers and AI come together in perfect flow —\ncoding into an effortless, almost magical experience.",
      "2cm", "11.5cm", "18cm", "3.5cm", "Segoe UI", 14, MIST, opacity="0.85"),
    t(1, "Now in public beta  ·  novaplatform.ai",
      "2cm", "16cm", "18cm", "1cm", "Segoe UI", 11, MIST, opacity="0.60"),
    s(1, preset="roundRect", fill=LIME, x="2cm", y="17.2cm", width="9cm", height="1.6cm"),
    t(1, "Get Early Access  \u2192", "2cm", "17.2cm", "9cm", "1.6cm",
      "Segoe UI Black", 12, PURPLE, bold=True, align="center", valign="c"),
])

# S2 PRODUCT — cream BG, orb bottom-left, rays from right, dark type
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
rays2 = ray_fan(2, 30.0, 10.0, 8, 22, 0.20, PURPLE2, 200, 40, 0.12)
batch(DECK, rays2 + [
    s(2, name="!!orb", preset="ellipse", fill=PURPLE, opacity="0.18",
      x="0cm", y="8cm", width="14cm", height="14cm"),
    s(2, preset="ellipse", fill=CYAN, opacity="0.12",
      x="2cm", y="10cm", width="10cm", height="10cm"),
    t(2, "PRODUCT  ·  HOW IT WORKS", "2cm", "1.5cm", "20cm", "0.9cm", "Segoe UI", 10, PURPLE2),
    s(2, preset="rect", fill=PURPLE2, x="2cm", y="2.8cm", width="3.5cm", height="0.12cm"),
    t(2, "Crush creative\nblocks forever.", "2cm", "3.5cm", "22cm", "7cm",
      "Segoe UI Black", 44, PURPLE, bold=True),
    t(2, "Nova learns your patterns, suggests completions, and catches errors before you see them. It\u2019s not autocomplete — it\u2019s a co-pilot that knows your style.",
      "2cm", "11.5cm", "22cm", "4cm", "Segoe UI", 13, PURPLE, opacity="0.75"),
    # 3 feature pills
    s(2, preset="roundRect", fill=PURPLE, x="2cm",   y="16cm", width="7cm", height="1.8cm"),
    t(2, "AI Completions", "2cm",   "16cm", "7cm", "1.8cm", "Segoe UI Black", 11, WHITE, bold=True, align="center", valign="c"),
    s(2, preset="roundRect", fill=CYAN,   x="10cm",  y="16cm", width="7cm", height="1.8cm"),
    t(2, "Code Review",     "10cm",  "16cm", "7cm", "1.8cm", "Segoe UI Black", 11, PURPLE, bold=True, align="center", valign="c"),
    s(2, preset="roundRect", fill=LIME,   x="18cm",  y="16cm", width="7cm", height="1.8cm"),
    t(2, "Live Refactor",   "18cm",  "16cm", "7cm", "1.8cm", "Segoe UI Black", 11, PURPLE, bold=True, align="center", valign="c"),
])

# S3 FEATURES — CYAN→PURPLE gradient, orb center-right, 3 features
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CYAN}-{PURPLE}-160")
dots3 = halftone(3, 18.0, 0.2, 10, 4, 1.2, 0.25, WHITE, "0.14")
batch(DECK, dots3 + [
    s(3, name="!!orb", preset="ellipse", fill=LIME, opacity="0.20",
      x="18cm", y="4cm", width="16cm", height="16cm"),
    s(3, preset="ellipse", fill=WHITE, opacity="0.10",
      x="20cm", y="6cm", width="12cm", height="12cm"),
    t(3, "FEATURES  ·  WHAT\u2019S INSIDE", "2cm", "1.5cm", "18cm", "0.9cm", "Segoe UI", 10, LIME),
    s(3, preset="rect", fill=LIME, x="2cm", y="2.8cm", width="3.5cm", height="0.12cm"),
    t(3, "Everything\nyou need.", "2cm", "3.5cm", "16cm", "5cm",
      "Segoe UI Black", 44, WHITE, bold=True),
])
feat_ops3 = []
features3 = [
    (LIME,  "Supercomplete",     "Context-aware completions trained on 2B lines of production code."),
    (CYAN,  "Flow State Guard",  "Detects focus breaks before they happen and mutes all distractions."),
    (PINK,  "Pair Review",       "AI partner that reviews PRs in real-time and explains every suggestion."),
]
for i, (col, heading, body) in enumerate(features3):
    y = 9.5 + i * 2.8
    feat_ops3 += [
        s(3, preset="ellipse", fill=col, x="2cm", y=f"{y}cm", width="1.4cm", height="1.4cm"),
        t(3, heading, "4cm", f"{y}cm",    "14cm", "1.1cm", "Segoe UI Black", 14, WHITE, bold=True),
        t(3, body,    "4cm", f"{y+1.2}cm","14cm", "1.4cm", "Segoe UI", 11, WHITE, opacity="0.68"),
    ]
batch(DECK, feat_ops3)

# S4 STATS — cream BG again, orb top-left, 4 stat cards
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={CREAM}")
batch(DECK, [
    s(4, name="!!orb", preset="ellipse", fill=PURPLE, opacity="0.16",
      x="0cm", y="0cm", width="18cm", height="18cm"),
    s(4, preset="ellipse", fill=CYAN, opacity="0.12",
      x="1cm", y="1cm", width="12cm", height="12cm"),
    t(4, "TRACTION  ·  BY THE NUMBERS", "2cm", "1.5cm", "20cm", "0.9cm", "Segoe UI", 10, PURPLE2),
    s(4, preset="rect", fill=PURPLE2, x="2cm", y="2.8cm", width="3.5cm", height="0.12cm"),
    t(4, "Numbers that\nspeak for themselves.", "2cm", "3.5cm", "22cm", "5cm",
      "Segoe UI Black", 36, PURPLE, bold=True),
    # 4 stats right side
    s(4, preset="roundRect", fill=PURPLE,  x="18cm", y="2cm", width="14cm", height="7.5cm"),
    t(4, "2.4M",  "18.5cm", "2.8cm", "12cm", "3.5cm", "Segoe UI Black", 52, LIME, bold=True),
    t(4, "ACTIVE DEVELOPERS",  "18.5cm", "6.3cm", "12cm", "0.9cm", "Segoe UI Black", 10, WHITE, bold=True),
    t(4, "Growing 18% month-over-month since launch.", "18.5cm", "7.4cm", "12cm", "1.2cm", "Segoe UI", 11, WHITE, opacity="0.65"),
    s(4, preset="roundRect", fill=CYAN,    x="18cm", y="10.5cm", width="14cm", height="7.5cm"),
    t(4, "8ms",   "18.5cm", "11.3cm", "12cm", "3.5cm", "Segoe UI Black", 52, PURPLE, bold=True),
    t(4, "P99 SUGGESTION LATENCY",  "18.5cm", "14.8cm", "12cm", "0.9cm", "Segoe UI Black", 10, PURPLE, bold=True),
    t(4, "Faster than you can type — seriously.", "18.5cm", "15.9cm", "12cm", "1.2cm", "Segoe UI", 11, PURPLE, opacity="0.70"),
    # Body left
    t(4, "We\u2019re not just fast. We\u2019re accurate to 94.2% on standard\nbenchmarks — 31 points ahead of nearest competitor.",
      "2cm", "9.5cm", "15cm", "4cm", "Segoe UI", 13, PURPLE, opacity="0.75"),
    s(4, preset="rect", fill=PURPLE, opacity="0.15",
      x="2cm", y="9cm", width="15cm", height="0.05cm"),
])

# S5 VISION — PURPLE full bg, orb large center, orbital rings, statement
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={PURPLE}")
rays5 = ray_fan(5, 16.93, 19.05, 12, 26, 0.18, CYAN, 260, 60, 0.14)
batch(DECK, rays5 + [
    s(5, name="!!orb", preset="ellipse", fill=LIME, opacity="0.14",
      x="7cm", y="1cm", width="20cm", height="20cm"),
    s(5, preset="ellipse", fill=CYAN, opacity="0.10",
      x="9cm", y="3cm", width="16cm", height="16cm"),
    # Orbital decoration (perpendicular ellipses at low opacity)
    s(5, preset="ellipse", fill=LIME, opacity="0.20",
      x="10cm", y="6cm", width="14cm", height="7cm"),
    s(5, preset="ellipse", fill=PINK, opacity="0.18",
      x="13cm", y="3cm", width="7cm", height="14cm"),
    t(5, "VISION  ·  WHERE WE\u2019RE GOING", "2cm", "1.5cm", "22cm", "0.9cm", "Segoe UI", 10, LIME),
    s(5, preset="rect", fill=LIME, x="2cm", y="2.8cm", width="3.5cm", height="0.12cm"),
    t(5, "Do the best\nwork of your life.", "2cm", "3.8cm", "22cm", "8cm",
      "Segoe UI Black", 52, WHITE, bold=True),
    t(5, "Nova is building the future of programming —\nwhere AI removes friction so humans can focus on what matters.",
      "2cm", "12.5cm", "20cm", "3.5cm", "Segoe UI", 14, MIST, opacity="0.80"),
    t(5, "[LEARN MORE]", "2cm", "16.8cm", "10cm", "1cm", "Segoe UI", 11, LIME, opacity="0.70"),
])

# S6 CTA — LIME→CYAN gradient, orb disappears into bg, clean CTA
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={LIME}-{CYAN}-135")
dots6 = halftone(6, 0.5, 13.5, 26, 5, 1.1, 0.20, PURPLE, "0.12")
batch(DECK, dots6 + [
    s(6, name="!!orb", preset="ellipse", fill=PURPLE, opacity="0.12",
      x="10cm", y="2cm", width="14cm", height="14cm"),
    t(6, "GET STARTED  ·  FREE 30 DAYS", "2cm", "1.5cm", "22cm", "0.9cm", "Segoe UI", 10, PURPLE2),
    s(6, preset="rect", fill=PURPLE2, x="2cm", y="2.8cm", width="3.5cm", height="0.12cm"),
    t(6, "Start building\nin flow.", "2cm", "3.5cm", "22cm", "7cm",
      "Segoe UI Black", 52, PURPLE, bold=True),
    t(6, "No credit card. No config. Just open Nova and start coding.",
      "2cm", "11.5cm", "22cm", "2.5cm", "Segoe UI", 15, PURPLE, opacity="0.75"),
    s(6, preset="roundRect", fill=PURPLE,
      x="2cm", y="14.5cm", width="13cm", height="2.8cm"),
    t(6, "Try Nova Free  \u2192",
      "2cm", "14.5cm", "13cm", "2.8cm",
      "Segoe UI Black", 14, LIME, bold=True, align="center", valign="c"),
    t(6, "novaplatform.ai", "26cm", "17.8cm", "8cm", "0.9cm",
      "Segoe UI", 10, PURPLE, align="right", opacity="0.60"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
