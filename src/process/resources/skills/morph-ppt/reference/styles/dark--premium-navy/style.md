# 05-premium-navy — 高端藏蓝与金

## 风格概述
深藏蓝底色搭配金色与钢蓝装饰，打造高端企业级视觉语言。

- **场景**: 高端企业、年度战略、董事会汇报
- **情绪**: 权威、精致、高端、值得信赖
- **色调**: 深藏蓝底 + 金色高亮 + 钢蓝辅助

## 配色
| 名称 | 色值 | 用途 |
|------|------|------|
| 深藏蓝 | `0C1B33` | 背景 |
| 浓金 | `C9A84C` | 金色横线、框架、圆点、编号高亮 |
| 纯白 | `FFFFFF` | 标题文字 |
| 中藏蓝 | `1E3A5F` | 竖线、框架底色 |
| 钢蓝 | `8EACC1` | 装饰圆、描述文字 |
| 藏蓝强调 | `2C4F7C` | 卡片底色 |

## 字体
| 角色 | 字体 | 字号 | 颜色 |
|------|------|------|------|
| 大标题 | Segoe UI Black | 60pt | FFFFFF |
| 副标题 | Segoe UI Light | 24pt | C9A84C |
| 卡片编号 | Segoe UI Black | 48pt | C9A84C |
| 卡片标题 | Segoe UI Black | 22pt | FFFFFF |
| 卡片描述 | Segoe UI Light | 14pt | 8EACC1 |
| 数据数字 | Segoe UI Black | 54-64pt | FFFFFF |
| 辅助说明 | Segoe UI Light | 16-18pt | 8EACC1 |

## 设计手法
- **金色细线分隔**：水平金线 (height=0.08cm)、垂直藏蓝线 (width=0.06cm) 构建精致网格
- **半透明框架**：`roundRect` 作为卡片底色 (opacity 0.12-0.45)，金色和藏蓝交替
- **金色圆点点缀**：小 `ellipse` 作为视觉锚点，金色 opacity 0.6，白色 opacity 0.3
- **深色背景上的高对比**：白色标题 + 金色副标题，在深藏蓝上形成强烈层次
- **Morph 动画**：金线和框架在页面间重新排列，框架变形为数据区域背景

## Scene Actors
共 8 个场景元素，每页位置不同：

| 名称 | preset | fill | opacity | 典型尺寸 | 说明 |
|------|--------|------|---------|----------|------|
| `!!bar-gold` | rect | C9A84C | 1.0 | 18cm x 0.08cm | 金色水平线 |
| `!!bar-navy` | rect | 1E3A5F | 1.0 | 0.06cm x 14cm | 藏蓝垂直线 |
| `!!frame-gold` | roundRect | C9A84C | 0.15 | 8cm x 6cm | 金色半透明框 |
| `!!frame-navy` | roundRect | 1E3A5F | 0.30 | 10cm x 6cm | 藏蓝半透明框 |
| `!!accent-gold` | ellipse | C9A84C | 0.20 | 3cm x 3cm | 金色装饰圆 |
| `!!accent-steel` | ellipse | 8EACC1 | 0.15 | 4cm x 4cm | 钢蓝装饰圆 |
| `!!dot-gold` | ellipse | C9A84C | 0.60 | 1.5cm x 1.5cm | 金色小圆点 |
| `!!dot-white` | ellipse | FFFFFF | 0.30 | 1cm x 1cm | 白色小圆点 |

## 页面结构
共 5 页，Slide 2-5 设置 `transition=morph`：

| 页面 | 类型 | 说明 |
|------|------|------|
| Slide 1 | Hero | 居中大标题白色 + 金色副标题，金线横贯画面中部 |
| Slide 2 | Statement | 大字陈述，金线和框架重新排列 |
| Slide 3 | 3-Column Pillars | 金线作为栏顶分隔，三个 roundRect 卡片 (opacity 0.12) 并排，编号 + 标题 + 描述 |
| Slide 4 | Metrics / Performance | 金色框架放大为数据背景区，展示 $128M / 34% / #1 等指标 |
| Slide 5 | CTA / Closing | 框架收缩为角落装饰，居中大标题 + 金色副标题 |

## 参考脚本
完整构建脚本见 `build.sh`。
**推荐阅读以下页面理解核心设计手法**：
- **Slide 1 (Hero)** — 8 个 scene actor 的初始布局，金线 + 框架 + 圆点的组合
- **Slide 3 (Pillars)** — 框架变形为卡片底色，金线变为栏顶分隔线
- **Slide 4 (Metrics)** — 框架放大变色为数据区域背景的高级技法

不需要全部阅读，选 2-3 个代表页面即可。
