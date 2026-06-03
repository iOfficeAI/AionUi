/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { getFileExtension } from '@/renderer/pages/conversation/Preview/fileUtils';

type IconNode = Pick<IDirOrFile, 'name' | 'relativePath'>;

export const ICON_PREFIX = 'vscode-icons';
const DEFAULT_FILE_ICON = 'default-file';
const FOLDER_ICON = 'default-folder';
const FOLDER_OPEN_ICON = 'default-folder-opened';

/**
 * Map a lowercase file extension to a vscode-icons icon name (without prefix).
 * Only the icons bundled in `vscodeIconsData.json` may be referenced here.
 */
const EXTENSION_TO_ICON: Record<string, string> = {
  // TypeScript / JavaScript
  ts: 'file-type-typescript',
  mts: 'file-type-typescript',
  cts: 'file-type-typescript',
  tsx: 'file-type-reactts',
  js: 'file-type-js',
  mjs: 'file-type-js',
  cjs: 'file-type-js',
  jsx: 'file-type-reactjs',
  // Web
  json: 'file-type-json',
  html: 'file-type-html',
  htm: 'file-type-html',
  css: 'file-type-css',
  scss: 'file-type-scss',
  sass: 'file-type-scss',
  vue: 'file-type-vue',
  // Docs / markup
  md: 'file-type-markdown',
  markdown: 'file-type-markdown',
  mdown: 'file-type-markdown',
  mkd: 'file-type-markdown',
  txt: 'file-type-text',
  log: 'file-type-log',
  xml: 'file-type-xml',
  yaml: 'file-type-yaml',
  yml: 'file-type-yaml',
  toml: 'file-type-toml',
  ini: 'file-type-ini',
  cfg: 'file-type-ini',
  conf: 'file-type-ini',
  sql: 'file-type-sql',
  diff: 'file-type-diff',
  patch: 'file-type-diff',
  // Office
  pdf: 'file-type-pdf2',
  doc: 'file-type-word',
  docx: 'file-type-word',
  odt: 'file-type-word',
  xls: 'file-type-excel',
  xlsx: 'file-type-excel',
  ods: 'file-type-excel',
  csv: 'file-type-excel',
  ppt: 'file-type-powerpoint',
  pptx: 'file-type-powerpoint',
  odp: 'file-type-powerpoint',
  // Images
  png: 'file-type-image',
  jpg: 'file-type-image',
  jpeg: 'file-type-image',
  gif: 'file-type-image',
  bmp: 'file-type-image',
  ico: 'file-type-image',
  tif: 'file-type-image',
  tiff: 'file-type-image',
  avif: 'file-type-image',
  webp: 'file-type-image',
  svg: 'file-type-svg',
  // Languages
  py: 'file-type-python',
  go: 'file-type-go',
  rs: 'file-type-rust',
  java: 'file-type-java',
  c: 'file-type-c',
  h: 'file-type-cheader',
  cpp: 'file-type-cpp',
  cc: 'file-type-cpp',
  cxx: 'file-type-cpp',
  hpp: 'file-type-cpp',
  cs: 'file-type-csharp',
  php: 'file-type-php',
  rb: 'file-type-ruby',
  swift: 'file-type-swift',
  kt: 'file-type-kotlin',
  kts: 'file-type-kotlin',
  sh: 'file-type-shell',
  bash: 'file-type-shell',
  zsh: 'file-type-shell',
  // Git
  gitignore: 'file-type-git',
  gitattributes: 'file-type-git',
  gitmodules: 'file-type-git',
  // Archives
  zip: 'file-type-zip',
  tar: 'file-type-zip',
  gz: 'file-type-zip',
  rar: 'file-type-zip',
  '7z': 'file-type-zip',
  // Media
  mp4: 'file-type-video',
  mov: 'file-type-video',
  avi: 'file-type-video',
  mkv: 'file-type-video',
  webm: 'file-type-video',
  mp3: 'file-type-audio',
  wav: 'file-type-audio',
  flac: 'file-type-audio',
  ogg: 'file-type-audio',
  m4a: 'file-type-audio',
  // Fonts / binary
  ttf: 'file-type-font',
  otf: 'file-type-font',
  woff: 'file-type-font',
  woff2: 'file-type-font',
  exe: 'file-type-binary',
  bin: 'file-type-binary',
  dll: 'file-type-binary',
  so: 'file-type-binary',
  dylib: 'file-type-binary',
  wasm: 'file-type-binary',
};

/**
 * Resolve the lowercase extension for a node, preferring its name and
 * falling back to its relative path.
 */
export const getNodeIconExtension = (node: IconNode): string => {
  return getFileExtension(node.name || node.relativePath || '');
};

/**
 * vscode-icons icon name (without the `vscode-icons:` prefix) for a file node.
 * Unknown extensions fall back to the generic file icon.
 */
export const getFileIconName = (node: IconNode): string => {
  const ext = getNodeIconExtension(node);
  return EXTENSION_TO_ICON[ext] ?? DEFAULT_FILE_ICON;
};

/** vscode-icons folder icon name, reflecting expanded state. */
export const getFolderIconName = (expanded: boolean): string => {
  return expanded ? FOLDER_OPEN_ICON : FOLDER_ICON;
};
