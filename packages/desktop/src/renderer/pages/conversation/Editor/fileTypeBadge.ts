/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small colored letter badges shown beside each open file's name in the tab
 * strip. The single biggest "this is an editor, not a notes app" signal —
 * GitHub uses this same convention and the eye recognizes language at a
 * glance from the badge color, not from reading the extension.
 *
 * Colors are explicit hex (not theme tokens) because they need to read as
 * the *language's* color regardless of Chisl/Catppuccin/etc. palette.
 */

export type FileTypeBadge = {
  /** Short letter code shown inside the badge (max 4 chars). */
  label: string;
  /** Background color of the badge. */
  bg: string;
  /** Foreground letter color. */
  fg: string;
};

const DEFAULT_BADGE: FileTypeBadge = { label: 'FILE', bg: '#6e6e6e', fg: '#ffffff' };

const EXTENSION_BADGES: Record<string, FileTypeBadge> = {
  // TS family — Microsoft blue
  ts: { label: 'TS', bg: '#3178c6', fg: '#ffffff' },
  tsx: { label: 'TSX', bg: '#3178c6', fg: '#ffffff' },
  mts: { label: 'TS', bg: '#3178c6', fg: '#ffffff' },
  cts: { label: 'TS', bg: '#3178c6', fg: '#ffffff' },
  // JS family — canonical yellow on dark
  js: { label: 'JS', bg: '#f7df1e', fg: '#2c2c2c' },
  jsx: { label: 'JSX', bg: '#f7df1e', fg: '#2c2c2c' },
  mjs: { label: 'JS', bg: '#f7df1e', fg: '#2c2c2c' },
  cjs: { label: 'JS', bg: '#f7df1e', fg: '#2c2c2c' },
  // Python — official blue/yellow split, simplified to blue
  py: { label: 'PY', bg: '#3572a5', fg: '#ffe873' },
  pyi: { label: 'PY', bg: '#3572a5', fg: '#ffe873' },
  // Rust
  rs: { label: 'RS', bg: '#dea584', fg: '#2c2c2c' },
  // Go
  go: { label: 'GO', bg: '#00add8', fg: '#ffffff' },
  // Java family
  java: { label: 'JAVA', bg: '#b07219', fg: '#ffffff' },
  kt: { label: 'KT', bg: '#a97bff', fg: '#ffffff' },
  kts: { label: 'KT', bg: '#a97bff', fg: '#ffffff' },
  // C family
  c: { label: 'C', bg: '#555555', fg: '#ffffff' },
  h: { label: 'H', bg: '#555555', fg: '#ffffff' },
  cpp: { label: 'C++', bg: '#f34b7d', fg: '#ffffff' },
  cc: { label: 'C++', bg: '#f34b7d', fg: '#ffffff' },
  hpp: { label: 'C++', bg: '#f34b7d', fg: '#ffffff' },
  cs: { label: 'C#', bg: '#178600', fg: '#ffffff' },
  // Scripting / shell
  rb: { label: 'RB', bg: '#701516', fg: '#ffffff' },
  php: { label: 'PHP', bg: '#4f5d95', fg: '#ffffff' },
  lua: { label: 'LUA', bg: '#000080', fg: '#ffffff' },
  sh: { label: 'SH', bg: '#89e051', fg: '#2c2c2c' },
  bash: { label: 'SH', bg: '#89e051', fg: '#2c2c2c' },
  zsh: { label: 'SH', bg: '#89e051', fg: '#2c2c2c' },
  ps1: { label: 'PS', bg: '#012456', fg: '#ffffff' },
  // Data / config
  json: { label: 'JSON', bg: '#cbcb41', fg: '#2c2c2c' },
  yaml: { label: 'YML', bg: '#cb171e', fg: '#ffffff' },
  yml: { label: 'YML', bg: '#cb171e', fg: '#ffffff' },
  toml: { label: 'TOML', bg: '#9c4221', fg: '#ffffff' },
  ini: { label: 'INI', bg: '#6e6e6e', fg: '#ffffff' },
  env: { label: 'ENV', bg: '#509136', fg: '#ffffff' },
  // Web
  html: { label: 'HTM', bg: '#e34c26', fg: '#ffffff' },
  htm: { label: 'HTM', bg: '#e34c26', fg: '#ffffff' },
  css: { label: 'CSS', bg: '#563d7c', fg: '#ffffff' },
  scss: { label: 'SCSS', bg: '#c6538c', fg: '#ffffff' },
  sass: { label: 'SASS', bg: '#a53b70', fg: '#ffffff' },
  less: { label: 'LESS', bg: '#1d365d', fg: '#ffffff' },
  xml: { label: 'XML', bg: '#0060ac', fg: '#ffffff' },
  svg: { label: 'SVG', bg: '#ffb13b', fg: '#2c2c2c' },
  // Docs
  md: { label: 'MD', bg: '#083fa1', fg: '#ffffff' },
  markdown: { label: 'MD', bg: '#083fa1', fg: '#ffffff' },
  txt: { label: 'TXT', bg: '#6e6e6e', fg: '#ffffff' },
  // Diff / patch
  diff: { label: 'DIFF', bg: '#88631f', fg: '#ffffff' },
  patch: { label: 'DIFF', bg: '#88631f', fg: '#ffffff' },
  // SQL
  sql: { label: 'SQL', bg: '#dad8d8', fg: '#2c2c2c' },
};

export function badgeForFileName(fileName: string): FileTypeBadge {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0 || dot === lower.length - 1) return DEFAULT_BADGE;
  const ext = lower.slice(dot + 1);
  return EXTENSION_BADGES[ext] ?? DEFAULT_BADGE;
}
