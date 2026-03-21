#!/bin/bash
set -e

# Brutalist Avant-garde Art Exhibition PPT
# Style: S22 Brutalist Raw
# Theme: "反叛 — 先锋艺术展" (REVOLT - Avant-garde Art Exhibition)

OUTPUT="/Users/veryliu/Documents/GitHub/OfficeCli/.tmp/morph-test/test19-avantgarde-brutalist.pptx"

# Clean previous build
rm -f "$OUTPUT"

# Create deck
officecli create "$OUTPUT"

###############################################################################
# S1 [hero] — "反叛" / "REVOLT"
# Scene: thick-bordered box, solid black block, one red accent bar
# Title intentionally oversized (120pt), asymmetric layout
###############################################################################
officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF

echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"preset":"rect","fill":"FFFFFF","line":"000000","lineWidth":"3pt","opacity":"1","x":"20cm","y":"2cm","width":"10cm","height":"8cm","name":"border-box"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"3cm","y":"13cm","width":"5cm","height":"5cm","name":"block-solid"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"preset":"rect","fill":"FF0000","opacity":"1","x":"10cm","y":"15cm","width":"3cm","height":"1cm","name":"accent-red"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"6cm","y":"11cm","width":"20cm","height":"0.15cm","name":"line-heavy"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"反叛","font":"Arial Black","size":"120","bold":"true","color":"000000","align":"left","x":"2cm","y":"3cm","width":"15cm","height":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"REVOLT","font":"Arial Black","size":"48","bold":"true","color":"000000","align":"left","x":"2cm","y":"8.5cm","width":"10cm","height":"2cm"}}
]' | officecli batch "$OUTPUT"

###############################################################################
# S2 [statement] — "ART IS NOT DECORATION"
# Scene: all shapes slam to different positions — violent 12cm+ moves
# bordered box drops, black block flies right, red accent corners
###############################################################################
officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"preset":"rect","fill":"none","line":"000000","lineWidth":"3pt","opacity":"1","x":"4cm","y":"8cm","width":"12cm","height":"9cm","name":"border-box"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"25cm","y":"2cm","width":"5cm","height":"5cm","name":"block-solid"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"preset":"rect","fill":"FF0000","opacity":"1","x":"28cm","y":"12cm","width":"3cm","height":"1cm","name":"accent-red"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"2cm","y":"13cm","width":"20cm","height":"0.15cm","name":"line-heavy"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"18cm","y":"8cm","width":"15cm","height":"0.08cm","rotation":"35","name":"line-diag"}},

  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"ART IS NOT\nDECORATION","font":"Arial Black","size":"96","bold":"true","color":"000000","align":"left","x":"2cm","y":"2cm","width":"25cm","height":"10cm"}}
]' | officecli batch "$OUTPUT"

###############################################################################
# S3 [pillars] — "三位参展艺术家"
# Scene: rects become structural frames, artists listed in monospace
# Totally different layout: three artist entries with dividers
###############################################################################
officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"FFFFFF","line":"000000","lineWidth":"3pt","opacity":"1","x":"2cm","y":"5cm","width":"8cm","height":"10cm","name":"border-box"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"28cm","y":"8cm","width":"5cm","height":"5cm","name":"block-solid"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"FF0000","opacity":"1","x":"2cm","y":"16cm","width":"3cm","height":"1cm","name":"accent-red"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"2cm","y":"4.5cm","width":"20cm","height":"0.15cm","name":"line-heavy"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"25cm","y":"2cm","width":"15cm","height":"0.08cm","rotation":"0","name":"line-diag"}},

  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"三位参展艺术家","font":"Arial Black","size":"96","bold":"true","color":"000000","align":"left","x":"2cm","y":"1.5cm","width":"20cm","height":"3cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"01 / 张伟 - 解构主义装置艺术","font":"Courier New","size":"24","color":"000000","align":"left","x":"3cm","y":"6cm","width":"25cm","height":"1.5cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"02 / 李娜 - 后现代影像创作","font":"Courier New","size":"24","color":"000000","align":"left","x":"3cm","y":"8.5cm","width":"25cm","height":"1.5cm"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"03 / 王强 - 激进行为艺术","font":"Courier New","size":"24","color":"000000","align":"left","x":"3cm","y":"11cm","width":"25cm","height":"1.5cm"}}
]' | officecli batch "$OUTPUT"

###############################################################################
# S4 [evidence] — "首展反响" / Metrics
# Scene: asymmetric — metrics displayed in brutal raw style
# Black block for emphasis, metrics in monospace
###############################################################################
officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"preset":"rect","fill":"none","line":"000000","lineWidth":"3pt","opacity":"1","x":"22cm","y":"10cm","width":"10cm","height":"8cm","name":"border-box"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"2cm","y":"15cm","width":"5cm","height":"3cm","name":"block-solid"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"preset":"rect","fill":"FF0000","opacity":"1","x":"15cm","y":"10.5cm","width":"1cm","height":"3cm","name":"accent-red"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"2cm","y":"9.5cm","width":"20cm","height":"0.15cm","name":"line-heavy"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"20cm","y":"1cm","width":"15cm","height":"0.08cm","rotation":"145","name":"line-diag"}},

  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"首展反响","font":"Arial Black","size":"96","bold":"true","color":"000000","align":"left","x":"2cm","y":"1.5cm","width":"20cm","height":"3cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"3天","font":"Courier New","size":"72","bold":"true","color":"000000","align":"left","x":"3cm","y":"6cm","width":"10cm","height":"2cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"首展持续时间","font":"Courier New","size":"20","color":"000000","align":"left","x":"3cm","y":"8cm","width":"15cm","height":"1cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"1200+","font":"Courier New","size":"72","bold":"true","color":"000000","align":"left","x":"15cm","y":"6cm","width":"10cm","height":"2cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"观众人次","font":"Courier New","size":"20","color":"000000","align":"left","x":"15cm","y":"8cm","width":"15cm","height":"1cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"50+","font":"Courier New","size":"72","bold":"true","color":"000000","align":"left","x":"3cm","y":"11cm","width":"10cm","height":"2cm"}},
  {"command":"add","parent":"/slide[4]","type":"shape","props":{"text":"媒体报道","font":"Courier New","size":"20","color":"000000","align":"left","x":"3cm","y":"13cm","width":"15cm","height":"1cm"}}
]' | officecli batch "$OUTPUT"

###############################################################################
# S5 [cta] — "展览持续至 4月30日"
# Scene: shapes return to scattered edges with dramatic final positions
# Red accent flies to corner, block rotates, brutal ending
###############################################################################
officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF --prop transition=morph

echo '[
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"preset":"rect","fill":"FFFFFF","line":"000000","lineWidth":"3pt","opacity":"1","x":"22cm","y":"3cm","width":"9cm","height":"10cm","name":"border-box"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"2cm","y":"1cm","width":"5cm","height":"5cm","name":"block-solid"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"preset":"rect","fill":"FF0000","opacity":"1","x":"30cm","y":"17cm","width":"3cm","height":"1cm","name":"accent-red"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"3cm","y":"12cm","width":"20cm","height":"0.15cm","name":"line-heavy"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"preset":"rect","fill":"000000","opacity":"1","x":"10cm","y":"2cm","width":"15cm","height":"0.08cm","rotation":"35","name":"line-diag"}},

  {"command":"add","parent":"/slide[5]","type":"shape","props":{"text":"展览持续至\n4月30日","font":"Arial Black","size":"96","bold":"true","color":"000000","align":"left","x":"3cm","y":"4cm","width":"25cm","height":"8cm"}},
  {"command":"add","parent":"/slide[5]","type":"shape","props":{"text":"地点: 798艺术区 A12展厅\n时间: 10:00-20:00 (周二闭馆)\n门票: 免费","font":"Courier New","size":"20","color":"000000","align":"left","lineSpacing":"1.6","x":"3cm","y":"13cm","width":"20cm","height":"4cm"}}
]' | officecli batch "$OUTPUT"

###############################################################################
# Validate & outline
###############################################################################
echo ""
echo "=== VALIDATE ==="
officecli validate "$OUTPUT"
echo ""
echo "=== OUTLINE ==="
officecli view "$OUTPUT" outline
echo ""
echo "✓ PPT created: $OUTPUT"
