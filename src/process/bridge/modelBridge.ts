/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/storage';
import { uuid } from '@/common/utils';
import OpenAI from 'openai';
import { ipcBridge } from '../../common';
import { ProcessConfig } from '../initStorage';

/**
 * OpenAI 兼容 API 的常见路径格式
 * Common path patterns for OpenAI-compatible APIs
 *
 * 用于自动修复用户输入的 base URL，便于维护和扩展
 * Used to auto-fix user-provided base URLs, easy to maintain and extend
 */
const API_PATH_PATTERNS = [
  '/v1', // 标准格式 / Standard: OpenAI, DeepSeek, Moonshot, Mistral, SiliconFlow, 讯飞星火, 腾讯混元
  '/api/v1', // 代理格式 / Proxy: OpenRouter
  '/openai/v1', // Groq
  '/compatible-mode/v1', // 阿里云 DashScope / Alibaba Cloud
  '/compatibility/v1', // Cohere
  '/v2', // 百度千帆 / Baidu Qianfan
  '/api/v3', // 火山引擎 Ark / Volcengine
  '/api/paas/v4', // 智谱 / Zhipu
];

export function initModelBridge(): void {
  ipcBridge.mode.fetchModelList.provider(async function fetchModelList({ base_url, api_key, try_fix, platform }): Promise<{ success: boolean; msg?: string; data?: { mode: Array<string>; fix_base_url?: string } }> {
    // 如果是多key（包含逗号或回车），只取第一个key来获取模型列表
    // If multiple keys (comma or newline separated), use only the first one
    let actualApiKey = api_key;
    if (api_key && (api_key.includes(',') || api_key.includes('\n'))) {
      actualApiKey = api_key.split(/[,\n]/)[0].trim();
    }

    // 如果是 Vertex AI 平台，直接返回 Vertex AI 支持的模型列表
    // For Vertex AI platform, return the supported model list directly
    if (platform?.includes('vertex-ai')) {
      console.log('Using Vertex AI model list');
      const vertexAIModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];
      return { success: true, data: { mode: vertexAIModels } };
    }

    // 如果是 Gemini 平台，使用 Gemini API 协议
    // For Gemini platform, use Gemini API protocol
    if (platform?.includes('gemini')) {
      try {
        // 使用自定义 base_url 或默认的 Gemini endpoint
        // Use custom base_url or default Gemini endpoint
        const geminiUrl = base_url ? `${base_url}/models?key=${encodeURIComponent(actualApiKey)}` : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(actualApiKey)}`;

        const response = await fetch(geminiUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.models || !Array.isArray(data.models)) {
          throw new Error('Invalid response format');
        }

        // 提取模型名称，移除 "models/" 前缀
        // Extract model names, remove "models/" prefix
        const modelList = data.models.map((model: { name: string }) => {
          const name = model.name;
          return name.startsWith('models/') ? name.substring(7) : name;
        });

        return { success: true, data: { mode: modelList } };
      } catch (e: any) {
        // 对于 Gemini 平台，API 调用失败时回退到默认模型列表
        // For Gemini platform, fall back to default model list on API failure
        if (platform?.includes('gemini')) {
          console.warn('Failed to fetch Gemini models via API, falling back to default list:', e.message);
          const defaultGeminiModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];
          return { success: true, data: { mode: defaultGeminiModels } };
        }
        return { success: false, msg: e.message || e.toString() };
      }
    }

    const openai = new OpenAI({
      baseURL: base_url,
      apiKey: actualApiKey,
    });

    try {
      const res = await openai.models.list();
      // 检查返回的数据是否有效，LM Studio 获取失败时仍会返回空数据
      // Check if response data is valid, LM Studio returns empty data on failure
      if (res.data?.length === 0) {
        throw new Error('Invalid response: empty data');
      }
      return { success: true, data: { mode: res.data.map((v) => v.id) } };
    } catch (e) {
      const errRes = { success: false, msg: e.message || e.toString() };

      if (!try_fix) return errRes;

      // 如果是 API key 问题，直接返回错误，不尝试修复 URL
      // If it's an API key issue, return error directly without trying to fix URL
      if (e.status === 401 || e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('Invalid API key')) {
        return errRes;
      }

      // 用户输入的 URL 已经请求失败，并行尝试多种可能的 URL 格式
      // User's URL request failed, try multiple possible URL formats in parallel
      const url = new URL(base_url);
      const pathname = url.pathname.replace(/\/+$/, ''); // 移除末尾斜杠 / Remove trailing slashes
      const base = `${url.protocol}//${url.host}`;

      // 构建候选 URL 列表 / Build candidate URL list
      const candidateUrls = new Set<string>();

      // 1. 用户路径 + /v1（适用于代理场景）/ User path + /v1 (for proxy scenarios)
      if (pathname && pathname !== '/') {
        candidateUrls.add(`${base}${pathname}/v1`);
      }

      // 2. 尝试所有已知的 API 路径格式 / Try all known API path patterns
      API_PATH_PATTERNS.forEach((pattern) => candidateUrls.add(`${base}${pattern}`));

      // 移除原始 URL（已经请求过了）/ Remove original URL (already tried)
      candidateUrls.delete(base_url);

      if (candidateUrls.size === 0) {
        return errRes;
      }

      // 并行请求所有候选 URL，第一个成功的就用
      // Request all candidate URLs in parallel, use the first successful one
      const tryFetch = (candidateUrl: string) =>
        fetchModelList({ base_url: candidateUrl, api_key: api_key, try_fix: false }).then((res) => {
          if (res.success) {
            return { ...res, data: { mode: res.data.mode, fix_base_url: candidateUrl } };
          }
          return Promise.reject(res);
        });

      // 实现 Promise.any 的效果：第一个成功的 resolve，全部失败才 reject
      // Implement Promise.any: resolve on first success, reject only if all fail
      const promiseAny = <T>(promises: Promise<T>[]): Promise<T> =>
        new Promise((resolve, reject) => {
          let rejectCount = 0;
          promises.forEach((p) =>
            p.then(resolve).catch(() => {
              rejectCount++;
              if (rejectCount === promises.length) reject(new Error('All promises rejected'));
            })
          );
        });

      try {
        return await promiseAny([...candidateUrls].map(tryFetch));
      } catch {
        // 所有尝试都失败，返回原始错误 / All attempts failed, return original error
        return errRes;
      }
    }
  });

  ipcBridge.mode.saveModelConfig.provider((models) => {
    return ProcessConfig.set('model.config', models)
      .then(() => {
        return { success: true };
      })
      .catch((e) => {
        return { success: false, msg: e.message || e.toString() };
      });
  });

  ipcBridge.mode.getModelConfig.provider(() => {
    return ProcessConfig.get('model.config')
      .then((data) => {
        if (!data) return [];

        // Handle migration from old IModel format to new IProvider format
        return data.map((v: any, _index: number) => {
          // Check if this is old format (has 'selectedModel' field) vs new format (has 'useModel')
          if ('selectedModel' in v && !('useModel' in v)) {
            // Migrate from old format
            return {
              ...v,
              useModel: v.selectedModel, // Rename selectedModel to useModel
              id: v.id || uuid(),
              capabilities: v.capabilities || [], // Add missing capabilities field
              contextLimit: v.contextLimit, // Keep existing contextLimit if present
            };
            // Note: we don't delete selectedModel here as this is read-only migration
          }

          // Already in new format or unknown format, just ensure ID exists
          return {
            ...v,
            id: v.id || uuid(),
            useModel: v.useModel || v.selectedModel || '', // Fallback for edge cases
          };
        });
      })
      .catch(() => {
        return [] as IProvider[];
      });
  });
}
