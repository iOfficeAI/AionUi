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
export interface ExcelSheetData {
  name: string; // 工作表名称 / Sheet name
  data: any[][]; // 单元格数据二维数组 / 2D array of cell values
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[]; // 合并单元格范围 / Merge ranges
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
  raw: any; // 原始 PPTX JSON / Raw PPTX JSON
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
