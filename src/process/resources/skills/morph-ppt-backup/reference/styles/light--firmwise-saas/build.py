"""
morph-template v6 — Firmwise SaaS / Efficiency
Ref: ref-B-firmwise-saas.png
Style: Light blue-grey bg, electric purple, chamfered-corner cards (cut top-right),
       3-column stat layout, clean minimal SaaS feel
7 slides with morph transitions
"""
import subprocess, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from morph_base import *

DECK = r"D:\github\work\OfficeCli\morph-scripts\claude-morph-template-v6.pptx"

# ── Colors ────────────────────────────────────────────────────
BG    = "F0F2F9"   # light blue-grey
C1    = "5B4FFF"   # electric purple
C2    = "9B8BFF"   # light purple
C3    = "E8E5FF"   # very light purple (card bg)
FG    = "1A1A2E"   # near-black
WHITE = "FFFFFF"
MID   = "6B6B8A"   # medium grey-blue for subtitles

# ── Chamfered card helper ─────────────────────────────────────
def add_chamfer_card(slide, name, x, y, w, h, fill, c=0.7):
    return s(slide, name=name, preset="rect", fill=fill, x=x, y=y, width=w, height=h)

def apply_chamfer(slide, name, w_cm, h_cm, c_cm=0.7):
    raw_geom(DECK, slide, name, chamfer_xml(w_cm, h_cm, c_cm))

# ── Init ──────────────────────────────────────────────────────
if os.path.exists(DECK):
    os.remove(DECK)
print("[Create]")
ocmd("create", DECK)

# ═══════════════════════════════════════════════════════════════
# S1 — HERO  (light bg, big purple headline, 3 chamfered preview cards)
# ═══════════════════════════════════════════════════════════════
print("\n[S1 Hero]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    # Top brand bar
    t(1, "Firmwise", "1.5cm", "0.6cm", "6cm", "1cm", "Segoe UI", 11, MID),
    t(1, "Automation Suite", "14cm", "0.6cm", "10cm", "1cm", "Segoe UI", 11, MID, align="center"),
    t(1, "01", "31cm", "0.6cm", "2cm", "1cm", "Segoe UI", 11, MID, align="right"),
    # Large headline
    t(1, "Work Smarter,\nNot Harder", "1.5cm", "2.5cm", "18cm", "8cm", "Segoe UI Black", 54, FG, bold=True),
    # Sub description
    t(1, "Automate repetitive tasks and free your team\nto focus on what actually matters.",
      "20cm", "3.5cm", "13cm", "4cm", "Segoe UI", 17, MID),
    # 3 chamfered stat cards (morph actor: expand on S3)
    s(1, name="!!card-a", preset="rect", fill=C3,
      x="1.5cm", y="12cm", width="9.5cm", height="5.5cm"),
    s(1, name="!!card-b", preset="rect", fill=C3,
      x="12.2cm", y="12cm", width="9.5cm", height="5.5cm"),
    s(1, name="!!card-c", preset="rect", fill=C1,
      x="22.9cm", y="12cm", width="9.5cm", height="5.5cm",
      gradient=f"{C1}-{C2}-135"),
    # Numbers on cards
    t(1, "99%", "2cm",   "12.5cm", "6cm", "4cm", "Segoe UI Black", 48, C1, bold=True),
    t(1, "40%", "12.7cm","12.5cm", "6cm", "4cm", "Segoe UI Black", 48, C1, bold=True),
    t(1, "80%", "23.4cm","12.5cm", "6cm", "4cm", "Segoe UI Black", 48, WHITE, bold=True),
    t(1, "Data Accuracy",    "2cm",    "15.5cm", "9cm", "1.5cm", "Segoe UI Black", 14, C1, bold=True),
    t(1, "Less Manual Work", "12.7cm", "15.5cm", "9cm", "1.5cm", "Segoe UI Black", 14, C1, bold=True),
    t(1, "Faster Reporting", "23.4cm", "15.5cm", "9cm", "1.5cm", "Segoe UI Black", 14, WHITE, bold=True),
])
apply_chamfer(1, "!!card-a", 9.5, 5.5)
apply_chamfer(1, "!!card-b", 9.5, 5.5)
apply_chamfer(1, "!!card-c", 9.5, 5.5)

# ═══════════════════════════════════════════════════════════════
# S2 — PROBLEM  (same layout, new text → morph S1→S2 = content swap)
# ═══════════════════════════════════════════════════════════════
print("\n[S2 Problem]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    t(2, "Firmwise", "1.5cm", "0.6cm", "6cm", "1cm", "Segoe UI", 11, MID),
    t(2, "The Problem", "14cm", "0.6cm", "10cm", "1cm", "Segoe UI", 11, MID, align="center"),
    t(2, "02", "31cm", "0.6cm", "2cm", "1cm", "Segoe UI", 11, MID, align="right"),
    t(2, "Time Is Your\nScarcest Resource",
      "1.5cm", "2.5cm", "18cm", "8cm", "Segoe UI Black", 54, FG, bold=True),
    t(2, "Teams spend 60% of their day on repetitive,\nlow-value administrative tasks.",
      "20cm", "3.5cm", "13cm", "4cm", "Segoe UI", 17, MID),
    # Cards morph in same position
    s(2, name="!!card-a", preset="rect", fill=C3,
      x="1.5cm", y="12cm", width="9.5cm", height="5.5cm"),
    s(2, name="!!card-b", preset="rect", fill=C3,
      x="12.2cm", y="12cm", width="9.5cm", height="5.5cm"),
    s(2, name="!!card-c", preset="rect", fill=C1,
      x="22.9cm", y="12cm", width="9.5cm", height="5.5cm",
      gradient=f"{C1}-{C2}-135"),
    t(2, "60%", "2cm",    "12.5cm", "6cm", "4cm", "Segoe UI Black", 48, C1, bold=True),
    t(2, "3hr", "12.7cm", "12.5cm", "6cm", "4cm", "Segoe UI Black", 48, C1, bold=True),
    t(2, "$2k", "23.4cm", "12.5cm", "6cm", "4cm", "Segoe UI Black", 48, WHITE, bold=True),
    t(2, "On Low-Value Work", "2cm",    "15.5cm", "9cm", "1.5cm", "Segoe UI Black", 14, C1, bold=True),
    t(2, "Daily on Reports",  "12.7cm", "15.5cm", "9cm", "1.5cm", "Segoe UI Black", 14, C1, bold=True),
    t(2, "Wasted Per Employee","23.4cm","15.5cm", "9cm", "1.5cm", "Segoe UI Black", 14, WHITE, bold=True),
])
apply_chamfer(2, "!!card-a", 9.5, 5.5)
apply_chamfer(2, "!!card-b", 9.5, 5.5)
apply_chamfer(2, "!!card-c", 9.5, 5.5)

# ═══════════════════════════════════════════════════════════════
# S3 — FEATURES  (cards move up & expand → hero stat layout)
# ═══════════════════════════════════════════════════════════════
print("\n[S3 Features]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    t(3, "Firmwise", "1.5cm", "0.6cm", "6cm", "1cm", "Segoe UI", 11, MID),
    t(3, "Time Efficiency", "14cm", "0.6cm", "10cm", "1cm", "Segoe UI", 11, MID, align="center"),
    t(3, "03", "31cm", "0.6cm", "2cm", "1cm", "Segoe UI", 11, MID, align="right"),
    # Headline — left
    t(3, "Boost Efficiency by\nAutomating Work",
      "1.5cm", "2cm", "15cm", "5cm", "Segoe UI Black", 36, FG, bold=True),
    t(3, "Save time by eliminating repetitive tasks,\nallowing teams to focus on high-value work.",
      "17cm", "2.5cm", "15cm", "3cm", "Segoe UI", 15, MID),
    # 3 large chamfered cards (expanded)
    s(3, name="!!card-a", preset="rect", fill=C3,
      x="1.5cm", y="7cm", width="9.5cm", height="10.5cm"),
    s(3, name="!!card-b", preset="rect", fill=C3,
      x="12.2cm", y="7cm", width="9.5cm", height="10.5cm"),
    s(3, name="!!card-c", preset="rect", fill=C1,
      x="22.9cm", y="7cm", width="9.5cm", height="10.5cm",
      gradient=f"{C1}-{C2}-135"),
    # Icon badge (roundRect top of each card)
    s(3, preset="roundRect", fill=C2, x="2cm",    y="7.6cm", width="1.8cm", height="1.8cm"),
    s(3, preset="roundRect", fill=C2, x="12.7cm", y="7.6cm", width="1.8cm", height="1.8cm"),
    s(3, preset="roundRect", fill=WHITE, opacity="0.3", x="23.4cm", y="7.6cm", width="1.8cm", height="1.8cm"),
    # Big numbers
    t(3, "99%", "2cm",    "9.8cm", "8cm", "3.5cm", "Segoe UI Black", 56, C1, bold=True),
    t(3, "40%", "12.7cm", "9.8cm", "8cm", "3.5cm", "Segoe UI Black", 56, C1, bold=True),
    t(3, "80%", "23.4cm", "9.8cm", "8cm", "3.5cm", "Segoe UI Black", 56, WHITE, bold=True),
    t(3, "Data Accuracy",    "2cm",    "13.5cm", "9cm", "1.5cm", "Segoe UI Black", 15, C1, bold=True),
    t(3, "Less Manual Work", "12.7cm", "13.5cm", "9cm", "1.5cm", "Segoe UI Black", 15, C1, bold=True),
    t(3, "Faster Reporting", "23.4cm", "13.5cm", "9cm", "1.5cm", "Segoe UI Black", 15, WHITE, bold=True),
    t(3, "Minimize errors,\nmaximize precision", "2cm",    "15.2cm", "9cm", "2.5cm", "Segoe UI", 11, MID),
    t(3, "Automate tasks and\nfocus on growth",   "12.7cm", "15.2cm", "9cm", "2.5cm", "Segoe UI", 11, MID),
    t(3, "Generate reports\ninstantly with AI",   "23.4cm", "15.2cm", "9cm", "2.5cm", "Segoe UI", 11, WHITE, opacity="0.8"),
])
apply_chamfer(3, "!!card-a", 9.5, 10.5)
apply_chamfer(3, "!!card-b", 9.5, 10.5)
apply_chamfer(3, "!!card-c", 9.5, 10.5)

# ═══════════════════════════════════════════════════════════════
# S4 — HOW IT WORKS  (3 steps, horizontal flow)
# ═══════════════════════════════════════════════════════════════
print("\n[S4 Process]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    t(4, "Firmwise", "1.5cm", "0.6cm", "6cm", "1cm", "Segoe UI", 11, MID),
    t(4, "How It Works", "14cm", "0.6cm", "10cm", "1cm", "Segoe UI", 11, MID, align="center"),
    t(4, "04", "31cm", "0.6cm", "2cm", "1cm", "Segoe UI", 11, MID, align="right"),
    t(4, "Simple Setup.\nPowerful Results.",
      "1.5cm", "2cm", "30cm", "5cm", "Segoe UI Black", 44, FG, bold=True),
    # Step number circles
    s(4, preset="ellipse", fill=C1, x="1.5cm", y="8.5cm", width="2.5cm", height="2.5cm"),
    s(4, preset="ellipse", fill=C1, x="12.7cm", y="8.5cm", width="2.5cm", height="2.5cm"),
    s(4, preset="ellipse", fill=C1, x="23.9cm", y="8.5cm", width="2.5cm", height="2.5cm"),
    t(4, "1", "1.5cm",  "8.5cm", "2.5cm", "2.5cm", "Segoe UI Black", 18, WHITE, bold=True, align="center", valign="c"),
    t(4, "2", "12.7cm", "8.5cm", "2.5cm", "2.5cm", "Segoe UI Black", 18, WHITE, bold=True, align="center", valign="c"),
    t(4, "3", "23.9cm", "8.5cm", "2.5cm", "2.5cm", "Segoe UI Black", 18, WHITE, bold=True, align="center", valign="c"),
    # Connector lines
    s(4, preset="rect", fill=C2, x="4.2cm",  y="9.6cm", width="8.3cm", height="0.3cm"),
    s(4, preset="rect", fill=C2, x="15.4cm", y="9.6cm", width="8.3cm", height="0.3cm"),
    # Step content
    t(4, "Connect Your Tools",    "1.5cm",  "11.5cm", "9.5cm", "2cm", "Segoe UI Black", 18, FG, bold=True),
    t(4, "Set Your Workflows",    "12.7cm", "11.5cm", "9.5cm", "2cm", "Segoe UI Black", 18, FG, bold=True),
    t(4, "Watch It Run",          "23.9cm", "11.5cm", "9.5cm", "2cm", "Segoe UI Black", 18, FG, bold=True),
    t(4, "Integrate in minutes with 200+ tools including Slack, Salesforce, and QuickBooks.",
      "1.5cm",  "13.5cm", "9.5cm", "4cm", "Segoe UI", 13, MID),
    t(4, "Define rules once. Firmwise handles exceptions, approvals, and edge cases automatically.",
      "12.7cm", "13.5cm", "9.5cm", "4cm", "Segoe UI", 13, MID),
    t(4, "Monitor in real-time. Get alerts, reports, and insights without lifting a finger.",
      "23.9cm", "13.5cm", "9.5cm", "4cm", "Segoe UI", 13, MID),
])

# ═══════════════════════════════════════════════════════════════
# S5 — EVIDENCE  (big purple number, quote)
# ═══════════════════════════════════════════════════════════════
print("\n[S5 Evidence]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    t(5, "Firmwise", "1.5cm", "0.6cm", "6cm", "1cm", "Segoe UI", 11, MID),
    t(5, "Results", "14cm", "0.6cm", "10cm", "1cm", "Segoe UI", 11, MID, align="center"),
    t(5, "05", "31cm", "0.6cm", "2cm", "1cm", "Segoe UI", 11, MID, align="right"),
    # Giant number
    s(5, name="!!card-c", preset="ellipse", fill=C1,
      x="16cm", y="2cm", width="17cm", height="17cm", opacity="0.08"),
    t(5, "10x", "1cm", "2cm", "25cm", "13cm", "Segoe UI Black", 180, C1, bold=True),
    t(5, "Return on investment\nwithin 90 days", "1.5cm", "14.5cm", "18cm", "3cm", "Segoe UI Black", 26, FG, bold=True),
    t(5, '"Firmwise cut our monthly close from 5 days to half a day.\nI don\'t know how we managed without it."',
      "19cm", "6cm", "14cm", "6cm", "Segoe UI", 16, MID),
    t(5, "— Sarah K., CFO at Meridian Group", "19cm", "12cm", "14cm", "2cm", "Segoe UI", 13, C1),
    s(5, preset="rect", fill=C1, x="0cm", y="17.8cm", width="18cm", height="1.25cm"),
])

# ═══════════════════════════════════════════════════════════════
# S6 — COMPARISON  (chamfered cards back, 2-up layout)
# ═══════════════════════════════════════════════════════════════
print("\n[S6 Comparison]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, [
    t(6, "Firmwise", "1.5cm", "0.6cm", "6cm", "1cm", "Segoe UI", 11, MID),
    t(6, "vs. Status Quo", "14cm", "0.6cm", "10cm", "1cm", "Segoe UI", 11, MID, align="center"),
    t(6, "06", "31cm", "0.6cm", "2cm", "1cm", "Segoe UI", 11, MID, align="right"),
    t(6, "Before vs. After Firmwise",
      "1.5cm", "2cm", "30cm", "4cm", "Segoe UI Black", 40, FG, bold=True),
    # Before card
    s(6, name="!!card-a", preset="rect", fill="F5F5F5",
      x="1.5cm", y="7cm", width="14.5cm", height="10.5cm"),
    # After card
    s(6, name="!!card-b", preset="rect", fill=C3,
      x="17.2cm", y="7cm", width="14.5cm", height="10.5cm"),
    t(6, "Before", "2.5cm",  "7.8cm", "12cm", "2cm", "Segoe UI Black", 20, MID, bold=True),
    t(6, "After",  "18.2cm", "7.8cm", "12cm", "2cm", "Segoe UI Black", 20, C1, bold=True),
    t(6, "• Manual data entry\n• Weekly report takes 3 hours\n• Errors caught after the fact\n• Team overwhelmed with admin",
      "2.5cm",  "10cm", "12cm", "6.5cm", "Segoe UI", 15, MID),
    t(6, "• Automated data sync\n• Real-time dashboards\n• AI flags anomalies instantly\n• Team focused on strategy",
      "18.2cm", "10cm", "12cm", "6.5cm", "Segoe UI", 15, C1),
])
apply_chamfer(6, "!!card-a", 14.5, 10.5)
apply_chamfer(6, "!!card-b", 14.5, 10.5)

# ═══════════════════════════════════════════════════════════════
# S7 — CTA  (purple hero, chamfered card accent bottom)
# ═══════════════════════════════════════════════════════════════
print("\n[S7 CTA]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={C1}",)
batch(DECK, [
    # Ghost circle
    s(7, name="!!card-c", preset="ellipse", fill=WHITE,
      x="20cm", y="0cm", width="18cm", height="18cm", opacity="0.08"),
    s(7, preset="ellipse", fill=C2, x="0cm", y="12cm", width="12cm", height="12cm", opacity="0.15"),
    t(7, "Ready to Reclaim\nYour Team's Time?",
      "2cm", "3cm", "26cm", "8cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(7, "Start your free trial — no credit card required.",
      "2cm", "11cm", "22cm", "3cm", "Segoe UI", 22, C3),
    # CTA button shape
    s(7, preset="roundRect", fill=WHITE, x="2cm", y="14.5cm", width="10cm", height="2.5cm"),
    t(7, "Start Free Trial →",
      "2cm", "14.5cm", "10cm", "2.5cm", "Segoe UI Black", 16, C1, bold=True, align="center", valign="c"),
    t(7, "Firmwise", "1.5cm", "17.8cm", "6cm", "1cm", "Segoe UI", 11, C3),
    t(7, "07", "31cm", "17.8cm", "2cm", "1cm", "Segoe UI", 11, C3, align="right"),
])

# ── Morph transitions ─────────────────────────────────────────
print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])

validate_and_outline(DECK)
print("\nDone →", DECK)
