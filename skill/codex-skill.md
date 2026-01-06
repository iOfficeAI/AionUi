name: pdf-to-ppt
description: 去除多页重复水印并将 PDF 批量转换成无水印 PPT（支持自动 ROI 检测 + 自定义 ROI/阈值/版式）。输入、过程、产出统一存储在 `Documents/codex-skills`。

---

# Generic Watermark Removal Pipeline

## 概述

该技能封装了“PDF → 图片 → 自动/手动 ROI 定位 → 颜色融合 + OpenCV Inpaint → Fit 模式 PPT”的流程。默认可自动分析多页间的低方差区域（类似 NotebookLM 水印），也可手动设置 ROI 起点/尺寸/阈值以适配任意固定位置的水印。

## 快速开始

1. **安装依赖**（首次执行）：
   ```bash
   pip install pymupdf opencv-python numpy pillow python-pptx
   ```
2. **运行主脚本**（自动 ROI + Inpaint）：
   ```bash
   python scripts/notebooklm_pipeline.py \
     --pdf /path/to/file.pdf \
     --work-dir /path/to/workdir \
     --ppt-name output.pptx \
     --widescreen
   ```
3. **产物位置**（均在 `--work-dir` 下）：
   - `raw/`：PyMuPDF 渲染的 PNG 原图
   - `mask_preview.png`：多页差分生成的水印掩膜
   - `clean/`：去水印后的图片
   - `output/<ppt-name>`：等比缩放、整图展示的 PPT（默认 16:9）
   - `pages_manifest.json`、`clean_report.json`、`scene_summary.json`：记录页码、掩膜覆盖率、参数及耗时
4. **验证**：抽查 `clean/` 与 PPT 页面；若仍有残影，可增大 `--mask-threshold` 或 `--mask-dilate`，或调整 ROI（见下方“参数&策略”）。

## 参数 & 策略选择

- `--zoom`：PDF 渲染倍率，通常 2.0 足够；若文字模糊可调高。
- `--roi-width-ratio` / `--roi-height-ratio`：水印 ROI 占整图的宽/高比例。默认假设水印在右下角，通过设置 `--roi-x-start` / `--roi-y-start` 可变更起点（0-1 之间）。例如：
  - 右上角水印：`--roi-x-start 0.65 --roi-y-start 0.0`
  - 左下角水印：`--roi-x-start 0.0 --roi-y-start 0.75`
- `--mask-samples`：用于差分的页数；不同平台水印越稳定，可用更少样本。
- `--mask-threshold`：差分灰度阈值，越小掩膜越大；可结合 `doc/analyze_brightness_thresholds.py` 的策略先扫一遍阈值。
- `--mask-dilate`：掩膜膨胀像素；默认 3（源自 NotebookLM 经验），可根据水印宽度/光晕调整。
- `--blur-kernel`：Inpaint 前模糊核大小（奇数），减小色差。
- `--assume-a4` / `--widescreen`：控制 PPT 版式（A4 vs 16:9）。

## 流程细节

1. **PDF → 图片**：`fitz.Matrix(zoom, zoom)` 渲染各页；输出至 `raw/page_XXX.png` 并记录 manifest。
2. **多页共同水印检测**：
   - 根据 ROI 参数裁剪区域，堆叠多张图做中值，再与任意一页做 `absdiff` 得到“各页共有”部分。
   - 阈值 + 开闭运算 + 膨胀得到 `mask_preview.png`；若目标水印位置不同，只需调节 ROI 起点和比例。
3. **颜色融合 + Inpaint**：
   - 先用高斯模糊将掩膜区域替换为邻域均值，避免黑色残影。
   - 再用 `cv2.inpaint(..., INPAINT_TELEA)` 让修复区域与周围纹理自然融合。
   - 生成 `clean_report.json` 记录掩膜覆盖率，便于审计。
4. **PPT 组装**：
   - `python-pptx` + `Pillow` 读取宽高比，按等比缩放居中，保证演示时整图可见。
   - 支持 16:9/4:3/A4，并输出 `scene_summary.json` 记录参数与耗时。

## 常见问题

- **水印不在右下角**：通过 `--roi-x-start`、`--roi-y-start`（或直接减小 ROI 宽高）来定位其它区域；必要时可多次试探并查看 `mask_preview.png`。
- **水印不是黑色**：可先修改 `mask_threshold` 或在脚本中改为 `cv2.inRange` 针对具体 RGB 范围；默认灰度差分对多数深浅水印都有作用。
- **背景被过度抹平**：减小 `--mask-dilate` 或 `--blur-kernel`，确保掩膜只覆盖文字及光晕，不侵入正文。
- **大型 PDF**：可分批运行（更换 `--work-dir` 或拆分 PDF），避免一次性生成过多 PNG。

## Bundled Script

- `scripts/notebooklm_pipeline.py`：主流程脚本，参数可覆盖 ROI 位置、掩膜样本数、阈值、膨胀、版式等。结合 `Documents/doc/*.py` 中的分析脚本（阈值扫描、掩膜测试等），可快速适配不同平台生成的水印。
