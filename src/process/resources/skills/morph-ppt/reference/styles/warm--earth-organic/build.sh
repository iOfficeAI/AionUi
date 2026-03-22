#!/bin/bash
set -e

# Build script for 04-earth-organic
# Auto-extracted from agent output

mkdir -p /Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/04-earth-organic

officecli --version

officecli create morph-templates/04-earth-organic/template.pptx

officecli add morph-templates/04-earth-organic/template.pptx '/' --type slide --prop layout=blank --prop background=F5F0E8

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!leaf-brown","preset":"ellipse","fill":"8B6F47","opacity":"0.3",
    "x":"1.2cm","y":"1cm","width":"6cm","height":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!leaf-sage","preset":"ellipse","fill":"A8C686","opacity":"0.25",
    "x":"25cm","y":"12cm","width":"8cm","height":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stone-terra","preset":"roundRect","fill":"D4956B","opacity":"0.2",
    "x":"27cm","y":"0.8cm","width":"5cm","height":"4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!stone-sand","preset":"roundRect","fill":"C2A878","opacity":"0.3",
    "x":"0.8cm","y":"13cm","width":"7cm","height":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!seed-forest","preset":"ellipse","fill":"6B8E6B",
    "x":"30cm","y":"8cm","width":"3cm","height":"2.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!seed-cream","preset":"ellipse","fill":"E8D5B0","opacity":"0.5",
    "x":"3cm","y":"8cm","width":"2cm","height":"2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pebble-1","preset":"ellipse","fill":"8B6F47","opacity":"0.4",
    "x":"15cm","y":"16cm","width":"1.5cm","height":"1.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!pebble-2","preset":"ellipse","fill":"A8C686","opacity":"0.35",
    "x":"22cm","y":"1.5cm","width":"1.8cm","height":"1.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"Sustainable Growth","font":"Segoe UI","size":"64","bold":"true","color":"3C2415",
    "x":"4cm","y":"5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-sub","text":"Building a Better Tomorrow","font":"Segoe UI Light","size":"24","color":"6B5B4A",
    "x":"4cm","y":"9.5cm","width":"26cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-num","text":"01","font":"Segoe UI","size":"48","bold":"true","color":"D4956B",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-title","text":"Reduce","font":"Segoe UI","size":"28","bold":"true","color":"3C2415",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-desc","text":"Minimize waste at every step of the supply chain","font":"Segoe UI Light","size":"16","color":"6B5B4A",
    "x":"-3cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-num","text":"02","font":"Segoe UI","size":"48","bold":"true","color":"A8C686",
    "x":"10cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-title","text":"Reuse","font":"Segoe UI","size":"28","bold":"true","color":"3C2415",
    "x":"22cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-desc","text":"Extend product lifecycles through circular design","font":"Segoe UI Light","size":"16","color":"6B5B4A",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-num","text":"03","font":"Segoe UI","size":"48","bold":"true","color":"6B8E6B",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-title","text":"Regenerate","font":"Segoe UI","size":"28","bold":"true","color":"3C2415",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-desc","text":"Restore ecosystems and build for the future","font":"Segoe UI Light","size":"16","color":"6B5B4A",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-text","text":"Join Our Mission","font":"Segoe UI","size":"40","bold":"true","color":"3C2415",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-num","text":"01","font":"Segoe UI","size":"48","bold":"true","color":"D4956B",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-title","text":"Reduce","font":"Segoe UI","size":"28","bold":"true","color":"3C2415",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-desc","text":"Minimize waste at every step of the supply chain","font":"Segoe UI Light","size":"16","color":"6B5B4A",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-num","text":"02","font":"Segoe UI","size":"48","bold":"true","color":"A8C686",
    "x":"10cm","y":"22cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-title","text":"Reuse","font":"Segoe UI","size":"28","bold":"true","color":"3C2415",
    "x":"22cm","y":"22cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-desc","text":"Restore ecosystems and build for the future","font":"Segoe UI Light","size":"16","color":"6B5B4A",
    "x":"36cm","y":"6cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-text","text":"Join Our Mission","font":"Segoe UI","size":"40","bold":"true","color":"3C2415",
    "x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

echo '[
  {"command":"set","path":"/slide[1]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[1]/shape[10]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

officecli add morph-templates/04-earth-organic/template.pptx '/' --from '/slide[1]' && \
officecli add morph-templates/04-earth-organic/template.pptx '/' --from '/slide[1]' && \
officecli add morph-templates/04-earth-organic/template.pptx '/' --from '/slide[1]' && \
officecli add morph-templates/04-earth-organic/template.pptx '/' --from '/slide[1]'

echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

officecli view morph-templates/04-earth-organic/template.pptx outline

for i in $(seq 1 20); do echo "shape[$i]:"; officecli view morph-templates/04-earth-organic/template.pptx "/slide[1]/shape[$i]" 2>/dev/null || echo "  (not found)"; done

officecli view morph-templates/04-earth-organic/template.pptx "/slide[1]" annotated 2>/dev/null || officecli view morph-templates/04-earth-organic/template.pptx annotated 2>/dev/null

echo '[
  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"24cm","y":"10cm","width":"7cm","height":"5.5cm"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"2cm","y":"2cm","width":"9cm","height":"7cm"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"1.2cm","y":"14cm","width":"6cm","height":"4.5cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"28cm","y":"1cm","width":"5cm","height":"4cm"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"14cm","y":"15cm","width":"3.5cm","height":"3cm"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"30cm","y":"6cm","width":"2.5cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"20cm","y":"2cm","width":"1.8cm","height":"1.4cm"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"10cm","y":"16cm","width":"2cm","height":"1.6cm"}},
  {"command":"set","path":"/slide[2]/shape[9]","props":{"text":"Nature Knows Best","size":"72"}},
  {"command":"set","path":"/slide[2]/shape[10]","props":{"text":"Let the earth guide our innovation","y":"10.5cm"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

echo '[
  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"1.2cm","y":"5cm","width":"9.5cm","height":"13cm","preset":"roundRect","opacity":"0.12"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"12.2cm","y":"5cm","width":"9.5cm","height":"13cm","preset":"roundRect","opacity":"0.12"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"23.2cm","y":"5cm","width":"9.5cm","height":"13cm","preset":"roundRect","opacity":"0.12"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"x":"10cm","y":"22cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"22cm","y":"22cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[9]","props":{"text":"Three Pillars of Change","size":"40","x":"1.2cm","y":"1cm","width":"26cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[10]","props":{"text":"Our framework for sustainable impact","size":"18","x":"1.2cm","y":"3.2cm","width":"20cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[3]/shape[14]","props":{"x":"2.8cm","y":"6cm","width":"6.5cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"x":"2.8cm","y":"9cm","width":"6.5cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[16]","props":{"x":"2.8cm","y":"11.5cm","width":"6.5cm","height":"4cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{"x":"13.8cm","y":"6cm","width":"6.5cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"x":"13.8cm","y":"9cm","width":"6.5cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[11]","props":{"x":"13.8cm","y":"11.5cm","width":"6.5cm","height":"4cm"}},
  {"command":"set","path":"/slide[3]/shape[12]","props":{"x":"24.8cm","y":"6cm","width":"6.5cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"x":"24.8cm","y":"9cm","width":"6.5cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"x":"24.8cm","y":"11.5cm","width":"6.5cm","height":"4cm"}},
  {"command":"set","path":"/slide[3]/shape[20]","props":{"x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

echo '[
  {"command":"set","path":"/slide[3]/shape[9]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[3]/shape[10]/paragraph[1]","props":{"align":"left"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

echo '[
  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"1.2cm","y":"2cm","width":"14cm","height":"12cm","preset":"ellipse","opacity":"0.4"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"18cm","y":"1cm","width":"15cm","height":"10cm","preset":"ellipse","opacity":"0.35"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"20cm","y":"12cm","width":"12cm","height":"6.5cm","preset":"roundRect","opacity":"0.25"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"x":"30cm","y":"16cm","width":"3cm","height":"2.5cm","opacity":"0.2"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"1.2cm","y":"15cm","width":"2.5cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"5cm","y":"16cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"x":"16cm","y":"0.8cm","width":"1.2cm","height":"1cm"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"8cm","y":"15cm","width":"1.5cm","height":"1.2cm"}},
  {"command":"set","path":"/slide[4]/shape[9]","props":{"text":"Our Impact","size":"40","x":"1.2cm","y":"0.8cm","width":"14cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[4]/shape[10]","props":{"text":"Measurable results that matter","size":"16","color":"9E8E7A","x":"1.2cm","y":"3cm","width":"14cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[14]","props":{"text":"40%","size":"64","color":"8B6F47","x":"3cm","y":"5cm","width":"10cm","height":"4cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{"text":"Less Waste","size":"24","x":"3cm","y":"9cm","width":"10cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[16]","props":{"text":"Reduction in operational waste across all facilities","size":"14","x":"3cm","y":"11cm","width":"10cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[17]","props":{"text":"2M","size":"64","color":"A8C686","x":"20cm","y":"2.5cm","width":"11cm","height":"4cm"}},
  {"command":"set","path":"/slide[4]/shape[18]","props":{"text":"Trees Planted","size":"24","x":"20cm","y":"6.5cm","width":"11cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[11]","props":{"text":"Reforestation efforts spanning three continents","size":"14","x":"20cm","y":"8.5cm","width":"11cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[12]","props":{"text":"Carbon","size":"48","color":"6B8E6B","x":"21cm","y":"13cm","width":"10cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[13]","props":{"text":"Neutral","size":"48","color":"6B8E6B","x":"21cm","y":"15.5cm","width":"10cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[4]/shape[19]","props":{"text":"Certified carbon neutral since 2024","size":"14","x":"21cm","y":"17.5cm","width":"10cm","height":"1.2cm"}},
  {"command":"set","path":"/slide[4]/shape[20]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

echo '[
  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"26cm","y":"2cm","width":"6cm","height":"5cm","preset":"ellipse","opacity":"0.3"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"1.2cm","y":"13cm","width":"8cm","height":"5.5cm","preset":"ellipse","opacity":"0.25"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"2cm","y":"1cm","width":"5cm","height":"4cm","preset":"roundRect","opacity":"0.2"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"x":"20cm","y":"14cm","width":"7cm","height":"4.5cm","preset":"roundRect","opacity":"0.3"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{"x":"30cm","y":"14cm","width":"3cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{"x":"28cm","y":"8cm","width":"2cm","height":"2cm","opacity":"0.5"}},
  {"command":"set","path":"/slide[5]/shape[7]","props":{"x":"8cm","y":"1cm","width":"1.5cm","height":"1.2cm"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"15cm","y":"16cm","width":"1.8cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[5]/shape[9]","props":{"text":"Join Our Mission","size":"64","x":"4cm","y":"4.5cm","width":"26cm","height":"4cm"}},
  {"command":"set","path":"/slide[5]/shape[10]","props":{"text":"Together, we can build a sustainable future","size":"24","x":"4cm","y":"9.5cm","width":"26cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[5]/shape[20]","props":{"text":"www.earthandsage.org","size":"18","color":"9E8E7A","x":"4cm","y":"13cm","width":"26cm","height":"2cm"}},
  {"command":"set","path":"/slide[5]/shape[14]","props":{"x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[15]","props":{"x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[16]","props":{"x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[17]","props":{"x":"10cm","y":"22cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[18]","props":{"x":"22cm","y":"22cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[11]","props":{"x":"36cm","y":"6cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[12]","props":{"x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[13]","props":{"x":"10cm","y":"22cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[19]","props":{"x":"22cm","y":"22cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

echo '[
  {"command":"set","path":"/slide[5]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[10]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[20]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch morph-templates/04-earth-organic/template.pptx

officecli validate morph-templates/04-earth-organic/template.pptx

officecli view morph-templates/04-earth-organic/template.pptx outline

officecli view morph-templates/04-earth-organic/template.pptx annotated
