#!/bin/bash
set -e

# Build script for 12-duotone-split
# Duotone Split — bold two-color split screen with morph between different split ratios

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DECK="$SCRIPT_DIR/mixed__duotone_split.pptx"

echo "Building: mixed--duotone-split (Duotone Split)"

# Clean up if exists
rm -f "$DECK"

# Create deck + slide 1
officecli create "$DECK"
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFFFF

###############################################################################
# SLIDE 1 — hero: 50/50 left-right split
# Dark left: 0,0 -> 16.63 x 19.05
# Divider:   16.63,0 -> 0.3 x 19.05
# Warm right: 16.93,0 -> 16.94 x 19.05
###############################################################################
echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!panel-dark","preset":"rect","fill":"2D3436",
    "x":"0cm","y":"0cm","width":"16.63cm","height":"19.05cm","opacity":"1.0"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!panel-warm","preset":"rect","fill":"E17055",
    "x":"16.93cm","y":"0cm","width":"16.94cm","height":"19.05cm","opacity":"1.0"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!divider","preset":"rect","fill":"FFFFFF",
    "x":"16.63cm","y":"0cm","width":"0.3cm","height":"19.05cm","opacity":"1.0"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!accent-dot-1","preset":"ellipse","fill":"FFFFFF",
    "x":"2cm","y":"13cm","width":"3cm","height":"3cm","opacity":"0.15"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!accent-dot-2","preset":"ellipse","fill":"E17055",
    "x":"12cm","y":"1cm","width":"2cm","height":"2cm","opacity":"0.3"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!accent-line","preset":"rect","fill":"FFFFFF",
    "x":"1.2cm","y":"11cm","width":"8cm","height":"0.08cm","opacity":"0.4"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"Form Follows\nFunction","font":"Segoe UI Black",
    "size":"54","bold":"true","color":"FFFFFF",
    "x":"1.2cm","y":"3cm","width":"14cm","height":"6cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-subtitle","text":"Architecture Studio","font":"Segoe UI Light",
    "size":"24","color":"FFFFFF",
    "x":"1.2cm","y":"9cm","width":"14cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!body-text","text":"","font":"Segoe UI Light",
    "size":"18","color":"FFFFFF",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-1-num","text":"","font":"Segoe UI Black",
    "size":"48","color":"FFFFFF",
    "x":"36cm","y":"5cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-1-label","text":"","font":"Segoe UI Light",
    "size":"18","color":"FFFFFF",
    "x":"36cm","y":"8cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-2-num","text":"","font":"Segoe UI Black",
    "size":"48","color":"FFFFFF",
    "x":"37cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-2-label","text":"","font":"Segoe UI Light",
    "size":"18","color":"FFFFFF",
    "x":"37cm","y":"5cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-3-num","text":"","font":"Segoe UI Black",
    "size":"48","color":"FFFFFF",
    "x":"37cm","y":"8cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-3-label","text":"","font":"Segoe UI Light",
    "size":"18","color":"FFFFFF",
    "x":"37cm","y":"11cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-1","text":"","font":"Segoe UI Black",
    "size":"28","color":"FFFFFF",
    "x":"38cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-2","text":"","font":"Segoe UI Black",
    "size":"28","color":"FFFFFF",
    "x":"38cm","y":"5cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-3","text":"","font":"Segoe UI Black",
    "size":"28","color":"FFFFFF",
    "x":"38cm","y":"8cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-text","text":"","font":"Segoe UI Black",
    "size":"48","color":"FFFFFF",
    "x":"38cm","y":"11cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch "$DECK"

# Clone slide 1 four times for slides 2-5
officecli add "$DECK" '/' --from '/slide[1]' && \
officecli add "$DECK" '/' --from '/slide[1]' && \
officecli add "$DECK" '/' --from '/slide[1]' && \
officecli add "$DECK" '/' --from '/slide[1]'

# Set morph transitions on slides 2-5
echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch "$DECK"

###############################################################################
# SLIDE 2 — statement: 70/30 top-bottom
# Dark top: 0,0 -> 33.87 x 13.04
# Divider:  0,13.04 -> 33.87 x 0.3
# Warm bot: 0,13.34 -> 33.87 x 5.71
###############################################################################
echo '[
  {"command":"set","path":"/slide[2]/shape[1]","props":{
    "x":"0cm","y":"0cm","width":"33.87cm","height":"13.04cm"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{
    "x":"0cm","y":"13.34cm","width":"33.87cm","height":"5.71cm"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{
    "x":"0cm","y":"13.04cm","width":"33.87cm","height":"0.3cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{
    "x":"28cm","y":"1cm","width":"3cm","height":"3cm"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{
    "x":"4cm","y":"14.5cm","width":"2cm","height":"2cm","opacity":"0.4"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{
    "x":"22cm","y":"5cm","width":"8cm","height":"0.08cm"}},

  {"command":"set","path":"/slide[2]/shape[7]","props":{
    "text":"Every Line Has\na Purpose","size":"64","color":"FFFFFF",
    "x":"2cm","y":"2.5cm","width":"30cm","height":"7cm"}},
  {"command":"set","path":"/slide[2]/shape[7]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{
    "text":"","x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch "$DECK"

###############################################################################
# SLIDE 3 — pillars: Dark shrinks to left 30%, warm expands right 70%
# Dark left: 0,0 -> 10.16 x 19.05
# Divider:   10.16,0 -> 0.3 x 19.05
# Warm right: 10.46,0 -> 23.41 x 19.05
###############################################################################
echo '[
  {"command":"set","path":"/slide[3]/shape[1]","props":{
    "x":"0cm","y":"0cm","width":"10.16cm","height":"19.05cm"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{
    "x":"10.46cm","y":"0cm","width":"23.41cm","height":"19.05cm"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{
    "x":"10.16cm","y":"0cm","width":"0.3cm","height":"19.05cm"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{
    "x":"1cm","y":"14cm","width":"3cm","height":"3cm","opacity":"0.15"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{
    "x":"30cm","y":"14cm","width":"2cm","height":"2cm","opacity":"0.3"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{
    "x":"12cm","y":"16cm","width":"8cm","height":"0.08cm","opacity":"0.4"}},

  {"command":"set","path":"/slide[3]/shape[7]","props":{
    "text":"Our\nPillars","size":"40","color":"FFFFFF",
    "x":"1.2cm","y":"2cm","width":"8cm","height":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{
    "text":"Three ideas that drive everything we do","size":"16","color":"FFFFFF",
    "x":"1.2cm","y":"7cm","width":"8cm","height":"3cm"}},

  {"command":"set","path":"/slide[3]/shape[16]","props":{
    "text":"Concept","size":"28","color":"FFFFFF",
    "x":"12cm","y":"2.5cm","width":"10cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{
    "text":"Build","size":"28","color":"FFFFFF",
    "x":"12cm","y":"7cm","width":"10cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{
    "text":"Live","size":"28","color":"FFFFFF",
    "x":"12cm","y":"11.5cm","width":"10cm","height":"3cm"}}
]' | officecli batch "$DECK"

###############################################################################
# SLIDE 4 — evidence/diagonal: Dark rotated covers top-left, warm bottom-right
# Dark: large rect rotated -10deg, positioned to cover top-left ~60%
# Warm: large rect rotated -10deg, positioned to cover bottom-right ~40%
###############################################################################
echo '[
  {"command":"set","path":"/slide[4]/shape[1]","props":{
    "x":"0cm","y":"0cm","width":"28cm","height":"19.05cm","rotation":"-8"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{
    "x":"10cm","y":"6cm","width":"28cm","height":"18cm","rotation":"-8"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{
    "x":"8cm","y":"3cm","width":"0.3cm","height":"22cm","rotation":"-8"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{
    "x":"3cm","y":"2cm","width":"3cm","height":"3cm","opacity":"0.15"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{
    "x":"26cm","y":"14cm","width":"2cm","height":"2cm","opacity":"0.3"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{
    "x":"2cm","y":"8cm","width":"8cm","height":"0.08cm","opacity":"0.4"}},

  {"command":"set","path":"/slide[4]/shape[7]","props":{
    "text":"Our Impact","size":"40","color":"FFFFFF",
    "x":"1.2cm","y":"1cm","width":"14cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{
    "text":"","x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},

  {"command":"set","path":"/slide[4]/shape[10]","props":{
    "text":"85","size":"64","color":"FFFFFF",
    "x":"1.2cm","y":"4.5cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[11]","props":{
    "text":"Projects","size":"18","color":"FFFFFF",
    "x":"1.2cm","y":"7.5cm","width":"8cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[12]","props":{
    "text":"12","size":"64","color":"FFFFFF",
    "x":"1.2cm","y":"10cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[13]","props":{
    "text":"Countries","size":"18","color":"FFFFFF",
    "x":"1.2cm","y":"13cm","width":"8cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[14]","props":{
    "text":"3","size":"64","color":"FFFFFF",
    "x":"20cm","y":"10cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{
    "text":"Pritzker Nominations","size":"18","color":"FFFFFF",
    "x":"20cm","y":"13cm","width":"10cm","height":"1.5cm"}}
]' | officecli batch "$DECK"

###############################################################################
# SLIDE 5 — cta: Dark expands 80% as full backdrop, warm = small accent bar bottom
# Dark: 0,0 -> 33.87 x 15.24 (80%)
# Divider: 0,15.24 -> 33.87 x 0.3
# Warm bar: 0,15.54 -> 33.87 x 3.51
###############################################################################
echo '[
  {"command":"set","path":"/slide[5]/shape[1]","props":{
    "x":"0cm","y":"0cm","width":"33.87cm","height":"15.24cm","rotation":"0"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{
    "x":"0cm","y":"15.54cm","width":"33.87cm","height":"3.51cm","rotation":"0"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{
    "x":"0cm","y":"15.24cm","width":"33.87cm","height":"0.3cm","rotation":"0"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{
    "x":"28cm","y":"2cm","width":"3cm","height":"3cm","opacity":"0.15"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{
    "x":"2cm","y":"16cm","width":"2cm","height":"2cm","opacity":"0.3"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{
    "x":"10cm","y":"7cm","width":"8cm","height":"0.08cm","opacity":"0.4"}},

  {"command":"set","path":"/slide[5]/shape[7]","props":{
    "text":"See Our Work","size":"64","color":"FFFFFF",
    "x":"2cm","y":"3cm","width":"30cm","height":"5cm"}},
  {"command":"set","path":"/slide[5]/shape[7]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{
    "text":"architecture@studio.com","size":"20","color":"FFFFFF",
    "x":"2cm","y":"8.5cm","width":"30cm","height":"2cm"}},
  {"command":"set","path":"/slide[5]/shape[8]/paragraph[1]","props":{"align":"center"}},

  {"command":"set","path":"/slide[5]/shape[19]","props":{
    "text":"","x":"38cm","y":"11cm","width":"0.1cm","height":"0.1cm"}},

  {"command":"set","path":"/slide[5]/shape[10]","props":{"x":"36cm","y":"5cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[11]","props":{"x":"36cm","y":"8cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[12]","props":{"x":"37cm","y":"2cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[13]","props":{"x":"37cm","y":"5cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[14]","props":{"x":"37cm","y":"8cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[15]","props":{"x":"37cm","y":"11cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[16]","props":{"x":"38cm","y":"2cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[17]","props":{"x":"38cm","y":"5cm","text":""}},
  {"command":"set","path":"/slide[5]/shape[18]","props":{"x":"38cm","y":"8cm","text":""}}
]' | officecli batch "$DECK"

# Validate and review
echo "Validating..."
bash "$(dirname "$0")/../../morph-helpers.sh" validate "$DECK"

echo "✅ Build complete: $DECK"
