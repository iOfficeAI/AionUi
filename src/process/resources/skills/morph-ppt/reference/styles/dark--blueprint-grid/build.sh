#!/bin/bash
set -e

DECK="morph-templates/v8-showcase/S15-blueprint-grid/template.pptx"

# Clean previous build
rm -f "$DECK"

# ============================================================
# S15 Blueprint Grid — AI Agent Platform 智能体平台发布
# 5 slides: hero → statement → pillars → evidence → cta
# Style: 1B3A5C bg, 4A90D9 bright-blue accent, FFFFFF white grid
# Shapes: rect (grid lines) + ellipse (markers) only
# Method A: independent per-slide construction
# transition=morph on S2-S5, NO animations
# ============================================================

# Create deck
officecli create "$DECK"

# ===========================================
# SLIDE 1 — hero (封面)
# ===========================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1B3A5C

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-h1","preset":"rect","fill":"FFFFFF","x":"0cm","y":"4cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-h2","preset":"rect","fill":"FFFFFF","x":"0cm","y":"8.5cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-h3","preset":"rect","fill":"FFFFFF","x":"0cm","y":"13cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-h4","preset":"rect","fill":"FFFFFF","x":"0cm","y":"17.5cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-v1","preset":"rect","fill":"FFFFFF","x":"6cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-v2","preset":"rect","fill":"FFFFFF","x":"12cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-v3","preset":"rect","fill":"FFFFFF","x":"22cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"grid-v4","preset":"rect","fill":"FFFFFF","x":"28cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"major-h","preset":"rect","fill":"4A90D9","x":"0cm","y":"10.5cm","width":"34cm","height":"0.04cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"major-v","preset":"rect","fill":"4A90D9","x":"17cm","y":"0cm","width":"0.04cm","height":"19.05cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"dot1","preset":"ellipse","fill":"4A90D9","x":"5.75cm","y":"3.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"dot2","preset":"ellipse","fill":"4A90D9","x":"21.75cm","y":"12.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"dot3","preset":"ellipse","fill":"4A90D9","x":"27.75cm","y":"8.25cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"ring1","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"11.4cm","y":"12.4cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"ring2","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"27cm","y":"16.5cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"AI Agent Platform","font":"Courier New","size":"56","bold":"true","color":"FFFFFF","x":"2.4cm","y":"4.8cm","width":"24cm","height":"3cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"智能体平台发布","font":"Courier New","size":"36","color":"4A90D9","x":"2.4cm","y":"8cm","width":"18cm","height":"2.2cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"构建 · 编排 · 部署 · 监控","font":"Inter","size":"18","color":"B8D0E8","x":"2.4cm","y":"10.8cm","width":"18cm","height":"1.4cm","align":"left","valign":"middle"}}
]' | officecli batch "$DECK"

# ===========================================
# SLIDE 2 — statement (观点/转场)
# ===========================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1B3A5C --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-h1","preset":"rect","fill":"FFFFFF","x":"0cm","y":"2cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-h2","preset":"rect","fill":"FFFFFF","x":"0cm","y":"6.5cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-h3","preset":"rect","fill":"FFFFFF","x":"0cm","y":"11cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-h4","preset":"rect","fill":"FFFFFF","x":"0cm","y":"15.5cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-v1","preset":"rect","fill":"FFFFFF","x":"4cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-v2","preset":"rect","fill":"FFFFFF","x":"10cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-v3","preset":"rect","fill":"FFFFFF","x":"20cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"grid-v4","preset":"rect","fill":"FFFFFF","x":"30cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"major-h","preset":"rect","fill":"4A90D9","x":"0cm","y":"9cm","width":"34cm","height":"0.04cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"major-v","preset":"rect","fill":"4A90D9","x":"25cm","y":"0cm","width":"0.04cm","height":"19.05cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"dot1","preset":"ellipse","fill":"4A90D9","x":"9.75cm","y":"6.25cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"dot2","preset":"ellipse","fill":"4A90D9","x":"29.75cm","y":"15.25cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"dot3","preset":"ellipse","fill":"4A90D9","x":"19.75cm","y":"1.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"ring1","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"3.4cm","y":"14.9cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"ring2","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"24.4cm","y":"2cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"每个企业都需要\n自己的智能体工厂","font":"Courier New","size":"48","bold":"true","color":"FFFFFF","x":"3cm","y":"5cm","width":"28cm","height":"6cm","align":"center","valign":"middle","lineSpacing":"1.4"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"从手工搭建到工业化生产，AI Agent 正在重塑企业数字化底座","font":"Inter","size":"18","color":"B8D0E8","x":"5cm","y":"12cm","width":"24cm","height":"1.6cm","align":"center","valign":"middle"}}
]' | officecli batch "$DECK"

# ===========================================
# SLIDE 3 — pillars (三大核心支柱)
# ===========================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1B3A5C --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-h1","preset":"rect","fill":"FFFFFF","x":"0cm","y":"3.4cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-h2","preset":"rect","fill":"FFFFFF","x":"0cm","y":"9cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-h3","preset":"rect","fill":"FFFFFF","x":"0cm","y":"14.5cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-h4","preset":"rect","fill":"FFFFFF","x":"0cm","y":"18cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-v1","preset":"rect","fill":"FFFFFF","x":"11cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-v2","preset":"rect","fill":"FFFFFF","x":"22.6cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-v3","preset":"rect","fill":"FFFFFF","x":"8cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"grid-v4","preset":"rect","fill":"FFFFFF","x":"33cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"major-h","preset":"rect","fill":"4A90D9","x":"0cm","y":"3.4cm","width":"34cm","height":"0.04cm","opacity":"0.45"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"major-v","preset":"rect","fill":"4A90D9","x":"0.6cm","y":"0cm","width":"0.04cm","height":"19.05cm","opacity":"0.45"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"dot1","preset":"ellipse","fill":"4A90D9","x":"10.75cm","y":"8.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"dot2","preset":"ellipse","fill":"4A90D9","x":"22.35cm","y":"14.25cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"dot3","preset":"ellipse","fill":"4A90D9","x":"32.75cm","y":"3.15cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"ring1","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"7.4cm","y":"17cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"ring2","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"32.4cm","y":"8cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"平台三大核心支柱","font":"Courier New","size":"36","bold":"true","color":"FFFFFF","x":"1.2cm","y":"0.8cm","width":"20cm","height":"2cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"2C5F8A","x":"1.2cm","y":"4.2cm","width":"9.8cm","height":"12.6cm","opacity":"0.12"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"智能编排引擎","font":"Courier New","size":"22","bold":"true","color":"4A90D9","x":"1.8cm","y":"4.8cm","width":"8.6cm","height":"1.6cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"· 可视化工作流设计器\n· 多 Agent 协作拓扑\n· 动态任务路由与分发\n· 实时调试与回放","font":"Inter","size":"16","color":"B8D0E8","x":"1.8cm","y":"6.8cm","width":"8.6cm","height":"9cm","align":"left","valign":"top","lineSpacing":"1.5"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"2C5F8A","x":"12.2cm","y":"4.2cm","width":"9.8cm","height":"12.6cm","opacity":"0.12"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"全栈工具集成","font":"Courier New","size":"22","bold":"true","color":"4A90D9","x":"12.8cm","y":"4.8cm","width":"8.6cm","height":"1.6cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"· 200+ 预置工具连接器\n· API / SDK / 插件三模式\n· 安全沙箱执行环境\n· 统一身份与权限管理","font":"Inter","size":"16","color":"B8D0E8","x":"12.8cm","y":"6.8cm","width":"8.6cm","height":"9cm","align":"left","valign":"top","lineSpacing":"1.5"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"2C5F8A","x":"23.2cm","y":"4.2cm","width":"9.8cm","height":"12.6cm","opacity":"0.12"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"企业级可观测","font":"Courier New","size":"22","bold":"true","color":"4A90D9","x":"23.8cm","y":"4.8cm","width":"8.6cm","height":"1.6cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"· 全链路 Trace 追踪\n· Token 成本实时仪表盘\n· 质量评分与 SLA 告警\n· 合规审计日志","font":"Inter","size":"16","color":"B8D0E8","x":"23.8cm","y":"6.8cm","width":"8.6cm","height":"9cm","align":"left","valign":"top","lineSpacing":"1.5"}}
]' | officecli batch "$DECK"

# ===========================================
# SLIDE 4 — evidence (数据/统计 非对称)
# ===========================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1B3A5C --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-h1","preset":"rect","fill":"FFFFFF","x":"0cm","y":"5cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-h2","preset":"rect","fill":"FFFFFF","x":"0cm","y":"10cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-h3","preset":"rect","fill":"FFFFFF","x":"0cm","y":"15cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-h4","preset":"rect","fill":"FFFFFF","x":"0cm","y":"1cm","width":"34cm","height":"0.02cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-v1","preset":"rect","fill":"FFFFFF","x":"16cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-v2","preset":"rect","fill":"FFFFFF","x":"26cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-v3","preset":"rect","fill":"FFFFFF","x":"5cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"grid-v4","preset":"rect","fill":"FFFFFF","x":"32cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.2"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"major-h","preset":"rect","fill":"4A90D9","x":"0cm","y":"7.5cm","width":"34cm","height":"0.04cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"major-v","preset":"rect","fill":"4A90D9","x":"16cm","y":"0cm","width":"0.04cm","height":"19.05cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"preset":"rect","fill":"2C5F8A","x":"1.2cm","y":"2cm","width":"13cm","height":"14.5cm","opacity":"0.4"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"preset":"rect","fill":"2C5F8A","x":"18cm","y":"3cm","width":"14cm","height":"6cm","opacity":"0.3"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"dot1","preset":"ellipse","fill":"4A90D9","x":"15.75cm","y":"4.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"dot2","preset":"ellipse","fill":"4A90D9","x":"25.75cm","y":"14.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"dot3","preset":"ellipse","fill":"4A90D9","x":"4.75cm","y":"0.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"ring1","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"31.4cm","y":"9.4cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"ring2","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"15.4cm","y":"14.4cm","width":"1.5cm","height":"1.5cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"10,000+","font":"Courier New","size":"72","bold":"true","color":"FFFFFF","x":"2cm","y":"3cm","width":"11cm","height":"3.6cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"智能体已部署上线","font":"Inter","size":"18","color":"B8D0E8","x":"2cm","y":"6.6cm","width":"11cm","height":"1.4cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"99.95%","font":"Courier New","size":"52","bold":"true","color":"4A90D9","x":"2cm","y":"9.5cm","width":"11cm","height":"3cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"平台可用性 SLA","font":"Inter","size":"16","color":"B8D0E8","x":"2cm","y":"12.5cm","width":"11cm","height":"1.2cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"3.2x","font":"Courier New","size":"48","bold":"true","color":"FFFFFF","x":"19cm","y":"4cm","width":"12cm","height":"2.8cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"开发效率提升","font":"Inter","size":"16","color":"B8D0E8","x":"19cm","y":"6.8cm","width":"12cm","height":"1.2cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"<60s","font":"Courier New","size":"44","bold":"true","color":"4A90D9","x":"19cm","y":"11cm","width":"12cm","height":"2.8cm","align":"left","valign":"middle"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"平均任务响应时间","font":"Inter","size":"16","color":"B8D0E8","x":"19cm","y":"13.8cm","width":"12cm","height":"1.2cm","align":"left","valign":"middle"}}
]' | officecli batch "$DECK"

# ===========================================
# SLIDE 5 — cta (行动号召)
# ===========================================
officecli add "$DECK" '/' --type slide --prop layout=blank --prop background=1B3A5C --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-h1","preset":"rect","fill":"FFFFFF","x":"0cm","y":"3cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-h2","preset":"rect","fill":"FFFFFF","x":"0cm","y":"7.5cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-h3","preset":"rect","fill":"FFFFFF","x":"0cm","y":"12cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-h4","preset":"rect","fill":"FFFFFF","x":"0cm","y":"16.5cm","width":"34cm","height":"0.02cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-v1","preset":"rect","fill":"FFFFFF","x":"7cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-v2","preset":"rect","fill":"FFFFFF","x":"14cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-v3","preset":"rect","fill":"FFFFFF","x":"20cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"grid-v4","preset":"rect","fill":"FFFFFF","x":"27cm","y":"0cm","width":"0.02cm","height":"19.05cm","opacity":"0.25"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"major-h","preset":"rect","fill":"4A90D9","x":"0cm","y":"12cm","width":"34cm","height":"0.04cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"major-v","preset":"rect","fill":"4A90D9","x":"14cm","y":"0cm","width":"0.04cm","height":"19.05cm","opacity":"0.5"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"dot1","preset":"ellipse","fill":"4A90D9","x":"6.75cm","y":"2.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"dot2","preset":"ellipse","fill":"4A90D9","x":"26.75cm","y":"11.75cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"dot3","preset":"ellipse","fill":"4A90D9","x":"13.75cm","y":"16.25cm","width":"0.5cm","height":"0.5cm","opacity":"0.7"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"ring1","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"19.4cm","y":"2.4cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"ring2","preset":"ellipse","fill":"1B3A5C","line":"FFFFFF","lineWidth":"0.75pt","x":"6.4cm","y":"15.4cm","width":"1.2cm","height":"1.2cm","opacity":"0.6"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"text":"开启智能体之旅","font":"Courier New","size":"52","bold":"true","color":"FFFFFF","x":"3cm","y":"4.5cm","width":"28cm","height":"3.5cm","align":"center","valign":"middle"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"text":"申请试用  ·  预约演示  ·  联系我们","font":"Courier New","size":"22","color":"4A90D9","x":"5cm","y":"9cm","width":"24cm","height":"2cm","align":"center","valign":"middle"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"text":"agent.platform.ai","font":"Inter","size":"16","color":"B8D0E8","x":"8cm","y":"13.5cm","width":"18cm","height":"1.4cm","align":"center","valign":"middle"}}
]' | officecli batch "$DECK"

# ===========================================
# VALIDATE
# ===========================================
echo "--- VALIDATE ---"
officecli validate "$DECK"

echo ""
echo "--- VIEW OUTLINE ---"
officecli view "$DECK" outline

echo ""
echo "BUILD COMPLETE: $DECK"
