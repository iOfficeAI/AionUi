# 04-earth-organic — 大地与鼠尾草

## 风格概述
以暖色羊皮纸底色搭配有机椭圆和圆角矩形，营造温暖自然的叙事氛围。

- **场景**: 环保、可持续发展、有机品牌、自然主题
- **情绪**: 温暖、真诚、自然、有故事感
- **色调**: 暖棕 + 鼠尾草绿 + 赤土 + 沙金，整体大地色系

## 配色
| 名称 | 色值 | 用途 |
|------|------|------|
| 暖羊皮纸 | `F5F0E8` | 背景 |
| 暖棕 | `8B6F47` | 叶片、鹅卵石、装饰 |
| 鼠尾草绿 | `A8C686` | 叶片、鹅卵石、卡片高亮 |
| 赤土橘 | `D4956B` | 石块、编号高亮 |
| 沙金 | `C2A878` | 石块装饰 |
| 森林绿 | `6B8E6B` | 种子装饰、数据高亮 |
| 奶油白 | `E8D5B0` | 种子装饰 |
| 深棕 (标题) | `3C2415` | 标题文字 |
| 暖灰 (正文) | `6B5B4A` | 正文文字 |
| 柔灰 (辅助) | `9E8E7A` | 辅助说明文字 |

## 字体
| 角色 | 字体 | 字号 | 颜色 |
|------|------|------|------|
| 大标题 | Segoe UI Bold | 64pt | 3C2415 |
| 副标题 | Segoe UI Light | 24pt | 6B5B4A |
| 卡片编号 | Segoe UI Bold | 48pt | D4956B / A8C686 / 6B8E6B |
| 卡片标题 | Segoe UI Bold | 28pt | 3C2415 |
| 卡片描述 | Segoe UI Light | 16pt | 6B5B4A |
| 数据数字 | Segoe UI Bold | 64pt | 各色高亮 |
| 辅助说明 | Segoe UI Light | 14-16pt | 9E8E7A |

## 设计手法
- **有机形状**：用 `ellipse` 模拟叶片和种子 (大椭圆 6-9cm)，用 `roundRect` 模拟石块 (5-7cm)，都带不同 opacity (0.12-0.5)
- **半透明层叠**：多个有机形状以不同透明度重叠，创造自然肌理
- **Morph 动画**：有机形状在页面间缓慢漂移、变换大小，模拟自然界的有机运动
- **Slide 3 卡片化**：三个有机形状变形为 `roundRect` 卡片底色 (opacity 0.12)，形成三列内容区
- **Slide 4 数据叙事**：有机形状放大为数据区背景，数据数字用品牌色高亮

## Scene Actors
共 8 个场景元素，每页位置和形态不同：

| 名称 | preset | fill | opacity | 典型尺寸 | 说明 |
|------|--------|------|---------|----------|------|
| `!!leaf-brown` | ellipse | 8B6F47 | 0.30 | 6cm x 5cm | 棕色叶片 |
| `!!leaf-sage` | ellipse | A8C686 | 0.25 | 8cm x 6cm | 鼠尾草绿叶片 |
| `!!stone-terra` | roundRect | D4956B | 0.20 | 5cm x 4cm | 赤土石块 |
| `!!stone-sand` | roundRect | C2A878 | 0.30 | 7cm x 5cm | 沙金石块 |
| `!!seed-forest` | ellipse | 6B8E6B | 1.0 | 3cm x 2.5cm | 森林绿种子 |
| `!!seed-cream` | ellipse | E8D5B0 | 0.50 | 2cm x 2cm | 奶油色种子 |
| `!!pebble-1` | ellipse | 8B6F47 | 0.40 | 1.5cm x 1.2cm | 小鹅卵石 |
| `!!pebble-2` | ellipse | A8C686 | 0.35 | 1.8cm x 1.5cm | 绿色小鹅卵石 |

## 页面结构
共 5 页，Slide 2-5 设置 `transition=morph`：

| 页面 | 类型 | 说明 |
|------|------|------|
| Slide 1 | Hero | 居中大标题 + 副标题，有机形状散落四周 |
| Slide 2 | Statement | 大字陈述 "Nature Knows Best"，有机形状重新分布 |
| Slide 3 | 3-Column Pillars | 三个有机形状变形为卡片底色 (roundRect opacity 0.12)，编号 01/02/03 + 标题 + 描述 |
| Slide 4 | Metrics / Impact | 有机形状放大为数据区域背景，展示 40%/2M/Carbon Neutral 等数据 |
| Slide 5 | CTA / Closing | 有机形状回归自然散布，居中 CTA + 联系方式 |

## 参考脚本
完整构建脚本见 `build.sh`。
**推荐阅读以下页面理解核心设计手法**：
- **Slide 1 (Hero)** — 8 个有机 scene actor 的初始布局和 opacity 设置
- **Slide 3 (Pillars)** — 有机形状变形为 roundRect 卡片底色的关键技法
- **Slide 4 (Metrics)** — 有机形状放大为数据区域背景的布局方式

不需要全部阅读，选 2-3 个代表页面即可。
