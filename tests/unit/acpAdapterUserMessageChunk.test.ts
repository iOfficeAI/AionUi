/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AcpAdapter } from '../../src/process/agent/acp/AcpAdapter';
import type { AcpSessionUpdate } from '../../src/common/types/acpTypes';

describe('AcpAdapter - user_message_chunk handling', () => {
  let adapter: AcpAdapter;

  beforeEach(() => {
    adapter = new AcpAdapter('test-conversation', 'codex');
  });

  it('should silently ignore user_message_chunk without producing messages', () => {
    const update: AcpSessionUpdate = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'user_message_chunk',
        content: {
          type: 'text',
          text: 'Hello, this is a user message echoed back during restore',
        },
      },
    } as AcpSessionUpdate;

    const messages = adapter.convertSessionUpdate(update);

    expect(messages).toHaveLength(0);
  });

  it('should not log warnings for user_message_chunk', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const update = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'echo' },
      },
    } as AcpSessionUpdate;

    adapter.convertSessionUpdate(update);

    // Should NOT trigger "Unknown session update type" warning
    expect(warnSpy).not.toHaveBeenCalledWith('Unknown session update type:', 'user_message_chunk');
    warnSpy.mockRestore();
  });

  it('should still warn on truly unknown update types', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const update = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'completely_unknown_type',
      },
    } as unknown as AcpSessionUpdate;

    adapter.convertSessionUpdate(update);

    expect(warnSpy).toHaveBeenCalledWith('Unknown session update type:', 'completely_unknown_type');
    warnSpy.mockRestore();
  });
});
