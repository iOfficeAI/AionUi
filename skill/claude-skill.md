---
name: pdf-to-ppt
description: 将 PDF 文件转换为 PPT 演示文稿，使用自动定位+混合修复算法去除 NotebookLM 等水印。
---

# PDF to PPT Converter v3.0

将 PDF 文档转换为可演示的 PowerPoint 文件，自动检测并去除常见水印。

## 功能特点

- **PDF 解析**: 使用 PyMuPDF 高清渲染 PDF 页面 (2x zoom)
- **智能水印检测**: 自动定位静态深色区域
- **混合修复**: 背景色填充 + Inpaint 融合
- **多种比例支持**: 16:9 / 4:3 / A4 幻灯片尺寸
- **Fit to Slide**: 图片自适应居中，不裁剪

## 核心算法

采用 **自动定位 + 混合修复 (Auto-Detection & Hybrid Inpainting)** 策略：

### 1. 自动定位 (Auto-ROI)

```
1. 读取前 N 张图片
2. 计算像素级标准差 (低方差 = 静态区域)
3. 计算中值图像 (低亮度 = 深色像素)
4. 锁定 静态 + 深色 区域作为水印 ROI
5. 若未检测到，回退至右下角默认区域
```

### 2. 混合修复 (Hybrid Inpainting)

```
1. 阈值检测 (< 80) 捕捉深色像素
2. 膨胀 (3px) 覆盖边缘
3. 用背景均值填充 Mask 区域（消除黑色源头）
4. Inpaint (Radius=8, Telea) 平滑过渡
```

## 使用方法

### 命令行

```bash
# 基本用法
python3 pdf_to_ppt.py input.pdf

# 指定输出文件
python3 pdf_to_ppt.py input.pdf --output presentation.pptx

# 指定幻灯片比例
python3 pdf_to_ppt.py input.pdf --preset 4:3

# 保留临时文件 (调试用)
python3 pdf_to_ppt.py input.pdf --keep-temp
```

### Python 调用

```python
from pdf_to_ppt import convert_pdf_to_ppt

result = convert_pdf_to_ppt(
    pdf_path="input.pdf",
    output_path="output.pptx",
    preset="16:9"
)
```

## 参数说明

| 参数          | 类型 | 默认值           | 说明                     |
| ------------- | ---- | ---------------- | ------------------------ |
| `pdf_path`    | str  | (必填)           | 输入 PDF 文件路径        |
| `output_path` | str  | output/同名.pptx | 输出 PPT 文件路径        |
| `preset`      | str  | "16:9"           | 幻灯片比例 (16:9/4:3/A4) |
| `keep_temp`   | bool | False            | 是否保留临时文件         |

## 依赖安装

```bash
pip install PyMuPDF opencv-python numpy python-pptx Pillow
```

## 输出目录

默认输出目录: `~/Documents/claude-skills/pdf-to-ppt/output/`

```
pdf-to-ppt/
├── SKILL.md          # 本文件 - Skill 配置
├── pdf_to_ppt.py     # 主脚本 (v3.0)
├── requirements.txt  # 依赖列表
└── output/           # 默认输出目录
```

## 适用场景

- NotebookLM 生成的 PDF 课件转 PPT
- 带水印的培训材料清洗
- PDF 文档转演示格式
- 批量课件格式转换

## 验证标准

1. **无黑块**: 检查输出 PPT 右下角，确认无黑色模糊团块
2. **完整性**: 确认图片内容完整显示，未被 PPT 页面边缘裁剪

## 技术栈

- **PDF 解析**: PyMuPDF (fitz)
- **图像处理**: OpenCV + NumPy
- **PPT 生成**: python-pptx
- **图片读取**: Pillow

## 版本历史

- **v3.0.0** - 自动定位+混合修复（参考 gemini-rules）
- **v2.0.0** - 双模式支持（快速模式 + 高级模式）
- **v1.1.0** - 动态阈值版本，自适应不同背景色
- **v1.0.0** - 初始版本，固定阈值
