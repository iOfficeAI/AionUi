/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { conversionService } from '../services/conversionService';

export function initConversionBridge(): void {
  console.log('[ConversionBridge] Initializing conversion bridge...');

  // Word -> Markdown 转换 / Word to Markdown conversion
  ipcBridge.conversion.wordToMarkdown.provider(({ filePath }) => {
    console.log('[ConversionBridge] wordToMarkdown called with:', filePath);
    return conversionService.wordToMarkdown(filePath);
  });

  // Markdown -> Word 转换 / Markdown to Word conversion
  ipcBridge.conversion.markdownToWord.provider(({ markdown, targetPath }) => {
    return conversionService.markdownToWord(markdown, targetPath);
  });

  // Excel -> JSON 转换 / Excel to JSON conversion
  ipcBridge.conversion.excelToJson.provider(({ filePath }) => {
    return conversionService.excelToJson(filePath);
  });

  // JSON -> Excel 转换 / JSON to Excel conversion
  ipcBridge.conversion.jsonToExcel.provider(({ data, targetPath }) => {
    return conversionService.jsonToExcel(data, targetPath);
  });

  // PowerPoint -> JSON 转换 / PowerPoint to JSON conversion
  ipcBridge.conversion.pptToJson.provider(({ filePath }) => {
    console.log('[ConversionBridge] pptToJson called with:', filePath);
    return conversionService.pptToJson(filePath);
  });

  // Markdown -> PDF 转换 / Markdown to PDF conversion
  ipcBridge.conversion.markdownToPdf.provider(({ markdown, targetPath }) => {
    return conversionService.markdownToPdf(markdown, targetPath);
  });

  // HTML -> PDF 转换 / HTML to PDF conversion
  ipcBridge.conversion.htmlToPdf.provider(({ html, targetPath }) => {
    return conversionService.htmlToPdf(html, targetPath);
  });

  console.log('[ConversionBridge] Conversion bridge initialized successfully');
}
