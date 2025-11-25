/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ConversionResult<T> {
  success: boolean; // 是否成功 / Whether successful
  data?: T; // 转换结果数据 / Conversion result data
  error?: string; // 错误信息 / Error message
}

// Excel 中间格式 (JSON) / Excel Intermediate Format (JSON)
export interface ExcelSheetImage {
  row: number; // 图片所在行（从 0 开始）/ Image row index (0-based)
  col: number; // 图片所在列（从 0 开始）/ Image column index (0-based)
  src: string; // 图片数据（通常为 data URL）/ Image data (typically data URL)
  width?: number; // 预估宽度（像素）/ Estimated width (px)
  height?: number; // 预估高度（像素）/ Estimated height (px)
  alt?: string; // 可选描述 / Optional description
}

export interface ExcelSheetData {
  name: string; // 工作表名称 / Sheet name
  data: any[][]; // 单元格数据二维数组 / 2D array of cell values
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[]; // 合并单元格范围 / Merge ranges
  images?: ExcelSheetImage[]; // 单元格图片信息 / Embedded images info
}

export interface ExcelWorkbookData {
  sheets: ExcelSheetData[]; // 工作表列表 / List of sheets
}

// PowerPoint 中间格式 (PPTX JSON 结构) / PowerPoint Intermediate Format (PPTX JSON structure)
export interface PPTSlideData {
  slideNumber: number;
  content: any; // PPTX JSON 结构 / PPTX JSON structure
}

export interface PPTJsonData {
  slides: PPTSlideData[];
  raw?: any; // 原始 PPTX JSON（可选，通常不需要传递给前端）/ Raw PPTX JSON (optional, usually not needed in frontend)
}

export interface ConversionServiceApi {
  // Word
  wordToMarkdown: (filePath: string) => Promise<ConversionResult<string>>;
  markdownToWord: (markdown: string, targetPath: string) => Promise<ConversionResult<void>>;

  // Excel
  excelToJson: (filePath: string) => Promise<ConversionResult<ExcelWorkbookData>>;
  jsonToExcel: (data: ExcelWorkbookData, targetPath: string) => Promise<ConversionResult<void>>;

  // PowerPoint
  pptToJson: (filePath: string) => Promise<ConversionResult<PPTJsonData>>;

  // PDF
  markdownToPdf: (markdown: string, targetPath: string) => Promise<ConversionResult<void>>;
  htmlToPdf: (html: string, targetPath: string) => Promise<ConversionResult<void>>;
}

// 文档转换目标格式 / Supported document conversion targets
export type DocumentConversionTarget = 'markdown' | 'excel-json' | 'ppt-json';

// 统一的文档转换请求参数 / Unified document conversion request payload
export interface DocumentConversionRequest {
  filePath: string; // 待转换文件的绝对路径 / Absolute file path to convert
  to: DocumentConversionTarget; // 目标格式 / Desired target format
}

// 根据目标格式返回不同的数据类型 / Result payload differs per target format
export type DocumentConversionResponse = { to: 'markdown'; result: ConversionResult<string> } | { to: 'excel-json'; result: ConversionResult<ExcelWorkbookData> } | { to: 'ppt-json'; result: ConversionResult<PPTJsonData> };
