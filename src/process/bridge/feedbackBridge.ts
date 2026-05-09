/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC handler for collecting and compressing recent log files
 * for the bug report feature.
 */

import crypto from 'crypto';
import { ipcMain, app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { FeedbackBinaryPayloadFile, FeedbackReportSubmitPayload } from '@/common/types/electron';
import { getOrCreateAnalyticsId } from '@process/utils/analyticsId';

/**
 * Get log file paths for the last N days.
 * Log files are named YYYY-MM-DD.log by electron-log.
 */
const getRecentLogPaths = (logsDir: string, days: number): string[] => {
  const paths: string[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const filename = `${date.toISOString().slice(0, 10)}.log`;
    const filePath = path.join(logsDir, filename);
    if (fs.existsSync(filePath)) {
      paths.push(filePath);
    }
  }

  return paths;
};

const LOG_DAYS = 3;
const FEEDBACK_CONFIG_FILE_NAME = 'feedback-cos.local.json';
const FEEDBACK_UPLOAD_ROOT_PREFIX = 'pouding-logo';
const FEEDBACK_SIGN_EXPIRE_SECONDS = 900;
let isFeedbackBridgeInitialized = false;

type FeedbackCosConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  domain: string;
};

const normalizeConfigValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const loadJsonConfigFile = (filePath: string): Partial<FeedbackCosConfig> | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    return {
      secretId: normalizeConfigValue(parsed.secretId ?? parsed.secretID ?? parsed.SecretId ?? parsed.SecretID),
      secretKey: normalizeConfigValue(parsed.secretKey ?? parsed.secretKEY ?? parsed.SecretKey ?? parsed.SecretKey),
      bucket: normalizeConfigValue(parsed.bucket ?? parsed.Bucket),
      region: normalizeConfigValue(parsed.region ?? parsed.Region),
      domain: normalizeConfigValue(parsed.domain ?? parsed.Domain),
    };
  } catch (error) {
    console.warn('[feedbackBridge] Failed to read local COS config:', error);
    return null;
  }
};

const resolveFeedbackCosConfig = (): FeedbackCosConfig | null => {
  const fileCandidates = [
    path.join(app.getPath('userData'), FEEDBACK_CONFIG_FILE_NAME),
    path.join(process.cwd(), 'resources', FEEDBACK_CONFIG_FILE_NAME),
    path.join(process.resourcesPath, FEEDBACK_CONFIG_FILE_NAME),
  ];

  const fileConfig = fileCandidates
    .map((candidate) => loadJsonConfigFile(candidate))
    .find((config) => config !== null);

  const merged = {
    secretId: normalizeConfigValue(process.env.TENCENT_COS_SECRET_ID) ?? fileConfig?.secretId,
    secretKey: normalizeConfigValue(process.env.TENCENT_COS_SECRET_KEY) ?? fileConfig?.secretKey,
    bucket: normalizeConfigValue(process.env.TENCENT_COS_BUCKET) ?? fileConfig?.bucket,
    region: normalizeConfigValue(process.env.TENCENT_COS_REGION) ?? fileConfig?.region,
    domain: normalizeConfigValue(process.env.TENCENT_COS_DOMAIN) ?? fileConfig?.domain,
  };

  if (!merged.secretId || !merged.secretKey || !merged.bucket || !merged.region || !merged.domain) {
    return null;
  }

  const normalizedDomain = /^https?:\/\//i.test(merged.domain) ? merged.domain : `https://${merged.domain}`;

  return {
    secretId: merged.secretId,
    secretKey: merged.secretKey,
    bucket: merged.bucket,
    region: merged.region,
    domain: normalizedDomain.replace(/\/+$/, ''),
  };
};

const encodeCosValue = (value: string): string =>
  encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '%20');

const buildCosFormatString = (data: Record<string, string>) => {
  const normalizedEntries = Object.entries(data)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return normalizedEntries
    .map(([key, value]) => `${encodeCosValue(key)}=${encodeCosValue(value)}`)
    .join('&');
};

const hmacSha1Hex = (key: string, value: string): string => crypto.createHmac('sha1', key).update(value).digest('hex');
const sha1Hex = (value: string): string => crypto.createHash('sha1').update(value).digest('hex');

const buildCosAuthorization = (secretId: string, secretKey: string, url: URL) => {
  const now = Math.floor(Date.now() / 1000);
  const signTime = `${now - 60};${now + FEEDBACK_SIGN_EXPIRE_SECONDS}`;
  const headerList = 'host';
  const urlParamList = '';
  const canonicalHeaders = buildCosFormatString({ host: url.host });
  const httpString = ['put', url.pathname, '', canonicalHeaders, ''].join('\n');
  const signKey = hmacSha1Hex(secretKey, signTime);
  const stringToSign = ['sha1', signTime, sha1Hex(httpString), ''].join('\n');
  const signature = hmacSha1Hex(signKey, stringToSign);

  return [
    'q-sign-algorithm=sha1',
    `q-ak=${encodeCosValue(secretId)}`,
    `q-sign-time=${signTime}`,
    `q-key-time=${signTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=${urlParamList}`,
    `q-signature=${signature}`,
  ].join('&');
};

const sanitizePathSegment = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

const buildFeedbackPrefix = (): string => {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const installationId = sanitizePathSegment(getOrCreateAnalyticsId());
  return `${FEEDBACK_UPLOAD_ROOT_PREFIX}/${installationId}/${yyyy}/${mm}/${dd}/${timestamp}-${randomSuffix}`;
};

const buildObjectUrl = (domain: string, objectKey: string): URL => {
  const encodedPath = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return new URL(`${domain}/${encodedPath}`);
};

const uploadBufferToCos = async (
  config: FeedbackCosConfig,
  objectKey: string,
  content: Buffer,
  contentType: string
): Promise<string> => {
  const targetUrl = buildObjectUrl(config.domain, objectKey);
  const response = await fetch(targetUrl, {
    method: 'PUT',
    headers: {
      Authorization: buildCosAuthorization(config.secretId, config.secretKey, targetUrl),
      Host: targetUrl.host,
      'Content-Type': contentType,
    },
    body: new Uint8Array(content),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(`COS upload failed (${response.status}): ${responseText || response.statusText}`);
  }

  return targetUrl.toString();
};

const sanitizeFeedbackFilename = (filename: string): string =>
  filename
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'file.bin';

const toFeedbackBuffer = (file: FeedbackBinaryPayloadFile): Buffer => Buffer.from(file.data);

const capturePageWithDebugger = async (browserWindow: BrowserWindow): Promise<Buffer | null> => {
  const debuggerClient = browserWindow.webContents.debugger;
  if (!debuggerClient) {
    return null;
  }

  const shouldDetach = !debuggerClient.isAttached();

  try {
    if (shouldDetach) {
      debuggerClient.attach('1.3');
    }

    await debuggerClient.sendCommand('Page.enable');
    const result = (await debuggerClient.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })) as { data?: string };

    if (!result.data) {
      return null;
    }

    return Buffer.from(result.data, 'base64');
  } catch (error) {
    console.warn('[feedbackBridge] Debugger screenshot failed, falling back to capturePage:', error);
    return null;
  } finally {
    if (shouldDetach) {
      try {
        debuggerClient.detach();
      } catch {
        // Ignore detach failures.
      }
    }
  }
};

const handleCollectLogs = async () => {
  try {
    let logsDir: string;
    try {
      logsDir = app.getPath('logs');
    } catch {
      logsDir = path.join(app.getPath('userData'), 'logs');
    }

    if (!fs.existsSync(logsDir)) {
      return null;
    }

    const logPaths = getRecentLogPaths(logsDir, LOG_DAYS);
    if (logPaths.length === 0) {
      return null;
    }

    // Read and concatenate all log files with date headers
    const parts: string[] = [];
    for (const logPath of logPaths) {
      const basename = path.basename(logPath);
      const content = fs.readFileSync(logPath, 'utf-8');
      parts.push(`=== ${basename} ===\n${content}\n`);
    }

    const combined = parts.join('\n');
    const compressed = zlib.gzipSync(Buffer.from(combined, 'utf-8'));

    // Return as number array for IPC serialization (Buffer is not serializable)
    return {
      filename: 'logs.gz',
      data: Array.from(compressed),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to collect logs:', error);
    return null;
  }
};

const handleCaptureCurrentPage = async (event: Electron.IpcMainInvokeEvent) => {
  try {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) {
      return null;
    }

    const pngBuffer =
      (await capturePageWithDebugger(browserWindow)) ?? (await browserWindow.webContents.capturePage()).toPNG();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    return {
      filename: `page-screenshot-${timestamp}.png`,
      data: Array.from(pngBuffer),
      type: 'image/png',
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to capture current page screenshot:', error);
    return null;
  }
};

const handleSubmitFeedbackReport = async (payload: FeedbackReportSubmitPayload) => {
  try {
    const config = resolveFeedbackCosConfig();
    if (!config) {
      throw new Error('feedback upload is not configured');
    }

    const prefix = buildFeedbackPrefix();
    const uploadedFiles: string[] = [];

    const installationId = getOrCreateAnalyticsId();
    const metadata = {
      module: payload.module,
      description: payload.description,
      appName: app.getName(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      submittedAt: new Date().toISOString(),
      installationId,
      screenshots: payload.screenshots.map((file) => file.filename),
      hasLogFile: Boolean(payload.logFile),
    };

    const metadataUrl = await uploadBufferToCos(
      config,
      `${prefix}/metadata.json`,
      Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8'),
      'application/json; charset=utf-8'
    );
    uploadedFiles.push(metadataUrl);

    if (payload.logFile) {
      uploadedFiles.push(
        await uploadBufferToCos(
          config,
          `${prefix}/${sanitizeFeedbackFilename(payload.logFile.filename)}`,
          toFeedbackBuffer(payload.logFile),
          payload.logFile.type || 'application/octet-stream'
        )
      );
    }

    for (const screenshot of payload.screenshots) {
      uploadedFiles.push(
        await uploadBufferToCos(
          config,
          `${prefix}/${sanitizeFeedbackFilename(screenshot.filename)}`,
          toFeedbackBuffer(screenshot),
          screenshot.type || 'application/octet-stream'
        )
      );
    }

    return {
      success: true,
      data: {
        reportUrl: metadataUrl,
        uploadedFiles,
      },
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to submit feedback report:', error);
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'feedback submit failed',
    };
  }
};

export function initFeedbackBridge(): void {
  if (isFeedbackBridgeInitialized) {
    return;
  }

  ipcMain.handle('feedback:collect-logs', handleCollectLogs);
  ipcMain.handle('feedback:capture-current-page', handleCaptureCurrentPage);
  ipcMain.handle('feedback:submit-report', (_event, payload: FeedbackReportSubmitPayload) =>
    handleSubmitFeedbackReport(payload)
  );
  isFeedbackBridgeInitialized = true;
}
