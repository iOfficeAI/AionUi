#!/bin/bash
set -e

FILE="aura_coffee.pptx"

echo "Creating PPT..."
officecli create "$FILE"
officecli add "$FILE" '/' --type slide --prop layout=blank --prop background=F9F6F0

echo "Building Slide 1..."
cat << 'JSON_EOF' > s1.json
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!bg-main","preset":"ellipse","fill":"F3EFE6","x":"15cm","y":"0cm","width":"25cm","height":"25cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!circle-accent","preset":"ellipse","fill":"C2A878","x":"5cm","y":"14cm","width":"2cm","height":"2cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!line-top","preset":"rect","fill":"2B2624","x":"0cm","y":"2cm","width":"10cm","height":"0.2cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!slash-accent","preset":"rect","fill":"8B6F47","x":"25cm","y":"10cm","width":"0.2cm","height":"5cm","rotation":"45","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!card-1","preset":"roundRect","fill":"FFFFFF","opacity":"0.9","x":"36cm","y":"7cm","width":"8.5cm","height":"10cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!card-2","preset":"roundRect","fill":"FFFFFF","opacity":"0.9","x":"36cm","y":"7cm","width":"8.5cm","height":"10cm","line":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!card-3","preset":"roundRect","fill":"FFFFFF","opacity":"0.9","x":"36cm","y":"7cm","width":"8.5cm","height":"10cm","line":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!hero-title","text":"AURA COFFEE","font":"Montserrat","bold":"true","size":"64","color":"2B2624","x":"4cm","y":"7cm","width":"24cm","height":"4cm","align":"left","valign":"middle","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!hero-sub","text":"极简主义咖啡美学 / MINIMALIST COFFEE AESTHETICS","font":"思源黑体","size":"18","color":"8B6F47","x":"4cm","y":"11cm","width":"24cm","height":"2cm","align":"left","valign":"top","line":"none","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!statement-title","text":"我们只做一件事：还原咖啡豆本真的风味","font":"思源黑体","bold":"true","size":"36","color":"2B2624","x":"36cm","y":"7cm","width":"24cm","height":"3cm","align":"left","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!statement-desc","text":"在纷繁复杂的时代，我们拒绝过度包装与冗余添加。\n以最克制的方式，呈现大自然赋予的纯粹果香与醇厚。","font":"思源黑体","size":"20","color":"8B6F47","x":"36cm","y":"11cm","width":"20cm","height":"4cm","align":"left","line":"none","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillars-title","text":"三大核心坚持","font":"思源黑体","bold":"true","size":"36","color":"2B2624","x":"36cm","y":"2cm","width":"15cm","height":"2cm","align":"left","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p1-title","text":"甄选微批次","font":"思源黑体","bold":"true","size":"24","color":"2B2624","x":"36cm","y":"8cm","width":"6.5cm","height":"1.5cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p1-sub","text":"Micro-Lot Selection","font":"Montserrat","size":"14","color":"C2A878","x":"36cm","y":"9.5cm","width":"6.5cm","height":"1cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p1-desc","text":"深入原产地，仅挑选SCA评分85+以上的单一产区微批次咖啡豆。","font":"思源黑体","size":"16","color":"8B6F47","x":"36cm","y":"11cm","width":"6.5cm","height":"5cm","align":"center","valign":"top","line":"none","fill":"none"}},
  
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p2-title","text":"极简烘焙","font":"思源黑体","bold":"true","size":"24","color":"2B2624","x":"36cm","y":"8cm","width":"6.5cm","height":"1.5cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p2-sub","text":"Minimalist Roasting","font":"Montserrat","size":"14","color":"C2A878","x":"36cm","y":"9.5cm","width":"6.5cm","height":"1cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p2-desc","text":"摒弃重度烘焙，采用精准的浅中烘焙曲线，保留地域风味特色。","font":"思源黑体","size":"16","color":"8B6F47","x":"36cm","y":"11cm","width":"6.5cm","height":"5cm","align":"center","valign":"top","line":"none","fill":"none"}},
  
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p3-title","text":"大师手冲","font":"思源黑体","bold":"true","size":"24","color":"2B2624","x":"36cm","y":"8cm","width":"6.5cm","height":"1.5cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p3-sub","text":"Master Brewing","font":"Montserrat","size":"14","color":"C2A878","x":"36cm","y":"9.5cm","width":"6.5cm","height":"1cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!p3-desc","text":"严控水温、水粉比与冲煮时间，确保每一杯出品的极致稳定与干净。","font":"思源黑体","size":"16","color":"8B6F47","x":"36cm","y":"11cm","width":"6.5cm","height":"5cm","align":"center","valign":"top","line":"none","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-title","text":"经得起挑剔的品质标准","font":"思源黑体","bold":"true","size":"36","color":"2B2624","x":"36cm","y":"2cm","width":"20cm","height":"2cm","align":"left","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-num1","text":"15","font":"Montserrat","bold":"true","size":"80","color":"2B2624","x":"36cm","y":"6cm","width":"12cm","height":"4cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-t1","text":"天最佳赏味期限制","font":"思源黑体","size":"20","color":"8B6F47","x":"36cm","y":"11cm","width":"12cm","height":"2cm","align":"center","line":"none","fill":"none"}},
  
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-num2","text":"0","font":"Montserrat","bold":"true","size":"48","color":"2B2624","x":"36cm","y":"6cm","width":"5cm","height":"3cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-t2","text":"添加人工香精","font":"思源黑体","size":"18","color":"8B6F47","x":"36cm","y":"9cm","width":"7cm","height":"2cm","align":"left","valign":"middle","line":"none","fill":"none"}},
  
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-num3","text":"100%","font":"Montserrat","bold":"true","size":"48","color":"2B2624","x":"36cm","y":"6cm","width":"5cm","height":"3cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-t3","text":"可降解环保包装","font":"思源黑体","size":"18","color":"8B6F47","x":"36cm","y":"9cm","width":"7cm","height":"2cm","align":"left","valign":"middle","line":"none","fill":"none"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!cta-title","text":"回归纯粹，期待与你相遇","font":"思源黑体","bold":"true","size":"48","color":"2B2624","x":"36cm","y":"7cm","width":"26cm","height":"3cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!cta-web","text":"www.auracoffee.com","font":"Montserrat","size":"20","color":"8B6F47","x":"36cm","y":"11cm","width":"26cm","height":"1.5cm","align":"center","line":"none","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!cta-email","text":"partner@auracoffee.com","font":"Montserrat","size":"20","color":"8B6F47","x":"36cm","y":"12cm","width":"26cm","height":"1.5cm","align":"center","line":"none","fill":"none"}}
]
JSON_EOF
officecli batch "$FILE" < s1.json

echo "Building Slide 2..."
officecli add "$FILE" '/' --from '/slide[1]'
cat << 'JSON_EOF' > s2.json
[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"0cm","y":"2cm","width":"15cm","height":"15cm"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"30cm","y":"5cm","width":"4cm","height":"4cm"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"5cm","y":"4cm","width":"5cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"25cm","y":"15cm","height":"8cm","rotation":"90"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[2]/shape[9]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[2]/shape[10]","props":{"x":"5cm","y":"7cm"}},
  {"command":"set","path":"/slide[2]/shape[11]","props":{"x":"5cm","y":"11cm"}}
]
JSON_EOF
officecli batch "$FILE" < s2.json

echo "Building Slide 3..."
officecli add "$FILE" '/' --from '/slide[1]'
cat << 'JSON_EOF' > s3.json
[
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"20cm","y":"0cm","width":"15cm","height":"25cm","fill":"EAE3D5"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"2cm","y":"2cm","width":"3cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"3cm","y":"3.5cm","width":"28cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"3cm","y":"6cm"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"12.5cm","y":"6cm"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"x":"22cm","y":"6cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[3]/shape[9]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[3]/shape[12]","props":{"x":"3cm","y":"1.5cm"}},
  
  {"command":"set","path":"/slide[3]/shape[13]","props":{"x":"4cm","y":"7.5cm"}},
  {"command":"set","path":"/slide[3]/shape[14]","props":{"x":"4cm","y":"9cm"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"x":"4cm","y":"11cm"}},
  {"command":"set","path":"/slide[3]/shape[16]","props":{"x":"13.5cm","y":"7.5cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{"x":"13.5cm","y":"9cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"x":"13.5cm","y":"11cm"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"x":"23cm","y":"7.5cm"}},
  {"command":"set","path":"/slide[3]/shape[20]","props":{"x":"23cm","y":"9cm"}},
  {"command":"set","path":"/slide[3]/shape[21]","props":{"x":"23cm","y":"11cm"}}
]
JSON_EOF
officecli batch "$FILE" < s3.json

echo "Building Slide 4..."
officecli add "$FILE" '/' --from '/slide[1]'
cat << 'JSON_EOF' > s4.json
[
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"28cm","y":"14cm","width":"8cm","height":"8cm"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"1cm","y":"1cm","width":"1.5cm","height":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"2cm","y":"3cm","width":"30cm"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"2cm","y":"5cm","width":"14cm","height":"12cm"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"17cm","y":"5cm","width":"14cm","height":"5.5cm"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"x":"17cm","y":"11.5cm","width":"14cm","height":"5.5cm"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[4]/shape[9]","props":{"x":"36cm"}},
  
  {"command":"set","path":"/slide[4]/shape[22]","props":{"x":"2cm","y":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[23]","props":{"x":"3cm","y":"7cm"}},
  {"command":"set","path":"/slide[4]/shape[24]","props":{"x":"3cm","y":"12cm"}},
  {"command":"set","path":"/slide[4]/shape[25]","props":{"x":"18cm","y":"6.2cm"}},
  {"command":"set","path":"/slide[4]/shape[26]","props":{"x":"23cm","y":"6.7cm"}},
  {"command":"set","path":"/slide[4]/shape[27]","props":{"x":"18cm","y":"12.7cm"}},
  {"command":"set","path":"/slide[4]/shape[28]","props":{"x":"23cm","y":"13.2cm"}}
]
JSON_EOF
officecli batch "$FILE" < s4.json

echo "Building Slide 5..."
officecli add "$FILE" '/' --from '/slide[1]'
cat << 'JSON_EOF' > s5.json
[
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"10cm","y":"0cm","width":"30cm","height":"30cm"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"5cm","y":"12cm","width":"2cm","height":"2cm"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"14cm","y":"13cm","width":"6cm"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"x":"28cm","y":"4cm","height":"4cm","rotation":"45"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"36cm"}},
  {"command":"set","path":"/slide[5]/shape[9]","props":{"x":"36cm"}},
  
  {"command":"set","path":"/slide[5]/shape[29]","props":{"x":"4cm","y":"8cm"}},
  {"command":"set","path":"/slide[5]/shape[30]","props":{"x":"4cm","y":"13.5cm"}},
  {"command":"set","path":"/slide[5]/shape[31]","props":{"x":"4cm","y":"15cm"}}
]
JSON_EOF
officecli batch "$FILE" < s5.json

echo "Validating PPT..."
officecli validate "$FILE"
officecli view outline "$FILE"
