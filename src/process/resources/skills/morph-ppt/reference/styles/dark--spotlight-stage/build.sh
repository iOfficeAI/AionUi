#!/bin/bash
set -e

# ============================================================
# S18 Spotlight Stage — AI Agent Platform 智能体平台发布
# Style: S18 Spotlight Stage | BG=0A0A0A | shapes=ellipse+rect | morph=spotlight sweep 15cm+ | font=Montserrat Bold/Inter
# 5 slides: hero -> statement -> pillars -> evidence -> cta
# Method A: independent per-slide construction. NO animations.
# transition=morph on S2-S5.
#
# Spotlight positions (15cm+ moves between slides):
#   S1 (9,1.5) -> S2 (25,3): 16.1cm
#   S2 (25,3) -> S3 (1,3): 24cm
#   S3 (1,3) -> S4 (18,3): 17cm
#   S4 (18,3) -> S5 (2,2): 16.0cm
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DECK="$SCRIPT_DIR/dark__spotlight_stage.pptx"

# Clean & create
rm -f "$DECK"
officecli create "$DECK"

# ===================== SLIDE 1: hero =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=0A0A0A

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"spotlight","preset":"ellipse","fill":"FFFFFF","opacity":"0.12",
    "x":"9cm","y":"1.5cm","width":"16cm","height":"16cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"warm-glow","preset":"ellipse","fill":"FFE0B2","opacity":"0.06",
    "x":"11cm","y":"3.5cm","width":"12cm","height":"12cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"stage-top","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"4cm","y":"0.5cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"stage-bottom","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"4cm","y":"18.5cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"dot1","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"2cm","y":"3cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"dot2","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"31cm","y":"5cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"dot3","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"5cm","y":"16cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "name":"dot4","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"30cm","y":"15cm","width":"0.3cm","height":"0.3cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"AI Agent Platform","font":"Montserrat Bold",
    "size":"56","bold":"true","color":"FFFFFF","align":"center",
    "x":"4cm","y":"4.5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"智能体平台发布","font":"Montserrat Bold",
    "size":"36","bold":"true","color":"FFFFFF","align":"center",
    "x":"4cm","y":"8.5cm","width":"26cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"让智能体为你工作","font":"Inter",
    "size":"20","color":"CCCCCC","align":"center",
    "x":"4cm","y":"12cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 2: statement =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=0A0A0A --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"spotlight","preset":"ellipse","fill":"FFFFFF","opacity":"0.12",
    "x":"25cm","y":"3cm","width":"16cm","height":"16cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"warm-glow","preset":"ellipse","fill":"FFE0B2","opacity":"0.06",
    "x":"27cm","y":"5cm","width":"12cm","height":"12cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"stage-top","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"3cm","y":"0.5cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"stage-bottom","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"5cm","y":"18.5cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"dot1","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"4cm","y":"5cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"dot2","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"8cm","y":"16cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"dot3","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"3cm","y":"14cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "name":"dot4","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"20cm","y":"1cm","width":"0.3cm","height":"0.3cm"}},

  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "text":"从自动化到自主化","font":"Montserrat Bold",
    "size":"52","bold":"true","color":"FFFFFF","align":"center",
    "x":"2cm","y":"5.5cm","width":"30cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "text":"AI Agent 正在重新定义人机协作的边界","font":"Inter",
    "size":"20","color":"CCCCCC","align":"center",
    "x":"4cm","y":"10.5cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 3: pillars =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=0A0A0A --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"spotlight","preset":"ellipse","fill":"FFFFFF","opacity":"0.12",
    "x":"1cm","y":"3cm","width":"16cm","height":"16cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"warm-glow","preset":"ellipse","fill":"FFE0B2","opacity":"0.06",
    "x":"3cm","y":"5cm","width":"12cm","height":"12cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"stage-top","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"5cm","y":"0.3cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"stage-bottom","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"3cm","y":"18.7cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"dot1","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"28cm","y":"2cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"dot2","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"32cm","y":"10cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"dot3","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"26cm","y":"17cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "name":"dot4","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"30cm","y":"4cm","width":"0.3cm","height":"0.3cm"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"三大核心能力","font":"Montserrat Bold",
    "size":"36","bold":"true","color":"FFFFFF","align":"left",
    "x":"1.2cm","y":"0.8cm","width":"20cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"01","font":"Montserrat Bold",
    "size":"44","bold":"true","color":"FFE0B2","align":"center",
    "x":"1.2cm","y":"4cm","width":"9cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"感知","font":"Montserrat Bold",
    "size":"24","bold":"true","color":"FFFFFF","align":"center",
    "x":"1.2cm","y":"6.5cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"多模态输入理解\n实时环境感知","font":"Inter",
    "size":"16","color":"CCCCCC","align":"center",
    "x":"1.2cm","y":"8.5cm","width":"9cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"02","font":"Montserrat Bold",
    "size":"44","bold":"true","color":"FFE0B2","align":"center",
    "x":"12.5cm","y":"4cm","width":"9cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"推理","font":"Montserrat Bold",
    "size":"24","bold":"true","color":"FFFFFF","align":"center",
    "x":"12.5cm","y":"6.5cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"链式思维规划\n动态策略生成","font":"Inter",
    "size":"16","color":"CCCCCC","align":"center",
    "x":"12.5cm","y":"8.5cm","width":"9cm","height":"3cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"03","font":"Montserrat Bold",
    "size":"44","bold":"true","color":"FFE0B2","align":"center",
    "x":"23.8cm","y":"4cm","width":"9cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"执行","font":"Montserrat Bold",
    "size":"24","bold":"true","color":"FFFFFF","align":"center",
    "x":"23.8cm","y":"6.5cm","width":"9cm","height":"2cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"工具调用编排\n闭环反馈迭代","font":"Inter",
    "size":"16","color":"CCCCCC","align":"center",
    "x":"23.8cm","y":"8.5cm","width":"9cm","height":"3cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 4: evidence =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=0A0A0A --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"spotlight","preset":"ellipse","fill":"FFFFFF","opacity":"0.12",
    "x":"18cm","y":"3cm","width":"16cm","height":"16cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"warm-glow","preset":"ellipse","fill":"FFE0B2","opacity":"0.06",
    "x":"20cm","y":"5cm","width":"12cm","height":"12cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"stage-top","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"2cm","y":"0.4cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"stage-bottom","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"6cm","y":"18.6cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"dot1","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"1cm","y":"8cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"dot2","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"5cm","y":"17cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"dot3","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"14cm","y":"1cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "name":"dot4","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"10cm","y":"15cm","width":"0.3cm","height":"0.3cm"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平台数据","font":"Montserrat Bold",
    "size":"36","bold":"true","color":"FFFFFF","align":"left",
    "x":"1.2cm","y":"0.8cm","width":"20cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"FFFFFF","opacity":"0.45",
    "x":"1.2cm","y":"4cm","width":"14cm","height":"14cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"10M+","font":"Montserrat Bold",
    "size":"72","bold":"true","color":"FFFFFF","align":"center",
    "x":"1.2cm","y":"6cm","width":"14cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"智能体调用次数","font":"Inter",
    "size":"18","color":"CCCCCC","align":"center",
    "x":"1.2cm","y":"10cm","width":"14cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"ellipse","fill":"FFE0B2","opacity":"0.35",
    "x":"19cm","y":"3cm","width":"10cm","height":"10cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"99.95%","font":"Montserrat Bold",
    "size":"52","bold":"true","color":"FFFFFF","align":"center",
    "x":"19cm","y":"4.5cm","width":"10cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平台可用性","font":"Inter",
    "size":"18","color":"CCCCCC","align":"center",
    "x":"19cm","y":"7.5cm","width":"10cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"50ms","font":"Montserrat Bold",
    "size":"44","bold":"true","color":"FFE0B2","align":"center",
    "x":"20cm","y":"14cm","width":"10cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平均响应延迟","font":"Inter",
    "size":"18","color":"CCCCCC","align":"center",
    "x":"20cm","y":"17cm","width":"10cm","height":"1.5cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 5: cta =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=0A0A0A --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"spotlight","preset":"ellipse","fill":"FFFFFF","opacity":"0.12",
    "x":"2cm","y":"2cm","width":"16cm","height":"16cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"warm-glow","preset":"ellipse","fill":"FFE0B2","opacity":"0.06",
    "x":"4cm","y":"4cm","width":"12cm","height":"12cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"stage-top","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"4cm","y":"0.6cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"stage-bottom","preset":"rect","fill":"333333","opacity":"0.4",
    "x":"4cm","y":"18.4cm","width":"25cm","height":"0.04cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"dot1","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"28cm","y":"3cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"dot2","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"25cm","y":"14cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"dot3","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"32cm","y":"8cm","width":"0.3cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "name":"dot4","preset":"ellipse","fill":"FFE0B2","opacity":"0.15",
    "x":"20cm","y":"17cm","width":"0.3cm","height":"0.3cm"}},

  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "text":"开始构建你的智能体","font":"Montserrat Bold",
    "size":"52","bold":"true","color":"FFFFFF","align":"center",
    "x":"4cm","y":"4.5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "text":"platform.ai/agents  |  立即体验","font":"Inter",
    "size":"20","color":"CCCCCC","align":"center",
    "x":"4cm","y":"10cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== VALIDATE =====================
officecli validate "$DECK"
officecli view "$DECK" outline
