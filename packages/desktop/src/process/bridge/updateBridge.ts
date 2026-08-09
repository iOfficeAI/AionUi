/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  AutoUpdateReadyResult,
  UpdateCheckResult,
  UpdateDownloadCancelRequest,
  UpdateDownloadProgressEvent,
  UpdateDownloadRequest,
  UpdateDownloadResult,
  UpdateReleaseInfo,
  GitHubReleaseAsset,
  InstallerLastFailureMarker,
} from '@/common/update/updateTypes';
import { uuid } from '@/common/utils';
import { app } from 'electron';
import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import semver from 'semver';
import { autoUpdaterService } from '../services/autoUpdaterService';
import { consumeInstallerLastFailure } from '../services/installerLastFailure';
import { DEFAULT_GITHUB_REPO, normalizeInternalUpdateBaseUrl, resolveUpdateSourceConfig } from '../services/updateFeed';

/** Lazily loads i18n to avoid pulling in initStorage chain at module load time */
let _i18nCache: Promise<typeof import('../services/i18n')> | null = null;
const getI18n = async () => {
  if (!_i18nCache) {
    _i18nCache = import('../services/i18n');
  }
  const m = await _i18nCache;
  return m.default;
};

type GitHubReleaseApiAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  content_type?: string;
};

type GitHubReleaseApi = {
  tag_name: string;
  name?: string;
  body?: string;
  html_url: string;
  published_at?: string;
  prerelease: boolean;
  draft: boolean;
  assets?: GitHubReleaseApiAsset[];
};

/** Parameters for auto-update check via electron-updater */
interface AutoUpdateCheckParams {
  /** Whether to include prerelease/dev builds in update check */
  includePrerelease?: boolean;
}

const DEFAULT_REPO = DEFAULT_GITHUB_REPO;
const DEFAULT_USER_AGENT = 'CSBU WorkMate';
const ALLOWED_ASSET_EXTS = new Set(['.exe', '.msi', '.dmg', '.zip', '.deb', '.rpm']);
const ALLOWED_DOWNLOAD_HOSTS = new Set<string>([
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
const MAX_REDIRECTS = 8;

const isAllowedAssetName = (name: string) => {
  const ext = path.extname(name);
  return ALLOWED_ASSET_EXTS.has(ext);
};

const normalizeTagToSemver = (tag: string): string | null => {
  const trimmed = tag.trim();
  const withoutV = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  // Ensure it looks like a semver prefix at least.
  if (!/^\d+\.\d+\.\d+/.test(withoutV)) return null;
  return semver.valid(withoutV);
};

/** Map GitHub API release data to the renderer-facing update model. */
const mapGitHubRelease = (release: GitHubReleaseApi): UpdateReleaseInfo | null => {
  const version = normalizeTagToSemver(release.tag_name);
  if (!version) return null;
  const assets = (release.assets ?? [])
    .filter((asset) => isAllowedAssetName(asset.name))
    .map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      contentType: asset.content_type,
    }));
  return {
    tagName: release.tag_name,
    version,
    name: release.name,
    body: release.body,
    htmlUrl: release.html_url,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    draft: release.draft,
    assets,
    recommendedAsset: pickRecommendedAsset(assets),
  };
};

type RuntimePlatformInfo = {
  platform: NodeJS.Platform;
  arch: string;
};

type CanonicalArch = 'x64' | 'arm64' | 'ia32';

const normalizeArch = (arch: string): CanonicalArch => {
  if (arch === 'arm64') return 'arm64';
  if (arch === 'ia32' || arch === 'x32') return 'ia32';
  return 'x64';
};

const detectAssetArchs = (nameLower: string): Set<CanonicalArch> => {
  const detected = new Set<CanonicalArch>();

  if (/\b(arm64|aarch64)\b/.test(nameLower)) detected.add('arm64');
  if (/\b(x64|x86_64|amd64)\b/.test(nameLower)) detected.add('x64');

  const hasX86Token = /\bx86\b/.test(nameLower) && !/\bx86[_-]?64\b/.test(nameLower);
  if (/\b(ia32|x32|32bit)\b/.test(nameLower) || hasX86Token) detected.add('ia32');

  return detected;
};

const getPlatformHints = (runtime: RuntimePlatformInfo = { platform: process.platform, arch: process.arch }) => {
  const platform = runtime.platform;
  const arch = runtime.arch;
  const normalizedArch = normalizeArch(arch);

  const archHints =
    normalizedArch === 'arm64'
      ? ['arm64', 'aarch64']
      : normalizedArch === 'ia32'
        ? ['ia32', 'x86', 'x32', '32bit']
        : ['x64', 'x86_64', 'amd64'];

  // electron-builder artifact names often include one of these
  const platformHints =
    platform === 'win32' ? ['win', 'win32', 'windows'] : platform === 'darwin' ? ['mac', 'darwin', 'osx'] : ['linux'];

  return { platform, arch, normalizedArch, archHints, platformHints };
};

const scoreAsset = (asset: GitHubReleaseAsset, runtime?: RuntimePlatformInfo): number => {
  const { platform, normalizedArch, archHints, platformHints } = getPlatformHints(runtime);
  const nameLower = asset.name.toLowerCase();
  const ext = path.extname(asset.name);

  const detectedArchs = detectAssetArchs(nameLower);
  if (detectedArchs.size > 0 && !detectedArchs.has(normalizedArch)) {
    return -1;
  }

  let score = 0;

  // Platform match
  if (platformHints.some((hint) => nameLower.includes(hint))) score += 20;

  // Arch match
  if (archHints.some((hint) => nameLower.includes(hint))) score += 10;
  if (detectedArchs.has(normalizedArch)) score += 15;

  // Prefer installer formats per platform
  if (platform === 'win32') {
    if (ext === '.exe') score += 100;
    if (ext === '.msi') score += 90;
    if (ext === '.zip') score += 50;
  } else if (platform === 'darwin') {
    if (ext === '.dmg') score += 100;
    if (ext === '.zip') score += 70;
  } else {
    if (ext === '.deb') score += 100;
    if (ext === '.rpm') score += 80;
    if (ext === '.zip') score += 40;
  }

  return score;
};

export const pickRecommendedAsset = (
  assets: GitHubReleaseAsset[],
  runtime?: RuntimePlatformInfo
): GitHubReleaseAsset | undefined => {
  if (!assets.length) return undefined;

  const scored = assets
    .map((asset) => ({ asset, score: scoreAsset(asset, runtime) }))
    .filter((item) => item.score >= 0)
    .toSorted((a, b) => b.score - a.score);

  return scored[0]?.asset;
};

const resolveRepo = (): string => {
  const envRepo = app.isPackaged ? undefined : process.env.CSBU_WORKMATE_GITHUB_REPO?.trim();
  return envRepo || DEFAULT_REPO;
};

const assertAllowedUrl = async (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error((await getI18n()).t('update.errors.invalidUrl'));
  }

  if (parsed.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) return;

  let source;
  try {
    source = resolveUpdateSourceConfig({ isPackaged: app.isPackaged });
  } catch {
    source = undefined;
  }
  if (source?.kind === 'internal-http' && parsed.protocol === 'http:') {
    const configured = new URL(normalizeInternalUpdateBaseUrl(source.baseUrl));
    if (
      parsed.origin === configured.origin &&
      parsed.pathname.startsWith(`${configured.pathname.replace(/\/$/, '')}/`)
    ) {
      return;
    }
  }
  if (parsed.protocol !== 'https:') {
    throw new Error((await getI18n()).t('update.errors.httpsOnly'));
  }
  if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
    throw new Error((await getI18n()).t('update.errors.hostNotAllowed', { host: parsed.hostname }));
  }
};

const fetchWithAllowlistedRedirects = async (rawUrl: string, signal: AbortSignal): Promise<Response> => {
  let current = rawUrl;
  const initialUrl = new URL(rawUrl);
  const internalOrigin = initialUrl.protocol === 'http:' ? initialUrl.origin : undefined;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertAllowedUrl(current);

    const res = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error((await getI18n()).t('update.errors.redirectNoLocation'));
      }
      const redirected = new URL(location, current);
      if (internalOrigin && redirected.origin !== internalOrigin) {
        throw new Error((await getI18n()).t('update.errors.hostNotAllowed', { host: redirected.hostname }));
      }
      current = redirected.toString();
      continue;
    }

    return res;
  }

  throw new Error((await getI18n()).t('update.errors.tooManyRedirects'));
};

const fetchGitHubReleases = async (repo: string, timeoutMs = 30000): Promise<GitHubReleaseApi[]> => {
  const url = `https://api.github.com/repos/${repo}/releases`;

  // 添加超时控制，防止网络问题导致无限等待 / Add timeout to prevent infinite wait on network issues
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': DEFAULT_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error((await getI18n()).t('update.errors.githubApiFailed', { status: res.status }));
    }

    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) {
      throw new Error((await getI18n()).t('update.errors.githubApiNotArray'));
    }
    return json as GitHubReleaseApi[];
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error((await getI18n()).t('update.errors.githubApiTimeout'), { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

type DownloadState = {
  abortController: AbortController;
  file_path: string;
};

type ActiveManualDownload = {
  downloadId: string;
  file_path: string;
};

const downloads = new Map<string, DownloadState>();
const activeManualDownloads = new Map<string, ActiveManualDownload>();
const manualDownloadKeysById = new Map<string, string>();
const cancelledManualDownloadIds = new Set<string>();

const sanitizeFileName = (name: string): string => {
  // Keep only base name and trim weird whitespace.
  const base = path.basename(name).trim();
  // Avoid empty names.
  return base || `CSBU-WorkMate-update-${Date.now()}`;
};

const ensureUniquePath = (target: string): string => {
  if (!fs.existsSync(target)) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; i < 1000; i++) {
    const next = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(next)) return next;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
};

const buildManualDownloadKey = (url: string, fallbackUrl: string | undefined, fileName: string): string => {
  const primary = new URL(url).toString();
  const fallback = fallbackUrl ? new URL(fallbackUrl).toString() : '';
  return [primary, fallback, fileName].join('\n');
};

const emitProgress = (evt: UpdateDownloadProgressEvent) => {
  ipcBridge.update.downloadProgress.emit(evt);
};

const cleanupManualDownload = (downloadId: string) => {
  downloads.delete(downloadId);
  const activeKey = manualDownloadKeysById.get(downloadId);
  if (activeKey) {
    activeManualDownloads.delete(activeKey);
    manualDownloadKeysById.delete(downloadId);
  }
};

type DownloadAttempt = {
  ok: boolean;
  isAbort: boolean;
  message: string;
  receivedBytes: number;
  totalBytes?: number;
};

/**
 * Attempt to download from a single URL into `file_path`.
 * Emits `starting`/`downloading` progress events but NOT the terminal
 * completed/error/cancelled events — the caller decides whether to retry
 * or surface the final state.
 */
const attemptDownload = async (
  downloadId: string,
  url: string,
  file_path: string,
  abortController: AbortController
): Promise<DownloadAttempt> => {
  let receivedBytes = 0;
  let totalBytes: number | undefined;

  const startedAt = Date.now();
  let lastEmitAt = 0;

  const emitThrottled = (status: UpdateDownloadProgressEvent['status']) => {
    const now = Date.now();
    const shouldEmit = now - lastEmitAt >= 250 || status !== 'downloading';
    if (!shouldEmit) return;

    const elapsedSec = Math.max(0.001, (now - startedAt) / 1000);
    const bytesPerSecond = receivedBytes / elapsedSec;
    const percent = totalBytes ? Math.min(100, (receivedBytes / totalBytes) * 100) : undefined;

    lastEmitAt = now;
    emitProgress({
      downloadId,
      status,
      receivedBytes,
      totalBytes,
      percent,
      bytesPerSecond,
    });
  };

  emitThrottled('starting');

  log.info('[update-download] Downloading from URL:', url);

  let stream: fs.WriteStream | null = null;
  try {
    const res = await fetchWithAllowlistedRedirects(url, abortController.signal);

    if (!res.ok) {
      throw new Error((await getI18n()).t('update.errors.downloadFailed', { status: res.status }));
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const parsed = parseInt(contentLengthHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        totalBytes = parsed;
      }
    }

    if (!res.body) {
      throw new Error((await getI18n()).t('update.errors.downloadNoBody'));
    }

    stream = fs.createWriteStream(file_path);
    const reader = res.body.getReader();

    let doneReading = false;
    while (!doneReading) {
      const { done, value } = await reader.read();
      doneReading = done;
      if (doneReading) break;
      if (!value) continue;

      receivedBytes += value.byteLength;

      const buf = Buffer.from(value);
      if (!stream.write(buf)) {
        await new Promise<void>((resolve) => stream?.once('drain', () => resolve()));
      }

      emitThrottled('downloading');
    }

    await new Promise<void>((resolve, reject) => {
      if (!stream) {
        resolve();
        return;
      }
      stream.end(() => resolve());
      stream.on('error', reject);
    });

    return { ok: true, isAbort: false, message: '', receivedBytes, totalBytes };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = abortController.signal.aborted || message.toLowerCase().includes('aborted');

    try {
      stream?.close();
    } catch {
      // ignore
    }

    // Remove partial file before retrying or reporting failure.
    try {
      if (fs.existsSync(file_path)) {
        fs.rmSync(file_path, { force: true });
      }
    } catch {
      // ignore
    }

    return { ok: false, isAbort, message, receivedBytes, totalBytes };
  }
};

const startDownloadInBackground = async (
  downloadId: string,
  url: string,
  file_path: string,
  abortController: AbortController,
  fallbackUrl?: string
) => {
  const runWithFallback = async (): Promise<DownloadAttempt> => {
    const primary = await attemptDownload(downloadId, url, file_path, abortController);
    if (primary.ok) return primary;
    if (primary.isAbort) return primary;
    if (!fallbackUrl || fallbackUrl === url) return primary;

    try {
      await assertAllowedUrl(fallbackUrl);
    } catch (err) {
      // Fallback URL itself is invalid — keep the primary failure result.
      log.warn('[update-download] Fallback URL rejected by allowlist:', err);
      return primary;
    }

    log.warn(`[update-download] Primary download failed (${primary.message}). Retrying with fallback URL.`);
    return attemptDownload(downloadId, fallbackUrl, file_path, abortController);
  };

  const finalResult = await runWithFallback();

  try {
    if (cancelledManualDownloadIds.has(downloadId)) {
      return;
    }
    if (finalResult.ok) {
      emitProgress({
        downloadId,
        status: 'completed',
        receivedBytes: finalResult.receivedBytes,
        totalBytes: finalResult.totalBytes,
        percent: finalResult.totalBytes
          ? Math.min(100, (finalResult.receivedBytes / finalResult.totalBytes) * 100)
          : undefined,
        file_path,
      });
    } else {
      emitProgress({
        downloadId,
        status: finalResult.isAbort ? 'cancelled' : 'error',
        receivedBytes: finalResult.receivedBytes,
        totalBytes: finalResult.totalBytes,
        error: finalResult.message,
      });
    }
  } finally {
    cleanupManualDownload(downloadId);
    cancelledManualDownloadIds.delete(downloadId);
  }
};

/**
 * Create a status broadcast callback that sends updates via ipcBridge.autoUpdate.status.emit.
 * This is a pure emitter: it does not bind to any specific window.
 * The ipcBridge channel broadcasts to all renderer listeners, so no window guard is needed here.
 */
export function createAutoUpdateStatusBroadcast(): (
  status: import('../services/autoUpdaterService').AutoUpdateStatus
) => void {
  return (status) => {
    ipcBridge.autoUpdate.status.emit(status);
  };
}

let updateBridgeInitialized = false;

export function initUpdateBridge(): void {
  if (updateBridgeInitialized) return;
  updateBridgeInitialized = true;
  ipcBridge.update.consumeInstallerLastFailure.provider(
    async (): Promise<{ success: boolean; data: InstallerLastFailureMarker | null; msg?: string }> => {
      try {
        return {
          success: true,
          data: await consumeInstallerLastFailure({ appDataDir: app.getPath('appData') }),
        };
      } catch (err: unknown) {
        return { success: false, data: null, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcBridge.update.check.provider(
    async (params): Promise<{ success: boolean; data?: UpdateCheckResult; msg?: string }> => {
      try {
        const repo = resolveRepo();
        const currentVersion = app.getVersion();

        // Update comparisons use the packaged application version and the selected source version.
        // Prereleases remain manual-only; stable packaged Windows builds can auto-install.
        const currentSemver = semver.valid(currentVersion) || semver.coerce(currentVersion)?.version;
        if (!currentSemver) {
          return {
            success: true,
            data: {
              currentVersion,
              updateAvailable: false,
              autoUpdateAvailable: false,
              updatePolicy: { mode: 'optional' },
            },
          };
        }

        const includePrerelease = Boolean(params?.includePrerelease);
        let autoUpdateInfo: UpdateCheckResult['autoUpdateInfo'];
        let updatePolicy: UpdateCheckResult['updatePolicy'] = { mode: 'optional' };
        if (app.isPackaged && process.platform === 'win32' && !includePrerelease) {
          autoUpdaterService.setAllowPrerelease(false);
          const autoResult = await autoUpdaterService.checkForUpdates();
          if (autoResult.success && autoResult.updateInfo) {
            updatePolicy = autoResult.updatePolicy ?? { mode: 'optional' };
            autoUpdateInfo = {
              version: autoResult.updateInfo.version,
              releaseDate: autoResult.updateInfo.releaseDate,
              releaseNotes:
                typeof autoResult.updateInfo.releaseNotes === 'string' ? autoResult.updateInfo.releaseNotes : undefined,
            };
          } else if (!autoResult.success) {
            log.warn('[manual-update] Automatic update check failed; using GitHub manual fallback', autoResult.error);
          }
        }

        let releases: GitHubReleaseApi[] = [];
        try {
          releases = await fetchGitHubReleases(repo);
        } catch (error) {
          if (!autoUpdateInfo) throw error;
          log.warn('[manual-update] GitHub metadata enrichment failed', error);
        }

        const candidates = releases
          .filter((release) => !release.draft && (includePrerelease || !release.prerelease))
          .map(mapGitHubRelease)
          .filter((release): release is UpdateReleaseInfo => Boolean(release))
          .toSorted((a, b) => semver.rcompare(a.version, b.version));
        let latest = autoUpdateInfo
          ? candidates.find((release) => release.version === autoUpdateInfo.version)
          : candidates[0];

        if (autoUpdateInfo && !latest) {
          latest = {
            tagName: `v${autoUpdateInfo.version}`,
            version: autoUpdateInfo.version,
            body: autoUpdateInfo.releaseNotes,
            htmlUrl: `https://github.com/${repo}/releases/tag/v${autoUpdateInfo.version}`,
            publishedAt: autoUpdateInfo.releaseDate,
            prerelease: false,
            draft: false,
            assets: [],
          };
        }

        const updateAvailable = Boolean(latest && semver.gt(latest.version, currentSemver));

        return {
          success: true,
          data: {
            currentVersion,
            updateAvailable,
            latest,
            autoUpdateAvailable: Boolean(autoUpdateInfo && semver.gt(autoUpdateInfo.version, currentSemver)),
            updatePolicy,
            autoUpdateInfo,
          },
        };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcBridge.update.download.provider(
    async (params: UpdateDownloadRequest): Promise<{ success: boolean; data?: UpdateDownloadResult; msg?: string }> => {
      try {
        if (!params?.url) {
          return { success: false, msg: (await getI18n()).t('update.errors.missingUrl') };
        }

        // Defense-in-depth: do not allow arbitrary downloads from renderer.
        // EN: Only the configured internal origin and GitHub release hosts are permitted;
        // each redirect hop is re-validated against the allowlist.
        // 中文：仅允许配置的内网源和 GitHub Release 相关域名，并校验每一跳重定向。
        await assertAllowedUrl(params.url);
        if (params.fallbackUrl) {
          await assertAllowedUrl(params.fallbackUrl);
        }

        const downloadId = params.downloadId || uuid();
        const abortController = new AbortController();

        const downloadsDir = app.getPath('downloads');
        const urlObj = new URL(params.url);
        const urlName = path.basename(urlObj.pathname);
        const baseName = sanitizeFileName(params.file_name || urlName);
        const activeKey = buildManualDownloadKey(params.url, params.fallbackUrl, baseName);
        const activeDownload = activeManualDownloads.get(activeKey);
        if (activeDownload) {
          return Promise.resolve({ success: true, data: activeDownload });
        }

        const targetPath = ensureUniquePath(path.join(downloadsDir, baseName));
        downloads.set(downloadId, { abortController, file_path: targetPath });
        activeManualDownloads.set(activeKey, { downloadId, file_path: targetPath });
        manualDownloadKeysById.set(downloadId, activeKey);

        // Start background download, but return immediately so the UI stays responsive.
        void startDownloadInBackground(downloadId, params.url, targetPath, abortController, params.fallbackUrl);

        return Promise.resolve({ success: true, data: { downloadId, file_path: targetPath } });
      } catch (err: unknown) {
        return Promise.resolve({ success: false, msg: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  ipcBridge.update.cancelDownload.provider(
    async (params: UpdateDownloadCancelRequest): Promise<{ success: boolean; msg?: string }> => {
      try {
        const downloadId = params?.downloadId;
        if (!downloadId) {
          return { success: false, msg: (await getI18n()).t('update.errors.missingDownloadId') };
        }

        const activeDownload = downloads.get(downloadId);
        if (!activeDownload) {
          return { success: true };
        }

        cancelledManualDownloadIds.add(downloadId);
        activeDownload.abortController.abort();
        emitProgress({
          downloadId,
          status: 'cancelled',
          receivedBytes: 0,
          file_path: activeDownload.file_path,
        });
        cleanupManualDownload(downloadId);

        return { success: true };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // Auto-updater IPC handlers (electron-updater)
  ipcBridge.autoUpdate.check.provider(
    async (
      params: AutoUpdateCheckParams
    ): Promise<{
      success: boolean;
      data?: { updateInfo?: { version: string; releaseDate?: string; releaseNotes?: string } };
      msg?: string;
    }> => {
      try {
        // Set prerelease preference before checking
        const includePrerelease = Boolean(params?.includePrerelease);
        autoUpdaterService.setAllowPrerelease(includePrerelease);

        const result = await autoUpdaterService.checkForUpdates();
        if (result.success && result.updateInfo) {
          // autoUpdaterService.checkForUpdates() only returns updateInfo when
          // electron-updater confirms isUpdateAvailable, so we can trust it directly.
          return {
            success: true,
            data: {
              updateInfo: {
                version: result.updateInfo.version,
                releaseDate: result.updateInfo.releaseDate,
                releaseNotes:
                  typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined,
              },
            },
          };
        }
        return { success: result.success, msg: result.error };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcBridge.autoUpdate.download.provider(async (): Promise<{ success: boolean; msg?: string }> => {
    try {
      const result = await autoUpdaterService.downloadUpdate();
      return { success: result.success, msg: result.error };
    } catch (err: unknown) {
      return { success: false, msg: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcBridge.autoUpdate.restoreDownloaded.provider(
    async (): Promise<{ success: boolean; data: AutoUpdateReadyResult; msg?: string }> => {
      try {
        const result = await autoUpdaterService.restoreDownloadedUpdateIfAvailable();
        return { success: result.success, data: result.data, msg: result.error };
      } catch (err: unknown) {
        return {
          success: false,
          data: { ready: false },
          msg: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  ipcBridge.autoUpdate.cancelDownload.provider(async (): Promise<{ success: boolean; msg?: string }> => {
    try {
      const result = await autoUpdaterService.cancelDownload();
      return { success: result.success, msg: result.error };
    } catch (err: unknown) {
      return { success: false, msg: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcBridge.autoUpdate.quitAndInstall.provider(async (): Promise<void> => {
    await autoUpdaterService.quitAndInstall();
  });
}
