/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { getFileExtension } from '@/renderer/pages/conversation/Preview/fileUtils';

type IconNode = Pick<IDirOrFile, 'name' | 'relativePath'>;

/**
 * The catppuccin file-icon theme ships one flavor per palette. Iconify only
 * hosts the dark "Macchiato" flavor, whose neutral (folder/file) icons wash out
 * on a light background; the light "Latte" flavor is derived from it by a
 * palette color remap (see the bundled JSONs). The two share identical icon
 * names, so only the prefix differs — the caller picks by the active theme.
 */
export const ICON_PREFIX_LIGHT = 'catppuccin-latte';
export const ICON_PREFIX_DARK = 'catppuccin-macchiato';
const DEFAULT_FILE_ICON = 'file';
const FOLDER_ICON = 'folder';
const FOLDER_OPEN_ICON = 'folder-open';

/**
 * Map a lowercase file extension to a catppuccin icon name (without prefix).
 * Only icons bundled in both flavor JSONs (`catppuccinLatte.json` /
 * `catppuccinMacchiato.json`) may be referenced here — the names are identical
 * across flavors.
 */
const EXTENSION_TO_ICON: Record<string, string> = {
  // TypeScript / JavaScript
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript-react',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript-react',
  // Web
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  vue: 'vue',
  // Docs / markup
  md: 'markdown',
  markdown: 'markdown',
  mdown: 'markdown',
  mkd: 'markdown',
  txt: 'text',
  log: 'log',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'config',
  cfg: 'config',
  conf: 'config',
  sql: 'database',
  diff: 'diff',
  patch: 'diff',
  // Office
  pdf: 'pdf',
  doc: 'ms-word',
  docx: 'ms-word',
  odt: 'ms-word',
  xls: 'ms-excel',
  xlsx: 'ms-excel',
  ods: 'ms-excel',
  csv: 'ms-excel',
  ppt: 'ms-powerpoint',
  pptx: 'ms-powerpoint',
  odp: 'ms-powerpoint',
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  bmp: 'image',
  ico: 'image',
  tif: 'image',
  tiff: 'image',
  avif: 'image',
  webp: 'image',
  svg: 'svg',
  // Languages
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c-header',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  // Git
  gitignore: 'git',
  gitattributes: 'git',
  gitmodules: 'git',
  // Archives
  zip: 'zip',
  tar: 'zip',
  gz: 'zip',
  rar: 'zip',
  '7z': 'zip',
  // Media
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  // Fonts / binary
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  exe: 'binary',
  bin: 'binary',
  dll: 'binary',
  so: 'binary',
  dylib: 'binary',
  wasm: 'binary',
};

/**
 * Resolve the lowercase extension for a node, preferring its name and
 * falling back to its relative path.
 */
export const getNodeIconExtension = (node: IconNode): string => {
  return getFileExtension(node.name || node.relativePath || '');
};

/**
 * catppuccin icon name (without the `catppuccin:` prefix) for a file node.
 * Unknown extensions fall back to the generic file icon.
 */
export const getFileIconName = (node: IconNode): string => {
  const ext = getNodeIconExtension(node);
  return EXTENSION_TO_ICON[ext] ?? DEFAULT_FILE_ICON;
};

/** catppuccin folder icon name, reflecting expanded state. */
export const getFolderIconName = (expanded: boolean): string => {
  return expanded ? FOLDER_OPEN_ICON : FOLDER_ICON;
};
