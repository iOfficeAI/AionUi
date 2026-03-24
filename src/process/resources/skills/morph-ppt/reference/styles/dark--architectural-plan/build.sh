#!/bin/bash
set +H
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
F="$SCRIPT_DIR/dark__architectural_plan.pptx"

# ── Design Tokens ──────────────────────────────────────────
WHITE="FFFFFF"
DARK="18293B"          # deep navy
PANEL="B5D5E3"         # cool blue panel
IMG1="4F92B0"          # image placeholder (saturated blue)
YELLOW="F0BE3C"        # warm gold
YLW_LT="FEF0C0"       # light yellow circle bg
GRAY="4A5B68"          # body text
LGRAY="8BA0AE"         # captions
CARD="EAF4FA"          # card bg
CARD_B="BDD8E6"        # card border
PILL="E3F1F8"          # pill badge bg
FOOT="DAE9F0"          # footer line

# Slide: 33.87 × 19.05 cm
# Panel width: 13cm (consistent — clean morph)
# RIGHT panel:  x=20.87, w=13
# LEFT  panel:  x=0,     w=13
# RIGHT image:  x=18.5,  y=2.5, w=15, h=14.1  (extends 2.37cm left of panel)
# LEFT  image:  x=0.5,   y=2.5, w=15, h=14.1  (extends 2.5cm right of panel)
# ──────────────────────────────────────────────────────────

a() { officecli add "$F" "$1" --type shape  "${@:2}"; }
c() { officecli add "$F" "$1" --type connector "${@:2}"; }
sl(){ officecli add "$F" /    --type slide   "${@}"; }

echo "Building $F..."
rm -f "$F"
officecli create "$F"

# ── Reusable dot helper (nav dots, current=active) ─────────
dots() {
  local path=$1 cur=$2
  local xs=(14.03 14.83 15.63 16.43 17.23 18.03)
  for i in 1 2 3 4 5 6; do
    local x="${xs[$((i-1))]}"
    local fill; [ "$i" -eq "$cur" ] && fill=$DARK || fill="C8DDED"
    a "$path" --prop preset=ellipse \
      --prop x="${x}cm" --prop y=18.35cm \
      --prop width=0.38cm --prop height=0.38cm \
      --prop fill=$fill --prop line=none
  done
}

# ── Common top-bar for "left content" slides ──────────────
top_left() {
  local path=$1 counter=$2
  a "$path" --prop 'name=!!pill-bg' --prop preset=roundRect \
    --prop x=1cm --prop y=0.42cm --prop width=4.3cm --prop height=0.82cm \
    --prop fill=$PILL --prop line=none
  a "$path" --prop 'name=!!top-label' --prop text="Your Project" \
    --prop x=1.1cm --prop y=0.48cm --prop width=4.1cm --prop height=0.7cm \
    --prop size=9 --prop color=$LGRAY --prop fill=none --prop line=none \
    --prop align=center --prop valign=center
  a "$path" --prop 'name=!!biz-label' --prop text="Business Plan" \
    --prop x=12cm --prop y=0.48cm --prop width=6cm --prop height=0.7cm \
    --prop size=9 --prop color=$LGRAY --prop fill=none --prop line=none --prop align=right
  a "$path" --prop text="$counter / 06" \
    --prop x=29.5cm --prop y=0.48cm --prop width=3.5cm --prop height=0.7cm \
    --prop size=9 --prop bold=true --prop color=$DARK \
    --prop fill=none --prop line=none --prop align=right
  c "$path" --prop 'name=!!top-line' \
    --prop x=1cm --prop y=1.42cm --prop width=18cm --prop height=0cm \
    --prop line=DCE8EF --prop lineWidth=0.5pt
}

# ── Common top-bar for "right content" slides ─────────────
top_right() {
  local path=$1 counter=$2
  a "$path" --prop 'name=!!pill-bg' --prop preset=roundRect \
    --prop x=15.8cm --prop y=0.42cm --prop width=4.3cm --prop height=0.82cm \
    --prop fill=$PILL --prop line=none
  a "$path" --prop 'name=!!top-label' --prop text="Your Project" \
    --prop x=15.9cm --prop y=0.48cm --prop width=4.1cm --prop height=0.7cm \
    --prop size=9 --prop color=$LGRAY --prop fill=none --prop line=none \
    --prop align=center --prop valign=center
  a "$path" --prop 'name=!!biz-label' --prop text="Business Plan" \
    --prop x=21.5cm --prop y=0.48cm --prop width=6cm --prop height=0.7cm \
    --prop size=9 --prop color=$LGRAY --prop fill=none --prop line=none
  a "$path" --prop text="$counter / 06" \
    --prop x=29.5cm --prop y=0.48cm --prop width=3.5cm --prop height=0.7cm \
    --prop size=9 --prop bold=true --prop color=$DARK \
    --prop fill=none --prop line=none --prop align=right
  c "$path" --prop 'name=!!top-line' \
    --prop x=15.8cm --prop y=1.42cm --prop width=17cm --prop height=0cm \
    --prop line=DCE8EF --prop lineWidth=0.5pt
}

# ── Common footer ──────────────────────────────────────────
footer() {
  local path=$1
  c "$path" --prop 'name=!!footer-line' \
    --prop x=1cm --prop y=17.85cm --prop width=31.9cm --prop height=0cm \
    --prop line=$FOOT --prop lineWidth=0.5pt
  a "$path" --prop text="Business Plan  ·  Architecture  ·  2025" \
    --prop x=1cm --prop y=18.08cm --prop width=12cm --prop height=0.65cm \
    --prop size=7.5 --prop color=$LGRAY --prop fill=none --prop line=none
}

# ── Star badge (circle + star icon) ───────────────────────
star_badge() {
  local path=$1 x=$2 y=$3 sz=$4
  a "$path" --prop 'name=!!star-circle' --prop preset=ellipse \
    --prop x="${x}cm" --prop y="${y}cm" \
    --prop width="${sz}cm" --prop height="${sz}cm" \
    --prop fill=$YLW_LT --prop line=none
  a "$path" --prop 'name=!!deco-star' --prop text="✦" \
    --prop x="${x}cm" --prop y="${y}cm" \
    --prop width="${sz}cm" --prop height="${sz}cm" \
    --prop size=26 --prop color=$YELLOW --prop fill=none --prop line=none \
    --prop align=center --prop valign=center
}

# ── Card with left accent bar ──────────────────────────────
card() {
  local path=$1 x=$2 y=$3 w=$4 h=$5 num=$6 title=$7 desc=$8
  a "$path" --prop preset=roundRect \
    --prop x="${x}cm" --prop y="${y}cm" --prop width="${w}cm" --prop height="${h}cm" \
    --prop fill=$CARD --prop line=$CARD_B --prop lineWidth=0.5pt
  a "$path" --prop preset=rect \
    --prop x="${x}cm" --prop y="${y}cm" --prop width=0.28cm --prop height="${h}cm" \
    --prop fill=$YELLOW --prop line=none
  a "$path" --prop text="$num" \
    --prop x="${x}cm" --prop y="${y}cm" --prop width="${w}cm" --prop height=1.1cm \
    --prop size=10 --prop bold=true --prop color=$YELLOW \
    --prop fill=none --prop line=none --prop margin=0.5cm --prop valign=center
  a "$path" --prop text="$title" \
    --prop x="${x}cm" --prop y="$(echo "$y + 1.1" | bc)cm" \
    --prop width="${w}cm" --prop height=0.9cm \
    --prop size=11 --prop bold=true --prop color=$DARK \
    --prop fill=none --prop line=none --prop margin=0.5cm
  a "$path" --prop text="$desc" \
    --prop x="${x}cm" --prop y="$(echo "$y + 2.1" | bc)cm" \
    --prop width="${w}cm" --prop height="$(echo "$h - 2.1" | bc)cm" \
    --prop size=9.5 --prop color=$GRAY \
    --prop fill=none --prop line=none --prop margin=0.5cm --prop lineSpacing=1.4
}


# ============================================================
# SLIDE 1 — TITLE  ·  content LEFT  ·  panel RIGHT
# ============================================================
echo "  S1: Title..."
sl --prop background=$WHITE

# Panel RIGHT (morph anchor)
a '/slide[1]' --prop 'name=!!bg-panel' --prop preset=rect \
  --prop x=20.87cm --prop y=0cm --prop width=13cm --prop height=19.1cm \
  --prop fill=$PANEL --prop line=none

# Image — roundRect, floats LEFT past panel edge (+2.37cm)
a '/slide[1]' --prop 'name=!!hero-img' --prop preset=roundRect \
  --prop text="[ Architecture Image ]" \
  --prop x=18.5cm --prop y=2.5cm --prop width=15cm --prop height=14.1cm \
  --prop fill=$IMG1 --prop line=none \
  --prop color=$WHITE --prop size=13 --prop align=center --prop valign=center

top_left '/slide[1]' "01"
star_badge '/slide[1]' 1.0 3.4 2.3

# Title
a '/slide[1]' --prop text="Architectural\nBusiness Plan" \
  --prop x=3.7cm --prop y=3.1cm --prop width=14.7cm --prop height=5.4cm \
  --prop size=60 --prop bold=true --prop color=$DARK \
  --prop fill=none --prop line=none --prop lineSpacing=1.05

# Yellow accent line below title
c '/slide[1]' --prop 'name=!!title-accent' \
  --prop x=3.7cm --prop y=8.75cm --prop width=6.5cm --prop height=0cm \
  --prop line=$YELLOW --prop lineWidth=2.5pt

# Subtitle
a '/slide[1]' --prop text="Lorem ipsum dolor sit amet, consectetur adipiscing\nelit, sed do eiusmod tempor incididunt ut labore\net dolore magna aliqua. Ut enim ad minim." \
  --prop x=1cm --prop y=9.3cm --prop width=17cm --prop height=3cm \
  --prop size=10.5 --prop color=$GRAY --prop fill=none --prop line=none --prop lineSpacing=1.55

# CTA button (rounded)
a '/slide[1]' --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop text="Get Started  →" \
  --prop x=1cm --prop y=13.3cm --prop width=5.8cm --prop height=1.35cm \
  --prop size=10.5 --prop bold=true --prop color=$WHITE \
  --prop fill=$DARK --prop line=none \
  --prop align=center --prop valign=center

# Stats section
c '/slide[1]' \
  --prop x=7.3cm --prop y=15.4cm --prop width=0cm --prop height=2.3cm \
  --prop line=C8D8E2 --prop lineWidth=0.6pt

a '/slide[1]' --prop 'name=!!stat1-num' --prop text="450+" \
  --prop x=1cm --prop y=15.3cm --prop width=5.5cm --prop height=1.35cm \
  --prop size=38 --prop bold=true --prop color=$DARK --prop fill=none --prop line=none

a '/slide[1]' --prop 'name=!!stat1-lbl' --prop text="Projects Completed" \
  --prop x=1cm --prop y=16.65cm --prop width=5.5cm --prop height=0.8cm \
  --prop size=8.5 --prop color=$LGRAY --prop fill=none --prop line=none

a '/slide[1]' --prop 'name=!!stat2-num' --prop text="230+" \
  --prop x=8cm --prop y=15.3cm --prop width=5cm --prop height=1.35cm \
  --prop size=38 --prop bold=true --prop color=$DARK --prop fill=none --prop line=none

a '/slide[1]' --prop 'name=!!stat2-lbl' --prop text="Awards Won" \
  --prop x=8cm --prop y=16.65cm --prop width=5cm --prop height=0.8cm \
  --prop size=8.5 --prop color=$LGRAY --prop fill=none --prop line=none

footer '/slide[1]'
dots   '/slide[1]' 1


# ============================================================
# SLIDE 2 — OUR SPECIALIZED OFFERINGS  ·  panel LEFT  ·  morph
# ============================================================
echo "  S2: Offerings..."
sl --prop background=$WHITE

a '/slide[2]' --prop 'name=!!bg-panel' --prop preset=rect \
  --prop x=0cm --prop y=0cm --prop width=13cm --prop height=19.1cm \
  --prop fill=$PANEL --prop line=none

a '/slide[2]' --prop 'name=!!hero-img' --prop preset=roundRect \
  --prop text="[ Architecture Image ]" \
  --prop x=0.5cm --prop y=2.5cm --prop width=15cm --prop height=14.1cm \
  --prop fill=$IMG1 --prop line=none \
  --prop color=$WHITE --prop size=13 --prop align=center --prop valign=center

top_right '/slide[2]' "02"
star_badge '/slide[2]' 16.0 2.6 2.0

a '/slide[2]' --prop text="Our Specialized\nOfferings" \
  --prop x=18.2cm --prop y=2.3cm --prop width=14cm --prop height=5.2cm \
  --prop size=50 --prop bold=true --prop color=$DARK \
  --prop fill=none --prop line=none --prop lineSpacing=1.05

c '/slide[2]' --prop 'name=!!title-accent' \
  --prop x=18.2cm --prop y=7.65cm --prop width=5.5cm --prop height=0cm \
  --prop line=$YELLOW --prop lineWidth=2.5pt

a '/slide[2]' --prop text="We bring architectural vision to life through innovative\ndesign, precision engineering and sustainable solutions." \
  --prop x=15.8cm --prop y=8.2cm --prop width=17.2cm --prop height=2.2cm \
  --prop size=10.5 --prop color=$GRAY --prop fill=none --prop line=none --prop lineSpacing=1.55

# 3 cards
card '/slide[2]' 15.8 11.0 5.5 5.8 "01" "Residential Design" "Private homes and luxury villas crafted to perfection."
card '/slide[2]' 21.9 11.0 5.5 5.8 "02" "Commercial Projects" "Offices, retail, and public spaces built for lasting impact."
card '/slide[2]' 28.0 11.0 5.5 5.8 "03" "Urban Planning" "Master planning that shapes communities for generations."

# Stats (morph from S1)
a '/slide[2]' --prop 'name=!!stat1-num' --prop text="450+" \
  --prop x=15.8cm --prop y=17.0cm --prop width=5.5cm --prop height=0.85cm \
  --prop size=22 --prop bold=true --prop color=$DARK --prop fill=none --prop line=none

a '/slide[2]' --prop 'name=!!stat1-lbl' --prop text="Projects Completed" \
  --prop x=15.8cm --prop y=17.85cm --prop width=5.5cm --prop height=0.6cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none

a '/slide[2]' --prop 'name=!!stat2-num' --prop text="230+" \
  --prop x=21.5cm --prop y=17.0cm --prop width=5cm --prop height=0.85cm \
  --prop size=22 --prop bold=true --prop color=$DARK --prop fill=none --prop line=none

a '/slide[2]' --prop 'name=!!stat2-lbl' --prop text="Awards Won" \
  --prop x=21.5cm --prop y=17.85cm --prop width=5cm --prop height=0.6cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none

a '/slide[2]' --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop text="Explore More  →" \
  --prop x=27.5cm --prop y=17.0cm --prop width=5.5cm --prop height=1.35cm \
  --prop size=10 --prop bold=true --prop color=$WHITE \
  --prop fill=$DARK --prop line=none --prop align=center --prop valign=center

footer '/slide[2]'
dots   '/slide[2]' 2


# ============================================================
# SLIDE 3 — VISION & MISSION  ·  content LEFT  ·  panel RIGHT  ·  morph
# ============================================================
echo "  S3: Vision & Mission..."
sl --prop background=$WHITE

a '/slide[3]' --prop 'name=!!bg-panel' --prop preset=rect \
  --prop x=20.87cm --prop y=0cm --prop width=13cm --prop height=19.1cm \
  --prop fill=$PANEL --prop line=none

a '/slide[3]' --prop 'name=!!hero-img' --prop preset=roundRect \
  --prop text="[ Architecture Image ]" \
  --prop x=18.5cm --prop y=2.5cm --prop width=15cm --prop height=14.1cm \
  --prop fill=$IMG1 --prop line=none \
  --prop color=$WHITE --prop size=13 --prop align=center --prop valign=center

top_left '/slide[3]' "03"
star_badge '/slide[3]' 1.0 3.0 2.0

a '/slide[3]' --prop text="Vision & Mission\nStatement" \
  --prop x=3.2cm --prop y=2.7cm --prop width=15cm --prop height=5.2cm \
  --prop size=50 --prop bold=true --prop color=$DARK \
  --prop fill=none --prop line=none --prop lineSpacing=1.05

c '/slide[3]' --prop 'name=!!title-accent' \
  --prop x=3.2cm --prop y=8.0cm --prop width=5.5cm --prop height=0cm \
  --prop line=$YELLOW --prop lineWidth=2.5pt

# Vision block with left accent
a '/slide[3]' --prop preset=rect \
  --prop x=1cm --prop y=8.8cm --prop width=0.28cm --prop height=3.5cm \
  --prop fill=$YELLOW --prop line=none

a '/slide[3]' --prop text="Our Vision" \
  --prop x=1.7cm --prop y=8.8cm --prop width=15cm --prop height=0.9cm \
  --prop size=12 --prop bold=true --prop color=$DARK --prop fill=none --prop line=none

a '/slide[3]' --prop text="To be the leading architectural firm that transforms\nurban landscapes through innovative, sustainable design\nthat inspires communities for generations to come." \
  --prop x=1.7cm --prop y=9.8cm --prop width=16.5cm --prop height=2.5cm \
  --prop size=10.5 --prop color=$GRAY --prop fill=none --prop line=none --prop lineSpacing=1.5

# Mission block with left accent
a '/slide[3]' --prop preset=rect \
  --prop x=1cm --prop y=13.0cm --prop width=0.28cm --prop height=3.5cm \
  --prop fill=$YELLOW --prop line=none

a '/slide[3]' --prop text="Our Mission" \
  --prop x=1.7cm --prop y=13.0cm --prop width=15cm --prop height=0.9cm \
  --prop size=12 --prop bold=true --prop color=$DARK --prop fill=none --prop line=none

a '/slide[3]' --prop text="To deliver exceptional architectural solutions that balance\naesthetics, functionality and sustainability, building\nlasting relationships with clients and communities." \
  --prop x=1.7cm --prop y=14.0cm --prop width=16.5cm --prop height=2.5cm \
  --prop size=10.5 --prop color=$GRAY --prop fill=none --prop line=none --prop lineSpacing=1.5

# Stat highlight
a '/slide[3]' --prop 'name=!!stat-pct' --prop text="25%" \
  --prop x=1cm --prop y=17.0cm --prop width=4cm --prop height=1.3cm \
  --prop size=38 --prop bold=true --prop color=$YELLOW --prop fill=none --prop line=none

a '/slide[3]' --prop text="Annual growth\nin client base" \
  --prop x=5.3cm --prop y=17.15cm --prop width=7cm --prop height=1.2cm \
  --prop size=9 --prop color=$GRAY --prop fill=none --prop line=none

footer '/slide[3]'
dots   '/slide[3]' 3


# ============================================================
# SLIDE 4 — FOUNDATIONS  ·  panel LEFT  ·  morph
# ============================================================
echo "  S4: Foundations..."
sl --prop background=$WHITE

a '/slide[4]' --prop 'name=!!bg-panel' --prop preset=rect \
  --prop x=0cm --prop y=0cm --prop width=13cm --prop height=19.1cm \
  --prop fill=$PANEL --prop line=none

a '/slide[4]' --prop 'name=!!hero-img' --prop preset=roundRect \
  --prop text="[ Architecture Image ]" \
  --prop x=0.5cm --prop y=2.5cm --prop width=15cm --prop height=14.1cm \
  --prop fill=$IMG1 --prop line=none \
  --prop color=$WHITE --prop size=13 --prop align=center --prop valign=center

top_right '/slide[4]' "04"
star_badge '/slide[4]' 16.0 2.6 2.0

a '/slide[4]' --prop text="Foundations of\nOur Business" \
  --prop x=18.2cm --prop y=2.3cm --prop width=14cm --prop height=5.2cm \
  --prop size=50 --prop bold=true --prop color=$DARK \
  --prop fill=none --prop line=none --prop lineSpacing=1.05

c '/slide[4]' --prop 'name=!!title-accent' \
  --prop x=18.2cm --prop y=7.65cm --prop width=5.5cm --prop height=0cm \
  --prop line=$YELLOW --prop lineWidth=2.5pt

a '/slide[4]' --prop text="Our business is built on three core pillars that define\nour approach to every project we take on." \
  --prop x=15.8cm --prop y=8.2cm --prop width=17.2cm --prop height=2cm \
  --prop size=10.5 --prop color=$GRAY --prop fill=none --prop line=none --prop lineSpacing=1.55

# 3 pillar cards (tall)
card '/slide[4]' 15.8 10.7 5.5 6.5 "01" "Innovation" "We constantly push boundaries of design, embracing new technologies and bold materials."
card '/slide[4]' 21.9 10.7 5.5 6.5 "02" "Sustainability" "Environmental responsibility guides every design decision we make for our clients."
card '/slide[4]' 28.0 10.7 5.5 6.5 "03" "Excellence" "We exceed expectations in quality, functionality and aesthetic beauty every time."

# Stat
a '/slide[4]' --prop 'name=!!stat-pct' --prop text="25%" \
  --prop x=15.8cm --prop y=17.5cm --prop width=4cm --prop height=1.3cm \
  --prop size=38 --prop bold=true --prop color=$YELLOW --prop fill=none --prop line=none

a '/slide[4]' --prop text="Average ROI for\nclient investments" \
  --prop x=20.3cm --prop y=17.65cm --prop width=7cm --prop height=1.2cm \
  --prop size=9 --prop color=$GRAY --prop fill=none --prop line=none

footer '/slide[4]'
dots   '/slide[4]' 4


# ============================================================
# SLIDE 5 — DETAILING THE BUSINESS  ·  content LEFT  ·  panel RIGHT  ·  morph
# ============================================================
echo "  S5: Detailing..."
sl --prop background=$WHITE

a '/slide[5]' --prop 'name=!!bg-panel' --prop preset=rect \
  --prop x=20.87cm --prop y=0cm --prop width=13cm --prop height=19.1cm \
  --prop fill=$PANEL --prop line=none

a '/slide[5]' --prop 'name=!!hero-img' --prop preset=roundRect \
  --prop text="[ Architecture Image ]" \
  --prop x=18.5cm --prop y=2.5cm --prop width=15cm --prop height=14.1cm \
  --prop fill=$IMG1 --prop line=none \
  --prop color=$WHITE --prop size=13 --prop align=center --prop valign=center

top_left '/slide[5]' "05"
star_badge '/slide[5]' 1.0 3.0 2.0

a '/slide[5]' --prop text="Detailing the\nBusiness" \
  --prop x=3.2cm --prop y=2.7cm --prop width=15cm --prop height=5.2cm \
  --prop size=50 --prop bold=true --prop color=$DARK \
  --prop fill=none --prop line=none --prop lineSpacing=1.05

c '/slide[5]' --prop 'name=!!title-accent' \
  --prop x=3.2cm --prop y=8.0cm --prop width=5.5cm --prop height=0cm \
  --prop line=$YELLOW --prop lineWidth=2.5pt

a '/slide[5]' --prop text="A comprehensive breakdown of our business model,\noperational strategy and financial projections." \
  --prop x=1cm --prop y=8.5cm --prop width=17.5cm --prop height=2cm \
  --prop size=10.5 --prop color=$GRAY --prop fill=none --prop line=none --prop lineSpacing=1.55

# 3 vertical detail cards (taller, left-side content)
card '/slide[5]' 1.0 11.0 5.3 6.5 "01" "Revenue Model" "• Project fees\n• Retainer services\n• Consultation\n• IP Licensing"
card '/slide[5]' 7.0 11.0 5.3 6.5 "02" "Market Strategy" "• Premium positioning\n• Digital marketing\n• Referral network\n• Awards & PR"
card '/slide[5]' 13.0 11.0 5.3 6.5 "03" "Growth Plan" "• 3 new markets\n• Team expansion\n• Tech investment\n• Global reach"

a '/slide[5]' --prop 'name=!!stat-pct' --prop text="25%" \
  --prop x=1cm --prop y=17.5cm --prop width=4cm --prop height=1.3cm \
  --prop size=38 --prop bold=true --prop color=$YELLOW --prop fill=none --prop line=none

a '/slide[5]' --prop text="Projected annual\nrevenue growth" \
  --prop x=5.3cm --prop y=17.65cm --prop width=7cm --prop height=1.2cm \
  --prop size=9 --prop color=$GRAY --prop fill=none --prop line=none

footer '/slide[5]'
dots   '/slide[5]' 5


# ============================================================
# SLIDE 6 — CLOSING  ·  full dark bg  ·  morph
# ============================================================
echo "  S6: Closing..."
sl --prop background=$DARK

# Full dark panel (morph from right-side panel)
a '/slide[6]' --prop 'name=!!bg-panel' --prop preset=rect \
  --prop x=0cm --prop y=0cm --prop width=33.9cm --prop height=19.1cm \
  --prop fill=$DARK --prop line=none

# Image — right half (roundRect, subtle dark bg)
a '/slide[6]' --prop 'name=!!hero-img' --prop preset=roundRect \
  --prop text="[ Architecture Image ]" \
  --prop x=16.5cm --prop y=2.5cm --prop width=16.9cm --prop height=14.1cm \
  --prop fill=234055 --prop line=none \
  --prop color=3A6070 --prop size=13 --prop align=center --prop valign=center

# Top bar
a '/slide[6]' --prop 'name=!!pill-bg' --prop preset=roundRect \
  --prop x=1cm --prop y=0.42cm --prop width=4.3cm --prop height=0.82cm \
  --prop fill=243545 --prop line=none
a '/slide[6]' --prop 'name=!!top-label' --prop text="Your Project" \
  --prop x=1.1cm --prop y=0.48cm --prop width=4.1cm --prop height=0.7cm \
  --prop size=9 --prop color=4A6878 --prop fill=none --prop line=none \
  --prop align=center --prop valign=center
a '/slide[6]' --prop 'name=!!biz-label' --prop text="Business Plan" \
  --prop x=12cm --prop y=0.48cm --prop width=6cm --prop height=0.7cm \
  --prop size=9 --prop color=4A6878 --prop fill=none --prop line=none --prop align=right
a '/slide[6]' --prop text="06 / 06" \
  --prop x=29.5cm --prop y=0.48cm --prop width=3.5cm --prop height=0.7cm \
  --prop size=9 --prop bold=true --prop color=$YELLOW \
  --prop fill=none --prop line=none --prop align=right
c '/slide[6]' --prop 'name=!!top-line' \
  --prop x=1cm --prop y=1.42cm --prop width=18cm --prop height=0cm \
  --prop line=2A3D4D --prop lineWidth=0.5pt

# Star badge (dark slide version)
a '/slide[6]' --prop 'name=!!star-circle' --prop preset=ellipse \
  --prop x=1cm --prop y=3.8cm --prop width=2.3cm --prop height=2.3cm \
  --prop fill=2A3D4D --prop line=none
a '/slide[6]' --prop 'name=!!deco-star' --prop text="✦" \
  --prop x=1cm --prop y=3.8cm --prop width=2.3cm --prop height=2.3cm \
  --prop size=30 --prop color=$YELLOW --prop fill=none --prop line=none \
  --prop align=center --prop valign=center

# Title
a '/slide[6]' --prop text="Delving Deeper\ninto the\nFoundations" \
  --prop x=3.7cm --prop y=3.5cm --prop width=12cm --prop height=8cm \
  --prop size=54 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.08

c '/slide[6]' --prop 'name=!!title-accent' \
  --prop x=3.7cm --prop y=11.7cm --prop width=6.5cm --prop height=0cm \
  --prop line=$YELLOW --prop lineWidth=2.5pt

a '/slide[6]' --prop text="Explore the full scope of our architectural expertise,\nour proven track record and vision for the future." \
  --prop x=1cm --prop y=12.2cm --prop width=14.5cm --prop height=2.2cm \
  --prop size=10.5 --prop color=$PANEL --prop fill=none --prop line=none --prop lineSpacing=1.55

# CTA button (yellow on dark)
a '/slide[6]' --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop text="View Full Plan  →" \
  --prop x=1cm --prop y=14.8cm --prop width=6.5cm --prop height=1.35cm \
  --prop size=10.5 --prop bold=true --prop color=$DARK \
  --prop fill=$YELLOW --prop line=none \
  --prop align=center --prop valign=center

a '/slide[6]' --prop 'name=!!stat-pct' --prop text="25%" \
  --prop x=1cm --prop y=16.5cm --prop width=4cm --prop height=1.3cm \
  --prop size=38 --prop bold=true --prop color=$YELLOW --prop fill=none --prop line=none

a '/slide[6]' --prop text="Overall Growth Rate" \
  --prop x=5.3cm --prop y=16.65cm --prop width=8cm --prop height=1.2cm \
  --prop size=9 --prop color=$PANEL --prop fill=none --prop line=none

# Footer (dark)
c '/slide[6]' --prop 'name=!!footer-line' \
  --prop x=1cm --prop y=17.85cm --prop width=31.9cm --prop height=0cm \
  --prop line=2A3D4D --prop lineWidth=0.5pt
a '/slide[6]' --prop text="Business Plan  ·  Architecture  ·  2025" \
  --prop x=1cm --prop y=18.08cm --prop width=12cm --prop height=0.65cm \
  --prop size=7.5 --prop color=3A5060 --prop fill=none --prop line=none

dots '/slide[6]' 6

# ============================================================
# Apply Morph transition to slides 2–6
# ============================================================
echo "  Applying morph transitions..."
for i in 2 3 4 5 6; do
  officecli set "$F" "/slide[$i]" --prop transition=morph 2>&1
done

echo ""
echo "✓  Done → $F"
