#!/bin/bash
set -e

# ============================================================
# S16 Watercolor Wash — AI Agent Platform 智能体平台发布
# Style: S16 Watercolor Wash | BG=FFFDF7 | shapes=ellipse only | morph=slow drift 2-4cm | font=LXGW WenKai / Noto Serif
# 5 slides: hero → statement → pillars → evidence → cta
# Method A: independent per-slide construction. NO animations.
# transition=morph on S2-S5.
# ============================================================

DECK="morph-templates/v8-showcase/S16-watercolor-wash/template.pptx"
cd /Users/veryliu/Documents/GitHub/OfficeCli

# Clean & create
rm -f "$DECK"
officecli create "$DECK"

# ===================== SLIDE 1: hero =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFDF7

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.08","rotation":"10",
    "x":"0cm","y":"0cm","width":"18cm","height":"15cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"ellipse","fill":"E8A87C","opacity":"0.06","rotation":"-15",
    "x":"20cm","y":"6cm","width":"16cm","height":"14cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"ellipse","fill":"C5B3D1","opacity":"0.10","rotation":"5",
    "x":"10cm","y":"0cm","width":"14cm","height":"16cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"ellipse","fill":"9BC4A8","opacity":"0.05","rotation":"-8",
    "x":"24cm","y":"0cm","width":"15cm","height":"12cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"ellipse","fill":"F2C0A2","opacity":"0.12","rotation":"20",
    "x":"0cm","y":"10cm","width":"13cm","height":"17cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.07","rotation":"-12",
    "x":"18cm","y":"8cm","width":"17cm","height":"13cm","line":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"AI Agent Platform","font":"LXGW WenKai",
    "size":"56","bold":"true","color":"5A7A6A","align":"center",
    "x":"4cm","y":"4cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"智能体平台发布","font":"LXGW WenKai",
    "size":"36","bold":"true","color":"6A5A4A","align":"center",
    "x":"4cm","y":"8.5cm","width":"26cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"让智能体为你工作","font":"Noto Serif",
    "size":"18","color":"8A7A6A","align":"center",
    "x":"4cm","y":"12cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 2: statement =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFDF7 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.09","rotation":"13",
    "x":"3cm","y":"2cm","width":"18cm","height":"15cm","line":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"ellipse","fill":"E8A87C","opacity":"0.07","rotation":"-12",
    "x":"16cm","y":"4cm","width":"16cm","height":"14cm","line":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"ellipse","fill":"C5B3D1","opacity":"0.08","rotation":"8",
    "x":"12cm","y":"3cm","width":"14cm","height":"16cm","line":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"ellipse","fill":"9BC4A8","opacity":"0.06","rotation":"-5",
    "x":"22cm","y":"2cm","width":"15cm","height":"12cm","line":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"ellipse","fill":"F2C0A2","opacity":"0.10","rotation":"18",
    "x":"2cm","y":"8cm","width":"13cm","height":"17cm","line":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.06","rotation":"-10",
    "x":"20cm","y":"10cm","width":"17cm","height":"13cm","line":"none"}},

  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "text":"从自动化到自主化","font":"LXGW WenKai",
    "size":"48","bold":"true","color":"5A7A6A","align":"center",
    "x":"2cm","y":"5.5cm","width":"30cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "text":"AI Agent 正在重新定义人机协作的边界","font":"Noto Serif",
    "size":"18","color":"8A7A6A","align":"center",
    "x":"4cm","y":"10.5cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 3: pillars =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFDF7 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.10","rotation":"6",
    "x":"0cm","y":"4cm","width":"13cm","height":"14cm","line":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"ellipse","fill":"E8A87C","opacity":"0.08","rotation":"-10",
    "x":"10cm","y":"3cm","width":"14cm","height":"15cm","line":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"ellipse","fill":"C5B3D1","opacity":"0.09","rotation":"12",
    "x":"22cm","y":"2cm","width":"13cm","height":"16cm","line":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"ellipse","fill":"9BC4A8","opacity":"0.05","rotation":"-3",
    "x":"28cm","y":"14cm","width":"8cm","height":"8cm","line":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"ellipse","fill":"F2C0A2","opacity":"0.07","rotation":"15",
    "x":"0cm","y":"14cm","width":"10cm","height":"8cm","line":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.04","rotation":"-7",
    "x":"15cm","y":"12cm","width":"12cm","height":"10cm","line":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"三大核心能力","font":"LXGW WenKai",
    "size":"36","bold":"true","color":"5A7A6A","align":"left",
    "x":"1.2cm","y":"0.8cm","width":"20cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"01","font":"LXGW WenKai",
    "size":"44","bold":"true","color":"7AADCF","align":"center",
    "x":"1.2cm","y":"3.8cm","width":"9cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"感知","font":"LXGW WenKai",
    "size":"24","bold":"true","color":"5A7A6A","align":"center",
    "x":"1.2cm","y":"6.2cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"多模态输入理解\n实时环境感知","font":"Noto Serif",
    "size":"16","color":"6A5A4A","align":"center",
    "x":"1.2cm","y":"8.2cm","width":"9cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"02","font":"LXGW WenKai",
    "size":"44","bold":"true","color":"E8A87C","align":"center",
    "x":"12.5cm","y":"3.8cm","width":"9cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"推理","font":"LXGW WenKai",
    "size":"24","bold":"true","color":"5A7A6A","align":"center",
    "x":"12.5cm","y":"6.2cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"链式思维规划\n动态策略生成","font":"Noto Serif",
    "size":"16","color":"6A5A4A","align":"center",
    "x":"12.5cm","y":"8.2cm","width":"9cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"03","font":"LXGW WenKai",
    "size":"44","bold":"true","color":"C5B3D1","align":"center",
    "x":"23.8cm","y":"3.8cm","width":"9cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"执行","font":"LXGW WenKai",
    "size":"24","bold":"true","color":"5A7A6A","align":"center",
    "x":"23.8cm","y":"6.2cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"工具调用编排\n闭环反馈迭代","font":"Noto Serif",
    "size":"16","color":"6A5A4A","align":"center",
    "x":"23.8cm","y":"8.2cm","width":"9cm","height":"3cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 4: evidence =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFDF7 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.35","rotation":"8",
    "x":"0cm","y":"1cm","width":"18cm","height":"17cm","line":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"E8A87C","opacity":"0.30","rotation":"-12",
    "x":"18cm","y":"0cm","width":"16cm","height":"14cm","line":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"C5B3D1","opacity":"0.08","rotation":"5",
    "x":"26cm","y":"12cm","width":"10cm","height":"10cm","line":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"9BC4A8","opacity":"0.06","rotation":"-6",
    "x":"14cm","y":"14cm","width":"8cm","height":"6cm","line":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"F2C0A2","opacity":"0.05","rotation":"10",
    "x":"30cm","y":"0cm","width":"6cm","height":"6cm","line":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.04","rotation":"-4",
    "x":"10cm","y":"15cm","width":"5cm","height":"5cm","line":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平台数据","font":"LXGW WenKai",
    "size":"36","bold":"true","color":"5A7A6A","align":"left",
    "x":"1.2cm","y":"0.8cm","width":"20cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"10M+","font":"LXGW WenKai",
    "size":"72","bold":"true","color":"FFFFFF","align":"center",
    "x":"1.2cm","y":"5cm","width":"14cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"智能体调用次数","font":"Noto Serif",
    "size":"18","color":"FFFFFF","align":"center","opacity":"0.9",
    "x":"1.2cm","y":"9cm","width":"14cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"99.95%","font":"LXGW WenKai",
    "size":"56","bold":"true","color":"5A3A2A","align":"center",
    "x":"19cm","y":"3cm","width":"14cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平台可用性","font":"Noto Serif",
    "size":"18","color":"6A5A4A","align":"center",
    "x":"19cm","y":"6.5cm","width":"14cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"50ms","font":"LXGW WenKai",
    "size":"44","bold":"true","color":"5A3A2A","align":"center",
    "x":"19cm","y":"10cm","width":"14cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平均响应延迟","font":"Noto Serif",
    "size":"18","color":"6A5A4A","align":"center",
    "x":"19cm","y":"13cm","width":"14cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 5: cta =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=FFFDF7 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.09","rotation":"12",
    "x":"22cm","y":"8cm","width":"16cm","height":"14cm","line":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"ellipse","fill":"E8A87C","opacity":"0.07","rotation":"-14",
    "x":"0cm","y":"0cm","width":"14cm","height":"12cm","line":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"ellipse","fill":"C5B3D1","opacity":"0.10","rotation":"7",
    "x":"8cm","y":"10cm","width":"15cm","height":"16cm","line":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"ellipse","fill":"9BC4A8","opacity":"0.06","rotation":"-10",
    "x":"26cm","y":"0cm","width":"12cm","height":"10cm","line":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"ellipse","fill":"F2C0A2","opacity":"0.11","rotation":"16",
    "x":"0cm","y":"12cm","width":"14cm","height":"14cm","line":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"ellipse","fill":"7AADCF","opacity":"0.05","rotation":"-8",
    "x":"16cm","y":"0cm","width":"13cm","height":"11cm","line":"none"}},

  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "text":"开始构建你的智能体","font":"LXGW WenKai",
    "size":"48","bold":"true","color":"5A7A6A","align":"center",
    "x":"4cm","y":"4.5cm","width":"26cm","height":"4.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "text":"platform.ai/agents  |  立即体验","font":"Noto Serif",
    "size":"18","color":"8A7A6A","align":"center",
    "x":"4cm","y":"10cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== VALIDATE =====================
officecli validate "$DECK"
officecli view "$DECK" outline
