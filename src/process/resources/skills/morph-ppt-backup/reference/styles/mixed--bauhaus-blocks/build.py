"""
morph-template v29 — Bauhaus Color Block
Ref: Image 1 (Math/Education Slideshow) — flat solid color grid, Bauhaus geometry
Techniques: colored rect mosaic, 3-stacked circles, vertical bar cluster,
            high-contrast flat type, stat badges
Bold morph: !!panel shifts: right-block→top-stripe→left-col→top-band→accent-bar→full-slide→full-FOREST
7 slides — re-use: branding / creative studio / portfolio
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v29.pptx")
FOREST = "1D5C38"; AMBER = "F4C040"; TANGERINE = "E06828"
TEAL   = "1B6060"; DARK  = "1E1818"; CREAM = "F0EBE0"; WHITE = "FFFFFF"
DIM    = "888878"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)

# S1 HERO — mosaic: left content / right color grid
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={CREAM}")
batch(DECK, [
    s(1, preset="rect", fill=WHITE, x="0cm", y="0cm", width="13.5cm", height="19.05cm"),
    s(1, name="!!panel", preset="rect", fill=FOREST,
      x="13.5cm", y="2.5cm", width="14.87cm", height="16.55cm"),
    s(1, preset="rect", fill=AMBER,     x="28.37cm", y="2.5cm",  width="5.5cm", height="8.0cm"),
    s(1, preset="rect", fill=TANGERINE, x="28.37cm", y="10.5cm", width="5.5cm", height="8.55cm"),
    s(1, preset="rect", fill=DARK,      x="13.5cm",  y="0cm",    width="20.37cm", height="2.5cm"),
    # Vertical bar cluster on DARK header
    s(1, preset="rect", fill=CREAM,     x="15cm",  y="0.3cm", width="0.5cm", height="1.9cm"),
    s(1, preset="rect", fill=AMBER,     x="16cm",  y="0.3cm", width="0.5cm", height="1.9cm"),
    s(1, preset="rect", fill=CREAM,     x="17cm",  y="0.3cm", width="0.5cm", height="1.9cm"),
    s(1, preset="rect", fill=TANGERINE, x="18cm",  y="0.3cm", width="0.5cm", height="1.9cm"),
    # 3 stacked circles on FOREST (Bauhaus signature)
    s(1, preset="ellipse", fill=CREAM, opacity="0.90", x="14.5cm", y="3.5cm", width="5cm", height="5cm"),
    s(1, preset="ellipse", fill=CREAM, opacity="0.70", x="17.2cm", y="5.8cm", width="5cm", height="5cm"),
    s(1, preset="ellipse", fill=CREAM, opacity="0.50", x="19.9cm", y="8.1cm", width="5cm", height="5cm"),
    # Left content
    t(1, "STUDIO", "2cm", "1.0cm", "10cm", "0.9cm", "Segoe UI", 10, DARK),
    s(1, preset="rect", fill=FOREST, x="2cm", y="2.2cm", width="4cm", height="0.14cm"),
    t(1, "Design That\nMoves You.", "2cm", "2.8cm", "10cm", "6cm", "Segoe UI Black", 40, DARK, bold=True),
    t(1, "We create visual systems that communicate,\npersuade, and endure — across every medium.",
      "2cm", "9.5cm", "10cm", "3.5cm", "Segoe UI", 13, DARK, opacity="0.70"),
    s(1, preset="roundRect", fill=FOREST, x="2cm", y="14.5cm", width="5.5cm", height="2cm"),
    t(1, "+4,800 Clients", "2cm", "14.5cm", "5.5cm", "2cm",
      "Segoe UI Black", 11, WHITE, bold=True, align="center", valign="c"),
    s(1, preset="roundRect", fill=DARK,   x="8.1cm", y="14.5cm", width="4cm",  height="2cm"),
    t(1, "Est. 2009", "8.1cm", "14.5cm", "4cm", "2cm",
      "Segoe UI", 11, CREAM, align="center", valign="c"),
    t(1, "studio-bauhaus.com", "2cm", "17.8cm", "10cm", "0.9cm", "Segoe UI", 9, DIM),
])

# S2 STATS — 2×2 color cards, !!panel → thin DARK top stripe
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={CREAM}")
batch(DECK, [
    s(2, name="!!panel", preset="rect", fill=DARK,
      x="0cm", y="0cm", width="33.87cm", height="2.8cm"),
    t(2, "STUDIO  ·  IMPACT 2024", "2cm", "0.4cm", "20cm", "0.9cm", "Segoe UI", 10, CREAM),
    t(2, "Our Numbers", "2cm", "1.2cm", "20cm", "1.3cm", "Segoe UI Black", 16, AMBER, bold=True),
    # FOREST card
    s(2, preset="rect", fill=FOREST, x="2cm",   y="3.8cm", width="14cm",  height="6.5cm"),
    t(2, "4,800+",  "2.5cm",  "4.3cm",  "10cm", "3.2cm", "Segoe UI Black", 48, AMBER, bold=True),
    t(2, "CLIENTS SERVED", "2.5cm", "7.5cm", "10cm", "0.9cm", "Segoe UI Black", 10, WHITE, bold=True),
    t(2, "38 countries across 6 continents since 2009.", "2.5cm", "8.6cm", "11cm", "1.2cm", "Segoe UI", 11, WHITE, opacity="0.70"),
    # AMBER card
    s(2, preset="rect", fill=AMBER, x="17cm",  y="3.8cm", width="14.87cm", height="6.5cm"),
    t(2, "98%",     "17.5cm", "4.3cm",  "10cm", "3.2cm", "Segoe UI Black", 48, DARK, bold=True),
    t(2, "CLIENT RETENTION", "17.5cm", "7.5cm", "10cm", "0.9cm", "Segoe UI Black", 10, DARK, bold=True),
    t(2, "Repeat engagements and referrals drive our growth.", "17.5cm", "8.6cm", "11cm", "1.2cm", "Segoe UI", 11, DARK, opacity="0.75"),
    # TANGERINE card
    s(2, preset="rect", fill=TANGERINE, x="2cm",  y="11.3cm", width="14cm",  height="6.5cm"),
    t(2, "340+",   "2.5cm",  "11.8cm", "10cm", "3.2cm", "Segoe UI Black", 48, WHITE, bold=True),
    t(2, "AWARDS WON", "2.5cm", "15cm", "10cm", "0.9cm", "Segoe UI Black", 10, WHITE, bold=True),
    t(2, "International recognition in brand and motion design.", "2.5cm", "16.1cm", "11cm", "1.2cm", "Segoe UI", 11, WHITE, opacity="0.75"),
    # TEAL card
    s(2, preset="rect", fill=TEAL, x="17cm",  y="11.3cm", width="14.87cm", height="6.5cm"),
    t(2, "12×",    "17.5cm", "11.8cm", "10cm", "3.2cm", "Segoe UI Black", 48, AMBER, bold=True),
    t(2, "YOY GROWTH", "17.5cm", "15cm", "10cm", "0.9cm", "Segoe UI Black", 10, WHITE, bold=True),
    t(2, "Revenue grown consistently for 12 consecutive years.", "17.5cm", "16.1cm", "11cm", "1.2cm", "Segoe UI", 11, WHITE, opacity="0.70"),
])

# S3 FEATURES — FOREST left column, feature rows right, !!panel → left col
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK}")
batch(DECK, [
    s(3, name="!!panel", preset="rect", fill=FOREST,
      x="0cm", y="0cm", width="12.5cm", height="19.05cm"),
    s(3, preset="ellipse", fill=AMBER, opacity="0.10",
      x="1cm", y="11cm", width="10cm", height="10cm"),
    t(3, "CAPABILITIES", "1.2cm", "1.5cm", "10cm", "0.9cm", "Segoe UI", 10, AMBER),
    s(3, preset="rect", fill=AMBER, x="1.2cm", y="2.8cm", width="4cm", height="0.14cm"),
    t(3, "What We\nBuild.", "1.2cm", "3.3cm", "10cm", "6cm", "Segoe UI Black", 40, WHITE, bold=True),
    t(3, "Full-spectrum design from strategy to production.",
      "1.2cm", "14cm", "10cm", "2.5cm", "Segoe UI", 12, WHITE, opacity="0.65"),
])
feat_ops = []
features = [
    (AMBER,     "01", "Brand Identity",    "Visual systems, logos, guidelines and brand voice for market leaders."),
    (TANGERINE, "02", "Motion & Campaign", "Film, animation and social content that moves audiences to act."),
    (TEAL,      "03", "Product Design",    "End-to-end UX/UI for digital products across web and mobile."),
    (CREAM,     "04", "Print & Space",     "Physical touchpoints: books, packaging and environmental design."),
]
for i, (col, num, heading, body) in enumerate(features):
    y = 1.2 + i * 4.3
    feat_ops += [
        s(3, preset="ellipse", fill=col,
          x="13.5cm", y=f"{y}cm", width="1.8cm", height="1.8cm"),
        t(3, num, "13.5cm", f"{y}cm", "1.8cm", "1.8cm",
          "Segoe UI Black", 11, DARK, bold=True, align="center", valign="c"),
        t(3, heading, "15.8cm", f"{y}cm", "16cm", "1.1cm",
          "Segoe UI Black", 15, WHITE, bold=True),
        t(3, body, "15.8cm", f"{y+1.2}cm", "17cm", "2.2cm",
          "Segoe UI", 11, WHITE, opacity="0.65"),
        s(3, preset="rect", fill=CREAM, opacity="0.12",
          x="13.5cm", y=f"{y+3.2}cm", width="19.5cm", height="0.05cm"),
    ]
batch(DECK, feat_ops)

# S4 TIMELINE — horizontal 4 steps, !!panel → DARK top band
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={CREAM}")
batch(DECK, [
    s(4, name="!!panel", preset="rect", fill=DARK,
      x="0cm", y="0cm", width="33.87cm", height="4.2cm"),
    t(4, "PROCESS  ·  HOW WE WORK", "2cm", "0.5cm", "20cm", "0.9cm", "Segoe UI", 10, CREAM),
    s(4, preset="rect", fill=AMBER, x="2cm", y="1.8cm", width="4cm", height="0.14cm"),
    t(4, "Our Four-Step Process", "2cm", "2.2cm", "22cm", "1.5cm", "Segoe UI Black", 22, AMBER, bold=True),
    s(4, preset="rect", fill=DARK, x="4.5cm", y="9.5cm", width="25cm", height="0.12cm"),
])
step_ops = []
steps = [
    (FOREST,    "01", "DISCOVER",  "Deep research into your audience, market, and competitive landscape to find the real brief."),
    (AMBER,     "02", "DEFINE",    "Strategy, creative direction and measurable success criteria — agreed before a pixel is made."),
    (TANGERINE, "03", "CRAFT",     "Design, copy, motion and production executed at the highest level, on time."),
    (TEAL,      "04", "LAUNCH",    "Delivery, QA, rollout and post-launch optimisation with your team."),
]
for i, (col, num, title, body) in enumerate(steps):
    x = 2.0 + i * 8.0
    step_ops += [
        s(4, preset="ellipse", fill=col, x=f"{x}cm", y="8cm", width="3cm", height="3cm"),
        t(4, num, f"{x}cm", "8cm", "3cm", "3cm",
          "Segoe UI Black", 16, WHITE, bold=True, align="center", valign="c"),
        t(4, title, f"{x}cm", "11.5cm", "7.5cm", "1.1cm", "Segoe UI Black", 12, DARK, bold=True),
        t(4, body, f"{x}cm", "13.0cm", "7.5cm", "5cm", "Segoe UI", 11, DARK, opacity="0.68"),
    ]
batch(DECK, step_ops)

# S5 QUOTE — !!panel = AMBER vertical accent bar, minimal
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={DARK}")
batch(DECK, [
    s(5, name="!!panel", preset="rect", fill=AMBER,
      x="2cm", y="3cm", width="0.9cm", height="12cm"),
    s(5, preset="ellipse", fill=CREAM, opacity="0.04",
      x="16cm", y="2cm", width="18cm", height="18cm"),
    t(5, "CLIENT VOICE", "4cm", "3cm", "22cm", "0.9cm", "Segoe UI", 10, AMBER),
    s(5, preset="rect", fill=AMBER, x="4cm", y="2.7cm", width="4cm", height="0.14cm"),
    t(5, "\u201cWorking with Studio Bauhaus transformed not\njust our brand, but how we understand ourselves.\u201d",
      "4cm", "4cm", "27cm", "7cm", "Segoe UI Black", 30, CREAM, bold=True),
    t(5, "SARA LINDQVIST", "4cm", "12cm", "18cm", "1.1cm", "Segoe UI Black", 14, AMBER, bold=True),
    t(5, "Chief Marketing Officer, Nordvik Group  ·  Oslo, Norway",
      "4cm", "13.3cm", "26cm", "1.1cm", "Segoe UI", 12, CREAM, opacity="0.55"),
    t(5, "Revenue grew 340% in 18 months following the brand relaunch.",
      "4cm", "14.8cm", "26cm", "1cm", "Segoe UI", 11, CREAM, opacity="0.40"),
    # Small Bauhaus decoration right
    s(5, preset="ellipse", fill=FOREST, opacity="0.80",
      x="28cm", y="14cm", width="4cm", height="4cm"),
    s(5, preset="ellipse", fill=AMBER,  opacity="0.80",
      x="29cm", y="15cm", width="4cm", height="4cm"),
])

# S6 PORTFOLIO — FOREST top panel, 3 project cards below, !!panel → wide top
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={CREAM}")
batch(DECK, [
    s(6, name="!!panel", preset="rect", fill=FOREST,
      x="0cm", y="0cm", width="33.87cm", height="7cm"),
    t(6, "PORTFOLIO  ·  SELECTED WORK", "2cm", "1cm", "20cm", "0.9cm", "Segoe UI", 10, AMBER),
    s(6, preset="rect", fill=AMBER, x="2cm", y="2.2cm", width="4cm", height="0.14cm"),
    t(6, "Recent Projects", "2cm", "2.8cm", "22cm", "2cm", "Segoe UI Black", 30, WHITE, bold=True),
    t(6, "A selection of identity, campaign and digital projects 2022 – 2024.",
      "2cm", "5.2cm", "28cm", "1.5cm", "Segoe UI", 13, WHITE, opacity="0.70"),
    s(6, preset="rect", fill=AMBER,     x="2cm",   y="8cm", width="9.5cm", height="9.5cm"),
    t(6, "Nordvik\nGroup",   "2.5cm",  "8.5cm",  "8.5cm", "3cm", "Segoe UI Black", 20, DARK, bold=True),
    t(6, "Brand Identity · 2024", "2.5cm", "11.8cm", "8.5cm", "1.2cm", "Segoe UI", 11, DARK, opacity="0.70"),
    t(6, "Oslo · Stockholm · Berlin", "2.5cm", "13.1cm", "8.5cm", "1cm", "Segoe UI", 10, DARK, opacity="0.55"),
    s(6, preset="rect", fill=TEAL,      x="12.5cm", y="8cm", width="9.5cm", height="9.5cm"),
    t(6, "Volta\nMobility", "13cm",    "8.5cm",  "8.5cm", "3cm", "Segoe UI Black", 20, CREAM, bold=True),
    t(6, "Campaign + Motion · 2023", "13cm", "11.8cm", "8.5cm", "1.2cm", "Segoe UI", 11, CREAM, opacity="0.70"),
    t(6, "Amsterdam · London",        "13cm", "13.1cm", "8.5cm", "1cm", "Segoe UI", 10, CREAM, opacity="0.55"),
    s(6, preset="rect", fill=DARK,     x="23cm",  y="8cm", width="9cm",  height="9.5cm"),
    t(6, "Arktis\nCapital", "23.5cm", "8.5cm",  "8cm",   "3cm", "Segoe UI Black", 20, AMBER, bold=True),
    t(6, "Identity System · 2022",  "23.5cm", "11.8cm", "8cm",  "1.2cm", "Segoe UI", 11, AMBER, opacity="0.70"),
    t(6, "Zurich · Singapore",        "23.5cm", "13.1cm", "8cm",  "1cm",  "Segoe UI", 10, AMBER, opacity="0.55"),
])

# S7 CTA — !!panel fills entire slide in FOREST
print("\n[S7]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={FOREST}")
batch(DECK, [
    s(7, name="!!panel", preset="rect", fill=FOREST,
      x="0cm", y="0cm", width="33.87cm", height="19.05cm"),
    s(7, preset="ellipse", fill=CREAM, opacity="0.05",
      x="18cm", y="1cm", width="16cm", height="16cm"),
    s(7, preset="ellipse", fill=AMBER, opacity="0.10",
      x="22cm", y="5cm", width="10cm", height="10cm"),
    s(7, preset="rect", fill=AMBER, x="2cm", y="2.5cm", width="4cm", height="0.14cm"),
    t(7, "START A PROJECT", "2cm", "1.8cm", "20cm", "0.9cm", "Segoe UI", 10, AMBER),
    t(7, "Let\u2019s Build\nSomething\nGreat.", "2cm", "3.5cm", "24cm", "11cm",
      "Segoe UI Black", 56, CREAM, bold=True),
    t(7, "We take 12 new clients per year.\nApply early to secure your spot.",
      "2cm", "14.5cm", "20cm", "2.5cm", "Segoe UI", 14, CREAM, opacity="0.70"),
    s(7, preset="roundRect", fill=AMBER,
      x="2cm", y="16.2cm", width="12cm", height="2.5cm"),
    t(7, "hello@studio-bauhaus.com  \u2192",
      "2cm", "16.2cm", "12cm", "2.5cm",
      "Segoe UI Black", 13, DARK, bold=True, align="center", valign="c"),
    t(7, "studio-bauhaus.com", "26cm", "18cm", "8cm", "0.9cm",
      "Segoe UI", 9, CREAM, align="right", opacity="0.55"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
