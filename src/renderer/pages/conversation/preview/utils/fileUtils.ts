/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewContentType } from '@/common/types/preview';

/**
 * 文件扩展名到内容类型的映射配置
 * Mapping configuration from file extensions to content types
 */
export const FILE_EXTENSION_MAP: Record<PreviewContentType, readonly string[]> = {
  markdown: ['md', 'markdown'],
  html: ['html', 'htm'],
  pdf: ['pdf'],
  word: ['doc', 'docx'],
  ppt: ['ppt', 'pptx'],
  excel: ['xls', 'xlsx'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'],
  code: [], // code 作为默认类型，不需要显式映射 / code is the default type, no explicit mapping needed
  diff: [], // diff 类型通常通过其他方式判断 / diff type is usually determined by other means
  url: [], // url 类型用于网页预览，无扩展名映射 / url type for web preview, no extension mapping
};

/**
 * 从文件路径中提取文件扩展名
 * Extract file extension from file path
 *
 * @param filePath - 文件路径 / File path
 * @returns 文件扩展名（小写），如果没有扩展名则返回空字符串 / File extension in lowercase, or empty string if no extension
 *
 * @example
 * ```ts
 * getFileExtension('document.pdf') // => 'pdf'
 * getFileExtension('archive.tar.gz') // => 'gz'
 * getFileExtension('noextension') // => ''
 * getFileExtension('image.PNG') // => 'png'
 * ```
 */
export const getFileExtension = (filePath: string): string => {
  if (!filePath) return '';

  const lastDotIndex = filePath.lastIndexOf('.');
  // 没有点号，或点号在最后（如 "file."），返回空字符串
  // No dot, or dot at the end (e.g., "file."), return empty string
  if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
    return '';
  }

  return filePath.substring(lastDotIndex + 1).toLowerCase();
};

/**
 * 根据文件扩展名确定预览内容类型
 * Determine preview content type based on file extension
 *
 * @param filePath - 文件路径 / File path
 * @returns 预览内容类型 / Preview content type
 *
 * @example
 * ```ts
 * getContentTypeByExtension('README.md') // => 'markdown'
 * getContentTypeByExtension('index.html') // => 'html'
 * getContentTypeByExtension('report.pdf') // => 'pdf'
 * getContentTypeByExtension('script.ts') // => 'code'
 * getContentTypeByExtension('image.png') // => 'image'
 * ```
 */
export const getContentTypeByExtension = (filePath: string): PreviewContentType => {
  const ext = getFileExtension(filePath);
  if (!ext) return 'code'; // 没有扩展名，默认为 code / No extension, default to code

  // 遍历映射表查找匹配的内容类型 / Iterate through mapping to find matching content type
  for (const [contentType, extensions] of Object.entries(FILE_EXTENSION_MAP)) {
    if (extensions.includes(ext)) {
      return contentType as PreviewContentType;
    }
  }

  // 未找到匹配的扩展名，默认为 code / No matching extension found, default to code
  return 'code';
};

/**
 * 检查文件是否为图片类型
 * Check if file is an image type
 *
 * @param filePath - 文件路径 / File path
 * @returns 是否为图片 / Whether it's an image
 */
export const isImageFile = (filePath: string): boolean => {
  return getContentTypeByExtension(filePath) === 'image';
};

/**
 * 检查文件是否为文本类型（可编辑）
 * Check if file is a text type (editable)
 *
 * @param filePath - 文件路径 / File path
 * @returns 是否为文本类型 / Whether it's a text type
 */
export const isTextFile = (filePath: string): boolean => {
  const contentType = getContentTypeByExtension(filePath);
  return ['markdown', 'html', 'code'].includes(contentType);
};

/**
 * 检查文件是否为 Office 文档类型
 * Check if file is an Office document type
 *
 * @param filePath - 文件路径 / File path
 * @returns 是否为 Office 文档 / Whether it's an Office document
 */
export const isOfficeFile = (filePath: string): boolean => {
  const contentType = getContentTypeByExtension(filePath);
  return ['word', 'excel', 'ppt'].includes(contentType);
};
