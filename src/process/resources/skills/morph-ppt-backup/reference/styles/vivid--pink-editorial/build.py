"""
morph-template v15 — Pink Editorial / Gradient Stats
Ref: 99.2% / 73% pink-purple gradient slides from image_aionui_1774076892938.png
Style: Dark purple → dusty rose gradient BG, massive editorial bold numbers as
       morph actors, layered ellipses simulate noise/grain, contemporary editorial
6 slides with morph transitions
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v15.pptx")

DPURP = "160B33"
ROSE  = "7B2D52"
PINK  = "C85080"
BLUSH = "E8A0BC"
WHITE = "FFFFFF"
DIM   = "C090A8"
CREAM = "F5E8F0"
ACID  = "FF8DB8"

BG = f"{DPURP}-{ROSE}-135"

if os.path.exists(DECK):
    os.remove(DECK)
print("[Create]")
ocmd("create", DECK)


def grain(slide):
    """Simulated grain/noise: small scattered ellipses at low opacity."""
    dots = [
        (5.0, 3.0, 0.9), (12.5, 6.2, 0.5), (20.0, 2.0, 0.7), (28.0, 8.5, 0.6),
        (8.0, 15.0, 0.4), (25.5, 14.0, 0.8), (15.0, 11.5, 0.5), (3.0, 10.0, 0.6),
        (30.0, 3.5, 0.5), (1.0, 6.0, 0.7), (22.0, 17.0, 0.4),
    ]
    return [s(slide, preset="ellipse", fill=WHITE, opacity="0.04",
              x=f"{x}cm", y=f"{y}cm", width=f"{r}cm", height=f"{r}cm")
            for x, y, r in dots]


# ═══════════════════════════════════════════════════════════════
# S1 — HERO  (massive "73%", full-width gradient sweep)
# ═══════════════════════════════════════════════════════════════
print("\n[S1 Hero]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(1) + [
    s(1, name="!!num-sweep", preset="rect", fill=PINK,
      gradient=f"{PINK}-{DPURP}-90", opacity="0.35",
      x="0cm", y="3cm", width="33.87cm", height="12cm"),
    s(1, name="!!accent-dot", preset="ellipse", fill=ACID,
      gradient=f"{ACID}-{PINK}-135",
      x="28cm", y="13.5cm", width="5.5cm", height="5.5cm"),
    t(1, "73%", "1cm", "0cm", "32cm", "14cm", "Segoe UI Black", 200, WHITE, bold=True),
    t(1, "of businesses report better\noutcomes with AI.",
      "2cm", "14.5cm", "22cm", "3cm", "Segoe UI Black", 22, CREAM, bold=True),
    t(1, "FUTUREFORM — Annual Intelligence Report 2024",
      "2cm", "17.5cm", "24cm", "1cm", "Segoe UI", 11, DIM),
])

# ═══════════════════════════════════════════════════════════════
# S2 — STAT 2  ("99.2%", accent dot moves to top-left)
# ═══════════════════════════════════════════════════════════════
print("\n[S2 Stat2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(2) + [
    s(2, name="!!num-sweep", preset="rect", fill=PINK,
      gradient=f"{DPURP}-{PINK}-90", opacity="0.35",
      x="0cm", y="5cm", width="33.87cm", height="10cm"),
    s(2, name="!!accent-dot", preset="ellipse", fill=ACID,
      gradient=f"{ACID}-{ROSE}-135",
      x="1cm", y="1cm", width="4cm", height="4cm"),
    t(2, "99.2%", "1cm", "2cm", "32cm", "12cm", "Segoe UI Black", 160, WHITE, bold=True),
    t(2, "customer retention rate\nacross enterprise clients.",
      "2cm", "15cm", "22cm", "3cm", "Segoe UI Black", 22, CREAM, bold=True),
    t(2, "FUTUREFORM — Annual Intelligence Report 2024",
      "2cm", "17.5cm", "24cm", "1cm", "Segoe UI", 11, DIM),
])

# ═══════════════════════════════════════════════════════════════
# S3 — EDITORIAL SPLIT  (left panel + right text)
# ═══════════════════════════════════════════════════════════════
print("\n[S3 Split]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(3) + [
    s(3, preset="rect", fill=PINK, gradient=f"{DPURP}-{PINK}-135",
      x="0cm", y="0cm", width="16cm", height="19.05cm"),
    s(3, name="!!num-sweep", preset="ellipse", fill=WHITE, opacity="0.06",
      x="2cm", y="3cm", width="12cm", height="12cm"),
    s(3, name="!!accent-dot", preset="ellipse", fill=ACID,
      x="3.5cm", y="13.5cm", width="3cm", height="3cm"),
    t(3, "The\nFutureForm\nReport",
      "1cm", "3cm", "14cm", "9cm", "Segoe UI Black", 36, WHITE, bold=True),
    t(3, "Annual\n2024", "2cm", "13cm", "12cm", "2.5cm", "Segoe UI", 16, DIM),
    t(3, "Executive\nSummary",
      "18cm", "3cm", "14cm", "4cm", "Segoe UI Black", 32, WHITE, bold=True),
    t(3, "AI adoption has crossed a critical threshold. Organizations that fail to integrate intelligent systems by 2025 risk significant competitive disadvantage in market positioning and customer retention.",
      "18cm", "8cm", "14cm", "8cm", "Segoe UI", 14, CREAM),
    t(3, "FUTUREFORM", "18cm", "17.5cm", "12cm", "1cm", "Segoe UI", 11, DIM),
])

# ═══════════════════════════════════════════════════════════════
# S4 — METRICS GRID  (4 stat blocks, accent dot in 4th)
# ═══════════════════════════════════════════════════════════════
print("\n[S4 Grid]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(4) + [
    t(4, "2024 by the numbers",
      "2cm", "1.5cm", "22cm", "2.5cm", "Segoe UI Black", 28, WHITE, bold=True),
    s(4, preset="rect", fill=PINK, gradient=f"{ROSE}-{PINK}-135",
      x="2cm", y="5cm", width="14cm", height="6cm"),
    t(4, "40+", "2.5cm", "5.5cm", "12cm", "3.5cm", "Segoe UI Black", 60, WHITE, bold=True),
    t(4, "Countries Reached", "2.5cm", "9cm", "12cm", "1.5cm", "Segoe UI", 13, CREAM),
    s(4, preset="rect", fill=PINK, gradient=f"{PINK}-{DPURP}-135",
      x="17cm", y="5cm", width="14cm", height="6cm"),
    t(4, "1200+", "17.5cm", "5.5cm", "12cm", "3.5cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(4, "Enterprise Clients", "17.5cm", "9cm", "12cm", "1.5cm", "Segoe UI", 13, CREAM),
    s(4, preset="rect", fill=PINK, gradient=f"{DPURP}-{ROSE}-90",
      x="2cm", y="12cm", width="14cm", height="6cm"),
    t(4, "$2.4B", "2.5cm", "12.5cm", "12cm", "3.5cm", "Segoe UI Black", 56, WHITE, bold=True),
    t(4, "Revenue Influenced", "2.5cm", "16cm", "12cm", "1.5cm", "Segoe UI", 13, CREAM),
    s(4, preset="rect", fill=PINK, gradient=f"{ROSE}-{DPURP}-45",
      x="17cm", y="12cm", width="14cm", height="6cm"),
    s(4, name="!!num-sweep", preset="ellipse", fill=ACID, opacity="0.28",
      x="19cm", y="11cm", width="10cm", height="10cm"),
    s(4, name="!!accent-dot", preset="ellipse", fill=ACID,
      x="22cm", y="13cm", width="5.5cm", height="5.5cm"),
    t(4, "6×", "22cm", "12.8cm", "7cm", "4cm", "Segoe UI Black", 64, DPURP, bold=True),
    t(4, "Faster Decisions", "17.5cm", "16.5cm", "12cm", "1.5cm", "Segoe UI", 13, WHITE),
])

# ═══════════════════════════════════════════════════════════════
# S5 — QUOTE  (large quotation mark, editorial single text)
# ═══════════════════════════════════════════════════════════════
print("\n[S5 Quote]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(5) + [
    s(5, name="!!num-sweep", preset="ellipse", fill=PINK,
      gradient=f"{PINK}-{DPURP}-135", opacity="0.40",
      x="8cm", y="0cm", width="22cm", height="22cm"),
    s(5, name="!!accent-dot", preset="ellipse", fill=ACID,
      x="2cm", y="13cm", width="4cm", height="4cm"),
    t(5, "\u201c",
      "2cm", "1cm", "10cm", "6cm", "Segoe UI Black", 120, ACID, bold=True),
    t(5, "AI is not the future.\nIt is the operating\nsystem of the present.",
      "4cm", "6.5cm", "26cm", "8cm", "Segoe UI Black", 36, WHITE, bold=True),
    t(5, "— Clara Voss, CTO at Meridian Systems",
      "4cm", "15cm", "24cm", "1.5cm", "Segoe UI", 14, BLUSH),
    t(5, "FUTUREFORM — Annual Intelligence Report 2024",
      "2cm", "17.5cm", "24cm", "1cm", "Segoe UI", 11, DIM),
])

# ═══════════════════════════════════════════════════════════════
# S6 — CTA  (full gradient cover, acid CTA button)
# ═══════════════════════════════════════════════════════════════
print("\n[S6 CTA]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(6) + [
    s(6, preset="rect", fill=PINK, gradient=f"{DPURP}-{ROSE}-90",
      x="0cm", y="0cm", width="33.87cm", height="19.05cm", opacity="0.50"),
    s(6, name="!!num-sweep", preset="ellipse", fill=ACID, opacity="0.18",
      x="14cm", y="0cm", width="20cm", height="20cm"),
    s(6, name="!!accent-dot", preset="ellipse", fill=ACID,
      x="1cm", y="1cm", width="3.5cm", height="3.5cm"),
    t(6, "Shape the\nintelligent future.",
      "2cm", "3cm", "28cm", "8cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(6, "Download the full FutureForm 2024 Intelligence Report.",
      "2cm", "12cm", "20cm", "3cm", "Segoe UI", 18, BLUSH),
    s(6, preset="roundRect", fill=ACID,
      x="2cm", y="15.5cm", width="11cm", height="2.5cm"),
    t(6, "Get the Report \u2192",
      "2cm", "15.5cm", "11cm", "2.5cm",
      "Segoe UI Black", 14, DPURP, bold=True, align="center", valign="c"),
    t(6, "futureform.ai", "26cm", "17.5cm", "6cm", "1cm", "Segoe UI", 11, DIM, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])

validate_and_outline(DECK)
print("\nDone →", DECK)
