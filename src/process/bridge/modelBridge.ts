/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/storage';
import { uuid } from '@/common/utils';
import OpenAI from 'openai';
import { ipcBridge } from '../../common';
import { getDatabase } from '../database/export';

export function initModelBridge(): void {
  ipcBridge.mode.fetchModelList.provider(async function fetchModelList({ base_url, api_key, try_fix, platform }): Promise<{ success: boolean; msg?: string; data?: { mode: Array<string>; fix_base_url?: string } }> {
    // 如果是多key（包含逗号或回车），只取第一个key来获取模型列表
    let actualApiKey = api_key;
    if (api_key && (api_key.includes(',') || api_key.includes('\n'))) {
      actualApiKey = api_key.split(/[,\n]/)[0].trim();
    }

    // 如果是 Vertex AI 平台，直接返回 Vertex AI 支持的模型列表
    if (platform?.includes('vertex-ai')) {
      console.log('Using Vertex AI model list');
      const vertexAIModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];
      return { success: true, data: { mode: vertexAIModels } };
    }

    // 如果是 Gemini 平台，使用 Gemini API 协议
    if (platform?.includes('gemini')) {
      try {
        // 使用自定义 base_url 或默认的 Gemini endpoint
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
        const modelList = data.models.map((model: { name: string }) => {
          const name = model.name;
          return name.startsWith('models/') ? name.substring(7) : name;
        });

        return { success: true, data: { mode: modelList } };
      } catch (e: any) {
        // 对于 Gemini 平台，API 调用失败时回退到默认模型列表
        if (platform?.includes('gemini')) {
          console.warn('Failed to fetch Gemini models via API, falling back to default list:', e.message);
          // 导入默认的 Gemini 模型列表
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
      // 检查返回的数据是否有效 lms 获取失败时仍然会返回有效空数据
      if (res.data?.length === 0) {
        throw new Error('Invalid response: empty data');
      }
      return { success: true, data: { mode: res.data.map((v) => v.id) } };
    } catch (e) {
      const errRes = { success: false, msg: e.message || e.toString() };

      if (!try_fix) return errRes;

      // 如果是API key问题，直接返回错误，不尝试修复URL
      if (e.status === 401 || e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('Invalid API key')) {
        return errRes;
      }

      const url = new URL(base_url);
      const fixedBaseUrl = `${url.protocol}//${url.host}/v1`;

      if (fixedBaseUrl === base_url) return errRes;

      const retryRes = await fetchModelList({ base_url: fixedBaseUrl, api_key: api_key, try_fix: false });
      if (retryRes.success) {
        return { ...retryRes, data: { mode: retryRes.data.mode, fix_base_url: fixedBaseUrl } };
      }
      return retryRes;
    }
  });

  ipcBridge.mode.saveModelConfig.provider(async (models) => {
    try {
      const db = getDatabase();
      db.setConfig('model.config', models);
      return { success: true };
    } catch (e: any) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.mode.getModelConfig.provider(async () => {
    try {
      const db = getDatabase();
      const result = db.getConfig('model.config');
      const data = result.data;

      if (!data) return [];

      // Handle migration from old IModel format to new IProvider format
      return (data as any[]).map((v: any, _index: number) => {
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
    } catch (e) {
      return [] as IProvider[];
    }
  });
}
