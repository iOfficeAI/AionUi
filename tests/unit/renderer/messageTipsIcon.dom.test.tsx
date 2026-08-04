/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageTips } from '@/common/chat/chatLib';
import { icon } from '@/renderer/pages/conversation/Messages/components/MessageTips';
import { describe, expect, it } from 'vitest';

const ALL_TIP_TYPES: Array<IMessageTips['content']['type']> = ['error', 'info', 'success', 'warning'];

describe('MessageTips icon map', () => {
  it('covers every tip type', () => {
    for (const type of ALL_TIP_TYPES) {
      expect(icon[type]).toBeDefined();
    }
  });

  it('does not render info as a warning', () => {
    expect(icon.info).not.toBe(icon.warning);
  });
});
