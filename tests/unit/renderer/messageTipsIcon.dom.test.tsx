/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `MessageTips` renders `icon[type] || icon.warning`, so a type missing from
 * the map is not a visual gap — it is silently drawn as a WARNING. `info` was
 * missing, so a backend that deliberately downgraded a notice to Info still
 * reached the user wearing the alarm icon, and nothing failed to reveal it.
 *
 * The map must therefore cover every `IMessageTips['type']`; the fallback
 * guarantees a missing entry can never announce itself.
 */
import type { IMessageTips } from '@/common/chat/chatLib';
import { icon } from '@/renderer/pages/conversation/Messages/components/MessageTips';
import { describe, expect, it } from 'vitest';

// Every member of the union, listed so adding one to `chatLib` and forgetting
// the icon shows up here rather than as an alarm on a friendly message.
const ALL_TIP_TYPES: Array<IMessageTips['content']['type']> = ['error', 'info', 'success', 'warning'];

describe('MessageTips icon map', () => {
  it('has an entry for every tip type', () => {
    for (const type of ALL_TIP_TYPES) {
      expect(icon[type], `no icon mapped for tip type "${type}"`).toBeDefined();
    }
  });

  it('gives info its own icon rather than the warning fallback', () => {
    // The regression this file exists for.
    expect(icon.info).toBeDefined();
    expect(icon.info).not.toBe(icon.warning);
  });

  it('keeps the severity tiers visually distinct', () => {
    expect(icon.warning).not.toBe(icon.error);
    expect(icon.success).not.toBe(icon.info);
  });
});
