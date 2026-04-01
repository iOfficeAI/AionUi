import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import {
  isGeminiMcpServerAvailable,
  shouldGeminiIncludeMcpServer,
  shouldRegisterGeminiImageGenerationTool,
} from '@/process/task/GeminiAgentManager';

const createServer = (overrides: Partial<IMcpServer> = {}): IMcpServer => ({
  id: 'server-1',
  name: 'test-server',
  enabled: true,
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['server.js'],
  },
  createdAt: 1,
  updatedAt: 1,
  originalJson: '{}',
  ...overrides,
});

describe('isGeminiMcpServerAvailable', () => {
  it('accepts connected MCP servers', () => {
    expect(isGeminiMcpServerAvailable(createServer({ status: 'connected' }))).toBe(true);
  });

  it('rejects disabled MCP servers', () => {
    expect(isGeminiMcpServerAvailable(createServer({ enabled: false, status: 'connected' }))).toBe(false);
  });

  it('accepts builtin MCP servers without an explicit status for backward compatibility', () => {
    expect(isGeminiMcpServerAvailable(createServer({ builtin: true, status: undefined }))).toBe(true);
  });

  it('rejects non-builtin MCP servers without a connected status', () => {
    expect(isGeminiMcpServerAvailable(createServer({ status: undefined }))).toBe(false);
  });

  it('registers the direct image generation tool when an image model is configured', () => {
    expect(shouldRegisterGeminiImageGenerationTool({ useModel: 'gemini-3.1-flash-image-preview' } as never)).toBe(true);
    expect(shouldRegisterGeminiImageGenerationTool(undefined)).toBe(false);
  });

  it('excludes the builtin image generation MCP server from gemini MCP config when direct tool is available', () => {
    const builtinServer = createServer({
      id: 'builtin-image-gen',
      name: 'aionui-image-generation',
      builtin: true,
      status: 'connected',
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['/tmp/builtin-mcp-image-gen.js'],
      },
    });

    expect(shouldGeminiIncludeMcpServer(builtinServer, { useModel: 'gemini-3.1-flash-image-preview' } as never)).toBe(
      false
    );
    expect(shouldGeminiIncludeMcpServer(builtinServer, undefined)).toBe(true);
  });
});
