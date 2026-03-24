"""
morph-template v20 — Coral Culture / Company Deck
Ref: Spir Culture Deck — image_aionui_1774082317581.png
Techniques: horizontal blue→coral gradient BG, vertical decorative bar cluster
            (abstract skyline), circle ring element, alternating light/dark slides,
            extreme typographic contrast
7 slides with morph transitions — hard contrast between every adjacent slide
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v20.pptx")

COBALT  = "3B5FE8"
COBALT2 = "2040B0"
CORAL   = "E8896A"
CORAL2  = "C86040"
WHITE   = "FFFFFF"
INK     = "1A1A2E"
LIGHT   = "F8F4F0"   # warm near-white for light slides
DIM     = "7A7090"
PALE_B  = "B0C4FF"
PALE_C  = "F5C4B0"
BGGRAD  = f"{COBALT}-{CORAL}-0"   # horizontal gradient (Spir-style)

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def bar_cluster(slide, x_start, y_bottom, heights, bar_w=1.8, gap=0.5,
                fill=COBALT, grad=None, name0=None):
    """Vertical decorative bar cluster — abstract skyline."""
    ops = []
    for i, h in enumerate(heights):
        x = round(x_start + i * (bar_w + gap), 2)
        y = round(max(0.0, y_bottom - h), 2)
        kw = {"name": name0} if (i == 0 and name0) else {}
        op_grad = grad or f"{COBALT}-{CORAL}-90"
        ops.append(s(slide, preset="roundRect", fill=fill, gradient=op_grad,
                     x=f"{x}cm", y=f"{y}cm",
                     width=f"{bar_w}cm", height=f"{h}cm",
                     opacity=str(round(0.55 + i * 0.06, 2)), **kw))
    return ops


# ═══ S1 HERO — full COBALT→CORAL gradient + vertical bar cluster ═══
print("\n[S1 Hero]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BGGRAD}")
bars1 = bar_cluster(1, 20.5, 18.0, [10, 15, 11, 14, 8, 12, 7], name0="!!bars")
batch(DECK, bars1 + [
    s(1, preset="ellipse", fill=WHITE, opacity="0.06",
      x="18cm", y="0cm", width="16cm", height="16cm"),
    t(1, "Spir", "2cm", "1.5cm", "10cm", "2cm", "Segoe UI Black", 22, WHITE, bold=True),
    t(1, "Update 2025.1",
      "2cm", "3.8cm", "14cm", "1cm", "Segoe UI", 12, PALE_B),
    t(1, "CULTURE\nDECK",
      "2cm", "5cm", "18cm", "10cm", "Segoe UI Black", 68, WHITE, bold=True),
    t(1, "Who we are, what we believe,\nand where we\u2019re going.",
      "2cm", "15.5cm", "16cm", "2.5cm", "Segoe UI", 14, PALE_C),
])

# ═══ S2 INDEX — LIGHT bg, pure minimal, dramatic tone shift ═══
print("\n[S2 Index]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={LIGHT}")
batch(DECK, [
    s(2, name="!!bars", preset="rect", fill=LIGHT,
      x="0cm", y="0cm", width="0.1cm", height="0.1cm"),  # morph anchor
    t(2, "INDEX", "2cm", "2cm", "14cm", "4cm", "Segoe UI Black", 52, INK, bold=True),
    t(2, "\u76ee\u6b21", "2cm", "6cm", "4cm", "1cm", "Segoe UI", 11, DIM),
    # Index lines
    s(2, preset="rect", fill=DIM, x="2cm", y="7.5cm", width="29cm", height="0.06cm"),
    t(2, "01  Company", "2cm", "8cm", "12cm", "1.2cm", "Segoe UI", 13, INK),
    t(2, "02  Team Culture", "2cm", "9.5cm", "12cm", "1.2cm", "Segoe UI", 13, INK),
    s(2, preset="rect", fill=DIM, x="2cm", y="10.8cm", width="29cm", height="0.06cm"),
    t(2, "03  Product", "2cm", "11.3cm", "12cm", "1.2cm", "Segoe UI", 13, INK),
    t(2, "04  Recruiting", "2cm", "12.8cm", "12cm", "1.2cm", "Segoe UI", 13, INK),
    s(2, preset="rect", fill=DIM, x="2cm", y="14.1cm", width="29cm", height="0.06cm"),
    t(2, "05  Values", "2cm", "14.6cm", "12cm", "1.2cm", "Segoe UI", 13, INK),
    t(2, "06  Vision", "2cm", "16.1cm", "12cm", "1.2cm", "Segoe UI", 13, INK),
    t(2, "Spir / Culture Deck 2025", "22cm", "17.5cm", "10cm", "1cm", "Segoe UI", 10, DIM, align="right"),
])

# ═══ S3 COMPANY VALUES — dark COBALT, large numbered values ═══
print("\n[S3 Values]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={COBALT2}-{COBALT}-160")
batch(DECK, [
    s(3, preset="ellipse", fill=CORAL, opacity="0.12",
      x="22cm", y="0cm", width="14cm", height="14cm"),
    s(3, name="!!bars", preset="ellipse", fill=WHITE, opacity="0.04",
      x="0cm", y="10cm", width="12cm", height="12cm"),
    t(3, "COMPANY", "2cm", "1.5cm", "18cm", "2.5cm", "Segoe UI Black", 40, WHITE, bold=True),
    s(3, preset="rect", fill=CORAL, x="2cm", y="1.2cm", width="4cm", height="0.14cm"),
    # 3 values with big numbers
    t(3, "01", "2cm", "5.5cm", "8cm", "3cm", "Segoe UI Black", 48, CORAL, bold=True),
    t(3, "Transparency\nFirst", "2cm", "8.8cm", "9cm", "3cm", "Segoe UI Black", 20, WHITE, bold=True),
    t(3, "We share everything:\ngoals, numbers, and failures.", "2cm", "12.2cm", "9cm", "4cm", "Segoe UI", 12, PALE_B),

    t(3, "02", "12.5cm", "5.5cm", "8cm", "3cm", "Segoe UI Black", 48, PALE_B, bold=True),
    t(3, "Ship Fast,\nLearn Faster", "12.5cm", "8.8cm", "9cm", "3cm", "Segoe UI Black", 20, WHITE, bold=True),
    t(3, "Iteration beats perfection.\nWe validate before we scale.", "12.5cm", "12.2cm", "9cm", "4cm", "Segoe UI", 12, PALE_B),

    t(3, "03", "23cm", "5.5cm", "8cm", "3cm", "Segoe UI Black", 48, WHITE, bold=True),
    t(3, "People\nOver Process", "23cm", "8.8cm", "9cm", "3cm", "Segoe UI Black", 20, WHITE, bold=True),
    t(3, "Autonomy, trust, and\ngrowth over rigid rules.", "23cm", "12.2cm", "9cm", "4cm", "Segoe UI", 12, PALE_B),
])

# ═══ S4 PEOPLE — gradient again, white stat card right ═══
print("\n[S4 People]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BGGRAD}")
batch(DECK, [
    s(4, preset="ellipse", fill=WHITE, opacity="0.08",
      x="0cm", y="5cm", width="14cm", height="14cm"),
    s(4, name="!!bars", preset="rect", fill=WHITE, opacity="0.04",
      x="28cm", y="0cm", width="6cm", height="6cm"),
    t(4, "TEAM", "2cm", "1.5cm", "10cm", "1.5cm", "Segoe UI", 12, PALE_B),
    t(4, "The People\nBehind Spir",
      "2cm", "3.5cm", "18cm", "6cm", "Segoe UI Black", 44, WHITE, bold=True),
    t(4, "A distributed team of designers, engineers,\nand product thinkers.",
      "2cm", "10cm", "16cm", "3.5cm", "Segoe UI", 16, PALE_C),
    # White stat card
    s(4, preset="roundRect", fill=WHITE,
      x="20cm", y="4cm", width="12cm", height="13cm"),
    t(4, "42", "21cm", "5cm", "10cm", "4cm", "Segoe UI Black", 56, INK, bold=True),
    t(4, "Full-time\nteam members", "21cm", "9.5cm", "10cm", "2.5cm", "Segoe UI", 13, DIM),
    s(4, preset="rect", fill=COBALT, x="21cm", y="12.5cm", width="10cm", height="0.08cm"),
    t(4, "18 nationalities  ·  9 cities", "21cm", "13cm", "10cm", "1.2cm", "Segoe UI", 12, DIM),
    t(4, "Avg age: 31  ·  62% engineers", "21cm", "14.5cm", "10cm", "1.2cm", "Segoe UI", 12, DIM),
])

# ═══ S5 CREATIVITY — LIGHT bg, big circle ring, single concept ═══
print("\n[S5 Creativity]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={LIGHT}")
batch(DECK, [
    # Circle ring: outer cobalt ellipse + inner light ellipse "cutout"
    s(5, preset="ellipse", fill=COBALT,
      x="14cm", y="1cm", width="17cm", height="17cm", opacity="0.14"),
    s(5, preset="ellipse", fill=COBALT,
      x="15.6cm", y="2.6cm", width="13.8cm", height="13.8cm", opacity="0.08"),
    s(5, name="!!bars", preset="ellipse", fill=CORAL, opacity="0.14",
      x="16.5cm", y="6cm", width="10cm", height="10cm"),
    t(5, "HISTORY\n\u6c96\u9769", "2cm", "2cm", "10cm", "2.5cm", "Segoe UI", 12, DIM),
    t(5, "Unleash\nyour\ncreativity",
      "2cm", "5cm", "16cm", "10cm", "Segoe UI Black", 44, INK, bold=True),
    t(5, "\u5275\u9020\u6027\u3092\u89e3\u653e\u3059\u308b",
      "2cm", "15.5cm", "14cm", "2cm", "Segoe UI", 13, DIM),
    s(5, preset="rect", fill=COBALT, x="2cm", y="4.5cm", width="3.5cm", height="0.12cm"),
    t(5, "PRODUCT  \u00b7  Since 2021",
      "2cm", "17.5cm", "14cm", "1cm", "Segoe UI", 10, DIM),
])

# ═══ S6 TIMELINE — COBALT left strip + LIGHT right, split layout ═══
print("\n[S6 Timeline]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={LIGHT}")
batch(DECK, [
    # Dark cobalt left panel
    s(6, preset="rect", fill=COBALT2, gradient=f"{COBALT2}-{COBALT}-90",
      x="0cm", y="0cm", width="10cm", height="19.05cm"),
    s(6, name="!!bars", preset="ellipse", fill=CORAL, opacity="0.20",
      x="1cm", y="10cm", width="9cm", height="9cm"),
    t(6, "HISTORY\n\u6c96\u9769", "1cm", "2cm", "8cm", "2.5cm", "Segoe UI", 12, PALE_B),
    t(6, "2019\n\u2014\n2025",
      "1cm", "5cm", "8cm", "8cm", "Segoe UI Black", 32, WHITE, bold=True),
    # Timeline on right — dots and events
    s(6, preset="rect", fill=COBALT, x="13cm", y="3cm", width="0.08cm", height="14cm"),
])
# Write timeline events separately
evt_ops = []
events = [("2019.3", "創業 / Founded"),
          ("2021.2", "Spir for Agent リリース"),
          ("2022.9", "3.5億 Series A"),
          ("2024",   "42年分の利用実績")]
for i, (yr, label) in enumerate(events):
    y = 3.0 + i * 3.5
    evt_ops.append(s(6, preset="ellipse", fill=CORAL,
                     x="12.1cm", y=f"{y}cm", width="1.8cm", height="1.8cm"))
    evt_ops.append(t(6, yr, "14.5cm", f"{y}cm", "6cm", "1.1cm", "Segoe UI Black", 11, COBALT, bold=True))
    evt_ops.append(t(6, label, "14.5cm", f"{y+1.2}cm", "16cm", "1.5cm", "Segoe UI", 12, INK))
batch(DECK, evt_ops + [
    t(6, "Spir / Culture Deck 2025", "22cm", "17.5cm", "10cm", "1cm", "Segoe UI", 10, DIM, align="right"),
])

# ═══ S7 CTA — coral-dominant warm gradient, white text ═══
print("\n[S7 CTA]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={CORAL}-{CORAL2}-160")
batch(DECK, [
    s(7, preset="ellipse", fill=COBALT, opacity="0.25",
      x="0cm", y="0cm", width="20cm", height="20cm"),
    s(7, preset="ellipse", fill=WHITE, opacity="0.06",
      x="22cm", y="5cm", width="14cm", height="14cm"),
    s(7, name="!!bars", preset="rect", fill=WHITE, opacity="0.03",
      x="0cm", y="0cm", width="0.1cm", height="0.1cm"),
    t(7, "Think\nBeyond\nTomorrow.",
      "2cm", "2cm", "26cm", "11cm", "Segoe UI Black", 56, WHITE, bold=True),
    t(7, "Open Dialogue  ·  Be Accountable",
      "2cm", "14cm", "22cm", "1.5cm", "Segoe UI", 16, PALE_C),
    s(7, preset="roundRect", fill=WHITE,
      x="2cm", y="15.8cm", width="10cm", height="2.5cm"),
    t(7, "Join the Team \u2192",
      "2cm", "15.8cm", "10cm", "2.5cm",
      "Segoe UI Black", 14, CORAL2, bold=True, align="center", valign="c"),
    t(7, "spir.app", "26cm", "17.5cm", "6cm", "1cm", "Segoe UI", 11, PALE_C, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])
validate_and_outline(DECK)
print("\nDone \u2192", DECK)
