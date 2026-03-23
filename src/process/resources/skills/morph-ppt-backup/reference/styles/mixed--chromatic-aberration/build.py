"""
morph-template v27 — Chromatic Aberration
Palette: ultra-dark navy + CYAN + HOT PINK — simulates CRT/RGB lens split
Bold morph: !!cyan-layer and !!pink-layer are ghost copies of the title text,
  offset horizontally (and vertically on S5). As slides advance, aberration
  SPREADS → EXPANDS → COLLAPSES → shifts axis → reconverges on CTA.
6 slides — structural re-use: tech/AI/creative-tech startup
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v27.pptx")
DARK  = "050814"
DARK2 = "0A1030"
CYAN  = "00F5E4"
PINK  = "FF0066"
WHITE = "FFFFFF"
DIM   = "334466"
PALE  = "8899CC"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)

# S1 HERO — tight aberration (offset ±0.3cm)
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK}")
batch(DECK, [
    # Pink layer — offset LEFT 0.3cm (behind)
    t(1, "NOVA\nSYSTEMS.", "1.7cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, PINK, bold=True, opacity="0.45", name="!!pink-layer"),
    # Cyan layer — offset RIGHT 0.3cm (behind)
    t(1, "NOVA\nSYSTEMS.", "2.3cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, CYAN, bold=True, opacity="0.40", name="!!cyan-layer"),
    # White solid text on top
    t(1, "NOVA\nSYSTEMS.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, WHITE, bold=True),
    # Subtitle
    t(1, "NEXT-GEN AI INFRASTRUCTURE", "2cm", "1.8cm", "22cm", "1.1cm", "Segoe UI", 10, PALE),
    s(1, preset="rect", fill=CYAN, x="2cm", y="2.8cm", width="3cm", height="0.10cm"),
    t(1, "Fast  \u00b7  Reliable  \u00b7  Yours", "2cm", "15.5cm", "18cm", "1.2cm", "Segoe UI", 13, PALE),
    t(1, "novasystems.ai", "28cm", "17.8cm", "6cm", "1cm", "Segoe UI", 10, PALE, align="right"),
])

# S2 PRODUCT — aberration spreads wider (±1.5cm)
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK}")
batch(DECK, [
    t(2, "THE\nPLATFORM.", "0.5cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, PINK, bold=True, opacity="0.35", name="!!pink-layer"),
    t(2, "THE\nPLATFORM.", "3.5cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, CYAN, bold=True, opacity="0.35", name="!!cyan-layer"),
    t(2, "THE\nPLATFORM.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, WHITE, bold=True),
    t(2, "PRODUCT", "2cm", "1.8cm", "14cm", "1cm", "Segoe UI", 10, PALE),
    s(2, preset="rect", fill=PINK, x="2cm", y="2.8cm", width="3cm", height="0.10cm"),
    # Feature bullets below title
    s(2, preset="rect", fill=DIM, x="2cm", y="15.5cm", width="29.87cm", height="0.05cm"),
    t(2, "Inference",  "2cm",  "16cm", "8cm", "1.2cm", "Segoe UI Black", 13, CYAN,  bold=True),
    t(2, "Fine-tuning","11cm", "16cm", "8cm", "1.2cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(2, "Vector DB",  "20cm", "16cm", "8cm", "1.2cm", "Segoe UI Black", 13, PINK,  bold=True),
    t(2, "Observability","28cm","16cm","6cm","1.2cm",  "Segoe UI Black", 13, WHITE, bold=True),
])

# S3 TECHNOLOGY — aberration at maximum spread (±4cm) — ghostly CRT effect
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK}")
batch(DECK, [
    t(3, "THE\nSCIENCE.", "0cm",  "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, PINK, bold=True, opacity="0.22", name="!!pink-layer"),
    t(3, "THE\nSCIENCE.", "6cm",  "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, CYAN, bold=True, opacity="0.20", name="!!cyan-layer"),
    t(3, "THE\nSCIENCE.", "2cm",  "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, WHITE, bold=True, opacity="0.90"),
    t(3, "TECHNOLOGY", "2cm", "1.8cm", "14cm", "1cm", "Segoe UI", 10, PALE),
    s(3, preset="rect", fill=CYAN, x="2cm", y="2.8cm", width="3cm", height="0.10cm"),
    t(3, "Transformer architecture optimised for edge deployment.\nSub-10ms P99 on commodity hardware.",
      "2cm", "15cm", "26cm", "3.5cm", "Segoe UI", 14, PALE),
])

# S4 METRICS — aberration COLLAPSES (all layers converge to same position)
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK}")
batch(DECK, [
    # All 3 layers at same x — aberration collapsed to zero
    t(4, "THE\nNUMBERS.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, PINK, bold=True, opacity="0.35", name="!!pink-layer"),
    t(4, "THE\nNUMBERS.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, CYAN, bold=True, opacity="0.35", name="!!cyan-layer"),
    t(4, "THE\nNUMBERS.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, WHITE, bold=True),
    t(4, "METRICS", "2cm", "1.8cm", "14cm", "1cm", "Segoe UI", 10, PALE),
    s(4, preset="rect", fill=PINK, x="2cm", y="2.8cm", width="3cm", height="0.10cm"),
    # Stats row
    s(4, preset="rect", fill=DIM, x="2cm", y="15.5cm", width="29.87cm", height="0.05cm"),
    t(4, "8ms",   "2cm",  "16cm", "8cm", "1.2cm", "Segoe UI Black", 18, CYAN,  bold=True),
    t(4, "P99 latency",  "2cm",  "17.3cm","8cm","0.9cm","Segoe UI", 10, PALE),
    t(4, "99.99%","11cm", "16cm", "8cm", "1.2cm", "Segoe UI Black", 18, WHITE, bold=True),
    t(4, "Uptime SLA",   "11cm", "17.3cm","8cm","0.9cm","Segoe UI", 10, PALE),
    t(4, "500+",  "20cm", "16cm", "8cm", "1.2cm", "Segoe UI Black", 18, PINK,  bold=True),
    t(4, "Models ready", "20cm", "17.3cm","8cm","0.9cm","Segoe UI", 10, PALE),
    t(4, "10\u00d7","28cm", "16cm", "6cm", "1.2cm", "Segoe UI Black", 18, CYAN,  bold=True),
    t(4, "Faster deploy", "28cm","17.3cm","6cm","0.9cm","Segoe UI", 10, PALE),
])

# S5 TEAM — aberration shifts axis: VERTICAL split (one layer up, one layer down)
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK}")
batch(DECK, [
    # Pink layer — offset UP
    t(5, "THE\nTEAM.", "2cm", "1.5cm", "30cm", "12cm",
      "Segoe UI Black", 68, PINK, bold=True, opacity="0.35", name="!!pink-layer"),
    # Cyan layer — offset DOWN
    t(5, "THE\nTEAM.", "2cm", "4.5cm", "30cm", "12cm",
      "Segoe UI Black", 68, CYAN, bold=True, opacity="0.35", name="!!cyan-layer"),
    t(5, "THE\nTEAM.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, WHITE, bold=True),
    t(5, "TEAM", "2cm", "0.5cm", "14cm", "1cm", "Segoe UI", 10, PALE),
    s(5, preset="rect", fill=CYAN, x="2cm", y="1.5cm", width="3cm", height="0.10cm"),
    t(5, "12 researchers. 8 engineers. 3 designers.\nAll obsessed with the same problem.",
      "2cm", "15cm", "28cm", "3.5cm", "Segoe UI", 14, PALE),
])

# S6 CTA — layers reconverge exactly, clean sharp text
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK2}-{DARK}-160")
batch(DECK, [
    # All reconverged — crisp, no aberration
    t(6, "BUILD THE\nFUTURE.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, PINK, bold=True, opacity="0.20", name="!!pink-layer"),
    t(6, "BUILD THE\nFUTURE.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, CYAN, bold=True, opacity="0.20", name="!!cyan-layer"),
    t(6, "BUILD THE\nFUTURE.", "2cm", "3cm", "30cm", "12cm",
      "Segoe UI Black", 68, WHITE, bold=True),
    s(6, preset="rect", fill=CYAN, x="2cm", y="2.8cm", width="3cm", height="0.10cm"),
    t(6, "START FOR FREE", "2cm", "0.5cm", "20cm", "1cm", "Segoe UI", 10, PALE),
    s(6, preset="roundRect", fill=CYAN,
      x="2cm", y="15.3cm", width="13cm", height="2.6cm"),
    t(6, "Get API Access  \u2192",
      "2cm", "15.3cm", "13cm", "2.6cm",
      "Segoe UI Black", 14, DARK, bold=True, align="center", valign="c"),
    t(6, "novasystems.ai", "28cm", "17.8cm", "6cm", "1cm", "Segoe UI", 10, PALE, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
