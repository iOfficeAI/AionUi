/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { formatAcpModelDisplayLabel, getAcpModelSourceLabel } from '../../src/renderer/utils/model/modelSource';

describe('modelSourceLabel', () => {
  it('maps cc-switch model info to a readable source label', () => {
    expect(getAcpModelSourceLabel({ source: 'models', sourceDetail: 'cc-switch' })).toBe('cc-switch');
  });

  it('returns empty for non-cc-switch source details', () => {
    expect(getAcpModelSourceLabel({ source: 'configOption', sourceDetail: 'acp-config-option' })).toBe('');
    expect(getAcpModelSourceLabel({ source: 'models', sourceDetail: 'persisted-model' })).toBe('');
    expect(getAcpModelSourceLabel({ source: 'models', sourceDetail: 'codex-stream' })).toBe('');
  });

  it('returns empty for coarse source without cc-switch detail', () => {
    expect(getAcpModelSourceLabel({ source: 'models' })).toBe('');
    expect(getAcpModelSourceLabel({ source: 'configOption' })).toBe('');
  });

  it('formats the final button label with model and source', () => {
    expect(formatAcpModelDisplayLabel('Claude Opus 4.6', 'cc-switch')).toBe('Claude Opus 4.6 · cc-switch');
  });

  it('keeps whichever side of the display label is present', () => {
    expect(formatAcpModelDisplayLabel('', 'cc-switch')).toBe('cc-switch');
    expect(formatAcpModelDisplayLabel('Claude Opus 4.6', '')).toBe('Claude Opus 4.6');
  });
});
