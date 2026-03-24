"""
morph-template v31 — Mosaic Corporate + Sunset Circle
Ref: Image 3 (Geoprotech) — modular rect grid, large sky→orange gradient circle,
     muted corporate palette, percentage-in-colored-block layout
Techniques: rect mosaic partition, gradient ellipse as hero visual, data blocks with %
Bold morph: !!sun (gradient circle) travels across slides changing size+position
7 slides — re-use: engineering / infrastructure / B2B corporate
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v31.pptx")
NAVY   = "282E3A"; NAVY2  = "1A2030"
ORANGE = "F0980A"; ORANGE2= "C07808"
SKY    = "A8C8DC"; SKY2   = "7AAAC0"
OFFWHT = "F5F2EC"; WARM   = "E8D0A0"
WHITE  = "FFFFFF"; DIM    = "8899AA"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)

SUN_GRAD = f"{SKY}-{ORANGE}-90"   # sky→sunset gradient (top=blue, bottom=orange)

# S1 HERO — left content / right mosaic grid + sunset circle
print("\n[S1]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={OFFWHT}")
batch(DECK, [
    # Left white content panel
    s(1, preset="rect", fill=WHITE, x="0cm", y="0cm", width="13.5cm", height="19.05cm"),
    # Right mosaic blocks
    s(1, preset="rect", fill=NAVY,   x="13.5cm", y="0cm",    width="20.37cm", height="4.5cm"),
    s(1, preset="rect", fill=SKY,    x="13.5cm", y="4.5cm",  width="10.2cm",  height="9.5cm"),
    s(1, preset="rect", fill=ORANGE, x="23.7cm", y="4.5cm",  width="10.17cm", height="4.5cm"),
    s(1, preset="rect", fill=WARM,   x="23.7cm", y="9cm",    width="10.17cm", height="5cm"),
    s(1, preset="rect", fill=NAVY2,  x="13.5cm", y="14cm",   width="20.37cm", height="5.05cm"),
    # !!sun: gradient circle over right mosaic
    s(1, name="!!sun", preset="ellipse", fill=SKY, gradient=SUN_GRAD,
      x="13.5cm", y="3cm", width="12cm", height="12cm"),
    # Small white indicator dot below circle
    s(1, preset="ellipse", fill=WHITE,
      x="18.5cm", y="15.2cm", width="1.5cm", height="1.5cm"),
    # Left content
    t(1, "geoprotech", "2cm", "1.2cm", "10cm", "0.9cm", "Segoe UI Black", 11, NAVY, bold=True),
    s(1, preset="rect", fill=ORANGE, x="2cm", y="2.5cm", width="4cm", height="0.14cm"),
    t(1, "Our Technologies\nYour Solutions.", "2cm", "3cm", "10cm", "6cm",
      "Segoe UI Black", 32, NAVY, bold=True),
    t(1, "Geoprotech is an engineering company specialising in technical services. We combine proven methodology with next-generation tools.",
      "2cm", "9.5cm", "10cm", "4cm", "Segoe UI", 12, NAVY, opacity="0.70"),
    t(1, "Est. 2011  ·  ISO 9001  ·  40+ Countries",
      "2cm", "14.5cm", "10cm", "1cm", "Segoe UI", 10, DIM),
    # Footer stripe
    s(1, preset="rect", fill=WARM, x="0cm", y="18cm", width="13.5cm", height="1.05cm"),
    t(1, "Copyright \u00a9 2024 Geoprotech Technologies Inc.", "0.5cm", "18.1cm", "8cm", "0.8cm", "Segoe UI", 8, NAVY, opacity="0.65"),
    t(1, "geoprotech.com", "10cm", "18.1cm", "3cm", "0.8cm", "Segoe UI", 8, NAVY, align="right", opacity="0.65"),
])

# S2 ABOUT — NAVY bg, !!sun large center-right, content left
print("\n[S2]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={NAVY}")
batch(DECK, [
    s(2, name="!!sun", preset="ellipse", fill=SKY, gradient=SUN_GRAD,
      x="14cm", y="1cm", width="18cm", height="18cm"),
    s(2, preset="ellipse", fill=WHITE, opacity="0.06",
      x="15cm", y="2cm", width="16cm", height="16cm"),
    t(2, "ABOUT  ·  WHO WE ARE", "2cm", "1.5cm", "18cm", "0.9cm", "Segoe UI", 10, ORANGE),
    s(2, preset="rect", fill=ORANGE, x="2cm", y="2.8cm", width="4cm", height="0.14cm"),
    t(2, "Engineering\nAt Scale.", "2cm", "3.5cm", "12cm", "7cm",
      "Segoe UI Black", 40, WHITE, bold=True),
    t(2, "We deliver complex technical solutions for energy, infrastructure, and resources sectors worldwide. From concept to commissioning.",
      "2cm", "11.5cm", "12cm", "4cm", "Segoe UI", 13, SKY, opacity="0.85"),
    s(2, preset="rect", fill=SKY, opacity="0.20",
      x="2cm", y="16cm", width="10cm", height="0.05cm"),
    t(2, "1,200 engineers  ·  40 countries  ·  ISO 9001/14001",
      "2cm", "16.5cm", "14cm", "1cm", "Segoe UI", 10, SKY, opacity="0.65"),
])

# S3 STATS — mosaic 3-column percentage blocks
print("\n[S3]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={OFFWHT}")
batch(DECK, [
    # !!sun: moves to small top-right circle
    s(3, name="!!sun", preset="ellipse", fill=SKY, gradient=SUN_GRAD,
      x="27cm", y="0cm", width="8cm", height="8cm"),
    s(3, preset="rect", fill=NAVY, x="0cm", y="0cm", width="33.87cm", height="3.5cm"),
    t(3, "PERFORMANCE  ·  KEY METRICS  2024", "2cm", "0.5cm", "22cm", "0.9cm", "Segoe UI", 10, SKY),
    t(3, "Our Numbers", "2cm", "1.5cm", "22cm", "1.5cm", "Segoe UI Black", 20, ORANGE, bold=True),
    # 3 metric blocks
    s(3, preset="rect", fill=SKY,    x="2cm",    y="4.5cm", width="9.5cm",  height="13cm"),
    s(3, preset="rect", fill=ORANGE, x="12.5cm", y="4.5cm", width="9.5cm",  height="13cm"),
    s(3, preset="rect", fill=NAVY,   x="23cm",   y="4.5cm", width="9.87cm", height="13cm"),
    # SKY block content
    t(3, "150%", "2.5cm",   "5.2cm", "8.5cm", "4cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(3, "EFFICIENCY\nGAIN",  "2.5cm", "9.2cm", "8.5cm", "1.8cm", "Segoe UI Black", 12, WHITE, bold=True),
    s(3, preset="rect", fill=WHITE, opacity="0.30", x="2.5cm", y="11.2cm", width="8.5cm", height="0.06cm"),
    t(3, "Average improvement across all projects completed in 2024 vs prior methodology.",
      "2.5cm", "11.8cm", "8.5cm", "4cm", "Segoe UI", 11, WHITE, opacity="0.80"),
    # ORANGE block
    t(3, "100%", "13cm",  "5.2cm", "8.5cm", "4cm", "Segoe UI Black", 52, WHITE, bold=True),
    t(3, "QUALITY\nRATING",  "13cm", "9.2cm", "8.5cm", "1.8cm", "Segoe UI Black", 12, WHITE, bold=True),
    s(3, preset="rect", fill=WHITE, opacity="0.30", x="13cm", y="11.2cm", width="8.5cm", height="0.06cm"),
    t(3, "Zero critical defects across 58 major infrastructure commissions this year.",
      "13cm", "11.8cm", "8.5cm", "4cm", "Segoe UI", 11, WHITE, opacity="0.80"),
    # NAVY block
    t(3, "40+",  "23.5cm", "5.2cm", "8.5cm", "4cm", "Segoe UI Black", 52, ORANGE, bold=True),
    t(3, "COUNTRIES\nACTIVE",  "23.5cm", "9.2cm", "8.5cm", "1.8cm", "Segoe UI Black", 12, WHITE, bold=True),
    s(3, preset="rect", fill=WHITE, opacity="0.15", x="23.5cm", y="11.2cm", width="8.5cm", height="0.06cm"),
    t(3, "Operational in 40+ countries with local engineering leadership in each region.",
      "23.5cm", "11.8cm", "8.5cm", "4cm", "Segoe UI", 11, WHITE, opacity="0.65"),
])

# S4 SERVICES — left NAVY strip + right content, !!sun moves to left-center
print("\n[S4]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={OFFWHT}")
batch(DECK, [
    s(4, preset="rect", fill=NAVY, x="0cm", y="0cm", width="10cm", height="19.05cm"),
    s(4, name="!!sun", preset="ellipse", fill=SKY, gradient=SUN_GRAD,
      x="1cm", y="8cm", width="9cm", height="9cm", opacity="0.60"),
    t(4, "SERVICES", "1cm", "1.5cm", "8cm", "0.9cm", "Segoe UI", 10, ORANGE),
    s(4, preset="rect", fill=ORANGE, x="1cm", y="2.8cm", width="3cm", height="0.14cm"),
    t(4, "What\nWe Do", "1cm", "3.5cm", "8cm", "6cm", "Segoe UI Black", 32, WHITE, bold=True),
    t(4, "Right content area", "11cm", "1.5cm", "20cm", "0.9cm", "Segoe UI", 10, DIM),
    s(4, preset="rect", fill=ORANGE, x="11cm", y="2.8cm", width="4cm", height="0.14cm"),
    t(4, "Our Service Lines", "11cm", "3.5cm", "20cm", "2cm", "Segoe UI Black", 28, NAVY, bold=True),
])
svc_ops = []
services = [
    (ORANGE, "Field Engineering",      "On-site technical deployment, commissioning and operations management."),
    (SKY,    "Project Management",     "End-to-end delivery from feasibility through handover to O&M."),
    (NAVY,   "Environmental Services", "Impact assessment, compliance and sustainability reporting."),
    (WARM,   "Training & Competency",  "Bespoke technical training programmes for client operations teams."),
]
for i, (col, heading, body) in enumerate(services):
    y = 6.0 + i * 3.1
    svc_ops += [
        s(4, preset="roundRect", fill=col, x="11cm", y=f"{y}cm", width="0.6cm", height="0.6cm"),
        t(4, heading, "12.2cm", f"{y}cm",      "18cm", "1cm",  "Segoe UI Black", 14, NAVY, bold=True),
        t(4, body,    "12.2cm", f"{y+1.1}cm",  "20cm", "1.5cm","Segoe UI",       11, NAVY, opacity="0.68"),
        s(4, preset="rect", fill=NAVY, opacity="0.15",
          x="11cm", y=f"{y+2.4}cm", width="20cm", height="0.05cm"),
    ]
batch(DECK, svc_ops)

# S5 PROCESS — horizontal timeline, !!sun top-center
print("\n[S5]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={NAVY}")
batch(DECK, [
    s(5, name="!!sun", preset="ellipse", fill=SKY, gradient=SUN_GRAD,
      x="11cm", y="0cm", width="12cm", height="12cm", opacity="0.70"),
    t(5, "PROCESS  ·  HOW WE DELIVER", "2cm", "1.5cm", "20cm", "0.9cm", "Segoe UI", 10, ORANGE),
    s(5, preset="rect", fill=ORANGE, x="2cm", y="2.8cm", width="4cm", height="0.14cm"),
    t(5, "Structured Delivery", "2cm", "3.5cm", "22cm", "2cm", "Segoe UI Black", 28, WHITE, bold=True),
    t(5, "Our 5-phase methodology is proven across 600+ projects in 40 countries.",
      "2cm", "5.8cm", "20cm", "1.5cm", "Segoe UI", 13, SKY, opacity="0.80"),
    # Connector
    s(5, preset="rect", fill=SKY, opacity="0.30",
      x="3.5cm", y="11.8cm", width="27cm", height="0.12cm"),
])
phase_ops = []
phases = [
    (ORANGE, "01", "Assess",     "Feasibility, risk and site characterisation."),
    (SKY,    "02", "Plan",       "Engineering design and programme."),
    (WARM,   "03", "Execute",    "Mobilise, build, test."),
    (ORANGE, "04", "Commission", "Handover, documentation, training."),
    (WHITE,  "05", "Support",    "O&M, monitoring, optimisation."),
]
for i, (col, num, title, body) in enumerate(phases):
    x = 2.0 + i * 6.2
    phase_ops += [
        s(5, preset="ellipse", fill=col, x=f"{x}cm", y="10.5cm", width="2.5cm", height="2.5cm"),
        t(5, num, f"{x}cm", "10.5cm", "2.5cm", "2.5cm",
          "Segoe UI Black", 13, NAVY, bold=True, align="center", valign="c"),
        t(5, title, f"{x}cm", "13.5cm", "5.5cm", "1cm", "Segoe UI Black", 12, WHITE, bold=True),
        t(5, body, f"{x}cm", "14.8cm", "5.5cm", "3cm", "Segoe UI", 10, SKY, opacity="0.75"),
    ]
batch(DECK, phase_ops)

# S6 TECHNOLOGY — split OFFWHT / NAVY, !!sun bottom-left
print("\n[S6]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={OFFWHT}")
batch(DECK, [
    s(6, preset="rect", fill=NAVY, x="17cm", y="0cm", width="16.87cm", height="19.05cm"),
    s(6, name="!!sun", preset="ellipse", fill=SKY, gradient=SUN_GRAD,
      x="0cm", y="9cm", width="14cm", height="14cm", opacity="0.55"),
    t(6, "TECHNOLOGY  ·  OUR ADVANTAGE", "2cm", "1.5cm", "14cm", "0.9cm", "Segoe UI", 10, ORANGE),
    s(6, preset="rect", fill=ORANGE, x="2cm", y="2.8cm", width="4cm", height="0.14cm"),
    t(6, "Built on\nData.", "2cm", "3.5cm", "13cm", "5cm", "Segoe UI Black", 36, NAVY, bold=True),
    t(6, "We combine IoT sensor data, predictive modelling and digital twin technology to optimise performance across every project lifecycle.",
      "2cm", "9.5cm", "14cm", "5cm", "Segoe UI", 13, NAVY, opacity="0.70"),
    # Right panel content
    t(6, "KEY TECH", "18cm", "1.5cm", "14cm", "0.9cm", "Segoe UI", 10, SKY),
    s(6, preset="rect", fill=SKY, x="18cm", y="2.8cm", width="3cm", height="0.12cm"),
    t(6, "Digital\nTwin Platform", "18cm", "3.5cm", "14cm", "3cm", "Segoe UI Black", 24, WHITE, bold=True),
    t(6, "Real-time simulation of field assets, enabling\npredictive maintenance and scenario planning.",
      "18cm", "7cm", "13cm", "3cm", "Segoe UI", 12, SKY, opacity="0.80"),
    s(6, preset="rect", fill=SKY, opacity="0.25",
      x="18cm", y="10.5cm", width="13cm", height="0.06cm"),
    t(6, "IoT Integration",  "18cm", "11.2cm", "13cm", "1cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(6, "2,000+ sensors per site, real-time telemetry.", "18cm", "12.4cm", "13cm", "1cm", "Segoe UI", 11, SKY, opacity="0.75"),
    t(6, "Predictive Analytics", "18cm", "14cm", "13cm", "1cm", "Segoe UI Black", 13, WHITE, bold=True),
    t(6, "ML models trained on 15 years of field data.", "18cm", "15.2cm", "13cm", "1cm", "Segoe UI", 11, SKY, opacity="0.75"),
])

# S7 CTA — !!sun fills right half, white left, clean CTA
print("\n[S7]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={OFFWHT}")
batch(DECK, [
    s(7, name="!!sun", preset="ellipse", fill=SKY, gradient=SUN_GRAD,
      x="16cm", y="0cm", width="18cm", height="19.05cm"),
    s(7, preset="ellipse", fill=WHITE, opacity="0.10",
      x="17cm", y="1cm", width="16cm", height="16cm"),
    t(7, "CONTACT  ·  WORK WITH US", "2cm", "1.5cm", "14cm", "0.9cm", "Segoe UI", 10, ORANGE),
    s(7, preset="rect", fill=ORANGE, x="2cm", y="2.8cm", width="4cm", height="0.14cm"),
    t(7, "Ready to build\nsomething that lasts?", "2cm", "3.5cm", "14cm", "7cm",
      "Segoe UI Black", 36, NAVY, bold=True),
    t(7, "Our team is available for initial project discussions.\nNo obligation — just engineering.",
      "2cm", "11.5cm", "14cm", "3cm", "Segoe UI", 13, NAVY, opacity="0.70"),
    s(7, preset="roundRect", fill=ORANGE,
      x="2cm", y="15.5cm", width="12cm", height="2.5cm"),
    t(7, "enquiries@geoprotech.com  \u2192",
      "2cm", "15.5cm", "12cm", "2.5cm",
      "Segoe UI Black", 12, WHITE, bold=True, align="center", valign="c"),
    t(7, "geoprotech.com", "2cm", "18.1cm", "12cm", "0.8cm", "Segoe UI", 9, DIM),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 8)])
validate_and_outline(DECK)
print("\nDone ->", DECK)
