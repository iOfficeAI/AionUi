# 08-bold-type — 大字排版

## 风格概述
用超大文字 (200pt/300pt) 替代几何图形作为视觉主角，以编辑排版的张力驱动设计。

- **场景**: 编辑排版、杂志风格、品牌手册
- **情绪**: 大胆、现代、有张力、编辑感
- **色调**: 暖灰底 + 近黑 + 红色强调

## 配色
| 名称 | 色值 | 用途 |
|------|------|------|
| 暖浅灰 | `F2F2F2` | 背景 |
| 近黑 | `1A1A1A` | 标题文字、巨型数字 (opacity 0.06)、细线 |
| 浅灰 | `E8E8E8` | 巨型字母 (opacity 0.08) |
| 红色强调 | `FF3C38` | 红色线条、红色圆点、强调文字 |

## 字体
| 角色 | 字体 | 字号 | 颜色 |
|------|------|------|------|
| 巨型数字 (装饰) | Segoe UI Black | 200pt | 1A1A1A, opacity 0.06 |
| 巨型字母 (装饰) | Segoe UI Black | 300pt | E8E8E8, opacity 0.08 |
| 大标题 | Segoe UI Black | 72pt | 1A1A1A |
| 栏目标题 | Segoe UI Black | 36pt | 1A1A1A |
| 编号 | Segoe UI Black | 48pt | FF3C38 |
| 栏目子标题 | Segoe UI Black | 28pt | 1A1A1A |
| 数据数字 | Segoe UI Black | 72pt | 1A1A1A / FF3C38 |
| 副标题/正文 | Segoe UI Light | 16-24pt | 1A1A1A |
| 强调副标题 | Segoe UI Black | 72pt | FF3C38 |

## 设计手法
- **巨型文字作为 Scene Actor**：用 200pt 数字 (01-05) 和 300pt 字母 (B/N/M/P/X) 替代传统几何装饰，极低 opacity (0.06/0.08) 形成背景纹理
- **红色线条系统**：红色水平线 (height=0.1cm) 和垂直线 (width=0.1cm) 作为编辑网格标记
- **黑色细线**：极细黑线 (height=0.04cm) 作为辅助分隔
- **红色圆点**：1.5cm 红色 `ellipse` 作为视觉标点/焦点
- **每页独立创建**：与其他模板不同，5 页分别创建 (非从 Slide 1 复制)，每页有独立的巨型文字内容
- **Morph 过渡**：巨型数字和字母在相同 `!!name` 下跨页 morph，数字从 01 变到 02 时位置平滑过渡

## Scene Actors
共 6 个场景元素 (每页名称相同但内容不同)：

| 名称 | 类型 | fill | 说明 |
|------|------|------|------|
| `!!giant-num` | text shape | 1A1A1A, opacity 0.06 | 200pt 页码数字 (01/02/03/04/05)，每页位置不同 |
| `!!giant-letter` | text shape | E8E8E8, opacity 0.08 | 300pt 装饰字母 (B/N/M/P/X)，每页位置不同 |
| `!!line-red-h` | rect | FF3C38 | 红色水平线，长度和位置每页变化 |
| `!!line-red-v` | rect | FF3C38 | 红色垂直线，长度和位置每页变化 |
| `!!line-gray-h` | rect | 1A1A1A | 黑色极细线，辅助分隔 |
| `!!dot-red` | ellipse | FF3C38 | 1.5cm 红色圆点，每页漂移至不同位置 |

## 页面结构
共 5 页，Slide 2-5 设置 `transition=morph`：

| 页面 | 类型 | 巨型文字 | 说明 |
|------|------|----------|------|
| Slide 1 | Hero | 01 + B | "MAKE IT BOLD" 大标题左对齐，红线 L 形框住标题区 |
| Slide 2 | Statement | 02 + N | "Less Noise. / More Signal." 双行大字，第二行红色 |
| Slide 3 | 3-Column Pillars | 03 + M | 红线和黑线作为列分隔，三列 Identity/Motion/Print |
| Slide 4 | Evidence / Metrics | 04 + P | 不对称布局，左侧 340+ 大数字，右侧 28/2015，红线分区 |
| Slide 5 | CTA / Closing | 05 + X | 居中 "Get in Touch" + 红色邮箱，红线框住底部 |

## 参考脚本
完整构建脚本见 `build.sh`。
**推荐阅读以下页面理解核心设计手法**：
- **Slide 1 (Hero)** — 巨型数字+字母作为 scene actor 的核心创新，红线 L 形构图
- **Slide 3 (Pillars)** — 红线/黑线作为列分隔符的编辑排版技法
- **Slide 4 (Evidence)** — 不对称数据布局，红色垂直线贯穿全页

不需要全部阅读，选 2-3 个代表页面即可。
