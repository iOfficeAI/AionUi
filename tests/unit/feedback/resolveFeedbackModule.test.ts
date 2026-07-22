/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Route → feedback-module mapping used by the titlebar report button. Every
 * navigable page should preselect the module owning it, so reports funnel to
 * the right owners without the user having to guess the taxonomy.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { resolveFeedbackModule } from '@/renderer/services/feedback/resolveFeedbackModule';
import { FEEDBACK_MODULES } from '@/common/types/feedbackDiagnostics';

describe('resolveFeedbackModule', () => {
  it.each([
    ['/conversation/abc-123', 'conversation-session'],
    ['/team/team-1', 'agent-team'],
    ['/scheduled', 'scheduled-task'],
    ['/scheduled/job-42', 'scheduled-task'],
    ['/assistants', 'assistant-preset'],
    ['/settings/agent', 'agent-detection'],
    ['/settings/agent/claude/repair', 'agent-detection'],
    ['/settings/model', 'model-auth'],
    ['/settings/skills', 'skills-plugin'],
    ['/settings/skills/detail/my-skill', 'skills-plugin'],
    ['/settings/skills/import-history', 'skills-plugin'],
    ['/settings/tools', 'mcp-tools'],
    ['/settings/appearance', 'display-desktop'],
    ['/settings/pet', 'display-desktop'],
    ['/settings/webui', 'webui-remote'],
    ['/settings/ext/telegram', 'channel'],
    ['/settings/system', 'system-settings'],
    ['/settings/about', 'system-settings'],
    ['/settings', 'system-settings'],
  ] as const)('%s → %s', (pathname, expected) => {
    expect(resolveFeedbackModule(pathname)).toBe(expected);
  });

  it('returns undefined for the home page and unknown routes', () => {
    expect(resolveFeedbackModule('/guid')).toBeUndefined();
    expect(resolveFeedbackModule('/login')).toBeUndefined();
    expect(resolveFeedbackModule('/')).toBeUndefined();
  });

  it('does not match prefixes across path-segment boundaries', () => {
    // e.g. a hypothetical /scheduledFoo page must not inherit scheduled-task.
    expect(resolveFeedbackModule('/scheduledFoo')).toBeUndefined();
    expect(resolveFeedbackModule('/assistants-v2')).toBeUndefined();
  });

  it('every navigable router page resolves to a module or is a known module-less page', () => {
    const routerSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../packages/desktop/src/renderer/components/layout/Router.tsx'),
      'utf-8'
    );
    // Pages where preselecting a module makes no sense (multi-purpose or
    // pre-auth surfaces where the user picks the module themselves).
    const moduleLess = new Set(['/guid', '/login', '/test/components']);
    const paths = [...routerSrc.matchAll(/path='([^*'][^']*)'/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(10);
    for (const routePath of paths) {
      // Substitute params with plausible values so prefix matching applies.
      const concrete = routePath.replace(/:[^/]+/g, 'sample-id');
      if (moduleLess.has(concrete)) continue;
      expect(resolveFeedbackModule(concrete), `route ${routePath} has no feedback module`).toBeDefined();
    }
  });

  it('every mapped tag exists in FEEDBACK_MODULES', () => {
    const knownTags = new Set<string>(FEEDBACK_MODULES.map((m) => m.tag));
    const mapSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../packages/desktop/src/renderer/services/feedback/resolveFeedbackModule.ts'),
      'utf-8'
    );
    const mappedTags = [...mapSrc.matchAll(/,\s*'([a-z-]+)'\]/g)].map((m) => m[1]);
    expect(mappedTags.length).toBeGreaterThan(5);
    for (const tag of mappedTags) {
      expect(knownTags.has(tag), `tag ${tag} missing from FEEDBACK_MODULES`).toBe(true);
    }
  });
});
