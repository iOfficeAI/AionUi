/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHAT_SURFACE_WIDTH_CLASS,
  getChatSurfaceWidthClass,
} from '@/renderer/pages/conversation/utils/chatSurfaceWidth';

/**
 * Team and standalone conversations share one width class, so whether a chat
 * column reserves side gutters is decided by the container query in messages.css
 * rather than by the mode. These tests read that stylesheet directly — restating
 * the numbers in TypeScript would keep passing even if the CSS drifted.
 */
const css = readFileSync(
  join(__dirname, '../../../../packages/desktop/src/renderer/pages/conversation/Messages/messages.css'),
  'utf8'
);

const containerQuery = css.match(/@container\s*\(min-width:\s*(\d+)px\)\s*{[\s\S]*?\.chat-surface-fluid\s*{([^}]*)}/);

describe('chat surface width class', () => {
  it('is the same for team and standalone conversations', () => {
    expect(getChatSurfaceWidthClass()).toBe(CHAT_SURFACE_WIDTH_CLASS);
  });

  it('is full width by default, so a narrow column is never indented', () => {
    // The base rule (outside any @container block) must not carve out a gutter.
    const base = css.slice(0, css.indexOf('@container'));
    expect(base).toMatch(/\.chat-surface-fluid\s*{[^}]*width:\s*100%/);
    expect(base).not.toMatch(/\.chat-surface-fluid\s*{[^}]*calc\(/);
  });
});

describe('gutter threshold', () => {
  it('is expressed as a container query, not a viewport one', () => {
    // Split preview/workspace layouts make the column narrow on wide screens, so
    // keying off the viewport would indent a column that has no room to spare.
    expect(containerQuery).not.toBeNull();
  });

  it('sits above the width of a team parallel-view column', () => {
    // Parallel view gives each agent `flex: 1 1 400px` with a 400px floor. That
    // must stay below the threshold, so multi-agent columns keep rendering full
    // width exactly as they did before team mode shared this class.
    const threshold = Number(containerQuery?.[1]);
    const PARALLEL_COLUMN_FLOOR = 400;
    expect(threshold).toBeGreaterThan(PARALLEL_COLUMN_FLOOR);
  });

  it('reserves a bounded gutter once the column is wide enough', () => {
    // Team single view and standalone conversations both land here. The clamp keeps
    // the gutter from swallowing the text on very wide windows.
    const rule = containerQuery?.[2] ?? '';
    expect(rule).toMatch(/width:\s*calc\(100%\s*-\s*clamp\(/);
    expect(rule).toMatch(/clamp\(\s*\d+px\s*,[^,]+,\s*\d+px\s*\)/);
  });
});
