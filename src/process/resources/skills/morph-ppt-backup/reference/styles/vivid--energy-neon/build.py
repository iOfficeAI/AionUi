"""
morph-template v10 — Energy Neon / Editorial Conference
Ref: ref-F-energy-neon.png
Style: Light grey bg, NEON GREEN large rect blocks, bold black condensed typography,
       multi-column text layout, editorial conference feel
7 slides with morph transitions
"""
import subprocess, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from morph_base import *

DECK = r"D:\github\work\OfficeCli\morph-scripts\claude-morph-template-v10.pptx"

BG    = "E8E8E8"   # light grey
NEON  = "00FF41"   # neon green
BLACK = "111111"
WHITE = "FFFFFF"
MID   = "555555"

if os.path.exists(DECK):
    os.remove(DECK)
print("[Create]")
ocmd("create", DECK)

# ═══════════════════════════════════════════════════════════════
# S1 — OPENING / HERO  (neon left-half block, big title right)
# ═══════════════════════════════════════════════════════════════
print("\n[S1 Opening]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Neon green left block (morph actor — moves/resizes across slides)
    s(1, name="!!neon-block", preset="rect", fill=NEON,
      x="0cm", y="0cm", width="16cm", height="19.05cm"),
    # Right side content
    t(1, "OPENING\nREMARKS",
      "17cm", "2cm", "16cm", "10cm", "Segoe UI Black", 56, BLACK, bold=True),
    t(1, "Peter Žiga\nMinister of Economy\nof the Slovak Republic",
      "17cm", "13cm", "16cm", "4.5cm", "Segoe UI", 16, MID),
    t(1, "#energymanifest2019",
      "17cm", "17.5cm", "16cm", "1.2cm", "Segoe UI", 13, MID),
    t(1, "Energy Manifest Conference",
      "0.5cm", "17.5cm", "15cm", "1.2cm", "Segoe UI", 13, BLACK),
])

# ═══════════════════════════════════════════════════════════════
# S2 — SPEAKERS  (neon small block top-right, 4-col speakers)
# ═══════════════════════════════════════════════════════════════
print("\n[S2 Speakers]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Neon block shifts to top-right corner
    s(2, name="!!neon-block", preset="rect", fill=NEON,
      x="25cm", y="0cm", width="8.87cm", height="8cm"),
    # Horizontal rule
    s(2, preset="rect", fill=BLACK,
      x="1cm", y="4cm", width="32.87cm", height="0.08cm"),
    t(2, "SPEAKERS", "1cm", "1cm", "15cm", "2.5cm", "Segoe UI Black", 32, BLACK, bold=True),
    # 4-column speaker list
    t(2, "Annet Teeisla\nPolicy Officer at\nthe European\nAssociation for\nStorage of Energy",
      "1cm", "5cm", "7cm", "10cm", "Segoe UI", 12, BLACK),
    t(2, "Peter Digoris\nHead of Department\nof Mechatronics and\nAutomatics, University\nof Žilina",
      "9.5cm", "5cm", "7cm", "10cm", "Segoe UI", 12, BLACK),
    t(2, "Andrea Srídová\nPolitician.\nAssociate Professor\nat Pavel Jozef Šafárik\nUniversity",
      "18cm", "5cm", "7cm", "10cm", "Segoe UI", 12, BLACK),
    t(2, "Peter Hegedúc\nManaging Partner of\nSynCo Group's Energy\nDivision",
      "26.5cm", "5cm", "6.5cm", "10cm", "Segoe UI", 12, BLACK),
    # Vertical column dividers
    s(2, preset="rect", fill=MID, x="8.7cm", y="4.5cm",  width="0.06cm", height="13cm"),
    s(2, preset="rect", fill=MID, x="17.2cm", y="4.5cm", width="0.06cm", height="13cm"),
    s(2, preset="rect", fill=MID, x="25.7cm", y="4.5cm", width="0.06cm", height="13cm"),
    t(2, "#energymanifest2019",
      "25cm", "17.5cm", "8cm", "1.2cm", "Segoe UI", 13, BLACK, align="right"),
    t(2, "Energy Manifest Conference",
      "0.5cm", "17.5cm", "16cm", "1.2cm", "Segoe UI", 13, MID),
])

# ═══════════════════════════════════════════════════════════════
# S3 — RESEARCH  (small right-top neon, content left, photo area right)
# ═══════════════════════════════════════════════════════════════
print("\n[S3 Research]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Neon block moves to right half
    s(3, name="!!neon-block", preset="rect", fill=NEON,
      x="17cm", y="0cm", width="16.87cm", height="19.05cm"),
    t(3, "Slovak Battery Alliance Young Research Award",
      "18cm", "1cm", "15cm", "2cm", "Segoe UI", 12, BLACK),
    t(3, "Samuel Fideriák",
      "18cm", "5cm", "15cm", "2cm", "Segoe UI Black", 18, BLACK, bold=True),
    t(3, "Possibilities of recycling of selected\naccumulators from hybrids,\nplug-in hybrids and electric cars.",
      "18cm", "7.5cm", "15cm", "5cm", "Segoe UI", 14, BLACK),
    t(3, "#energymanifest2019",
      "18cm", "17.5cm", "15cm", "1.2cm", "Segoe UI", 13, BLACK, align="right"),
    t(3, "Energy Manifest Conference",
      "0.5cm", "17.5cm", "16cm", "1.2cm", "Segoe UI", 13, MID),
])

# ═══════════════════════════════════════════════════════════════
# S4 — BIG TITLE  (full-width neon bottom strip, massive title)
# ═══════════════════════════════════════════════════════════════
print("\n[S4 BigTitle]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Neon block at bottom half
    s(4, name="!!neon-block", preset="rect", fill=NEON,
      x="0cm", y="10.5cm", width="33.87cm", height="8.55cm"),
    t(4, "ENERGY STORAGE\nSOLUTIONS",
      "0.5cm", "0.5cm", "33cm", "10cm", "Segoe UI Black", 60, BLACK, bold=True),
    t(4, "Energy Manifest Conference",
      "0.5cm", "11.5cm", "20cm", "2cm", "Segoe UI Black", 22, BLACK, bold=True),
    t(4, "#energymanifest2019",
      "20cm", "11.5cm", "13cm", "2cm", "Segoe UI", 16, BLACK, align="right"),
    t(4, "Redefining the future of energy storage\nthrough innovation, policy, and research.",
      "0.5cm", "14cm", "33cm", "4cm", "Segoe UI", 18, BLACK),
])

# ═══════════════════════════════════════════════════════════════
# S5 — BREAK  (neon left block, bold simple text)
# ═══════════════════════════════════════════════════════════════
print("\n[S5 Break]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    s(5, name="!!neon-block", preset="rect", fill=NEON,
      x="0cm", y="0cm", width="20cm", height="19.05cm"),
    t(5, "COFFEE BREAK\n& SNACK",
      "0.5cm", "3cm", "19cm", "10cm", "Segoe UI Black", 52, BLACK, bold=True),
    t(5, "Energy Manifest Conference",
      "0.5cm", "17.5cm", "16cm", "1.2cm", "Segoe UI", 13, BLACK),
    t(5, "#energymanifest2019",
      "21cm", "17.5cm", "12cm", "1.2cm", "Segoe UI", 13, BLACK, align="right"),
    t(5, "15 minutes",
      "21.5cm", "8cm", "11cm", "3cm", "Segoe UI Black", 28, MID, bold=True),
    t(5, "Networking area:\nGround floor lobby",
      "21.5cm", "12cm", "11cm", "4cm", "Segoe UI", 16, MID),
])

# ═══════════════════════════════════════════════════════════════
# S6 — POLICY GRID  (4-column text, small neon header)
# ═══════════════════════════════════════════════════════════════
print("\n[S6 Policy]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Neon header strip
    s(6, name="!!neon-block", preset="rect", fill=NEON,
      x="0cm", y="0cm", width="33.87cm", height="3.5cm"),
    # 4 column headers (on neon)
    t(6, "ELECTROMOBILITY\nLEGISLATION UPGRADE",
      "0.5cm", "0.3cm", "7.5cm", "2.8cm", "Segoe UI Black", 10, BLACK, bold=True),
    t(6, "ENERGY STORAGE\nREGULATION ADJUSTMENTS",
      "9cm",   "0.3cm", "7.5cm", "2.8cm", "Segoe UI Black", 10, BLACK, bold=True),
    t(6, "ACADEMIC\nRESEARCH",
      "17.5cm", "0.3cm", "7.5cm", "2.8cm", "Segoe UI Black", 10, BLACK, bold=True),
    t(6, "GOVERNMENT\nSUPPORT",
      "26cm",  "0.3cm", "7.5cm", "2.8cm", "Segoe UI Black", 10, BLACK, bold=True),
    # Dividers
    s(6, preset="rect", fill=BLACK, x="8.2cm",  y="0cm", width="0.06cm", height="19.05cm"),
    s(6, preset="rect", fill=BLACK, x="16.7cm", y="0cm", width="0.06cm", height="19.05cm"),
    s(6, preset="rect", fill=BLACK, x="25.2cm", y="0cm", width="0.06cm", height="19.05cm"),
    # Column body text
    t(6, "It is inevitable to speed up the introduction of electric cars and the formation of such legislative environment that would enable the introduction of an adequate charging station infrastructure in Slovakia.",
      "0.5cm",  "4.5cm", "7.5cm", "13cm", "Segoe UI", 11, BLACK),
    t(6, "It is inevitable to adjust the legislation of electric cars and the transfer of battery innovations to ensure electric energy storage regulation adjustments.",
      "9cm",    "4.5cm", "7.5cm", "13cm", "Segoe UI", 11, BLACK),
    t(6, "It is inevitable to support the interdisciplinary research and the transfer of battery innovations from abroad, and to prepare an academic programme for the systematic education of professionals for the entire battery value chain.",
      "17.5cm", "4.5cm", "7.5cm", "13cm", "Segoe UI", 11, BLACK),
    t(6, "It is inevitable to acquire the support of the Slovak Government, among others, for financing the projects of the Slovak battery ecosystem in order to establish the production of batteries.",
      "26cm",   "4.5cm", "7.5cm", "13cm", "Segoe UI", 11, BLACK),
])

# ═══════════════════════════════════════════════════════════════
# S7 — CLOSING  (neon full coverage with black text)
# ═══════════════════════════════════════════════════════════════
print("\n[S7 Closing]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={NEON}")
batch(DECK, [
    s(7, name="!!neon-block", preset="rect", fill=NEON,
      x="0cm", y="0cm", width="33.87cm", height="19.05cm"),
    t(7, "THANK YOU",
      "1cm", "2cm", "32cm", "10cm", "Segoe UI Black", 80, BLACK, bold=True),
    t(7, "Energy Manifest Conference 2019",
      "1cm", "13cm", "25cm", "3cm", "Segoe UI Black", 24, BLACK, bold=True),
    t(7, "energymanifest.sk",
      "1cm", "16.5cm", "16cm", "2cm", "Segoe UI", 18, BLACK),
    t(7, "#energymanifest2019",
      "18cm", "16.5cm", "15cm", "2cm", "Segoe UI", 18, BLACK, align="right"),
    s(7, preset="rect", fill=BLACK,
      x="1cm", y="12.5cm", width="31.87cm", height="0.1cm"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])

validate_and_outline(DECK)
print("\nDone →", DECK)
