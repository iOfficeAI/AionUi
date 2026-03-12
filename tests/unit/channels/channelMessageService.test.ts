/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTaskById = vi.fn();

async function loadServiceClass() {
  vi.resetModules();

  vi.doMock('@/process/WorkerManage', () => ({
    default: {
      getTaskById: mockGetTaskById,
    },
  }));

  vi.doMock('@/process/database', () => ({
    getDatabase: vi.fn(),
  }));

  const mod = await import('@/channels/agent/ChannelMessageService');
  return mod.ChannelMessageService;
}

describe('ChannelMessageService.confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ACP 确认时应将 optionId 还原为原始 option 对象', async () => {
    const ChannelMessageService = await loadServiceClass();
    const service = new ChannelMessageService();
    const acpOption = {
      optionId: 'allow_once',
      name: 'Allow once',
      kind: 'allow_once' as const,
    };
    const confirm = vi.fn();

    mockGetTaskById.mockReturnValue({
      type: 'acp',
      getConfirmations: () => [
        {
          id: 'permission-1',
          callId: 'tool-call-1',
          options: [{ value: acpOption }],
        },
      ],
      confirm,
    });

    await service.confirm('conversation-1', 'tool-call-1', 'allow_once');

    expect(confirm).toHaveBeenCalledWith('conversation-1', 'tool-call-1', acpOption);
  });

  it('非 ACP 确认时应继续透传字符串值', async () => {
    const ChannelMessageService = await loadServiceClass();
    const service = new ChannelMessageService();
    const confirm = vi.fn();

    mockGetTaskById.mockReturnValue({
      type: 'codex',
      confirm,
    });

    await service.confirm('conversation-2', 'tool-call-2', 'allow_always');

    expect(confirm).toHaveBeenCalledWith('conversation-2', 'tool-call-2', 'allow_always');
  });
});
