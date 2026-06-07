/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public surface of the desktop-side Git service. Bridge code should import
 * from this module rather than the individual files.
 */

export {
  GitService,
  getGitService,
  resetGitServiceForTests,
  type GitServiceDeps,
  type GitServiceEvents,
} from './GitService';
export { mapStatus, parseNumStat, EMPTY_NUMSTAT, type NumStatMap } from './gitStatusMapper';
export { toPosix, joinAbs, resolveAgainstRoot } from './pathUtils';
export { DEFAULT_GITIGNORE_CONTENT, GITIGNORE_FILENAME, WATCH_DEBOUNCE_MS, WATCH_IGNORE_PATTERNS } from './constants';
