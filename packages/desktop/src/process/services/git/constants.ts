/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Constants and defaults for the desktop-side Git service.
 *
 * Kept free of IO so it can be unit-tested in isolation.
 */

/**
 * Default contents for a freshly created `.gitignore`. Sourced from sensible
 * cross-stack defaults (Node + general purpose). Users are free to overwrite
 * the file afterwards — this is only written when the file is missing.
 */
export const DEFAULT_GITIGNORE_CONTENT = `# Dependencies
node_modules/

# Build artifacts
dist/
build/
out/
*.tsbuildinfo

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Local environment / secrets
.env
.env.*
!.env.example

# Editor / OS
.DS_Store
.idea/
.vscode/
*.swp
*.swo
Thumbs.db

# Coverage / caches
coverage/
.cache/
.turbo/
.next/
.nuxt/
`;

/**
 * Filename of the gitignore file (relative to the repo root).
 */
export const GITIGNORE_FILENAME = '.gitignore';

/** Debounce window (ms) for coalescing rapid working-tree changes. */
export const WATCH_DEBOUNCE_MS = 300;

/**
 * Glob patterns that the chokidar watcher should ignore. These are matched by
 * chokidar's `ignored` matcher which accepts anymatch-style globs.
 */
export const WATCH_IGNORE_PATTERNS: readonly string[] = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.cache/**',
  '**/coverage/**',
  // Python virtualenvs / caches — watching these crawls thousands of files
  // and pins CPU on Python repos (e.g. a `.venv`).
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.mypy_cache/**',
  '**/.pytest_cache/**',
  '**/.tox/**',
  // Other heavy/irrelevant trees.
  '**/target/**',
  '**/vendor/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.turbo/**',
  '**/.svn/**',
  '**/.hg/**',
];
