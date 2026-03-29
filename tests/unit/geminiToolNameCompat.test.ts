/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for Gemini function name sanitization in OpenAI2GeminiConverter.
 *
 * Verifies that MCP tool names containing characters invalid for Gemini's
 * function_declarations.name (which requires ^[a-zA-Z_][a-zA-Z0-9_]*$)
 * are properly sanitized before being sent to the Gemini API.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeGeminiFunctionName, OpenAI2GeminiConverter } from '@/common/api/OpenAI2GeminiConverter';

describe('sanitizeGeminiFunctionName', () => {
  it('passes through valid names unchanged', () => {
    expect(sanitizeGeminiFunctionName('read_file')).toBe('read_file');
    expect(sanitizeGeminiFunctionName('ReadFile')).toBe('ReadFile');
    expect(sanitizeGeminiFunctionName('_private')).toBe('_private');
    expect(sanitizeGeminiFunctionName('tool123')).toBe('tool123');
  });

  it('replaces hyphens with underscores', () => {
    expect(sanitizeGeminiFunctionName('create-ppt')).toBe('create_ppt');
    expect(sanitizeGeminiFunctionName('my-tool-name')).toBe('my_tool_name');
  });

  it('replaces dots with underscores', () => {
    expect(sanitizeGeminiFunctionName('mcp.read.file')).toBe('mcp_read_file');
  });

  it('replaces slashes with underscores', () => {
    expect(sanitizeGeminiFunctionName('namespace/tool')).toBe('namespace_tool');
  });

  it('replaces colons with underscores', () => {
    expect(sanitizeGeminiFunctionName('ns:tool:action')).toBe('ns_tool_action');
  });

  it('prefixes underscore when name starts with a digit', () => {
    expect(sanitizeGeminiFunctionName('123tool')).toBe('_123tool');
  });

  it('handles empty string', () => {
    expect(sanitizeGeminiFunctionName('')).toBe('_unnamed');
  });

  it('handles names with multiple invalid characters', () => {
    expect(sanitizeGeminiFunctionName('my-tool.v2/action:run')).toBe('my_tool_v2_action_run');
  });
});

describe('OpenAI2GeminiConverter tool name sanitization', () => {
  const converter = new OpenAI2GeminiConverter();

  it('sanitizes tool names in convertRequest', () => {
    const params = {
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        {
          type: 'function' as const,
          function: {
            name: 'create-ppt',
            description: 'Create a PowerPoint file',
          },
        },
        {
          type: 'function' as const,
          function: {
            name: 'mcp.read_file',
            description: 'Read a file',
          },
        },
      ],
    };

    const result = converter.convertRequest(params);
    const declarations = result.tools?.[0]?.functionDeclarations;

    expect(declarations).toHaveLength(2);
    expect(declarations?.[0]?.name).toBe('create_ppt');
    expect(declarations?.[1]?.name).toBe('mcp_read_file');
  });
});
