"""
morph-template v26 — Swiss System
Palette: pure WHITE bg, INK black + FIRE red only — zero darkness until CTA
Bold morph: !!rule (full-width INK rect) sweeps slide vertically —
  mid-rule → top thick → bottom thick → thin center → wide top-third band → full INK inversion (CTA)
6 slides — structural re-use: corporate / finance / consulting
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v26.pptx")
WHITE = "FFFFFF"
INK   = "111111"
RED   = "E30613"
LGRAY = "CCCCCC"
MGRAY = "777777"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)

# S1 HERO — thick rule at mid, title above, sub below
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={WHITE}")
batch(DECK, [
    # !!rule: thick horizontal bar at vertical midpoint
    s(1, name="!!rule", preset="rect", fill=INK,
      x="0cm", y="8.9cm", width="33.87cm", height="0.8cm"),
    t(1, "MERIDIAN", "2cm", "1.5cm", "30cm", "7.5cm", "Segoe UI Black", 80, INK, bold=True),
    # Red accent number
    t(1, "01", "2cm", "1.2cm", "6cm", "1.5cm", "Segoe UI", 11, RED),
    t(1, "CONSULTING\nPARTNERS", "2cm", "10.3cm", "20cm", "5cm", "Segoe UI Black", 32, WHITE),
    t(1, "Strategy  /  Finance  /  Operations", "2cm", "16.2cm", "20cm", "1.2cm", "Segoe UI", 12, LGRAY),
    t(1, "Est. 1998  \u00b7  New York  \u00b7  London  \u00b7  Singapore",
      "20cm", "17.5cm", "14cm", "1cm", "Segoe UI", 10, LGRAY, align="right"),
])

# S2 PROBLEM — rule moves to top
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={WHITE}")
batch(DECK, [
    s(2, name="!!rule", preset="rect", fill=INK,
      x="0cm", y="0cm", width="33.87cm", height="1.2cm"),
    t(2, "02  THE CHALLENGE", "2cm", "0.1cm", "22cm", "1cm", "Segoe UI", 10, WHITE),
    t(2, "Most organisations\nknow what they want.\nFew know how to\nget there.",
      "2cm", "2.5cm", "22cm", "13cm", "Segoe UI Black", 44, INK, bold=True),
    s(2, preset="rect", fill=RED, x="2cm", y="2.2cm", width="3cm", height="0.12cm"),
    t(2, "The gap between intent and execution costs companies\nan average of 20% of annual revenue.",
      "2cm", "15.5cm", "22cm", "2.5cm", "Segoe UI", 14, MGRAY),
    # Right column stat
    t(2, "20%", "26cm", "5cm", "7cm", "7cm", "Segoe UI Black", 72, RED, bold=True),
    t(2, "revenue\nlost to\nexecution\ngaps",
      "26cm", "12cm", "7cm", "6cm", "Segoe UI", 13, MGRAY),
])

# S3 SOLUTION — rule drops to bottom
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={WHITE}")
batch(DECK, [
    s(3, name="!!rule", preset="rect", fill=INK,
      x="0cm", y="17.85cm", width="33.87cm", height="1.2cm"),
    t(3, "03  THE SOLUTION", "2cm", "17.95cm", "22cm", "1cm", "Segoe UI", 10, WHITE),
    t(3, "We close\nthe gap.", "2cm", "1.5cm", "22cm", "8cm", "Segoe UI Black", 64, INK, bold=True),
    s(3, preset="rect", fill=RED, x="2cm", y="1.2cm", width="3cm", height="0.12cm"),
    t(3, "03", "2cm", "0.5cm", "6cm", "1cm", "Segoe UI", 10, RED),
    # 3-column approach
    s(3, preset="rect", fill=LGRAY, x="2cm", y="10.5cm", width="9.5cm", height="5.5cm"),
    t(3, "DIAGNOSE", "2.5cm", "11cm", "8cm", "1.2cm", "Segoe UI Black", 14, INK, bold=True),
    t(3, "Identify root\ncauses, not\nsymptoms.", "2.5cm", "12.5cm", "8.5cm", "3cm", "Segoe UI", 11, MGRAY),
    s(3, preset="rect", fill=LGRAY, x="12.2cm", y="10.5cm", width="9.5cm", height="5.5cm"),
    t(3, "DESIGN", "12.7cm", "11cm", "8cm", "1.2cm", "Segoe UI Black", 14, INK, bold=True),
    t(3, "Architect the\nright path\nforward.", "12.7cm", "12.5cm", "8.5cm", "3cm", "Segoe UI", 11, MGRAY),
    s(3, preset="rect", fill=RED, x="22.4cm", y="10.5cm", width="9.5cm", height="5.5cm"),
    t(3, "DELIVER", "22.9cm", "11cm", "8cm", "1.2cm", "Segoe UI Black", 14, WHITE, bold=True),
    t(3, "Execute with\naccountability\nand speed.", "22.9cm", "12.5cm", "8.5cm", "3cm", "Segoe UI", 11, WHITE, opacity="0.75"),
])

# S4 DATA — rule collapses to thin center line
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={WHITE}")
batch(DECK, [
    s(4, name="!!rule", preset="rect", fill=INK,
      x="0cm", y="9.02cm", width="33.87cm", height="0.06cm"),
    t(4, "04  TRACK RECORD", "2cm", "1.5cm", "16cm", "1cm", "Segoe UI", 10, RED),
    s(4, preset="rect", fill=RED, x="2cm", y="2.8cm", width="3cm", height="0.12cm"),
    t(4, "The Numbers", "2cm", "3.2cm", "22cm", "2.5cm", "Segoe UI Black", 40, INK, bold=True),
    # Above the rule line
    t(4, "214",   "2cm",  "5.5cm", "9cm", "3.5cm", "Segoe UI Black", 64, INK,  bold=True),
    t(4, "engagements\ncompleted", "2cm", "9cm", "9cm", "1.5cm", "Segoe UI", 10, MGRAY),
    t(4, "$4.2B",  "12cm", "5.5cm", "9cm", "3.5cm", "Segoe UI Black", 64, RED,  bold=True),
    t(4, "client value\ncreated", "12cm", "9cm", "9cm", "1.5cm", "Segoe UI", 10, MGRAY),
    t(4, "93%",   "22cm", "5.5cm", "9cm", "3.5cm", "Segoe UI Black", 64, INK,  bold=True),
    t(4, "client\nretention rate", "22cm", "9cm", "9cm", "1.5cm", "Segoe UI", 10, MGRAY),
    # Below the rule line
    t(4, "26 years of navigating complex transformations across every major industry.",
      "2cm", "10cm", "30cm", "3cm", "Segoe UI", 16, MGRAY),
])

# S5 TEAM — rule expands to wide top-third band
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={WHITE}")
batch(DECK, [
    s(5, name="!!rule", preset="rect", fill=INK,
      x="0cm", y="0cm", width="33.87cm", height="6.5cm"),
    t(5, "05  THE TEAM", "2cm", "0.3cm", "20cm", "1cm", "Segoe UI", 10, WHITE),
    t(5, "34 partners.\nOne standard.", "2cm", "1.2cm", "28cm", "5cm", "Segoe UI Black", 44, WHITE, bold=True),
    s(5, preset="rect", fill=RED, x="2cm", y="1cm", width="3cm", height="0.12cm"),
    # Team grid — 3 partners
    t(5, "SARAH\nMORRISON", "2cm",  "8cm", "9cm", "3cm", "Segoe UI Black", 20, INK, bold=True),
    t(5, "Managing Partner\nStrategy & Operations", "2cm", "11.3cm", "9cm", "2cm", "Segoe UI", 10, MGRAY),
    t(5, "DAVID\nCHEN", "12.5cm", "8cm", "9cm", "3cm", "Segoe UI Black", 20, INK, bold=True),
    t(5, "Partner\nFinance & M&A", "12.5cm", "11.3cm", "9cm", "2cm", "Segoe UI", 10, MGRAY),
    t(5, "ANA\nRODRIGUEZ", "23cm", "8cm", "9cm", "3cm", "Segoe UI Black", 20, RED, bold=True),
    t(5, "Partner\nDigital Transformation", "23cm", "11.3cm", "9cm", "2cm", "Segoe UI", 10, MGRAY),
    s(5, preset="rect", fill=LGRAY, x="2cm", y="14cm", width="29.87cm", height="0.05cm"),
    t(5, "Oxford  /  Harvard  /  INSEAD  /  LBS  /  Wharton",
      "2cm", "14.5cm", "28cm", "1cm", "Segoe UI", 10, MGRAY),
])

# S6 CTA — rule expands to FULL SLIDE → complete inversion, white on black
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={WHITE}")
batch(DECK, [
    s(6, name="!!rule", preset="rect", fill=INK,
      x="0cm", y="0cm", width="33.87cm", height="19.05cm"),
    t(6, "06", "2cm", "1.5cm", "6cm", "1.2cm", "Segoe UI", 10, RED),
    t(6, "Ready to\nclose the gap?", "2cm", "3cm", "28cm", "9cm", "Segoe UI Black", 56, WHITE, bold=True),
    s(6, preset="rect", fill=RED, x="2cm", y="2.7cm", width="3cm", height="0.12cm"),
    s(6, preset="rect", fill=WHITE, x="2cm", y="13.8cm", width="12cm", height="3cm"),
    t(6, "Schedule a Briefing  \u2192",
      "2cm", "13.8cm", "12cm", "3cm", "Segoe UI Black", 14, INK, bold=True, align="center", valign="c"),
    t(6, "meridian-consulting.com", "22cm", "17.5cm", "12cm", "1cm", "Segoe UI", 10, LGRAY, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
