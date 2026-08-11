import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processConfig: {
    get: vi.fn(),
  },
  platformNotificationSend: vi.fn(),
  notificationShowProvider: vi.fn(),
  notificationReceivedEmit: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    notification: {
      show: {
        provider: (handler: unknown) => mocks.notificationShowProvider(handler),
      },
      received: {
        emit: (...args: unknown[]) => mocks.notificationReceivedEmit(...args),
      },
    },
  },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      isPackaged: () => false,
    },
    notification: {
      send: (...args: unknown[]) => mocks.platformNotificationSend(...args),
    },
  }),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: mocks.processConfig,
}));

import { initNotificationBridge, showNotification } from '@/process/bridge/notificationBridge';

describe('notificationBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processConfig.get.mockResolvedValue(true);
  });

  it('broadcasts notification payloads so browser WebUI clients can show system notifications', async () => {
    await showNotification({
      title: 'Task complete',
      body: 'Scheduled task finished',
      conversationId: 'conv-1',
    });

    expect(mocks.platformNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Task complete',
        body: 'Scheduled task finished',
      })
    );
    expect(mocks.notificationReceivedEmit).toHaveBeenCalledWith({
      title: 'Task complete',
      body: 'Scheduled task finished',
      conversationId: 'conv-1',
    });
  });

  it('does not broadcast browser notification events when system notifications are disabled', async () => {
    mocks.processConfig.get.mockResolvedValue(false);

    await showNotification({
      title: 'Task complete',
      body: 'Scheduled task finished',
      conversationId: 'conv-1',
    });

    expect(mocks.platformNotificationSend).not.toHaveBeenCalled();
    expect(mocks.notificationReceivedEmit).not.toHaveBeenCalled();
  });

  it('registers the renderer notification provider through the same notification path', async () => {
    initNotificationBridge();

    expect(mocks.notificationShowProvider).toHaveBeenCalledTimes(1);
    const handler = mocks.notificationShowProvider.mock.calls[0]?.[0] as (payload: {
      title: string;
      body: string;
      conversationId?: string;
    }) => Promise<void>;
    await handler({ title: 'Manual', body: 'Triggered', conversationId: 'conv-2' });

    expect(mocks.notificationReceivedEmit).toHaveBeenCalledWith({
      title: 'Manual',
      body: 'Triggered',
      conversationId: 'conv-2',
    });
  });
});
