# PDF to PPT Converter Spec

## Overview

A tool to convert PDF documents into editable PowerPoint presentations (`.pptx`).

## Core Features

1.  **Input**: PDF file.
2.  **Watermark Removal**:
    - **Auto-ROI**: Automatically detect static dark regions (watermarks) by analyzing variance across pages.
    - **Hybrid Inpainting**: Use OpenCV inpainting to remove the detected watermark and fill with background color.
3.  **Output**:
    - 16:9 Aspect Ratio.
    - Fit-to-slide (no cropping).
    - High-quality image rendering (2x zoom).

## Target User Experience (Gamified)

- **Visual Metaphor**: A futuristic data purification facility.
- **Interaction**: Drag and drop "contaminated" (watermarked) files into a "Core".
- **Feedback**: Real-time visualization of the scanning and cleaning process.
- **Result**: A "purified" PPTX crystal/block.
