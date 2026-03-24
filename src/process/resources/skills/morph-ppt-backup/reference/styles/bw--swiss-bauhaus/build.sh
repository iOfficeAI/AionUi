#!/bin/bash
set -e

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PPTX="$BASE/swiss-bauhaus.pptx"
DW="$BASE/assets/design-workshop.jpg"
DA="$BASE/assets/design-abstract.jpg"
T1="$BASE/assets/team1.jpg"

echo "=== swiss-bauhaus v4 ==="
rm -f "$PPTX"
officecli create "$PPTX"

# ══════════════════════════════════════════════════════════════
# SWISS/BAUHAUS MORPH SYSTEM
#   blk-a (red E63322)  : 左列 → 顶条 → 中带 → 底面 → 全铺
#   blk-b (dark 1C1C1C) : 头部/底部暗块，跟随 blk-a 反转
#   blk-c (white F5F5F5): 右侧白色几何块，每页移位
#   bar-1 (dark/white)  : 水平或垂直细条 — Bauhaus 格线感
#   dot-1/dot-2         : 小几何方块 — 穿越画面的点缀
#   photo-1 / photo-2   : 图片，出现/消失在关键页
# TEXT RULES APPLIED:
#   ① margin x ≥ 1.6cm  ② width ≤ block_width - 2cm
#   ③ h ≥ pt/28 × lines × 1.4cm  ④ 文字框间距 ≥ 0.4cm
#   ⑤ 文字框不跨色块边界  ⑥ 禁 \n\n  ⑦ 无 bold on Impact
# ══════════════════════════════════════════════════════════════

# ── S1 COVER (F5F5F5) ────────────────────────────────────────
# blk-a: 红色左列 (14cm 宽)
echo "S1 cover"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=F5F5F5
jq -n --arg dw "$DW" --arg da "$DA" '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-a","fill":"E63322","x":"0cm","y":"0cm","width":"14cm","height":"19.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-b","fill":"1C1C1C","x":"14cm","y":"14cm","width":"19.87cm","height":"5.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-c","fill":"F5F5F5","x":"16cm","y":"0cm","width":"8cm","height":"8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"bar-1","fill":"1C1C1C","x":"14cm","y":"8.3cm","width":"19.87cm","height":"0.4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"dot-1","fill":"E63322","x":"25cm","y":"9.5cm","width":"2.5cm","height":"2.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"dot-2","fill":"1C1C1C","opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"photo-1","image":$dw,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"photo-2","image":$da,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"h-main","text":"DESIGN\nTHINKING","font":"Arial","size":"64","bold":"true","color":"FFFFFF","fill":"none","x":"1.6cm","y":"3cm","width":"10cm","height":"8.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"h-sub","text":"INNOVATION WORKSHOP 2025","font":"Arial","size":"12","color":"1C1C1C","fill":"none","x":"15cm","y":"9cm","width":"17cm","height":"1.2cm"}}
]' | officecli batch "$PPTX"

# ── S2 FIVE STAGES (1C1C1C) ──────────────────────────────────
# blk-a: 红色左列 → 顶条 (震撼横扫!)
# photo-1 出现在暗区左侧
echo "S2 five stages"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=1C1C1C
jq -n --arg dw "$DW" --arg da "$DA" --arg t1 "$T1" '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-a","fill":"E63322","x":"0cm","y":"0cm","width":"33.87cm","height":"5.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-b","fill":"1C1C1C","x":"0cm","y":"5.5cm","width":"33.87cm","height":"13.55cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-c","fill":"E63322","x":"27cm","y":"5.5cm","width":"6.87cm","height":"6cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"bar-1","fill":"F5F5F5","x":"0cm","y":"10.5cm","width":"33.87cm","height":"0.2cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"dot-1","fill":"F5F5F5","x":"2cm","y":"12cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"dot-2","fill":"E63322","x":"5cm","y":"11.8cm","width":"2cm","height":"2cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"photo-1","image":$t1,"x":"0cm","y":"5.5cm","width":"14cm","height":"13.55cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"photo-2","image":$da,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"h-main","text":"5 STAGES","font":"Arial","size":"56","bold":"true","color":"FFFFFF","fill":"none","x":"15cm","y":"0.8cm","width":"17cm","height":"3.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"h-sub","text":"Empathize — Define — Ideate — Prototype — Test","font":"Arial","size":"14","color":"CCCCCC","fill":"none","x":"15cm","y":"11.5cm","width":"17cm","height":"1.5cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[2]' --prop transition=morph

# ── S3 INSIGHT (F5F5F5) ──────────────────────────────────────
# blk-a: 顶条 → 中间细带 (7.5~9.5cm)
# blk-b: 头部暗块; photo-1 移至头部右侧
echo "S3 insight"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=F5F5F5
jq -n --arg dw "$DW" --arg da "$DA" '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-a","fill":"E63322","x":"0cm","y":"7.3cm","width":"33.87cm","height":"2.2cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-b","fill":"1C1C1C","x":"0cm","y":"0cm","width":"33.87cm","height":"7.3cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-c","fill":"E63322","x":"24cm","y":"9.5cm","width":"9.87cm","height":"9.55cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"bar-1","fill":"E63322","x":"0cm","y":"7.1cm","width":"33.87cm","height":"0.2cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"dot-1","fill":"FFFFFF","x":"2cm","y":"10cm","width":"2cm","height":"2cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"dot-2","fill":"1C1C1C","x":"5cm","y":"10cm","width":"2cm","height":"2cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"photo-1","image":$dw,"x":"12cm","y":"0cm","width":"21.87cm","height":"7.3cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"photo-2","image":$da,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"h-main","text":"THE INSIGHT","font":"Arial","size":"48","bold":"true","color":"FFFFFF","fill":"none","x":"1.6cm","y":"1.5cm","width":"10cm","height":"4cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"h-sub","text":"Users do not want features.\nThey want outcomes.","font":"Arial","size":"18","color":"1C1C1C","fill":"none","x":"1.6cm","y":"10.5cm","width":"21cm","height":"3cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[3]' --prop transition=morph

# ── S4 DATA (1C1C1C) ─────────────────────────────────────────
# blk-a: 中间细带 → 底部大红面 (最强 morph 落差!)
# photo-2 出现在暗区左上
echo "S4 data"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=1C1C1C
jq -n --arg dw "$DW" --arg da "$DA" '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-a","fill":"E63322","x":"0cm","y":"9cm","width":"33.87cm","height":"10.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-b","fill":"1C1C1C","x":"0cm","y":"0cm","width":"33.87cm","height":"9cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-c","fill":"E63322","x":"26cm","y":"0cm","width":"7.87cm","height":"9cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"bar-1","fill":"FFFFFF","x":"0cm","y":"9cm","width":"33.87cm","height":"0.2cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"dot-1","fill":"FFFFFF","x":"2cm","y":"0.5cm","width":"3cm","height":"3cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"dot-2","fill":"1C1C1C","opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"photo-1","image":$dw,"x":"0cm","y":"0cm","width":"26cm","height":"9cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"photo-2","image":$da,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"h-main","text":"87%","font":"Arial","size":"80","bold":"true","color":"FFFFFF","fill":"none","x":"1.6cm","y":"9.8cm","width":"12cm","height":"5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"h-sub","text":"Of teams report breakthrough ideas\nemerge from diverse perspectives.","font":"Arial","size":"15","color":"FFFFFF","fill":"none","x":"15cm","y":"10.5cm","width":"17cm","height":"3cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[4]' --prop transition=morph

# ── S5 CTA (E63322 full red) ─────────────────────────────────
# blk-a: 底部大红面 → 全铺整页 (Bauhaus climax!)
# blk-b: 底部暗带; blk-c: 右侧白色细柱
echo "S5 CTA"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=E63322
jq -n --arg dw "$DW" --arg da "$DA" '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-a","fill":"E63322","x":"0cm","y":"0cm","width":"33.87cm","height":"19.05cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-b","fill":"1C1C1C","x":"0cm","y":"12.5cm","width":"33.87cm","height":"6.55cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-c","fill":"F5F5F5","x":"28cm","y":"0cm","width":"5.87cm","height":"12.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"bar-1","fill":"FFFFFF","x":"0cm","y":"12.5cm","width":"33.87cm","height":"0.3cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"dot-1","fill":"FFFFFF","x":"1.6cm","y":"13.5cm","width":"2.5cm","height":"2.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"dot-2","fill":"E63322","x":"5.5cm","y":"13.8cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"photo-1","image":$dw,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"photo-2","image":$da,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"h-main","text":"START\nBUILDING.","font":"Arial","size":"68","bold":"true","color":"FFFFFF","fill":"none","x":"1.6cm","y":"1.5cm","width":"25cm","height":"9.8cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"h-sub","text":"workshop@company.com  |  Book your session","font":"Arial","size":"15","color":"CCCCCC","fill":"none","x":"1.6cm","y":"14cm","width":"24cm","height":"1.6cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[5]' --prop transition=morph

officecli validate "$PPTX"
officecli view "$PPTX" outline
echo "Done: $PPTX"
