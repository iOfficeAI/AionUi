/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const BINARY_EXTENSIONS = new Set([
  '7z',
  'avif',
  'bmp',
  'doc',
  'docx',
  'exe',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'mov',
  'mp3',
  'mp4',
  'odp',
  'ods',
  'odt',
  'pdf',
  'png',
  'ppt',
  'pptx',
  'rar',
  'tif',
  'tiff',
  'webp',
  'xls',
  'xlsx',
  'zip',
]);

const isAbsolutePath = (filePath: string): boolean => filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath);

export const isDiffableWorkspaceFile = (filePath: string): boolean => {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return true;
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
};

export const resolveWorkspaceChangeReadPath = (
  workspace: string,
  fallbackFilePath: string,
  relativePath: string
): string => {
  if (!workspace || !relativePath) return fallbackFilePath;
  if (isAbsolutePath(relativePath)) return relativePath;

  const separator = workspace.includes('\\') ? '\\' : '/';
  const base = workspace.replace(/[\\/]+$/, '');
  const relative = relativePath.replace(/^[\\/]+/, '').replace(/[\\/]+/g, separator);
  return `${base}${separator}${relative}`;
};
