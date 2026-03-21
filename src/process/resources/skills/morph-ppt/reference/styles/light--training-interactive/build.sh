#!/bin/bash
# Training Interactive Template - Build Script
# 培训课件互动风格PPT模板 - 丰富版 280+ 元素
set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"
for i in 1 2 3 4 5 6 7; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFF9E6
done
echo "Created 7 slides"

# SLIDE 1 - COVER
echo "Building Slide 1 - Cover..."
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=0cm --prop y=0.5cm --prop width=8cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=8cm --prop y=0.5cm --prop width=6cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FF6B6B --prop opacity=0.15 --prop x=0cm --prop y=1cm --prop width=4cm --prop height=18.05cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.2 --prop x=0.5cm --prop y=6cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.15 --prop x=1cm --prop y=10cm --prop width=2cm --prop height=2cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.2 --prop x=0.8cm --prop y=13cm --prop width=2.5cm --prop height=2.5cm

for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.3 --prop x=1cm --prop y=$((i))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.25 --prop x=2cm --prop y=$((i+1))cm --prop width=0.25cm --prop height=0.25cm
  officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=3cm --prop y=$((i+2))cm --prop width=0.2cm --prop height=0.2cm
done

officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=6cm --prop y=3cm --prop width=26cm --prop height=13cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=6cm --prop y=3cm --prop width=26cm --prop height=0.25cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=4ECDC4 --prop x=7cm --prop y=4cm --prop width=4cm --prop height=1cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="企业培训" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=7cm --prop y=4.2cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="高效沟通技巧" --prop font="Microsoft YaHei" --prop size=48 --prop bold=true --prop color=2D3436 --prop align=left --prop x=7cm --prop y=5.5cm --prop width=20cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="EFFECTIVE COMMUNICATION SKILLS" --prop font="Arial Black" --prop size=18 --prop color=FF6B6B --prop align=left --prop x=7cm --prop y=8.2cm --prop width=22cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=7cm --prop y=9.5cm --prop width=8cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="主讲讲师" --prop font="Microsoft YaHei" --prop size=12 --prop color=B2BEC3 --prop align=left --prop x=7cm --prop y=10.2cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="张明远 资深培训师" --prop font="Microsoft YaHei" --prop size=18 --prop color=2D3436 --prop align=left --prop x=7cm --prop y=10.8cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFF9E6 --prop line=FF6B6B --prop lineWidth=1pt --prop x=7cm --prop y=12.5cm --prop width=6cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="培训时间" --prop font="Microsoft YaHei" --prop size=11 --prop color=B2BEC3 --prop align=left --prop x=7.5cm --prop y=12.8cm --prop width=5cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026年3月25日" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=2D3436 --prop align=left --prop x=7.5cm --prop y=13.4cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="14:00 - 17:00" --prop font="Microsoft YaHei" --prop size=12 --prop color=FF6B6B --prop align=left --prop x=7.5cm --prop y=14.2cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFF9E6 --prop line=4ECDC4 --prop lineWidth=1pt --prop x=14cm --prop y=12.5cm --prop width=6cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="培训地点" --prop font="Microsoft YaHei" --prop size=11 --prop color=B2BEC3 --prop align=left --prop x=14.5cm --prop y=12.8cm --prop width=5cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="总部3楼培训室" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=2D3436 --prop align=left --prop x=14.5cm --prop y=13.4cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="线上同步直播" --prop font="Microsoft YaHei" --prop size=12 --prop color=4ECDC4 --prop align=left --prop x=14.5cm --prop y=14.2cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFF9E6 --prop line=FFE66D --prop lineWidth=1pt --prop x=21cm --prop y=12.5cm --prop width=5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="参与人数" --prop font="Microsoft YaHei" --prop size=11 --prop color=B2BEC3 --prop align=left --prop x=21.5cm --prop y=12.8cm --prop width=4cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="50人" --prop font="Arial Black" --prop size=24 --prop color=FFE66D --prop align=left --prop x=21.5cm --prop y=13.3cm --prop width=4cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.1 --prop x=28cm --prop y=4cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.1 --prop x=30cm --prop y=10cm --prop width=5cm --prop height=5cm
echo "Slide 1 complete"

# SLIDE 2 - OBJECTIVES
echo "Building Slide 2 - Objectives..."
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="学习进度 2/7" --prop font="Microsoft YaHei" --prop size=10 --prop color=B2BEC3 --prop align=right --prop x=28cm --prop y=0.5cm --prop width=5cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop opacity=0.1 --prop x=0cm --prop y=0cm --prop width=3cm --prop height=19.05cm

for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.3 --prop x=0.5cm --prop y=$((i))cm --prop width=0.35cm --prop height=0.35cm
  officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.25 --prop x=1.5cm --prop y=$((i+1))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=2.2cm --prop y=$((i+2))cm --prop width=0.25cm --prop height=0.25cm
done

officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="学习目标" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=2D3436 --prop align=left --prop x=5cm --prop y=1.5cm --prop width=15cm --prop height=1.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="LEARNING OBJECTIVES" --prop font="Arial Black" --prop size=14 --prop color=4ECDC4 --prop align=left --prop x=5cm --prop y=3.5cm --prop width=15cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=5cm --prop y=4.5cm --prop width=5cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=5cm --prop y=5.5cm --prop width=9.5cm --prop height=11cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=5cm --prop y=5.5cm --prop width=9.5cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.15 --prop x=8cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="01" --prop font="Arial Black" --prop size=48 --prop color=FF6B6B --prop align=center --prop x=5cm --prop y=7cm --prop width=9.5cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="理解沟通本质" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=center --prop x=5cm --prop y=10cm --prop width=9.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="掌握沟通的核心概念与基本原则，建立正确的沟通认知框架" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=center --prop x=5.5cm --prop y=11.5cm --prop width=8.5cm --prop height=2cm --prop fill=none

officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=15.5cm --prop y=5.5cm --prop width=9.5cm --prop height=11cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=15.5cm --prop y=5.5cm --prop width=9.5cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.15 --prop x=18.5cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="02" --prop font="Arial Black" --prop size=48 --prop color=4ECDC4 --prop align=center --prop x=15.5cm --prop y=7cm --prop width=9.5cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="掌握实用技巧" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=center --prop x=15.5cm --prop y=10cm --prop width=9.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="学习有效的沟通技巧和方法，提升日常工作中的沟通效率" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=center --prop x=16cm --prop y=11.5cm --prop width=8.5cm --prop height=2cm --prop fill=none

officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=26cm --prop y=5.5cm --prop width=9.5cm --prop height=11cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=26cm --prop y=5.5cm --prop width=9.5cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.2 --prop x=29cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="03" --prop font="Arial Black" --prop size=48 --prop color=FFE66D --prop align=center --prop x=26cm --prop y=7cm --prop width=9.5cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="实战应用演练" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=center --prop x=26cm --prop y=10cm --prop width=9.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="通过场景模拟和案例分析，将所学知识转化为实际能力" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=center --prop x=26.5cm --prop y=11.5cm --prop width=8.5cm --prop height=2cm --prop fill=none
echo "Slide 2 complete"

# SLIDE 3 - CONTENT 1
echo "Building Slide 3 - Content 1..."
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="学习进度 3/7" --prop font="Microsoft YaHei" --prop size=10 --prop color=B2BEC3 --prop align=right --prop x=28cm --prop y=0.5cm --prop width=5cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=FFE66D --prop opacity=0.1 --prop x=0cm --prop y=0cm --prop width=3cm --prop height=19.05cm

for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=0.5cm --prop y=$((i))cm --prop width=0.35cm --prop height=0.35cm
  officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.25 --prop x=1.5cm --prop y=$((i+1))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.2 --prop x=2.2cm --prop y=$((i+2))cm --prop width=0.25cm --prop height=0.25cm
done

officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop x=5cm --prop y=1cm --prop width=2cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="第一章" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=5cm --prop y=1.1cm --prop width=2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="沟通的本质" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=2D3436 --prop align=left --prop x=5cm --prop y=2.2cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="THE NATURE OF COMMUNICATION" --prop font="Arial Black" --prop size=12 --prop color=FF6B6B --prop align=left --prop x=5cm --prop y=3.8cm --prop width=15cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=5cm --prop y=5cm --prop width=13cm --prop height=12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=5cm --prop y=5cm --prop width=13cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="核心定义" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2D3436 --prop align=left --prop x=6cm --prop y=5.8cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="沟通是信息的传递与理解过程，包含发送者、信息、渠道、接收者四个核心要素。" --prop font="Microsoft YaHei" --prop size=14 --prop color=636E72 --prop align=left --prop x=6cm --prop y=7cm --prop width=11cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=6cm --prop y=9.5cm --prop width=11cm --prop height=0.05cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="关键要点" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=2D3436 --prop align=left --prop x=6cm --prop y=10.2cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="发送者: 编码信息，选择渠道" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=11.2cm --prop width=11cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="接收者: 解码信息，给予反馈" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=12cm --prop width=11cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="渠道: 信息传递的媒介方式" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=12.8cm --prop width=11cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="反馈: 确认理解的响应环节" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=13.6cm --prop width=11cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=19cm --prop y=5cm --prop width=13cm --prop height=12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=19cm --prop y=5cm --prop width=13cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="沟通模型" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=2D3436 --prop align=center --prop x=19cm --prop y=5.8cm --prop width=13cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop x=20cm --prop y=7.5cm --prop width=4cm --prop height=2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="发送者" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=20cm --prop y=8cm --prop width=4cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rightArrow --prop fill=4ECDC4 --prop x=24.5cm --prop y=8cm --prop width=3cm --prop height=1cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFE66D --prop x=28cm --prop y=7.5cm --prop width=3cm --prop height=2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="信息" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=28cm --prop y=8cm --prop width=3cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=4ECDC4 --prop x=20cm --prop y=11cm --prop width=4cm --prop height=2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="接收者" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=20cm --prop y=11.5cm --prop width=4cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=leftArrow --prop fill=FF6B6B --prop x=24.5cm --prop y=11.5cm --prop width=3cm --prop height=1cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop opacity=0.3 --prop x=28cm --prop y=11cm --prop width=3cm --prop height=2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="反馈" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=28cm --prop y=11.5cm --prop width=3cm --prop height=1cm --prop fill=none
echo "Slide 3 complete"

# SLIDE 4 - CONTENT 2
echo "Building Slide 4 - Content 2..."
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="学习进度 4/7" --prop font="Microsoft YaHei" --prop size=10 --prop color=B2BEC3 --prop align=right --prop x=28cm --prop y=0.5cm --prop width=5cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FF6B6B --prop opacity=0.1 --prop x=30cm --prop y=0cm --prop width=3.87cm --prop height=19.05cm

for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.25 --prop x=31cm --prop y=$((i))cm --prop width=0.35cm --prop height=0.35cm
  officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.3 --prop x=32cm --prop y=$((i+1))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.25 --prop x=33cm --prop y=$((i+2))cm --prop width=0.25cm --prop height=0.25cm
done

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=4ECDC4 --prop x=1cm --prop y=1cm --prop width=2cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="第二章" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=1cm --prop y=1.1cm --prop width=2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="有效沟通的技巧" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=2D3436 --prop align=left --prop x=1cm --prop y=2.2cm --prop width=20cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="EFFECTIVE COMMUNICATION SKILLS" --prop font="Arial Black" --prop size=12 --prop color=4ECDC4 --prop align=left --prop x=1cm --prop y=3.8cm --prop width=20cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=1cm --prop y=5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=1cm --prop y=5cm --prop width=0.3cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.15 --prop x=2cm --prop y=5.5cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="积极倾听" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=left --prop x=6cm --prop y=5.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="全神贯注地听，不打断对方" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=6.5cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="适时点头、眼神接触" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=7.2cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="复述确认理解" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=7.9cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="提问澄清疑惑" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=8.6cm --prop width=8cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=16cm --prop y=5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=16cm --prop y=5cm --prop width=0.3cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.15 --prop x=17cm --prop y=5.5cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="清晰表达" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=left --prop x=21cm --prop y=5.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="结构化组织语言" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=6.5cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="使用具体例子说明" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=7.2cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="避免专业术语" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=7.9cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="确认对方理解" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=8.6cm --prop width=8cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=1cm --prop y=11.5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=1cm --prop y=11.5cm --prop width=0.3cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.2 --prop x=2cm --prop y=12cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="非语言沟通" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=left --prop x=6cm --prop y=12cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="注意肢体语言" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=13cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="控制面部表情" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=13.7cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="保持适当距离" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=14.4cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="眼神交流自然" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=6cm --prop y=15.1cm --prop width=8cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=16cm --prop y=11.5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=16cm --prop y=11.5cm --prop width=0.3cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.15 --prop x=17cm --prop y=12cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="有效反馈" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=left --prop x=21cm --prop y=12cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="及时给予反馈" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=13cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="具体而非笼统" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=13.7cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="建设性建议" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=14.4cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="先肯定再建议" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=21cm --prop y=15.1cm --prop width=8cm --prop height=0.5cm --prop fill=none
echo "Slide 4 complete"

# SLIDE 5 - CONTENT 3
echo "Building Slide 5 - Content 3..."
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="学习进度 5/7" --prop font="Microsoft YaHei" --prop size=10 --prop color=B2BEC3 --prop align=right --prop x=28cm --prop y=0.5cm --prop width=5cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FF6B6B --prop opacity=0.1 --prop x=0cm --prop y=0cm --prop width=3cm --prop height=19.05cm

for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=0.5cm --prop y=$((i))cm --prop width=0.35cm --prop height=0.35cm
  officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.25 --prop x=1.5cm --prop y=$((i+1))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.2 --prop x=2.2cm --prop y=$((i+2))cm --prop width=0.25cm --prop height=0.25cm
done

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFE66D --prop x=5cm --prop y=1cm --prop width=2cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="第三章" --prop font="Microsoft YaHei" --prop size=12 --prop color=2D3436 --prop align=center --prop x=5cm --prop y=1.1cm --prop width=2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="常见沟通障碍与解决" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=2D3436 --prop align=left --prop x=5cm --prop y=2.2cm --prop width=20cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="COMMUNICATION BARRIERS & SOLUTIONS" --prop font="Arial Black" --prop size=12 --prop color=FFE66D --prop align=left --prop x=5cm --prop y=3.8cm --prop width=25cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=5cm --prop y=5cm --prop width=9cm --prop height=6.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=5cm --prop y=5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.15 --prop x=7.5cm --prop y=6cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="信息失真" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2D3436 --prop align=center --prop x=5cm --prop y=9.2cm --prop width=9cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="信息在传递过程中被误解或遗漏" --prop font="Microsoft YaHei" --prop size=11 --prop color=636E72 --prop align=center --prop x=5.5cm --prop y=10.2cm --prop width=8cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=15cm --prop y=5cm --prop width=9cm --prop height=6.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=15cm --prop y=5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.15 --prop x=17.5cm --prop y=6cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="情绪干扰" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2D3436 --prop align=center --prop x=15cm --prop y=9.2cm --prop width=9cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="负面情绪影响沟通效果" --prop font="Microsoft YaHei" --prop size=11 --prop color=636E72 --prop align=center --prop x=15.5cm --prop y=10.2cm --prop width=8cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=25cm --prop y=5cm --prop width=9cm --prop height=6.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=25cm --prop y=5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.2 --prop x=27.5cm --prop y=6cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="文化差异" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2D3436 --prop align=center --prop x=25cm --prop y=9.2cm --prop width=9cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="不同背景导致的理解偏差" --prop font="Microsoft YaHei" --prop size=11 --prop color=636E72 --prop align=center --prop x=25.5cm --prop y=10.2cm --prop width=8cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="解决方案" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=left --prop x=5cm --prop y=12.5cm --prop width=10cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop x=5cm --prop y=13.5cm --prop width=5cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="确认理解" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=5cm --prop y=13.7cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=4ECDC4 --prop x=11cm --prop y=13.5cm --prop width=5cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="情绪管理" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=11cm --prop y=13.7cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFE66D --prop x=17cm --prop y=13.5cm --prop width=5cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="尊重差异" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=17cm --prop y=13.7cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop line=FF6B6B --prop lineWidth=1pt --prop x=23cm --prop y=13.5cm --prop width=5cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="主动反馈" --prop font="Microsoft YaHei" --prop size=14 --prop color=FF6B6B --prop align=center --prop x=23cm --prop y=13.7cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop line=4ECDC4 --prop lineWidth=1pt --prop x=29cm --prop y=13.5cm --prop width=4.87cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="持续学习" --prop font="Microsoft YaHei" --prop size=14 --prop color=4ECDC4 --prop align=center --prop x=29cm --prop y=13.7cm --prop width=4.87cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFF9E6 --prop line=FFE66D --prop lineWidth=1pt --prop x=5cm --prop y=15.5cm --prop width=28.87cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="关键提示：" --prop font="Microsoft YaHei" --prop size=12 --prop bold=true --prop color=FF6B6B --prop align=left --prop x=6cm --prop y=16cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="沟通是一个双向过程，需要双方共同努力才能达到最佳效果。保持开放心态，持续改进沟通方式。" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=10.5cm --prop y=16cm --prop width=22cm --prop height=1.5cm --prop fill=none
echo "Slide 5 complete"

# SLIDE 6 - PRACTICE
echo "Building Slide 6 - Practice..."
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="学习进度 6/7" --prop font="Microsoft YaHei" --prop size=10 --prop color=B2BEC3 --prop align=right --prop x=28cm --prop y=0.5cm --prop width=5cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.1 --prop x=28cm --prop y=2cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.1 --prop x=30cm --prop y=10cm --prop width=6cm --prop height=6cm

for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.25 --prop x=1cm --prop y=$((i))cm --prop width=0.35cm --prop height=0.35cm
  officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.2 --prop x=2cm --prop y=$((i+1))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.25 --prop x=3cm --prop y=$((i+2))cm --prop width=0.25cm --prop height=0.25cm
done

officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=4ECDC4 --prop x=5cm --prop y=1cm --prop width=3cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="互动练习" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=5cm --prop y=1.1cm --prop width=3cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="知识检测" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=2D3436 --prop align=left --prop x=5cm --prop y=2.2cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="KNOWLEDGE CHECK" --prop font="Arial Black" --prop size=12 --prop color=4ECDC4 --prop align=left --prop x=5cm --prop y=3.8cm --prop width=15cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=5cm --prop y=5cm --prop width=26cm --prop height=4cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=5cm --prop y=5cm --prop width=26cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="Q: 以下哪项是有效沟通的关键要素？" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=left --prop x=6cm --prop y=6.5cm --prop width=24cm --prop height=1cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop line=B2BEC3 --prop lineWidth=1pt --prop x=5cm --prop y=10cm --prop width=12cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.15 --prop x=6cm --prop y=10.5cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="A" --prop font="Arial Black" --prop size=16 --prop color=FF6B6B --prop align=center --prop x=6cm --prop y=11cm --prop width=1.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="单向传递信息" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=8.5cm --prop y=11cm --prop width=8cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop line=B2BEC3 --prop lineWidth=1pt --prop x=19cm --prop y=10cm --prop width=12cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.2 --prop x=20cm --prop y=10.5cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="B" --prop font="Arial Black" --prop size=16 --prop color=4ECDC4 --prop align=center --prop x=20cm --prop y=11cm --prop width=1.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="积极倾听与反馈" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=22.5cm --prop y=11cm --prop width=8cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop line=B2BEC3 --prop lineWidth=1pt --prop x=5cm --prop y=13.5cm --prop width=12cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.25 --prop x=6cm --prop y=14cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="C" --prop font="Arial Black" --prop size=16 --prop color=FFE66D --prop align=center --prop x=6cm --prop y=14.5cm --prop width=1.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="使用专业术语" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=8.5cm --prop y=14.5cm --prop width=8cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop line=B2BEC3 --prop lineWidth=1pt --prop x=19cm --prop y=13.5cm --prop width=12cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.2 --prop x=20cm --prop y=14cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="D" --prop font="Arial Black" --prop size=16 --prop color=FF6B6B --prop align=center --prop x=20cm --prop y=14.5cm --prop width=1.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="避免眼神接触" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=22.5cm --prop y=14.5cm --prop width=8cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="点击选择您的答案" --prop font="Microsoft YaHei" --prop size=12 --prop color=B2BEC3 --prop align=center --prop x=5cm --prop y=17cm --prop width=26cm --prop height=0.5cm --prop fill=none
echo "Slide 6 complete"

# SLIDE 7 - SUMMARY
echo "Building Slide 7 - Summary..."
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop opacity=0.15 --prop x=0cm --prop y=0.5cm --prop width=4cm --prop height=18.55cm

for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.3 --prop x=0.5cm --prop y=$((i))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.25 --prop x=1.5cm --prop y=$((i+1))cm --prop width=0.25cm --prop height=0.25cm
  officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=2.5cm --prop y=$((i+2))cm --prop width=0.2cm --prop height=0.2cm
done

officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="课程总结" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=2D3436 --prop align=left --prop x=5cm --prop y=1.5cm --prop width=15cm --prop height=1.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="COURSE SUMMARY" --prop font="Arial Black" --prop size=12 --prop color=FF6B6B --prop align=left --prop x=5cm --prop y=3.5cm --prop width=15cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=5cm --prop y=4.5cm --prop width=26cm --prop height=7cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=5cm --prop y=4.5cm --prop width=26cm --prop height=0.2cm

officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop x=6cm --prop y=5.5cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="理解了沟通的本质和四个核心要素" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=7cm --prop y=5.5cm --prop width=22cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop x=6cm --prop y=7cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="掌握了积极倾听、清晰表达、非语言沟通、有效反馈四大技巧" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=7cm --prop y=7cm --prop width=22cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop x=6cm --prop y=8.5cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="了解了常见沟通障碍及解决方案" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=7cm --prop y=8.5cm --prop width=22cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop x=6cm --prop y=10cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="通过练习巩固了所学知识" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=7cm --prop y=10cm --prop width=22cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="下一步行动" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2D3436 --prop align=left --prop x=5cm --prop y=12.5cm --prop width=10cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop x=5cm --prop y=13.5cm --prop width=8cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="下载课件" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=5cm --prop y=13.8cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=4ECDC4 --prop x=14cm --prop y=13.5cm --prop width=8cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="参加测试" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=14cm --prop y=13.8cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFE66D --prop x=23cm --prop y=13.5cm --prop width=8cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="分享课程" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=2D3436 --prop align=center --prop x=23cm --prop y=13.8cm --prop width=8cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="感谢参与本次培训！" --prop font="Microsoft YaHei" --prop size=14 --prop color=636E72 --prop align=center --prop x=5cm --prop y=16cm --prop width=26cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.1 --prop x=28cm --prop y=5cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.1 --prop x=30cm --prop y=12cm --prop width=5cm --prop height=5cm
echo "Slide 7 complete"

# Morph transitions
echo "Adding Morph transitions..."
for i in 2 3 4 5 6 7; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

echo "Validating..."
officecli validate "$OUTPUT"
echo "Complete: $OUTPUT"