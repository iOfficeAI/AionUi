# Rule: PDF 转 PPT 自动化 (智能去水印版)

## 1. 目标 (Objective)

将包含 "NotebookLM" 风格水印（右下角黑色/深色文字）的 PDF 文档转换为无水印的 PowerPoint 演示文稿。
**核心要求：** 水印去除干净无残留，且 PPT 内容完整居中（Fit Mode）。

## 2. 适用场景 (Context)

- **输入:** PDF 文件 (每页为一张图片或包含水印的幻灯片)。
- **特征:** 水印为**静态**（位置固定）且通常为**深色/黑色**文字。
- **输出:** `.pptx` 文件，16:9 宽屏，图片无裁剪。

## 3. 核心算法 (Core Algorithm)

采用 **自动定位 + 混合修复 (Auto-Detection & Hybrid Inpainting)** 策略：

1.  **自动定位 (Auto-ROI):**
    - 读取前 N 张图片，计算像素级**标准差 (Standard Deviation)** 和 **中值 (Median)**。
    - 锁定 **低方差 (静态)** 且 **低亮度 (深色)** 的区域作为水印 ROI，不再局限于右下角。
    - _Fallback:_ 若未检测到明显区域，则回退至右下角默认区域。

2.  **混合修复 (Hybrid Inpainting):**
    - **检测:** 在 ROI 内使用 `cv2.threshold` (< 80) 捕捉深色像素。
    - **扩张:** `cv2.dilate` (3px) 覆盖边缘。
    - **填补:** 用背景均值替换 Mask 区域（消除黑色源头）。
    - **融合:** 使用 `cv2.inpaint` (Radius=8, Telea) 平滑过渡。

## 4. 依赖环境 (Dependencies)

请确保安装以下 Python 库：

```bash
pip install opencv-python numpy pymupdf python-pptx Pillow
```

## 5. 执行脚本 (Implementation)

将以下逻辑保存为 `pdf_to_ppt_cleaner.py` 并在 Rules 中调用。

### 使用方法

```bash
python Documents/gemini-rules/pdf_to_ppt_cleaner.py "/path/to/your/file.pdf"
```

### 代码实现

(见同目录下的 `Documents/gemini-rules/pdf_to_ppt_cleaner.py` 文件)

## 6. 验证标准 (Validation)

1.  **无黑块:** 检查输出 PPT 右下角，确认无黑色模糊团块。
2.  **完整性:** 确认图片内容完整显示，未被 PPT 页面边缘裁剪。
