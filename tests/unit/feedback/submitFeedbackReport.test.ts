import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitFeedbackReport } from '@/renderer/services/feedback/submitFeedbackReport';

const sentryMocks = vi.hoisted(() => {
  const setTag = vi.fn();
  const flush = vi.fn(async () => true);
  return {
    captureEvent: vi.fn(() => 'event-id'),
    flush,
    getClient: vi.fn(() => ({ flush })),
    setTag,
    withScope: vi.fn((callback: (scope: { setTag: typeof setTag }) => void) => {
      callback({ setTag });
    }),
  };
});

vi.mock('@sentry/electron/renderer', () => sentryMocks);

describe('submitFeedbackReport', () => {
  beforeEach(() => {
    sentryMocks.captureEvent.mockClear();
    sentryMocks.captureEvent.mockReturnValue('event-id');
    sentryMocks.flush.mockClear();
    sentryMocks.flush.mockResolvedValue(true);
    sentryMocks.getClient.mockClear();
    sentryMocks.getClient.mockReturnValue({ flush: sentryMocks.flush });
    sentryMocks.setTag.mockClear();
    sentryMocks.withScope.mockClear();
    vi.stubGlobal('window', { electronAPI: undefined });
  });

  it('submits a user-feedback event with tags, extra context, logs, and attachments', async () => {
    const collectFeedbackLogs = vi.fn().mockResolvedValue({
      filename: 'aionui-logs.log.gz',
      data: [1, 2, 3],
    });
    const logFeedbackEvent = vi.fn();
    vi.stubGlobal('window', {
      electronAPI: {
        collectFeedbackLogs,
        emit: vi.fn(),
        logFeedbackEvent,
        on: vi.fn(),
      },
    });

    await submitFeedbackReport({
      attachments: [
        {
          filename: 'screenshot.png',
          data: new Uint8Array([4, 5, 6]),
          contentType: 'image/png',
        },
      ],
      collectLogs: true,
      description: '  AionCore   cannot start  ',
      extra: {
        installation_integrity: {
          source: 'backend_startup_failure',
        },
      },
      module: 'installation-integrity',
      moduleLabel: 'AionUi installation is incomplete',
      tags: {
        'aionui.installation_integrity.report_source': 'backend_startup_failure',
      },
    });

    expect(collectFeedbackLogs).toHaveBeenCalledOnce();
    expect(sentryMocks.setTag).toHaveBeenCalledWith('type', 'user-feedback');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('module', 'installation-integrity');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'aionui.installation_integrity.report_source',
      'backend_startup_failure'
    );
    expect(sentryMocks.captureEvent).toHaveBeenCalledWith(
      {
        level: 'info',
        message: 'AionUi installation is incomplete: AionCore cannot start',
        extra: {
          description: 'AionCore cannot start',
          installation_integrity: {
            source: 'backend_startup_failure',
          },
        },
      },
      {
        attachments: [
          {
            filename: 'aionui-logs.log.gz',
            data: new Uint8Array([1, 2, 3]),
            contentType: 'application/gzip',
          },
          {
            filename: 'screenshot.png',
            data: new Uint8Array([4, 5, 6]),
            contentType: 'image/png',
          },
        ],
      }
    );
    expect(sentryMocks.flush).not.toHaveBeenCalled();
    expect(logFeedbackEvent).toHaveBeenCalledOnce();
    expect(logFeedbackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: 'submitted',
      })
    );
  });

  it('continues without logs when log collection is unavailable', async () => {
    await submitFeedbackReport({
      collectLogs: true,
      description: 'No logs available',
      module: 'installation-integrity',
      moduleLabel: 'AionUi installation is incomplete',
    });

    expect(sentryMocks.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: {
          description: 'No logs available',
        },
      }),
      { attachments: [] }
    );
  });

  it('flushes when requested', async () => {
    await submitFeedbackReport({
      collectLogs: false,
      description: 'Flush me',
      flushTimeoutMs: 2000,
      module: 'installation-integrity',
      moduleLabel: 'AionUi installation is incomplete',
    });

    expect(sentryMocks.captureEvent).toHaveBeenCalledOnce();
    expect(sentryMocks.getClient).toHaveBeenCalledOnce();
    expect(sentryMocks.flush).toHaveBeenCalledWith(2000);
  });

  it('rejects when requested flush does not complete', async () => {
    sentryMocks.flush.mockResolvedValue(false);
    const logFeedbackEvent = vi.fn();
    vi.stubGlobal('window', {
      electronAPI: {
        logFeedbackEvent,
      },
    });

    await expect(
      submitFeedbackReport({
        collectLogs: false,
        description: 'Flush me',
        flushTimeoutMs: 2000,
        module: 'installation-integrity',
        moduleLabel: 'AionUi installation is incomplete',
      })
    ).rejects.toThrow('Failed to flush feedback report (event-id)');
    expect(logFeedbackEvent).toHaveBeenCalledOnce();
    expect(logFeedbackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'failed',
      })
    );
  });

  it('rejects when requested flush has no initialized Sentry client', async () => {
    sentryMocks.getClient.mockReturnValue(undefined);

    await expect(
      submitFeedbackReport({
        collectLogs: false,
        description: 'Flush me',
        flushTimeoutMs: 2000,
        module: 'installation-integrity',
        moduleLabel: 'AionUi installation is incomplete',
      })
    ).rejects.toThrow('Sentry is not initialized');
  });
});
