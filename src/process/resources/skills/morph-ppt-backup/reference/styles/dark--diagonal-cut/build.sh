#!/bin/bash
set -e

# Build script for 09-diagonal-cut
# "Diagonal Cut" — bold diagonal slashes, KARBON/industrial inspired

DECK="morph-templates/09-diagonal-cut/template.pptx"
cd /Users/veryliu/Documents/GitHub/OfficeCli

# Clean start
rm -f "$DECK"
officecli create "$DECK"

# ============================================================
# SLIDE 1 — Hero: "CUT THROUGH"
# Layout: bold diagonal slashes radiating across canvas
# ============================================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1A1A1A

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!slash-orange","preset":"rect","fill":"FF6600",
    "x":"0cm","y":"2cm","width":"30cm","height":"6cm","rotation":"35","opacity":"0.9"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!slash-white","preset":"rect","fill":"FFFFFF",
    "x":"5cm","y":"8cm","width":"25cm","height":"4cm","rotation":"-30","opacity":"0.15"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!slash-yellow","preset":"rect","fill":"FFCC00",
    "x":"18cm","y":"12cm","width":"20cm","height":"3cm","rotation":"40","opacity":"0.85"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!slash-gray","preset":"rect","fill":"333333",
    "x":"0cm","y":"10cm","width":"28cm","height":"5cm","rotation":"-35","opacity":"0.7"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cut-line-1","preset":"rect","fill":"FF6600",
    "x":"0cm","y":"6cm","width":"34cm","height":"0.15cm","rotation":"30","opacity":"1.0"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cut-line-2","preset":"rect","fill":"FFFFFF",
    "x":"2cm","y":"14cm","width":"34cm","height":"0.1cm","rotation":"-25","opacity":"0.3"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-orange","preset":"ellipse","fill":"FF6600",
    "x":"29cm","y":"1cm","width":"3cm","height":"3cm","opacity":"0.9"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-yellow","preset":"ellipse","fill":"FFCC00",
    "x":"1.2cm","y":"15cm","width":"2cm","height":"2cm","opacity":"0.8"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"CUT THROUGH","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"FFFFFF",
    "x":"2cm","y":"4.5cm","width":"26cm","height":"5cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-subtitle","text":"Industrial Design Co.","font":"Segoe UI",
    "size":"24","color":"CCCCCC",
    "x":"2cm","y":"10cm","width":"20cm","height":"2.5cm","fill":"none"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 2 — Statement: "Precision Meets Power"
# Slashes shift dramatically: rotation +20deg, position 8-12cm
# ============================================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1A1A1A

echo '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!slash-orange","preset":"rect","fill":"FF6600",
    "x":"8cm","y":"0cm","width":"30cm","height":"6cm","rotation":"55","opacity":"0.9"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!slash-white","preset":"rect","fill":"FFFFFF",
    "x":"0cm","y":"5cm","width":"25cm","height":"4cm","rotation":"-5","opacity":"0.15"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!slash-yellow","preset":"rect","fill":"FFCC00",
    "x":"22cm","y":"14cm","width":"20cm","height":"3cm","rotation":"15","opacity":"0.85"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!slash-gray","preset":"rect","fill":"333333",
    "x":"10cm","y":"0cm","width":"28cm","height":"5cm","rotation":"-60","opacity":"0.7"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!cut-line-1","preset":"rect","fill":"FF6600",
    "x":"0cm","y":"12cm","width":"34cm","height":"0.15cm","rotation":"55","opacity":"1.0"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!cut-line-2","preset":"rect","fill":"FFFFFF",
    "x":"6cm","y":"2cm","width":"34cm","height":"0.1cm","rotation":"-50","opacity":"0.3"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!dot-orange","preset":"ellipse","fill":"FF6600",
    "x":"2cm","y":"14cm","width":"3cm","height":"3cm","opacity":"0.9"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!dot-yellow","preset":"ellipse","fill":"FFCC00",
    "x":"30cm","y":"2cm","width":"2cm","height":"2cm","opacity":"0.8"}},

  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!hero-title","text":"Precision Meets Power","font":"Segoe UI Black",
    "size":"64","bold":"true","color":"FFFFFF",
    "x":"3cm","y":"5.5cm","width":"28cm","height":"5cm","fill":"none"}},
  {"command":"set","path":"/slide[2]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!hero-subtitle","text":"Where engineering excellence meets bold design","font":"Segoe UI",
    "size":"20","color":"CCCCCC",
    "x":"5cm","y":"11cm","width":"24cm","height":"2cm","fill":"none"}},
  {"command":"set","path":"/slide[2]/shape[10]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 3 — Pillars: "Engineer / Design / Deliver"
# Slashes morph into vertical column dividers (still angled)
# ============================================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1A1A1A

echo '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!slash-orange","preset":"rect","fill":"FF6600",
    "x":"9cm","y":"0cm","width":"3cm","height":"24cm","rotation":"8","opacity":"0.12"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!slash-white","preset":"rect","fill":"FFFFFF",
    "x":"20.5cm","y":"0cm","width":"3cm","height":"24cm","rotation":"-8","opacity":"0.08"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!slash-yellow","preset":"rect","fill":"FFCC00",
    "x":"0cm","y":"0cm","width":"0.4cm","height":"19.05cm","rotation":"0","opacity":"0.7"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!slash-gray","preset":"rect","fill":"333333",
    "x":"0cm","y":"17cm","width":"33.87cm","height":"2.5cm","rotation":"-3","opacity":"0.5"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!cut-line-1","preset":"rect","fill":"FF6600",
    "x":"0cm","y":"4.5cm","width":"33.87cm","height":"0.15cm","rotation":"2","opacity":"0.8"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!cut-line-2","preset":"rect","fill":"FFFFFF",
    "x":"0cm","y":"16cm","width":"33.87cm","height":"0.1cm","rotation":"-1","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!dot-orange","preset":"ellipse","fill":"FF6600",
    "x":"31cm","y":"0.8cm","width":"2cm","height":"2cm","opacity":"0.9"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!dot-yellow","preset":"ellipse","fill":"FFCC00",
    "x":"16cm","y":"16.5cm","width":"1.5cm","height":"1.5cm","opacity":"0.7"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!pillar-title","text":"What We Build","font":"Segoe UI Black",
    "size":"40","bold":"true","color":"FFFFFF",
    "x":"1.2cm","y":"0.8cm","width":"20cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p1-num","text":"01","font":"Segoe UI Black",
    "size":"48","color":"FF6600",
    "x":"1.2cm","y":"5.5cm","width":"8cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p1-title","text":"Engineer","font":"Segoe UI Black",
    "size":"28","color":"FFFFFF",
    "x":"1.2cm","y":"8cm","width":"8cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p1-desc","text":"Structural integrity through precision engineering","font":"Segoe UI",
    "size":"14","color":"CCCCCC",
    "x":"1.2cm","y":"10cm","width":"8cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p2-num","text":"02","font":"Segoe UI Black",
    "size":"48","color":"FFCC00",
    "x":"12.4cm","y":"5.5cm","width":"8cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p2-title","text":"Design","font":"Segoe UI Black",
    "size":"28","color":"FFFFFF",
    "x":"12.4cm","y":"8cm","width":"8cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p2-desc","text":"Bold aesthetics that command attention","font":"Segoe UI",
    "size":"14","color":"CCCCCC",
    "x":"12.4cm","y":"10cm","width":"8cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p3-num","text":"03","font":"Segoe UI Black",
    "size":"48","color":"FFFFFF",
    "x":"23.6cm","y":"5.5cm","width":"8cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p3-title","text":"Deliver","font":"Segoe UI Black",
    "size":"28","color":"FFFFFF",
    "x":"23.6cm","y":"8cm","width":"8cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!p3-desc","text":"On time, on spec, every single build","font":"Segoe UI",
    "size":"14","color":"CCCCCC",
    "x":"23.6cm","y":"10cm","width":"8cm","height":"3cm","fill":"none"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 4 — Evidence: "500+ Units / 99.8% QC / 24/7 Ops"
# Asymmetric layout: slashes frame data at angles
# ============================================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1A1A1A

echo '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!slash-orange","preset":"rect","fill":"FF6600",
    "x":"0cm","y":"0cm","width":"30cm","height":"6cm","rotation":"-40","opacity":"0.5"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!slash-white","preset":"rect","fill":"FFFFFF",
    "x":"16cm","y":"6cm","width":"25cm","height":"4cm","rotation":"45","opacity":"0.1"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!slash-yellow","preset":"rect","fill":"FFCC00",
    "x":"20cm","y":"2cm","width":"20cm","height":"3cm","rotation":"-25","opacity":"0.45"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!slash-gray","preset":"rect","fill":"333333",
    "x":"0cm","y":"14cm","width":"28cm","height":"5cm","rotation":"20","opacity":"0.6"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!cut-line-1","preset":"rect","fill":"FF6600",
    "x":"2cm","y":"0cm","width":"34cm","height":"0.15cm","rotation":"-35","opacity":"1.0"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!cut-line-2","preset":"rect","fill":"FFFFFF",
    "x":"0cm","y":"8cm","width":"34cm","height":"0.1cm","rotation":"40","opacity":"0.3"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!dot-orange","preset":"ellipse","fill":"FF6600",
    "x":"14cm","y":"1cm","width":"3.5cm","height":"3.5cm","opacity":"0.8"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!dot-yellow","preset":"ellipse","fill":"FFCC00",
    "x":"28cm","y":"15cm","width":"2.5cm","height":"2.5cm","opacity":"0.7"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!evidence-title","text":"Our Numbers","font":"Segoe UI Black",
    "size":"40","bold":"true","color":"FFFFFF",
    "x":"1.2cm","y":"1cm","width":"16cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!ev1-num","text":"500+","font":"Segoe UI Black",
    "size":"64","color":"FF6600",
    "x":"1.2cm","y":"5cm","width":"14cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!ev1-label","text":"Units Manufactured","font":"Segoe UI",
    "size":"20","color":"CCCCCC",
    "x":"1.2cm","y":"8.5cm","width":"14cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!ev2-num","text":"99.8%","font":"Segoe UI Black",
    "size":"64","color":"FFCC00",
    "x":"19cm","y":"3cm","width":"14cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!ev2-label","text":"Quality Control Pass Rate","font":"Segoe UI",
    "size":"20","color":"CCCCCC",
    "x":"19cm","y":"6.5cm","width":"14cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!ev3-num","text":"24/7","font":"Segoe UI Black",
    "size":"64","color":"FFFFFF",
    "x":"8cm","y":"12cm","width":"14cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!ev3-label","text":"Operations Running","font":"Segoe UI",
    "size":"20","color":"CCCCCC",
    "x":"8cm","y":"15.5cm","width":"14cm","height":"2cm","fill":"none"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 5 — CTA: "Build With Us"
# Slashes return to bold scattered diagonal pattern
# ============================================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1A1A1A

echo '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!slash-orange","preset":"rect","fill":"FF6600",
    "x":"4cm","y":"6cm","width":"30cm","height":"6cm","rotation":"-35","opacity":"0.9"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!slash-white","preset":"rect","fill":"FFFFFF",
    "x":"0cm","y":"12cm","width":"25cm","height":"4cm","rotation":"30","opacity":"0.15"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!slash-yellow","preset":"rect","fill":"FFCC00",
    "x":"0cm","y":"0cm","width":"20cm","height":"3cm","rotation":"-40","opacity":"0.85"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!slash-gray","preset":"rect","fill":"333333",
    "x":"12cm","y":"4cm","width":"28cm","height":"5cm","rotation":"35","opacity":"0.7"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cut-line-1","preset":"rect","fill":"FF6600",
    "x":"0cm","y":"3cm","width":"34cm","height":"0.15cm","rotation":"-30","opacity":"1.0"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cut-line-2","preset":"rect","fill":"FFFFFF",
    "x":"0cm","y":"16cm","width":"34cm","height":"0.1cm","rotation":"25","opacity":"0.3"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!dot-orange","preset":"ellipse","fill":"FF6600",
    "x":"1cm","y":"2cm","width":"3cm","height":"3cm","opacity":"0.9"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!dot-yellow","preset":"ellipse","fill":"FFCC00",
    "x":"30cm","y":"14cm","width":"2cm","height":"2cm","opacity":"0.8"}},

  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cta-title","text":"Build With Us","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"FFFFFF",
    "x":"3cm","y":"4cm","width":"28cm","height":"5cm","fill":"none"}},
  {"command":"set","path":"/slide[5]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cta-contact","text":"contact@industrialdesign.co","font":"Segoe UI",
    "size":"24","color":"FF6600",
    "x":"3cm","y":"10cm","width":"28cm","height":"2cm","fill":"none"}},
  {"command":"set","path":"/slide[5]/shape[10]/paragraph[1]","props":{"align":"center"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cta-tagline","text":"Precision. Power. Performance.","font":"Segoe UI",
    "size":"18","color":"CCCCCC",
    "x":"3cm","y":"12.5cm","width":"28cm","height":"2cm","fill":"none"}},
  {"command":"set","path":"/slide[5]/shape[11]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

# ============================================================
# Set morph transitions on slides 2-5
# ============================================================
echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch "$DECK"

# ============================================================
# Validate & inspect
# ============================================================
officecli validate "$DECK"
officecli view "$DECK" outline
