"""
morph-template v19 — Sage Grain / Creative Agency
Ref: PRO.TEAM visual language — image_aionui_1774082207334.png
Techniques: grain noise texture, sparkle cross element, extreme bold title
            with textFill fade, white card panels on dark, small section labels,
            alternating dark-full / white-card / stat-hero layouts
6 slides with morph transitions
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from morph_base import *

DECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude-morph-template-v19.pptx")

SAGE  = "0F1A12"
SAGE2 = "1E2E1A"
MID   = "253020"
LIME  = "B8FF43"
WARM  = "E8D5A0"
WHITE = "FFFFFF"
DIM   = "6A8060"
CARD  = "F2F0E8"   # warm off-white card bg
INK   = "141E10"   # near-black for card text
BG    = f"{SAGE}-{SAGE2}-160"

if os.path.exists(DECK): os.remove(DECK)
print("[Create]"); ocmd("create", DECK)


def grain(slide, n=12):
    """Scattered tiny ellipses — noise/grain effect."""
    pos = [(4.5,2.5,0.8),(11.2,5.8,0.5),(19.4,1.8,0.7),(27.5,7.2,0.6),
           (7.2,13.5,0.4),(25.0,13.2,0.8),(14.5,10.8,0.5),(2.8,9.0,0.6),
           (30.2,3.5,0.5),(1.2,5.5,0.7),(22.0,16.2,0.4),(9.5,17.0,0.5),
           (16.8,3.2,0.6),(28.8,11.5,0.5),(5.5,16.0,0.4)]
    return [s(slide, preset="ellipse", fill=WHITE, opacity="0.04",
              x=f"{x}cm", y=f"{y}cm", width=f"{r}cm", height=f"{r}cm")
            for x, y, r in pos[:n]]


def sparkle(slide, cx, cy, size=1.4, color=None, name=None):
    """4-pointed star via two crossing thin rects."""
    color = color or LIME
    hw, th = size, 0.09
    ops = []
    kw = {"name": name} if name else {}
    ops.append(s(slide, preset="rect", fill=color,
                 x=f"{round(cx - hw/2, 2)}cm", y=f"{round(cy - th/2, 2)}cm",
                 width=f"{hw}cm", height=f"{th}cm", **kw))
    ops.append(s(slide, preset="rect", fill=color,
                 x=f"{round(cx - th/2, 2)}cm", y=f"{round(max(0, cy - hw/2), 2)}cm",
                 width=f"{th}cm", height=f"{hw}cm"))
    return ops


# ═══ S1 HERO — grain + sparkle + textFill fade title ═══
print("\n[S1 Hero]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(1) + sparkle(1, 30.5, 3.5, 2.2, LIME, "!!spark") + [
    # Small section label
    t(1, "программа тренинга  /  CREATIVE STUDIO", "2cm", "2.5cm", "22cm", "0.9cm", "Segoe UI", 10, DIM),
    # Thin horizontal separator
    s(1, preset="rect", fill=LIME, x="2cm", y="3.8cm", width="4cm", height="0.10cm"),
    # Big bold title — textFill fades right into bg
    t(1, "LESS IS MORE.\nMORE IS US.",
      "2cm", "4.5cm", "28cm", "9cm", "Segoe UI Black", 56, WHITE, bold=True,
      textFill=f"{WHITE}-{SAGE}-0"),
    t(1, "We make ideas look inevitable.",
      "2cm", "14cm", "18cm", "2cm", "Segoe UI", 18, WARM),
    t(1, "studio@weareform.co", "2cm", "17.6cm", "14cm", "0.9cm", "Segoe UI", 10, DIM),
    t(1, "@prusakova.design", "24cm", "17.6cm", "8cm", "0.9cm", "Segoe UI", 10, DIM, align="right"),
])

# ═══ S2 PROGRAM BLOCKS — two white cards on dark, stark contrast ═══
print("\n[S2 Blocks]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(2, 8) + sparkle(2, 28.5, 7.5, 1.8, LIME, "!!spark") + [
    t(2, "ОСНОВНЫЕ БЛОКИ  /  CORE MODULES", "2cm", "1.5cm", "22cm", "0.9cm", "Segoe UI", 10, DIM),
    s(2, preset="rect", fill=DIM, x="2cm", y="2.8cm", width="29cm", height="0.06cm"),
    # Card 1
    s(2, preset="rect", fill=CARD,
      x="2cm", y="4cm", width="14.5cm", height="13.5cm"),
    t(2, "БЛОК 1", "2.5cm", "4.5cm", "6cm", "1cm", "Segoe UI Black", 11, INK, bold=True),
    t(2, "ключевые определения\nрамки обучения",
      "2.5cm", "5.8cm", "13cm", "2.5cm", "Segoe UI Black", 16, INK, bold=True),
    t(2, "· Определение переговоров\n· 2 ключевых стиля переговоров\n· Алгоритм подготовки\n· Консультанты рекламного рынка",
      "2.5cm", "8.5cm", "13cm", "8cm", "Segoe UI", 12, INK),
    # Card 2
    s(2, preset="rect", fill=CARD,
      x="17.5cm", y="4cm", width="14.5cm", height="13.5cm"),
    t(2, "БЛОК 2", "18cm", "4.5cm", "6cm", "1cm", "Segoe UI Black", 11, INK, bold=True),
    t(2, "процесс переговоров\nс монополистами",
      "18cm", "5.8cm", "13cm", "2.5cm", "Segoe UI Black", 16, INK, bold=True),
    t(2, "· Анализ понятия «силы» в переговорах\n· Особенности сделок без альтернатив\n· Инструменты активного слушания\n· Рефрейминг",
      "18cm", "8.5cm", "13cm", "8cm", "Segoe UI", 12, INK),
])

# ═══ S3 STAT HERO — single giant number, pure minimal ═══
print("\n[S3 Stat]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(3, 10) + sparkle(3, 3.5, 4.0, 1.6, LIME, "!!spark") + [
    s(3, preset="rect", fill=DIM, x="2cm", y="2.8cm", width="29cm", height="0.06cm"),
    t(3, "РЕЗУЛЬТАТ  /  IMPACT", "2cm", "1.8cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    # Huge stat — textFill from LIME to SAGE (fades into background)
    t(3, "6\u00d7",
      "1cm", "3.5cm", "32cm", "12cm", "Segoe UI Black", 200, LIME, bold=True,
      textFill=f"{LIME}-{SAGE}-0"),
    t(3, "faster deal closing for\nagencies using our frameworks",
      "2cm", "15cm", "20cm", "3cm", "Segoe UI Black", 20, WARM, bold=True),
    t(3, "Across 340+ studios tracked in 2024.",
      "2cm", "17.5cm", "16cm", "1cm", "Segoe UI", 11, DIM),
])

# ═══ S4 SERVICES GRID — 3×2 grid of service boxes, sparkle bullets ═══
print("\n[S4 Grid]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
grid_ops = []
services = ["Brand\nStrategy", "Visual\nIdentity", "Motion\nDesign",
            "Pitch\nDecks", "Campaign\nSystems", "Editorial\nDesign"]
for i, svc in enumerate(services):
    col, row = i % 3, i // 3
    x = 2.0 + col * 10.8
    y = 5.0 + row * 6.5
    grid_ops.append(s(4, preset="roundRect", fill=MID,
                      x=f"{x}cm", y=f"{y}cm", width="10cm", height="5.8cm"))
    grid_ops += sparkle(4, x + 0.8, y + 0.8, 0.9, LIME)
    grid_ops.append(t(4, svc, f"{x+0.4}cm", f"{y+2.0}cm", "9cm", "3cm",
                      "Segoe UI Black", 16, WHITE, bold=True))
batch(DECK, grain(4, 8) + [s(4, name="!!spark", preset="rect", fill=SAGE,
      x="30cm", y="1cm", width="0.1cm", height="0.1cm")] + grid_ops + [
    t(4, "SERVICES", "2cm", "1.8cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    s(4, preset="rect", fill=DIM, x="2cm", y="2.8cm", width="29cm", height="0.06cm"),
    t(4, "What We Do",
      "2cm", "3.2cm", "16cm", "1.8cm", "Segoe UI Black", 22, WHITE, bold=True),
])

# ═══ S5 PROCESS — horizontal timeline with sparkle nodes ═══
print("\n[S5 Process]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
steps = [("01\nDISCOVER", "Brand audit,\nstakeholder mapping,\nmarket positioning."),
         ("02\nCREATE",    "Visual concept,\nprototype decks,\nclient reviews."),
         ("03\nDELIVER",   "Final system,\nasset library,\nlaunch support.")]
step_ops = []
for i, (title, body) in enumerate(steps):
    x = 2.0 + i * 10.8
    step_ops += sparkle(5, x + 0.6, 9.5, 1.4, LIME if i != 1 else WARM,
                        "!!spark" if i == 0 else None)
    step_ops.append(s(5, preset="roundRect", fill=MID,
                      x=f"{x}cm", y=f"{11}cm", width="10cm", height="6.8cm"))
    step_ops.append(t(5, title, f"{x+0.5}cm", "11.5cm", "9cm", "2cm",
                      "Segoe UI Black", 14, LIME if i != 1 else WARM, bold=True))
    step_ops.append(t(5, body, f"{x+0.5}cm", "13.8cm", "9cm", "3.5cm",
                      "Segoe UI", 11, DIM))
# Connecting timeline line
batch(DECK, grain(5, 8) + step_ops + [
    s(5, preset="rect", fill=DIM, x="2cm", y="9.58cm", width="29cm", height="0.06cm"),
    t(5, "PROCESS", "2cm", "1.8cm", "16cm", "0.9cm", "Segoe UI", 10, DIM),
    s(5, preset="rect", fill=DIM, x="2cm", y="2.8cm", width="29cm", height="0.06cm"),
    t(5, "How We Work",
      "2cm", "3.2cm", "22cm", "3cm", "Segoe UI Black", 36, WHITE, bold=True,
      textFill=f"{WHITE}-{SAGE}-0"),
])

# ═══ S6 CTA — LIME top strip, big white text below ═══
print("\n[S6 CTA]")
ocmd("add", DECK, "/", "--type", "slide", "--prop", "layout=blank", "--prop", f"background={BG}")
batch(DECK, grain(6, 10) + sparkle(6, 30.5, 14.5, 2.0, LIME, "!!spark") + [
    # LIME full-width top strip
    s(6, preset="rect", fill=LIME, gradient=f"{LIME}-{SAGE2}-0",
      x="0cm", y="0cm", width="33.87cm", height="3.5cm"),
    t(6, "WE ARE FORM / CREATIVE STUDIO",
      "2cm", "1cm", "24cm", "1.5cm", "Segoe UI Black", 14, SAGE, bold=True),
    s(6, preset="rect", fill=DIM, x="2cm", y="5.5cm", width="29cm", height="0.06cm"),
    t(6, "Ready to make\nyour idea inevitable?",
      "2cm", "4cm", "26cm", "8cm", "Segoe UI Black", 48, WHITE, bold=True),
    t(6, "We take 4 projects per quarter.\nSpots for Q3 2024 are open.",
      "2cm", "13cm", "20cm", "3.5cm", "Segoe UI", 16, WARM),
    s(6, preset="roundRect", fill=LIME,
      x="2cm", y="16cm", width="10cm", height="2.5cm"),
    t(6, "Let\u2019s Talk \u2192",
      "2cm", "16cm", "10cm", "2.5cm",
      "Segoe UI Black", 14, SAGE, bold=True, align="center", valign="c"),
    t(6, "@prusakova.design", "26cm", "17.5cm", "6cm", "1cm", "Segoe UI", 10, DIM, align="right"),
])

print("\n[Morph]")
batch(DECK, [{"command": "set", "path": f"/slide[{i}]", "props": {"transition": "morph"}}
             for i in range(2, 7)])
validate_and_outline(DECK)
print("\nDone \u2192", DECK)
