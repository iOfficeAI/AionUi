#!/bin/bash
set -e

# Build script for 02-playful-blocks
# Auto-extracted from agent output

mkdir -p /Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks

officecli --version

DECK="morph-templates/02-playful-blocks/template.pptx" && officecli create "$DECK" && officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFF8F0

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!block-red","preset":"roundRect","fill":"FF4444",
    "x":"1.5cm","y":"1cm","width":"5cm","height":"4cm","opacity":"1"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!block-blue","preset":"roundRect","fill":"3388FF",
    "x":"27cm","y":"0.8cm","width":"6cm","height":"5cm","opacity":"1"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!block-yellow","preset":"roundRect","fill":"FFCC00",
    "x":"0.8cm","y":"14cm","width":"4cm","height":"4cm","opacity":"1"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!block-green","preset":"roundRect","fill":"44BB44",
    "x":"28cm","y":"14cm","width":"5cm","height":"3cm","opacity":"1"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!block-orange","preset":"roundRect","fill":"FF8833",
    "x":"26cm","y":"8cm","width":"3cm","height":"5cm","opacity":"0.8"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-red","preset":"ellipse","fill":"FF4444",
    "x":"7cm","y":"15cm","width":"2cm","height":"2cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-blue","preset":"ellipse","fill":"3388FF",
    "x":"22cm","y":"1cm","width":"2.5cm","height":"2.5cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-yellow","preset":"ellipse","fill":"FFCC00",
    "x":"15cm","y":"15.5cm","width":"1.5cm","height":"1.5cm","opacity":"0.5"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"Let'"'"'s Learn Together","font":"Segoe UI Black",
    "size":"64","bold":"true","color":"2D2D2D",
    "x":"4cm","y":"5cm","width":"26cm","height":"5cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-sub","text":"Fun. Creative. Interactive.","font":"Segoe UI",
    "size":"28","color":"666666",
    "x":"4cm","y":"10.5cm","width":"26cm","height":"2.5cm","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-1-num","text":"01","font":"Segoe UI Black","size":"54","color":"FF4444",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-1-title","text":"Create","font":"Segoe UI Black","size":"28","color":"2D2D2D",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-1-desc","text":"Build amazing things with your imagination","font":"Segoe UI","size":"16","color":"666666",
    "x":"-3cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-2-num","text":"02","font":"Segoe UI Black","size":"54","color":"3388FF",
    "x":"10cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-2-title","text":"Explore","font":"Segoe UI Black","size":"28","color":"2D2D2D",
    "x":"22cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-2-desc","text":"Discover new worlds and ideas every day","font":"Segoe UI","size":"16","color":"666666",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-3-num","text":"03","font":"Segoe UI Black","size":"54","color":"44BB44",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-3-title","text":"Grow","font":"Segoe UI Black","size":"28","color":"2D2D2D",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-3-desc","text":"Develop skills that last a lifetime","font":"Segoe UI","size":"16","color":"666666",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-1-num","text":"500+","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-1-label","text":"Activities","font":"Segoe UI","size":"18","color":"FFFFFF",
    "x":"-3cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-2-num","text":"98%","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"10cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-2-label","text":"Fun Rating","font":"Segoe UI","size":"18","color":"FFFFFF",
    "x":"22cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-3-num","text":"50K","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-3-label","text":"Kids","font":"Segoe UI","size":"18","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-title","text":"Start Your Adventure","font":"Segoe UI Black","size":"54","color":"2D2D2D",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-1-num","text":"01","font":"Segoe UI Black","size":"54","color":"FF4444",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-1-title","text":"Create","font":"Segoe UI Black","size":"28","color":"2D2D2D",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-1-desc","text":"Build amazing things with your imagination","font":"Segoe UI","size":"16","color":"666666",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-2-num","text":"02","font":"Segoe UI Black","size":"54","color":"3388FF",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-2-title","text":"Explore","font":"Segoe UI Black","size":"28","color":"2D2D2D",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-2-desc","text":"Discover new worlds and ideas every day","font":"Segoe UI","size":"16","color":"666666",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pill-3-desc","text":"Develop skills that last a lifetime","font":"Segoe UI","size":"16","color":"666666",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-1-num","text":"500+","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-1-label","text":"Activities","font":"Segoe UI","size":"18","color":"FFFFFF",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-2-label","text":"Fun Rating","font":"Segoe UI","size":"18","color":"FFFFFF",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"set","path":"/slide[1]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[1]/shape[10]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
officecli add "$DECK" '/' --from '/slide[1]' && \
officecli add "$DECK" '/' --from '/slide[1]' && \
officecli add "$DECK" '/' --from '/slide[1]' && \
officecli add "$DECK" '/' --from '/slide[1]'

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
officecli view "$DECK" outline

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
# Check a few shapes to confirm indices
officecli view "$DECK" '/slide[1]/shape[1]' 2>&1 | head -5
echo "---"
officecli view "$DECK" '/slide[1]/shape[9]' 2>&1 | head -5
echo "---"
officecli view "$DECK" '/slide[1]/shape[17]' 2>&1 | head -5
echo "---"
officecli view "$DECK" '/slide[1]/shape[26]' 2>&1 | head -5

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
officecli view "$DECK" annotated 2>&1 | head -80

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stat-2-num","text":"98%","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"!!stat-2-num","text":"98%","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"!!stat-2-num","text":"98%","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"!!stat-2-num","text":"98%","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"!!stat-2-num","text":"98%","font":"Segoe UI Black","size":"48","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"24cm","y":"12cm","width":"6cm","height":"5cm","rotation":"15"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"2cm","y":"12cm","width":"7cm","height":"6cm","rotation":"10"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"14cm","y":"13cm","width":"5cm","height":"5cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"8cm","y":"0.5cm","width":"4cm","height":"2.5cm","rotation":"5"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"30cm","y":"2cm","width":"3cm","height":"4cm","opacity":"0.6"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"20cm","y":"0.5cm","width":"2.5cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"5cm","y":"2cm","width":"2cm","height":"2cm","opacity":"0.5"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"32cm","y":"15cm","width":"1.5cm","height":"1.5cm"}},

  {"command":"set","path":"/slide[2]/shape[9]","props":{"text":"Learning Should Be Fun","x":"2cm","y":"4.5cm","width":"30cm","height":"6cm","size":"72"}},
  {"command":"set","path":"/slide[2]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[2]/shape[10]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"1.2cm","y":"5cm","width":"9.5cm","height":"13cm","opacity":"0.12","rotation":"0"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"12.2cm","y":"5cm","width":"9.5cm","height":"13cm","opacity":"0.12","rotation":"0"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"23.2cm","y":"5cm","width":"9.5cm","height":"13cm","opacity":"0.12","rotation":"0"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","rotation":"0"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","opacity":"0.8"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},

  {"command":"set","path":"/slide[3]/shape[9]","props":{"text":"How We Learn","x":"1.2cm","y":"0.8cm","width":"20cm","height":"3.5cm","size":"40"}},
  {"command":"set","path":"/slide[3]/shape[9]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[3]/shape[10]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},

  {"command":"set","path":"/slide[3]/shape[17]","props":{"x":"2.5cm","y":"5.8cm","width":"7cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"x":"2.5cm","y":"9cm","width":"7cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"x":"2.5cm","y":"11.5cm","width":"7cm","height":"3cm"}},

  {"command":"set","path":"/slide[3]/shape[20]","props":{"x":"13.5cm","y":"5.8cm","width":"7cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[21]","props":{"x":"13.5cm","y":"9cm","width":"7cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[22]","props":{"x":"13.5cm","y":"11.5cm","width":"7cm","height":"3cm"}},

  {"command":"set","path":"/slide[3]/shape[12]","props":{"x":"24.5cm","y":"5.8cm","width":"7cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"x":"24.5cm","y":"9cm","width":"7cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[23]","props":{"x":"24.5cm","y":"11.5cm","width":"7cm","height":"3cm"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"1.2cm","y":"1cm","width":"15cm","height":"11cm","opacity":"0.5","rotation":"0"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"17.5cm","y":"1cm","width":"15cm","height":"5cm","opacity":"0.45","rotation":"0"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"17.5cm","y":"7cm","width":"15cm","height":"5cm","opacity":"0.45","rotation":"0"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"x":"1.2cm","y":"13.5cm","width":"5cm","height":"2.5cm","opacity":"0.3","rotation":"0"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"7.5cm","y":"13.5cm","width":"3cm","height":"2.5cm","opacity":"0.3"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"30cm","y":"14cm","width":"2cm","height":"2cm","opacity":"0.4"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"x":"12cm","y":"14cm","width":"2.5cm","height":"2.5cm","opacity":"0.3"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"27cm","y":"14.5cm","width":"1.5cm","height":"1.5cm","opacity":"0.3"}},

  {"command":"set","path":"/slide[4]/shape[9]","props":{"text":"By The Numbers","x":"1.2cm","y":"0.8cm","width":"14cm","height":"3cm","size":"36","color":"FFFFFF"}},
  {"command":"set","path":"/slide[4]/shape[9]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[4]/shape[10]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},

  {"command":"set","path":"/slide[4]/shape[17]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[18]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[19]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[20]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[21]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[22]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[12]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[13]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[23]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},

  {"command":"set","path":"/slide[4]/shape[24]","props":{"x":"3cm","y":"4cm","width":"11cm","height":"4cm"}},
  {"command":"set","path":"/slide[4]/shape[25]","props":{"x":"3cm","y":"8cm","width":"11cm","height":"2.5cm"}},

  {"command":"set","path":"/slide[4]/shape[27]","props":{"x":"19cm","y":"1.8cm","width":"12cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[26]","props":{"x":"19cm","y":"4.2cm","width":"12cm","height":"2cm"}},

  {"command":"set","path":"/slide[4]/shape[14]","props":{"x":"19cm","y":"7.8cm","width":"12cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{"x":"19cm","y":"10.2cm","width":"12cm","height":"2cm"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
echo '[
  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"0.8cm","y":"0.8cm","width":"5cm","height":"4cm","opacity":"1","rotation":"8"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"28cm","y":"13cm","width":"5cm","height":"4cm","opacity":"1","rotation":"5"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"26cm","y":"0.5cm","width":"4cm","height":"4cm","opacity":"1","rotation":"0"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"x":"0.5cm","y":"14cm","width":"5cm","height":"3cm","opacity":"1","rotation":"0"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{"x":"6.5cm","y":"0.5cm","width":"3cm","height":"4cm","opacity":"0.8","rotation":"12"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{"x":"23cm","y":"15cm","width":"2.5cm","height":"2.5cm","opacity":"0.7"}},
  {"command":"set","path":"/slide[5]/shape[7]","props":{"x":"31cm","y":"8cm","width":"2cm","height":"2cm","opacity":"0.6"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"10cm","y":"15.5cm","width":"1.5cm","height":"1.5cm","opacity":"0.5"}},

  {"command":"set","path":"/slide[5]/shape[9]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[10]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},

  {"command":"set","path":"/slide[5]/shape[16]","props":{"x":"3cm","y":"5cm","width":"28cm","height":"6cm"}},
  {"command":"set","path":"/slide[5]/shape[16]/paragraph[1]","props":{"align":"center"}},

  {"command":"set","path":"/slide[5]/shape[17]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[18]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[19]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[20]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[21]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[22]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[12]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[13]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[23]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[24]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[25]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[26]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[27]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[14]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[15]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
officecli validate "$DECK"

DECK="/Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/02-playful-blocks/template.pptx"
officecli view "$DECK" outline

