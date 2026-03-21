# 01-mono-line — 极简线条

## 风格概述
用极细线条和小圆点构建纯黑白极简空间，以留白与几何秩序传递专业感。

- **场景**: 极简商务、学术报告、咨询提案
- **情绪**: 冷静、克制、专业
- **色调**: 纯黑白 + 中灰点缀

## 配色
| 名称 | 色值 | 用途 |
|------|------|------|
| 纯白 | `FFFFFF` | 背景 |
| 近黑 | `1A1A1A` | 主线条、标题文字、主圆点 |
| 中灰 | `C8C8C8` | 副线条、副标题文字、副圆点 |

## 字体
| 角色 | 字体 | 字号 | 颜色 |
|------|------|------|------|
| 大标题 | Segoe UI Light | 54pt | 1A1A1A |
| 副标题 | Segoe UI | 20pt | C8C8C8 |
| Statement | Segoe UI Light | 64pt | 1A1A1A |
| 编号 | Segoe UI Light | 40pt | C8C8C8 |
| 栏目标题 | Segoe UI Light | 28pt | 1A1A1A |
| 数据数字 | Segoe UI Light | 54pt | 1A1A1A |
| 数据标签 | Segoe UI | 16pt | C8C8C8 |

## 设计手法
- **极细矩形模拟线条**：水平线 height=0.05cm / 0.03cm，垂直线 width=0.05cm / 0.03cm，用 `rect` preset 实现
- **小椭圆作为装饰圆点**：1cm / 0.8cm 的 `ellipse`，黑或灰
- **大量留白**：白色背景上仅靠线条分割空间
- **Morph 动画**：线条在页面间滑动、伸缩改变长度和位置；圆点漂移至新位置
- **隐藏元素 off-canvas**：文本元素初始放置在画布外 (x=36cm)，通过 morph 滑入可视区

## Scene Actors
共 6 个场景元素，每页位置不同，通过 Morph 过渡产生动画：

| 名称 | preset | fill | 典型尺寸 | 说明 |
|------|--------|------|----------|------|
| `!!line-h-top` | rect | 1A1A1A | 20cm x 0.05cm | 水平主线 |
| `!!line-h-mid` | rect | C8C8C8 | 15cm x 0.03cm | 水平副线 |
| `!!line-v-left` | rect | 1A1A1A | 0.05cm x 12cm | 垂直主线 |
| `!!line-v-right` | rect | C8C8C8 | 0.03cm x 8cm | 垂直副线 |
| `!!dot-accent-1` | ellipse | 1A1A1A | 1cm x 1cm | 主圆点 |
| `!!dot-accent-2` | ellipse | C8C8C8 | 0.8cm x 0.8cm | 副圆点 |

## 页面结构
共 5 页，Slide 2-5 设置 `transition=morph`：

| 页面 | 类型 | 说明 |
|------|------|------|
| Slide 1 | Hero | 大标题 + 副标题居左，线条构建不对称框架 |
| Slide 2 | Statement | 居中大字陈述，线条交叉于画面中央 |
| Slide 3 | 3-Column Pillars | 线条作为列分隔，编号 01/02/03 + 标题，三列并排 |
| Slide 4 | Metrics / Evidence | 数据展示，左侧大数字 + 右侧指标，线条分区 |
| Slide 5 | CTA / Closing | 线条收拢为画面边框，居中 CTA 文字 + 联系方式 |

## 参考脚本
完整构建脚本见 `build.sh`。
**推荐阅读以下页面理解核心设计手法**：
- **Slide 1 (Hero)** — 展示线条+圆点的初始布局，以及 off-canvas 文本元素的放置方式
- **Slide 3 (Pillars)** — 线条如何变形为列分隔符，三列内容的网格排布
- **Slide 5 (CTA)** — 线条收拢为全画面边框的动画效果

不需要全部阅读，选 2-3 个代表页面即可。
