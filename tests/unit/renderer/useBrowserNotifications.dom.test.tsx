import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type NotificationPayload = {
  title: string;
  body: string;
  conversationId?: string;
};

const mocks = vi.hoisted(() => ({
  isElectronDesktop: vi.fn(() => false),
  notificationReceivedOn: vi.fn(),
}));

let notificationHandler: ((payload: NotificationPayload) => void) | null = null;
let unsubscribe: ReturnType<typeof vi.fn>;

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mocks.isElectronDesktop(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    notification: {
      received: {
        on: (handler: (payload: NotificationPayload) => void) => {
          notificationHandler = handler;
          return mocks.notificationReceivedOn(handler);
        },
      },
    },
  },
}));

function installNotificationMock(permission: NotificationPermission) {
  const NotificationMock = vi.fn(function MockNotification(
    this: { onclick?: () => void },
    _title: string,
    _options?: NotificationOptions
  ) {
    this.onclick = undefined;
  });
  Object.defineProperty(NotificationMock, 'permission', {
    configurable: true,
    value: permission,
  });
  Object.defineProperty(NotificationMock, 'requestPermission', {
    configurable: true,
    value: vi.fn().mockResolvedValue(permission),
  });
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: NotificationMock,
  });
  return NotificationMock;
}

function installServiceWorkerMock(showNotification: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ showNotification }),
    },
  });
}

describe('useBrowserNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationHandler = null;
    unsubscribe = vi.fn();
    mocks.notificationReceivedOn.mockReturnValue(unsubscribe);
    mocks.isElectronDesktop.mockReturnValue(false);
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'https://example.test/#/settings/system',
        origin: 'https://example.test',
        pathname: '/',
        hostname: 'example.test',
        protocol: 'https:',
      },
    });
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('shows browser system notifications for bridge notification events', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    installNotificationMock('granted');
    installServiceWorkerMock(showNotification);
    const { useBrowserNotifications } = await import('@/renderer/hooks/system/useBrowserNotifications');

    renderHook(() => useBrowserNotifications());

    await act(async () => {
      notificationHandler?.({
        title: 'Task complete',
        body: 'Scheduled task finished',
        conversationId: 'conv-1',
      });
    });

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledWith(
        'Task complete',
        expect.objectContaining({
          body: 'Scheduled task finished',
          data: { url: 'https://example.test/#/conversation/conv-1' },
        })
      );
    });
  });

  it('does not show browser notifications when permission is denied', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    installNotificationMock('denied');
    installServiceWorkerMock(showNotification);
    const { useBrowserNotifications } = await import('@/renderer/hooks/system/useBrowserNotifications');

    renderHook(() => useBrowserNotifications());

    await act(async () => {
      notificationHandler?.({
        title: 'Task complete',
        body: 'Scheduled task finished',
        conversationId: 'conv-1',
      });
    });

    expect(showNotification).not.toHaveBeenCalled();
  });

  it('does not subscribe in Electron desktop renderer', async () => {
    mocks.isElectronDesktop.mockReturnValue(true);
    installNotificationMock('granted');
    const { useBrowserNotifications } = await import('@/renderer/hooks/system/useBrowserNotifications');

    renderHook(() => useBrowserNotifications());

    expect(mocks.notificationReceivedOn).not.toHaveBeenCalled();
  });
});
