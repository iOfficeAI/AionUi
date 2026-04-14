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

  it('maps ACP config option model info to a readable source label', () => {
    expect(getAcpModelSourceLabel({ source: 'configOption', sourceDetail: 'acp-config-option' })).toBe('ACP config');
  });

  it('falls back to the coarse source when no detail exists', () => {
    expect(getAcpModelSourceLabel({ source: 'models' })).toBe('ACP models');
  });

  it('formats the final button label with model and source', () => {
    expect(formatAcpModelDisplayLabel('Claude Opus 4.6', 'cc-switch')).toBe('Claude Opus 4.6 · cc-switch');
  });
});
