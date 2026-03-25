/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 文档转换桥接模块
 * Document Conversion Bridge Module
 *
 * 负责处理各种办公文档格式的转换请求，通过 IPC 桥接将渲染进程的转换需求
 * 传递给主进程的转换服务进行处理
 *
 * Handles various office document format conversion requests by bridging
 * renderer process conversion needs to the main process conversion service via IPC
 */

import { ipcBridge } from '@/common';
import type { DocumentConversionTarget } from '@/common/types/conversion';
import path from 'path';
import { conversionService } from '../services/conversionService';

// 支持的文件扩展名集合 / Supported file extension sets
const WORD_EXTENSIONS = new Set(['.doc', '.docx']); // Word 文档扩展名 / Word document extensions
const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx']); // Excel 工作簿扩展名 / Excel workbook extensions
const PPT_EXTENSIONS = new Set(['.ppt', '.pptx']); // PowerPoint 演示文稿扩展名 / PowerPoint presentation extensions

/**
 * 生成不支持的转换结果
 * Generate unsupported conversion result
 *
 * @param to - 目标转换格式 / Target conversion format
 * @param message - 错误消息 / Error message
 * @returns 包含错误信息的转换结果 / Conversion result with error information
 */
const unsupportedResult = (to: DocumentConversionTarget, message: string) => ({
  to,
  result: {
    success: false,
    error: message,
  },
});

/**
 * 检查文件扩展名是否在允许的集合中
 * Check if file extension is in the allowed set
 *
 * @param filePath - 文件路径 / File path
 * @param allowed - 允许的扩展名集合 / Set of allowed extensions
 * @returns 文件扩展名是否被允许 / Whether the file extension is allowed
 */
const ensureExtension = (filePath: string, allowed: Set<string>) => {
  const ext = path.extname(filePath).toLowerCase();
  return allowed.has(ext);
};

/**
 * 初始化文档转换桥接
 * Initialize document conversion bridge
 *
 * 注册 IPC 处理器以响应来自渲染进程的文档转换请求
 * 支持以下转换类型：
 * - Word → Markdown
 * - Excel → JSON
 * - PowerPoint → JSON
 *
 * Register IPC handler to respond to document conversion requests from renderer process
 * Supports the following conversion types:
 * - Word → Markdown
 * - Excel → JSON
 * - PowerPoint → JSON
 */
export function initDocumentBridge(): void {
  ipcBridge.document.convert.provider(async ({ filePath, to }) => {
    switch (to) {
      case 'markdown': {
        // Word 文档转 Markdown / Word document to Markdown
        if (!ensureExtension(filePath, WORD_EXTENSIONS)) {
          return unsupportedResult(to, 'Only Word documents can be converted to markdown');
        }
        const result = await conversionService.wordToMarkdown(filePath);
        return { to, result };
      }
      case 'excel-json': {
        // Excel 工作簿转 JSON / Excel workbook to JSON
        if (!ensureExtension(filePath, EXCEL_EXTENSIONS)) {
          return unsupportedResult(to, 'Only Excel workbooks can be converted to JSON');
        }
        const result = await conversionService.excelToJson(filePath);
        return { to, result };
      }
      case 'ppt-json': {
        // PowerPoint 演示文稿转 JSON / PowerPoint presentation to JSON
        if (!ensureExtension(filePath, PPT_EXTENSIONS)) {
          return unsupportedResult(to, 'Only PowerPoint files can be converted to JSON');
        }
        const result = await conversionService.pptToJson(filePath);
        return { to, result };
      }
      default:
        // 不支持的转换格式 / Unsupported conversion format
        return unsupportedResult(to, `Unsupported target format: ${to}`);
    }
  });
}
