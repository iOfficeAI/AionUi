/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildSpawnConfig } from '@/process/agent/aionrs/envBuilder';
import type { TProviderWithModel } from '@/common/config/storage';

describe('envBuilder API path handling', () => {
  describe('腾讯云 Coding Plan', () => {
    it('should generate api_path override for /v3 URL', () => {
      const model: TProviderWithModel = {
        id: 'test',
        platform: 'custom',
        name: 'Tencent Coding',
        baseUrl: 'https://api.lkeap.cloud.tencent.com/coding/v3',
        useModel: 'qwen3-coder-plus',
        apiKey: 'test-key',
        model: [],
      };

      const { projectConfig } = buildSpawnConfig(model, {
        workspace: '/tmp/test',
      });

      expect(projectConfig).toContain('api_path = "/chat/completions"');
    });
  });

  describe('火山引擎 Ark', () => {
    it('should generate api_path override for /api/v3 URL', () => {
      const model: TProviderWithModel = {
        id: 'test',
        platform: 'custom',
        name: 'Volcengine Ark',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        useModel: 'ep-xxx',
        apiKey: 'test-key',
        model: [],
      };

      const { projectConfig } = buildSpawnConfig(model, {
        workspace: '/tmp/test',
      });

      expect(projectConfig).toContain('api_path = "/chat/completions"');
    });
  });

  describe('百度千帆', () => {
    it('should generate api_path override for /v2 URL', () => {
      const model: TProviderWithModel = {
        id: 'test',
        platform: 'custom',
        name: 'Baidu Qianfan',
        baseUrl: 'https://qianfan.baidubce.com/v2',
        useModel: 'ernie-4.0',
        apiKey: 'test-key',
        model: [],
      };

      const { projectConfig } = buildSpawnConfig(model, {
        workspace: '/tmp/test',
      });

      expect(projectConfig).toContain('api_path = "/chat/completions"');
    });
  });

  describe('智谱', () => {
    it('should generate api_path override for /api/paas/v4 URL', () => {
      const model: TProviderWithModel = {
        id: 'test',
        platform: 'custom',
        name: 'Zhipu',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        useModel: 'glm-4',
        apiKey: 'test-key',
        model: [],
      };

      const { projectConfig } = buildSpawnConfig(model, {
        workspace: '/tmp/test',
      });

      expect(projectConfig).toContain('api_path = "/chat/completions"');
    });
  });

  describe('标准 OpenAI URL', () => {
    it('should NOT generate api_path override for standard /v1 URL', () => {
      const model: TProviderWithModel = {
        id: 'test',
        platform: 'custom',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        useModel: 'gpt-4o',
        apiKey: 'test-key',
        model: [],
      };

      const { projectConfig } = buildSpawnConfig(model, {
        workspace: '/tmp/test',
      });

      // 标准 /v1 URL 不需要 api_path 覆盖
      expect(projectConfig).not.toContain('api_path = "/chat/completions"');
    });

    it('should NOT generate api_path override for URL without version path', () => {
      const model: TProviderWithModel = {
        id: 'test',
        platform: 'custom',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        useModel: 'deepseek-chat',
        apiKey: 'test-key',
        model: [],
      };

      const { projectConfig } = buildSpawnConfig(model, {
        workspace: '/tmp/test',
      });

      // 无版本路径的 URL 不需要 api_path 覆盖（aionrs 会正确添加 /v1）
      expect(projectConfig).toBe('');
    });
  });

  describe('Gemini', () => {
    it('should generate api_path override for Gemini platform', () => {
      const model: TProviderWithModel = {
        id: 'test',
        platform: 'gemini',
        name: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        useModel: 'gemini-2.0-flash',
        apiKey: 'test-key',
        model: [],
      };

      const { projectConfig } = buildSpawnConfig(model, {
        workspace: '/tmp/test',
      });

      expect(projectConfig).toContain('api_path = "/chat/completions"');
    });
  });
});
