#!/bin/bash
# DevCon 2025 Retro Terminal Morph PPT
# Style: S20 Retro Terminal - terminal black bg, green text, monospace, rect only
# Colors: 0D1117 (bg), 00FF41 (terminal green), 39FF14 (bright green), 1A3A1A (panel)

PPTX="/Users/veryliu/Documents/GitHub/OfficeCli/.tmp/morph-test/test18-devcon-terminal.pptx"

echo "Creating presentation..."
officecli create "$PPTX"

####################
# SLIDE 1: Hero - Single centered terminal window
####################
echo "Building Slide 1: Hero..."
officecli add "$PPTX" / --type slide --prop layout=blank --prop title="Hero"

# Background - terminal black
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill=0D1117 --prop line=none

# Title - terminal green, 44pt monospace
officecli add "$PPTX" '/slide[1]' --type shape --prop text="DevCon 2025 开发者大会" --prop x=6.5cm --prop y=3cm --prop width=20cm --prop height=3cm --prop size=44pt --prop color=00FF41 --prop font="Courier New" --prop align=center --prop bold=true

# Central terminal window
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=11.5cm --prop y=7.5cm --prop width=10cm --prop height=6cm --prop fill=1A3A1A --prop opacity=0.8 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

# Code lines inside terminal
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=12cm --prop y=8cm --prop width=6cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=12cm --prop y=8.8cm --prop width=5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=12cm --prop y=9.6cm --prop width=7cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=12cm --prop y=10.4cm --prop width=4.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=12cm --prop y=11.2cm --prop width=6.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none

# Cursor - center of terminal
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=16.5cm --prop y=12.2cm --prop width=0.4cm --prop height=0.8cm --prop fill=39FF14 --prop opacity=0.9 --prop line=none

# Scanlines for retro effect
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=4cm --prop y=5cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=4cm --prop y=9cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[1]' --type shape --prop preset=rect --prop x=4cm --prop y=13cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none

####################
# SLIDE 2: Three Pillars - 3 terminal windows (MORPH transition!)
####################
echo "Building Slide 2: Three Pillars..."
officecli add "$PPTX" / --type slide --prop layout=blank --prop title="Pillars"

# Background
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill=0D1117 --prop line=none

# Title
officecli add "$PPTX" '/slide[2]' --type shape --prop text="三大主题" --prop x=8cm --prop y=1.5cm --prop width=18cm --prop height=2cm --prop size=40pt --prop color=00FF41 --prop font="Courier New" --prop align=center --prop bold=true

# Left terminal: AI Native
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=2cm --prop y=5cm --prop width=8.5cm --prop height=6cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[2]' --type shape --prop text="AI Native" --prop x=2.5cm --prop y=5.5cm --prop width=7.5cm --prop height=1.5cm --prop size=22pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=2.5cm --prop y=7.5cm --prop width=5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=2.5cm --prop y=8.3cm --prop width=6cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=2.5cm --prop y=9.1cm --prop width=4.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none

# Center terminal: WebAssembly
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=12.5cm --prop y=5cm --prop width=8.5cm --prop height=6cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[2]' --type shape --prop text="WebAssembly" --prop x=13cm --prop y=5.5cm --prop width=7.5cm --prop height=1.5cm --prop size=22pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=13cm --prop y=7.5cm --prop width=6.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=13cm --prop y=8.3cm --prop width=5.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=13cm --prop y=9.1cm --prop width=7cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none

# Right terminal: Edge Computing
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=23cm --prop y=5cm --prop width=8.5cm --prop height=6cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[2]' --type shape --prop text="Edge Computing" --prop x=23.5cm --prop y=5.5cm --prop width=7.5cm --prop height=1.5cm --prop size=22pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=23.5cm --prop y=7.5cm --prop width=5.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=23.5cm --prop y=8.3cm --prop width=6.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=23.5cm --prop y=9.1cm --prop width=4.8cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none

# Cursor - jumped to right terminal (main morph actor!)
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=27cm --prop y=9.8cm --prop width=0.4cm --prop height=0.8cm --prop fill=39FF14 --prop opacity=0.9 --prop line=none

# Scanlines - shifted positions
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=4cm --prop y=6cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=4cm --prop y=10cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[2]' --type shape --prop preset=rect --prop x=4cm --prop y=14cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none

# Set morph transition
officecli set "$PPTX" '/slide[2]' --prop transition=morph

####################
# SLIDE 3: Evidence - Statistics (MORPH)
####################
echo "Building Slide 3: Evidence..."
officecli add "$PPTX" / --type slide --prop layout=blank --prop title="Evidence"

# Background
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill=0D1117 --prop line=none

# Title
officecli add "$PPTX" '/slide[3]' --type shape --prop text="规模数据" --prop x=8cm --prop y=1.5cm --prop width=18cm --prop height=2cm --prop size=40pt --prop color=00FF41 --prop font="Courier New" --prop align=center --prop bold=true

# Top left terminal: 200+ 演讲
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=3cm --prop y=5.5cm --prop width=9cm --prop height=5.5cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[3]' --type shape --prop text="200+" --prop x=4cm --prop y=6.5cm --prop width=7cm --prop height=1.5cm --prop size=36pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[3]' --type shape --prop text="演讲" --prop x=4cm --prop y=8.5cm --prop width=7cm --prop height=1cm --prop size=18pt --prop color=00FF41 --prop font="Courier New"

# Top right terminal: 50+ Workshop
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=13.5cm --prop y=5.5cm --prop width=9cm --prop height=5.5cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[3]' --type shape --prop text="50+" --prop x=14.5cm --prop y=6.5cm --prop width=7cm --prop height=1.5cm --prop size=36pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[3]' --type shape --prop text="Workshop" --prop x=14.5cm --prop y=8.5cm --prop width=7cm --prop height=1cm --prop size=18pt --prop color=00FF41 --prop font="Courier New"

# Bottom right terminal: 5000+ 开发者
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=24cm --prop y=5.5cm --prop width=9cm --prop height=5.5cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[3]' --type shape --prop text="5000+" --prop x=25cm --prop y=6.5cm --prop width=7cm --prop height=1.5cm --prop size=36pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[3]' --type shape --prop text="开发者" --prop x=25cm --prop y=8.5cm --prop width=7cm --prop height=1cm --prop size=18pt --prop color=00FF41 --prop font="Courier New"

# Code decoration lines
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=3.5cm --prop y=9.8cm --prop width=5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.15 --prop line=none
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=14cm --prop y=9.8cm --prop width=5.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.15 --prop line=none
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=24.5cm --prop y=9.8cm --prop width=6cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.15 --prop line=none

# Cursor - jumped to bottom terminal
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=28cm --prop y=10.2cm --prop width=0.4cm --prop height=0.8cm --prop fill=39FF14 --prop opacity=0.9 --prop line=none

# Scanlines - drifted further
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=4cm --prop y=5.5cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=4cm --prop y=9.5cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[3]' --type shape --prop preset=rect --prop x=4cm --prop y=13.5cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none

# Set morph transition
officecli set "$PPTX" '/slide[3]' --prop transition=morph

####################
# SLIDE 4: Timeline - 3 day schedule (MORPH)
####################
echo "Building Slide 4: Timeline..."
officecli add "$PPTX" / --type slide --prop layout=blank --prop title="Timeline"

# Background
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill=0D1117 --prop line=none

# Title
officecli add "$PPTX" '/slide[4]' --type shape --prop text="议程安排" --prop x=8cm --prop y=1.5cm --prop width=18cm --prop height=2cm --prop size=40pt --prop color=00FF41 --prop font="Courier New" --prop align=center --prop bold=true

# Day 1 terminal
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=2.5cm --prop y=5cm --prop width=9cm --prop height=5.5cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[4]' --type shape --prop text="Day 1" --prop x=3cm --prop y=5.5cm --prop width=8cm --prop height=1.2cm --prop size=24pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[4]' --type shape --prop text="主题演讲" --prop x=3cm --prop y=7cm --prop width=8cm --prop height=1cm --prop size=18pt --prop color=00FF41 --prop font="Courier New"

officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=3.5cm --prop y=8.5cm --prop width=6cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=3.5cm --prop y=9.3cm --prop width=5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none

# Day 2 terminal
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=13cm --prop y=5cm --prop width=9cm --prop height=5.5cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[4]' --type shape --prop text="Day 2" --prop x=13.5cm --prop y=5.5cm --prop width=8cm --prop height=1.2cm --prop size=24pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[4]' --type shape --prop text="技术分享" --prop x=13.5cm --prop y=7cm --prop width=8cm --prop height=1cm --prop size=18pt --prop color=00FF41 --prop font="Courier New"

officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=14cm --prop y=8.5cm --prop width=5.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=14cm --prop y=9.3cm --prop width=6.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none

# Day 3 terminal
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=23.5cm --prop y=5cm --prop width=9cm --prop height=5.5cm --prop fill=1A3A1A --prop opacity=0.75 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.5

officecli add "$PPTX" '/slide[4]' --type shape --prop text="Day 3" --prop x=24cm --prop y=5.5cm --prop width=8cm --prop height=1.2cm --prop size=24pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

officecli add "$PPTX" '/slide[4]' --type shape --prop text="Hackathon" --prop x=24cm --prop y=7cm --prop width=8cm --prop height=1cm --prop size=18pt --prop color=00FF41 --prop font="Courier New"

officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=24.5cm --prop y=8.5cm --prop width=6.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=24.5cm --prop y=9.3cm --prop width=5.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.12 --prop line=none

# Cursor - jumped to Day 3 terminal
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=26cm --prop y=10cm --prop width=0.4cm --prop height=0.8cm --prop fill=39FF14 --prop opacity=0.9 --prop line=none

# Timeline connector (horizontal line)
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=3cm --prop y=12.5cm --prop width=28cm --prop height=0.08cm --prop fill=00FF41 --prop opacity=0.3 --prop line=none

# Scanlines
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=4cm --prop y=6.5cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=4cm --prop y=10.5cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[4]' --type shape --prop preset=rect --prop x=4cm --prop y=14.5cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none

# Set morph transition
officecli set "$PPTX" '/slide[4]' --prop transition=morph

####################
# SLIDE 5: CTA - Registration (MORPH)
####################
echo "Building Slide 5: CTA..."
officecli add "$PPTX" / --type slide --prop layout=blank --prop title="CTA"

# Background
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill=0D1117 --prop line=none

# Title terminal with command prompt
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=8cm --prop y=5cm --prop width=18cm --prop height=8cm --prop fill=1A3A1A --prop opacity=0.8 --prop lineColor=00FF41 --prop lineWidth=0.75pt --prop lineOpacity=0.6

# Command prompt text
officecli add "$PPTX" '/slide[5]' --type shape --prop text="$ register --early-bird" --prop x=9cm --prop y=6.5cm --prop width=16cm --prop height=2cm --prop size=36pt --prop color=39FF14 --prop font="Courier New" --prop bold=true

# Subtitle
officecli add "$PPTX" '/slide[5]' --type shape --prop text="立即注册享早鸟优惠" --prop x=9cm --prop y=9cm --prop width=16cm --prop height=1.5cm --prop size=20pt --prop color=00FF41 --prop font="Courier New"

# Code decoration lines
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=9cm --prop y=11cm --prop width=7cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.15 --prop line=none
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=9cm --prop y=11.8cm --prop width=5.5cm --prop height=0.3cm --prop fill=00FF41 --prop opacity=0.15 --prop line=none

# Cursor - final position at end of command
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=16.5cm --prop y=8.2cm --prop width=0.4cm --prop height=0.8cm --prop fill=39FF14 --prop opacity=0.9 --prop line=none

# Bottom info bar (horizontal terminal line)
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=4cm --prop y=15cm --prop width=26cm --prop height=0.5cm --prop fill=0D4B1A --prop opacity=0.6 --prop line=none

officecli add "$PPTX" '/slide[5]' --type shape --prop text="devcon2025.dev | #DevCon2025" --prop x=10cm --prop y=14.8cm --prop width=14cm --prop height=1cm --prop size=16pt --prop color=39FF14 --prop font="Courier New" --prop align=center

# Scanlines - final positions
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=4cm --prop y=7cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=4cm --prop y=11cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none
officecli add "$PPTX" '/slide[5]' --type shape --prop preset=rect --prop x=4cm --prop y=15cm --prop width=25cm --prop height=0.02cm --prop fill=00FF41 --prop opacity=0.05 --prop line=none

# Set morph transition
officecli set "$PPTX" '/slide[5]' --prop transition=morph

# ===== Validate and View =====
echo "Validating presentation..."
officecli validate "$PPTX"

echo "Viewing outline..."
officecli view "$PPTX" outline

echo ""
echo "==================================="
echo "✓ PPT Generated Successfully!"
echo "==================================="
echo "Output: $PPTX"
echo ""
echo "Slides:"
echo "  1. Hero - DevCon 2025 开发者大会"
echo "  2. Three Pillars - AI Native / WebAssembly / Edge Computing (MORPH)"
echo "  3. Evidence - 200+ 演讲 / 50+ Workshop / 5000+ 开发者 (MORPH)"
echo "  4. Timeline - Day 1→2→3 (MORPH)"
echo "  5. CTA - $ register --early-bird (MORPH)"
echo ""
echo "Style: S20 Retro Terminal"
echo "  - Terminal black bg (0D1117)"
echo "  - Terminal green text (00FF41, 39FF14)"
echo "  - Monospace font (Courier New)"
echo "  - Rect shapes only (no curves!)"
echo "  - Cursor morphs 8-12cm between slides"
echo "  - Terminal windows with green borders"
echo "  - Scanline effects for retro feel"
echo ""
