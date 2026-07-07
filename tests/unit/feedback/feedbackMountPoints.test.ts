/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Static assertion that every error-surface JSX in the codebase wires the
 * FeedbackButton to the right module tag. Complements the component-level
 * tests in this directory with a fast, DOM-free check that catches typos
 * or accidental module reassignment during refactors.
 *
 * If any of these assertions fail, the FeedbackButton may still render but
 * the feedback modal will preselect the wrong module — which is silent and
 * bad for funneling reports to the right owners.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');

describe('FeedbackButton mount points — source-level wiring', () => {
  it('MessageToolGroup wires module=conversation-session', () => {
    const src = read('packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroup.tsx');
    expect(src).toMatch(/<FeedbackButton\s+module=['"]conversation-session['"]/);
    expect(src).not.toMatch(/<FeedbackButton\s+module=['"](?!conversation-session)[^'"]+['"]/);
  });

  it('MessageTips wires module=conversation-session', () => {
    const src = read('packages/desktop/src/renderer/pages/conversation/Messages/components/MessageTips.tsx');
    expect(src).toMatch(/<FeedbackButton\s+module=['"]conversation-session['"]/);
  });

  it('MessageAgentStatus wires module=conversation-session', () => {
    const src = read('packages/desktop/src/renderer/pages/conversation/Messages/components/MessageAgentStatus.tsx');
    expect(src).toMatch(/<FeedbackButton\s+module=['"]conversation-session['"]/);
  });

  it('InlineAgentEditor has no FeedbackButton', () => {
    const src = read('packages/desktop/src/renderer/pages/settings/AgentSettings/InlineAgentEditor.tsx');
    expect(src).not.toMatch(/<FeedbackButton/);
  });

  it('SystemModalContent wires module=system-settings', () => {
    const src = read(
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/SystemModalContent/index.tsx'
    );
    expect(src).toMatch(/<FeedbackButton\s+module=['"]system-settings['"]/);
  });

  it('McpServerHeader wires module=mcp-tools', () => {
    const src = read('packages/desktop/src/renderer/pages/settings/ToolsSettings/McpServerHeader.tsx');
    expect(src).toMatch(/<FeedbackButton\s+module=['"]mcp-tools['"]/);
  });

  it('each referenced module tag exists in FEEDBACK_MODULES', () => {
    const modulesSrc = read('packages/desktop/src/common/types/feedbackDiagnostics.ts');
    const referencedTags = ['conversation-session', 'agent-detection', 'system-settings', 'mcp-tools'];
    for (const tag of referencedTags) {
      expect(modulesSrc).toContain(`tag: '${tag}'`);
    }
  });
});
