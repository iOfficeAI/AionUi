#!/bin/bash
set +H
set -e

F="/Users/visher/Library/Application Support/AionUI/aionui/claude-temp-1773991108310/sweet_bliss_v4.pptx"

# ── Palette: Forest Green + Terracotta + Honey (distinct triad) ─────
BG="FFFDF8"          # ivory white background
PLUM="1E4D38"        # deep forest green (main blob)  ← PRIMARY
SAGE="C4552A"        # bold terracotta / brick orange (alt blob)  ← SECONDARY (very different!)
MAUVE="E8A838"       # warm honey amber (cloud blob)  ← TERTIARY
ROSE="FFF0E8"        # very light peach-blush (cards)
ROSE_MID="C4552A"    # terracotta accent (same as SAGE – cohesive)
LAVENDER="EAF4EE"    # very light mint (alt cards)
LAVENDER_MID="1E4D38" # deep forest (step dots – cohesive with blob)
GOLD="E8A838"        # honey gold (= MAUVE)
GOLD_LT="F5DDA0"     # pale honey sparkle
CREAM="FBF3E8"       # warm cream (menu cards)
MINT="C6E8D2"        # soft mint accent
SAGE_LT="D4EDE0"     # light mint-green deco
TEXT="241C17"        # near-black
MID="7A6040"         # warm warm-brown body text
WHITE="FFFFFF"

# ── SVG-like geometry paths (0-100 normalized) ──────────────────────
# Organic blob shapes
BL='M 0,0 C 16,0 36,4 41,17 C 46,30 38,42 45,54 C 51,64 43,76 36,86 C 28,96 13,100 0,100 Z'
BL2='M 0,0 C 18,0 38,6 44,20 C 49,34 40,46 47,58 C 52,68 44,80 38,88 C 30,96 14,100 0,100 Z'
BA='M 0,6 C 14,2 34,10 42,26 C 48,40 39,52 46,64 C 52,74 45,86 33,92 C 21,98 7,100 0,100 Z'
BC='M 18,52 C 16,34 26,18 42,22 C 44,10 58,6 68,18 C 76,6 92,16 91,34 C 99,38 100,54 91,62 C 93,74 81,84 68,80 C 62,90 48,92 38,86 C 24,80 16,68 16,60 C 14,57 14,54 18,52 Z'
BR='M 100,0 C 84,0 64,4 59,17 C 54,30 62,42 55,54 C 49,64 57,76 64,86 C 72,96 87,100 100,100 Z'
BSM='M 0,15 C 12,10 30,18 36,32 C 42,46 34,58 40,70 C 45,80 38,90 26,94 C 14,98 5,100 0,100 Z'
BCT='M 15,55 C 12,36 22,18 40,20 C 44,6 62,2 72,16 C 84,8 96,22 95,42 C 100,50 98,66 88,72 C 86,84 72,94 56,90 C 40,96 20,84 14,72 C 12,68 12,62 15,55 Z'

# ── SVG icon/deco paths ─────────────────────────────────────────────
# 4-point diamond sparkle ✦
SPARKLE='M 50,0 C 52,24 76,48 100,50 C 76,52 52,76 50,100 C 48,76 24,52 0,50 C 24,48 48,24 50,0 Z'
# Elongated leaf
LEAF='M 50,95 C 25,68 6,38 18,14 C 27,2 42,0 50,0 C 58,0 73,2 82,14 C 94,38 75,68 50,95 Z'
# Teardrop / dewdrop
DROP='M 50,100 C 20,78 0,54 6,30 C 12,8 32,0 50,0 C 68,0 88,8 94,30 C 100,54 80,78 50,100 Z'
# Crescent arc (decorative)
CRES='M 30,5 C 60,0 95,25 95,50 C 95,75 60,100 30,95 C 55,85 75,68 75,50 C 75,32 55,15 30,5 Z'
# Small 6-petal flower (simplified)
FLWR='M 50,20 C 58,20 65,35 65,50 C 65,65 58,80 50,80 C 42,80 35,65 35,50 C 35,35 42,20 50,20 Z'

a()  { officecli add "$F" "$1" --type shape     "${@:2}"; }
c()  { officecli add "$F" "$1" --type connector "${@:2}"; }
sl() { officecli add "$F" /    --type slide;              }

# ── Deco helpers ────────────────────────────────────────────────────
# 4-pt sparkle icon (x,y,size in cm, color)
sparkle() {
  a "$1" --prop preset=rect \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width="${4}cm" --prop height="${4}cm" \
    --prop fill=$5 --prop line=none --prop geometry="$SPARKLE"
}
# Leaf icon
leaf_deco() {
  a "$1" --prop preset=rect \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width="${4}cm" --prop height="${5}cm" \
    --prop fill=$6 --prop line=none --prop geometry="$LEAF"
}
# Teardrop icon
drop_deco() {
  a "$1" --prop preset=rect \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width="${4}cm" --prop height="${5}cm" \
    --prop fill=$6 --prop line=none --prop geometry="$DROP"
}
# Outline ring (ellipse with stroke only)
ring() {
  a "$1" --prop preset=ellipse \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width="${4}cm" --prop height="${4}cm" \
    --prop fill=none --prop line=$5 --prop lineWidth="${6}pt"
}
# Arrow nav button
arw() {
  a "$1" --prop preset=ellipse \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width=1.05cm --prop height=1.05cm \
    --prop fill=$ROSE_MID --prop line=none --prop lineWidth=1pt \
    --prop text="$4" --prop color=$WHITE \
    --prop size=11 --prop align=center --prop valign=center
}
# Price/stat badge
badge() {
  a "$1" --prop preset=roundRect \
    --prop x="${2}cm" --prop y="${3}cm" \
    --prop width="${4}cm" --prop height="${5}cm" \
    --prop fill=$6 --prop line=none \
    --prop text="$7" --prop color=$8 \
    --prop size=$9 --prop bold=true \
    --prop align=center --prop valign=center
}

rm -f "$F"
officecli create "$F"

# ── Navbar ──────────────────────────────────────────────────────────
navbar() {
  local p=$1 logo_fill=$2 logo_text=$3
  local logo_fill=${2:-$PLUM}
  local logo_text=${3:-$WHITE}
  a "$p" --prop preset=roundRect \
    --prop x=0.5cm --prop y=0.28cm --prop width=2.6cm --prop height=0.62cm \
    --prop fill=$logo_fill --prop line=none \
    --prop text="Sweet Bliss" --prop color=$logo_text \
    --prop size=7.5 --prop bold=true --prop align=center --prop valign=center
  a "$p" --prop text="Home   About Us   Project   Blog   Reservation" \
    --prop x=7cm --prop y=0.3cm --prop width=22cm --prop height=0.6cm \
    --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
    --prop align=left --prop valign=center
  # Brand sparkle icon top-right
  sparkle "$p" 32.2 0.18 0.78 $GOLD_LT
  c "$p" \
    --prop x1=14cm --prop y1=1.28cm --prop x2=33.87cm --prop y2=1.28cm \
    --prop line=$LAVENDER --prop lineWidth=0.5pt
}

# ════════════════════════════════════════════════════════════════════
# SLIDE 1: Cover – Best Service Sweet Bliss
# ════════════════════════════════════════════════════════════════════
echo "  S1: Cover..."
sl
officecli set "$F" /slide[1] --prop background=$BG

# !!blob-main – deep plum left blob (morphs across all slides)
a /slide[1] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=0cm --prop y=0cm --prop width=14cm --prop height=19.05cm \
  --prop fill=$PLUM --prop line=none --prop geometry="$BL"

# Food image ellipse (inside blob zone)
a /slide[1] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=1.5cm --prop y=5cm --prop width=4cm --prop height=9cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# Semi-transparent plum overlay (depth effect)
a /slide[1] --prop preset=rect \
  --prop x=0cm --prop y=0cm --prop width=14cm --prop height=19.05cm \
  --prop fill=$PLUM --prop line=none --prop geometry="$BL" --prop opacity=0.2

# SVG deco: sparkle decorations scattered on blob (white/gold)
sparkle /slide[1] 1.5  1.5  0.6 $GOLD_LT
sparkle /slide[1] 10.2 2.2  0.45 $WHITE
sparkle /slide[1] 3.5  16.5 0.5 $GOLD_LT
sparkle /slide[1] 11   15   0.35 $WHITE

# SVG deco: leaf pair on blob
leaf_deco /slide[1] 9.5 1.2 0.8 1.3 $ROSE
leaf_deco /slide[1] 10.5 1.4 0.6 1.0 $ROSE

navbar /slide[1]

# Brand tagline on blob (white)
a /slide[1] --prop text="Premium Bakery & Cafe" \
  --prop x=1.5cm --prop y=1.5cm --prop width=10cm --prop height=0.8cm \
  --prop size=8 --prop color=$WHITE --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# Title RIGHT side (safe zone x>14cm)
a /slide[1] --prop text="Best Service" \
  --prop x=15.5cm --prop y=4.5cm --prop width=17cm --prop height=2.2cm \
  --prop size=36 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[1] --prop 'name=!!slide-title' --prop text="Sweet Bliss" \
  --prop x=15.5cm --prop y=7.0cm --prop width=17cm --prop height=2.2cm \
  --prop size=36 --prop bold=true --prop color=$ROSE_MID \
  --prop fill=none --prop line=none --prop align=left --prop valign=center

# Gold underline accent
c /slide[1] --prop 'name=!!title-accent' \
  --prop x1=15.5cm --prop y1=9.5cm --prop x2=24cm --prop y2=9.5cm \
  --prop line=$GOLD --prop lineWidth=1.5pt

arw /slide[1] 13.5 7.5 "<"
arw /slide[1] 13.5 9.1 ">"

# Service items
a /slide[1] --prop text="01. Service" \
  --prop x=15.5cm --prop y=10.2cm --prop width=17cm --prop height=0.85cm \
  --prop size=11 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[1] --prop text="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas tincidunt volutpat dui porta lorem consectetur." \
  --prop x=15.5cm --prop y=11.2cm --prop width=17cm --prop height=1.6cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top
a /slide[1] --prop text="02. Service" \
  --prop x=15.5cm --prop y=13.2cm --prop width=17cm --prop height=0.85cm \
  --prop size=11 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[1] --prop text="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas tincidunt volutpat dui porta lorem consectetur." \
  --prop x=15.5cm --prop y=14.2cm --prop width=17cm --prop height=1.6cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top

# SVG deco right: teardrop + ring accents
drop_deco /slide[1] 31cm 14cm 1.0 1.5 $ROSE
ring      /slide[1] 30cm 13cm 2.5 $LAVENDER 1.2

c /slide[1] --prop 'name=!!footer-line' \
  --prop x1=15.5cm --prop y1=17.5cm --prop x2=33cm --prop y2=17.5cm \
  --prop line=$LAVENDER --prop lineWidth=0.5pt
a /slide[1] --prop text="1 / 8" \
  --prop x=15.5cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# ════════════════════════════════════════════════════════════════════
# SLIDE 2: The Portfolio – Cloud blob center
# ════════════════════════════════════════════════════════════════════
echo "  S2: The Portfolio..."
sl
officecli set "$F" /slide[2] --prop background=$BG

# Cloud blob (mauve, morphs from plum left to mauve center)
a /slide[2] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=3.5cm --prop y=3.2cm --prop width=20cm --prop height=13cm \
  --prop fill=$MAUVE --prop line=none --prop geometry="$BC"

# SVG deco inside cloud: sparkles (white, designed overlay on blob)
sparkle /slide[2] 5.5  4.5  0.7 $WHITE
sparkle /slide[2] 20   5.0  0.5 $GOLD_LT
sparkle /slide[2] 7.5  14   0.45 $WHITE
sparkle /slide[2] 19.5 14.5 0.4 $GOLD_LT

# "The Portfolio" title inside cloud (designed title overlay – allowed)
a /slide[2] --prop text="The Portfolio" \
  --prop x=5cm --prop y=7.5cm --prop width=13cm --prop height=2.8cm \
  --prop size=30 --prop bold=true --prop color=$WHITE \
  --prop fill=none --prop line=none --prop align=center --prop valign=center

# Scattered organic food images (right zone, safe)
a /slide[2] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=22.5cm --prop y=1.8cm --prop width=7.2cm --prop height=7.2cm \
  --prop fill=C86830 --prop line=$WHITE --prop lineWidth=3pt \
  --prop text="[photo]" --prop color=$GOLD_LT --prop size=8 \
  --prop align=center --prop valign=bottom
a /slide[2] --prop preset=ellipse \
  --prop x=25cm --prop y=8.5cm --prop width=5.8cm --prop height=5.8cm \
  --prop fill=C86830 --prop line=$WHITE --prop lineWidth=3pt \
  --prop text="[photo]" --prop color=$GOLD_LT --prop size=8 \
  --prop align=center --prop valign=bottom
a /slide[2] --prop preset=ellipse \
  --prop x=27.5cm --prop y=13.2cm --prop width=5cm --prop height=5cm \
  --prop fill=B85820 --prop line=$WHITE --prop lineWidth=3pt \
  --prop text="[photo]" --prop color=$GOLD_LT --prop size=8 \
  --prop align=center --prop valign=bottom

# SVG deco: leaf accents near images
leaf_deco /slide[2] 29.5 1.2 0.9 1.5 $SAGE_LT
leaf_deco /slide[2] 30.5 1.0 0.7 1.2 $MINT

# SVG deco: rose teardrop bottom-left
drop_deco /slide[2] 0.5 13.5 1.2 1.8 $ROSE
drop_deco /slide[2] 1.8 14.2 0.9 1.4 $LAVENDER

navbar /slide[2]
c /slide[2] --prop 'name=!!footer-line' \
  --prop x1=1cm --prop y1=17.5cm --prop x2=22cm --prop y2=17.5cm \
  --prop line=$LAVENDER --prop lineWidth=0.5pt
a /slide[2] --prop text="2 / 8" \
  --prop x=1cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# ════════════════════════════════════════════════════════════════════
# SLIDE 3: About Us – sage left blob
# ════════════════════════════════════════════════════════════════════
echo "  S3: About Us..."
sl
officecli set "$F" /slide[3] --prop background=$BG

# Sage left blob (colour change morph: mauve cloud → sage left)
a /slide[3] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=0cm --prop y=0cm --prop width=14cm --prop height=19.05cm \
  --prop fill=$SAGE --prop line=none --prop geometry="$BL2"

a /slide[3] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=1.5cm --prop y=5cm --prop width=4cm --prop height=9cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# Year badge (lavender circle)
a /slide[3] --prop preset=ellipse \
  --prop x=9.5cm --prop y=2cm --prop width=2.8cm --prop height=2.8cm \
  --prop fill=$LAVENDER_MID --prop line=none \
  --prop text="Since 2018" --prop color=$WHITE \
  --prop size=8.5 --prop bold=true --prop align=center --prop valign=center

# SVG deco on blob
sparkle /slide[3] 1.5  1.5  0.6 $GOLD_LT
sparkle /slide[3] 11.5 16   0.45 $WHITE
leaf_deco /slide[3] 0.5 16.5 0.8 1.3 $MINT
leaf_deco /slide[3] 1.5 16.2 0.6 1.0 $SAGE_LT

arw /slide[3] 13.5 7.5 "<"
arw /slide[3] 13.5 9.1 ">"
navbar /slide[3]

a /slide[3] --prop text="About Us" \
  --prop x=15.5cm --prop y=2cm --prop width=17cm --prop height=1.6cm \
  --prop size=28 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
c /slide[3] --prop 'name=!!title-accent' \
  --prop x1=15.5cm --prop y1=3.8cm --prop x2=23cm --prop y2=3.8cm \
  --prop line=$GOLD --prop lineWidth=1.5pt
a /slide[3] --prop text="We are a premium artisan bakery dedicated to creating extraordinary pastries, cakes, and confections that bring joy to every occasion." \
  --prop x=15.5cm --prop y=4.2cm --prop width=17cm --prop height=2.5cm \
  --prop size=9 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top

# Stat cards (lavender tint)
a /slide[3] --prop preset=roundRect \
  --prop x=15.5cm --prop y=7.5cm --prop width=5cm --prop height=4.2cm \
  --prop fill=$LAVENDER --prop line=none
sparkle /slide[3] 15.8 7.6 0.5 $LAVENDER_MID
a /slide[3] --prop text="120+" \
  --prop x=15.5cm --prop y=8.1cm --prop width=5cm --prop height=1.6cm \
  --prop size=26 --prop bold=true --prop color=$PLUM \
  --prop fill=none --prop line=none --prop align=center --prop valign=center
a /slide[3] --prop text="Recipes" \
  --prop x=15.5cm --prop y=9.8cm --prop width=5cm --prop height=0.8cm \
  --prop size=8.5 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=center --prop valign=center

a /slide[3] --prop preset=roundRect \
  --prop x=21cm --prop y=7.5cm --prop width=5cm --prop height=4.2cm \
  --prop fill=$ROSE --prop line=none
sparkle /slide[3] 21.3 7.6 0.5 $ROSE_MID
a /slide[3] --prop text="98%" \
  --prop x=21cm --prop y=8.1cm --prop width=5cm --prop height=1.6cm \
  --prop size=26 --prop bold=true --prop color=$PLUM \
  --prop fill=none --prop line=none --prop align=center --prop valign=center
a /slide[3] --prop text="Happy Clients" \
  --prop x=21cm --prop y=9.8cm --prop width=5cm --prop height=0.8cm \
  --prop size=8.5 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=center --prop valign=center

a /slide[3] --prop preset=roundRect \
  --prop x=26.5cm --prop y=7.5cm --prop width=5.5cm --prop height=4.2cm \
  --prop fill=$SAGE_LT --prop line=none
sparkle /slide[3] 26.8 7.6 0.5 $SAGE
a /slide[3] --prop text="15+" \
  --prop x=26.5cm --prop y=8.1cm --prop width=5.5cm --prop height=1.6cm \
  --prop size=26 --prop bold=true --prop color=$SAGE \
  --prop fill=none --prop line=none --prop align=center --prop valign=center
a /slide[3] --prop text="Awards Won" \
  --prop x=26.5cm --prop y=9.8cm --prop width=5.5cm --prop height=0.8cm \
  --prop size=8.5 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=center --prop valign=center

a /slide[3] --prop text="Handcrafted with finest ingredients daily" \
  --prop x=15.5cm --prop y=12.8cm --prop width=17cm --prop height=0.8cm \
  --prop size=9 --prop color=$TEXT --prop fill=none --prop line=none \
  --prop align=left --prop valign=center
a /slide[3] --prop text="Custom cakes for every celebration" \
  --prop x=15.5cm --prop y=13.9cm --prop width=17cm --prop height=0.8cm \
  --prop size=9 --prop color=$TEXT --prop fill=none --prop line=none \
  --prop align=left --prop valign=center
a /slide[3] --prop text="Seasonal menu with local produce" \
  --prop x=15.5cm --prop y=15.0cm --prop width=17cm --prop height=0.8cm \
  --prop size=9 --prop color=$TEXT --prop fill=none --prop line=none \
  --prop align=left --prop valign=center
a /slide[3] --prop text="Delivered fresh to your doorstep" \
  --prop x=15.5cm --prop y=16.1cm --prop width=17cm --prop height=0.8cm \
  --prop size=9 --prop color=$TEXT --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

c /slide[3] --prop 'name=!!footer-line' \
  --prop x1=15.5cm --prop y1=17.5cm --prop x2=33cm --prop y2=17.5cm \
  --prop line=$LAVENDER --prop lineWidth=0.5pt
a /slide[3] --prop text="3 / 8" \
  --prop x=15.5cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# ════════════════════════════════════════════════════════════════════
# SLIDE 4: Creative Infographic A – plum left amoeba
# ════════════════════════════════════════════════════════════════════
echo "  S4: Infographic A..."
sl
officecli set "$F" /slide[4] --prop background=$BG

a /slide[4] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=0cm --prop y=0cm --prop width=14cm --prop height=19.05cm \
  --prop fill=$PLUM --prop line=none --prop geometry="$BA"

a /slide[4] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=1.5cm --prop y=5cm --prop width=4cm --prop height=9cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# SVG deco on blob
sparkle /slide[4] 2    1.5  0.6 $GOLD_LT
sparkle /slide[4] 10.5 2.5  0.5 $WHITE
sparkle /slide[4] 4    16.5 0.4 $WHITE
drop_deco /slide[4] 9.8 14.5 0.8 1.2 $ROSE

a /slide[4] --prop preset=ellipse \
  --prop x=13.4cm --prop y=8.8cm --prop width=1.1cm --prop height=1.1cm \
  --prop fill=$GOLD --prop line=none \
  --prop text=">" --prop color=$WHITE --prop size=12 \
  --prop align=center --prop valign=center

navbar /slide[4]

a /slide[4] --prop text="Creative Infographic" \
  --prop x=15.5cm --prop y=1.8cm --prop width=17cm --prop height=1.5cm \
  --prop size=26 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
c /slide[4] --prop 'name=!!title-accent' \
  --prop x1=15.5cm --prop y1=3.5cm --prop x2=27cm --prop y2=3.5cm \
  --prop line=$GOLD --prop lineWidth=1.5pt

# Stat card 1 – lavender
a /slide[4] --prop preset=roundRect \
  --prop x=15.5cm --prop y=4.2cm --prop width=17cm --prop height=4.8cm \
  --prop fill=$LAVENDER --prop line=none
sparkle /slide[4] 15.8 4.3 0.6 $LAVENDER_MID
a /slide[4] --prop preset=roundRect \
  --prop x=16cm --prop y=4.7cm --prop width=3cm --prop height=3.2cm \
  --prop fill=$LAVENDER_MID --prop line=none \
  --prop text="02" --prop color=$WHITE \
  --prop size=28 --prop bold=true --prop align=center --prop valign=center
a /slide[4] --prop text="Title Here" \
  --prop x=19.8cm --prop y=5.0cm --prop width=12cm --prop height=1.1cm \
  --prop size=13 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[4] --prop text="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas tincidunt volutpat dui porta lorem." \
  --prop x=19.8cm --prop y=6.3cm --prop width=12cm --prop height=2cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top

# Stat card 2 – rose
a /slide[4] --prop preset=roundRect \
  --prop x=15.5cm --prop y=10cm --prop width=17cm --prop height=4.8cm \
  --prop fill=$ROSE --prop line=none
sparkle /slide[4] 15.8 10.1 0.6 $ROSE_MID
a /slide[4] --prop preset=roundRect \
  --prop x=16cm --prop y=10.5cm --prop width=3cm --prop height=3.2cm \
  --prop fill=$ROSE_MID --prop line=none \
  --prop text="04" --prop color=$WHITE \
  --prop size=28 --prop bold=true --prop align=center --prop valign=center
a /slide[4] --prop text="Title Here" \
  --prop x=19.8cm --prop y=10.8cm --prop width=12cm --prop height=1.1cm \
  --prop size=13 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[4] --prop text="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas tincidunt volutpat dui porta lorem." \
  --prop x=19.8cm --prop y=12.1cm --prop width=12cm --prop height=2cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top

c /slide[4] --prop 'name=!!footer-line' \
  --prop x1=15.5cm --prop y1=17.5cm --prop x2=33cm --prop y2=17.5cm \
  --prop line=$LAVENDER --prop lineWidth=0.5pt
a /slide[4] --prop text="4 / 8" \
  --prop x=15.5cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# ════════════════════════════════════════════════════════════════════
# SLIDE 5: Creative Infographic B – price cards
# ════════════════════════════════════════════════════════════════════
echo "  S5: Infographic B (Prices)..."
sl
officecli set "$F" /slide[5] --prop background=$BG

# Blob moves to right (cream/lavender, subtle)
a /slide[5] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=20cm --prop y=0cm --prop width=13.87cm --prop height=19.05cm \
  --prop fill=$LAVENDER --prop line=none --prop geometry="$BR" --prop opacity=0.5

# SVG deco background sparkles
sparkle /slide[5] 0.8  1.5  0.5 $LAVENDER_MID
sparkle /slide[5] 32.5 3.5  0.6 $GOLD_LT
sparkle /slide[5] 33   16   0.4 $ROSE_MID
sparkle /slide[5] 11   15.5 0.45 $LAVENDER_MID

navbar /slide[5]

a /slide[5] --prop text="Creative Infographic" \
  --prop x=8.5cm --prop y=1.4cm --prop width=17cm --prop height=1.4cm \
  --prop size=26 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=center --prop valign=center

# Left organic food image
a /slide[5] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=0.5cm --prop y=3.5cm --prop width=9.5cm --prop height=12cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# Price tag – dark plum badge
badge /slide[5] 0.5 3.2 3.8 1.4 $PLUM '$900' $WHITE 18

# SVG deco: leaf on left image
leaf_deco /slide[5] 9.5 3.0 0.8 1.3 $SAGE_LT

# Center arrow
a /slide[5] --prop preset=ellipse \
  --prop x=10.5cm --prop y=8.5cm --prop width=1.1cm --prop height=1.1cm \
  --prop fill=$GOLD --prop line=none \
  --prop text=">" --prop color=$WHITE --prop size=12 \
  --prop align=center --prop valign=center

# Center cream card
a /slide[5] --prop preset=roundRect \
  --prop x=12cm --prop y=3.8cm --prop width=8.5cm --prop height=5.5cm \
  --prop fill=$CREAM --prop line=none
sparkle /slide[5] 12.3 4.0 0.55 $GOLD_LT
a /slide[5] --prop text="Title Here" \
  --prop x=12.5cm --prop y=4.4cm --prop width=7.5cm --prop height=1.1cm \
  --prop size=12 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[5] --prop text="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas tincidunt volutpat dui porta lorem ipsum." \
  --prop x=12.5cm --prop y=5.8cm --prop width=7.5cm --prop height=2.8cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top

# Right organic food image
a /slide[5] --prop preset=ellipse \
  --prop x=22cm --prop y=3.5cm --prop width=9.5cm --prop height=12cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# Price tag – rose badge
badge /slide[5] 28.2 3.2 3.5 1.4 $ROSE_MID '$400' $WHITE 18

# SVG deco: leaf on right image
leaf_deco /slide[5] 21.5 3.0 0.8 1.3 $SAGE_LT

c /slide[5] --prop 'name=!!footer-line' \
  --prop x1=1cm --prop y1=17.5cm --prop x2=33cm --prop y2=17.5cm \
  --prop line=$LAVENDER --prop lineWidth=0.5pt
a /slide[5] --prop text="5 / 8" \
  --prop x=15.5cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=center --prop valign=center

# ════════════════════════════════════════════════════════════════════
# SLIDE 6: Our Menu – sage right blob
# ════════════════════════════════════════════════════════════════════
echo "  S6: Our Menu..."
sl
officecli set "$F" /slide[6] --prop background=$BG

# Right sage blob (morph from lavender right to sage right)
a /slide[6] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=19.87cm --prop y=0cm --prop width=14cm --prop height=19.05cm \
  --prop fill=$SAGE --prop line=none --prop geometry="$BR"

a /slide[6] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=21.5cm --prop y=3.5cm --prop width=11cm --prop height=13cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# SVG deco on blob
sparkle /slide[6] 20.5 1.5  0.6 $GOLD_LT
sparkle /slide[6] 31.5 2    0.5 $WHITE
sparkle /slide[6] 22   16   0.45 $WHITE
leaf_deco /slide[6] 32.5 14.5 0.8 1.3 $MINT
leaf_deco /slide[6] 33.5 14.2 0.6 1.0 $SAGE_LT

arw /slide[6] 18.8 7.5 ">"
arw /slide[6] 18.8 9.1 "<"
navbar /slide[6]

a /slide[6] --prop text="Our Sweet Menu" \
  --prop x=1cm --prop y=2cm --prop width=17cm --prop height=1.5cm \
  --prop size=28 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
c /slide[6] --prop 'name=!!title-accent' \
  --prop x1=1cm --prop y1=3.7cm --prop x2=12cm --prop y2=3.7cm \
  --prop line=$GOLD --prop lineWidth=1.5pt

# Menu card 1 – cream
a /slide[6] --prop preset=roundRect \
  --prop x=1cm --prop y=4.2cm --prop width=16.5cm --prop height=3.3cm \
  --prop fill=$CREAM --prop line=none
sparkle /slide[6] 1.3 4.3 0.5 $GOLD_LT
a /slide[6] --prop text="Artisan Croissants" \
  --prop x=1.8cm --prop y=4.7cm --prop width=10cm --prop height=1cm \
  --prop size=11 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[6] --prop text="Freshly baked every morning with French butter and 72-hour fermentation." \
  --prop x=1.8cm --prop y=5.9cm --prop width=10cm --prop height=1.2cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top
badge /slide[6] 13.5 4.8 3 1.2 $PLUM "From \$8" $WHITE 9

# Menu card 2 – rose tint
a /slide[6] --prop preset=roundRect \
  --prop x=1cm --prop y=8.2cm --prop width=16.5cm --prop height=3.3cm \
  --prop fill=$ROSE --prop line=none
sparkle /slide[6] 1.3 8.3 0.5 $ROSE_MID
a /slide[6] --prop text="Specialty Cakes" \
  --prop x=1.8cm --prop y=8.7cm --prop width=10cm --prop height=1cm \
  --prop size=11 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[6] --prop text="Custom designed for your special occasions, handcrafted to perfection." \
  --prop x=1.8cm --prop y=9.9cm --prop width=10cm --prop height=1.2cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top
badge /slide[6] 13.5 8.8 3 1.2 $ROSE_MID "From \$45" $WHITE 9

# Menu card 3 – lavender tint
a /slide[6] --prop preset=roundRect \
  --prop x=1cm --prop y=12.2cm --prop width=16.5cm --prop height=3.3cm \
  --prop fill=$LAVENDER --prop line=none
sparkle /slide[6] 1.3 12.3 0.5 $LAVENDER_MID
a /slide[6] --prop text="Coffee & Drinks" \
  --prop x=1.8cm --prop y=12.7cm --prop width=10cm --prop height=1cm \
  --prop size=11 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[6] --prop text="Single origin coffee paired perfectly with our house-baked goods." \
  --prop x=1.8cm --prop y=13.9cm --prop width=10cm --prop height=1.2cm \
  --prop size=8 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top
badge /slide[6] 13.5 12.8 3 1.2 $LAVENDER_MID "From \$5" $WHITE 9

c /slide[6] --prop 'name=!!footer-line' \
  --prop x1=1cm --prop y1=17.5cm --prop x2=18cm --prop y2=17.5cm \
  --prop line=$LAVENDER --prop lineWidth=0.5pt
a /slide[6] --prop text="6 / 8" \
  --prop x=1cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# ════════════════════════════════════════════════════════════════════
# SLIDE 7: Process Steps – small left blob + botanical deco
# ════════════════════════════════════════════════════════════════════
echo "  S7: Process..."
sl
officecli set "$F" /slide[7] --prop background=$BG

# Small plum blob (morphs smaller from right sage)
a /slide[7] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=0cm --prop y=2.5cm --prop width=9cm --prop height=16.55cm \
  --prop fill=$PLUM --prop line=none --prop geometry="$BSM"

a /slide[7] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=0.5cm --prop y=5cm --prop width=7.5cm --prop height=11cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# SVG deco on blob
sparkle /slide[7] 1.2  2.8  0.6 $GOLD_LT
sparkle /slide[7] 7.5  2.5  0.45 $WHITE
sparkle /slide[7] 2    17.5 0.4 $WHITE
drop_deco /slide[7] 6.8 16.5 0.7 1.1 $ROSE

# Botanical deco: leaf cluster right side
leaf_deco /slide[7] 31   13.5 1.1 1.8 $SAGE_LT
leaf_deco /slide[7] 32.2 12.8 0.9 1.5 $MINT
leaf_deco /slide[7] 32.5 14.8 0.8 1.3 $LAVENDER
drop_deco /slide[7] 31.8 15.8 0.7 1.1 $ROSE
ring      /slide[7] 30.5 13   2.5 $LAVENDER 1.0

navbar /slide[7]

a /slide[7] --prop text="Our Process" \
  --prop x=10.5cm --prop y=1.8cm --prop width=22cm --prop height=1.5cm \
  --prop size=26 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
c /slide[7] --prop 'name=!!title-accent' \
  --prop x1=10.5cm --prop y1=3.5cm --prop x2=21cm --prop y2=3.5cm \
  --prop line=$GOLD --prop lineWidth=1.5pt

# Step 1
a /slide[7] --prop preset=ellipse \
  --prop x=10.5cm --prop y=4.0cm --prop width=1.2cm --prop height=1.2cm \
  --prop fill=$PLUM --prop line=none \
  --prop text="01" --prop color=$WHITE --prop size=9 \
  --prop bold=true --prop align=center --prop valign=center
a /slide[7] --prop text="Select Ingredients" \
  --prop x=12.3cm --prop y=4.0cm --prop width=18cm --prop height=1.0cm \
  --prop size=12 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[7] --prop text="We source only the finest local and imported ingredients each morning." \
  --prop x=12.3cm --prop y=5.1cm --prop width=18cm --prop height=1.5cm \
  --prop size=8.5 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top
c /slide[7] \
  --prop x1=11.1cm --prop y1=5.2cm --prop x2=11.1cm --prop y2=8.5cm \
  --prop line=$LAVENDER --prop lineWidth=1pt

# Step 2
a /slide[7] --prop preset=ellipse \
  --prop x=10.5cm --prop y=8.5cm --prop width=1.2cm --prop height=1.2cm \
  --prop fill=$SAGE --prop line=none \
  --prop text="02" --prop color=$WHITE --prop size=9 \
  --prop bold=true --prop align=center --prop valign=center
a /slide[7] --prop text="Craft & Bake" \
  --prop x=12.3cm --prop y=8.5cm --prop width=18cm --prop height=1.0cm \
  --prop size=12 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[7] --prop text="Our master bakers handcraft every item with care and precision daily." \
  --prop x=12.3cm --prop y=9.6cm --prop width=18cm --prop height=1.5cm \
  --prop size=8.5 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top
c /slide[7] \
  --prop x1=11.1cm --prop y1=9.7cm --prop x2=11.1cm --prop y2=13.0cm \
  --prop line=$LAVENDER --prop lineWidth=1pt

# Step 3
a /slide[7] --prop preset=ellipse \
  --prop x=10.5cm --prop y=13.0cm --prop width=1.2cm --prop height=1.2cm \
  --prop fill=$ROSE_MID --prop line=none \
  --prop text="03" --prop color=$WHITE --prop size=9 \
  --prop bold=true --prop align=center --prop valign=center
a /slide[7] --prop text="Deliver Fresh" \
  --prop x=12.3cm --prop y=13.0cm --prop width=18cm --prop height=1.0cm \
  --prop size=12 --prop bold=true --prop color=$TEXT \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[7] --prop text="Delivered fresh within hours of baking to preserve perfect taste." \
  --prop x=12.3cm --prop y=14.1cm --prop width=18cm --prop height=1.5cm \
  --prop size=8.5 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top

c /slide[7] --prop 'name=!!footer-line' \
  --prop x1=10.5cm --prop y1=17.5cm --prop x2=33cm --prop y2=17.5cm \
  --prop line=$LAVENDER --prop lineWidth=0.5pt
a /slide[7] --prop text="7 / 8" \
  --prop x=10.5cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# ════════════════════════════════════════════════════════════════════
# SLIDE 8: Contact / CTA – dreamy rose bg, cream center blob
# ════════════════════════════════════════════════════════════════════
echo "  S8: CTA..."
sl
officecli set "$F" /slide[8] --prop background=152E22

# Center cream blob (morphs from small left to large center)
a /slide[8] --prop 'name=!!blob-main' --prop preset=rect \
  --prop x=3.5cm --prop y=1.5cm --prop width=27cm --prop height=16cm \
  --prop fill=$BG --prop line=none --prop geometry="$BCT"

# SVG deco: sparkles scattered on dark bg
sparkle /slide[8] 0.5  1.0  0.8 $LAVENDER
sparkle /slide[8] 32   2.0  0.65 $GOLD_LT
sparkle /slide[8] 1.5  16.5 0.5 $ROSE
sparkle /slide[8] 32.5 16.0 0.6 $LAVENDER
sparkle /slide[8] 1.0  9.0  0.45 $GOLD_LT
sparkle /slide[8] 33   9.5  0.4 $ROSE
# Rings on dark bg
ring /slide[8] 0    0    4.5 $LAVENDER 0.8
ring /slide[8] 29   15   5.0 $LAVENDER 0.8
ring /slide[8] 30   0    3.5 $ROSE_MID 0.6

# Leaf deco bottom-left on dark bg
leaf_deco /slide[8] 0   14.5 1.2 2.0 $LAVENDER
leaf_deco /slide[8] 1.2 15.0 0.9 1.5 $ROSE

# Food image inside center blob
a /slide[8] --prop 'name=!!hero-img' --prop preset=ellipse \
  --prop x=17cm --prop y=3cm --prop width=11cm --prop height=13cm \
  --prop fill=C86830 --prop line=none \
  --prop text="[food photo]" --prop color=$GOLD_LT \
  --prop size=8 --prop align=center --prop valign=bottom

# SVG deco inside cream blob
sparkle /slide[8] 5.5  2.5  0.5 $GOLD_LT
sparkle /slide[8] 16   14.5 0.45 $LAVENDER_MID
leaf_deco /slide[8] 15.5 3.0 0.8 1.2 $SAGE_LT

# CTA text (left zone of blob, safe)
a /slide[8] --prop text="Taste the" \
  --prop x=5cm --prop y=4.5cm --prop width=12cm --prop height=2cm \
  --prop size=34 --prop bold=true --prop color=$PLUM \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
a /slide[8] --prop text="Difference" \
  --prop x=5cm --prop y=6.7cm --prop width=12cm --prop height=2cm \
  --prop size=34 --prop bold=true --prop color=$PLUM \
  --prop fill=none --prop line=none --prop align=left --prop valign=center
c /slide[8] --prop 'name=!!title-accent' \
  --prop x1=5cm --prop y1=9cm --prop x2=14cm --prop y2=9cm \
  --prop line=$GOLD --prop lineWidth=1.5pt
a /slide[8] --prop text="Visit us at our downtown cafe or order online for same-day delivery." \
  --prop x=5cm --prop y=9.4cm --prop width=11cm --prop height=2cm \
  --prop size=9 --prop color=$MID --prop fill=none --prop line=none \
  --prop align=left --prop valign=top

# CTA button (plum rounded)
a /slide[8] --prop 'name=!!cta-btn' --prop preset=roundRect \
  --prop x=5cm --prop y=12cm --prop width=5.5cm --prop height=1.3cm \
  --prop fill=$PLUM --prop line=none \
  --prop text="Order Now >" --prop color=$WHITE \
  --prop size=9.5 --prop bold=true --prop align=center --prop valign=center

# Logo (top-left on dark bg)
a /slide[8] --prop preset=roundRect \
  --prop x=0.5cm --prop y=0.28cm --prop width=2.6cm --prop height=0.62cm \
  --prop fill=$BG --prop line=none \
  --prop text="Sweet Bliss" --prop color=$PLUM \
  --prop size=7.5 --prop bold=true --prop align=center --prop valign=center
a /slide[8] --prop text="Home   About Us   Project   Blog   Reservation" \
  --prop x=7cm --prop y=0.3cm --prop width=22cm --prop height=0.6cm \
  --prop size=8 --prop color=$LAVENDER --prop fill=none --prop line=none \
  --prop align=left --prop valign=center

# Contact info footer
a /slide[8] --prop text="sweetbliss@example.com  |  +1 (555) 234-5678" \
  --prop x=2cm --prop y=16.5cm --prop width=16cm --prop height=0.8cm \
  --prop size=8 --prop color=$LAVENDER --prop fill=none --prop line=none \
  --prop align=center --prop valign=center
a /slide[8] --prop text="@sweetbliss  |  sweetbliss.com" \
  --prop x=19cm --prop y=16.5cm --prop width=14cm --prop height=0.8cm \
  --prop size=8 --prop color=$LAVENDER --prop fill=none --prop line=none \
  --prop align=center --prop valign=center

c /slide[8] --prop 'name=!!footer-line' \
  --prop x1=0cm --prop y1=17.5cm --prop x2=33.87cm --prop y2=17.5cm \
  --prop line=$LAVENDER_MID --prop lineWidth=0.5pt
a /slide[8] --prop text="8 / 8" \
  --prop x=15.5cm --prop y=17.8cm --prop width=3cm --prop height=0.5cm \
  --prop size=7 --prop color=$LAVENDER --prop fill=none --prop line=none \
  --prop align=center --prop valign=center

# ── Apply morph transitions ──────────────────────────────────────────
echo "  Applying morph transitions..."
for n in 2 3 4 5 6 7 8; do
  officecli set "$F" /slide[$n] --prop transition=morph
done

echo ""
echo "Done -> $F"
