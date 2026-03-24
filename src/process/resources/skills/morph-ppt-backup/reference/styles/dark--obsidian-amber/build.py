"""
morph-template v21 — Obsidian Amber / Finance & Investment
Ref: Nexora ghost numbers + PRO.TEAM grain — synthesized dark finance theme
Techniques: near-black BG, amber corner glow, huge ghost percentage numbers,
            textFill title fades white→amber, white card floating on black,
            split warm/cold panels
6 slides — extreme visual variation per slide
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v21.pptx")

BLACK  = "070708"
CHAR   = "111214"   # charcoal card bg
AMBER  = "FF8C00"
GOLD   = "FFD040"
DGOLD  = "2A1800"   # dark amber for corner glow bg element
WHITE  = "FFFFFF"
DIM    = "706050"
WARM   = "C09050"   # warm mid tone
GHOST  = "120E04"   # barely-visible ghost on BLACK
CREAM  = "F5EDE0"
INK    = "1A1010"   # warm near-black for text on cream card

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def amber_glow(slide, cx, cy, size, name=None):
    """Warm amber corner glow — layered ellipses."""
    kw = {"name": name} if name else {}
    return [
        s(slide, preset="ellipse", fill=AMBER, opacity="0.05",
          x=f"{max(0, round(cx-size*1.4,2))}cm",
          y=f"{max(0, round(cy-size*1.4,2))}cm",
          width=f"{round(size*2.8,2)}cm", height=f"{round(size*2.8,2)}cm", **kw),
        s(slide, preset="ellipse", fill=AMBER, opacity="0.11",
          x=f"{max(0, round(cx-size*0.8,2))}cm",
          y=f"{max(0, round(cy-size*0.8,2))}cm",
          width=f"{round(size*1.6,2)}cm", height=f"{round(size*1.6,2)}cm"),
    ]


# ═══ S1 HERO — amber glow corner, ghost "01", textFill fade title ═══
print("\n[S1 Hero]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BLACK}")
batch(DECK, amber_glow(1, 30.0, 18.0, 6.0, "!!glow") + [
    # Ghost "01" — barely visible warm ghost
    t(1, "01", "17cm", "1cm", "16cm", "16cm", "Segoe UI Black", 200, GHOST, bold=True),
    # Thin amber accent line
    s(1, name="!!accent", preset="rect", fill=AMBER,
      x="2cm", y="3.2cm", width="2.5cm", height="0.14cm"),
    t(1, "MERIDIAN CAPITAL  ·  INVESTOR OVERVIEW", "2cm", "2.5cm", "22cm", "0.9cm", "Segoe UI", 10, DIM),
    # Title fades white → amber (into warm bg corner)
    t(1, "Redefining\nAlternative\nAssets.",
      "2cm", "4cm", "22cm", "11cm", "Segoe UI Black", 52, WHITE, bold=True,
      textFill=f"{WHITE}-{AMBER}-0"),
    t(1, "Private credit, real assets, and systematic strategies\nfor the modern institutional investor.",
      "2cm", "15.5cm", "20cm", "3cm", "Segoe UI", 14, WARM),
    t(1, "AUM $4.8B  ·  Founded 2014  ·  New York", "2cm", "17.7cm", "22cm", "0.9cm", "Segoe UI", 10, DIM),
])

# ═══ S2 BIG NUMBER — single massive stat, centered, pure minimal ═══
print("\n[S2 BigStat]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BLACK}")
batch(DECK, amber_glow(2, 0.0, 19.05, 4.0, "!!glow") + [
    s(2, preset="rect", fill=DIM, x="2cm", y="8.5cm", width="29cm", height="0.06cm"),
    s(2, name="!!accent", preset="rect", fill=GOLD,
      x="2cm", y="2.2cm", width="2cm", height="0.14cm"),
    t(2, "PERFORMANCE  ·  2024", "2cm", "1.5cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    # Giant stat
    t(2, "340%",
      "1cm", "2.5cm", "32cm", "8cm", "Segoe UI Black", 160, GOLD, bold=True,
      textFill=f"{GOLD}-{BLACK}-0"),
    t(2, "Cumulative net return\nacross flagship fund since inception.",
      "2cm", "10cm", "22cm", "4cm", "Segoe UI Black", 22, WHITE, bold=True),
    t(2, "Benchmark (S&P 500): +187%  ·  Alpha: +153pp",
      "2cm", "14.5cm", "22cm", "1.5cm", "Segoe UI", 14, DIM),
    t(2, "Past performance does not guarantee future results.",
      "2cm", "17.7cm", "24cm", "0.9cm", "Segoe UI", 9, DIM),
])

# ═══ S3 SPLIT — narrow warm amber panel left, charcoal right ═══
print("\n[S3 Split]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BLACK}")
batch(DECK, [
    # Left warm amber strip
    s(3, preset="rect", fill=DGOLD, gradient=f"{AMBER}-{DGOLD}-0",
      x="0cm", y="0cm", width="9cm", height="19.05cm"),
    # Right charcoal panel
    s(3, preset="rect", fill=CHAR,
      x="9.5cm", y="0cm", width="24.37cm", height="19.05cm"),
    s(3, name="!!glow", preset="ellipse", fill=AMBER, opacity="0.07",
      x="22cm", y="5cm", width="12cm", height="12cm"),
    s(3, name="!!accent", preset="rect", fill=AMBER,
      x="10.5cm", y="3cm", width="2cm", height="0.14cm"),
    # Left side content
    t(3, "CASE\nSTUDY\n\u2192", "1cm", "5cm", "7cm", "9cm", "Segoe UI Black", 28, AMBER, bold=True),
    t(3, "2024\nFundamental\nPrivate Credit",
      "1cm", "14cm", "7cm", "4.5cm", "Segoe UI", 13, WARM),
    # Right side content
    t(3, "Investment Thesis", "10.5cm", "3.5cm", "22cm", "2cm", "Segoe UI Black", 24, WHITE, bold=True),
    t(3, "Senior secured lending to mid-market companies in structural growth sectors — healthcare, infrastructure, and B2B software — with 8-12% target yield and capital preservation mandate.",
      "10.5cm", "6.5cm", "22cm", "6cm", "Segoe UI", 14, WARM),
    s(3, preset="rect", fill=DIM, x="10.5cm", y="13cm", width="21cm", height="0.06cm"),
    t(3, "Target Return", "10.5cm", "13.5cm", "6cm", "1cm", "Segoe UI", 11, DIM),
    t(3, "10.5% net", "10.5cm", "14.5cm", "8cm", "1.5cm", "Segoe UI Black", 18, GOLD, bold=True),
    t(3, "LTV", "18.5cm", "13.5cm", "4cm", "1cm", "Segoe UI", 11, DIM),
    t(3, "\u226465%", "18.5cm", "14.5cm", "6cm", "1.5cm", "Segoe UI Black", 18, WHITE, bold=True),
    t(3, "Duration", "25cm", "13.5cm", "6cm", "1cm", "Segoe UI", 11, DIM),
    t(3, "3\u20134 yr", "25cm", "14.5cm", "6cm", "1.5cm", "Segoe UI Black", 18, WHITE, bold=True),
])

# ═══ S4 FEATURES — 4 horizontal rows with amber bullet circles ═══
print("\n[S4 Features]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BLACK}")
features = [
    (AMBER, "Systematic Risk Management", "Multi-factor stress testing across 200+ macro scenarios per quarter."),
    (GOLD,  "Alignment of Interest",       "GP co-invest minimum 3% — our capital alongside yours, always."),
    (WARM,  "Operational Excellence",      "Dedicated ops team embedded with each portfolio company."),
    (WHITE, "Transparent Reporting",       "Real-time NAV, weekly portfolio updates, full look-through."),
]
feat_ops = []
for i, (col, title, body) in enumerate(features):
    y = 5.5 + i * 3.2
    feat_ops.append(s(4, preset="roundRect", fill=CHAR,
                      x="2cm", y=f"{y}cm", width="29cm", height="2.8cm"))
    feat_ops.append(s(4, preset="ellipse", fill=col,
                      x="2.4cm", y=f"{y+0.5}cm", width="1.8cm", height="1.8cm"))
    feat_ops.append(t(4, title, "4.8cm", f"{y+0.5}cm", "13cm", "1cm",
                      "Segoe UI Black", 13, WHITE, bold=True))
    feat_ops.append(t(4, body, "4.8cm", f"{y+1.6}cm", "24cm", "1cm",
                      "Segoe UI", 11, DIM))
batch(DECK, amber_glow(4, 30.0, 0.0, 5.0, "!!glow") + feat_ops + [
    s(4, name="!!accent", preset="rect", fill=AMBER,
      x="2cm", y="3.2cm", width="2.5cm", height="0.14cm"),
    t(4, "APPROACH", "2cm", "2.5cm", "14cm", "0.9cm", "Segoe UI", 10, DIM),
    t(4, "Why Meridian",
      "2cm", "3.5cm", "18cm", "2cm", "Segoe UI Black", 28, WHITE, bold=True),
])

# ═══ S5 PROOF — white card floating on black, light island ═══
print("\n[S5 Proof]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BLACK}")
batch(DECK, amber_glow(5, 15.0, 9.0, 3.0, "!!glow") + [
    # Large white card centered
    s(5, preset="roundRect", fill=CREAM,
      x="3cm", y="2cm", width="27.87cm", height="15cm"),
    s(5, name="!!accent", preset="rect", fill=AMBER,
      x="4cm", y="3cm", width="2.5cm", height="0.14cm"),
    t(5, "INVESTOR VOICE", "4cm", "3.5cm", "14cm", "0.9cm", "Segoe UI", 10, DIM),
    t(5, "\u201cMeridian\u2019s credit team has the deepest fundamental underwriting we\u2019ve seen in the mid-market. Three funds, consistent alpha.\u201d",
      "4cm", "4.5cm", "25cm", "7cm", "Segoe UI", 22, INK),
    s(5, preset="rect", fill=AMBER, x="4cm", y="11.5cm", width="24cm", height="0.08cm"),
    t(5, "Chief Investment Officer, Major Sovereign Wealth Fund",
      "4cm", "12cm", "24cm", "1.2cm", "Segoe UI Black", 13, INK, bold=True),
    t(5, "$500M committed across Fund II and Fund III",
      "4cm", "13.5cm", "22cm", "1.2cm", "Segoe UI", 12, DIM),
    t(5, "meridian-capital.com", "2cm", "17.7cm", "14cm", "0.9cm", "Segoe UI", 10, DIM),
])

# ═══ S6 CTA — amber glow expands to atmospheric warm field ═══
print("\n[S6 CTA]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BLACK}")
batch(DECK, [
    # Large atmospheric amber glow — dominant
    s(6, preset="ellipse", fill=DGOLD, gradient=f"{AMBER}-{BLACK}-135", opacity="0.45",
      x="8cm", y="3cm", width="26cm", height="16cm"),
    s(6, preset="ellipse", fill=AMBER, opacity="0.18",
      x="14cm", y="5cm", width="16cm", height="12cm"),
    s(6, name="!!glow", preset="ellipse", fill=GOLD, opacity="0.22",
      x="18cm", y="6cm", width="10cm", height="10cm"),
    s(6, name="!!accent", preset="rect", fill=AMBER,
      x="2cm", y="3.2cm", width="2.5cm", height="0.14cm"),
    t(6, "CONTACT", "2cm", "2.5cm", "14cm", "0.9cm", "Segoe UI", 10, DIM),
    t(6, "Begin the\nConversation.",
      "2cm", "4cm", "22cm", "8cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(6, "Institutional inquiries and LP relations:",
      "2cm", "13cm", "20cm", "1.5cm", "Segoe UI", 16, WARM),
    s(6, preset="roundRect", fill=AMBER,
      x="2cm", y="15cm", width="12cm", height="2.5cm"),
    t(6, "ir@meridian-capital.com \u2192",
      "2cm", "15cm", "12cm", "2.5cm",
      "Segoe UI Black", 13, BLACK, bold=True, align="center", valign="c"),
    t(6, "meridian-capital.com", "26cm", "17.5cm", "6cm", "1cm", "Segoe UI", 10, DIM, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone \u2192", DECK)
