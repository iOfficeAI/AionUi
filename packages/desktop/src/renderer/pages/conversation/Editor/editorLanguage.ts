/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  diff: 'diff',
  go: 'go',
  h: 'cpp',
  hpp: 'cpp',
  html: 'html',
  htm: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  less: 'less',
  lua: 'lua',
  md: 'markdown',
  markdown: 'markdown',
  patch: 'diff',
  php: 'php',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'shell',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'plaintext',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const EDITOR_TEXT_EXTENSIONS = new Set([
  ...Object.keys(LANGUAGE_BY_EXTENSION),
  'env',
  'gitignore',
  'toml',
  'ini',
  'log',
]);

export const EDITOR_MAX_EDITABLE_BYTES = 2 * 1024 * 1024;

export function getEditorFileName(filePath: string | null | undefined): string {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}

export function getEditorExtension(filePath: string | null | undefined): string {
  const fileName = getEditorFileName(filePath).toLowerCase();
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return fileName;
  return fileName.slice(dotIndex + 1);
}

export function inferEditorLanguage(filePath: string | null | undefined): string {
  const extension = getEditorExtension(filePath);
  return LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext';
}

export function isLikelyEditableTextFile(filePath: string | null | undefined): boolean {
  const extension = getEditorExtension(filePath);
  return EDITOR_TEXT_EXTENSIONS.has(extension);
}
