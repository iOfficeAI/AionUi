/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { UpdateCheckResult, UpdateDownloadProgressEvent, UpdateDownloadRequest, UpdateDownloadResult, UpdateReleaseInfo, GitHubReleaseAsset } from '@/common/updateTypes';
import { uuid } from '@/common/utils';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import semver from 'semver';

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

const DEFAULT_REPO = 'iOfficeAI/AionUi';
const DEFAULT_USER_AGENT = 'AionUi';
const ALLOWED_ASSET_EXTS = ['.exe', '.msi', '.dmg', '.zip', '.AppImage', '.deb', '.rpm'];
const ALLOWED_DOWNLOAD_HOSTS = new Set<string>(['github.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com', 'release-assets.githubusercontent.com']);
const MAX_REDIRECTS = 8;

type UpdateState = {
  lastDownloadedTag?: string;
  lastDownloadedVersion?: string;
  lastDownloadedAt?: number;
};

const isAllowedAssetName = (name: string) => {
  const ext = path.extname(name);
  return ALLOWED_ASSET_EXTS.includes(ext);
};

const normalizeTagToSemver = (tag: string): string | null => {
  const trimmed = tag.trim();
  const withoutV = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  // Ensure it looks like a semver prefix at least.
  if (!/^\d+\.\d+\.\d+/.test(withoutV)) return null;
  return semver.valid(withoutV);
};

const mapAsset = (asset: GitHubReleaseApiAsset): GitHubReleaseAsset => ({
  name: asset.name,
  url: asset.browser_download_url,
  size: asset.size,
  contentType: asset.content_type,
});

const getPlatformHints = () => {
  const platform = process.platform;
  const arch = process.arch;

  const archHints = arch === 'arm64' ? ['arm64', 'aarch64'] : ['x64', 'x86_64', 'amd64'];

  // electron-builder artifact names often include one of these
  const platformHints = platform === 'win32' ? ['win', 'win32', 'windows'] : platform === 'darwin' ? ['mac', 'darwin', 'osx'] : ['linux'];

  return { platform, arch, archHints, platformHints };
};

const scoreAsset = (asset: GitHubReleaseAsset): number => {
  const { platform, archHints, platformHints } = getPlatformHints();
  const nameLower = asset.name.toLowerCase();
  const ext = path.extname(asset.name);

  let score = 0;

  // Platform match
  if (platformHints.some((hint) => nameLower.includes(hint))) score += 20;

  // Arch match
  if (archHints.some((hint) => nameLower.includes(hint))) score += 10;

  // Prefer installer formats per platform
  if (platform === 'win32') {
    if (ext === '.exe') score += 100;
    if (ext === '.msi') score += 90;
    if (ext === '.zip') score += 50;
  } else if (platform === 'darwin') {
    if (ext === '.dmg') score += 100;
    if (ext === '.zip') score += 70;
  } else {
    if (ext === '.AppImage') score += 100;
    if (ext === '.deb') score += 90;
    if (ext === '.rpm') score += 80;
    if (ext === '.zip') score += 40;
  }

  return score;
};

const pickRecommendedAsset = (assets: GitHubReleaseAsset[]): GitHubReleaseAsset | undefined => {
  if (!assets.length) return undefined;
  const scored = [...assets].sort((a, b) => scoreAsset(b) - scoreAsset(a));
  return scored[0];
};

const resolveRepo = (requestRepo?: string): string => {
  const envRepo = process.env.AIONUI_GITHUB_REPO?.trim();
  const repo = (requestRepo || envRepo || DEFAULT_REPO).trim();
  return repo || DEFAULT_REPO;
};

const getUpdateStatePath = () => path.join(app.getPath('userData'), 'update-state.json');

const loadUpdateState = (): UpdateState => {
  try {
    const filePath = getUpdateStatePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as UpdateState;
  } catch {
    return {};
  }
};

const saveUpdateState = (next: UpdateState) => {
  try {
    const filePath = getUpdateStatePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  } catch {
    // ignore
  }
};

const assertAllowedUrl = (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid download URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only https download URLs are allowed');
  }
  if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
    throw new Error(`Download host not allowed: ${parsed.hostname}`);
  }
};

const fetchWithAllowlistedRedirects = async (rawUrl: string, signal: AbortSignal): Promise<Response> => {
  let current = rawUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertAllowedUrl(current);

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
        throw new Error(`Redirect (${res.status}) missing location header`);
      }
      current = new URL(location, current).toString();
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects while downloading');
};

const fetchGitHubReleases = async (repo: string): Promise<GitHubReleaseApi[]> => {
  const url = `https://api.github.com/repos/${repo}/releases`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': DEFAULT_USER_AGENT,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub releases request failed (${res.status}): ${body || res.statusText}`);
  }

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) {
    throw new Error('GitHub releases response is not an array');
  }
  return json as GitHubReleaseApi[];
};

const mapRelease = (rel: GitHubReleaseApi): UpdateReleaseInfo | null => {
  const version = normalizeTagToSemver(rel.tag_name);
  if (!version) return null;

  const assets = (rel.assets || [])
    .filter((asset) => asset && asset.name && asset.browser_download_url)
    .filter((asset) => isAllowedAssetName(asset.name))
    .map(mapAsset);

  return {
    tagName: rel.tag_name,
    version,
    name: rel.name,
    body: rel.body,
    htmlUrl: rel.html_url,
    publishedAt: rel.published_at,
    prerelease: Boolean(rel.prerelease),
    draft: Boolean(rel.draft),
    assets,
    recommendedAsset: pickRecommendedAsset(assets),
  };
};

type DownloadState = {
  abortController: AbortController;
  filePath: string;
  tagName?: string;
  version?: string;
};

const downloads = new Map<string, DownloadState>();

const sanitizeFileName = (name: string): string => {
  // Keep only base name and trim weird whitespace.
  const base = path.basename(name).trim();
  // Avoid empty names.
  return base || `AionUi-update-${Date.now()}`;
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

const emitProgress = (evt: UpdateDownloadProgressEvent) => {
  ipcBridge.update.downloadProgress.emit(evt);
};

const startDownloadInBackground = async (downloadId: string, url: string, filePath: string, abortController: AbortController) => {
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
      filePath: status === 'completed' ? filePath : undefined,
    });
  };

  emitThrottled('starting');

  let stream: fs.WriteStream | null = null;
  try {
    const res = await fetchWithAllowlistedRedirects(url, abortController.signal);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Download failed (${res.status}): ${body || res.statusText}`);
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const parsed = parseInt(contentLengthHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        totalBytes = parsed;
      }
    }

    if (!res.body) {
      throw new Error('Download response has no body');
    }

    stream = fs.createWriteStream(filePath);
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

    emitThrottled('completed');

    // Persist last downloaded tag/version for dev/prerelease semantics.
    const state = downloads.get(downloadId);
    if (state?.tagName || state?.version) {
      saveUpdateState({
        lastDownloadedTag: state.tagName,
        lastDownloadedVersion: state.version,
        lastDownloadedAt: Date.now(),
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = abortController.signal.aborted || message.toLowerCase().includes('aborted');

    try {
      stream?.close();
    } catch {
      // ignore
    }

    // Remove partial file
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    } catch {
      // ignore
    }

    emitProgress({
      downloadId,
      status: isAbort ? 'cancelled' : 'error',
      receivedBytes,
      totalBytes,
      error: message,
    });
  } finally {
    downloads.delete(downloadId);
  }
};

export function initUpdateBridge(): void {
  ipcBridge.update.check.provider(async (params): Promise<{ success: boolean; data?: UpdateCheckResult; msg?: string }> => {
    try {
      const repo = resolveRepo(params?.repo);
      const includePrerelease = Boolean(params?.includePrerelease);
      const currentVersion = app.getVersion();
      const updateState = includePrerelease ? loadUpdateState() : {};

      const releases = await fetchGitHubReleases(repo);
      const candidates = releases
        .filter((r) => r && !r.draft)
        .filter((r) => (includePrerelease ? true : !r.prerelease))
        .map(mapRelease)
        .filter((r): r is UpdateReleaseInfo => Boolean(r));

      const currentSemver = semver.valid(currentVersion) || semver.coerce(currentVersion)?.version;
      if (!currentSemver) {
        return { success: true, data: { currentVersion, updateAvailable: false } };
      }

      const latest = candidates.filter((r) => semver.valid(r.version)).sort((a, b) => semver.rcompare(a.version, b.version))[0];

      if (!latest) {
        return { success: true, data: { currentVersion, updateAvailable: false } };
      }

      const lastDownloadedTag = updateState.lastDownloadedTag;
      const rememberedVersion = updateState.lastDownloadedVersion;

      // Default: strict semver comparison.
      let updateAvailable = semver.gt(latest.version, currentSemver);

      // If we have a remembered prerelease version (because CI may not inject it into app.getVersion()),
      // treat it as the baseline in prerelease mode.
      if (includePrerelease && rememberedVersion && semver.valid(rememberedVersion)) {
        updateAvailable = semver.gt(latest.version, rememberedVersion);
      }

      // Special-case: opt-in prerelease/dev updates even when current app version is stable and
      // latest prerelease shares the same base version.
      const currentBase = semver.coerce(currentSemver)?.version;
      const latestBase = semver.coerce(latest.version)?.version;
      const optedInSameBasePrerelease = includePrerelease && latest.prerelease && Boolean(currentBase) && Boolean(latestBase) && currentBase === latestBase;
      if (optedInSameBasePrerelease) {
        updateAvailable = lastDownloadedTag ? lastDownloadedTag !== latest.tagName : true;
      }
      return {
        success: true,
        data: {
          currentVersion,
          updateAvailable,
          latest,
        },
      };
    } catch (err: unknown) {
      return { success: false, msg: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcBridge.update.download.provider((params: UpdateDownloadRequest): Promise<{ success: boolean; data?: UpdateDownloadResult; msg?: string }> => {
    try {
      if (!params?.url) {
        return Promise.resolve({ success: false, msg: 'missing url' });
      }

      // Defense-in-depth: do not allow arbitrary downloads from renderer.
      assertAllowedUrl(params.url);

      const downloadId = uuid();
      const abortController = new AbortController();

      const downloadsDir = app.getPath('downloads');
      const urlObj = new URL(params.url);
      const urlName = path.basename(urlObj.pathname);
      const baseName = sanitizeFileName(params.fileName || urlName);

      const targetPath = ensureUniquePath(path.join(downloadsDir, baseName));
      downloads.set(downloadId, { abortController, filePath: targetPath, tagName: params.tagName, version: params.version });

      // Start background download, but return immediately so the UI stays responsive.
      void startDownloadInBackground(downloadId, params.url, targetPath, abortController);

      return Promise.resolve({ success: true, data: { downloadId, filePath: targetPath } });
    } catch (err: unknown) {
      return Promise.resolve({ success: false, msg: err instanceof Error ? err.message : String(err) });
    }
  });
}
