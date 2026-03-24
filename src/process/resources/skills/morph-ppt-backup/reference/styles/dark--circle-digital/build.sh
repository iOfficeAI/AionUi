#!/bin/bash
set +H
set -e

CWD="/Users/visher/Library/Application Support/AionUI/aionui/claude-temp-1773991108310"
F="$CWD/digital_agency.pptx"

# ── Design Tokens ──────────────────────────────────────────
BG="0D0E11"       # near-black
D2="171A20"       # card dark
D3="22252E"       # medium dark
D4="2D3140"       # lighter dark
GREEN="C4FF00"    # neon lime
GREEN_D="8AAF00"  # dim green
WHITE="FFFFFF"
LGRAY="6A7888"    # muted text
MGRAY="3C404C"    # medium elements
# Image placeholder colors
C_LEAF="1F6B38"   # tropical leaf green
C_ART="7A2055"    # colorful abstract/pink
C_TEAL="1A6070"   # teal/ocean
C_PURP="42257A"   # purple abstract
C_WARM="7A4018"   # warm/sunset/orange
C_SKY="1A3870"    # sky blue
C_ROOM="2A3540"   # interior/room
C_PERS="4A5560"   # person portrait

a()  { officecli add "$F" "$1" --type shape     "${@:2}"; }
c()  { officecli add "$F" "$1" --type connector "${@:2}"; }
sl() { officecli add "$F" /    --type slide      "${@}"; }

# circle: path name x y diameter fill [text]
circ() {
  a "$1" --prop "name=$2" --prop preset=ellipse \
    --prop x="${3}cm" --prop y="${4}cm" \
    --prop width="${5}cm" --prop height="${5}cm" \
    --prop fill=$6 --prop line=none \
    --prop text="${7:-}" --prop color=$WHITE --prop size=11 \
    --prop align=center --prop valign=center
}

# circle with green ring border
circ_ring() {
  a "$1" --prop "name=$2" --prop preset=ellipse \
    --prop x="${3}cm" --prop y="${4}cm" \
    --prop width="${5}cm" --prop height="${5}cm" \
    --prop fill=$6 --prop line=$GREEN --prop lineWidth=3pt \
    --prop text="${7:-}" --prop color=$WHITE --prop size=11 \
    --prop align=center --prop valign=center
}

# thin vertical left bar
left_bar() {
  a "$1" --prop 'name=!!left-bar' --prop preset=rect \
    --prop x=0.65cm --prop y="${2}cm" \
    --prop width=0.18cm --prop height="${3}cm" \
    --prop fill=$GREEN --prop line=none
}

# slide number top right
snum() {
  a "$1" --prop text="0${2}" \
    --prop x=31.8cm --prop y=0.5cm --prop width=1.8cm --prop height=0.7cm \
    --prop size=9 --prop color=$LGRAY \
    --prop fill=none --prop line=none --prop align=right
}

# small green dot accent
gdot() {
  a "$1" --prop 'name=!!accent-dot' --prop preset=ellipse \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width=0.5cm --prop height=0.5cm \
    --prop fill=$GREEN --prop line=none
}

# green pill tag
pill() {
  a "$1" --prop preset=roundRect \
    --prop text="$2" \
    --prop x="${3}cm" --prop y="${4}cm" \
    --prop width="${5}cm" --prop height=0.75cm \
    --prop size=8.5 --prop bold=true --prop color=$BG \
    --prop fill=$GREEN --prop line=none \
    --prop align=center --prop valign=center
}

# dark stat card
stat_card() {
  # path x y w label value
  a "$1" --prop preset=roundRect \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width="${4}cm" --prop height=3cm \
    --prop fill=$D2 --prop line=none
  a "$1" --prop text="${5}" \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width="${4}cm" --prop height=1.4cm \
    --prop size=28 --prop bold=true --prop color=$WHITE \
    --prop fill=none --prop line=none \
    --prop align=center --prop valign=center
  a "$1" --prop text="${6}" \
    --prop x="${2}cm" --prop y="$(echo "${3} + 1.6" | bc)cm" \
    --prop width="${4}cm" --prop height=1.2cm \
    --prop size=9 --prop color=$LGRAY \
    --prop fill=none --prop line=none \
    --prop align=center
}

echo "Building $F..."
rm -f "$F"
officecli create "$F"


# ============================================================
# SLIDE 1 — DIGITAL STREAMING AGENCY  (Title)
# ============================================================
echo "  S1: Title..."
sl --prop background=$BG

# Hero organic oval RIGHT — large, colorful leaf
circ '/slide[1]' '!!circ-a' 18.5 -1.5 21.0 $C_LEAF "[ Image ]"

# Small green ring overlay on hero
a '/slide[1]' --prop preset=ellipse \
  --prop x=21cm --prop y=1cm --prop width=14cm --prop height=14cm \
  --prop fill=none --prop line=$GREEN --prop lineWidth=1.5pt --prop lineOpacity=0.3

left_bar '/slide[1]' 6.5 6.0
snum '/slide[1]' 1
gdot '/slide[1]' 1.6 1.5

# Giant title — three separate lines for precise control
a '/slide[1]' --prop text="Digital" \
  --prop x=1.6cm --prop y=3.0cm --prop width=16cm --prop height=3.0cm \
  --prop size=76 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none

a '/slide[1]' --prop text="Streaming" \
  --prop x=1.6cm --prop y=6.0cm --prop width=16cm --prop height=3.0cm \
  --prop size=76 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none

a '/slide[1]' --prop text="Agency" \
  --prop x=1.6cm --prop y=9.0cm --prop width=16cm --prop height=3.0cm \
  --prop size=76 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none

a '/slide[1]' --prop text="We help brands grow through digital innovation,\ncreative content and data-driven strategy." \
  --prop x=1.6cm --prop y=12.4cm --prop width=15cm --prop height=2cm \
  --prop size=10.5 --prop color=$LGRAY \
  --prop fill=none --prop line=none --prop lineSpacing=1.5

# Green CTA button
a '/slide[1]' --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop text="Submit  →" \
  --prop x=1.6cm --prop y=15.0cm --prop width=5.5cm --prop height=1.3cm \
  --prop size=10.5 --prop bold=true --prop color=$BG \
  --prop fill=$GREEN --prop line=none \
  --prop align=center --prop valign=center

# Bottom person info
c '/slide[1]' --prop x=1.6cm --prop y=17.5cm --prop width=12cm --prop height=0cm \
  --prop line=$MGRAY --prop lineWidth=0.5pt

a '/slide[1]' --prop text="Adrian Jonathon" \
  --prop x=1.6cm --prop y=17.7cm --prop width=10cm --prop height=0.65cm \
  --prop size=10 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none

a '/slide[1]' --prop text="Creative Director  ·  Digital Agency  ·  Since 2018" \
  --prop x=1.6cm --prop y=18.35cm --prop width=14cm --prop height=0.6cm \
  --prop size=8.5 --prop color=$LGRAY --prop fill=none --prop line=none


# ============================================================
# SLIDE 2 — CONTENT.  (Table of Contents)
# ============================================================
echo "  S2: Content..."
sl --prop background=$BG --prop transition=morph

# Large decorative dark circle — morphs from S1 hero
circ '/slide[2]' '!!circ-a' 1.5 3.0 15.0 $D3 ""

# Thin green ring on circle
a '/slide[2]' --prop preset=ellipse \
  --prop x=2cm --prop y=3.5cm --prop width=14cm --prop height=14cm \
  --prop fill=none --prop line=$GREEN --prop lineWidth=1pt --prop lineOpacity=0.25

left_bar '/slide[2]' 7.5 4.5
snum '/slide[2]' 2
gdot '/slide[2]' 1.6 1.5

# "Content." huge title
a '/slide[2]' --prop text="Content." \
  --prop x=2.0cm --prop y=4.5cm --prop width=17cm --prop height=5cm \
  --prop size=82 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none

# Menu items (right side)
a '/slide[2]' --prop preset=ellipse \
  --prop x=19.5cm --prop y=4.8cm --prop width=0.45cm --prop height=0.45cm \
  --prop fill=$GREEN --prop line=none
a '/slide[2]' --prop text="01" \
  --prop x=20.3cm --prop y=4.55cm --prop width=2cm --prop height=1cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center
a '/slide[2]' --prop text="The Incredible" \
  --prop x=22.5cm --prop y=4.55cm --prop width=11cm --prop height=1cm \
  --prop size=18 --prop color=$WHITE --prop fill=none --prop line=none --prop valign=center

a '/slide[2]' --prop preset=ellipse \
  --prop x=19.5cm --prop y=6.6cm --prop width=0.45cm --prop height=0.45cm \
  --prop fill=$MGRAY --prop line=none
a '/slide[2]' --prop text="02" \
  --prop x=20.3cm --prop y=6.35cm --prop width=2cm --prop height=1cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center
a '/slide[2]' --prop text="Agency Summary" \
  --prop x=22.5cm --prop y=6.35cm --prop width=11cm --prop height=1cm \
  --prop size=18 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center

a '/slide[2]' --prop preset=ellipse \
  --prop x=19.5cm --prop y=8.4cm --prop width=0.45cm --prop height=0.45cm \
  --prop fill=$MGRAY --prop line=none
a '/slide[2]' --prop text="03" \
  --prop x=20.3cm --prop y=8.15cm --prop width=2cm --prop height=1cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center
a '/slide[2]' --prop text="Digital Creative" \
  --prop x=22.5cm --prop y=8.15cm --prop width=11cm --prop height=1cm \
  --prop size=18 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center

a '/slide[2]' --prop preset=ellipse \
  --prop x=19.5cm --prop y=10.2cm --prop width=0.45cm --prop height=0.45cm \
  --prop fill=$MGRAY --prop line=none
a '/slide[2]' --prop text="04" \
  --prop x=20.3cm --prop y=9.95cm --prop width=2cm --prop height=1cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center
a '/slide[2]' --prop text="Marketplace" \
  --prop x=22.5cm --prop y=9.95cm --prop width=11cm --prop height=1cm \
  --prop size=18 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center

a '/slide[2]' --prop preset=ellipse \
  --prop x=19.5cm --prop y=12.0cm --prop width=0.45cm --prop height=0.45cm \
  --prop fill=$MGRAY --prop line=none
a '/slide[2]' --prop text="05" \
  --prop x=20.3cm --prop y=11.75cm --prop width=2cm --prop height=1cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center
a '/slide[2]' --prop text="Contact" \
  --prop x=22.5cm --prop y=11.75cm --prop width=11cm --prop height=1cm \
  --prop size=18 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center


# ============================================================
# SLIDE 3 — INTRODUCTION.  (Person/About)
# ============================================================
echo "  S3: Introduction..."
sl --prop background=$BG --prop transition=morph

left_bar '/slide[3]' 5.5 5.0
snum '/slide[3]' 3
gdot '/slide[3]' 1.6 1.5

# Circle A — large background circle (dark), left
circ '/slide[3]' '!!circ-a' 1.0 2.5 12.5 $D3 "[ Portrait ]"

# Circle B — overlapping smaller circle, right of A
circ_ring '/slide[3]' '!!circ-b' 7.5 5.0 9.5 $C_PERS "[ Image ]"

# Small accent circle (top of cluster)
circ '/slide[3]' '!!circ-c' 9.5 1.5 4.0 $GREEN_D ""

# Small green dot on accent circle
a '/slide[3]' --prop preset=ellipse \
  --prop x=11cm --prop y=2.5cm --prop width=1cm --prop height=1cm \
  --prop fill=$GREEN --prop line=none

# "Introduction." — large right-aligned
a '/slide[3]' --prop text="Introduction." \
  --prop x=17.5cm --prop y=4.5cm --prop width=15.5cm --prop height=6cm \
  --prop size=58 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.05

pill '/slide[3]' "Creative Director" 17.5 11.0 5.5

a '/slide[3]' --prop text="Adrian Jonathon" \
  --prop x=17.5cm --prop y=12.2cm --prop width=15cm --prop height=1.2cm \
  --prop size=20 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none

a '/slide[3]' --prop text="A visionary creative director with 10+ years of experience\nin digital media, brand strategy and creative production.\nPassionate about blending technology with human storytelling." \
  --prop x=17.5cm --prop y=13.6cm --prop width=15.5cm --prop height=3.5cm \
  --prop size=10.5 --prop color=$LGRAY --prop fill=none --prop line=none --prop lineSpacing=1.55

c '/slide[3]' --prop x=17.5cm --prop y=17.5cm --prop width=15cm --prop height=0cm \
  --prop line=$MGRAY --prop lineWidth=0.5pt

a '/slide[3]' --prop text="200+ Projects  ·  50+ Clients  ·  15 Awards" \
  --prop x=17.5cm --prop y=17.7cm --prop width=15cm --prop height=0.9cm \
  --prop size=9 --prop color=$LGRAY --prop fill=none --prop line=none


# ============================================================
# SLIDE 4 — INNOVATION MARKETING SOLUTION.  (Stats)
# ============================================================
echo "  S4: Stats..."
sl --prop background=$BG --prop transition=morph

left_bar '/slide[4]' 4.0 8.0
snum '/slide[4]' 4
gdot '/slide[4]' 1.6 1.5

# Small decorative circle (background)
circ '/slide[4]' '!!circ-a' 19.0 4.0 13.5 $D2 ""

# Title
a '/slide[4]' --prop text="Innovation Marketing\nSolution." \
  --prop x=1.6cm --prop y=2.0cm --prop width=16cm --prop height=5.5cm \
  --prop size=52 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.08

# ── Stat 1: $37M ──
# Green highlight background
a '/slide[4]' --prop preset=roundRect \
  --prop x=1.6cm --prop y=8.3cm --prop width=6.5cm --prop height=2.5cm \
  --prop fill=$GREEN --prop line=none
a '/slide[4]' --prop text='$37M' \
  --prop x=1.6cm --prop y=8.3cm --prop width=6.5cm --prop height=2.5cm \
  --prop size=52 --prop bold=true --prop color=$BG \
  --prop fill=none --prop line=none --prop align=center --prop valign=center

a '/slide[4]' --prop text="Mobile App\nDevelopment" \
  --prop x=8.5cm --prop y=8.5cm --prop width=9cm --prop height=2.0cm \
  --prop size=13 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.3

# Progress bar 1
a '/slide[4]' --prop preset=rect \
  --prop x=8.5cm --prop y=11.1cm --prop width=12cm --prop height=0.4cm \
  --prop fill=$MGRAY --prop line=none
a '/slide[4]' --prop preset=rect \
  --prop x=8.5cm --prop y=11.1cm --prop width=9.5cm --prop height=0.4cm \
  --prop fill=$GREEN --prop line=none
a '/slide[4]' --prop text="79%" \
  --prop x=21cm --prop y=10.7cm --prop width=2.5cm --prop height=1cm \
  --prop size=9.5 --prop color=$GREEN --prop fill=none --prop line=none

# ── Stat 2: +87% ──
a '/slide[4]' --prop preset=roundRect \
  --prop x=1.6cm --prop y=12.0cm --prop width=6.5cm --prop height=2.5cm \
  --prop fill=$D3 --prop line=$GREEN --prop lineWidth=1.5pt
a '/slide[4]' --prop text="+87%" \
  --prop x=1.6cm --prop y=12.0cm --prop width=6.5cm --prop height=2.5cm \
  --prop size=52 --prop bold=true --prop color=$GREEN \
  --prop fill=none --prop line=none --prop align=center --prop valign=center

a '/slide[4]' --prop text="Digital\nMarketing" \
  --prop x=8.5cm --prop y=12.2cm --prop width=9cm --prop height=2.0cm \
  --prop size=13 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.3

# Progress bar 2
a '/slide[4]' --prop preset=rect \
  --prop x=8.5cm --prop y=14.8cm --prop width=12cm --prop height=0.4cm \
  --prop fill=$MGRAY --prop line=none
a '/slide[4]' --prop preset=rect \
  --prop x=8.5cm --prop y=14.8cm --prop width=10.4cm --prop height=0.4cm \
  --prop fill=$GREEN --prop line=none
a '/slide[4]' --prop text="87%" \
  --prop x=21cm --prop y=14.4cm --prop width=2.5cm --prop height=1cm \
  --prop size=9.5 --prop color=$GREEN --prop fill=none --prop line=none

# Small label badges
pill '/slide[4]' "App Development" 1.6 16.5 5.5
pill '/slide[4]' "Digital Strategy" 7.5 16.5 5.5

a '/slide[4]' --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop text="View Report  →" \
  --prop x=13.5cm --prop y=16.5cm --prop width=5.5cm --prop height=1.2cm \
  --prop size=10 --prop bold=true --prop color=$BG \
  --prop fill=$GREEN --prop line=none --prop align=center --prop valign=center


# ============================================================
# SLIDE 5 — WE UNLOCK THE POTENTIAL.  (Circles diagram)
# ============================================================
echo "  S5: Potential..."
sl --prop background=$BG --prop transition=morph

left_bar '/slide[5]' 5.5 7.0
snum '/slide[5]' 5
gdot '/slide[5]' 1.6 1.5

# Cluster of 4 overlapping circles (left-center)
# Back circle (large, dark)
circ '/slide[5]' '!!circ-a' 1.5 3.5 13.0 $D3 ""
# Second circle overlapping (with image)
circ '/slide[5]' '!!circ-b' 5.5 2.0 9.5 $D4 "[ Investor ]"
# Third circle (front-left)
circ '/slide[5]' '!!circ-c' 0.5 7.5 8.0 $D2 "[ Support ]"
# Fourth circle (small, green-tinted)
a '/slide[5]' --prop preset=ellipse \
  --prop x=8.5cm --prop y=7.5cm --prop width=6.5cm --prop height=6.5cm \
  --prop fill=$GREEN_D --prop line=none \
  --prop text="[ Analysis ]" --prop color=$WHITE --prop size=10 \
  --prop align=center --prop valign=center

# Labels outside circles
a '/slide[5]' --prop text="Investor" \
  --prop x=6.5cm --prop y=1.2cm --prop width=5cm --prop height=0.8cm \
  --prop size=11 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none

a '/slide[5]' --prop text="Support" \
  --prop x=0.5cm --prop y=15.5cm --prop width=5cm --prop height=0.8cm \
  --prop size=11 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none

a '/slide[5]' --prop text="Analysis" \
  --prop x=8.5cm --prop y=14.5cm --prop width=5cm --prop height=0.8cm \
  --prop size=11 --prop bold=true --prop color=$GREEN --prop fill=none --prop line=none

# Small green dot on top circle
a '/slide[5]' --prop preset=ellipse \
  --prop x=9.8cm --prop y=2.8cm --prop width=1.0cm --prop height=1.0cm \
  --prop fill=$GREEN --prop line=none

# Title RIGHT
a '/slide[5]' --prop text="We Unlock\nThe\nPotential." \
  --prop x=17.5cm --prop y=3.5cm --prop width=15cm --prop height=9cm \
  --prop size=58 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.08

a '/slide[5]' --prop text="Connecting investors, support networks and data\nanalysis to drive exponential business growth." \
  --prop x=17.5cm --prop y=13.2cm --prop width=15cm --prop height=2.2cm \
  --prop size=10.5 --prop color=$LGRAY --prop fill=none --prop line=none --prop lineSpacing=1.5

a '/slide[5]' --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop text="Learn More  →" \
  --prop x=17.5cm --prop y=15.8cm --prop width=5.5cm --prop height=1.3cm \
  --prop size=10.5 --prop bold=true --prop color=$BG \
  --prop fill=$GREEN --prop line=none --prop align=center --prop valign=center


# ============================================================
# SLIDE 6 — LET'S LOOK OUR RECENT PROJECT.  (Portfolio)
# ============================================================
echo "  S6: Portfolio..."
sl --prop background=$BG --prop transition=morph

left_bar '/slide[6]' 3.0 4.5
snum '/slide[6]' 6
gdot '/slide[6]' 1.6 1.5

a '/slide[6]' --prop text="Let's Look Our\nRecent Project." \
  --prop x=1.6cm --prop y=1.5cm --prop width=22cm --prop height=5cm \
  --prop size=54 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.08

# 3 large overlapping portfolio circles
# Circle A — left (colorful abstract art)
circ '/slide[6]' '!!circ-a' 1.0 6.0 11.5 $C_ART "[ Graphic Art Work ]"
# Circle B — center (product, overlaps A)
circ '/slide[6]' '!!circ-b' 8.0 5.5 11.5 $C_TEAL "[ Commercial Product ]"
# Circle C — right (sky, overlaps B)
circ '/slide[6]' '!!circ-c' 15.5 6.5 11.5 $C_SKY "[ Sky Photography ]"

# Green ring on middle circle
a '/slide[6]' --prop preset=ellipse \
  --prop x=8.2cm --prop y=5.7cm --prop width=11.1cm --prop height=11.1cm \
  --prop fill=none --prop line=$GREEN --prop lineWidth=2pt

# Labels below circles
a '/slide[6]' --prop preset=ellipse \
  --prop x=1.8cm --prop y=17.1cm --prop width=0.4cm --prop height=0.4cm \
  --prop fill=$GREEN --prop line=none
a '/slide[6]' --prop text="Graphic Art Work" \
  --prop x=2.5cm --prop y=17.0cm --prop width=8cm --prop height=0.8cm \
  --prop size=10.5 --prop color=$WHITE --prop fill=none --prop line=none --prop valign=center

a '/slide[6]' --prop preset=ellipse \
  --prop x=9.5cm --prop y=17.1cm --prop width=0.4cm --prop height=0.4cm \
  --prop fill=$LGRAY --prop line=none
a '/slide[6]' --prop text="Commercial Product" \
  --prop x=10.2cm --prop y=17.0cm --prop width=8cm --prop height=0.8cm \
  --prop size=10.5 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center

a '/slide[6]' --prop preset=ellipse \
  --prop x=17.5cm --prop y=17.1cm --prop width=0.4cm --prop height=0.4cm \
  --prop fill=$LGRAY --prop line=none
a '/slide[6]' --prop text="Sky Photography" \
  --prop x=18.2cm --prop y=17.0cm --prop width=8cm --prop height=0.8cm \
  --prop size=10.5 --prop color=$LGRAY --prop fill=none --prop line=none --prop valign=center


# ============================================================
# SLIDE 7 — JOIN & LET'S WORK TOGETHER.  (Closing CTA)
# ============================================================
echo "  S7: Closing..."
sl --prop background=$BG --prop transition=morph

left_bar '/slide[7]' 4.5 8.0
snum '/slide[7]' 7
gdot '/slide[7]' 1.6 1.5

# Large interior/room image circle RIGHT
circ '/slide[7]' '!!circ-a' 18.0 1.0 15.5 $C_ROOM "[ Interior Image ]"

# Green ring on image
a '/slide[7]' --prop preset=ellipse \
  --prop x=18.3cm --prop y=1.3cm --prop width=14.9cm --prop height=14.9cm \
  --prop fill=none --prop line=$GREEN --prop lineWidth=2pt --prop lineOpacity=0.4

# Title
a '/slide[7]' --prop text="Join & Let's\nWork Together." \
  --prop x=1.6cm --prop y=2.5cm --prop width=15.5cm --prop height=7cm \
  --prop size=54 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop lineSpacing=1.08

a '/slide[7]' --prop text="Ready to take your brand to the next level?\nLet's create something extraordinary together." \
  --prop x=1.6cm --prop y=10.0cm --prop width=15.5cm --prop height=2.5cm \
  --prop size=11 --prop color=$LGRAY --prop fill=none --prop line=none --prop lineSpacing=1.55

a '/slide[7]' --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop text="Start a Project  →" \
  --prop x=1.6cm --prop y=13.0cm --prop width=7cm --prop height=1.4cm \
  --prop size=11 --prop bold=true --prop color=$BG \
  --prop fill=$GREEN --prop line=none --prop align=center --prop valign=center

# 4 Stat boxes
a '/slide[7]' --prop preset=roundRect \
  --prop x=1.6cm --prop y=15.3cm --prop width=6.5cm --prop height=3.0cm \
  --prop fill=$D2 --prop line=none
a '/slide[7]' --prop text="Receive Project" \
  --prop x=1.6cm --prop y=15.5cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8.5 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop text="200+ Delivered" \
  --prop x=1.6cm --prop y=16.4cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop preset=ellipse \
  --prop x=4.5cm --prop y=17.35cm --prop width=0.4cm --prop height=0.4cm \
  --prop fill=$GREEN --prop line=none

a '/slide[7]' --prop preset=roundRect \
  --prop x=8.5cm --prop y=15.3cm --prop width=6.5cm --prop height=3.0cm \
  --prop fill=$D2 --prop line=none
a '/slide[7]' --prop text="Build Portfolio" \
  --prop x=8.5cm --prop y=15.5cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8.5 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop text="50+ Case Studies" \
  --prop x=8.5cm --prop y=16.4cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop preset=ellipse \
  --prop x=11.4cm --prop y=17.35cm --prop width=0.4cm --prop height=0.4cm \
  --prop fill=$GREEN --prop line=none

a '/slide[7]' --prop preset=roundRect \
  --prop x=15.4cm --prop y=15.3cm --prop width=6.5cm --prop height=3.0cm \
  --prop fill=$D2 --prop line=none
a '/slide[7]' --prop text="Data Analysis" \
  --prop x=15.4cm --prop y=15.5cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8.5 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop text="Real-time Insights" \
  --prop x=15.4cm --prop y=16.4cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop preset=ellipse \
  --prop x=18.3cm --prop y=17.35cm --prop width=0.4cm --prop height=0.4cm \
  --prop fill=$GREEN --prop line=none

a '/slide[7]' --prop preset=roundRect \
  --prop x=22.3cm --prop y=15.3cm --prop width=6.5cm --prop height=3.0cm \
  --prop fill=$D2 --prop line=none
a '/slide[7]' --prop text="List Subscriber" \
  --prop x=22.3cm --prop y=15.5cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8.5 --prop bold=true --prop color=$WHITE --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop text="12k+ Subscribers" \
  --prop x=22.3cm --prop y=16.4cm --prop width=6.5cm --prop height=0.9cm \
  --prop size=8 --prop color=$LGRAY --prop fill=none --prop line=none --prop align=center
a '/slide[7]' --prop preset=ellipse \
  --prop x=25.2cm --prop y=17.35cm --prop width=0.4cm --prop height=0.4cm \
  --prop fill=$GREEN --prop line=none


# ============================================================
# Morph transitions: S2–S7
# ============================================================
echo "  Applying morph..."
for i in 2 3 4 5 6 7; do
  officecli set "$F" "/slide[$i]" --prop transition=morph 2>&1
done

echo ""
echo "✓  Done → $F"
