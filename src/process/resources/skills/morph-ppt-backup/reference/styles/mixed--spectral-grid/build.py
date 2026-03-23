"""
morph-template v34 — Synthesis: Spectral Grid
Combines: Bauhaus color-blocking + gradient ray-fan + mosaic tiles + bullseye ring + vibrant split
Palette: deep INDIGO base, AMBER accent, LIME highlight, CORAL contrast, OFFWHITE
Morph story: !!prism (diagonal gradient panel) rotates + reshapes each slide
  S1: large diagonal left-cut panel (INDIGO→AMBER)
  S2: narrow left strip (INDIGO)
  S3: top-right triangle-like tall thin right block
  S4: centered tall column (narrow pillar)
  S5: wide bottom band
  S6: diagonal full-right panel (CORAL)
  S7: full-slide takeover (LIME)
7 slides — structural re-use: innovation agency / product brand
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v34.pptx")

INDIGO  = "1E0A5C"
INDIGO2 = "2E1878"
AMBER   = "F0A000"
LIME    = "A0F040"
CORAL   = "F03820"
OFFWHT  = "F5F0E8"
PALE    = "C8C0DC"
DIM     = "3C2870"
GOLD    = "C88000"
DKGRAY  = "181020"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)

# ── helpers ──────────────────────────────────────────────────────────────────

def mosaic_tiles(slide, base_x, base_y, cols, rows, tile_w, tile_h, gap,
                 colors, opacities):
    """Grid of small colored rects (Geoprotech mosaic style)."""
    items = []
    for row in range(rows):
        for col in range(cols):
            c = colors[(row * cols + col) % len(colors)]
            op = opacities[(row * cols + col) % len(opacities)]
            items.append(s(slide, preset="rect",
                           fill=c, opacity=op,
                           x=f"{base_x + col*(tile_w+gap):.2f}cm",
                           y=f"{base_y + row*(tile_h+gap):.2f}cm",
                           width=f"{tile_w:.2f}cm",
                           height=f"{tile_h:.2f}cm"))
    return items

def ray_fan(slide, cx, cy, count, length, thick, color, base_angle, spread, max_op):
    """Fan of rotated thin rects radiating from a point (Windsurf style)."""
    items = []
    for i in range(count):
        angle = base_angle + (i / max(count - 1, 1)) * spread - spread / 2
        op = round(max_op * (1 - abs(i - (count-1)/2) / ((count-1)/2 + 1)), 2)
        items.append(s(slide, preset="rect",
                       fill=color, opacity=str(op),
                       x=f"{cx:.2f}cm", y=f"{cy:.2f}cm",
                       width=f"{thick:.2f}cm", height=f"{length:.2f}cm",
                       rotation=str(int(angle))))
    return items

def ring_chart(slide, cx, cy, rings):
    """Concentric rings from largest to smallest. rings: [(radius, color, opacity)]"""
    items = []
    for r, c, op in rings:
        items.append(s(slide, preset="ellipse",
                       fill=c, opacity=op,
                       x=f"{cx - r:.2f}cm", y=f"{cy - r:.2f}cm",
                       width=f"{r*2:.2f}cm", height=f"{r*2:.2f}cm"))
    return items

# ── S1 HERO — prism panel large left diagonal block ───────────────────────────
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={DKGRAY}-{INDIGO}-135")

s1_rays = ray_fan(1, 16.9, 9.5, 9, 22, 0.35, AMBER, 270, 60, 0.18)
s1_tiles = mosaic_tiles(1, 19, 0.5, 7, 5, 1.8, 1.8, 0.2,
                        [INDIGO2, DIM, INDIGO, DIM, INDIGO2],
                        ["0.55", "0.40", "0.30", "0.45", "0.20"])

batch(DECK, s1_rays + s1_tiles + [
    # !!prism — large left-side panel with gradient
    s(1, name="!!prism", preset="rect",
      fill=INDIGO2, gradient=f"{INDIGO2}-{INDIGO}-180",
      x="0cm", y="0cm", width="15cm", height="19.05cm", opacity="0.92"),
    # accent top stripe on panel
    s(1, preset="rect", fill=AMBER,
      x="0cm", y="0cm", width="15cm", height="0.45cm"),
    # label
    t(1, "INNOVATION AGENCY", "1.2cm", "1.2cm", "13cm", "0.9cm",
      "Segoe UI", 9, AMBER),
    # rule line
    s(1, preset="rect", fill=AMBER,
      x="1.2cm", y="2.3cm", width="4cm", height="0.10cm"),
    # hero title
    t(1, "WHERE\nIDEAS\nBECOME\nPRODUCT.", "1.2cm", "2.8cm", "13cm", "13cm",
      "Segoe UI Black", 44, OFFWHT, bold=True),
    # tagline
    t(1, "Strategy · Design · Engineering · Launch",
      "1.2cm", "16.2cm", "13cm", "1.2cm",
      "Segoe UI", 11, PALE),
    # ghost big letter
    t(1, "S", "15cm", "0cm", "18cm", "18cm",
      "Segoe UI Black", 220, INDIGO2, bold=True, opacity="0.12"),
    # right side — concentric ring decoration
    *ring_chart(1, 26, 9.5,
                [(4.5, CORAL, "0.08"), (3.2, AMBER, "0.12"),
                 (2.0, LIME, "0.18"), (1.0, AMBER, "0.30")]),
    t(1, "spectral.studio", "28cm", "17.8cm", "6cm", "1cm",
      "Segoe UI", 10, PALE, align="right"),
])

# ── S2 ABOUT — prism shrinks to narrow left strip ─────────────────────────────
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={OFFWHT}")

s2_tiles = mosaic_tiles(2, 18, 1, 8, 6, 1.7, 1.4, 0.25,
                        [INDIGO, DIM, INDIGO2, CORAL, DIM, INDIGO],
                        ["0.70", "0.55", "0.45", "0.35", "0.50", "0.25"])

batch(DECK, s2_tiles + [
    # !!prism — narrow left strip
    s(2, name="!!prism", preset="rect",
      fill=INDIGO2, gradient=f"{INDIGO2}-{INDIGO}-180",
      x="0cm", y="0cm", width="3cm", height="19.05cm", opacity="0.92"),
    s(2, preset="rect", fill=AMBER,
      x="0cm", y="0cm", width="3cm", height="0.45cm"),
    # label
    t(2, "ABOUT US", "4cm", "1cm", "12cm", "0.9cm", "Segoe UI", 9, INDIGO),
    s(2, preset="rect", fill=CORAL, x="4cm", y="2.1cm", width="3.5cm", height="0.10cm"),
    # large title
    t(2, "Built by\nmakers,\nfor makers.", "4cm", "2.5cm", "14cm", "9cm",
      "Segoe UI Black", 44, INDIGO, bold=True),
    # body paragraph
    t(2, "We are a cross-disciplinary studio of 40+ specialists\nwho have shipped over 120 products across consumer,\nenterprise, and deep-tech verticals.",
      "4cm", "12.5cm", "14cm", "3.5cm", "Segoe UI", 13, "4A4060"),
    # stat callout
    s(2, preset="roundRect", fill=INDIGO,
      x="4cm", y="16cm", width="5.5cm", height="2.5cm"),
    t(2, "120+\nProducts Shipped", "4cm", "16cm", "5.5cm", "2.5cm",
      "Segoe UI Black", 14, OFFWHT, bold=True, align="center", valign="c"),
    s(2, preset="roundRect", fill=CORAL,
      x="10.3cm", y="16cm", width="5.5cm", height="2.5cm"),
    t(2, "40+\nExperts", "10.3cm", "16cm", "5.5cm", "2.5cm",
      "Segoe UI Black", 14, OFFWHT, bold=True, align="center", valign="c"),
])

# ── S3 SERVICES — prism shifts to tall right block ────────────────────────────
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={OFFWHT}")

batch(DECK, [
    # !!prism — tall right panel
    s(3, name="!!prism", preset="rect",
      fill=CORAL, gradient=f"{CORAL}-{INDIGO}-160",
      x="22cm", y="0cm", width="11.87cm", height="19.05cm", opacity="0.95"),
    s(3, preset="rect", fill=AMBER, x="22cm", y="0cm", width="11.87cm", height="0.45cm"),
    # label
    t(3, "SERVICES", "1.5cm", "1cm", "18cm", "0.9cm", "Segoe UI", 9, INDIGO),
    s(3, preset="rect", fill=INDIGO, x="1.5cm", y="2.1cm", width="3.5cm", height="0.10cm"),
    # section title
    t(3, "What We\nDeliver.", "1.5cm", "2.6cm", "18cm", "5cm",
      "Segoe UI Black", 44, INDIGO, bold=True),
    # 4 service rows
    t(3, "01  Strategy & Research",
      "1.5cm", "9cm", "18cm", "1.2cm", "Segoe UI Black", 14, INDIGO, bold=True),
    t(3, "Market mapping, user discovery, go-to-market planning",
      "1.5cm", "10.4cm", "18cm", "0.9cm", "Segoe UI", 11, "4A4060"),
    s(3, preset="rect", fill="C8C0DC", x="1.5cm", y="11.4cm", width="18cm", height="0.05cm"),
    t(3, "02  Product Design",
      "1.5cm", "11.8cm", "18cm", "1.2cm", "Segoe UI Black", 14, INDIGO, bold=True),
    t(3, "UX/UI, design systems, prototyping, motion",
      "1.5cm", "13.2cm", "18cm", "0.9cm", "Segoe UI", 11, "4A4060"),
    s(3, preset="rect", fill="C8C0DC", x="1.5cm", y="14.2cm", width="18cm", height="0.05cm"),
    t(3, "03  Engineering & Launch",
      "1.5cm", "14.6cm", "18cm", "1.2cm", "Segoe UI Black", 14, INDIGO, bold=True),
    t(3, "Full-stack dev, infrastructure, CI/CD, AppStore submission",
      "1.5cm", "16.0cm", "18cm", "0.9cm", "Segoe UI", 11, "4A4060"),
    # right panel text
    t(3, "End-to-\nend.", "22.8cm", "5cm", "10cm", "6cm",
      "Segoe UI Black", 38, OFFWHT, bold=True),
    t(3, "One partner.\nZero handoff\nlosses.", "22.8cm", "11.5cm", "10cm", "4cm",
      "Segoe UI", 13, OFFWHT, opacity="0.75"),
])

# ── S4 METRICS — prism becomes tall center pillar ─────────────────────────────
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={DKGRAY}-{INDIGO}-150")

s4_rays = ray_fan(4, 16.93, 9.5, 11, 20, 0.30, LIME, 270, 80, 0.14)

batch(DECK, s4_rays + [
    # !!prism — center pillar
    s(4, name="!!prism", preset="rect",
      fill=INDIGO2, gradient=f"{INDIGO2}-{DIM}-180",
      x="14.5cm", y="0cm", width="5cm", height="19.05cm", opacity="0.88"),
    s(4, preset="rect", fill=LIME, x="14.5cm", y="0cm", width="5cm", height="0.45cm"),
    # label
    t(4, "METRICS", "1.5cm", "1cm", "12cm", "0.9cm", "Segoe UI", 9, LIME),
    s(4, preset="rect", fill=AMBER, x="1.5cm", y="2.1cm", width="4cm", height="0.10cm"),
    # title
    t(4, "Numbers\nThat Matter.", "1.5cm", "2.6cm", "12cm", "5cm",
      "Segoe UI Black", 44, OFFWHT, bold=True),
    # left stats
    t(4, "120", "1.5cm", "9cm", "12cm", "3cm",
      "Segoe UI Black", 52, LIME, bold=True),
    t(4, "Products shipped to market", "1.5cm", "12.2cm", "12cm", "1cm",
      "Segoe UI", 12, PALE),
    t(4, "40+", "1.5cm", "13.8cm", "12cm", "2.5cm",
      "Segoe UI Black", 52, AMBER, bold=True),
    t(4, "Countries reached", "1.5cm", "16.5cm", "12cm", "1cm",
      "Segoe UI", 12, PALE),
    # right stats
    t(4, "98%", "20.3cm", "9cm", "12cm", "3cm",
      "Segoe UI Black", 52, CORAL, bold=True),
    t(4, "Client retention rate", "20.3cm", "12.2cm", "12cm", "1cm",
      "Segoe UI", 12, PALE),
    t(4, "$2B+", "20.3cm", "13.8cm", "12cm", "2.5cm",
      "Segoe UI Black", 52, OFFWHT, bold=True),
    t(4, "Combined client valuation", "20.3cm", "16.5cm", "12cm", "1cm",
      "Segoe UI", 12, PALE),
])

# ── S5 PROCESS — prism becomes wide bottom band ───────────────────────────────
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={OFFWHT}")

s5_tiles = mosaic_tiles(5, 0, 14.5, 20, 3, 1.65, 1.45, 0.22,
                        [INDIGO, DIM, INDIGO2, CORAL, DIM],
                        ["0.65", "0.50", "0.40", "0.30", "0.55"])

batch(DECK, s5_tiles + [
    # !!prism — wide bottom band
    s(5, name="!!prism", preset="rect",
      fill=INDIGO, gradient=f"{INDIGO}-{CORAL}-0",
      x="0cm", y="13.55cm", width="33.87cm", height="5.5cm", opacity="0.92"),
    s(5, preset="rect", fill=AMBER, x="0cm", y="0cm", width="33.87cm", height="0.45cm"),
    # label
    t(5, "PROCESS", "1.5cm", "0.8cm", "14cm", "0.9cm", "Segoe UI", 9, INDIGO),
    s(5, preset="rect", fill=INDIGO, x="1.5cm", y="1.9cm", width="4cm", height="0.10cm"),
    # title
    t(5, "How We\nWork.", "1.5cm", "2.4cm", "20cm", "5cm",
      "Segoe UI Black", 50, INDIGO, bold=True),
    # 4 process steps (above band)
    t(5, "DISCOVER", "1.5cm", "9cm", "7cm", "1.2cm",
      "Segoe UI Black", 13, CORAL, bold=True),
    t(5, "Research · Interviews\nCompetitor audit",
      "1.5cm", "10.4cm", "7cm", "2.2cm", "Segoe UI", 11, "4A4060"),
    t(5, "DEFINE", "9.5cm", "9cm", "7cm", "1.2cm",
      "Segoe UI Black", 13, INDIGO, bold=True),
    t(5, "Strategy · Roadmap\nScope & OKRs",
      "9.5cm", "10.4cm", "7cm", "2.2cm", "Segoe UI", 11, "4A4060"),
    t(5, "DESIGN", "17.5cm", "9cm", "7cm", "1.2cm",
      "Segoe UI Black", 13, AMBER, bold=True),
    t(5, "Prototyping · System\nMotion & UX",
      "17.5cm", "10.4cm", "7cm", "2.2cm", "Segoe UI", 11, "4A4060"),
    t(5, "DEPLOY", "25.5cm", "9cm", "7cm", "1.2cm",
      "Segoe UI Black", 13, LIME, bold=True),
    t(5, "Build · QA · Launch\nOps · Iterate",
      "25.5cm", "10.4cm", "7cm", "2.2cm", "Segoe UI", 11, "4A4060"),
    # band labels
    t(5, "01", "2cm", "14.1cm", "6cm", "1cm",
      "Segoe UI Black", 11, OFFWHT, bold=True, opacity="0.60"),
    t(5, "02", "10cm", "14.1cm", "6cm", "1cm",
      "Segoe UI Black", 11, OFFWHT, bold=True, opacity="0.60"),
    t(5, "03", "18cm", "14.1cm", "6cm", "1cm",
      "Segoe UI Black", 11, OFFWHT, bold=True, opacity="0.60"),
    t(5, "04", "26cm", "14.1cm", "6cm", "1cm",
      "Segoe UI Black", 11, OFFWHT, bold=True, opacity="0.60"),
])

# ── S6 CASE STUDY — prism sweeps to full right half (CORAL) ───────────────────
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={OFFWHT}")

batch(DECK, [
    # !!prism — full right half panel (CORAL)
    s(6, name="!!prism", preset="rect",
      fill=CORAL, gradient=f"{CORAL}-{INDIGO2}-170",
      x="17cm", y="0cm", width="16.87cm", height="19.05cm", opacity="0.96"),
    s(6, preset="rect", fill=AMBER, x="17cm", y="0cm", width="16.87cm", height="0.45cm"),
    # left side
    t(6, "CASE STUDY", "1.5cm", "1cm", "14cm", "0.9cm", "Segoe UI", 9, INDIGO),
    s(6, preset="rect", fill=CORAL, x="1.5cm", y="2.1cm", width="4cm", height="0.10cm"),
    t(6, "From 0 to\n$120M ARR\nin 18 months.", "1.5cm", "2.6cm", "14cm", "8cm",
      "Segoe UI Black", 36, INDIGO, bold=True),
    t(6, "Client: FinTech scale-up, Series B\nChallenge: Platform re-architecture under active growth",
      "1.5cm", "11.5cm", "14cm", "2.5cm", "Segoe UI", 12, "4A4060"),
    s(6, preset="rect", fill="C8C0DC", x="1.5cm", y="14.2cm", width="14cm", height="0.05cm"),
    t(6, "Outcome: 4× faster deployment · 99.99% uptime · 2M+ new users",
      "1.5cm", "14.6cm", "14cm", "2cm", "Segoe UI", 11, "4A4060"),
    # right panel content
    t(6, "The\nChallenge.", "17.8cm", "2cm", "15cm", "5cm",
      "Segoe UI Black", 32, OFFWHT, bold=True),
    t(6, "Legacy monolith unable to handle 10× surge in daily active users. Engineers shipping features 3× slower than roadmap required.",
      "17.8cm", "8cm", "15cm", "4.5cm", "Segoe UI", 13, OFFWHT, opacity="0.85"),
    s(6, preset="roundRect", fill=AMBER,
      x="17.8cm", y="13.5cm", width="9cm", height="2cm"),
    t(6, "Read Full Case Study →", "17.8cm", "13.5cm", "9cm", "2cm",
      "Segoe UI Black", 12, INDIGO, bold=True, align="center", valign="c"),
])

# ── S7 CTA — prism expands to FULL SLIDE LIME takeover ────────────────────────
print("\n[S7]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank",
     "--prop", f"background={LIME}")

s7_rays = ray_fan(7, 16.93, 9.5, 13, 25, 0.28, INDIGO, 270, 100, 0.12)

batch(DECK, s7_rays + [
    # !!prism — full-slide LIME (completes the sweep)
    s(7, name="!!prism", preset="rect",
      fill=LIME,
      x="0cm", y="0cm", width="33.87cm", height="19.05cm", opacity="1.0"),
    # Bauhaus accent top stripe (dark)
    s(7, preset="rect", fill=INDIGO,
      x="0cm", y="0cm", width="33.87cm", height="0.60cm"),
    t(7, "GET STARTED", "1.5cm", "0.05cm", "20cm", "0.55cm",
      "Segoe UI", 9, LIME),
    # big headline
    t(7, "Let's build\nsomething\nspectral.", "1.5cm", "1.5cm", "30cm", "12cm",
      "Segoe UI Black", 64, INDIGO, bold=True),
    # ring chart decoration (top right)
    *ring_chart(7, 30, 4,
                [(3.5, INDIGO, "0.08"), (2.5, CORAL, "0.12"),
                 (1.5, INDIGO, "0.20"), (0.7, CORAL, "0.40")]),
    # contact block
    s(7, preset="rect", fill=INDIGO,
      x="1.5cm", y="14.2cm", width="15cm", height="0.10cm"),
    t(7, "hello@spectral.studio", "1.5cm", "14.6cm", "18cm", "1.2cm",
      "Segoe UI Black", 16, INDIGO, bold=True),
    t(7, "+1 415 ··· ·· ··  /  spectral.studio",
      "1.5cm", "16.0cm", "20cm", "1cm",
      "Segoe UI", 11, INDIGO, opacity="0.60"),
    t(7, "spectral.studio", "28cm", "17.8cm", "6cm", "1cm",
      "Segoe UI", 10, INDIGO, align="right", opacity="0.55"),
    # mosaic corner accent (bottom right)
    *mosaic_tiles(7, 27, 15, 4, 3, 1.4, 1.2, 0.2,
                  [INDIGO, CORAL, INDIGO, DIM],
                  ["0.18", "0.12", "0.22", "0.10"]),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
