#!/bin/bash
set -e

FILENAME="太空探索历程.pptx"

echo "Building $FILENAME..."

# Remove existing file if present
[ -f "$FILENAME" ] && rm "$FILENAME"

# Create new presentation
officecli create "$FILENAME"

# ===== Slide 1: Hero - 封面页 =====
echo "Creating Slide 1: Hero..."
cat << 'BATCH_EOF' | officecli batch "$FILENAME"
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"0A0E27"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"planet-main","preset":"ellipse","fill":"1E3A5F","opacity":"0.3","width":"12cm","height":"12cm","x":"24cm","y":"8cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"glow-accent","preset":"ellipse","fill":"4A5FFF","opacity":"0.08","width":"18cm","height":"18cm","x":"21cm","y":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"star-1","preset":"star5","fill":"FFD700","opacity":"0.6","width":"0.8cm","height":"0.8cm","x":"5cm","y":"3cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"star-2","preset":"star5","fill":"FFFFFF","opacity":"0.5","width":"0.6cm","height":"0.6cm","x":"8cm","y":"7cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"star-3","preset":"star5","fill":"FFD700","opacity":"0.7","width":"0.7cm","height":"0.7cm","x":"28cm","y":"4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"line-orbit","preset":"ellipse","line":"4A90E2","lineWidth":"0.15cm","fill":"none","opacity":"0.3","width":"20cm","height":"20cm","x":"18cm","y":"4cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"dot-small","preset":"ellipse","fill":"00D9FF","opacity":"0.8","width":"0.4cm","height":"0.4cm","x":"3cm","y":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"hero-title","text":"太空探索历程","font":"苹方-简","size":"68","bold":"true","color":"FFFFFF","align":"center","valign":"middle","width":"26cm","height":"4cm","x":"4cm","y":"6cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"hero-subtitle","text":"从地球到星辰大海的伟大征程","font":"苹方-简","size":"24","color":"B8C5D6","align":"center","valign":"middle","width":"26cm","height":"2cm","x":"4cm","y":"10.5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"statement-text","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"statement-subtitle","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-title","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"10cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-1-num","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-1-title","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-1-desc","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-2-num","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"10cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-2-title","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-2-desc","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-3-num","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-3-title","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"10cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"pillar-3-desc","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"showcase-title","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"showcase-quote","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"showcase-data1","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"10cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"showcase-data2","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-title","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-main","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-point1","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"10cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-point2","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"evidence-point3","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"0cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"cta-title","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"cta-text","text":"","font":"苹方-简","size":"18","color":"FFFFFF","width":"1cm","height":"1cm","x":"36cm","y":"10cm"}}
]
BATCH_EOF

# ===== Slide 2: Statement - 仰望星空 =====
echo "Creating Slide 2: Statement..."
officecli add "$FILENAME" '/' --from '/slide[1]'
cat << 'BATCH_EOF' | officecli batch "$FILENAME"
[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"2cm","y":"2cm","width":"8cm","height":"8cm"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"0cm","y":"0cm","width":"15cm","height":"15cm","opacity":"0.1"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"26cm","y":"5cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"29cm","y":"14cm"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"10cm","y":"2cm"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"28cm","y":"17cm"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[2]/shape[9]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[2]/shape[10]","props":{"text":"仰望星空，是人类与生俱来的本能","font":"苹方-简","size":"42","bold":"true","color":"FFFFFF","align":"center","valign":"middle","width":"28cm","height":"3cm","x":"3cm","y":"4cm"}},
  {"command":"set","path":"/slide[2]/shape[11]","props":{"text":"从古代天文学家绘制星图，到伽利略用望远镜观测木星卫星，再到现代火箭技术的诞生，人类从未停止探索宇宙的脚步。20世纪中叶，太空时代的大门终于被推开。","font":"苹方-简","size":"18","color":"D0D8E5","align":"center","valign":"middle","width":"26cm","height":"6cm","x":"4cm","y":"8.5cm"}}
]
BATCH_EOF

# ===== Slide 3: Pillars - 突破大气层 =====
echo "Creating Slide 3: Pillars..."
officecli add "$FILENAME" '/' --from '/slide[1]'
cat << 'BATCH_EOF' | officecli batch "$FILENAME"
[
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]/shape[1]","props":{"preset":"roundRect","fill":"2A4A6F","opacity":"0.12","width":"8cm","height":"11cm","x":"2.5cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"preset":"roundRect","fill":"2A4A6F","opacity":"0.12","width":"8cm","height":"11cm","x":"13cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"24cm","y":"12cm","width":"0.6cm","height":"0.6cm"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"x":"18cm","y":"3cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"30cm","y":"8cm","width":"0.7cm","height":"0.7cm"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"preset":"roundRect","fill":"2A4A6F","opacity":"0.12","width":"8cm","height":"11cm","x":"23.5cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[3]/shape[9]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[10]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[3]/shape[11]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[3]/shape[12]","props":{"text":"突破大气层：太空时代的黎明","font":"苹方-简","size":"32","bold":"true","color":"FFFFFF","align":"left","valign":"top","width":"28cm","height":"2cm","x":"2.5cm","y":"2cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"text":"1957","font":"苹方-简","size":"56","bold":"true","color":"FFD700","align":"center","valign":"top","width":"8cm","height":"3cm","x":"2.5cm","y":"5.5cm"}},
  {"command":"set","path":"/slide[3]/shape[14]","props":{"text":"人造卫星","font":"苹方-简","size":"28","bold":"true","color":"FFFFFF","align":"center","valign":"top","width":"8cm","height":"2cm","x":"2.5cm","y":"9cm"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"text":"苏联发射斯普特尼克1号，人类第一颗人造卫星进入轨道，标志着太空时代开启","font":"苹方-简","size":"16","color":"C0CAD9","align":"left","valign":"top","width":"7cm","height":"4cm","x":"3cm","y":"11.5cm"}},
  {"command":"set","path":"/slide[3]/shape[16]","props":{"text":"1961","font":"苹方-简","size":"56","bold":"true","color":"FFD700","align":"center","valign":"top","width":"8cm","height":"3cm","x":"13cm","y":"5.5cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{"text":"载人飞行","font":"苹方-简","size":"28","bold":"true","color":"FFFFFF","align":"center","valign":"top","width":"8cm","height":"2cm","x":"13cm","y":"9cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"text":"尤里·加加林乘坐东方1号完成108分钟环绕地球飞行，成为第一个进入太空的人类","font":"苹方-简","size":"16","color":"C0CAD9","align":"left","valign":"top","width":"7cm","height":"4cm","x":"13.5cm","y":"11.5cm"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"text":"1965","font":"苹方-简","size":"56","bold":"true","color":"FFD700","align":"center","valign":"top","width":"8cm","height":"3cm","x":"23.5cm","y":"5.5cm"}},
  {"command":"set","path":"/slide[3]/shape[20]","props":{"text":"太空行走","font":"苹方-简","size":"28","bold":"true","color":"FFFFFF","align":"center","valign":"top","width":"8cm","height":"2cm","x":"23.5cm","y":"9cm"}},
  {"command":"set","path":"/slide[3]/shape[21]","props":{"text":"列昂诺夫完成人类首次舱外活动，在太空中漂浮12分钟","font":"苹方-简","size":"16","color":"C0CAD9","align":"left","valign":"top","width":"7cm","height":"4cm","x":"24cm","y":"11.5cm"}}
]
BATCH_EOF

# ===== Slide 4: Showcase - 月球征程 =====
echo "Creating Slide 4: Showcase..."
officecli add "$FILENAME" '/' --from '/slide[1]'
cat << 'BATCH_EOF' | officecli batch "$FILENAME"
[
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]/shape[1]","props":{"preset":"ellipse","fill":"F5A623","opacity":"0.15","width":"14cm","height":"14cm","x":"20cm","y":"6cm"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"preset":"ellipse","fill":"FFD700","opacity":"0.05","width":"10cm","height":"10cm","x":"23cm","y":"8cm"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"2cm","y":"15cm"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"x":"31cm","y":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"5cm","y":"4cm"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"preset":"ellipse","fill":"F5A623","opacity":"0.4","width":"1.2cm","height":"1.2cm","x":"2cm","y":"2cm"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[9]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[10]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[4]/shape[11]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[4]/shape[12]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[13]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[14]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[4]/shape[16]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[17]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[18]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[4]/shape[19]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[4]/shape[20]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[21]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[22]","props":{"text":"月球征程","font":"苹方-简","size":"48","bold":"true","color":"FFFFFF","align":"left","valign":"top","width":"20cm","height":"3cm","x":"2.5cm","y":"2.5cm"}},
  {"command":"set","path":"/slide[4]/shape[23]","props":{"text":"这是一个人的一小步，却是人类的一大步","font":"苹方-简","size":"32","bold":"true","color":"FFD700","align":"left","valign":"middle","width":"18cm","height":"4cm","x":"2.5cm","y":"6.5cm"}},
  {"command":"set","path":"/slide[4]/shape[24]","props":{"text":"1969年7月20日，阿波罗11号成功登月，38万公里的旅程","font":"苹方-简","size":"20","color":"E5EAF3","align":"left","valign":"top","width":"18cm","height":"3cm","x":"2.5cm","y":"11cm"}},
  {"command":"set","path":"/slide[4]/shape[25]","props":{"text":"6次成功登月任务（1969-1972）","font":"苹方-简","size":"18","color":"B8C5D6","align":"left","valign":"top","width":"18cm","height":"2cm","x":"2.5cm","y":"14.5cm"}}
]
BATCH_EOF

# ===== Slide 5: Pillars - 空间站时代 =====
echo "Creating Slide 5: Pillars..."
officecli add "$FILENAME" '/' --from '/slide[1]'
cat << 'BATCH_EOF' | officecli batch "$FILENAME"
[
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]/shape[1]","props":{"preset":"rect","fill":"00D9FF","opacity":"0.08","width":"9cm","height":"10cm","x":"2cm","y":"5.5cm"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"preset":"rect","fill":"4A90E2","opacity":"0.08","width":"9cm","height":"10cm","x":"12.5cm","y":"5.5cm"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"6cm","y":"3cm"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"x":"15cm","y":"17cm"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{"x":"25cm","y":"5cm"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{"preset":"ellipse","fill":"00D9FF","opacity":"0.08","line":"none","width":"8cm","height":"8cm","x":"14cm","y":"6cm"}},
  {"command":"set","path":"/slide[5]/shape[7]","props":{"preset":"rect","fill":"5865F2","opacity":"0.08","width":"9cm","height":"10cm","x":"23cm","y":"5.5cm"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[5]/shape[9]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[5]/shape[10]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[5]/shape[11]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[5]/shape[12]","props":{"text":"空间站时代：在轨道上生活","font":"苹方-简","size":"32","bold":"true","color":"FFFFFF","align":"left","valign":"top","width":"28cm","height":"2cm","x":"2cm","y":"2.5cm"}},
  {"command":"set","path":"/slide[5]/shape[13]","props":{"text":"和平号空间站","font":"苹方-简","size":"24","bold":"true","color":"FFFFFF","align":"center","valign":"top","width":"8cm","height":"2cm","x":"2.5cm","y":"6cm"}},
  {"command":"set","path":"/slide[5]/shape[14]","props":{"text":"1986-2001","font":"苹方-简","size":"20","color":"00D9FF","align":"center","valign":"top","width":"8cm","height":"1.5cm","x":"2.5cm","y":"8.5cm"}},
  {"command":"set","path":"/slide[5]/shape[15]","props":{"text":"运行15年，累计接待137名宇航员，证明人类可以在太空长期生活","font":"苹方-简","size":"16","color":"C0CAD9","align":"left","valign":"top","width":"7.5cm","height":"4cm","x":"2.8cm","y":"10.5cm"}},
  {"command":"set","path":"/slide[5]/shape[16]","props":{"text":"国际空间站","font":"苹方-简","size":"24","bold":"true","color":"FFFFFF","align":"center","valign":"top","width":"8cm","height":"2cm","x":"13cm","y":"6cm"}},
  {"command":"set","path":"/slide[5]/shape[17]","props":{"text":"1998-至今","font":"苹方-简","size":"20","color":"4A90E2","align":"center","valign":"top","width":"8cm","height":"1.5cm","x":"13cm","y":"8.5cm"}},
  {"command":"set","path":"/slide[5]/shape[18]","props":{"text":"16国合作，400km轨道高度，持续有人驻守超过23年","font":"苹方-简","size":"16","color":"C0CAD9","align":"left","valign":"top","width":"7.5cm","height":"4cm","x":"13.3cm","y":"10.5cm"}},
  {"command":"set","path":"/slide[5]/shape[19]","props":{"text":"中国空间站","font":"苹方-简","size":"24","bold":"true","color":"FFFFFF","align":"center","valign":"top","width":"8cm","height":"2cm","x":"23.5cm","y":"6cm"}},
  {"command":"set","path":"/slide[5]/shape[20]","props":{"text":"2021-至今","font":"苹方-简","size":"20","color":"5865F2","align":"center","valign":"top","width":"8cm","height":"1.5cm","x":"23.5cm","y":"8.5cm"}},
  {"command":"set","path":"/slide[5]/shape[21]","props":{"text":"自主研发，T字构型，可容纳3-6名航天员长期工作","font":"苹方-简","size":"16","color":"C0CAD9","align":"left","valign":"top","width":"7.5cm","height":"4cm","x":"23.8cm","y":"10.5cm"}}
]
BATCH_EOF

# ===== Slide 6: Evidence - 火星梦想 =====
echo "Creating Slide 6: Evidence..."
officecli add "$FILENAME" '/' --from '/slide[1]'
cat << 'BATCH_EOF' | officecli batch "$FILENAME"
[
  {"command":"set","path":"/slide[6]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[6]/shape[1]","props":{"preset":"ellipse","fill":"D84315","opacity":"0.5","width":"18cm","height":"18cm","x":"18cm","y":"2cm"}},
  {"command":"set","path":"/slide[6]/shape[2]","props":{"preset":"ellipse","fill":"FF5722","opacity":"0.2","width":"12cm","height":"12cm","x":"21cm","y":"5cm"}},
  {"command":"set","path":"/slide[6]/shape[3]","props":{"fill":"FFB74D","x":"4cm","y":"3cm","width":"0.5cm","height":"0.5cm"}},
  {"command":"set","path":"/slide[6]/shape[4]","props":{"fill":"FFFFFF","x":"8cm","y":"16cm","width":"0.4cm","height":"0.4cm"}},
  {"command":"set","path":"/slide[6]/shape[5]","props":{"fill":"FF6B35","x":"12cm","y":"2cm","width":"0.6cm","height":"0.6cm"}},
  {"command":"set","path":"/slide[6]/shape[6]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[6]/shape[7]","props":{"preset":"ellipse","fill":"FF6B35","opacity":"0.15","width":"3cm","height":"3cm","x":"2cm","y":"15cm"}},
  {"command":"set","path":"/slide[6]/shape[8]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[6]/shape[9]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[6]/shape[10]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[6]/shape[11]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[6]/shape[12]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[6]/shape[13]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[6]/shape[14]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[6]/shape[15]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[6]/shape[16]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[6]/shape[17]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[6]/shape[18]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[6]/shape[19]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[6]/shape[20]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[6]/shape[21]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[6]/shape[22]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[6]/shape[23]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[6]/shape[24]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[6]/shape[25]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[6]/shape[26]","props":{"text":"火星梦想","font":"苹方-简","size":"48","bold":"true","color":"FFFFFF","align":"left","valign":"top","width":"15cm","height":"3cm","x":"2cm","y":"2.5cm"}},
  {"command":"set","path":"/slide[6]/shape[27]","props":{"text":"下一个人类的家园","font":"苹方-简","size":"36","bold":"true","color":"FF8A65","align":"left","valign":"top","width":"15cm","height":"2.5cm","x":"2cm","y":"6cm"}},
  {"command":"set","path":"/slide[6]/shape[28]","props":{"text":"探测器先行","font":"苹方-简","size":"22","bold":"true","color":"FFFFFF","align":"left","valign":"top","width":"14cm","height":"1.5cm","x":"2cm","y":"9.5cm"}},
  {"command":"set","path":"/slide[6]/shape[29]","props":{"text":"已有10+个火星探测器成功着陆，毅力号、祝融号正在工作","font":"苹方-简","size":"16","color":"D0D8E5","align":"left","valign":"top","width":"14cm","height":"2.5cm","x":"2cm","y":"11cm"}},
  {"command":"set","path":"/slide[6]/shape[30]","props":{"text":"技术突破 | SpaceX星舰可重复使用，NASA Artemis重返月球为火星铺路","font":"苹方-简","size":"16","color":"D0D8E5","align":"left","valign":"top","width":"14cm","height":"2.5cm","x":"2cm","y":"13.5cm"}},
  {"command":"set","path":"/slide[6]/shape[31]","props":{"text":"2030年代","font":"苹方-简","size":"28","bold":"true","color":"FFD700","align":"right","valign":"middle","width":"10cm","height":"2cm","x":"21cm","y":"8cm"}},
  {"command":"set","path":"/slide[6]/shape[32]","props":{"text":"NASA计划实现载人登陆火星","font":"苹方-简","size":"18","color":"FFFFFF","align":"right","valign":"middle","width":"10cm","height":"2cm","x":"21cm","y":"10.5cm"}}
]
BATCH_EOF

# ===== Slide 7: CTA - 征途未完 =====
echo "Creating Slide 7: CTA..."
officecli add "$FILENAME" '/' --from '/slide[1]'
cat << 'BATCH_EOF' | officecli batch "$FILENAME"
[
  {"command":"set","path":"/slide[7]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[7]/shape[1]","props":{"preset":"ellipse","fill":"1E3A5F","opacity":"0.2","width":"16cm","height":"16cm","x":"10cm","y":"3cm"}},
  {"command":"set","path":"/slide[7]/shape[2]","props":{"preset":"ellipse","fill":"9B59B6","opacity":"0.12","width":"20cm","height":"20cm","x":"8cm","y":"1cm"}},
  {"command":"set","path":"/slide[7]/shape[3]","props":{"x":"30cm","y":"2cm","width":"0.9cm","height":"0.9cm"}},
  {"command":"set","path":"/slide[7]/shape[4]","props":{"x":"3cm","y":"5cm","width":"0.7cm","height":"0.7cm"}},
  {"command":"set","path":"/slide[7]/shape[5]","props":{"x":"26cm","y":"16cm","width":"0.8cm","height":"0.8cm"}},
  {"command":"set","path":"/slide[7]/shape[6]","props":{"preset":"ellipse","fill":"8E44AD","opacity":"0.08","line":"none","width":"24cm","height":"24cm","x":"6cm","y":"0cm"}},
  {"command":"set","path":"/slide[7]/shape[7]","props":{"preset":"ellipse","fill":"3498DB","opacity":"0.7","width":"0.5cm","height":"0.5cm","x":"16cm","y":"9cm"}},
  {"command":"set","path":"/slide[7]/shape[8]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[7]/shape[9]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[7]/shape[10]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[7]/shape[11]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[7]/shape[12]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[7]/shape[13]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[7]/shape[14]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[7]/shape[15]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[7]/shape[16]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[7]/shape[17]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[7]/shape[18]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[7]/shape[19]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[7]/shape[20]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[7]/shape[21]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[7]/shape[22]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[7]/shape[23]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[7]/shape[24]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[7]/shape[25]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[7]/shape[26]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[7]/shape[27]","props":{"x":"36cm","y":"15cm"}},
  {"command":"set","path":"/slide[7]/shape[28]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[7]/shape[29]","props":{"x":"36cm","y":"5cm"}},
  {"command":"set","path":"/slide[7]/shape[30]","props":{"x":"36cm","y":"10cm"}},
  {"command":"set","path":"/slide[7]/shape[31]","props":{"text":"征途未完","font":"苹方-简","size":"64","bold":"true","color":"FFFFFF","align":"center","valign":"middle","width":"26cm","height":"3.5cm","x":"4cm","y":"5.5cm"}},
  {"command":"set","path":"/slide[7]/shape[32]","props":{"text":"从第一颗卫星到空间站，从月球漫步到火星梦想，人类的探索永不止步。星辰大海，就在前方。","font":"苹方-简","size":"20","color":"B8C5D6","align":"center","valign":"middle","width":"26cm","height":"5cm","x":"4cm","y":"10cm"}}
]
BATCH_EOF

# ===== Validate =====
echo "Validating..."
officecli validate "$FILENAME"

echo "Build complete: $FILENAME"
echo "Total slides: 7"
