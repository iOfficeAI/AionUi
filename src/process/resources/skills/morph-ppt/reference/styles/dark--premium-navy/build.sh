#!/bin/bash
set -e

# Build script for 05-premium-navy
# Auto-extracted from agent output

mkdir -p /Users/veryliu/Documents/GitHub/OfficeCli/morph-templates/05-premium-navy && officecli --version

DECK="morph-templates/05-premium-navy/template.pptx" && officecli create "$DECK" && officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=0C1B33

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!bar-gold","preset":"rect","fill":"C9A84C",
    "x":"7.9cm","y":"11.5cm","width":"18cm","height":"0.08cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!bar-navy","preset":"rect","fill":"1E3A5F",
    "x":"30cm","y":"2.5cm","width":"0.06cm","height":"14cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!frame-gold","preset":"roundRect","fill":"C9A84C","opacity":"0.15",
    "x":"24cm","y":"1cm","width":"8cm","height":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!frame-navy","preset":"roundRect","fill":"1E3A5F","opacity":"0.3",
    "x":"1.2cm","y":"12cm","width":"10cm","height":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!accent-gold","preset":"ellipse","fill":"C9A84C","opacity":"0.2",
    "x":"28cm","y":"14cm","width":"3cm","height":"3cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!accent-steel","preset":"ellipse","fill":"8EACC1","opacity":"0.15",
    "x":"1.5cm","y":"1cm","width":"4cm","height":"4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-gold","preset":"ellipse","fill":"C9A84C","opacity":"0.6",
    "x":"26cm","y":"8cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!dot-white","preset":"ellipse","fill":"FFFFFF","opacity":"0.3",
    "x":"5cm","y":"15cm","width":"1cm","height":"1cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-title","text":"Annual Strategy Review","font":"Segoe UI Black",
    "size":"60","bold":"true","color":"FFFFFF",
    "x":"4cm","y":"4cm","width":"26cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!hero-sub","text":"Excellence in Execution","font":"Segoe UI Light",
    "size":"24","color":"C9A84C",
    "x":"4cm","y":"7.8cm","width":"26cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-num","text":"","font":"Segoe UI Black","size":"48","color":"C9A84C",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-title","text":"","font":"Segoe UI Black","size":"22","color":"FFFFFF",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-desc","text":"","font":"Segoe UI Light","size":"14","color":"8EACC1",
    "x":"-3cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-num","text":"","font":"Segoe UI Black","size":"48","color":"C9A84C",
    "x":"10cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-title","text":"","font":"Segoe UI Black","size":"22","color":"FFFFFF",
    "x":"22cm","y":"-3cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-desc","text":"","font":"Segoe UI Light","size":"14","color":"8EACC1",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-num","text":"","font":"Segoe UI Black","size":"48","color":"C9A84C",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-title","text":"","font":"Segoe UI Black","size":"22","color":"FFFFFF",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-desc","text":"","font":"Segoe UI Light","size":"14","color":"8EACC1",
    "x":"-3cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-line","text":"","font":"Segoe UI Light","size":"18","color":"8EACC1",
    "x":"-3cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-num","text":"","font":"Segoe UI Black","size":"48","color":"C9A84C",
    "x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-title","text":"","font":"Segoe UI Black","size":"22","color":"FFFFFF",
    "x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-1-desc","text":"","font":"Segoe UI Light","size":"14","color":"8EACC1",
    "x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-num","text":"","font":"Segoe UI Black","size":"48","color":"C9A84C",
    "x":"10cm","y":"21cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-2-title","text":"","font":"Segoe UI Black","size":"22","color":"FFFFFF",
    "x":"22cm","y":"21cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!card-3-desc","text":"","font":"Segoe UI Light","size":"14","color":"8EACC1",
    "x":"36cm","y":"5cm","width":"0.1cm","height":"0.1cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"!!cta-line","text":"","font":"Segoe UI Light","size":"18","color":"8EACC1",
    "x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm","fill":"none"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"set","path":"/slide[1]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[1]/shape[10]/paragraph[1]","props":{"align":"center"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && officecli add "$DECK" '/' --from '/slide[1]' && officecli add "$DECK" '/' --from '/slide[1]' && officecli add "$DECK" '/' --from '/slide[1]' && officecli add "$DECK" '/' --from '/slide[1]'

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"2cm","y":"9.5cm","width":"18cm","height":"0.08cm"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"3cm","y":"3cm","width":"0.06cm","height":"14cm"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"26cm","y":"11cm","width":"6cm","height":"5cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"20cm","y":"0.5cm","width":"12cm","height":"10cm"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"1cm","y":"13cm","width":"3cm","height":"3cm"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"28cm","y":"2cm","width":"4cm","height":"4cm"}},
  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"6cm","y":"14cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"30cm","y":"8cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[2]/shape[9]","props":{"text":"Leading Through Change","size":"54","x":"4cm","y":"6cm","width":"26cm","height":"4cm"}},
  {"command":"set","path":"/slide[2]/shape[10]","props":{"text":"Navigating uncertainty with clarity and purpose","size":"20","color":"8EACC1","x":"4cm","y":"10.5cm","width":"26cm","height":"2cm"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"4cm","y":"2.5cm","width":"26cm","height":"0.08cm"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"12.5cm","y":"5cm","width":"0.06cm","height":"12cm"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"preset":"roundRect","x":"2cm","y":"5.5cm","width":"9cm","height":"11cm","opacity":"0.12"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"preset":"roundRect","x":"12.8cm","y":"5.5cm","width":"9cm","height":"11cm","opacity":"0.12"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"23.5cm","y":"5.5cm","width":"9cm","height":"11cm","preset":"roundRect","opacity":"0.12","fill":"2C4F7C"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"30cm","y":"1cm","width":"2cm","height":"2cm"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"x":"1.2cm","y":"2cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"16cm","y":"2cm","width":"0.6cm","height":"0.6cm"}},
  {"command":"set","path":"/slide[3]/shape[9]","props":{"text":"Our Three Pillars","size":"40","x":"2cm","y":"0.8cm","width":"20cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[9]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[3]/shape[10]","props":{"text":"","x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[14]","props":{"text":"01","x":"3.2cm","y":"6.2cm","width":"4cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"text":"Vision","x":"3.2cm","y":"8.8cm","width":"6.5cm","height":"2cm"}},
  {"command":"set","path":"/slide[3]/shape[16]","props":{"text":"Setting the direction with bold ambition and strategic foresight","x":"3.2cm","y":"10.8cm","width":"6.5cm","height":"4cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{"text":"02","x":"14cm","y":"6.2cm","width":"4cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"text":"Execution","x":"14cm","y":"8.8cm","width":"6.5cm","height":"2cm"}},
  {"command":"set","path":"/slide[3]/shape[11]","props":{"text":"Delivering results through disciplined operational excellence","x":"14cm","y":"10.8cm","width":"6.5cm","height":"4cm"}},
  {"command":"set","path":"/slide[3]/shape[12]","props":{"text":"03","x":"24.8cm","y":"6.2cm","width":"4cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"text":"Results","x":"24.8cm","y":"8.8cm","width":"6.5cm","height":"2cm"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"text":"Measuring impact with transparent metrics and accountability","x":"24.8cm","y":"10.8cm","width":"6.5cm","height":"4cm"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"1.2cm","y":"17cm","width":"32cm","height":"0.08cm"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"22cm","y":"1cm","width":"0.06cm","height":"17cm"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"preset":"roundRect","x":"1.2cm","y":"3.5cm","width":"13cm","height":"12cm","opacity":"0.45","fill":"C9A84C"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"preset":"roundRect","x":"15.5cm","y":"3.5cm","width":"8cm","height":"8cm","opacity":"0.35","fill":"1E3A5F"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"28cm","y":"12cm","width":"4cm","height":"4cm","opacity":"0.25"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"25cm","y":"4cm","width":"3cm","height":"3cm","opacity":"0.15"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"x":"30cm","y":"2cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"24cm","y":"16cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[4]/shape[9]","props":{"text":"Performance Metrics","size":"36","x":"1.2cm","y":"0.8cm","width":"20cm","height":"2.5cm"}},
  {"command":"set","path":"/slide[4]/shape[9]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[4]/shape[10]","props":{"text":"FY2025 Annual Results","size":"16","color":"5A7A9A","x":"1.2cm","y":"2.8cm","width":"12cm","height":"1.2cm"}},
  {"command":"set","path":"/slide[4]/shape[10]/paragraph[1]","props":{"align":"left"}},
  {"command":"set","path":"/slide[4]/shape[14]","props":{"text":"$128M","size":"64","x":"2.4cm","y":"5.5cm","width":"10cm","height":"3.5cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{"text":"Revenue","size":"24","x":"2.4cm","y":"9cm","width":"10cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[16]","props":{"text":"Year-over-year growth driven by strategic expansion","size":"14","x":"2.4cm","y":"11cm","width":"10cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[17]","props":{"text":"34%","size":"54","x":"16.5cm","y":"5cm","width":"6cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[18]","props":{"text":"Growth","size":"22","x":"16.5cm","y":"8cm","width":"6cm","height":"1.8cm"}},
  {"command":"set","path":"/slide[4]/shape[11]","props":{"text":"Outpacing industry average by 2.1x","size":"14","x":"16.5cm","y":"9.8cm","width":"6cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[12]","props":{"text":"#1","size":"48","x":"25cm","y":"5cm","width":"6cm","height":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[13]","props":{"text":"Market Share","size":"20","x":"25cm","y":"8cm","width":"6cm","height":"1.8cm"}},
  {"command":"set","path":"/slide[4]/shape[19]","props":{"text":"Leading position across all key segments","size":"14","x":"25cm","y":"9.8cm","width":"6cm","height":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[20]","props":{"x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && echo '[
  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"10cm","y":"12.5cm","width":"14cm","height":"0.08cm"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"16.9cm","y":"1cm","width":"0.06cm","height":"10cm"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"preset":"roundRect","x":"2cm","y":"13cm","width":"6cm","height":"4cm","opacity":"0.15","fill":"C9A84C"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"preset":"roundRect","x":"25cm","y":"1cm","width":"7cm","height":"6cm","opacity":"0.3","fill":"1E3A5F"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{"preset":"ellipse","x":"30cm","y":"15cm","width":"2.5cm","height":"2.5cm","opacity":"0.2","fill":"C9A84C"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{"x":"1cm","y":"14cm","width":"3cm","height":"3cm","opacity":"0.15"}},
  {"command":"set","path":"/slide[5]/shape[7]","props":{"x":"8cm","y":"16cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"26cm","y":"10cm","width":"1cm","height":"1cm"}},
  {"command":"set","path":"/slide[5]/shape[9]","props":{"text":"The Road Ahead","size":"60","x":"4cm","y":"4cm","width":"26cm","height":"3.5cm"}},
  {"command":"set","path":"/slide[5]/shape[9]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[10]","props":{"text":"Building the future, together","size":"22","color":"C9A84C","x":"4cm","y":"8cm","width":"26cm","height":"2cm"}},
  {"command":"set","path":"/slide[5]/shape[10]/paragraph[1]","props":{"align":"center"}},
  {"command":"set","path":"/slide[5]/shape[14]","props":{"text":"","x":"36cm","y":"2cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[15]","props":{"text":"","x":"36cm","y":"10cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[16]","props":{"text":"","x":"36cm","y":"17cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[17]","props":{"text":"","x":"10cm","y":"21cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[18]","props":{"text":"","x":"22cm","y":"21cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[11]","props":{"text":"","x":"36cm","y":"5cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[12]","props":{"text":"","x":"36cm","y":"14cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[13]","props":{"text":"","x":"10cm","y":"21cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[19]","props":{"text":"","x":"22cm","y":"21cm","width":"0.1cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[20]","props":{"text":"","x":"36cm","y":"8cm","width":"0.1cm","height":"0.1cm"}}
]' | officecli batch "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && officecli validate "$DECK"

DECK="morph-templates/05-premium-navy/template.pptx" && officecli view "$DECK" outline
