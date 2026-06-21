/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { isAutoOpenEligible } from '@/renderer/hooks/file/useAutoPreviewOfficeFiles';

// =========================================================================
// Guided Onboarding SLICE S3: html auto-open marker-gate.
//
// Auto-open is a best-effort BONUS (inert without a backend fileAdded watcher).
// The contract these tests pin: Office types still auto-open; html auto-opens
// ONLY for generated onboarding step-screens (onboarding.html / onboarding-<step>.html)
// so arbitrary user/agent HTML is NOT silently surfaced — that still opens via the
// explicit preview-click chain.
// =========================================================================

describe('S3 auto-open eligibility: Office types unchanged', () => {
  it('keeps auto-opening ppt / word / excel', () => {
    expect(isAutoOpenEligible('/ws/deck.pptx', 'ppt')).toBe(true);
    expect(isAutoOpenEligible('/ws/report.docx', 'word')).toBe(true);
    expect(isAutoOpenEligible('/ws/sheet.xlsx', 'excel')).toBe(true);
  });

  it('still ignores unrelated types (e.g. markdown, code, pdf)', () => {
    expect(isAutoOpenEligible('/ws/notes.md', 'markdown')).toBe(false);
    expect(isAutoOpenEligible('/ws/app.ts', 'code')).toBe(false);
    expect(isAutoOpenEligible('/ws/manual.pdf', 'pdf')).toBe(false);
  });
});

describe('S3 auto-open eligibility: html is marker-gated to generated step-screens', () => {
  it('auto-opens the canonical onboarding.html step-screen', () => {
    expect(isAutoOpenEligible('/ws/onboarding.html', 'html')).toBe(true);
    expect(isAutoOpenEligible('onboarding.html', 'html')).toBe(true);
  });

  it('auto-opens named step variants onboarding-<step>.html', () => {
    expect(isAutoOpenEligible('/ws/onboarding-ollama.html', 'html')).toBe(true);
    expect(isAutoOpenEligible('/ws/sub/onboarding-step-2.html', 'html')).toBe(true);
  });

  it('matches on backslash paths too', () => {
    expect(isAutoOpenEligible('C:\\ws\\onboarding.html', 'html')).toBe(true);
    expect(isAutoOpenEligible('C:\\ws\\onboarding-ollama.html', 'html')).toBe(true);
  });

  it('does NOT auto-open arbitrary user/agent HTML', () => {
    expect(isAutoOpenEligible('/ws/index.html', 'html')).toBe(false);
    expect(isAutoOpenEligible('/ws/report.html', 'html')).toBe(false);
    // a deceptive prefix/substring must not slip through
    expect(isAutoOpenEligible('/ws/my-onboarding.html', 'html')).toBe(false);
    expect(isAutoOpenEligible('/ws/onboarding.html.bak', 'html')).toBe(false);
    expect(isAutoOpenEligible('/ws/onboarding/page.html', 'html')).toBe(false);
  });
});
