#!/usr/bin/env bash
set -euo pipefail

OUT="注意力预算-把手机时间变成创造时间.pptx"

rm -f "$OUT"

officecli create "$OUT"
officecli add "$OUT" '/' --type slide --prop layout=blank --prop background=0B0F1A --prop transition=morph

cat <<'JSON' | officecli batch "$OUT"
[
  {"command":"set","path":"/slide[1]","props":{"transition":"morph","background":"0B0F1A"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-blob-1","preset":"ellipse","fill":"2BE4A8","opacity":"0.10","x":"0cm","y":"0cm","width":"14cm","height":"14cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-blob-2","preset":"ellipse","fill":"FFB020","opacity":"0.08","x":"22cm","y":"9.8cm","width":"12cm","height":"12cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-slab","preset":"roundRect","fill":"5B6CFF","opacity":"0.07","x":"28cm","y":"2cm","width":"6cm","height":"12cm","rotation":"10"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-line-1","preset":"rect","fill":"FFFFFF","opacity":"0.06","x":"1.2cm","y":"1.0cm","width":"31.47cm","height":"0.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-line-2","preset":"rect","fill":"2BE4A8","opacity":"0.08","x":"5cm","y":"15.2cm","width":"25cm","height":"0.2cm","rotation":"-12"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-dot","preset":"ellipse","fill":"FF4D6D","opacity":"0.18","x":"30cm","y":"3cm","width":"1.4cm","height":"1.4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-ring","preset":"ellipse","fill":"000000","opacity":"0.01","line":"2BE4A8","lineWidth":"2","lineOpacity":"0.22","x":"24cm","y":"0.8cm","width":"8cm","height":"8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bg-chip","preset":"roundRect","fill":"FFB020","opacity":"0.10","x":"1.2cm","y":"16.2cm","width":"5.6cm","height":"2.2cm","rotation":"0"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"hero-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"注意力预算","font":"PingFang SC","size":"72","bold":"true","color":"FFFFFF","align":"center","valign":"middle","x":"4cm","y":"6.2cm","width":"25.9cm","height":"2.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"hero-subtitle","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"把手机时间变成创造时间","font":"PingFang SC","size":"36","bold":"false","color":"B9C6D6","align":"center","valign":"middle","x":"4cm","y":"9.6cm","width":"25.9cm","height":"1.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"hero-tagline","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"7 天可执行练习 · 无需任何 App","font":"PingFang SC","size":"18","bold":"false","color":"7F93AA","align":"center","valign":"middle","x":"4cm","y":"12.0cm","width":"25.9cm","height":"1.0cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"statement-main","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"你不是没时间，你是被碎片买走了","font":"PingFang SC","size":"56","bold":"true","color":"FFFFFF","align":"center","valign":"middle","x":"36cm","y":"7.2cm","width":"27.4cm","height":"2.4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"statement-sub","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"每一次下意识打开，都在付一笔“重启成本”","font":"PingFang SC","size":"24","bold":"false","color":"B9C6D6","align":"center","valign":"middle","x":"36cm","y":"11.8cm","width":"23.8cm","height":"1.2cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillars-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"三件事，立刻把注意力收回来","font":"PingFang SC","size":"40","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"1.2cm","width":"31.47cm","height":"1.4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar1-bg","preset":"roundRect","fill":"FFFFFF","opacity":"0.06","line":"2BE4A8","lineWidth":"2","lineOpacity":"0.18","x":"36cm","y":"5.0cm","width":"9.6cm","height":"12.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar1-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"① 识别触发器","font":"PingFang SC","size":"28","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"6.0cm","width":"8.4cm","height":"1.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar1-desc","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"把“无聊/压力/等待/社交”写成清单；每次打开前问：我现在要解决什么？","font":"PingFang SC","size":"16","bold":"false","color":"B9C6D6","align":"left","valign":"top","x":"36cm","y":"7.6cm","width":"8.4cm","height":"6.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar2-bg","preset":"roundRect","fill":"FFFFFF","opacity":"0.06","line":"2BE4A8","lineWidth":"2","lineOpacity":"0.18","x":"36cm","y":"5.0cm","width":"9.6cm","height":"12.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar2-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"② 设定预算","font":"PingFang SC","size":"28","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"6.0cm","width":"8.4cm","height":"1.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar2-desc","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"给娱乐/社交一个固定额度（示例：30 分钟）；用完就停，把想刷的内容写到明天清单。","font":"PingFang SC","size":"16","bold":"false","color":"B9C6D6","align":"left","valign":"top","x":"36cm","y":"7.6cm","width":"8.4cm","height":"6.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar3-bg","preset":"roundRect","fill":"FFFFFF","opacity":"0.06","line":"2BE4A8","lineWidth":"2","lineOpacity":"0.18","x":"36cm","y":"5.0cm","width":"9.6cm","height":"12.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar3-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"③ 保护深度区","font":"PingFang SC","size":"28","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"6.0cm","width":"8.4cm","height":"1.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar3-desc","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"每天至少留 1 个 90 分钟无打扰区块；手机离身，通知改成预约（集中 2 次处理）。","font":"PingFang SC","size":"16","bold":"false","color":"B9C6D6","align":"left","valign":"top","x":"36cm","y":"7.6cm","width":"8.4cm","height":"6.0cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"timeline-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"一天 4 步流程：把预算花在对的地方","font":"PingFang SC","size":"36","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"1.2cm","width":"31.47cm","height":"1.4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"timeline-line","preset":"rect","fill":"FFFFFF","opacity":"0.08","x":"36cm","y":"6.1cm","width":"31.47cm","height":"0.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step1-num","preset":"ellipse","fill":"2BE4A8","opacity":"1","text":"1","font":"PingFang SC","size":"20","bold":"true","color":"0B0F1A","align":"center","valign":"middle","x":"36cm","y":"5.3cm","width":"1.6cm","height":"1.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step1-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"启动（2 分钟）","font":"PingFang SC","size":"22","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"7.4cm","width":"6.2cm","height":"1.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step1-desc","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"写下今天 1 件最重要的事；设定预算：30 分钟。","font":"PingFang SC","size":"16","bold":"false","color":"B9C6D6","align":"left","valign":"top","x":"36cm","y":"8.8cm","width":"6.2cm","height":"3.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step2-num","preset":"ellipse","fill":"FFB020","opacity":"1","text":"2","font":"PingFang SC","size":"20","bold":"true","color":"0B0F1A","align":"center","valign":"middle","x":"36cm","y":"5.3cm","width":"1.6cm","height":"1.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step2-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"深潜（×2）","font":"PingFang SC","size":"22","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"7.4cm","width":"6.2cm","height":"1.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step2-desc","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"计时 25–45 分钟；手机离身；想刷→写到稍后清单。","font":"PingFang SC","size":"16","bold":"false","color":"B9C6D6","align":"left","valign":"top","x":"36cm","y":"8.8cm","width":"6.2cm","height":"3.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step3-num","preset":"ellipse","fill":"5B6CFF","opacity":"1","text":"3","font":"PingFang SC","size":"20","bold":"true","color":"FFFFFF","align":"center","valign":"middle","x":"36cm","y":"5.3cm","width":"1.6cm","height":"1.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step3-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"缓冲（5 分钟）","font":"PingFang SC","size":"22","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"7.4cm","width":"6.2cm","height":"1.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step3-desc","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"统一处理消息：删/回/记录三选一，避免无底洞。","font":"PingFang SC","size":"16","bold":"false","color":"B9C6D6","align":"left","valign":"top","x":"36cm","y":"8.8cm","width":"6.2cm","height":"3.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step4-num","preset":"ellipse","fill":"FF4D6D","opacity":"1","text":"4","font":"PingFang SC","size":"20","bold":"true","color":"FFFFFF","align":"center","valign":"middle","x":"36cm","y":"5.3cm","width":"1.6cm","height":"1.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step4-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"复盘（1 分钟）","font":"PingFang SC","size":"22","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"7.4cm","width":"6.2cm","height":"1.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"step4-desc","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"写 1 行：预算花在哪？明天只调整一处。","font":"PingFang SC","size":"16","bold":"false","color":"B9C6D6","align":"left","valign":"top","x":"36cm","y":"8.8cm","width":"6.2cm","height":"3.0cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"三个指标，让注意力“看得见”","font":"PingFang SC","size":"36","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"1.2cm","width":"31.47cm","height":"1.4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-caption","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"建议目标值（从你当前水平的 80% 开始）","font":"PingFang SC","size":"16","bold":"false","color":"7F93AA","align":"left","valign":"middle","x":"36cm","y":"2.8cm","width":"31.47cm","height":"0.9cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-note","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"只要记录 3 天，你就能看到趋势","font":"PingFang SC","size":"14","bold":"false","color":"7F93AA","align":"left","valign":"middle","x":"36cm","y":"3.7cm","width":"31.47cm","height":"0.8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviA-bg","preset":"roundRect","fill":"102A2C","opacity":"1","line":"2BE4A8","lineWidth":"2","lineOpacity":"0.80","x":"36cm","y":"5.0cm","width":"19.2cm","height":"12.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviA-num","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"≤20 次/天","font":"PingFang SC","size":"64","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"7.2cm","width":"17.6cm","height":"2.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviA-label","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"无意识打开手机","font":"PingFang SC","size":"20","bold":"false","color":"B9C6D6","align":"left","valign":"middle","x":"36cm","y":"10.3cm","width":"17.6cm","height":"1.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviB-bg","preset":"roundRect","fill":"2C2310","opacity":"1","line":"FFB020","lineWidth":"2","lineOpacity":"0.80","x":"36cm","y":"5.0cm","width":"11.1cm","height":"5.9cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviB-num","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"≥90 分钟","font":"PingFang SC","size":"44","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"6.2cm","width":"9.6cm","height":"1.8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviB-label","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"深度工作总时长","font":"PingFang SC","size":"18","bold":"false","color":"B9C6D6","align":"left","valign":"middle","x":"36cm","y":"8.3cm","width":"9.6cm","height":"1.0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviC-bg","preset":"roundRect","fill":"2C1020","opacity":"1","line":"FF4D6D","lineWidth":"2","lineOpacity":"0.80","x":"36cm","y":"11.7cm","width":"11.1cm","height":"5.9cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviC-num","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"≤8 次","font":"PingFang SC","size":"44","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"12.9cm","width":"9.6cm","height":"1.8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"eviC-label","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"任务切换次数","font":"PingFang SC","size":"18","bold":"false","color":"B9C6D6","align":"left","valign":"middle","x":"36cm","y":"15.0cm","width":"9.6cm","height":"1.0cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"quote-main","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"注意力流向哪里，你就长成哪里。","font":"PingFang SC","size":"48","bold":"true","color":"FFFFFF","align":"center","valign":"middle","x":"36cm","y":"6.8cm","width":"27.4cm","height":"3.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"quote-attrib","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"— 给未来的自己","font":"PingFang SC","size":"18","bold":"false","color":"7F93AA","align":"center","valign":"middle","x":"36cm","y":"11.0cm","width":"27.4cm","height":"1.0cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"cta-title","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"7 天挑战：让注意力回到你手上","font":"PingFang SC","size":"48","bold":"true","color":"FFFFFF","align":"center","valign":"middle","x":"36cm","y":"2.0cm","width":"27.9cm","height":"1.8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"cta-item1","preset":"roundRect","fill":"FFFFFF","opacity":"0.06","line":"2BE4A8","lineWidth":"2","lineOpacity":"0.35","text":"1 记录：每天 1 次，记下无意识打开次数","font":"PingFang SC","size":"24","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"6.0cm","width":"25.9cm","height":"2.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"cta-item2","preset":"roundRect","fill":"FFFFFF","opacity":"0.06","line":"FFB020","lineWidth":"2","lineOpacity":"0.35","text":"2 预算：每天 1 个额度（示例：30 分钟）","font":"PingFang SC","size":"24","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"9.4cm","width":"25.9cm","height":"2.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"cta-item3","preset":"roundRect","fill":"FFFFFF","opacity":"0.06","line":"FF4D6D","lineWidth":"2","lineOpacity":"0.35","text":"3 深度区：每天 1 个 90 分钟手机离身区块","font":"PingFang SC","size":"24","bold":"true","color":"FFFFFF","align":"left","valign":"middle","x":"36cm","y":"12.8cm","width":"25.9cm","height":"2.6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"cta-footer","preset":"rect","fill":"000000","opacity":"0","lineOpacity":"0","text":"现在就做：写下你今天的第一笔预算","font":"PingFang SC","size":"16","bold":"false","color":"7F93AA","align":"center","valign":"middle","x":"36cm","y":"16.6cm","width":"27.4cm","height":"0.9cm"}}
]
JSON

officecli add "$OUT" '/' --from '/slide[1]'
cat <<'JSON' | officecli batch "$OUT"
[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph","background":"0B0F1A"}},

  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"0cm","y":"8cm","width":"16cm","height":"16cm","fill":"5B6CFF","opacity":"0.08"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"18cm","y":"0cm","width":"16cm","height":"16cm","fill":"2BE4A8","opacity":"0.06"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"0cm","y":"0cm","width":"10cm","height":"6cm","fill":"FFB020","opacity":"0.05","rotation":"-8"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"32.2cm","y":"1.0cm","width":"0.2cm","height":"17cm","fill":"FFFFFF","opacity":"0.06"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"2cm","y":"2cm","width":"30cm","height":"0.2cm","rotation":"18","fill":"2BE4A8","opacity":"0.05"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"3cm","y":"3cm","width":"1.8cm","height":"1.8cm","fill":"FFB020","opacity":"0.22"}},
  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"1.2cm","y":"0.8cm","width":"10cm","height":"10cm","line":"FF4D6D","lineOpacity":"0.18"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"27cm","y":"15.8cm","width":"6.4cm","height":"2.6cm","fill":"2BE4A8","opacity":"0.10","rotation":"12"}},

  {"command":"set","path":"/slide[2]/shape[9]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[2]/shape[10]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[2]/shape[11]","props":{"x":"36cm"}},

  {"command":"set","path":"/slide[2]/shape[12]","props":{"x":"3.2cm","y":"7.2cm","width":"27.4cm","height":"2.4cm"}},
  {"command":"set","path":"/slide[2]/shape[13]","props":{"x":"5.0cm","y":"11.8cm","width":"23.8cm","height":"1.2cm"}}
]
JSON

officecli add "$OUT" '/' --from '/slide[2]'
cat <<'JSON' | officecli batch "$OUT"
[
  {"command":"set","path":"/slide[3]","props":{"transition":"morph","background":"0B0F1A"}},

  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"0cm","y":"0cm","width":"12cm","height":"12cm","fill":"2BE4A8","opacity":"0.06"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"21cm","y":"10.5cm","width":"13cm","height":"13cm","fill":"FF4D6D","opacity":"0.06"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"26.4cm","y":"2.8cm","width":"7.2cm","height":"14cm","fill":"5B6CFF","opacity":"0.05","rotation":"6"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"x":"1.2cm","y":"17.6cm","width":"31.47cm","height":"0.2cm","fill":"FFFFFF","opacity":"0.05"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"6cm","y":"3.0cm","width":"24cm","height":"0.2cm","rotation":"6","fill":"FFB020","opacity":"0.06"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"2.0cm","y":"3.2cm","width":"1.2cm","height":"1.2cm","fill":"2BE4A8","opacity":"0.18"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"x":"25.2cm","y":"0.6cm","width":"7.6cm","height":"7.6cm","line":"2BE4A8","lineOpacity":"0.16"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"1.2cm","y":"2.2cm","width":"6.2cm","height":"2.0cm","fill":"FFB020","opacity":"0.08","rotation":"-8"}},

  {"command":"set","path":"/slide[3]/shape[12]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"x":"36cm"}},

  {"command":"set","path":"/slide[3]/shape[14]","props":{"x":"1.2cm","y":"1.2cm"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"x":"1.2cm","y":"5.0cm"}},
  {"command":"set","path":"/slide[3]/shape[16]","props":{"x":"1.8cm","y":"6.0cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{"x":"1.8cm","y":"7.6cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"x":"12.0cm","y":"5.0cm"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"x":"12.6cm","y":"6.0cm"}},
  {"command":"set","path":"/slide[3]/shape[20]","props":{"x":"12.6cm","y":"7.6cm"}},
  {"command":"set","path":"/slide[3]/shape[21]","props":{"x":"22.8cm","y":"5.0cm"}},
  {"command":"set","path":"/slide[3]/shape[22]","props":{"x":"23.4cm","y":"6.0cm"}},
  {"command":"set","path":"/slide[3]/shape[23]","props":{"x":"23.4cm","y":"7.6cm"}}
]
JSON

officecli add "$OUT" '/' --from '/slide[3]'
cat <<'JSON' | officecli batch "$OUT"
[
  {"command":"set","path":"/slide[4]","props":{"transition":"morph","background":"0B0F1A"}},

  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"0cm","y":"10cm","width":"15cm","height":"15cm","fill":"FFB020","opacity":"0.06"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"20cm","y":"0cm","width":"14cm","height":"14cm","fill":"2BE4A8","opacity":"0.05"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"0cm","y":"0cm","width":"9cm","height":"8cm","fill":"5B6CFF","opacity":"0.05","rotation":"-12"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"x":"1.2cm","y":"4.6cm","width":"31.47cm","height":"0.2cm","fill":"FFFFFF","opacity":"0.05"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"3cm","y":"17.4cm","width":"28cm","height":"0.2cm","rotation":"0","fill":"FF4D6D","opacity":"0.06"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"31.2cm","y":"2.6cm","width":"1.2cm","height":"1.2cm","fill":"FF4D6D","opacity":"0.18"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"x":"1.2cm","y":"0.8cm","width":"9.0cm","height":"9.0cm","line":"2BE4A8","lineOpacity":"0.12"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"26.8cm","y":"15.6cm","width":"6.6cm","height":"2.4cm","fill":"FFB020","opacity":"0.08","rotation":"8"}},

  {"command":"set","path":"/slide[4]/shape[14]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[16]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[17]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[18]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[19]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[20]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[21]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[22]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[23]","props":{"x":"36cm"}},

  {"command":"set","path":"/slide[4]/shape[24]","props":{"x":"1.2cm","y":"1.2cm"}},
  {"command":"set","path":"/slide[4]/shape[25]","props":{"x":"1.2cm","y":"6.1cm"}},

  {"command":"set","path":"/slide[4]/shape[26]","props":{"x":"3.9cm","y":"5.3cm"}},
  {"command":"set","path":"/slide[4]/shape[27]","props":{"x":"1.6cm","y":"7.4cm"}},
  {"command":"set","path":"/slide[4]/shape[28]","props":{"x":"1.6cm","y":"8.8cm"}},

  {"command":"set","path":"/slide[4]/shape[29]","props":{"x":"12.1cm","y":"5.3cm"}},
  {"command":"set","path":"/slide[4]/shape[30]","props":{"x":"9.8cm","y":"7.4cm"}},
  {"command":"set","path":"/slide[4]/shape[31]","props":{"x":"9.8cm","y":"8.8cm"}},

  {"command":"set","path":"/slide[4]/shape[32]","props":{"x":"20.3cm","y":"5.3cm"}},
  {"command":"set","path":"/slide[4]/shape[33]","props":{"x":"18.0cm","y":"7.4cm"}},
  {"command":"set","path":"/slide[4]/shape[34]","props":{"x":"18.0cm","y":"8.8cm"}},

  {"command":"set","path":"/slide[4]/shape[35]","props":{"x":"28.5cm","y":"5.3cm"}},
  {"command":"set","path":"/slide[4]/shape[36]","props":{"x":"26.2cm","y":"7.4cm"}},
  {"command":"set","path":"/slide[4]/shape[37]","props":{"x":"26.2cm","y":"8.8cm"}}
]
JSON

officecli add "$OUT" '/' --from '/slide[4]'
cat <<'JSON' | officecli batch "$OUT"
[
  {"command":"set","path":"/slide[5]","props":{"transition":"morph","background":"0B0F1A"}},

  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"0cm","y":"0cm","width":"18cm","height":"18cm","fill":"2BE4A8","opacity":"0.05"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"23cm","y":"9.6cm","width":"11cm","height":"11cm","fill":"FFB020","opacity":"0.06"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"26.2cm","y":"0.8cm","width":"7.2cm","height":"9.6cm","fill":"5B6CFF","opacity":"0.05","rotation":"14"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"x":"1.2cm","y":"1.0cm","width":"31.47cm","height":"0.2cm","fill":"FFFFFF","opacity":"0.05"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{"x":"6cm","y":"17.6cm","width":"24cm","height":"0.2cm","rotation":"0","fill":"2BE4A8","opacity":"0.05"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{"x":"2.0cm","y":"16.0cm","width":"1.2cm","height":"1.2cm","fill":"FF4D6D","opacity":"0.16"}},
  {"command":"set","path":"/slide[5]/shape[7]","props":{"x":"24.2cm","y":"1.0cm","width":"8.6cm","height":"8.6cm","line":"2BE4A8","lineOpacity":"0.14"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"1.2cm","y":"2.2cm","width":"6.2cm","height":"2.0cm","fill":"FFB020","opacity":"0.07","rotation":"0"}},

  {"command":"set","path":"/slide[5]/shape[24]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[25]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[26]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[27]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[28]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[29]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[30]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[31]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[32]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[33]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[34]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[35]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[36]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[37]","props":{"x":"36cm"}},

  {"command":"set","path":"/slide[5]/shape[38]","props":{"x":"1.2cm","y":"1.2cm"}},
  {"command":"set","path":"/slide[5]/shape[39]","props":{"x":"1.2cm","y":"2.8cm"}},
  {"command":"set","path":"/slide[5]/shape[40]","props":{"x":"1.2cm","y":"3.7cm"}},

  {"command":"set","path":"/slide[5]/shape[41]","props":{"x":"1.2cm","y":"5.0cm"}},
  {"command":"set","path":"/slide[5]/shape[42]","props":{"x":"2.4cm","y":"7.2cm"}},
  {"command":"set","path":"/slide[5]/shape[43]","props":{"x":"2.4cm","y":"10.3cm"}},

  {"command":"set","path":"/slide[5]/shape[44]","props":{"x":"21.6cm","y":"5.0cm"}},
  {"command":"set","path":"/slide[5]/shape[45]","props":{"x":"22.4cm","y":"6.2cm"}},
  {"command":"set","path":"/slide[5]/shape[46]","props":{"x":"22.4cm","y":"8.3cm"}},

  {"command":"set","path":"/slide[5]/shape[47]","props":{"x":"21.6cm","y":"11.7cm"}},
  {"command":"set","path":"/slide[5]/shape[48]","props":{"x":"22.4cm","y":"12.9cm"}},
  {"command":"set","path":"/slide[5]/shape[49]","props":{"x":"22.4cm","y":"15.0cm"}}
]
JSON

officecli add "$OUT" '/' --from '/slide[5]'
cat <<'JSON' | officecli batch "$OUT"
[
  {"command":"set","path":"/slide[6]","props":{"transition":"morph","background":"0B0F1A"}},

  {"command":"set","path":"/slide[6]/shape[1]","props":{"x":"0cm","y":"0cm","width":"12cm","height":"12cm","fill":"2BE4A8","opacity":"0.03"}},
  {"command":"set","path":"/slide[6]/shape[2]","props":{"x":"22cm","y":"10.2cm","width":"12cm","height":"12cm","fill":"FFB020","opacity":"0.03"}},
  {"command":"set","path":"/slide[6]/shape[3]","props":{"x":"27.4cm","y":"2.0cm","width":"6.2cm","height":"14.2cm","fill":"5B6CFF","opacity":"0.02","rotation":"0"}},
  {"command":"set","path":"/slide[6]/shape[4]","props":{"x":"1.2cm","y":"18.0cm","width":"31.47cm","height":"0.2cm","fill":"FFFFFF","opacity":"0.03"}},
  {"command":"set","path":"/slide[6]/shape[5]","props":{"x":"36cm","y":"0cm","opacity":"0.03"}},
  {"command":"set","path":"/slide[6]/shape[6]","props":{"x":"31.0cm","y":"3.0cm","width":"1.0cm","height":"1.0cm","fill":"FF4D6D","opacity":"0.10"}},
  {"command":"set","path":"/slide[6]/shape[7]","props":{"x":"24.8cm","y":"0.8cm","width":"8.2cm","height":"8.2cm","lineOpacity":"0.10"}},
  {"command":"set","path":"/slide[6]/shape[8]","props":{"x":"36cm","opacity":"0.04"}},

  {"command":"set","path":"/slide[6]/shape[38]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[39]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[40]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[41]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[42]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[43]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[44]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[45]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[46]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[47]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[48]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[6]/shape[49]","props":{"x":"36cm"}},

  {"command":"set","path":"/slide[6]/shape[50]","props":{"x":"3.2cm","y":"6.8cm"}},
  {"command":"set","path":"/slide[6]/shape[51]","props":{"x":"3.2cm","y":"11.0cm"}}
]
JSON

officecli add "$OUT" '/' --from '/slide[6]'
cat <<'JSON' | officecli batch "$OUT"
[
  {"command":"set","path":"/slide[7]","props":{"transition":"morph","background":"0B0F1A"}},

  {"command":"set","path":"/slide[7]/shape[1]","props":{"x":"0cm","y":"0cm","width":"14cm","height":"14cm","fill":"2BE4A8","opacity":"0.06"}},
  {"command":"set","path":"/slide[7]/shape[2]","props":{"x":"20.5cm","y":"10.0cm","width":"13.5cm","height":"13.5cm","fill":"FFB020","opacity":"0.06"}},
  {"command":"set","path":"/slide[7]/shape[3]","props":{"x":"27.6cm","y":"1.6cm","width":"6.2cm","height":"13.8cm","fill":"5B6CFF","opacity":"0.05","rotation":"10"}},
  {"command":"set","path":"/slide[7]/shape[4]","props":{"x":"1.2cm","y":"1.0cm","width":"31.47cm","height":"0.2cm","opacity":"0.05"}},
  {"command":"set","path":"/slide[7]/shape[5]","props":{"x":"4cm","y":"17.4cm","width":"26cm","height":"0.2cm","rotation":"-8","fill":"FF4D6D","opacity":"0.06"}},
  {"command":"set","path":"/slide[7]/shape[6]","props":{"x":"2.6cm","y":"3.0cm","width":"1.2cm","height":"1.2cm","fill":"2BE4A8","opacity":"0.16"}},
  {"command":"set","path":"/slide[7]/shape[7]","props":{"x":"1.2cm","y":"9.8cm","width":"9.4cm","height":"9.4cm","line":"2BE4A8","lineOpacity":"0.14"}},
  {"command":"set","path":"/slide[7]/shape[8]","props":{"x":"26.8cm","y":"14.8cm","width":"6.6cm","height":"2.4cm","fill":"FFB020","opacity":"0.08","rotation":"0"}},

  {"command":"set","path":"/slide[7]/shape[50]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[7]/shape[51]","props":{"x":"36cm"}},

  {"command":"set","path":"/slide[7]/shape[52]","props":{"x":"3.0cm","y":"2.0cm"}},
  {"command":"set","path":"/slide[7]/shape[53]","props":{"x":"4.0cm","y":"6.0cm"}},
  {"command":"set","path":"/slide[7]/shape[54]","props":{"x":"4.0cm","y":"9.4cm"}},
  {"command":"set","path":"/slide[7]/shape[55]","props":{"x":"4.0cm","y":"12.8cm"}},
  {"command":"set","path":"/slide[7]/shape[56]","props":{"x":"3.2cm","y":"16.6cm"}}
]
JSON
