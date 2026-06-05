/*
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { isAllowedAdapterBridgeEventName } from '@/common/adapter/events';

describe('adapter bridge event allowlist', () => {
  it('allows provider request envelopes for known IPC provider events', () => {
    expect(isAllowedAdapterBridgeEventName('subscribe-terminal.spawn')).toBe(true);
    expect(isAllowedAdapterBridgeEventName('subscribe-terminal.resize')).toBe(true);
  });

  it('allows provider callback envelopes for known IPC provider events', () => {
    expect(isAllowedAdapterBridgeEventName('subscribe.callback-terminal.spawnterminal.spawnabc123')).toBe(true);
  });

  it('rejects provider envelopes for unknown events', () => {
    expect(isAllowedAdapterBridgeEventName('subscribe-terminal.not-real')).toBe(false);
    expect(isAllowedAdapterBridgeEventName('subscribe.callback-terminal.not-realabc123')).toBe(false);
  });
});
