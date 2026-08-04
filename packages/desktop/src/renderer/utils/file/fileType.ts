/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewContentType } from '@/common/types/office/preview';

interface FileTypeInfo {
  contentType: PreviewContentType;
  editable: boolean;
  language: string;
}

// 扩展名到类型的直接映射 / Direct extension to type mapping
//
// ⚠️ Must stay in step with `FILE_EXTENSION_MAP` in
// `pages/conversation/Preview/fileUtils.ts`. They are two implementations of the
// same judgement serving different entry points (this one: diff cards / message
// file changes; that one: explorer + local-file links), so a mapping that lands in
// only one makes the same file open differently depending on where it was clicked.
/**
 * Exported for the consistency test that checks this table against
 * `FILE_EXTENSION_MAP`. Read it for the key set only — resolution must go through
 * {@link getFileTypeInfo} so the fallback applies.
 */
export const EXTENSION_MAP: Record<string, FileTypeInfo> = {
  // Markdown
  md: { contentType: 'markdown', editable: true, language: 'markdown' },
  markdown: { contentType: 'markdown', editable: true, language: 'markdown' },
  mdown: { contentType: 'markdown', editable: true, language: 'markdown' },
  mkd: { contentType: 'markdown', editable: true, language: 'markdown' },
  // HTML
  html: { contentType: 'html', editable: true, language: 'html' },
  htm: { contentType: 'html', editable: true, language: 'html' },
  // Diff
  diff: { contentType: 'diff', editable: false, language: 'diff' },
  patch: { contentType: 'diff', editable: false, language: 'diff' },
  // PDF
  pdf: { contentType: 'pdf', editable: false, language: 'pdf' },
  // Office — only the OOXML formats officecli actually renders
  pptx: { contentType: 'ppt', editable: false, language: 'ppt' },
  docx: { contentType: 'word', editable: false, language: 'word' },
  xlsx: { contentType: 'excel', editable: false, language: 'excel' },
  // CSV is plain text (and officecli rejects it), so it renders as text
  csv: { contentType: 'csv', editable: true, language: 'csv' },
  // Identifiable but unrenderable: legacy Office binaries, ODF, macro-enabled
  // Office (officecli's watch path takes only pptx/docx/xlsx), and HEIC (no HEVC
  // decoder in Chromium). See FILE_EXTENSION_MAP for the full reasoning.
  doc: { contentType: 'unsupported', editable: false, language: 'doc' },
  xls: { contentType: 'unsupported', editable: false, language: 'xls' },
  ppt: { contentType: 'unsupported', editable: false, language: 'ppt' },
  odt: { contentType: 'unsupported', editable: false, language: 'odt' },
  ods: { contentType: 'unsupported', editable: false, language: 'ods' },
  odp: { contentType: 'unsupported', editable: false, language: 'odp' },
  docm: { contentType: 'unsupported', editable: false, language: 'docm' },
  xlsm: { contentType: 'unsupported', editable: false, language: 'xlsm' },
  pptm: { contentType: 'unsupported', editable: false, language: 'pptm' },
  heic: { contentType: 'unsupported', editable: false, language: 'heic' },
  // Image
  png: { contentType: 'image', editable: false, language: 'image' },
  jpg: { contentType: 'image', editable: false, language: 'image' },
  jpeg: { contentType: 'image', editable: false, language: 'image' },
  gif: { contentType: 'image', editable: false, language: 'image' },
  bmp: { contentType: 'image', editable: false, language: 'image' },
  webp: { contentType: 'image', editable: false, language: 'image' },
  svg: { contentType: 'image', editable: false, language: 'image' },
  ico: { contentType: 'image', editable: false, language: 'image' },
  tif: { contentType: 'image', editable: false, language: 'image' },
  tiff: { contentType: 'image', editable: false, language: 'image' },
  avif: { contentType: 'image', editable: false, language: 'image' },
};

/**
 * 根据文件名推断内容类型及是否可编辑
 * Determine preview content type and editability from file name
 */
export const getFileTypeInfo = (file_name: string): FileTypeInfo => {
  const ext = file_name.toLowerCase().split('.').pop() || '';
  return EXTENSION_MAP[ext] || { contentType: 'code', editable: true, language: ext || 'text' };
};
