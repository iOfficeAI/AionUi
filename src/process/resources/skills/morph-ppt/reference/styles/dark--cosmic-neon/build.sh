#!/bin/bash
set -e

# Generate Python script
cat << 'PYEOF' > build_internal.py
import json
import os
import subprocess

file_name = "Time_Travel.pptx"

def run_batch(name, batch_data):
    with open(f"{name}.json", "w", encoding="utf-8") as f:
        json.dump(batch_data, f)
    subprocess.run(f"cat {name}.json | officecli batch {file_name}", shell=True, check=True)

subprocess.run(["officecli", "create", file_name], check=True)
subprocess.run(["officecli", "add", file_name, "/", "--type", "slide", "--prop", "layout=blank", "--prop", "background=050510"], check=True)

slide1 = [
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!bg-glow1","preset":"ellipse","fill":"8A2BE2","opacity":"0.15","x":"0cm","y":"0cm","width":"15cm","height":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!bg-glow2","preset":"ellipse","fill":"00FFFF","opacity":"0.15","x":"18cm","y":"4cm","width":"15cm","height":"15cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!ring","preset":"donut","fill":"none","line":"00FFFF","lineWidth":"2","x":"25cm","y":"2cm","width":"5cm","height":"5cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!line-top","preset":"rect","fill":"8A2BE2","x":"4cm","y":"2cm","width":"8cm","height":"0.1cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!star1","preset":"star5","fill":"00FFFF","opacity":"0.5","x":"3cm","y":"15cm","width":"1cm","height":"1cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!star2","preset":"star5","fill":"8A2BE2","opacity":"0.5","x":"30cm","y":"12cm","width":"1.5cm","height":"1.5cm"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!hero-title","text":"穿越时空：科学还是幻想？","x":"4cm","y":"7cm","width":"26cm","height":"3cm","font":"思源黑体","size":"56","color":"FFFFFF","bold":"true","align":"center"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!hero-sub","text":"从爱因斯坦的相对论到现代量子物理的探索之旅","x":"4cm","y":"10.5cm","width":"26cm","height":"2cm","font":"思源黑体","size":"24","color":"AAAAAA","align":"center"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!statement-text","text":"时间并非绝对的流逝，\n而是一种可以被弯曲的维度。","x":"36cm","y":"0cm","width":"30cm","height":"6cm","font":"思源黑体","size":"44","color":"FFFFFF","bold":"true","align":"center","lineSpacing":"1.5"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!statement-sub","text":"根据广义相对论，引力越强，时间流逝越慢。我们每个人都已经是时间旅行者，只不过只能以每秒一秒的速度走向未来。","x":"36cm","y":"1cm","width":"26cm","height":"4cm","font":"思源黑体","size":"20","color":"AAAAAA","align":"center"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-title","text":"物理学中的三种时间旅行可能","x":"36cm","y":"2cm","width":"20cm","height":"2cm","font":"思源黑体","size":"36","color":"FFFFFF","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-1-bg","preset":"roundRect","fill":"111122","opacity":"0.6","x":"36cm","y":"3cm","width":"9cm","height":"11cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-1-title","text":"虫洞理论","x":"36cm","y":"4cm","width":"7cm","height":"1.5cm","font":"思源黑体","size":"28","color":"00FFFF","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-1-desc","text":"连接宇宙中两个遥远时空点的捷径，理论上可以实现瞬间跨越，如爱因斯坦-罗森桥。","x":"36cm","y":"5cm","width":"7cm","height":"6cm","font":"思源黑体","size":"18","color":"CCCCCC","lineSpacing":"1.3"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-2-bg","preset":"roundRect","fill":"111122","opacity":"0.6","x":"36cm","y":"6cm","width":"9cm","height":"11cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-2-title","text":"光速飞行","x":"36cm","y":"7cm","width":"7cm","height":"1.5cm","font":"思源黑体","size":"28","color":"00FFFF","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-2-desc","text":"当物体运动速度接近光速时，自身时间会显著变慢，从而穿越到相对的未来（双生子佯谬）。","x":"36cm","y":"8cm","width":"7cm","height":"6cm","font":"思源黑体","size":"18","color":"CCCCCC","lineSpacing":"1.3"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-3-bg","preset":"roundRect","fill":"111122","opacity":"0.6","x":"36cm","y":"9cm","width":"9cm","height":"11cm"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-3-title","text":"宇宙弦","x":"36cm","y":"10cm","width":"7cm","height":"1.5cm","font":"思源黑体","size":"28","color":"00FFFF","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!pillar-3-desc","text":"假设存在的高密度能量细丝，其强大的引力场可能导致时空闭合，形成时间循环。","x":"36cm","y":"11cm","width":"7cm","height":"6cm","font":"思源黑体","size":"18","color":"CCCCCC","lineSpacing":"1.3"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-title","text":"时间膨胀的真实观测数据","x":"36cm","y":"12cm","width":"20cm","height":"2cm","font":"思源黑体","size":"36","color":"FFFFFF","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-data","text":"38 微秒","x":"36cm","y":"13cm","width":"12cm","height":"4cm","font":"Montserrat","size":"80","color":"00FFFF","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!evi-desc","text":"GPS卫星每天必须调整38微秒的时钟误差。由于卫星在太空中受到的引力较小且运动速度快，其时间流逝速度与地面不同。如果不修正，GPS定位每天会产生10公里的误差。","x":"36cm","y":"14cm","width":"15cm","height":"8cm","font":"思源黑体","size":"22","color":"CCCCCC","lineSpacing":"1.5"}},

  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!cta-title","text":"未来，我们会在过去相遇吗？","x":"36cm","y":"15cm","width":"26cm","height":"3cm","font":"思源黑体","size":"52","color":"FFFFFF","bold":"true","align":"center"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"!!cta-sub","text":"保持对宇宙的敬畏与好奇","x":"36cm","y":"16cm","width":"26cm","height":"2cm","font":"思源黑体","size":"24","color":"00FFFF","align":"center"}}
]
run_batch("slide1", slide1)

slide2 = [
  {"command":"add","parent":"/","from":"/slide[1]","type":"slide"},
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"10cm","y":"2cm","width":"14cm","height":"14cm"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"5cm","y":"5cm","width":"10cm","height":"10cm"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"15cm","y":"10cm","width":"8cm","height":"8cm"}},
  {"command":"set","path":"/slide[2]/shape[4]","props":{"x":"12cm","y":"15cm","width":"10cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"28cm","y":"4cm"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"5cm","y":"10cm"}},
  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"36cm","y":"1cm"}},
  {"command":"set","path":"/slide[2]/shape[9]","props":{"x":"2cm","y":"6cm"}},
  {"command":"set","path":"/slide[2]/shape[10]","props":{"x":"4cm","y":"13cm"}}
]
run_batch("slide2", slide2)

slide3 = [
  {"command":"add","parent":"/","from":"/slide[1]","type":"slide"},
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"0cm","y":"12cm","width":"10cm","height":"10cm"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"23cm","y":"0cm","width":"12cm","height":"12cm"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"30cm","y":"15cm","width":"3cm","height":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[4]","props":{"x":"2cm","y":"2cm","width":"5cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[3]/shape[5]","props":{"x":"20cm","y":"2cm"}},
  {"command":"set","path":"/slide[3]/shape[6]","props":{"x":"10cm","y":"17cm"}},
  {"command":"set","path":"/slide[3]/shape[7]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[3]/shape[8]","props":{"x":"36cm","y":"1cm"}},
  {"command":"set","path":"/slide[3]/shape[9]","props":{"x":"36cm","y":"2cm"}},
  {"command":"set","path":"/slide[3]/shape[10]","props":{"x":"36cm","y":"3cm"}},
  {"command":"set","path":"/slide[3]/shape[11]","props":{"x":"2cm","y":"1.5cm"}},
  {"command":"set","path":"/slide[3]/shape[12]","props":{"x":"2cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"x":"3cm","y":"6cm"}},
  {"command":"set","path":"/slide[3]/shape[14]","props":{"x":"3cm","y":"8cm"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"x":"12.5cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[16]","props":{"x":"13.5cm","y":"6cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{"x":"13.5cm","y":"8cm"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"x":"23cm","y":"5cm"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"x":"24cm","y":"6cm"}},
  {"command":"set","path":"/slide[3]/shape[20]","props":{"x":"24cm","y":"8cm"}}
]
run_batch("slide3", slide3)

slide4 = [
  {"command":"add","parent":"/","from":"/slide[1]","type":"slide"},
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"2cm","y":"4cm","width":"12cm","height":"12cm","fill":"111122","opacity":"0.6"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"16cm","y":"5cm","width":"16cm","height":"10cm","opacity":"0.1"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"5cm","y":"5cm","width":"6cm","height":"6cm"}},
  {"command":"set","path":"/slide[4]/shape[4]","props":{"x":"15cm","y":"8cm","width":"15cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[4]/shape[5]","props":{"x":"30cm","y":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[6]","props":{"x":"8cm","y":"16cm"}},
  {"command":"set","path":"/slide[4]/shape[7]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[8]","props":{"x":"36cm","y":"1cm"}},
  {"command":"set","path":"/slide[4]/shape[21]","props":{"x":"2cm","y":"1.5cm"}},
  {"command":"set","path":"/slide[4]/shape[22]","props":{"x":"4cm","y":"8cm"}},
  {"command":"set","path":"/slide[4]/shape[23]","props":{"x":"16cm","y":"7cm"}}
]
run_batch("slide4", slide4)

slide5 = [
  {"command":"add","parent":"/","from":"/slide[1]","type":"slide"},
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}},
  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"0cm","y":"0cm","width":"15cm","height":"15cm","fill":"8A2BE2","opacity":"0.15"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"18cm","y":"4cm","width":"15cm","height":"15cm"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"25cm","y":"2cm","width":"5cm","height":"5cm"}},
  {"command":"set","path":"/slide[5]/shape[4]","props":{"x":"13cm","y":"16cm","width":"8cm","height":"0.1cm"}},
  {"command":"set","path":"/slide[5]/shape[5]","props":{"x":"6cm","y":"5cm"}},
  {"command":"set","path":"/slide[5]/shape[6]","props":{"x":"28cm","y":"15cm"}},
  {"command":"set","path":"/slide[5]/shape[7]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[5]/shape[8]","props":{"x":"36cm","y":"1cm"}},
  {"command":"set","path":"/slide[5]/shape[24]","props":{"x":"4cm","y":"7cm"}},
  {"command":"set","path":"/slide[5]/shape[25]","props":{"x":"4cm","y":"11cm"}}
]
run_batch("slide5", slide5)
PYEOF

python3 build_internal.py
rm build_internal.py slide1.json slide2.json slide3.json slide4.json slide5.json
