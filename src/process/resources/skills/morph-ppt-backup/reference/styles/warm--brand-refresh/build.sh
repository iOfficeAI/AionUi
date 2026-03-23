#!/bin/bash
set -e

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PPTX="$BASE/brand-refresh.pptx"
P1="$BASE/assets/portrait1.jpg"
P2="$BASE/assets/portrait2.jpg"
AB="$BASE/assets/abstract1.jpg"
TM="$BASE/assets/team1.jpg"

echo "=== brand-refresh v4 ==="
rm -f "$PPTX"
officecli create "$PPTX"

# ── S1 HERO (F5F0E8) ─────────────────────────────────────────
echo "S1 hero"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=F5F0E8
jq -n --arg p1 "$P1" --arg p2 "$P2" '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"photo-1","image":$p1,"x":"15.5cm","y":"0cm","width":"10cm","height":"13cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-a","fill":"162040","x":"25.5cm","y":"0cm","width":"8.37cm","height":"7cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-b","fill":"1A6BFF","x":"25.5cm","y":"7cm","width":"4cm","height":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-c","fill":"F4713A","x":"29.5cm","y":"7cm","width":"4.37cm","height":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-d","fill":"00C9D4","x":"15.5cm","y":"13cm","width":"5cm","height":"6.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-e","fill":"7EC8A0","x":"20.5cm","y":"13cm","width":"5cm","height":"6.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"blk-f","fill":"E8749A","x":"25.5cm","y":"13cm","width":"8.37cm","height":"6.05cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"photo-2","image":$p2,"opacity":"0.01","x":"33cm","y":"18.55cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"tag","text":"BRAND REFRESH 2025","font":"Arial","size":"11","bold":"true","color":"9A9080","fill":"none","x":"1.6cm","y":"7cm","width":"13cm","height":"0.7cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"h-title","text":"Your Brand, Redefined.","font":"Arial","size":"52","bold":"true","color":"162040","fill":"none","x":"1.6cm","y":"7.8cm","width":"13cm","height":"5.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"h-sub","text":"A new visual language built for how the world sees you now.","font":"Arial","size":"15","color":"6B6355","fill":"none","x":"1.6cm","y":"14cm","width":"13cm","height":"2.5cm"}}
]' | officecli batch "$PPTX"

# ── S2 STATEMENT (162040) ────────────────────────────────────
echo "S2 statement"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=162040
jq -n --arg p1 "$P1" --arg p2 "$P2" '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"photo-1","image":$p1,"x":"0cm","y":"0cm","width":"14cm","height":"19.05cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-a","fill":"162040","opacity":"0.58","x":"0cm","y":"0cm","width":"14cm","height":"19.05cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-b","fill":"1A6BFF","x":"22cm","y":"0cm","width":"11.87cm","height":"3.2cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-c","fill":"F4713A","x":"22cm","y":"3.2cm","width":"11.87cm","height":"3.2cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-d","fill":"00C9D4","x":"22cm","y":"6.4cm","width":"11.87cm","height":"3.2cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-e","fill":"7EC8A0","x":"22cm","y":"9.6cm","width":"11.87cm","height":"3.2cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"blk-f","fill":"E8749A","x":"22cm","y":"12.8cm","width":"11.87cm","height":"6.25cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"photo-2","image":$p2,"opacity":"0.01","x":"33cm","y":"18.55cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"tag","text":"","font":"Arial","size":"11","color":"4A5A7A","fill":"none","x":"15.2cm","y":"5cm","width":"4cm","height":"0.7cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"h-title","text":"Clarity beats complexity.","font":"Arial","size":"46","bold":"true","color":"F5F0E8","fill":"none","x":"15.2cm","y":"6cm","width":"15.5cm","height":"7cm"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"name":"h-sub","text":"The strongest brands say less — and mean more.","font":"Arial","size":"16","color":"7890B8","fill":"none","x":"15.2cm","y":"13.5cm","width":"15cm","height":"2.5cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[2]' --prop transition=morph

# ── S3 PILLARS (F5F0E8) ─────────────────────────────────────
echo "S3 pillars"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=F5F0E8
jq -n --arg p1 "$P1" --arg p2 "$P2" --arg tm "$TM" '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-a","fill":"162040","x":"0cm","y":"0cm","width":"33.87cm","height":"2.4cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"photo-2","image":$p2,"x":"1.6cm","y":"2.4cm","width":"9.6cm","height":"8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"photo-1","image":$p1,"x":"12.4cm","y":"2.4cm","width":"9.6cm","height":"8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-e","image":$tm,"x":"22.8cm","y":"2.4cm","width":"9.6cm","height":"8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-b","fill":"162040","opacity":"0.42","x":"1.6cm","y":"2.4cm","width":"9.6cm","height":"8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-c","fill":"F4713A","opacity":"0.38","x":"12.4cm","y":"2.4cm","width":"9.6cm","height":"8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-d","fill":"00C9D4","opacity":"0.38","x":"22.8cm","y":"2.4cm","width":"9.6cm","height":"8cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"blk-f","fill":"E8749A","opacity":"0.01","x":"33cm","y":"18.55cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"tag","text":"THREE PILLARS","font":"Arial","size":"13","bold":"true","color":"F5F0E8","fill":"none","x":"1.6cm","y":"0.5cm","width":"20cm","height":"1.4cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"h-title","text":"Identity                    Voice                    Experience","font":"Arial","size":"14","bold":"true","color":"162040","fill":"none","x":"1.6cm","y":"11cm","width":"31cm","height":"1.2cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"name":"h-sub","text":"A system that speaks before words do.","font":"Arial","size":"14","color":"6B6355","fill":"none","x":"1.6cm","y":"12.4cm","width":"9.6cm","height":"3.5cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[3]' --prop transition=morph

# ── S4 EVIDENCE (F5F0E8) ────────────────────────────────────
echo "S4 evidence"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=F5F0E8
jq -n --arg ab "$AB" --arg p2 "$P2" '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-a","fill":"162040","x":"0cm","y":"0cm","width":"33.87cm","height":"2cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"photo-1","image":$ab,"x":"0cm","y":"2cm","width":"19cm","height":"17.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-b","fill":"162040","opacity":"0.78","geometry":"M 0,52 C 22,36 44,66 64,46 C 80,30 92,56 100,42 L 100,100 L 0,100 Z","x":"0cm","y":"2cm","width":"19cm","height":"17.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-c","fill":"1A6BFF","opacity":"0.72","geometry":"M 0,63 C 22,48 44,76 65,57 C 82,44 93,65 100,53 L 100,100 L 0,100 Z","x":"0cm","y":"2cm","width":"19cm","height":"17.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-d","fill":"00C9D4","opacity":"0.68","geometry":"M 0,73 C 22,60 44,84 65,66 C 83,55 93,74 100,63 L 100,100 L 0,100 Z","x":"0cm","y":"2cm","width":"19cm","height":"17.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-e","fill":"7EC8A0","opacity":"0.65","geometry":"M 0,82 C 24,70 46,90 66,75 C 83,65 93,82 100,72 L 100,100 L 0,100 Z","x":"0cm","y":"2cm","width":"19cm","height":"17.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"blk-f","fill":"F4713A","opacity":"0.68","geometry":"M 0,90 C 24,80 46,96 66,84 C 83,76 93,90 100,82 L 100,100 L 0,100 Z","x":"0cm","y":"2cm","width":"19cm","height":"17.05cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"photo-2","image":$p2,"opacity":"0.01","x":"33cm","y":"18.55cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"tag","text":"THE NUMBERS","font":"Arial","size":"13","bold":"true","color":"9A9080","fill":"none","x":"20.4cm","y":"0.4cm","width":"12cm","height":"0.8cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"h-title","text":"+47%","font":"Arial","size":"64","bold":"true","color":"162040","fill":"none","x":"20.4cm","y":"2.5cm","width":"12cm","height":"5cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"name":"h-sub","text":"Brand recognition lift\n\n2.8x  Engagement rate\n\n89    Net Promoter Score","font":"Arial","size":"14","color":"6B6355","fill":"none","x":"20.4cm","y":"8cm","width":"12cm","height":"8cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[4]' --prop transition=morph

# ── S5 CTA (162040) ─────────────────────────────────────────
echo "S5 CTA"
officecli add "$PPTX" '/' --type slide --prop layout=blank --prop background=162040
jq -n --arg p2 "$P2" --arg ab "$AB" '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"photo-2","image":$p2,"x":"21cm","y":"0cm","width":"9cm","height":"19.05cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-a","fill":"162040","opacity":"0.75","x":"21cm","y":"0cm","width":"4cm","height":"5.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-b","fill":"1A6BFF","x":"21cm","y":"5.5cm","width":"2.4cm","height":"4.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-c","fill":"F4713A","x":"29.5cm","y":"13.5cm","width":"4.37cm","height":"5.55cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-d","fill":"00C9D4","x":"29.5cm","y":"0cm","width":"4.37cm","height":"5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-e","fill":"7EC8A0","opacity":"0.01","x":"33cm","y":"18.55cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"blk-f","fill":"E8749A","opacity":"0.01","x":"33cm","y":"18.55cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"photo-1","image":$ab,"opacity":"0.01","x":"33cm","y":"18.55cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"tag","text":"BRAND STRATEGY","font":"Arial","size":"11","bold":"true","color":"4A5A7A","fill":"none","x":"1.6cm","y":"5.5cm","width":"14cm","height":"0.7cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"h-title","text":"Start the transformation.","font":"Arial","size":"46","bold":"true","color":"F5F0E8","fill":"none","x":"1.6cm","y":"6.4cm","width":"17cm","height":"6cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"h-sub","text":"Let'\''s build something that lasts.","font":"Arial","size":"16","color":"7890B8","fill":"none","x":"1.6cm","y":"13.2cm","width":"16cm","height":"2cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"name":"cta","text":"Get in touch  ->","font":"Arial","size":"15","bold":"true","color":"F5F0E8","fill":"F4713A","x":"1.6cm","y":"15.6cm","width":"9cm","height":"1.8cm"}}
]' | officecli batch "$PPTX"
officecli set "$PPTX" '/slide[5]' --prop transition=morph

officecli validate "$PPTX"
officecli view "$PPTX" outline
echo "Done: $PPTX"
