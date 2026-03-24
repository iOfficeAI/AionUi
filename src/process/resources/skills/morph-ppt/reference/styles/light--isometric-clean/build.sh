#!/bin/bash
set -e

# ============================================================
# S23 Isometric Clean — AI Agent Platform 智能体平台发布
# Style: S23 Isometric Clean | BG=F0F4F8 | shapes=diamond+rect | morph=block slide | font=Inter Bold
# 5 slides: hero → statement → pillars → evidence → cta
# Method A: independent per-slide construction. NO animations.
# transition=morph on S2-S5.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DECK="$SCRIPT_DIR/light__isometric_clean.pptx"

# Clean & create
rm -f "$DECK"
officecli create "$DECK"

# ===================== SLIDE 1: hero =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F0F4F8

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"diamond","fill":"E8ECF1","opacity":"0.50",
    "x":"12cm","y":"10cm","width":"10cm","height":"6cm","name":"platform"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.85",
    "x":"14cm","y":"5cm","width":"6cm","height":"3.5cm","name":"blockA-top"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"rect","fill":"67C7EB","opacity":"0.80",
    "x":"17cm","y":"7cm","width":"3cm","height":"4cm","name":"blockA-right"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"rect","fill":"2C5F8A","opacity":"0.80",
    "x":"14cm","y":"7cm","width":"3cm","height":"4cm","name":"blockA-left"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"diamond","fill":"F5A623","opacity":"0.80",
    "x":"2cm","y":"12cm","width":"5cm","height":"3cm","name":"blockB-top"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"rect","fill":"F5A623","opacity":"0.55",
    "x":"4.5cm","y":"14cm","width":"2.5cm","height":"3cm","name":"blockB-right"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.60",
    "x":"26cm","y":"3cm","width":"3cm","height":"1.8cm","name":"smallA"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"diamond","fill":"67C7EB","opacity":"0.60",
    "x":"28cm","y":"14cm","width":"3cm","height":"1.8cm","name":"smallB"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "preset":"diamond","fill":"2C5F8A","opacity":"0.40",
    "x":"0cm","y":"2cm","width":"3cm","height":"1.8cm","name":"smallC"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"AI Agent Platform","font":"Inter",
    "size":"60","bold":"true","color":"2C5F8A","align":"center",
    "x":"4cm","y":"1.5cm","width":"26cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{
    "text":"智能体平台发布","font":"Inter",
    "size":"28","color":"4A5568","align":"center",
    "x":"4cm","y":"5.5cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 2: statement =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F0F4F8 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"diamond","fill":"E8ECF1","opacity":"0.50",
    "x":"1cm","y":"12cm","width":"10cm","height":"6cm","name":"platform"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.85",
    "x":"2cm","y":"7cm","width":"6cm","height":"3.5cm","name":"blockA-top"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"rect","fill":"67C7EB","opacity":"0.80",
    "x":"5cm","y":"9cm","width":"3cm","height":"4cm","name":"blockA-right"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"rect","fill":"2C5F8A","opacity":"0.80",
    "x":"2cm","y":"9cm","width":"3cm","height":"4cm","name":"blockA-left"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"diamond","fill":"F5A623","opacity":"0.80",
    "x":"25cm","y":"2cm","width":"5cm","height":"3cm","name":"blockB-top"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"rect","fill":"F5A623","opacity":"0.55",
    "x":"27.5cm","y":"4cm","width":"2.5cm","height":"3cm","name":"blockB-right"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.60",
    "x":"30cm","y":"14cm","width":"3cm","height":"1.8cm","name":"smallA"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"diamond","fill":"67C7EB","opacity":"0.60",
    "x":"20cm","y":"0.8cm","width":"3cm","height":"1.8cm","name":"smallB"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "preset":"diamond","fill":"2C5F8A","opacity":"0.40",
    "x":"32cm","y":"8cm","width":"3cm","height":"1.8cm","name":"smallC"}},

  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "text":"从自动化到自主化","font":"Inter",
    "size":"52","bold":"true","color":"2C5F8A","align":"center",
    "x":"6cm","y":"4.5cm","width":"24cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{
    "text":"AI Agent 正在重新定义人机协作的边界","font":"Inter",
    "size":"20","color":"4A5568","align":"center",
    "x":"8cm","y":"9cm","width":"22cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 3: pillars =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F0F4F8 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"E8ECF1","opacity":"0.50",
    "x":"8cm","y":"14cm","width":"10cm","height":"6cm","name":"platform"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.12",
    "x":"1.2cm","y":"4.5cm","width":"9cm","height":"5.5cm","name":"blockA-top"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"67C7EB","opacity":"0.12",
    "x":"12.5cm","y":"4.5cm","width":"9cm","height":"5.5cm","name":"blockA-right"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"2C5F8A","opacity":"0.12",
    "x":"23.8cm","y":"4.5cm","width":"9cm","height":"5.5cm","name":"blockA-left"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"F5A623","opacity":"0.60",
    "x":"30cm","y":"0.8cm","width":"3cm","height":"1.8cm","name":"blockB-top"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.40",
    "x":"0cm","y":"16cm","width":"3cm","height":"1.8cm","name":"blockB-right"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"67C7EB","opacity":"0.60",
    "x":"0cm","y":"0.8cm","width":"3cm","height":"1.8cm","name":"smallA"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"diamond","fill":"2C5F8A","opacity":"0.40",
    "x":"32cm","y":"16cm","width":"3cm","height":"1.8cm","name":"smallB"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "preset":"rect","fill":"F5A623","opacity":"0.55",
    "x":"15cm","y":"16cm","width":"2.5cm","height":"3cm","name":"smallC"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"三大核心能力","font":"Inter",
    "size":"36","bold":"true","color":"2C5F8A","align":"left",
    "x":"1.2cm","y":"0.8cm","width":"20cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"01","font":"Inter",
    "size":"44","bold":"true","color":"4A90D9","align":"center",
    "x":"3cm","y":"5cm","width":"5cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"感知","font":"Inter",
    "size":"24","bold":"true","color":"2C5F8A","align":"center",
    "x":"2cm","y":"7.2cm","width":"7.2cm","height":"1.8cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"多模态输入理解\n实时环境感知","font":"Inter",
    "size":"16","color":"4A5568","align":"center",
    "x":"2cm","y":"9cm","width":"7.2cm","height":"2.5cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"02","font":"Inter",
    "size":"44","bold":"true","color":"67C7EB","align":"center",
    "x":"14.5cm","y":"5cm","width":"5cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"推理","font":"Inter",
    "size":"24","bold":"true","color":"2C5F8A","align":"center",
    "x":"13.2cm","y":"7.2cm","width":"7.2cm","height":"1.8cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"链式思维规划\n动态策略生成","font":"Inter",
    "size":"16","color":"4A5568","align":"center",
    "x":"13.2cm","y":"9cm","width":"7.2cm","height":"2.5cm","fill":"none"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"03","font":"Inter",
    "size":"44","bold":"true","color":"F5A623","align":"center",
    "x":"25.8cm","y":"5cm","width":"5cm","height":"2.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"执行","font":"Inter",
    "size":"24","bold":"true","color":"2C5F8A","align":"center",
    "x":"24.5cm","y":"7.2cm","width":"7.2cm","height":"1.8cm","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{
    "text":"工具调用编排\n闭环反馈迭代","font":"Inter",
    "size":"16","color":"4A5568","align":"center",
    "x":"24.5cm","y":"9cm","width":"7.2cm","height":"2.5cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 4: evidence =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F0F4F8 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.45",
    "x":"0cm","y":"3cm","width":"16cm","height":"10cm","name":"platform"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"rect","fill":"2C5F8A","opacity":"0.40",
    "x":"0cm","y":"10cm","width":"8cm","height":"8cm","name":"blockA-top"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"diamond","fill":"67C7EB","opacity":"0.35",
    "x":"20cm","y":"1cm","width":"14cm","height":"8cm","name":"blockA-right"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"rect","fill":"67C7EB","opacity":"0.30",
    "x":"28cm","y":"7cm","width":"6cm","height":"6cm","name":"blockA-left"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"diamond","fill":"F5A623","opacity":"0.60",
    "x":"16cm","y":"14cm","width":"5cm","height":"3cm","name":"blockB-top"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"diamond","fill":"E8ECF1","opacity":"0.40",
    "x":"28cm","y":"14cm","width":"3cm","height":"1.8cm","name":"blockB-right"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.50",
    "x":"18cm","y":"0cm","width":"3cm","height":"1.8cm","name":"smallA"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"diamond","fill":"2C5F8A","opacity":"0.35",
    "x":"12cm","y":"16cm","width":"3cm","height":"1.8cm","name":"smallB"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "preset":"diamond","fill":"67C7EB","opacity":"0.30",
    "x":"32cm","y":"12cm","width":"2cm","height":"1.2cm","name":"smallC"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平台数据","font":"Inter",
    "size":"36","bold":"true","color":"2C5F8A","align":"left",
    "x":"1.2cm","y":"0.8cm","width":"14cm","height":"2cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"10M+","font":"Inter",
    "size":"68","bold":"true","color":"FFFFFF","align":"center",
    "x":"1cm","y":"5cm","width":"13cm","height":"3.5cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"智能体调用次数","font":"Inter",
    "size":"18","color":"E8ECF1","align":"center",
    "x":"1cm","y":"8.5cm","width":"13cm","height":"1.8cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"99.95%","font":"Inter",
    "size":"52","bold":"true","color":"2C5F8A","align":"center",
    "x":"20cm","y":"3cm","width":"13cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平台可用性","font":"Inter",
    "size":"18","color":"4A5568","align":"center",
    "x":"20cm","y":"6cm","width":"13cm","height":"1.8cm","fill":"none"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"50ms","font":"Inter",
    "size":"44","bold":"true","color":"F5A623","align":"center",
    "x":"20cm","y":"10cm","width":"13cm","height":"3cm","fill":"none"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{
    "text":"平均响应延迟","font":"Inter",
    "size":"18","color":"4A5568","align":"center",
    "x":"20cm","y":"13cm","width":"13cm","height":"1.8cm","fill":"none"}}
]
BATCH

# ===================== SLIDE 5: cta =====================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=F0F4F8 --prop transition=morph

cat <<'BATCH' | officecli batch "$DECK"
[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"diamond","fill":"E8ECF1","opacity":"0.50",
    "x":"18cm","y":"12cm","width":"10cm","height":"6cm","name":"platform"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.85",
    "x":"22cm","y":"7cm","width":"6cm","height":"3.5cm","name":"blockA-top"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"rect","fill":"67C7EB","opacity":"0.80",
    "x":"25cm","y":"9cm","width":"3cm","height":"4cm","name":"blockA-right"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"rect","fill":"2C5F8A","opacity":"0.80",
    "x":"22cm","y":"9cm","width":"3cm","height":"4cm","name":"blockA-left"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"diamond","fill":"F5A623","opacity":"0.80",
    "x":"0cm","y":"4cm","width":"5cm","height":"3cm","name":"blockB-top"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"rect","fill":"F5A623","opacity":"0.55",
    "x":"2.5cm","y":"6cm","width":"2.5cm","height":"3cm","name":"blockB-right"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"diamond","fill":"67C7EB","opacity":"0.60",
    "x":"2cm","y":"14cm","width":"3cm","height":"1.8cm","name":"smallA"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"diamond","fill":"4A90D9","opacity":"0.60",
    "x":"10cm","y":"0.8cm","width":"3cm","height":"1.8cm","name":"smallB"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "preset":"diamond","fill":"2C5F8A","opacity":"0.40",
    "x":"32cm","y":"2cm","width":"3cm","height":"1.8cm","name":"smallC"}},

  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "text":"开始构建你的智能体","font":"Inter",
    "size":"52","bold":"true","color":"2C5F8A","align":"center",
    "x":"4cm","y":"3.5cm","width":"26cm","height":"4cm","fill":"none"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{
    "text":"platform.ai/agents  |  立即体验","font":"Inter",
    "size":"20","color":"4A5568","align":"center",
    "x":"4cm","y":"8.5cm","width":"26cm","height":"2cm","fill":"none"}}
]
BATCH

# ===================== VALIDATE =====================
officecli validate "$DECK"
officecli view "$DECK" outline
