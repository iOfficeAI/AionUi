/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Pins the macOS symlink fold used when matching a file-watch event's path
// against a locally held one.
//
// This fold is easy to get subtly wrong and its failure mode is silent: on macOS
// the OS reports watch events under `/private/var/...` while a workspace path is
// normally the unresolved `/var/...`, so comparing the raw strings never matches
// and events just look like they belong to somewhere else. These cases exist so
// the behaviour survives refactoring — including the two prefixes (`/private/var`
// AND `/private/tmp`) and the exact-match forms, each of which is a separate
// branch someone could drop while "simplifying".

import { describe, expect, it } from 'vitest';
import { normalizeWatchPath } from '@/renderer/utils/workspace/workspace';

describe('normalizeWatchPath', () => {
  describe('macOS /private symlink folding', () => {
    it('folds the /private/var prefix', () => {
      expect(normalizeWatchPath('/private/var/folders/ab/T/ws/report.docx')).toBe('/var/folders/ab/T/ws/report.docx');
    });

    it('folds the bare /private/var path', () => {
      expect(normalizeWatchPath('/private/var')).toBe('/var');
    });

    it('folds the /private/tmp prefix', () => {
      expect(normalizeWatchPath('/private/tmp/ws/a.xlsx')).toBe('/tmp/ws/a.xlsx');
    });

    it('folds the bare /private/tmp path', () => {
      expect(normalizeWatchPath('/private/tmp')).toBe('/tmp');
    });

    // The whole point: after folding, the event path and the local path agree.
    it('makes an event path match its unresolved local counterpart', () => {
      const fromWatcher = '/private/var/folders/x/T/project';
      const fromLocalState = '/var/folders/x/T/project';
      expect(normalizeWatchPath(fromWatcher)).toBe(normalizeWatchPath(fromLocalState));
    });
  });

  describe('paths that must not be rewritten', () => {
    it('leaves an already-unresolved path alone', () => {
      expect(normalizeWatchPath('/var/folders/x/T/project')).toBe('/var/folders/x/T/project');
    });

    it('leaves an ordinary absolute path alone', () => {
      expect(normalizeWatchPath('/Users/demo/code/app')).toBe('/Users/demo/code/app');
    });

    // Guards against a too-eager prefix rule: only /private/var and /private/tmp
    // are symlinks, so other /private children keep their prefix.
    it('does not strip /private from unrelated children', () => {
      expect(normalizeWatchPath('/private/etc/hosts')).toBe('/private/etc/hosts');
    });

    // `/private/variants` starts with "/private/var" as raw text but is a
    // different directory — the trailing slash in the rule is what saves it.
    it('does not fold a path that merely starts with the same characters', () => {
      expect(normalizeWatchPath('/private/variants/x')).toBe('/private/variants/x');
    });
  });

  describe('separator folding', () => {
    it('converts Windows backslashes to forward slashes', () => {
      expect(normalizeWatchPath('C:\\Users\\demo\\ws')).toBe('C:/Users/demo/ws');
    });

    it('makes a backslash path compare equal to its POSIX form', () => {
      expect(normalizeWatchPath('C:\\ws\\docs')).toBe(normalizeWatchPath('C:/ws/docs'));
    });

    it('handles an empty string without throwing', () => {
      expect(normalizeWatchPath('')).toBe('');
    });
  });
});
