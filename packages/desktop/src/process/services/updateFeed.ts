/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process';
import { isIP } from 'net';
import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration } from './cdnGenericProvider';

export const GITHUB_UPDATE_OWNER = 'suoak';
export const GITHUB_UPDATE_REPO = 'AionUi';
export const DEFAULT_GITHUB_REPO = `${GITHUB_UPDATE_OWNER}/${GITHUB_UPDATE_REPO}`;
export const GITHUB_UPDATE_BASE_URL = `https://github.com/${DEFAULT_GITHUB_REPO}/releases/latest/download`;
export const UPDATE_POLICY_REGISTRY_KEY = String.raw`HKLM\Software\Policies\CSBU\CSBU WorkMate`;
const EMBEDDED_MANIFEST_PUBLIC_KEY = process.env.CSBU_WORKMATE_UPDATE_MANIFEST_PUBLIC_KEY ?? '';

export type UpdateSourceConfig =
  | {
      kind: 'github';
      owner: typeof GITHUB_UPDATE_OWNER;
      repo: typeof GITHUB_UPDATE_REPO;
      manifestPublicKey: string;
    }
  | { kind: 'internal-http'; baseUrl: string; fallback: 'github'; manifestPublicKey: string };

export type UpdateFeedOptions = CdnGenericProviderConfiguration & { updateProvider: typeof CdnGenericProvider };

type ResolveUpdateSourceOptions = {
  isPackaged: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  readPolicyValue?: (name: 'UpdateSource' | 'UpdateBaseUrl') => string | undefined;
  manifestPublicKey?: string;
};

const isPrivateIpv4 = (hostname: string): boolean => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

export const normalizeInternalUpdateBaseUrl = (rawUrl: string): string => {
  const trimmedUrl = rawUrl.trim();
  if (!/^http:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\//i.test(trimmedUrl)) {
    throw new Error('Internal update URL must use dotted-decimal IPv4');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    throw new Error('Internal update URL is invalid');
  }

  if (
    parsed.protocol !== 'http:' ||
    isIP(parsed.hostname) !== 4 ||
    !isPrivateIpv4(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Internal update URL must be an RFC1918 IPv4 HTTP URL without credentials, query, or fragment');
  }
  if (parsed.pathname === '/' || parsed.pathname.split('/').some((part) => part === '..')) {
    throw new Error('Internal update URL must include a fixed release path');
  }
  return parsed.toString().replace(/\/$/, '');
};

export const parseRegistryQueryValue = (output: string, valueName: string): string | undefined => {
  const escapedName = valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`^\\s*${escapedName}\\s+REG_\\w+\\s+(.+?)\\s*$`, 'im'));
  return match?.[1]?.trim() || undefined;
};

export const readUpdatePolicyValue = (name: 'UpdateSource' | 'UpdateBaseUrl'): string | undefined => {
  if (process.platform !== 'win32') return undefined;
  try {
    const output = execFileSync('reg.exe', ['query', UPDATE_POLICY_REGISTRY_KEY, '/v', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    return parseRegistryQueryValue(output, name);
  } catch {
    return undefined;
  }
};

export const resolveUpdateSourceConfig = (options: ResolveUpdateSourceOptions): UpdateSourceConfig => {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const readPolicy = options.readPolicyValue ?? readUpdatePolicyValue;
  const allowEnvironmentOverride = !options.isPackaged;
  const requestedSource = allowEnvironmentOverride
    ? env.CSBU_WORKMATE_UPDATE_SOURCE?.trim()
    : platform === 'win32'
      ? readPolicy('UpdateSource')?.trim()
      : undefined;

  if (requestedSource && requestedSource !== 'github' && requestedSource !== 'internal-http') {
    throw new Error(`Unsupported update source policy: ${requestedSource}`);
  }
  const manifestPublicKey = (
    options.manifestPublicKey ??
    (options.isPackaged ? EMBEDDED_MANIFEST_PUBLIC_KEY : env.CSBU_WORKMATE_UPDATE_MANIFEST_PUBLIC_KEY) ??
    ''
  ).trim();
  if (!manifestPublicKey) throw new Error('Update manifest public key is not configured');

  if (requestedSource !== 'internal-http') {
    return { kind: 'github', owner: GITHUB_UPDATE_OWNER, repo: GITHUB_UPDATE_REPO, manifestPublicKey };
  }

  const rawBaseUrl = allowEnvironmentOverride ? env.CSBU_WORKMATE_UPDATE_BASE_URL : readPolicy('UpdateBaseUrl');
  if (!rawBaseUrl) throw new Error('Internal update policy is missing UpdateBaseUrl');

  return {
    kind: 'internal-http',
    baseUrl: normalizeInternalUpdateBaseUrl(rawBaseUrl),
    fallback: 'github',
    manifestPublicKey,
  };
};

export const buildUpdateFeedOptions = (source: UpdateSourceConfig): UpdateFeedOptions => {
  if (source.kind === 'github') {
    return {
      provider: 'custom',
      url: GITHUB_UPDATE_BASE_URL,
      sourceKind: 'github',
      artifactPathMode: 'release-root',
      manifestPublicKey: source.manifestPublicKey,
      updateProvider: CdnGenericProvider,
    };
  }
  return {
    provider: 'custom',
    url: source.baseUrl,
    sourceKind: 'internal-http',
    artifactPathMode: 'version-directory',
    manifestPublicKey: source.manifestPublicKey,
    updateProvider: CdnGenericProvider,
  };
};

export const shouldFallbackToGitHub = (source: UpdateSourceConfig, error: unknown): boolean => {
  if (source.kind !== 'internal-http') return false;
  const candidate = error as { code?: string; statusCode?: number; message?: string };
  if (
    candidate.code === 'ERR_UPDATER_MANIFEST_SIGNATURE_INVALID' ||
    candidate.code === 'ERR_UPDATER_REDIRECT_REJECTED'
  ) {
    return false;
  }
  if (/sha512|checksum|signature|downgrade|integrity|redirect/i.test(candidate.message ?? '')) return false;
  if (candidate.statusCode === 404 || candidate.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') return true;
  if (candidate.code && /^(ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT)$/.test(candidate.code))
    return true;
  return /ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT|timeout|timed out/i.test(
    candidate.message ?? String(error)
  );
};
