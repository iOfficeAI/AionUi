"""
morph-template v18 — Midnight Blueprint / Architecture
Ref: Nexora visual language — image_aionui_1774082163561.png
Techniques: ghost numbers, asymmetric corner glow, textFill fade into BG,
            vertical decorative bar cluster, stark metrics layout
7 slides — strong visual contrast between adjacent slides
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v18.pptx")

NAVY  = "080B2A"
NAVY2 = "181B55"
GHOST = "131650"   # barely visible on NAVY — ghost num color
ELEC  = "4B7FFF"
GOLD  = "F5B942"
WHITE = "FFFFFF"
DIM   = "7A80BB"
MID   = "0F1242"   # card bg
PALE  = "B8C0F0"
BG    = f"{NAVY}-{NAVY2}-135"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)

# ═══ S1 HERO — ghost num right, textFill-fade title left, asymmetric glow ═══
print("\n[S1 Hero]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Asymmetric corner glow (morph actor: repositions each slide)
    s(1, name="!!glow-a", preset="ellipse", fill=ELEC, opacity="0.13",
      x="20cm", y="0cm", width="14cm", height="12cm"),
    s(1, name="!!glow-b", preset="ellipse", fill="5B2BCC", opacity="0.08",
      x="0cm", y="12cm", width="10cm", height="10cm"),
    # Ghost "01" — right side, barely visible
    t(1, "01", "17cm", "1cm", "16cm", "16cm", "Segoe UI Black", 200, GHOST, bold=True),
    # Section label
    t(1, "STUDIO BLUEPRINT", "2cm", "2.5cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    # Title: fades right into BG via textFill gradient
    t(1, "Defining\nSpaces.",
      "2cm", "4cm", "20cm", "8cm", "Segoe UI Black", 56, WHITE, bold=True,
      textFill=f"{WHITE}-{NAVY}-0"),
    # Thin accent line
    s(1, name="!!accent", preset="rect", fill=ELEC,
      x="2cm", y="12.8cm", width="8cm", height="0.14cm"),
    t(1, "Architecture that transforms vision into reality.\nBuilding the future, one structure at a time.",
      "2cm", "13.3cm", "16cm", "4cm", "Segoe UI", 14, DIM),
    t(1, "Founded 2008  ·  New York  ·  London  ·  Tokyo",
      "2cm", "17.6cm", "24cm", "1cm", "Segoe UI", 10, DIM),
])

# ═══ S2 METRICS — 3 huge stats, stark and clean, no ghost ═══
print("\n[S2 Metrics]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    s(2, name="!!glow-a", preset="ellipse", fill=ELEC, opacity="0.06",
      x="0cm", y="9cm", width="11cm", height="11cm"),
    s(2, name="!!glow-b", preset="ellipse", fill="5B2BCC", opacity="0.06",
      x="24cm", y="1cm", width="10cm", height="10cm"),
    t(2, "By the Numbers",
      "2cm", "2cm", "20cm", "2.5cm", "Segoe UI Black", 32, WHITE, bold=True),
    s(2, name="!!accent", preset="rect", fill=ELEC,
      x="2cm", y="1.7cm", width="3cm", height="0.14cm"),
    # Vertical dividers
    s(2, preset="rect", fill=MID, x="12.5cm", y="5cm", width="0.08cm", height="12cm"),
    s(2, preset="rect", fill=MID, x="23cm",   y="5cm", width="0.08cm", height="12cm"),
    # Stat 1
    s(2, preset="rect", fill=ELEC, x="2cm", y="5.5cm", width="2cm", height="0.14cm"),
    t(2, "$2.4B", "2cm", "6.5cm", "9cm", "4cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(2, "Total project\nvalue delivered", "2cm", "11cm", "9cm", "3cm", "Segoe UI", 13, DIM),
    # Stat 2
    s(2, preset="rect", fill=GOLD, x="13.5cm", y="5.5cm", width="2cm", height="0.14cm"),
    t(2, "1,200+", "13.5cm", "6.5cm", "8cm", "4cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(2, "Structures\ncompleted globally", "13.5cm", "11cm", "8cm", "3cm", "Segoe UI", 13, DIM),
    # Stat 3
    s(2, preset="rect", fill=PALE, x="24cm", y="5.5cm", width="2cm", height="0.14cm"),
    t(2, "98%", "24cm", "6.5cm", "8cm", "4cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(2, "Client\nsatisfaction rate", "24cm", "11cm", "8cm", "3cm", "Segoe UI", 13, DIM),
])

# ═══ S3 FEATURES — thick left ELEC strip, dense feature rows right ═══
print("\n[S3 Features]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Left color bar — strong vertical accent
    s(3, name="!!glow-a", preset="rect", fill=ELEC,
      gradient=f"{ELEC}-{NAVY2}-90",
      x="0cm", y="0cm", width="1.8cm", height="19.05cm"),
    s(3, name="!!glow-b", preset="ellipse", fill=GOLD, opacity="0.08",
      x="24cm", y="8cm", width="10cm", height="10cm"),
    t(3, "Key\nAdvantages",
      "3cm", "2cm", "12cm", "4cm", "Segoe UI Black", 36, WHITE, bold=True),
    t(3, "What sets us apart from the rest.",
      "3cm", "6.5cm", "12cm", "1.5cm", "Segoe UI", 13, DIM),
    # 4 feature rows
    s(3, preset="roundRect", fill=MID, x="3cm", y="8.5cm", width="29cm", height="2.2cm"),
    s(3, preset="ellipse", fill=ELEC, gradient=f"{ELEC}-{NAVY2}-135",
      x="3.4cm", y="8.8cm", width="1.6cm", height="1.6cm"),
    t(3, "Parametric Design", "5.6cm", "9cm", "12cm", "1cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(3, "AI-driven form generation from first principles.", "18cm", "9cm", "13cm", "1cm", "Segoe UI", 11, DIM),

    s(3, preset="roundRect", fill=MID, x="3cm", y="11.5cm", width="29cm", height="2.2cm"),
    s(3, preset="ellipse", fill=GOLD, gradient=f"{GOLD}-{NAVY2}-135",
      x="3.4cm", y="11.8cm", width="1.6cm", height="1.6cm"),
    t(3, "Sustainable Materials", "5.6cm", "12cm", "12cm", "1cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(3, "Net-zero certified supply chain across all projects.", "18cm", "12cm", "13cm", "1cm", "Segoe UI", 11, DIM),

    s(3, preset="roundRect", fill=MID, x="3cm", y="14.5cm", width="29cm", height="2.2cm"),
    s(3, preset="ellipse", fill=PALE, gradient=f"{PALE}-{NAVY2}-135",
      x="3.4cm", y="14.8cm", width="1.6cm", height="1.6cm"),
    t(3, "Digital Twin Integration", "5.6cm", "15cm", "12cm", "1cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(3, "Full BIM + real-time simulation before breaking ground.", "18cm", "15cm", "13cm", "1cm", "Segoe UI", 11, DIM),
])

# ═══ S4 QUOTE — minimal, single thought, breathing room ═══
print("\n[S4 Quote]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    s(4, name="!!glow-a", preset="ellipse", fill=ELEC, opacity="0.07",
      x="16cm", y="4cm", width="18cm", height="14cm"),
    s(4, name="!!glow-b", preset="ellipse", fill="5B2BCC", opacity="0.06",
      x="0cm", y="0cm", width="8cm", height="8cm"),
    # Thin horizontal rule
    s(4, name="!!accent", preset="rect", fill=DIM,
      x="2cm", y="8.5cm", width="30cm", height="0.06cm"),
    t(4, "\u201cSpace is not simply a container.\nIt is the first medium of human experience.\u201d",
      "2cm", "5cm", "30cm", "6cm", "Segoe UI", 28, WHITE),
    t(4, "— Sir Norman Foster, Architect",
      "2cm", "11cm", "20cm", "1.5cm", "Segoe UI", 14, DIM),
    t(4, "STUDIO BLUEPRINT", "2cm", "17.6cm", "12cm", "0.9cm", "Segoe UI", 10, DIM),
    t(4, "nexorastudio.com", "25cm", "17.6cm", "7cm", "0.9cm", "Segoe UI", 10, DIM, align="right"),
])

# ═══ S5 VISUAL BARS — decorative bar cluster right, title left ═══
print("\n[S5 Projects]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
# Vertical bar cluster (right side) — heights vary, gradient fills
bar_heights = [11.0, 15.0, 9.0, 13.0, 7.0, 11.5]
bar_fills   = [ELEC, NAVY2, GOLD, ELEC, PALE, NAVY2]
bar_grads   = [f"{ELEC}-{NAVY2}-90", f"{NAVY2}-{ELEC}-90", f"{GOLD}-{NAVY2}-90",
               f"{ELEC}-{PALE}-90",  f"{PALE}-{ELEC}-90",  f"{ELEC}-{NAVY2}-90"]
bar_ops = []
for i, (h, fill, grad) in enumerate(zip(bar_heights, bar_fills, bar_grads)):
    x = round(18.5 + i * 2.5, 1)
    y = round(19.05 - h, 2)
    kw = {"name": "!!bar-a"} if i == 0 else {}
    bar_ops.append(s(5, preset="roundRect", fill=fill, gradient=grad,
                     x=f"{x}cm", y=f"{y}cm", width="2cm", height=f"{h}cm",
                     opacity=str(round(0.55 + i * 0.07, 2)), **kw))
batch(DECK, bar_ops + [
    s(5, name="!!glow-a", preset="ellipse", fill=ELEC, opacity="0.07",
      x="16cm", y="0cm", width="18cm", height="18cm"),
    s(5, name="!!glow-b", preset="ellipse", fill="5B2BCC", opacity="0.07",
      x="0cm", y="10cm", width="9cm", height="9cm"),
    # Ghost "05" behind bars
    t(5, "05", "12cm", "2cm", "14cm", "14cm", "Segoe UI Black", 160, GHOST, bold=True),
    t(5, "PORTFOLIO", "2cm", "2.5cm", "14cm", "0.9cm", "Segoe UI", 10, DIM),
    t(5, "Our\nProjects",
      "2cm", "4cm", "15cm", "5cm", "Segoe UI Black", 48, WHITE, bold=True,
      textFill=f"{WHITE}-{NAVY}-0"),
    s(5, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="9.5cm", width="5cm", height="0.14cm"),
    t(5, "From cultural landmarks to urban\nresidential towers — each project\nis a statement in built form.",
      "2cm", "10cm", "14cm", "6cm", "Segoe UI", 14, DIM),
])

# ═══ S6 TEAM — 3 avatar circles, ghost "06", airy grid layout ═══
print("\n[S6 Team]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    s(6, name="!!glow-a", preset="ellipse", fill=GOLD, opacity="0.08",
      x="26cm", y="8cm", width="10cm", height="10cm"),
    s(6, name="!!glow-b", preset="ellipse", fill=ELEC, opacity="0.06",
      x="0cm", y="0cm", width="8cm", height="8cm"),
    t(6, "06", "18cm", "3cm", "16cm", "14cm", "Segoe UI Black", 160, GHOST, bold=True),
    t(6, "LEADERSHIP", "2cm", "2.5cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    t(6, "The Team",
      "2cm", "3.5cm", "16cm", "3cm", "Segoe UI Black", 36, WHITE, bold=True),
    s(6, name="!!accent", preset="rect", fill=ELEC,
      x="2cm", y="3.2cm", width="3cm", height="0.14cm"),
    # 3 avatar circles
    s(6, preset="ellipse", fill=ELEC, gradient=f"{ELEC}-{NAVY2}-135",
      x="2cm", y="8cm", width="6cm", height="6cm"),
    s(6, preset="ellipse", fill=GOLD, gradient=f"{GOLD}-{NAVY2}-135",
      x="13.5cm", y="8cm", width="6cm", height="6cm"),
    s(6, preset="ellipse", fill=PALE, gradient=f"{PALE}-{NAVY2}-135",
      x="25cm", y="8cm", width="6cm", height="6cm"),
    # Names
    t(6, "Marcus Chen", "2cm", "14.5cm", "6cm", "1.2cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(6, "Principal Architect", "2cm", "15.9cm", "6cm", "1cm", "Segoe UI", 11, DIM),
    t(6, "Sarah Voss", "13.5cm", "14.5cm", "6cm", "1.2cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(6, "Design Director", "13.5cm", "15.9cm", "6cm", "1cm", "Segoe UI", 11, DIM),
    t(6, "Kenji Mori", "25cm", "14.5cm", "6cm", "1.2cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(6, "Technical Lead", "25cm", "15.9cm", "6cm", "1cm", "Segoe UI", 11, DIM),
])

# ═══ S7 CTA — full gradient transforms slide, centered CTA ═══
print("\n[S7 CTA]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={ELEC}-{NAVY}-135")
batch(DECK, [
    s(7, name="!!glow-a", preset="ellipse", fill=WHITE, opacity="0.08",
      x="20cm", y="0cm", width="16cm", height="16cm"),
    s(7, name="!!glow-b", preset="ellipse", fill=NAVY, opacity="0.30",
      x="0cm", y="8cm", width="14cm", height="14cm"),
    t(7, "Let\u2019s Build\nSomething\nExtraordinary.",
      "2cm", "2cm", "26cm", "11cm", "Segoe UI Black", 52, WHITE, bold=True),
    s(7, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="1.8cm", width="4cm", height="0.14cm"),
    t(7, "Ready to transform your vision into architecture?\nOur team is waiting to hear from you.",
      "2cm", "14cm", "22cm", "3.5cm", "Segoe UI", 16, PALE),
    s(7, preset="roundRect", fill=GOLD,
      x="2cm", y="16cm", width="10cm", height="2.5cm"),
    t(7, "Start a Project \u2192",
      "2cm", "16cm", "10cm", "2.5cm",
      "Segoe UI Black", 14, NAVY, bold=True, align="center", valign="c"),
    t(7, "nexorastudio.com", "26cm", "17.5cm", "6cm", "1cm", "Segoe UI", 11, PALE, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])
validate_and_outline(DECK)
print("\nDone \u2192", DECK)
