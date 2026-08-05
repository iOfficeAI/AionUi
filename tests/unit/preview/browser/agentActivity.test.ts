/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  BUILTIN_BROWSER_MCP_NAME,
  isBrowserMcpActivity,
  isBrowserMcpSettled,
} from '@/renderer/pages/conversation/Preview/browser/agentActivity';

const mcpEntry = (status: string, serverName = BUILTIN_BROWSER_MCP_NAME) => ({
  name: 'navigate_page',
  status,
  confirmationDetails: { type: 'mcp', server_name: serverName, tool_name: 'navigate_page' },
});

describe('isBrowserMcpActivity', () => {
  it('ignores message types other than tool_group', () => {
    expect(isBrowserMcpActivity('text', [mcpEntry('Executing')])).toBe(false);
    expect(isBrowserMcpActivity('tool_call', [mcpEntry('Executing')])).toBe(false);
  });

  it('ignores non-array payloads', () => {
    expect(isBrowserMcpActivity('tool_group', undefined)).toBe(false);
    expect(isBrowserMcpActivity('tool_group', { status: 'Executing' })).toBe(false);
  });

  it('detects in-flight calls to the built-in browser MCP', () => {
    expect(isBrowserMcpActivity('tool_group', [mcpEntry('Executing')])).toBe(true);
    expect(isBrowserMcpActivity('tool_group', [mcpEntry('Pending')])).toBe(true);
  });

  it('counts Confirming as in-flight — the user is being asked to approve a browser action', () => {
    expect(isBrowserMcpActivity('tool_group', [mcpEntry('Confirming')])).toBe(true);
  });

  it('does not treat finished calls as activity', () => {
    expect(isBrowserMcpActivity('tool_group', [mcpEntry('Success')])).toBe(false);
    expect(isBrowserMcpActivity('tool_group', [mcpEntry('Error')])).toBe(false);
    expect(isBrowserMcpActivity('tool_group', [mcpEntry('Canceled')])).toBe(false);
  });

  it('ignores other MCP servers — a different server must not light up our badge', () => {
    expect(isBrowserMcpActivity('tool_group', [mcpEntry('Executing', 'chrome-devtools')])).toBe(false);
  });

  it('falls back to the tool-name prefix when confirmationDetails is absent', () => {
    expect(
      isBrowserMcpActivity('tool_group', [{ name: `${BUILTIN_BROWSER_MCP_NAME}__navigate_page`, status: 'Executing' }])
    ).toBe(true);
  });

  it('detects activity when the browser call is mixed with unrelated tools', () => {
    expect(isBrowserMcpActivity('tool_group', [{ name: 'read_file', status: 'Success' }, mcpEntry('Executing')])).toBe(
      true
    );
  });
});

describe('isBrowserMcpSettled', () => {
  it('reports settled once every browser call in the message has finished', () => {
    expect(isBrowserMcpSettled('tool_group', [mcpEntry('Success')])).toBe(true);
    expect(isBrowserMcpSettled('tool_group', [mcpEntry('Error')])).toBe(true);
  });

  it('does not report settled while any browser call is still in flight', () => {
    expect(isBrowserMcpSettled('tool_group', [mcpEntry('Success'), mcpEntry('Executing')])).toBe(false);
  });

  it('returns false when the message carries no browser calls at all', () => {
    // 关键行为：不能把"没有浏览器调用"当成"浏览器操作结束"，否则无关消息会提前熄灭角标
    // Key behavior: "no browser calls" must not read as "browser finished", or an
    // unrelated message would extinguish the badge early.
    expect(isBrowserMcpSettled('tool_group', [{ name: 'read_file', status: 'Success' }])).toBe(false);
    expect(isBrowserMcpSettled('tool_group', [])).toBe(false);
  });

  it('ignores message types other than tool_group', () => {
    expect(isBrowserMcpSettled('text', [mcpEntry('Success')])).toBe(false);
  });
});
