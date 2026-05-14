/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { mainError, mainLog, mainWarn } from '@process/utils/mainLogger';
import { SERVER_CONFIG } from '@process/webserver/config/constants';
import { shell } from 'electron';
import { createHash } from 'node:crypto';
import { ensureLocalWebServerRunning } from './webuiBridge';

type KscResponse<T> = {
  code?: string;
  msg?: string;
  message?: string;
  data?: T;
};

type KscLoginUrlDto = {
  loginUrl?: string;
  loginUUID?: string;
};

type KscUserInfo = {
  userName?: string;
  companyName?: string;
  companyCode?: string;
};

type KscLoginResultDto = {
  status?: string;
  statusDesc?: string;
  sk?: string;
  userInfo?: KscUserInfo;
};

type KscModelInfo = {
  model?: string;
  maxTokens?: number;
  max_tokens?: number;
};

const DEFAULT_COMPANY_CODE = 'camelotklt';
const DEFAULT_CLIENT = 'all';
const DEFAULT_INFERENCE_CHAT_PATH = '/v1/chat/completions';
const KSC_PROVIDER_ID_PREFIX = 'ksc:';
const KSC_LOG_TAG = '[KscBridge]';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const KSC_FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = KSC_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function ensurePath(path?: string): string {
  const raw = (path || DEFAULT_INFERENCE_CHAT_PATH).trim();
  if (!raw) return DEFAULT_INFERENCE_CHAT_PATH;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function stableKscProviderId(model: string): string {
  const digest = createHash('sha1').update(`ksc:${model}`, 'utf8').digest('hex');
  return `${KSC_PROVIDER_ID_PREFIX}${digest}`;
}

function resolveInferenceBasePath(inferencePath: string): string {
  const normalized = ensurePath(inferencePath);
  const pathWithoutQuery = normalized.split('?')[0] || normalized;
  // Default OpenAI-compatible chat endpoint path => use its parent as base URL path.
  if (pathWithoutQuery.endsWith('/chat/completions')) {
    const base = pathWithoutQuery.slice(0, -'/chat/completions'.length);
    return base || '/v1';
  }
  // Fallback: drop the trailing segment and keep parent path as base.
  const lastSlash = pathWithoutQuery.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '/v1';
  }
  return pathWithoutQuery.slice(0, lastSlash);
}

function buildKscProxyBaseUrl(providerId: string, inferencePath: string): string {
  const inferenceBasePath = resolveInferenceBasePath(inferencePath);
  return `${SERVER_CONFIG.BASE_URL}/api/ksc-proxy/${encodeURIComponent(providerId)}${inferenceBasePath}`;
}

async function parseKscResponse<T>(response: Response, defaultMessage: string): Promise<T> {
  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`KSC request failed: HTTP ${response.status} - ${payloadText}`);
  }
  const payload = JSON.parse(payloadText) as KscResponse<T>;
  if (payload.data === undefined || payload.data === null) {
    throw new Error(payload.message || payload.msg || defaultMessage);
  }
  return payload.data;
}

function applyKscHeaders(headers: Headers, companyCode?: string, sk?: string): void {
  headers.set('Content-Type', 'application/json');
  headers.set('X-KSC-COMPANY-CODE', companyCode?.trim() || DEFAULT_COMPANY_CODE);
  if (sk?.trim()) {
    headers.set('sk', sk.trim());
    headers.set('Authorization', `Bearer ${sk.trim()}`);
  }
}

function resolveCompanyCode(loginResult: KscLoginResultDto, fallback?: string): string {
  return loginResult.userInfo?.companyCode?.trim() || fallback?.trim() || DEFAULT_COMPANY_CODE;
}

function buildKscProvider(
  baseUrl: string,
  sk: string,
  model: string,
  inferencePath: string,
  companyCode?: string
): IProvider {
  const providerId = stableKscProviderId(model);
  const customHeaders: Record<string, string> = {
    'X-LLM-Application-Tag': 'proxyai',
    'ksyun-code-type': 'camelotkltapi',
  };
  customHeaders['X-KSC-COMPANY-CODE'] = companyCode?.trim() || DEFAULT_COMPANY_CODE;

  return {
    id: providerId,
    platform: 'custom',
    name: `KSC AI Coder - ${model}`,
    baseUrl: buildKscProxyBaseUrl(providerId, inferencePath),
    upstreamBaseUrl: baseUrl,
    customHeaders,
    apiKey: sk,
    model: [model],
    contextLimit: undefined,
    enabled: true,
    modelEnabled: { [model]: true },
  };
}

async function syncKscProviders(
  baseUrl: string,
  sk: string,
  models: KscModelInfo[],
  inferencePath: string,
  companyCode?: string
): Promise<number> {
  const existing = await ProcessConfig.get('model.config');
  const providers = Array.isArray(existing) ? (existing as IProvider[]) : [];

  const modelNames = models.map((m) => (m.model || '').trim()).filter((m) => Boolean(m));

  if (modelNames.length === 0) {
    throw new Error('KSC returned no models.');
  }

  const nextKscProviders = modelNames.map((model) => buildKscProvider(baseUrl, sk, model, inferencePath, companyCode));
  const nextKscProviderIds = new Set(nextKscProviders.map((p) => p.id));

  const retainedProviders = providers.filter((provider) => {
    if (!provider.id?.startsWith(KSC_PROVIDER_ID_PREFIX)) {
      return true;
    }
    return nextKscProviderIds.has(provider.id);
  });

  const retainedMap = new Map(retainedProviders.map((provider) => [provider.id, provider]));
  nextKscProviders.forEach((provider) => retainedMap.set(provider.id, provider));

  await ProcessConfig.set('model.config', Array.from(retainedMap.values()));
  return nextKscProviders.length;
}

export function initKscBridge(): void {
  ipcBridge.kscAuth.loginAndSync.provider(async ({ baseUrl, companyCode, client, inferenceChatPath }) => {
    const normalizedBase = normalizeBaseUrl(baseUrl || '');
    mainLog(KSC_LOG_TAG, 'loginAndSync invoked', {
      baseUrl: normalizedBase,
      companyCode: companyCode || DEFAULT_COMPANY_CODE,
      client: client || DEFAULT_CLIENT,
      inferenceChatPath: inferenceChatPath || DEFAULT_INFERENCE_CHAT_PATH,
    });

    if (!normalizedBase.startsWith('http://') && !normalizedBase.startsWith('https://')) {
      mainWarn(KSC_LOG_TAG, 'rejected invalid baseUrl', { baseUrl: normalizedBase });
      return { success: false, msg: 'KSC base URL must start with http:// or https://.' };
    }

    const inferencePath = ensurePath(inferenceChatPath);
    const chosenClient = (client || DEFAULT_CLIENT).trim() || DEFAULT_CLIENT;

    try {
      await ensureLocalWebServerRunning();

      const loginHeaders = new Headers();
      applyKscHeaders(loginHeaders, companyCode);
      mainLog(KSC_LOG_TAG, 'requesting login URL');
      const loginUrlData = await parseKscResponse<KscLoginUrlDto>(
        await fetchWithTimeout(`${normalizedBase}/cli/login/url`, { method: 'GET', headers: loginHeaders }),
        'Failed to get KSC login URL'
      );

      const loginUuid = (loginUrlData.loginUUID || '').trim();
      if (!loginUuid) {
        throw new Error('KSC login UUID is empty.');
      }

      const openUrl = (loginUrlData.loginUrl || '').trim() || `${normalizedBase}/l/${loginUuid}`;
      mainLog(KSC_LOG_TAG, 'opening browser for login', { openUrl, loginUuid });
      await shell.openExternal(openUrl);

      let loginResult: KscLoginResultDto | null = null;
      for (let i = 0; i < 90; i += 1) {
        mainLog(KSC_LOG_TAG, 'polling login result', { attempt: i + 1, loginUuid });
        const resultHeaders = new Headers();
        applyKscHeaders(resultHeaders, companyCode);
        try {
          loginResult = await parseKscResponse<KscLoginResultDto>(
            await fetchWithTimeout(`${normalizedBase}/cli/login/result?loginUUID=${encodeURIComponent(loginUuid)}`, {
              method: 'GET',
              headers: resultHeaders,
            }),
            'Failed to get KSC login result'
          );
        } catch (pollError) {
          // Transient network errors (e.g. DNS blip, 503) should not abort the poll;
          // continue waiting and let the outer timeout handle hard failures.
          mainWarn(KSC_LOG_TAG, 'transient poll error, retrying', { attempt: i + 1, error: String(pollError) });
          await sleep(2000);
          continue;
        }

        const sk = (loginResult.sk || '').trim();
        if (sk) {
          const effectiveCompanyCode = resolveCompanyCode(loginResult, companyCode);
          mainLog(KSC_LOG_TAG, 'login succeeded, loading models', {
            userName: loginResult.userInfo?.userName,
            companyName: loginResult.userInfo?.companyName,
            companyCode: effectiveCompanyCode,
          });
          const modelHeaders = new Headers();
          applyKscHeaders(modelHeaders, effectiveCompanyCode, sk);

          let models: KscModelInfo[] = [];
          try {
            mainLog(KSC_LOG_TAG, 'requesting cli models', { client: chosenClient });
            models = await parseKscResponse<KscModelInfo[]>(
              await fetchWithTimeout(`${normalizedBase}/cli/models?client=${encodeURIComponent(chosenClient)}`, {
                method: 'GET',
                headers: modelHeaders,
              }),
              'Failed to load KSC models'
            );
          } catch {
            mainWarn(KSC_LOG_TAG, 'cli models failed, falling back to openapi2 list');
            // Note: sk is passed via header (Authorization + sk), NOT in the URL, to avoid
            // leaking credentials into server access logs and proxy logs.
            models = await parseKscResponse<KscModelInfo[]>(
              await fetchWithTimeout(`${normalizedBase}/openapi2/models/list`, {
                method: 'GET',
                headers: modelHeaders,
              }),
              'Failed to load KSC OpenAPI2 models'
            );
          }

          const syncedModels = await syncKscProviders(normalizedBase, sk, models, inferencePath, effectiveCompanyCode);
          mainLog(KSC_LOG_TAG, 'model sync completed', { syncedModels });
          return {
            success: true,
            data: {
              syncedModels,
              userName: loginResult.userInfo?.userName,
              companyName: loginResult.userInfo?.companyName,
            },
          };
        }

        const status = (loginResult.status || '').toLowerCase();
        if (
          status.includes('fail') ||
          status.includes('cancel') ||
          status.includes('expired') ||
          status.includes('denied')
        ) {
          mainWarn(KSC_LOG_TAG, 'login polling returned terminal failure status', {
            status: loginResult.status,
            statusDesc: loginResult.statusDesc,
          });
          throw new Error(loginResult.statusDesc || `KSC login failed with status: ${loginResult.status}`);
        }

        await sleep(2000);
      }

      throw new Error('KSC login timed out. Please complete browser login and retry.');
    } catch (error) {
      mainError(KSC_LOG_TAG, 'loginAndSync failed', error);
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.kscAuth.logout.provider(async () => {
    try {
      const existing = await ProcessConfig.get('model.config');
      const providers = Array.isArray(existing) ? (existing as IProvider[]) : [];
      const retained = providers.filter((p) => !p.id?.startsWith(KSC_PROVIDER_ID_PREFIX));
      await ProcessConfig.set('model.config', retained);
      const removedCount = providers.length - retained.length;
      mainLog(KSC_LOG_TAG, 'logout completed', { removedCount });
      return { success: true };
    } catch (error) {
      mainError(KSC_LOG_TAG, 'logout failed', error);
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });
}
