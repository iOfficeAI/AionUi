#!/bin/bash
set -e

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PPTX="$BASE/creative-marketing.pptx"
BP="$BASE/assets/bold-portrait.jpg"
BC="$BASE/assets/bold-color.jpg"

echo "=== creative-marketing v4 (fixed) ==="
rm -f "$PPTX"
officecli create "$PPTX"

# ── S1 HERO (F5E0C0) ─────────────────────────────────────────
# blk-a: orange full-width top bar (9cm)
# TEXT RULE: h-main stays within blk-a (0~9cm), margin ≥ 1.6cm
echo "S1 hero"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=F5E0C0
jq -n --arg bp "$BP" --arg bc "$BC" '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-a","fill":"E8601C","x":"0cm","y":"0cm","width":"33.87cm","height":"9cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-b","fill":"1A1A1A","x":"0cm","y":"14cm","width":"16cm","height":"5.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-c","fill":"F5E0C0","x":"16cm","y":"14cm","width":"17.87cm","height":"5.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"star-1","fill":"F5E0C0","rotation":"45","x":"19cm","y":"1cm","width":"6cm","height":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"star-2","fill":"1A1A1A","rotation":"45","x":"26cm","y":"2.5cm","width":"4cm","height":"4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"star-3","fill":"E8601C","rotation":"45","x":"2.5cm","y":"10.5cm","width":"2.5cm","height":"2.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"photo-1","image":$bp,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"photo-2","image":$bc,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"h-main","text":"MAKE NOISE","font":"Impact","size":"88","color":"F5E0C0","fill":"none","x":"1.6cm","y":"1.5cm","width":"17cm","height":"5.2cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"h-sub","text":"CREATIVE MARKETING  —  2025 CAMPAIGN","font":"Impact","size":"17","color":"1A1A1A","fill":"none","x":"1.6cm","y":"10.5cm","width":"20cm","height":"1.4cm"}}
]' | officecli batch "$PPTX"

# ── S2 STATEMENT (1A1A1A) ────────────────────────────────────
# blk-a 从顶→掉到底; h-main 在 blk-a 内 (10.05~19.05cm)
echo "S2 statement"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=1A1A1A
jq -n --arg bp "$BP" --arg bc "$BC" '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-a","fill":"E8601C","x":"0cm","y":"10.05cm","width":"33.87cm","height":"9cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-b","fill":"1A1A1A","x":"0cm","y":"0cm","width":"12cm","height":"10.05cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-c","fill":"F5E0C0","x":"12cm","y":"0cm","width":"21.87cm","height":"10.05cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"star-1","fill":"F5E0C0","rotation":"45","x":"29cm","y":"11cm","width":"5cm","height":"5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"star-2","fill":"1A1A1A","rotation":"45","x":"2cm","y":"12.5cm","width":"3.5cm","height":"3.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"star-3","fill":"E8601C","rotation":"45","x":"10.5cm","y":"0.5cm","width":"3.5cm","height":"3.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"photo-1","image":$bp,"x":"12cm","y":"0cm","width":"9cm","height":"10.05cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"photo-2","image":$bc,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"h-main","text":"ATTENTION IS THE CURRENCY","font":"Impact","size":"52","color":"F5E0C0","fill":"none","x":"1.6cm","y":"11cm","width":"28cm","height":"3.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"h-sub","text":"In a world of infinite scroll, disruption is the only strategy.","font":"Arial","size":"14","color":"9A9080","fill":"none","x":"21.5cm","y":"3cm","width":"9.5cm","height":"2.5cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[2]' --prop transition=morph

# ── S3 PILLARS (F5E0C0) ─────────────────────────────────────
# blk-a 从底→压缩成细顶条 (3.2cm); 文字保持在色块内
echo "S3 pillars"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=F5E0C0
jq -n --arg bp "$BP" --arg bc "$BC" '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-a","fill":"E8601C","x":"0cm","y":"0cm","width":"33.87cm","height":"3.2cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-b","fill":"1A1A1A","x":"0cm","y":"5.5cm","width":"10cm","height":"13.55cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-c","fill":"1A1A1A","x":"12cm","y":"5.5cm","width":"10cm","height":"13.55cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"star-1","fill":"E8601C","rotation":"45","x":"10.2cm","y":"6.8cm","width":"1.8cm","height":"1.8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"star-2","fill":"E8601C","rotation":"45","x":"22.2cm","y":"6.8cm","width":"1.8cm","height":"1.8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"star-3","fill":"F5E0C0","rotation":"45","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"photo-1","image":$bp,"x":"0cm","y":"5.5cm","width":"10cm","height":"13.55cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"photo-2","image":$bc,"x":"12cm","y":"5.5cm","width":"10cm","height":"13.55cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"h-main","text":"3 CHANNELS","font":"Impact","size":"22","color":"F5E0C0","fill":"none","x":"1.6cm","y":"0.6cm","width":"15cm","height":"2cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"h-sub","text":"01 SOCIAL\n02 OOH\n03 EVENTS","font":"Impact","size":"20","color":"E8601C","fill":"none","x":"23.5cm","y":"7cm","width":"8.5cm","height":"4cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[3]' --prop transition=morph

# ── S4 EVIDENCE (E8601C full orange) ────────────────────────
# blk-a 从细顶条→爆炸成大左块; h-main 在 blk-a 内, 独立不重叠
echo "S4 evidence"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=E8601C
jq -n --arg bp "$BP" --arg bc "$BC" '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-a","fill":"E8601C","x":"0cm","y":"0cm","width":"19cm","height":"19.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-b","fill":"1A1A1A","x":"19cm","y":"11cm","width":"14.87cm","height":"8.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-c","fill":"F5E0C0","x":"19cm","y":"0cm","width":"14.87cm","height":"11cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"star-1","fill":"F5E0C0","rotation":"45","x":"19.5cm","y":"0.5cm","width":"5cm","height":"5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"star-2","fill":"1A1A1A","rotation":"45","x":"29.5cm","y":"12cm","width":"4cm","height":"4cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"star-3","fill":"F5E0C0","rotation":"45","x":"2cm","y":"13cm","width":"3cm","height":"3cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"photo-1","image":$bp,"x":"19.5cm","y":"0cm","width":"14.37cm","height":"11cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"photo-2","image":$bc,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"h-main","text":"380%","font":"Impact","size":"72","color":"F5E0C0","fill":"none","x":"1.6cm","y":"2.5cm","width":"15cm","height":"4.5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"h-sub","text":"ROI on social-first campaigns\n12M+  Earned impressions\n#1    Trending 3 weeks","font":"Arial","size":"15","color":"F5E0C0","fill":"none","x":"1.6cm","y":"8.5cm","width":"15cm","height":"3.5cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[4]' --prop transition=morph

# ── S5 CTA (1A1A1A) ─────────────────────────────────────────
# blk-a 从大左块→变成底部橙条; h-main 居中在暗区, h-sub 在橙带内
echo "S5 CTA"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=1A1A1A
jq -n --arg bp "$BP" --arg bc "$BC" '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-a","fill":"E8601C","x":"0cm","y":"13cm","width":"33.87cm","height":"6.05cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-b","fill":"1A1A1A","x":"0cm","y":"0cm","width":"33.87cm","height":"13cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-c","fill":"F5E0C0","opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"star-1","fill":"F5E0C0","rotation":"45","x":"0.5cm","y":"14cm","width":"5cm","height":"5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"star-2","fill":"1A1A1A","rotation":"45","x":"27cm","y":"13.5cm","width":"3.5cm","height":"3.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"star-3","fill":"F5E0C0","rotation":"45","x":"8.5cm","y":"14cm","width":"3cm","height":"3cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"photo-1","image":$bp,"opacity":"0.01","x":"33cm","y":"18.5cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"photo-2","image":$bc,"opacity":"0.3","x":"0cm","y":"0cm","width":"33.87cm","height":"13cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"h-main","text":"GO BOLD OR GO HOME","font":"Impact","size":"58","color":"F5E0C0","fill":"none","x":"1.6cm","y":"4cm","width":"30cm","height":"4cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"h-sub","text":"The brief is ready. The strategy is set. Time to execute.","font":"Arial","size":"16","color":"F5E0C0","fill":"none","x":"1.6cm","y":"14.8cm","width":"24cm","height":"1.8cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[5]' --prop transition=morph

officecli validate "$PPTX"
officecli view "$PPTX" outline
echo "Done: $PPTX"
