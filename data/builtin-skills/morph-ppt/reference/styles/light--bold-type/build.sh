#!/bin/bash
set -e

# Build script for 08-bold-type
# Typography-driven design — HUGE text IS the visual element
# Inspired by FONIAS / editorial magazine layouts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DECK="$SCRIPT_DIR/light__bold_type.pptx"

# Create deck + Slide 1 (blank, light warm gray background)
rm -f "$DECK"
officecli create "$DECK" && \
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F2F2F2

# ═══════════════════════════════════════════════════════════════
# SLIDE 1 — HERO: "MAKE IT BOLD" / "Design Studio"
# Giant "01" bottom-right, giant "B" top-left, red accent line
# ═══════════════════════════════════════════════════════════════

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!giant-num","text":"01","font":"Segoe UI Black","size":"200",
    "color":"1A1A1A","opacity":"0.06","bold":"true",
    "x":"18cm","y":"4cm","width":"18cm","height":"16cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!giant-letter","text":"B","font":"Segoe UI Black","size":"300",
    "color":"E8E8E8","opacity":"0.08","bold":"true",
    "x":"0cm","y":"0cm","width":"18cm","height":"22cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-red-h","preset":"rect","fill":"FF3C38",
    "x":"4cm","y":"11.2cm","width":"10cm","height":"0.1cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-red-v","preset":"rect","fill":"FF3C38",
    "x":"3.4cm","y":"4cm","width":"0.1cm","height":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-gray-h","preset":"rect","fill":"1A1A1A",
    "x":"4cm","y":"17.5cm","width":"15cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-red","preset":"ellipse","fill":"FF3C38",
    "x":"30cm","y":"16cm","width":"1.5cm","height":"1.5cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"MAKE IT BOLD","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"1A1A1A",
    "x":"4cm","y":"4.5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-subtitle","text":"Design Studio","font":"Segoe UI Light",
    "size":"24","color":"1A1A1A",
    "x":"4cm","y":"8.8cm","width":"20cm","height":"2cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[1]/shape[7]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[1]/shape[8]/paragraph[1]","props":{"align":"left"}}
]' | officecli batch "$DECK"

# ═══════════════════════════════════════════════════════════════
# SLIDE 2 — STATEMENT: "Less Noise. More Signal."
# Giant "02" shifts left, giant letter moves right
# Red line stretches wide, centered layout
# ═══════════════════════════════════════════════════════════════

officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F2F2F2

echo '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!giant-num","text":"02","font":"Segoe UI Black","size":"200",
    "color":"1A1A1A","opacity":"0.06","bold":"true",
    "x":"0cm","y":"2cm","width":"18cm","height":"16cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!giant-letter","text":"N","font":"Segoe UI Black","size":"300",
    "color":"E8E8E8","opacity":"0.08","bold":"true",
    "x":"20cm","y":"0cm","width":"18cm","height":"22cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!line-red-h","preset":"rect","fill":"FF3C38",
    "x":"5cm","y":"12.8cm","width":"24cm","height":"0.1cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!line-red-v","preset":"rect","fill":"FF3C38",
    "x":"32cm","y":"2cm","width":"0.1cm","height":"8cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!line-gray-h","preset":"rect","fill":"1A1A1A",
    "x":"10cm","y":"5.8cm","width":"15cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!dot-red","preset":"ellipse","fill":"FF3C38",
    "x":"2cm","y":"15cm","width":"1.5cm","height":"1.5cm"}},

  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!statement-title","text":"Less Noise.","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"1A1A1A",
    "x":"5cm","y":"6.2cm","width":"26cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!statement-sub","text":"More Signal.","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"FF3C38",
    "x":"5cm","y":"9.2cm","width":"26cm","height":"3.5cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[2]/shape[7]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[2]/shape[8]/paragraph[1]","props":{"align":"left"}}
]' | officecli batch "$DECK"

# ═══════════════════════════════════════════════════════════════
# SLIDE 3 — PILLARS: "Identity / Motion / Print"
# Giant "03" centered behind content, three-column editorial grid
# Thin red lines as column dividers
# ═══════════════════════════════════════════════════════════════

officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F2F2F2

echo '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!giant-num","text":"03","font":"Segoe UI Black","size":"200",
    "color":"1A1A1A","opacity":"0.06","bold":"true",
    "x":"8cm","y":"0cm","width":"18cm","height":"16cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!giant-letter","text":"M","font":"Segoe UI Black","size":"300",
    "color":"E8E8E8","opacity":"0.08","bold":"true",
    "x":"0cm","y":"4cm","width":"18cm","height":"22cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!line-red-h","preset":"rect","fill":"FF3C38",
    "x":"1.2cm","y":"3.8cm","width":"31cm","height":"0.1cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!line-red-v","preset":"rect","fill":"FF3C38",
    "x":"11.8cm","y":"5cm","width":"0.1cm","height":"12cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!line-gray-h","preset":"rect","fill":"1A1A1A",
    "x":"22.6cm","y":"5cm","width":"0.04cm","height":"12cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!dot-red","preset":"ellipse","fill":"FF3C38",
    "x":"31cm","y":"1.2cm","width":"1.5cm","height":"1.5cm"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!pillars-title","text":"What We Do","font":"Segoe UI Black",
    "size":"36","bold":"true","color":"1A1A1A",
    "x":"1.2cm","y":"1cm","width":"16cm","height":"2.4cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col1-num","text":"01","font":"Segoe UI Black",
    "size":"48","color":"FF3C38",
    "x":"1.2cm","y":"5.2cm","width":"9cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col1-title","text":"Identity","font":"Segoe UI Black",
    "size":"28","bold":"true","color":"1A1A1A",
    "x":"1.2cm","y":"8cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col1-desc","text":"Brand systems that speak with clarity and purpose.","font":"Segoe UI Light",
    "size":"16","color":"1A1A1A",
    "x":"1.2cm","y":"10.2cm","width":"9cm","height":"4cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col2-num","text":"02","font":"Segoe UI Black",
    "size":"48","color":"FF3C38",
    "x":"12.8cm","y":"5.2cm","width":"9cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col2-title","text":"Motion","font":"Segoe UI Black",
    "size":"28","bold":"true","color":"1A1A1A",
    "x":"12.8cm","y":"8cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col2-desc","text":"Animation and video that capture attention instantly.","font":"Segoe UI Light",
    "size":"16","color":"1A1A1A",
    "x":"12.8cm","y":"10.2cm","width":"9cm","height":"4cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col3-num","text":"03","font":"Segoe UI Black",
    "size":"48","color":"FF3C38",
    "x":"23.6cm","y":"5.2cm","width":"9cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col3-title","text":"Print","font":"Segoe UI Black",
    "size":"28","bold":"true","color":"1A1A1A",
    "x":"23.6cm","y":"8cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col3-desc","text":"Editorial layouts that demand to be read and remembered.","font":"Segoe UI Light",
    "size":"16","color":"1A1A1A",
    "x":"23.6cm","y":"10.2cm","width":"9cm","height":"4cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[3]/shape[7]/paragraph[1]","props":{"align":"left"}}
]' | officecli batch "$DECK"

# ═══════════════════════════════════════════════════════════════
# SLIDE 4 — EVIDENCE: "340+ Projects / 28 Awards / Since 2015"
# Giant "04" top-right, asymmetric layout with big numbers
# Red accent as underline for metrics
# ═══════════════════════════════════════════════════════════════

officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F2F2F2

echo '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!giant-num","text":"04","font":"Segoe UI Black","size":"200",
    "color":"1A1A1A","opacity":"0.06","bold":"true",
    "x":"16cm","y":"0cm","width":"18cm","height":"16cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!giant-letter","text":"P","font":"Segoe UI Black","size":"300",
    "color":"E8E8E8","opacity":"0.08","bold":"true",
    "x":"0cm","y":"6cm","width":"18cm","height":"22cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!line-red-h","preset":"rect","fill":"FF3C38",
    "x":"2cm","y":"9cm","width":"6cm","height":"0.1cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!line-red-v","preset":"rect","fill":"FF3C38",
    "x":"16cm","y":"1cm","width":"0.1cm","height":"17cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!line-gray-h","preset":"rect","fill":"1A1A1A",
    "x":"18cm","y":"15cm","width":"14cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!dot-red","preset":"ellipse","fill":"FF3C38",
    "x":"14cm","y":"0.8cm","width":"1.5cm","height":"1.5cm"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!evidence-title","text":"The Numbers","font":"Segoe UI Black",
    "size":"36","bold":"true","color":"1A1A1A",
    "x":"2cm","y":"1.2cm","width":"12cm","height":"2.4cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!metric1-num","text":"340+","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"1A1A1A",
    "x":"2cm","y":"4cm","width":"12cm","height":"4.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!metric1-label","text":"Projects Delivered","font":"Segoe UI Light",
    "size":"18","color":"1A1A1A",
    "x":"2cm","y":"9.4cm","width":"12cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!metric2-num","text":"28","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"FF3C38",
    "x":"18cm","y":"2cm","width":"14cm","height":"4.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!metric2-label","text":"Awards Won","font":"Segoe UI Light",
    "size":"18","color":"1A1A1A",
    "x":"18cm","y":"6.5cm","width":"14cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!metric3-num","text":"2015","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"1A1A1A",
    "x":"18cm","y":"10cm","width":"14cm","height":"4.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!metric3-label","text":"Founded","font":"Segoe UI Light",
    "size":"18","color":"1A1A1A",
    "x":"18cm","y":"14.2cm","width":"14cm","height":"2cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[4]/shape[7]/paragraph[1]","props":{"align":"left"}}
]' | officecli batch "$DECK"

# ═══════════════════════════════════════════════════════════════
# SLIDE 5 — CTA: "hello@studio.com"
# Giant "05" fills center, minimal clean layout
# Red dot as focal punctuation, lines frame edges
# ═══════════════════════════════════════════════════════════════

officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F2F2F2

echo '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!giant-num","text":"05","font":"Segoe UI Black","size":"200",
    "color":"1A1A1A","opacity":"0.06","bold":"true",
    "x":"8cm","y":"2cm","width":"18cm","height":"16cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!giant-letter","text":"X","font":"Segoe UI Black","size":"300",
    "color":"E8E8E8","opacity":"0.08","bold":"true",
    "x":"22cm","y":"0cm","width":"18cm","height":"22cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!line-red-h","preset":"rect","fill":"FF3C38",
    "x":"12cm","y":"14cm","width":"10cm","height":"0.1cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!line-red-v","preset":"rect","fill":"FF3C38",
    "x":"1.2cm","y":"6cm","width":"0.1cm","height":"10cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!line-gray-h","preset":"rect","fill":"1A1A1A",
    "x":"8cm","y":"4cm","width":"18cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!dot-red","preset":"ellipse","fill":"FF3C38",
    "x":"16cm","y":"10.5cm","width":"1.5cm","height":"1.5cm"}},

  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cta-heading","text":"Get in Touch","font":"Segoe UI Black",
    "size":"72","bold":"true","color":"1A1A1A",
    "x":"4cm","y":"5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cta-email","text":"hello@studio.com","font":"Segoe UI Light",
    "size":"24","color":"FF3C38",
    "x":"4cm","y":"9.5cm","width":"26cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!cta-tagline","text":"Bold ideas start with a conversation.","font":"Segoe UI Light",
    "size":"16","color":"1A1A1A",
    "x":"4cm","y":"14.5cm","width":"26cm","height":"2cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[5]/shape[7]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[8]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[9]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

# ═══════════════════════════════════════════════════════════════
# SET MORPH TRANSITIONS on slides 2-5
# ═══════════════════════════════════════════════════════════════

echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch "$DECK"

# ═══════════════════════════════════════════════════════════════
# VALIDATE & OUTLINE
# ═══════════════════════════════════════════════════════════════

officecli validate "$DECK"
officecli view "$DECK" outline
