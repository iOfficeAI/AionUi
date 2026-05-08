/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { HTML_PREVIEW_WEBPREFERENCES } from '../../../src/renderer/pages/conversation/Preview/components/renderers/htmlPreviewSecurity';

describe('HTML preview webview security', () => {
  it('keeps JavaScript for interactive previews without allowing insecure content', () => {
    expect(HTML_PREVIEW_WEBPREFERENCES).toContain('javascript=yes');
    expect(HTML_PREVIEW_WEBPREFERENCES).not.toContain('allowRunningInsecureContent');
  });

  it('keeps Node and preload access disabled inside preview content', () => {
    expect(HTML_PREVIEW_WEBPREFERENCES).toContain('nodeIntegration=no');
    expect(HTML_PREVIEW_WEBPREFERENCES).toContain('contextIsolation=yes');
    expect(HTML_PREVIEW_WEBPREFERENCES).toContain('sandbox=yes');
  });
});
