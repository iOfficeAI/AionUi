"""
morph-template v23 — Velvet Rose / Luxury Brand
Ref: Synthesized from Nexora ghost depth + Spir elegant minimal palette
Techniques: deep plum BG, ghost large letterforms, thin arc shapes as elegant
            decoration, GOLD textFill fade (title partially vanishes into dark bg),
            split warm/cool panels, breathable open layouts
6 slides — dramatic rhythm: dense → open → split → single element → grid → CTA
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v23.pptx")

PLUM   = "1A0820"
ROSE   = "380A28"
GOLD   = "E8C090"
BRIGHT = "F5D8A8"   # brighter gold for large text
BLUSH  = "C07890"
WHITE  = "FFFFFF"
DIM    = "906878"
GHOST  = "2E1030"   # barely visible ghost on PLUM
CREAM  = "F8EFE8"
INK    = "1A1020"
MID    = "250A1E"   # card bg on dark slides

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def arcs(slide, cx, cy, count=3, base_w=0.5, base_h=10.0, spread=2.5, color=None, name0=None):
    """
    Elegant thin vertical ellipses fanned slightly — simulate arc lines.
    base_w: arc width (thin), base_h: arc height
    spread: horizontal spacing between arcs
    """
    color = color or BLUSH
    ops = []
    for i in range(count):
        x = round(cx + (i - count // 2) * spread, 2)
        y = round(max(0.0, cy - base_h / 2), 2)
        w = round(base_w + i * 0.1, 2)
        kw = {"name": name0} if (i == 0 and name0) else {}
        ops.append(s(slide, preset="ellipse", fill=color,
                     x=f"{x}cm", y=f"{y}cm",
                     width=f"{w}cm", height=f"{base_h}cm",
                     opacity=str(round(0.25 - i * 0.06, 2)), **kw))
    return ops


# ═══ S1 HERO — plum bg, ghost "I", gold arcs, textFill fade title ═══
print("\n[S1 Hero]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PLUM}-{ROSE}-160")
batch(DECK, arcs(1, 28.0, 9.5, 4, 0.5, 18.0, 2.8, BLUSH, "!!arc") + [
    # Ghost large letter
    t(1, "I", "22cm", "1cm", "12cm", "16cm", "Segoe UI Black", 200, GHOST, bold=True),
    # Small label
    t(1, "MAISON IVOR\u00c9  ·  BRAND MANIFESTO", "2cm", "2.5cm", "22cm", "0.9cm", "Segoe UI", 10, DIM),
    # Thin gold rule
    s(1, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="3.8cm", width="3cm", height="0.10cm"),
    # Title: textFill from BRIGHT gold → PLUM (right side fades into dark BG)
    t(1, "Where Silence\nBecome Style.",
      "2cm", "4.5cm", "22cm", "9cm", "Segoe UI Black", 52, BRIGHT, bold=True,
      textFill=f"{BRIGHT}-{PLUM}-0"),
    t(1, "Luxury fragrance and lifestyle atelier.\nEstablished Paris, 1987.",
      "2cm", "14.5cm", "18cm", "3cm", "Segoe UI", 14, DIM),
    t(1, "maisonivore.com", "2cm", "17.7cm", "12cm", "0.9cm", "Segoe UI", 10, DIM),
])

# ═══ S2 BRAND VALUES — 3 large GOLD numbers, open and clean ═══
print("\n[S2 Values]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PLUM}-{ROSE}-160")
batch(DECK, arcs(2, 17.0, 9.5, 3, 0.5, 18.0, 3.0, BLUSH, "!!arc") + [
    s(2, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="3.8cm", width="3cm", height="0.10cm"),
    t(2, "OUR PILLARS", "2cm", "2.5cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    t(2, "Three beliefs that\nguide everything.",
      "2cm", "4.5cm", "20cm", "4.5cm", "Segoe UI Black", 28, WHITE, bold=True),
    s(2, preset="rect", fill=DIM, x="2cm", y="9.5cm", width="29cm", height="0.06cm"),
    # 3 values
    t(2, "I.", "2cm", "10cm", "8cm", "3cm", "Segoe UI Black", 48, BRIGHT, bold=True),
    t(2, "Restraint", "2cm", "13cm", "8cm", "2cm", "Segoe UI Black", 18, GOLD, bold=True),
    t(2, "True luxury removes,\nnot adds.", "2cm", "15.2cm", "9cm", "3cm", "Segoe UI", 12, DIM),

    t(2, "II.", "12cm", "10cm", "8cm", "3cm", "Segoe UI Black", 48, WHITE, bold=True),
    t(2, "Permanence", "12cm", "13cm", "8cm", "2cm", "Segoe UI Black", 18, BLUSH, bold=True),
    t(2, "We make things\nbuilt to outlast trends.", "12cm", "15.2cm", "9cm", "3cm", "Segoe UI", 12, DIM),

    t(2, "III.", "23cm", "10cm", "8cm", "3cm", "Segoe UI Black", 48, GOLD, bold=True),
    t(2, "Intimacy", "23cm", "13cm", "8cm", "2cm", "Segoe UI Black", 18, GOLD, bold=True),
    t(2, "One atelier.\nEvery client known.", "23cm", "15.2cm", "8cm", "3cm", "Segoe UI", 12, DIM),
])

# ═══ S3 PORTFOLIO SPLIT — left narrow rose strip, right cream light ═══
print("\n[S3 Portfolio]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={CREAM}")
batch(DECK, [
    # Dark plum left strip
    s(3, preset="rect", fill=PLUM, gradient=f"{ROSE}-{PLUM}-90",
      x="0cm", y="0cm", width="8cm", height="19.05cm"),
    s(3, name="!!arc", preset="ellipse", fill=BLUSH, opacity="0.20",
      x="0cm", y="7cm", width="8cm", height="8cm"),
    t(3, "SELECTED\nWORK", "0.8cm", "2cm", "6.5cm", "4cm", "Segoe UI Black", 22, GOLD, bold=True),
    t(3, "2020\u2014\n2024", "0.8cm", "14cm", "6.5cm", "3cm", "Segoe UI", 13, DIM),
    s(3, name="!!accent", preset="rect", fill=GOLD,
      x="0.8cm", y="1.7cm", width="2cm", height="0.10cm"),
    # Right cream content
    t(3, "PORTFOLIO", "9.5cm", "1.8cm", "22cm", "0.9cm", "Segoe UI", 10, DIM),
    s(3, preset="rect", fill=BLUSH, x="9.5cm", y="2.8cm", width="22cm", height="0.06cm"),
])
item_ops = []
items = [("No.01  La Mer Noire",     "Fragrance campaign  ·  Paris 2024"),
         ("No.02  House of Calme",   "Complete identity system  ·  Milan 2023"),
         ("No.03  Édition Privée",   "Limited edition packaging  ·  Geneva 2023"),
         ("No.04  Atelier Nuée",     "Brand architecture  ·  Tokyo 2022"),
         ("No.05  Sève Collective",  "Campaign + editorial  ·  New York 2021")]
for i, (title, sub) in enumerate(items):
    y = 3.5 + i * 2.8
    item_ops.append(s(3, preset="rect", fill=BLUSH,
                      x="9.5cm", y=f"{y+2.3}cm", width="22cm", height="0.06cm"))
    item_ops.append(t(3, title, "9.5cm", f"{y}cm", "15cm", "1.3cm",
                      "Segoe UI Black", 14, INK, bold=True))
    item_ops.append(t(3, sub, "9.5cm", f"{y+1.4}cm", "20cm", "0.9cm",
                      "Segoe UI", 11, DIM))
batch(DECK, item_ops)

# ═══ S4 MANIFESTO — single arc, open breathing room, large italic quote ═══
print("\n[S4 Manifesto]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PLUM}-{ROSE}-160")
batch(DECK, arcs(4, 30.0, 9.5, 5, 0.4, 16.0, 2.2, BLUSH, "!!arc") + [
    s(4, preset="rect", fill=DIM, x="2cm", y="8.5cm", width="26cm", height="0.06cm"),
    s(4, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="3.8cm", width="2cm", height="0.10cm"),
    t(4, "MANIFESTO", "2cm", "2.5cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    t(4, "\u201cA scent is a letter written\nwithout words.\u201d",
      "2cm", "4.5cm", "26cm", "7cm", "Segoe UI", 32, WHITE),
    t(4, "On the philosophy of Maison Ivoré —",
      "2cm", "9cm", "20cm", "1.5cm", "Segoe UI", 14, DIM),
    t(4, "Every fragrance begins with one question:\nwhat does this moment deserve to smell like?",
      "2cm", "11cm", "24cm", "5cm", "Segoe UI", 18, GOLD),
    t(4, "maisonivore.com", "2cm", "17.7cm", "12cm", "0.9cm", "Segoe UI", 10, DIM),
])

# ═══ S5 PROCESS — 4 GOLD dots on line, step grid below ═══
print("\n[S5 Process]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PLUM}-{ROSE}-160")
steps = [
    ("Consultation",  "Private appointment\nto understand your needs."),
    ("Composition",   "Our nose crafts 3 bespoke\nformula proposals."),
    ("Refinement",    "Two rounds of adjustment\nuntil it is perfect."),
    ("Presentation",  "Your fragrance, engraved\nbottle, delivered worldwide."),
]
step_ops = []
for i, (title, body) in enumerate(steps):
    x = 2.0 + i * 7.8
    step_ops.append(s(5, preset="ellipse", fill=GOLD,
                      x=f"{x}cm", y="8.8cm", width="1.8cm", height="1.8cm"))
    step_ops.append(t(5, str(i+1).zfill(2), f"{x+0.4}cm", "8.9cm", "1.2cm", "1.6cm",
                      "Segoe UI Black", 11, PLUM, bold=True))
    step_ops.append(t(5, title, f"{x}cm", "11.5cm", "7cm", "1.5cm",
                      "Segoe UI Black", 13, GOLD, bold=True))
    step_ops.append(t(5, body, f"{x}cm", "13.2cm", "7cm", "3.5cm",
                      "Segoe UI", 11, DIM))
batch(DECK, arcs(5, 3.0, 9.5, 3, 0.4, 14.0, 2.0, BLUSH, "!!arc") + step_ops + [
    s(5, preset="rect", fill=GOLD, x="2cm", y="9.7cm", width="29cm", height="0.06cm"),
    s(5, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="3.8cm", width="2cm", height="0.10cm"),
    t(5, "PROCESS", "2cm", "2.5cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    t(5, "The Atelier Experience",
      "2cm", "4.5cm", "22cm", "3.5cm", "Segoe UI Black", 32, WHITE, bold=True,
      textFill=f"{WHITE}-{ROSE}-0"),
])

# ═══ S6 CTA — PLUM→ROSE full gradient, GOLD title, CREAM button ═══
print("\n[S6 CTA]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={ROSE}-{PLUM}-160")
batch(DECK, arcs(6, 30.0, 9.5, 5, 0.5, 19.0, 2.5, BLUSH, "!!arc") + [
    s(6, preset="ellipse", fill=GOLD, opacity="0.08",
      x="10cm", y="4cm", width="18cm", height="14cm"),
    s(6, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="3.8cm", width="2cm", height="0.10cm"),
    t(6, "BESPOKE FRAGRANCE  ·  MAISON IVOR\u00c9", "2cm", "2.5cm", "24cm", "0.9cm", "Segoe UI", 10, DIM),
    t(6, "Begin\nyour story.",
      "2cm", "4.5cm", "22cm", "9cm", "Segoe UI Black", 60, BRIGHT, bold=True,
      textFill=f"{BRIGHT}-{ROSE}-0"),
    t(6, "Private appointments by invitation.\nWe welcome new patrons each season.",
      "2cm", "14cm", "20cm", "3.5cm", "Segoe UI", 16, DIM),
    s(6, preset="roundRect", fill=CREAM,
      x="2cm", y="16cm", width="10cm", height="2.5cm"),
    t(6, "Request an Appointment",
      "2cm", "16cm", "10cm", "2.5cm",
      "Segoe UI Black", 12, INK, bold=True, align="center", valign="c"),
    t(6, "maisonivore.com", "26cm", "17.5cm", "6cm", "1cm", "Segoe UI", 10, DIM, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone \u2192", DECK)
