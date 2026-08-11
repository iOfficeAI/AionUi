import path from 'path';
import { describe, expect, it, vi } from 'vitest';

const { configCtorMock } = vi.hoisted(() => ({
  configCtorMock: vi.fn(),
}));

vi.mock('@office-ai/aioncli-core', () => ({
  AuthType: {
    LOGIN_WITH_GOOGLE: 'LOGIN_WITH_GOOGLE',
    USE_VERTEX_AI: 'USE_VERTEX_AI',
  },
  Config: class MockConfig {
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      configCtorMock(options);
    }
  },
}));

vi.mock('../../../src/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      getDataDir: () => '/tmp/aionui-data',
    },
  }),
}));

vi.mock('../../../src/process/agent/gemini/cli/tools/web-fetch', () => ({
  WebFetchTool: class {},
}));

vi.mock('../../../src/process/agent/gemini/cli/tools/web-search', () => ({
  WebSearchTool: class {},
}));

import { ConversationToolConfig } from '../../../src/process/agent/gemini/cli/tools/conversation-tool-config';

describe('ConversationToolConfig', () => {
  it('creates dedicated Gemini configs in an isolated temp directory', () => {
    configCtorMock.mockClear();

    const toolConfig = new ConversationToolConfig({ proxy: '' });
    const result = (
      toolConfig as unknown as {
        createDedicatedGeminiConfig: (model: { useModel: string }) => { options: Record<string, unknown> };
      }
    ).createDedicatedGeminiConfig({
      useModel: 'gemini-2.5-flash',
    });

    const expectedDir = path.join('/tmp/aionui-data', 'runtime', 'gemini-websearch');

    expect(result.options['cwd']).toBe(expectedDir);
    expect(result.options['targetDir']).toBe(expectedDir);
    expect(result.options['cwd']).not.toBe(process.cwd());
    expect(result.options['targetDir']).not.toBe(process.cwd());
    expect(configCtorMock).toHaveBeenCalledOnce();
  });
});
