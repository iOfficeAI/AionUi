#!/bin/bash

# AURA COFFEE - Morph PPT Builder

# 1. Initialize PPT
rm -f "AURA_COFFEE.pptx"
officecli create "AURA_COFFEE.pptx"

# 2. Generate JSON using Python
python3 - << 'PYEOF'
import json
import sys

commands = []

def add_slide(idx, transition="none"):
    commands.append({
        "command": "add",
        "parent": "/",
        "type": "slide",
        "props": {
            "background": "111111",
            "transition": transition
        }
    })

def add_shape(slide_idx, name, props):
    base_props = {"name": name, "preset": "rect", "fill": "none", "line": "none", "font": "Helvetica"}
    base_props.update(props)
    commands.append({
        "command": "add",
        "parent": f"/slide[{slide_idx}]",
        "type": "shape",
        "props": base_props
    })

# --- Actor Data Registry (to keep text consistent for ghosting) ---
ACTOR_TEXTS = {
    "!!brand-title": "AURA COFFEE",
    "!!brand-sub": "纯 粹 之 境 | 极简高级精品咖啡",
    "!!statement-main": "少即是多，剥离繁杂，只为一杯纯粹好咖啡。",
    "!!statement-sub": "在喧嚣的都市中，我们坚持做减法。\n拒绝过度包装与人工添加，让咖啡回归最本真的风味，\n这是 AURA 的美学，也是对品质的极致专注。",
    "!!pillar-title": "三大核心原则",
    "!!box1-title": "01. 严苛寻豆",
    "!!box1-desc": "深入埃塞俄比亚、哥伦比亚等原产地，仅甄选海拔 1500 米以上的 SCA 85+ 级精品生豆。",
    "!!box2-title": "02. 精准烘焙",
    "!!box2-desc": "采用德国 Probat 烘焙机，结合气象数据微调曲线，激发每一支豆子的风土之味。",
    "!!box3-title": "03. 科学萃取",
    "!!box3-desc": "精准控制 93°C 水温与 9 Bar 压力，金杯法则护航，确保每一杯出品的稳定与完美。",
    "!!ev-number": "1%",
    "!!ev-title": "全球前 1% 极微批次特选",
    "!!ev-desc1": "• 年度限量供应 500kg 庄园级瑰夏",
    "!!ev-desc2": "• 100% 环保可降解极简材质包装",
    "!!ev-desc3": "• 多位 Q-Grader 国际品鉴师严格把控",
    "!!cta-title": "品味纯粹，即刻启程",
    "!!cta-web": "www.auracoffee.com",
    "!!cta-email": "partner@auracoffee.com"
}

# Default ghost properties
def ghost(name):
    return {
        "x": "36cm", "y": "0cm", "width": "1cm", "height": "1cm",
        "text": ACTOR_TEXTS.get(name, ""),
        "color": "000000", "size": "10",
        "fill": "none" if "line" not in name else "000000",
        "opacity": "0"
    }

# All actors list
ALL_ACTORS = [
    "!!deco-line", "!!brand-title", "!!brand-sub",
    "!!statement-main", "!!statement-sub",
    "!!pillar-title", 
    "!!box1-line", "!!box1-title", "!!box1-desc",
    "!!box2-line", "!!box2-title", "!!box2-desc",
    "!!box3-line", "!!box3-title", "!!box3-desc",
    "!!ev-number", "!!ev-title", "!!ev-desc1", "!!ev-desc2", "!!ev-desc3",
    "!!cta-title", "!!cta-web", "!!cta-email"
]

# Slide 1: Hero
s1_active = {
    "!!deco-line": {"x": "4cm", "y": "8.5cm", "width": "2cm", "height": "0.1cm", "fill": "D4AF37"},
    "!!brand-title": {"x": "4cm", "y": "9cm", "width": "25cm", "height": "3cm", "text": ACTOR_TEXTS["!!brand-title"], "size": "60", "color": "FFFFFF", "bold": "true"},
    "!!brand-sub": {"x": "4.2cm", "y": "12cm", "width": "25cm", "height": "1cm", "text": ACTOR_TEXTS["!!brand-sub"], "size": "16", "color": "888888", "lineSpacing": "1.5"}
}

# Slide 2: Statement
s2_active = {
    "!!brand-title": {"x": "4cm", "y": "2cm", "width": "10cm", "height": "1cm", "text": ACTOR_TEXTS["!!brand-title"], "size": "14", "color": "555555", "bold": "true"},
    "!!deco-line": {"x": "4cm", "y": "7cm", "width": "1cm", "height": "0.1cm", "fill": "D4AF37"},
    "!!statement-main": {"x": "4cm", "y": "8cm", "width": "25cm", "height": "2cm", "text": ACTOR_TEXTS["!!statement-main"], "size": "36", "color": "FFFFFF"},
    "!!statement-sub": {"x": "4cm", "y": "11cm", "width": "20cm", "height": "4cm", "text": ACTOR_TEXTS["!!statement-sub"], "size": "16", "color": "888888", "lineSpacing": "1.8", "valign": "top"}
}

# Slide 3: Pillars
s3_active = {
    "!!brand-title": {"x": "4cm", "y": "2cm", "width": "10cm", "height": "1cm", "text": ACTOR_TEXTS["!!brand-title"], "size": "14", "color": "555555", "bold": "true"},
    "!!deco-line": {"x": "4cm", "y": "4.5cm", "width": "5cm", "height": "0.1cm", "fill": "D4AF37"},
    "!!pillar-title": {"x": "4cm", "y": "3cm", "width": "25cm", "height": "1.5cm", "text": ACTOR_TEXTS["!!pillar-title"], "size": "24", "color": "FFFFFF"},
    "!!box1-line": {"x": "4cm", "y": "7cm", "width": "0.1cm", "height": "7cm", "fill": "333333"},
    "!!box1-title": {"x": "4.5cm", "y": "7cm", "width": "8cm", "height": "1cm", "text": ACTOR_TEXTS["!!box1-title"], "size": "16", "color": "FFFFFF"},
    "!!box1-desc": {"x": "4.5cm", "y": "8.5cm", "width": "7.5cm", "height": "5cm", "text": ACTOR_TEXTS["!!box1-desc"], "size": "14", "color": "888888", "lineSpacing": "1.6", "valign": "top"},
    "!!box2-line": {"x": "13.5cm", "y": "7cm", "width": "0.1cm", "height": "7cm", "fill": "333333"},
    "!!box2-title": {"x": "14cm", "y": "7cm", "width": "8cm", "height": "1cm", "text": ACTOR_TEXTS["!!box2-title"], "size": "16", "color": "FFFFFF"},
    "!!box2-desc": {"x": "14cm", "y": "8.5cm", "width": "7.5cm", "height": "5cm", "text": ACTOR_TEXTS["!!box2-desc"], "size": "14", "color": "888888", "lineSpacing": "1.6", "valign": "top"},
    "!!box3-line": {"x": "23cm", "y": "7cm", "width": "0.1cm", "height": "7cm", "fill": "333333"},
    "!!box3-title": {"x": "23.5cm", "y": "7cm", "width": "8cm", "height": "1cm", "text": ACTOR_TEXTS["!!box3-title"], "size": "16", "color": "FFFFFF"},
    "!!box3-desc": {"x": "23.5cm", "y": "8.5cm", "width": "7.5cm", "height": "5cm", "text": ACTOR_TEXTS["!!box3-desc"], "size": "14", "color": "888888", "lineSpacing": "1.6", "valign": "top"}
}

# Slide 4: Evidence
s4_active = {
    "!!brand-title": {"x": "4cm", "y": "2cm", "width": "10cm", "height": "1cm", "text": ACTOR_TEXTS["!!brand-title"], "size": "14", "color": "555555", "bold": "true"},
    "!!deco-line": {"x": "15cm", "y": "10.5cm", "width": "3cm", "height": "0.1cm", "fill": "D4AF37"},
    "!!ev-number": {"x": "4cm", "y": "7cm", "width": "10cm", "height": "5cm", "text": ACTOR_TEXTS["!!ev-number"], "size": "110", "color": "D4AF37", "bold": "true", "font": "Arial"},
    "!!ev-title": {"x": "4cm", "y": "12cm", "width": "12cm", "height": "2cm", "text": ACTOR_TEXTS["!!ev-title"], "size": "20", "color": "FFFFFF"},
    "!!ev-desc1": {"x": "15cm", "y": "7cm", "width": "15cm", "height": "1.5cm", "text": ACTOR_TEXTS["!!ev-desc1"], "size": "16", "color": "CCCCCC"},
    "!!ev-desc2": {"x": "15cm", "y": "8.5cm", "width": "15cm", "height": "1.5cm", "text": ACTOR_TEXTS["!!ev-desc2"], "size": "16", "color": "CCCCCC"},
    "!!ev-desc3": {"x": "15cm", "y": "12cm", "width": "15cm", "height": "1.5cm", "text": ACTOR_TEXTS["!!ev-desc3"], "size": "16", "color": "CCCCCC"}
}

# Slide 5: CTA
s5_active = {
    "!!deco-line": {"x": "4cm", "y": "7cm", "width": "2cm", "height": "0.1cm", "fill": "D4AF37"},
    "!!cta-title": {"x": "4cm", "y": "8cm", "width": "25cm", "height": "3cm", "text": ACTOR_TEXTS["!!cta-title"], "size": "44", "color": "FFFFFF"},
    "!!brand-title": {"x": "4cm", "y": "12cm", "width": "15cm", "height": "1.5cm", "text": ACTOR_TEXTS["!!brand-title"], "size": "20", "color": "888888", "bold": "true"},
    "!!cta-web": {"x": "4cm", "y": "14cm", "width": "10cm", "height": "1cm", "text": ACTOR_TEXTS["!!cta-web"], "size": "14", "color": "555555"},
    "!!cta-email": {"x": "10cm", "y": "14cm", "width": "10cm", "height": "1cm", "text": ACTOR_TEXTS["!!cta-email"], "size": "14", "color": "555555"}
}

slides_data = [
    ("none", s1_active),
    ("morph", s2_active),
    ("morph", s3_active),
    ("morph", s4_active),
    ("morph", s5_active)
]

for i, (transition, active_dict) in enumerate(slides_data):
    slide_idx = i + 1
    add_slide(slide_idx, transition)
    for actor in ALL_ACTORS:
        if actor in active_dict:
            add_shape(slide_idx, actor, active_dict[actor])
        else:
            add_shape(slide_idx, actor, ghost(actor))

with open('commands.json', 'w') as f:
    json.dump(commands, f)

PYEOF

# 3. Execute batch commands
echo "Executing batch commands..."
cat commands.json | officecli batch "AURA_COFFEE.pptx"

# 4. Clean up
rm commands.json
echo "Build complete."

