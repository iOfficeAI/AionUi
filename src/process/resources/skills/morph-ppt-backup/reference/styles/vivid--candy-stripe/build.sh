#!/bin/bash
set -e

# Build script for 10-candy-stripe — "Candy Stripe" morph template
# Playful rainbow horizontal bands that slide, expand, compress across slides

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/10-candy-stripe/template.pptx"

officecli --version

# ============================================================
# Step 1: Create file + 5 blank slides
# ============================================================
officecli create "$DECK"
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFFFF

# Set morph transitions on slides 2-5
echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 1 — Hero: "Color Your World"
# Even rainbow stack — 6 full-width bands spread across the slide
# Canvas: 33.87 x 19.05cm; bands at even vertical intervals
# ============================================================
echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stripe-red","preset":"rect","fill":"FF5252",
    "x":"0cm","y":"0cm","width":"34cm","height":"2cm","opacity":"0.85"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stripe-orange","preset":"rect","fill":"FF7B39",
    "x":"0cm","y":"3.4cm","width":"34cm","height":"2cm","opacity":"0.85"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stripe-yellow","preset":"rect","fill":"FFD740",
    "x":"0cm","y":"6.8cm","width":"34cm","height":"2cm","opacity":"0.85"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stripe-green","preset":"rect","fill":"69F0AE",
    "x":"0cm","y":"10.2cm","width":"34cm","height":"2cm","opacity":"0.85"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stripe-blue","preset":"rect","fill":"40C4FF",
    "x":"0cm","y":"13.6cm","width":"34cm","height":"2cm","opacity":"0.85"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stripe-purple","preset":"rect","fill":"7C4DFF",
    "x":"0cm","y":"17cm","width":"34cm","height":"2cm","opacity":"0.85"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"Color Your World","font":"Segoe UI Black",
    "size":"64","bold":"true","color":"1A1A1A",
    "x":"3cm","y":"5.5cm","width":"28cm","height":"4.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-sub","text":"Creative Festival 2026","font":"Segoe UI",
    "size":"28","color":"555555",
    "x":"3cm","y":"10.5cm","width":"28cm","height":"2.5cm","fill":"none"}}
]' | officecli batch "$DECK"

# Center-align hero text
echo '[
  {"command":"set","path":"/slide[1]/shape[7]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[1]/shape[8]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 2 — Statement: "6 Days of Inspiration"
# All stripes compress to top 4cm as colorful header bar
# Each stripe: 0.5cm tall, stacked tightly at y=0..2.5
# Content below in white space
# ============================================================
echo '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!stripe-red","preset":"rect","fill":"FF5252",
    "x":"0cm","y":"0cm","width":"34cm","height":"0.5cm","opacity":"1"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!stripe-orange","preset":"rect","fill":"FF7B39",
    "x":"0cm","y":"0.6cm","width":"34cm","height":"0.5cm","opacity":"1"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!stripe-yellow","preset":"rect","fill":"FFD740",
    "x":"0cm","y":"1.2cm","width":"34cm","height":"0.5cm","opacity":"1"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!stripe-green","preset":"rect","fill":"69F0AE",
    "x":"0cm","y":"1.8cm","width":"34cm","height":"0.5cm","opacity":"1"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!stripe-blue","preset":"rect","fill":"40C4FF",
    "x":"0cm","y":"2.4cm","width":"34cm","height":"0.5cm","opacity":"1"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!stripe-purple","preset":"rect","fill":"7C4DFF",
    "x":"0cm","y":"3cm","width":"34cm","height":"0.5cm","opacity":"1"}},

  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!hero-title","text":"6 Days of Inspiration","font":"Segoe UI Black",
    "size":"54","bold":"true","color":"1A1A1A",
    "x":"3cm","y":"6cm","width":"28cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!hero-sub","text":"Where creativity meets community","font":"Segoe UI",
    "size":"24","color":"555555",
    "x":"3cm","y":"10.5cm","width":"28cm","height":"2.5cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[2]/shape[7]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[2]/shape[8]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 3 — Pillars: "Music / Art / Tech"
# Stripes break into 3 vertical columns as card backgrounds
# Red+orange form col1, yellow+green form col2, blue+purple form col3
# ============================================================
echo '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!stripe-red","preset":"rect","fill":"FF5252",
    "x":"1.2cm","y":"4.5cm","width":"9.5cm","height":"13.5cm","opacity":"0.12"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!stripe-orange","preset":"rect","fill":"FF7B39",
    "x":"1.2cm","y":"4.5cm","width":"9.5cm","height":"0.4cm","opacity":"0.8"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!stripe-yellow","preset":"rect","fill":"FFD740",
    "x":"12.2cm","y":"4.5cm","width":"9.5cm","height":"13.5cm","opacity":"0.12"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!stripe-green","preset":"rect","fill":"69F0AE",
    "x":"12.2cm","y":"4.5cm","width":"9.5cm","height":"0.4cm","opacity":"0.8"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!stripe-blue","preset":"rect","fill":"40C4FF",
    "x":"23.2cm","y":"4.5cm","width":"9.5cm","height":"13.5cm","opacity":"0.12"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!stripe-purple","preset":"rect","fill":"7C4DFF",
    "x":"23.2cm","y":"4.5cm","width":"9.5cm","height":"0.4cm","opacity":"0.8"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!hero-title","text":"What Awaits You","font":"Segoe UI Black",
    "size":"40","bold":"true","color":"1A1A1A",
    "x":"1.2cm","y":"0.8cm","width":"20cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!hero-sub","text":"","font":"Segoe UI",
    "size":"18","color":"555555",
    "x":"36cm","y":"0.8cm","width":"0.1cm","height":"0.1cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col1-num","text":"01","font":"Segoe UI Black","size":"48","color":"FF5252",
    "x":"2.5cm","y":"5.5cm","width":"7cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col1-title","text":"Music","font":"Segoe UI Black","size":"28","color":"1A1A1A",
    "x":"2.5cm","y":"8.5cm","width":"7cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col1-desc","text":"Live performances from 80+ artists across every genre","font":"Segoe UI","size":"16","color":"555555",
    "x":"2.5cm","y":"11cm","width":"7cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col2-num","text":"02","font":"Segoe UI Black","size":"48","color":"FFD740",
    "x":"13.5cm","y":"5.5cm","width":"7cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col2-title","text":"Art","font":"Segoe UI Black","size":"28","color":"1A1A1A",
    "x":"13.5cm","y":"8.5cm","width":"7cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col2-desc","text":"Interactive installations and immersive galleries","font":"Segoe UI","size":"16","color":"555555",
    "x":"13.5cm","y":"11cm","width":"7cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col3-num","text":"03","font":"Segoe UI Black","size":"48","color":"40C4FF",
    "x":"24.5cm","y":"5.5cm","width":"7cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col3-title","text":"Tech","font":"Segoe UI Black","size":"28","color":"1A1A1A",
    "x":"24.5cm","y":"8.5cm","width":"7cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!col3-desc","text":"Cutting-edge demos and hands-on workshops","font":"Segoe UI","size":"16","color":"555555",
    "x":"24.5cm","y":"11cm","width":"7cm","height":"3cm","fill":"none"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 4 — Evidence: "50K / 200 / 6"
# Blue stripe expands huge (40% canvas) as data backdrop
# Others shrink to edges
# ============================================================
echo '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stripe-red","preset":"rect","fill":"FF5252",
    "x":"0cm","y":"0cm","width":"34cm","height":"0.3cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stripe-orange","preset":"rect","fill":"FF7B39",
    "x":"0cm","y":"0.5cm","width":"34cm","height":"0.3cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stripe-yellow","preset":"rect","fill":"FFD740",
    "x":"0cm","y":"18.2cm","width":"34cm","height":"0.3cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stripe-green","preset":"rect","fill":"69F0AE",
    "x":"0cm","y":"18.6cm","width":"34cm","height":"0.3cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stripe-blue","preset":"rect","fill":"40C4FF",
    "x":"0cm","y":"3cm","width":"34cm","height":"8cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stripe-purple","preset":"rect","fill":"7C4DFF",
    "x":"0cm","y":"11.2cm","width":"34cm","height":"0.3cm","opacity":"0.7"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!hero-title","text":"By The Numbers","font":"Segoe UI Black",
    "size":"36","bold":"true","color":"1A1A1A",
    "x":"1.2cm","y":"1.2cm","width":"15cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!hero-sub","text":"","font":"Segoe UI",
    "size":"18","color":"555555",
    "x":"36cm","y":"1.2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stat1-num","text":"50K","font":"Segoe UI Black","size":"72","color":"FFFFFF",
    "x":"2cm","y":"3.5cm","width":"9cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stat1-label","text":"Attendees","font":"Segoe UI","size":"20","color":"FFFFFF",
    "x":"2cm","y":"7.5cm","width":"9cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stat2-num","text":"200","font":"Segoe UI Black","size":"72","color":"FFFFFF",
    "x":"12.5cm","y":"3.5cm","width":"9cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stat2-label","text":"Speakers","font":"Segoe UI","size":"20","color":"FFFFFF",
    "x":"12.5cm","y":"7.5cm","width":"9cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stat3-num","text":"6","font":"Segoe UI Black","size":"72","color":"FFFFFF",
    "x":"23cm","y":"3.5cm","width":"9cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stat3-label","text":"Stages","font":"Segoe UI","size":"20","color":"FFFFFF",
    "x":"23cm","y":"7.5cm","width":"9cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!evidence-tagline","text":"The biggest creative festival in the region","font":"Segoe UI",
    "size":"22","color":"555555",
    "x":"3cm","y":"13cm","width":"28cm","height":"2.5cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[4]/shape[15]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

# ============================================================
# SLIDE 5 — CTA: "Get Your Pass"
# Stripes fan back to bottom in reverse order as colorful footer
# Purple at top of footer, red at bottom — reversed rainbow
# ============================================================
echo '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!stripe-red","preset":"rect","fill":"FF5252",
    "x":"0cm","y":"17cm","width":"34cm","height":"2cm","opacity":"0.9"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!stripe-orange","preset":"rect","fill":"FF7B39",
    "x":"0cm","y":"15.5cm","width":"34cm","height":"1.4cm","opacity":"0.85"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!stripe-yellow","preset":"rect","fill":"FFD740",
    "x":"0cm","y":"14.2cm","width":"34cm","height":"1.2cm","opacity":"0.8"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!stripe-green","preset":"rect","fill":"69F0AE",
    "x":"0cm","y":"13cm","width":"34cm","height":"1cm","opacity":"0.75"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!stripe-blue","preset":"rect","fill":"40C4FF",
    "x":"0cm","y":"12cm","width":"34cm","height":"0.8cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!stripe-purple","preset":"rect","fill":"7C4DFF",
    "x":"0cm","y":"11.2cm","width":"34cm","height":"0.6cm","opacity":"0.65"}},

  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!hero-title","text":"Get Your Pass","font":"Segoe UI Black",
    "size":"64","bold":"true","color":"1A1A1A",
    "x":"3cm","y":"2cm","width":"28cm","height":"4.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!hero-sub","text":"creativefestival2026.com","font":"Segoe UI",
    "size":"24","color":"555555",
    "x":"3cm","y":"7cm","width":"28cm","height":"2.5cm","fill":"none"}}
]' | officecli batch "$DECK"

echo '[
  {"command":"set","path":"/slide[5]/shape[7]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[8]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

# ============================================================
# Validate & outline
# ============================================================
officecli validate "$DECK"
officecli view "$DECK" outline
