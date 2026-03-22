#!/bin/bash
set -e

FILE="未来已来_2050.pptx"
echo "Creating PPT: $FILE"
officecli create "$FILE"

echo "Setting up Slide 1..."
officecli add "$FILE" '/' --type slide --prop layout=blank --prop background=0B0C10

# -- Scene Actors (1-6) --
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!bg-orb" --prop preset=ellipse --prop fill=66FCF1 --prop opacity=0.08 --prop x=0cm --prop y=0cm --prop width=20cm --prop height=20cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!bg-box" --prop preset=rect --prop fill=1F2833 --prop opacity=0.3 --prop x=2cm --prop y=2cm --prop width=8cm --prop height=15cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!accent-line" --prop preset=rect --prop fill=66FCF1 --prop x=1cm --prop y=4cm --prop width=0.2cm --prop height=5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!frame" --prop preset=rect --prop fill=none --prop line=1F2833 --prop lineWidth=2 --prop x=1.2cm --prop y=0.8cm --prop width=31.47cm --prop height=17.45cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!dot-1" --prop preset=ellipse --prop fill=45A29E --prop x=5cm --prop y=10cm --prop width=0.5cm --prop height=0.5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!dot-2" --prop preset=ellipse --prop fill=66FCF1 --prop x=30cm --prop y=15cm --prop width=1cm --prop height=1cm

# -- Slide 1 Headline Actors (7-9) --
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!hero-title" --prop text="未来已来：2050" --prop font="思源黑体" --prop size=64 --prop bold=true --prop color=FFFFFF --prop x=4cm --prop y=6cm --prop width=25cm --prop height=4cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!hero-sub" --prop text="全息时代的一天" --prop font="思源黑体" --prop size=36 --prop color=C5C6C7 --prop x=4.2cm --prop y=10.5cm --prop width=15cm --prop height=2cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!hero-tag" --prop text="THE BOUNDARY DISSOLVES" --prop font="Montserrat" --prop size=16 --prop color=66FCF1 --prop x=4.2cm --prop y=13cm --prop width=15cm --prop height=1.5cm --prop bold=true

# -- Slide 2 Headline Actors (10-11) --
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!stmt-text" --prop text="物理与数字的边界彻底消融" --prop font="思源黑体" --prop size=54 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=36cm --prop y=7cm --prop width=28cm --prop height=4cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!stmt-sub" --prop text="智能代理、脑机接口与空间计算重塑了我们的每一秒" --prop font="思源黑体" --prop size=24 --prop color=45A29E --prop align=center --prop x=36cm --prop y=12cm --prop width=28cm --prop height=2cm

# -- Slide 3 Content Actors (12-23) --
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p1-bg" --prop preset=roundRect --prop fill=1F2833 --prop opacity=0.4 --prop x=36cm --prop y=4.5cm --prop width=9cm --prop height=11cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p1-time" --prop text="07:00" --prop font="Montserrat" --prop size=28 --prop bold=true --prop color=66FCF1 --prop x=36cm --prop y=5.5cm --prop width=7cm --prop height=1.5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p1-title" --prop text="基因营养与唤醒" --prop font="思源黑体" --prop size=24 --prop bold=true --prop color=FFFFFF --prop x=36cm --prop y=7.5cm --prop width=7.5cm --prop height=1.5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p1-desc" --prop text="AI管家实时读取体征，合成专属营养早餐，温和唤醒意识。" --prop font="思源黑体" --prop size=16 --prop color=C5C6C7 --prop x=36cm --prop y=10cm --prop width=7cm --prop height=4cm

officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p2-bg" --prop preset=roundRect --prop fill=1F2833 --prop opacity=0.4 --prop x=36cm --prop y=4.5cm --prop width=9cm --prop height=11cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p2-time" --prop text="14:00" --prop font="Montserrat" --prop size=28 --prop bold=true --prop color=66FCF1 --prop x=36cm --prop y=5.5cm --prop width=7cm --prop height=1.5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p2-title" --prop text="全息远程协同" --prop font="思源黑体" --prop size=24 --prop bold=true --prop color=FFFFFF --prop x=36cm --prop y=7.5cm --prop width=7.5cm --prop height=1.5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p2-desc" --prop text="在虚拟火星基地与全球团队开启三维会议，数据触手可及。" --prop font="思源黑体" --prop size=16 --prop color=C5C6C7 --prop x=36cm --prop y=10cm --prop width=7cm --prop height=4cm

officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p3-bg" --prop preset=roundRect --prop fill=1F2833 --prop opacity=0.4 --prop x=36cm --prop y=4.5cm --prop width=9cm --prop height=11cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p3-time" --prop text="21:00" --prop font="Montserrat" --prop size=28 --prop bold=true --prop color=66FCF1 --prop x=36cm --prop y=5.5cm --prop width=7cm --prop height=1.5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p3-title" --prop text="沉浸式潜意识休眠" --prop font="思源黑体" --prop size=24 --prop bold=true --prop color=FFFFFF --prop x=36cm --prop y=7.5cm --prop width=8cm --prop height=1.5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!p3-desc" --prop text="脑机接口连接潜意识网络，在深睡中完成知识载入与精神放松。" --prop font="思源黑体" --prop size=16 --prop color=C5C6C7 --prop x=36cm --prop y=10cm --prop width=7cm --prop height=4cm

# -- Slide 4 Content Actors (24-29) --
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!ev-bg" --prop preset=rect --prop fill=45A29E --prop opacity=0.3 --prop x=36cm --prop y=3cm --prop width=15cm --prop height=13cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!ev-num" --prop text="98.5%" --prop font="Montserrat" --prop size=96 --prop bold=true --prop color=66FCF1 --prop x=36cm --prop y=5cm --prop width=15cm --prop height=5cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!ev-label" --prop text="全球人口脑机接口接入率" --prop font="思源黑体" --prop size=24 --prop color=FFFFFF --prop x=36cm --prop y=11cm --prop width=13cm --prop height=2cm

officecli add "$FILE" '/slide[1]' --type shape --prop name="!!ev2-bg" --prop preset=rect --prop fill=1F2833 --prop opacity=0.5 --prop x=36cm --prop y=8cm --prop width=12cm --prop height=8cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!ev2-num" --prop text="12.4 hrs" --prop font="Montserrat" --prop size=64 --prop bold=true --prop color=FFFFFF --prop x=36cm --prop y=9.5cm --prop width=10cm --prop height=3cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!ev2-label" --prop text="平均每日混合现实驻留时长" --prop font="思源黑体" --prop size=18 --prop color=C5C6C7 --prop x=36cm --prop y=13.5cm --prop width=10cm --prop height=2cm

# -- Slide 5 Headline Actors (30-31) --
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!cta-title" --prop text="准备好迎接你的未来了吗？" --prop font="思源黑体" --prop size=48 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=36cm --prop y=7cm --prop width=26cm --prop height=3cm
officecli add "$FILE" '/slide[1]' --type shape --prop name="!!cta-btn" --prop text="EXPLORE 2050" --prop preset=roundRect --prop font="Montserrat" --prop size=18 --prop bold=true --prop color=0B0C10 --prop fill=66FCF1 --prop align=center --prop x=36cm --prop y=11.5cm --prop width=6cm --prop height=1.5cm

# ==============================================================================
# Slide 2: Statement
# ==============================================================================
echo "Setting up Slide 2..."
officecli add "$FILE" '/' --from '/slide[1]'
cat << 'JSON_EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}},

  {"command":"set","path":"/slide[2]/shape[1]","props":{"x":"20cm","y":"8cm","opacity":"0.05","fill":"45A29E"}},
  {"command":"set","path":"/slide[2]/shape[2]","props":{"x":"14cm","y":"2cm","width":"18cm","opacity":"0.1"}},
  {"command":"set","path":"/slide[2]/shape[3]","props":{"x":"2cm","y":"2cm","width":"30cm","height":"0.2cm"}},
  {"command":"set","path":"/slide[2]/shape[5]","props":{"x":"31cm","y":"4cm"}},
  {"command":"set","path":"/slide[2]/shape[6]","props":{"x":"3cm","y":"16cm"}},

  {"command":"set","path":"/slide[2]/shape[7]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[2]/shape[8]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[2]/shape[9]","props":{"x":"36cm","y":"0cm"}},

  {"command":"set","path":"/slide[2]/shape[10]","props":{"x":"2.9cm","y":"7cm"}},
  {"command":"set","path":"/slide[2]/shape[11]","props":{"x":"2.9cm","y":"12cm"}}
]
JSON_EOF

# ==============================================================================
# Slide 3: Pillars
# ==============================================================================
echo "Setting up Slide 3..."
officecli add "$FILE" '/' --from '/slide[2]'
cat << 'JSON_EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/slide[3]","props":{"transition":"morph"}},

  {"command":"set","path":"/slide[3]/shape[1]","props":{"x":"10cm","y":"0cm","opacity":"0.08","fill":"66FCF1"}},
  {"command":"set","path":"/slide[3]/shape[2]","props":{"x":"2cm","y":"2cm","width":"30cm","height":"2cm","opacity":"0.1"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"x":"31cm","y":"4cm","width":"0.2cm","height":"5cm"}},

  {"command":"set","path":"/slide[3]/shape[10]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[3]/shape[11]","props":{"x":"36cm","y":"0cm"}},

  {"command":"set","path":"/slide[3]/shape[12]","props":{"x":"2.5cm","y":"4.5cm"}},
  {"command":"set","path":"/slide[3]/shape[13]","props":{"x":"3.5cm","y":"5.5cm","animation":"fade-entrance-400-with"}},
  {"command":"set","path":"/slide[3]/shape[14]","props":{"x":"3.5cm","y":"7.5cm","animation":"fade-entrance-400-with"}},
  {"command":"set","path":"/slide[3]/shape[15]","props":{"x":"3.5cm","y":"10cm","animation":"fade-entrance-400-with"}},

  {"command":"set","path":"/slide[3]/shape[16]","props":{"x":"12.5cm","y":"4.5cm"}},
  {"command":"set","path":"/slide[3]/shape[17]","props":{"x":"13.5cm","y":"5.5cm","animation":"fade-entrance-400-with"}},
  {"command":"set","path":"/slide[3]/shape[18]","props":{"x":"13.5cm","y":"7.5cm","animation":"fade-entrance-400-with"}},
  {"command":"set","path":"/slide[3]/shape[19]","props":{"x":"13.5cm","y":"10cm","animation":"fade-entrance-400-with"}},

  {"command":"set","path":"/slide[3]/shape[20]","props":{"x":"22.5cm","y":"4.5cm"}},
  {"command":"set","path":"/slide[3]/shape[21]","props":{"x":"23.5cm","y":"5.5cm","animation":"fade-entrance-400-with"}},
  {"command":"set","path":"/slide[3]/shape[22]","props":{"x":"23.5cm","y":"7.5cm","animation":"fade-entrance-400-with"}},
  {"command":"set","path":"/slide[3]/shape[23]","props":{"x":"23.5cm","y":"10cm","animation":"fade-entrance-400-with"}}
]
JSON_EOF

# ==============================================================================
# Slide 4: Evidence
# ==============================================================================
echo "Setting up Slide 4..."
officecli add "$FILE" '/' --from '/slide[3]'
cat << 'JSON_EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/slide[4]","props":{"transition":"morph"}},

  {"command":"set","path":"/slide[4]/shape[1]","props":{"x":"15cm","y":"10cm","opacity":"0.05"}},
  {"command":"set","path":"/slide[4]/shape[2]","props":{"x":"2cm","y":"4cm","width":"4cm","height":"11cm"}},
  {"command":"set","path":"/slide[4]/shape[3]","props":{"x":"2cm","y":"15.5cm","width":"12cm","height":"0.2cm"}},

  {"command":"set","path":"/slide[4]/shape[12]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[13]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[14]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[15]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[16]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[17]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[18]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[19]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[20]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[21]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[22]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[4]/shape[23]","props":{"x":"36cm","y":"0cm"}},

  {"command":"set","path":"/slide[4]/shape[24]","props":{"x":"4cm","y":"3cm"}},
  {"command":"set","path":"/slide[4]/shape[25]","props":{"x":"5cm","y":"5cm"}},
  {"command":"set","path":"/slide[4]/shape[26]","props":{"x":"5cm","y":"12cm"}},

  {"command":"set","path":"/slide[4]/shape[27]","props":{"x":"20cm","y":"8cm"}},
  {"command":"set","path":"/slide[4]/shape[28]","props":{"x":"21cm","y":"9.5cm"}},
  {"command":"set","path":"/slide[4]/shape[29]","props":{"x":"21cm","y":"13.5cm"}}
]
JSON_EOF

# ==============================================================================
# Slide 5: CTA
# ==============================================================================
echo "Setting up Slide 5..."
officecli add "$FILE" '/' --from '/slide[4]'
cat << 'JSON_EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/slide[5]","props":{"transition":"morph"}},

  {"command":"set","path":"/slide[5]/shape[1]","props":{"x":"8cm","y":"0cm","width":"15cm","height":"15cm","opacity":"0.08"}},
  {"command":"set","path":"/slide[5]/shape[2]","props":{"x":"12cm","y":"10cm","width":"10cm","height":"6cm"}},
  {"command":"set","path":"/slide[5]/shape[3]","props":{"x":"16.5cm","y":"16cm","width":"0.8cm","height":"0.2cm"}},

  {"command":"set","path":"/slide[5]/shape[24]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[5]/shape[25]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[5]/shape[26]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[5]/shape[27]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[5]/shape[28]","props":{"x":"36cm","y":"0cm"}},
  {"command":"set","path":"/slide[5]/shape[29]","props":{"x":"36cm","y":"0cm"}},

  {"command":"set","path":"/slide[5]/shape[30]","props":{"x":"3.9cm","y":"7cm"}},
  {"command":"set","path":"/slide[5]/shape[31]","props":{"x":"13.9cm","y":"11.5cm"}}
]
JSON_EOF

echo "Done building. Validating PPT..."
officecli validate "$FILE"
officecli view "$FILE" outline
