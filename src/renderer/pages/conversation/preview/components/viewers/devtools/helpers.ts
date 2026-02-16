/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared helpers for DevTools viewer sub-components.
 */

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  return `${mins}m ${secs}s`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return formatDate(ts);
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\u2026';
}

/**
 * Detect language from a file path extension.
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    toml: 'toml',
    ini: 'ini',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    r: 'r',
    lua: 'lua',
    php: 'php',
    pl: 'perl',
    ex: 'elixir',
    exs: 'elixir',
    erl: 'erlang',
    hs: 'haskell',
    scala: 'scala',
    clj: 'clojure',
    vim: 'vim',
    tex: 'latex',
  };
  return map[ext] || 'text';
}

/**
 * Get a shortened file path for display.
 */
export function shortenPath(filePath: string, maxSegments = 3): string {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= maxSegments) return filePath;
  return '\u2026/' + parts.slice(-maxSegments).join('/');
}
