const SUMMARY_PREVIEW_LENGTH = 60;
const LOG_PREFIX = '[FeedbackReport]';
type FeedbackLogLevel = 'info' | 'warn' | 'error';
type FeedbackLogAttachmentStatus = 'collected' | 'empty' | 'failed' | 'skipped' | 'unavailable';

export type FeedbackAttachment = {
  filename: string;
  data: Uint8Array<ArrayBuffer>;
  contentType: string;
};

export type FeedbackEventTags = Record<string, string>;
export type FeedbackEventExtra = Record<string, unknown>;

export type SubmitFeedbackReportInput = {
  attachments?: FeedbackAttachment[];
  collectLogs?: boolean;
  description: string;
  extra?: FeedbackEventExtra;
  flushTimeoutMs?: number;
  module: string;
  moduleLabel: string;
  tags?: FeedbackEventTags;
};

function summarizeAttachments(attachments: FeedbackAttachment[]): Array<{
  contentType: string;
  filename: string;
  size: number;
}> {
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.data.byteLength,
  }));
}

function summarizeLogAttachment(
  status: FeedbackLogAttachmentStatus,
  attachment: FeedbackAttachment | null
): {
  filename?: string;
  size?: number;
  status: FeedbackLogAttachmentStatus;
} {
  if (!attachment) {
    return { status };
  }

  return {
    status,
    filename: attachment.filename,
    size: attachment.data.byteLength,
  };
}

function normalizeLogDetails(details: unknown): unknown {
  if (details instanceof Error) {
    return {
      name: details.name,
      message: details.message,
      stack: details.stack,
    };
  }
  return details;
}

export function logFeedbackReport(level: FeedbackLogLevel, message: string, details?: unknown): void {
  const normalizedDetails = normalizeLogDetails(details);
  const consoleMessage = `${LOG_PREFIX} ${message}`;
  if (level === 'error') {
    console.error(consoleMessage, normalizedDetails);
  } else if (level === 'warn') {
    console.warn(consoleMessage, normalizedDetails);
  } else {
    console.info(consoleMessage, normalizedDetails);
  }

  try {
    window.electronAPI?.logFeedbackEvent?.({
      level,
      message,
      details: normalizedDetails,
    });
  } catch {
    // Renderer console logging above is the fallback.
  }
}

async function collectLogAttachment(): Promise<{
  attachment: FeedbackAttachment | null;
  status: FeedbackLogAttachmentStatus;
}> {
  try {
    const electronAPI = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!electronAPI?.collectFeedbackLogs) {
      return { attachment: null, status: 'unavailable' };
    }

    const logData = await electronAPI?.collectFeedbackLogs?.();
    if (!logData) {
      return { attachment: null, status: 'empty' };
    }

    return {
      attachment: {
        filename: logData.filename,
        data: new Uint8Array(logData.data),
        contentType: 'application/gzip',
      },
      status: 'collected',
    };
  } catch {
    return { attachment: null, status: 'failed' };
  }
}

function normalizeDescription(description: string): string {
  return description.trim().replace(/\s+/g, ' ');
}

function buildSummary(moduleLabel: string, description: string): string {
  const summaryPreview =
    description.length > SUMMARY_PREVIEW_LENGTH
      ? `${description.slice(0, SUMMARY_PREVIEW_LENGTH).trimEnd()}...`
      : description;
  return `${moduleLabel}: ${summaryPreview}`;
}

export async function submitFeedbackReport(input: SubmitFeedbackReportInput): Promise<void> {
  const attachments = [...(input.attachments ?? [])];
  let eventId: string | undefined;
  let logAttachmentStatus: FeedbackLogAttachmentStatus = input.collectLogs ? 'empty' : 'skipped';
  let logAttachment: FeedbackAttachment | null = null;

  try {
    if (input.collectLogs) {
      const collectedLogAttachment = await collectLogAttachment();
      logAttachmentStatus = collectedLogAttachment.status;
      logAttachment = collectedLogAttachment.attachment;
      if (logAttachment) {
        attachments.unshift(logAttachment);
      }
    }

    const normalizedDescription = normalizeDescription(input.description);
    const eventSummary = buildSummary(input.moduleLabel, normalizedDescription);
    const Sentry = await import('@sentry/electron/renderer');

    Sentry.withScope((scope) => {
      scope.setTag('type', 'user-feedback');
      scope.setTag('module', input.module);
      Object.entries(input.tags ?? {}).forEach(([key, value]) => {
        if (value.trim()) {
          scope.setTag(key, value);
        }
      });

      eventId = Sentry.captureEvent(
        {
          level: 'info',
          message: eventSummary,
          extra: {
            description: normalizedDescription,
            ...input.extra,
          },
        },
        { attachments }
      );
    });

    if (input.flushTimeoutMs !== undefined) {
      const client = Sentry.getClient();
      if (!client) {
        throw new Error(`Failed to flush feedback report${eventId ? ` (${eventId})` : ''}: Sentry is not initialized`);
      }

      const flushed = await client.flush(input.flushTimeoutMs);
      if (!flushed) {
        throw new Error(`Failed to flush feedback report${eventId ? ` (${eventId})` : ''}`);
      }
    }

    logFeedbackReport('info', 'submitted', {
      module: input.module,
      eventId,
      collectLogs: Boolean(input.collectLogs),
      logAttachment: summarizeLogAttachment(logAttachmentStatus, logAttachment),
      attachmentCount: attachments.length,
      attachments: summarizeAttachments(attachments),
      flushTimeoutMs: input.flushTimeoutMs,
      tagKeys: Object.keys(input.tags ?? {}),
    });
  } catch (error) {
    logFeedbackReport('error', 'failed', {
      module: input.module,
      eventId,
      collectLogs: Boolean(input.collectLogs),
      logAttachment: summarizeLogAttachment(logAttachmentStatus, logAttachment),
      attachmentCount: attachments.length,
      attachments: summarizeAttachments(attachments),
      flushTimeoutMs: input.flushTimeoutMs,
      error,
    });
    throw error;
  }
}
