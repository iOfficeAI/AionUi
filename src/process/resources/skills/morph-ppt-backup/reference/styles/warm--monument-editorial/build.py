"""
morph-template v28 — Monument Editorial
Palette: warm PAPER bg, CLAY ink, single TERRACOTTA — zero gradients, pure typography
Bold morph: !!block (terracotta filled rect) SHAPE-SHIFTS between slides —
  thin left strip → top band → right half panel → thin bottom strip → center square → full-slide CTA
6 slides — structural re-use: architecture / luxury / editorial / studio brand
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v28.pptx")
PAPER = "F0EBE0"   # warm cream
CLAY  = "1A1410"   # near-black warm ink
TERRA = "C85030"   # terracotta
RUST  = "8B2E10"   # dark terracotta
LGRAY = "B0A898"   # warm light gray
MGRAY = "6A5E52"   # warm mid gray

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)

# S1 HERO — !!block: thin left vertical strip
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PAPER}")
batch(DECK, [
    s(1, name="!!block", preset="rect", fill=TERRA,
      x="0cm", y="0cm", width="1.5cm", height="19.05cm"),
    # Ghost large structure character
    t(1, "I", "16cm", "0cm", "18cm", "18cm", "Segoe UI Black", 240, LGRAY, bold=True, opacity="0.25"),
    t(1, "KESTER\nSTUDIO", "3cm", "3.5cm", "24cm", "10cm", "Segoe UI Black", 72, CLAY, bold=True),
    t(1, "Architecture  /  Interior  /  Identity", "3cm", "14.5cm", "22cm", "1.2cm", "Segoe UI", 12, MGRAY),
    t(1, "Tokyo  \u00b7  Melbourne  \u00b7  Est. 2011",
      "3cm", "17.5cm", "20cm", "1cm", "Segoe UI", 10, LGRAY),
])

# S2 PHILOSOPHY — !!block: top horizontal band
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PAPER}")
batch(DECK, [
    s(2, name="!!block", preset="rect", fill=TERRA,
      x="0cm", y="0cm", width="33.87cm", height="2.5cm"),
    t(2, "PHILOSOPHY", "2cm", "0.4cm", "20cm", "1cm", "Segoe UI", 10, PAPER),
    t(2, "Space is not\nbuilt, it is\nrevealed.", "2cm", "4.5cm", "28cm", "11cm", "Segoe UI Black", 64, CLAY, bold=True),
    t(2, "We begin with what already exists \u2014 the light,\nthe land, the lived experience \u2014 and remove\neverything that does not belong.",
      "2cm", "15.5cm", "28cm", "3cm", "Segoe UI", 14, MGRAY),
])

# S3 PORTFOLIO — !!block: right half panel (vertical split)
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PAPER}")
batch(DECK, [
    s(3, name="!!block", preset="rect", fill=TERRA,
      x="17cm", y="0cm", width="16.87cm", height="19.05cm"),
    t(3, "SELECTED\nWORK", "2cm", "3cm", "13cm", "6cm", "Segoe UI Black", 40, CLAY, bold=True),
    t(3, "PORTFOLIO", "2cm", "2.2cm", "12cm", "1cm", "Segoe UI", 10, MGRAY),
    s(3, preset="rect", fill=CLAY, x="2cm", y="2cm", width="3cm", height="0.10cm"),
    t(3, "Togashi House\n2024", "2cm", "10cm", "13cm", "2cm", "Segoe UI", 12, CLAY),
    s(3, preset="rect", fill=LGRAY, x="2cm", y="9.5cm", width="13cm", height="0.05cm"),
    t(3, "Nishi Hotel\n2023", "2cm", "12.5cm", "13cm", "2cm", "Segoe UI", 12, CLAY),
    s(3, preset="rect", fill=LGRAY, x="2cm", y="12cm", width="13cm", height="0.05cm"),
    t(3, "Lane Cove Residence\n2022", "2cm", "14.5cm", "13cm", "2cm", "Segoe UI", 12, CLAY),
    s(3, preset="rect", fill=LGRAY, x="2cm", y="14cm", width="13cm", height="0.05cm"),
    # Right panel text
    t(3, "40+\nProjects", "18.5cm", "5cm", "14cm", "8cm", "Segoe UI Black", 44, PAPER, bold=True),
    t(3, "Three continents.\nFive award wins.", "18.5cm", "13.5cm", "14cm", "4cm", "Segoe UI", 14, PAPER, opacity="0.7"),
])

# S4 PROCESS — !!block: thin bottom strip
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PAPER}")
batch(DECK, [
    s(4, name="!!block", preset="rect", fill=TERRA,
      x="0cm", y="16.55cm", width="33.87cm", height="2.5cm"),
    t(4, "PROCESS", "2cm", "0.5cm", "20cm", "1cm", "Segoe UI", 10, MGRAY),
    s(4, preset="rect", fill=TERRA, x="2cm", y="1.8cm", width="3cm", height="0.10cm"),
    t(4, "Listen.\nObserve.\nBuild.", "2cm", "2.5cm", "22cm", "11cm", "Segoe UI Black", 64, CLAY, bold=True),
    # Process steps in bottom strip
    t(4, "LISTEN", "2cm",   "16.8cm", "7cm", "1cm", "Segoe UI Black", 11, PAPER, bold=True),
    t(4, "OBSERVE","10cm",  "16.8cm", "7cm", "1cm", "Segoe UI Black", 11, PAPER, bold=True),
    t(4, "DESIGN", "18cm",  "16.8cm", "7cm", "1cm", "Segoe UI Black", 11, PAPER, bold=True),
    t(4, "BUILD",  "25.5cm","16.8cm", "7cm", "1cm", "Segoe UI Black", 11, PAPER, bold=True),
])

# S5 AWARDS — !!block: centered square island
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PAPER}")
batch(DECK, [
    s(5, name="!!block", preset="rect", fill=TERRA,
      x="10.93cm", y="3.52cm", width="12cm", height="12cm"),
    t(5, "AWARDS", "2cm", "0.5cm", "20cm", "1cm", "Segoe UI", 10, MGRAY),
    t(5, "15", "12cm", "4.5cm", "10cm", "8cm", "Segoe UI Black", 100, PAPER, bold=True),
    t(5, "Awards\n& Honours", "12.5cm", "12cm", "10cm", "3cm", "Segoe UI", 14, PAPER),
    # Left column awards list
    t(5, "AR House Awards\nGold  \u00b7  2024", "2cm", "5cm", "8cm", "2cm", "Segoe UI", 11, CLAY),
    s(5, preset="rect", fill=LGRAY, x="2cm", y="7.3cm", width="8cm", height="0.05cm"),
    t(5, "World Architecture\nFestival  \u00b7  2023",  "2cm", "7.7cm", "8cm", "2cm", "Segoe UI", 11, CLAY),
    s(5, preset="rect", fill=LGRAY, x="2cm", y="10.1cm", width="8cm", height="0.05cm"),
    t(5, "Wallpaper* Design\nAwards  \u00b7  2022", "2cm", "10.5cm", "8cm", "2cm", "Segoe UI", 11, CLAY),
    t(5, "kesterstudio.com", "2cm", "17.5cm", "12cm", "1cm", "Segoe UI", 10, LGRAY),
])

# S6 CTA — !!block fills entire slide → total terracotta
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={PAPER}")
batch(DECK, [
    s(6, name="!!block", preset="rect", fill=TERRA,
      x="0cm", y="0cm", width="33.87cm", height="19.05cm"),
    t(6, "Let\u2019s make\nsomething\nlasting.", "2cm", "2cm", "28cm", "13cm", "Segoe UI Black", 64, PAPER, bold=True),
    s(6, preset="rect", fill=PAPER, x="2cm", y="14.8cm", width="14cm", height="0.10cm"),
    t(6, "hello@kesterstudio.com", "2cm", "15.2cm", "22cm", "1.2cm", "Segoe UI Black", 14, PAPER, bold=True),
    t(6, "+81 3 \u00b7 \u00b7 \u00b7 \u00b7  /  +61 2 \u00b7 \u00b7 \u00b7 \u00b7",
      "2cm", "16.5cm", "22cm", "1cm", "Segoe UI", 11, PAPER, opacity="0.6"),
    t(6, "kesterstudio.com", "28cm", "17.8cm", "6cm", "1cm", "Segoe UI", 10, PAPER, align="right", opacity="0.6"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
