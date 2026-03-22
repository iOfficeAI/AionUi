#!/bin/bash
set -e

# Build script for 01-mono-line
# Auto-extracted from agent output

mkdir -p /Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/01-mono-line

officecli --version

officecli create morph-templates/01-mono-line/template.pptx && officecli add morph-templates/01-mono-line/template.pptx '/' --type slide --prop layout=blank --prop background=FFFFFF

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-h-top","preset":"rect","fill":"1A1A1A",
    "x":"0cm","y":"1.5cm","width":"20cm","height":"0.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-h-mid","preset":"rect","fill":"C8C8C8",
    "x":"10cm","y":"13cm","width":"15cm","height":"0.03cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-v-left","preset":"rect","fill":"1A1A1A",
    "x":"2cm","y":"0cm","width":"0.05cm","height":"12cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-v-right","preset":"rect","fill":"C8C8C8",
    "x":"30cm","y":"11cm","width":"0.03cm","height":"8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-accent-1","preset":"ellipse","fill":"1A1A1A",
    "x":"28cm","y":"15cm","width":"1cm","height":"1cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-accent-2","preset":"ellipse","fill":"C8C8C8",
    "x":"31cm","y":"16cm","width":"0.8cm","height":"0.8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"Your Presentation Title","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"4cm","y":"5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-subtitle","text":"Subtitle goes here","font":"Segoe UI",
    "size":"20","color":"C8C8C8",
    "x":"4cm","y":"9.5cm","width":"20cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!statement-text","text":"The Big Idea","font":"Segoe UI Light",
    "size":"64","color":"1A1A1A",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-1-num","text":"01","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-1-title","text":"Strategy","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"-3cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-2-num","text":"02","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"10cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-2-title","text":"Design","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"22cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-3-num","text":"03","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-3-title","text":"Growth","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-1-num","text":"42%","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-1-label","text":"Efficiency Gain","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-2-num","text":"3.2x","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-2-label","text":"Growth Rate","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"-3cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-3-num","text":"98%","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"10cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-3-label","text":"Satisfaction","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"22cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-text","text":"Let'\''s Connect","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-sub","text":"hello@company.com","font":"Segoe UI",
    "size":"18","color":"C8C8C8",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

officecli view morph-templates/01-mono-line/template.pptx outline

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!statement-text","text":"The Big Idea","font":"Segoe UI Light",
    "size":"64","color":"1A1A1A",
    "x":"0cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-1-num","text":"01","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"0cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-1-title","text":"Strategy","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"0cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-2-num","text":"02","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"10cm","y":"0cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-2-title","text":"Design","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"22cm","y":"0cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-3-num","text":"03","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-3-title","text":"Growth","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-1-label","text":"Efficiency Gain","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"0cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-2-num","text":"3.2x","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"0cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-2-label","text":"Growth Rate","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"0cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-3-num","text":"98%","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"10cm","y":"0cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-3-label","text":"Satisfaction","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"22cm","y":"0cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-text","text":"Let'\''s Connect","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-sub","text":"hello@company.com","font":"Segoe UI",
    "size":"18","color":"C8C8C8",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

officecli view morph-templates/01-mono-line/template.pptx outline

rm morph-templates/01-mono-line/template.pptx && officecli create morph-templates/01-mono-line/template.pptx && officecli add morph-templates/01-mono-line/template.pptx '/' --type slide --prop layout=blank --prop background=FFFFFF

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-h-top","preset":"rect","fill":"1A1A1A",
    "x":"0cm","y":"1.5cm","width":"20cm","height":"0.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-h-mid","preset":"rect","fill":"C8C8C8",
    "x":"10cm","y":"13cm","width":"15cm","height":"0.03cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-v-left","preset":"rect","fill":"1A1A1A",
    "x":"2cm","y":"0cm","width":"0.05cm","height":"12cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!line-v-right","preset":"rect","fill":"C8C8C8",
    "x":"30cm","y":"11cm","width":"0.03cm","height":"8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-accent-1","preset":"ellipse","fill":"1A1A1A",
    "x":"28cm","y":"15cm","width":"1cm","height":"1cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-accent-2","preset":"ellipse","fill":"C8C8C8",
    "x":"31cm","y":"16cm","width":"0.8cm","height":"0.8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"Your Presentation Title","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"4cm","y":"5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-subtitle","text":"Subtitle goes here","font":"Segoe UI",
    "size":"20","color":"C8C8C8",
    "x":"4cm","y":"9.5cm","width":"20cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!statement-text","text":"The Big Idea","font":"Segoe UI Light",
    "size":"64","color":"1A1A1A",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-1-num","text":"01","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-1-title","text":"Strategy","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-2-num","text":"02","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"36cm","y":"4cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-2-title","text":"Design","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"36cm","y":"12cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-3-num","text":"03","font":"Segoe UI Light",
    "size":"40","color":"C8C8C8",
    "x":"36cm","y":"20cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pillar-3-title","text":"Growth","font":"Segoe UI Light",
    "size":"28","color":"1A1A1A",
    "x":"36cm","y":"6cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-1-num","text":"42%","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-1-label","text":"Efficiency Gain","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"36cm","y":"22cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-2-num","text":"3.2x","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"36cm","y":"8cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-2-label","text":"Growth Rate","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"36cm","y":"16cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-3-num","text":"98%","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"36cm","y":"24cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!metric-3-label","text":"Satisfaction","font":"Segoe UI",
    "size":"16","color":"C8C8C8",
    "x":"36cm","y":"0cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-text","text":"Let'\''s Connect","font":"Segoe UI Light",
    "size":"54","color":"1A1A1A",
    "x":"36cm","y":"18cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-sub","text":"hello@company.com","font":"Segoe UI",
    "size":"18","color":"C8C8C8",
    "x":"36cm","y":"26cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

# Set alignment on hero title and subtitle
echo '[
  {"command":"set","path":"/slide[1]/shape[7]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[1]/shape[8]/paragraph[1]","props":{"align":"left"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

officecli add morph-templates/01-mono-line/template.pptx '/' --from '/slide[1]' && \
officecli add morph-templates/01-mono-line/template.pptx '/' --from '/slide[1]' && \
officecli add morph-templates/01-mono-line/template.pptx '/' --from '/slide[1]' && \
officecli add morph-templates/01-mono-line/template.pptx '/' --from '/slide[1]'

echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

echo '[
  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"7cm","y":"9.5cm","width":"20cm","height":"0.05cm"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"5cm","y":"9.5cm","width":"24cm","height":"0.03cm"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"16.5cm","y":"3cm","width":"0.05cm","height":"13cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"17.5cm","y":"4cm","width":"0.03cm","height":"11cm"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"3cm","y":"9cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"4.5cm","y":"10.5cm","width":"0.8cm","height":"0.8cm"}},
  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[2]/shape[9]","props":{"x":"4cm","y":"5.5cm","width":"26cm","height":"5cm"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

echo '[
  {"command":"set","path":"/slide[2]/shape[9]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

echo '[
  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"1.2cm","y":"1.2cm","width":"31cm","height":"0.05cm"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"1.2cm","y":"4.5cm","width":"31cm","height":"0.03cm"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"11.5cm","y":"5cm","width":"0.05cm","height":"12cm"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"x":"22.5cm","y":"5cm","width":"0.03cm","height":"12cm"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"5cm","y":"2.8cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"16cm","y":"2.8cm","width":"0.8cm","height":"0.8cm"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[9]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[10]","props":{"x":"2cm","y":"5.5cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[11]","props":{"x":"2cm","y":"9cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[12]","props":{"x":"13cm","y":"5.5cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"x":"13cm","y":"9cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[14]","props":{"x":"24cm","y":"5.5cm","width":"8cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"x":"24cm","y":"9cm","width":"8cm","height":"3cm"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

echo '[
  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"1.2cm","y":"8cm","width":"31cm","height":"0.05cm"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"20cm","y":"14cm","width":"12cm","height":"0.03cm"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"19cm","y":"1cm","width":"0.05cm","height":"6cm"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"x":"32cm","y":"10cm","width":"0.03cm","height":"7cm"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"2cm","y":"4cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"13cm","y":"4cm","width":"0.8cm","height":"0.8cm"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"x":"36cm","y":"4cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"36cm","y":"12cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[9]","props":{"x":"36cm","y":"20cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[10]","props":{"x":"36cm","y":"6cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[11]","props":{"x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[12]","props":{"x":"36cm","y":"22cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[13]","props":{"x":"36cm","y":"0cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[14]","props":{"x":"36cm","y":"8cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{"x":"36cm","y":"16cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[16]","props":{"x":"3cm","y":"2cm","width":"14cm","height":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[17]","props":{"x":"3cm","y":"6cm","width":"14cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[18]","props":{"x":"3cm","y":"9cm","width":"14cm","height":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[19]","props":{"x":"3cm","y":"13cm","width":"14cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[20]","props":{"x":"20cm","y":"2cm","width":"12cm","height":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[21]","props":{"x":"20cm","y":"6cm","width":"12cm","height":"2cm"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

echo '[
  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"0cm","y":"0.8cm","width":"33.87cm","height":"0.05cm"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"0cm","y":"18.2cm","width":"33.87cm","height":"0.03cm"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"1.2cm","y":"0cm","width":"0.05cm","height":"19.05cm"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"x":"32.6cm","y":"0cm","width":"0.03cm","height":"19.05cm"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{"x":"16cm","y":"13cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{"x":"17.5cm","y":"13.5cm","width":"0.8cm","height":"0.8cm"}},
  {"command":"set","path":"/slide[5]/shape[7]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[9]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[10]","props":{"x":"36cm","y":"4cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[11]","props":{"x":"36cm","y":"12cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[12]","props":{"x":"36cm","y":"20cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[13]","props":{"x":"36cm","y":"6cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[14]","props":{"x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[15]","props":{"x":"36cm","y":"22cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[16]","props":{"x":"36cm","y":"8cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[17]","props":{"x":"36cm","y":"16cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[18]","props":{"x":"36cm","y":"0cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[19]","props":{"x":"36cm","y":"24cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[20]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[21]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[22]","props":{"x":"5cm","y":"5cm","width":"24cm","height":"5cm"}},
  {"command":"set","path":"/slide[5]/shape[23]","props":{"x":"8cm","y":"10.5cm","width":"18cm","height":"2cm"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

echo '[
  {"command":"set","path":"/slide[5]/shape[22]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[23]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch morph-templates/01-mono-line/template.pptx

officecli validate morph-templates/01-mono-line/template.pptx

officecli view morph-templates/01-mono-line/template.pptx outline
