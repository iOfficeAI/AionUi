/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const BROWSER_MCP_TOOL_PREFIX = 'aibang-browser__';

type JsonRpcId = string | number | null;

type JsonRpcMessage = {
  id?: JsonRpcId;
  method?: string;
  result?: {
    serverInfo?: Record<string, unknown>;
    tools?: Array<Record<string, unknown>>;
  };
  params?: {
    name?: string;
  };
};

const requestKey = (id: JsonRpcId | undefined): string | undefined =>
  id === undefined ? undefined : JSON.stringify(id);

const parseMessage = (line: string): JsonRpcMessage | undefined => {
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRpcMessage) : undefined;
  } catch {
    return undefined;
  }
};

export const createBrowserMcpProtocolTransformer = () => {
  const initializeRequestIds = new Set<string>();
  const toolListRequestIds = new Set<string>();

  const transformClientMessage = (line: string): string => {
    const message = parseMessage(line);
    if (!message) return line;

    const key = requestKey(message.id);
    if (message.method === 'initialize' && key) initializeRequestIds.add(key);
    if (message.method === 'tools/list' && key) toolListRequestIds.add(key);
    if (
      message.method === 'tools/call' &&
      typeof message.params?.name === 'string' &&
      message.params.name.startsWith(BROWSER_MCP_TOOL_PREFIX)
    ) {
      message.params.name = message.params.name.slice(BROWSER_MCP_TOOL_PREFIX.length);
    }
    return JSON.stringify(message);
  };

  const transformServerMessage = (line: string): string => {
    const message = parseMessage(line);
    if (!message) return line;

    const key = requestKey(message.id);
    if (key && initializeRequestIds.has(key)) {
      initializeRequestIds.delete(key);
      message.result = {
        ...message.result,
        serverInfo: {
          ...(message.result?.serverInfo ?? {}),
          name: 'aibang-browser',
          title: 'AIbang in-app browser',
          description: 'Controls the browser embedded in the AIbang preview panel.',
        },
      };
    }

    if (key && toolListRequestIds.has(key)) {
      toolListRequestIds.delete(key);
      message.result = {
        ...message.result,
        tools: (message.result?.tools ?? []).map((tool) => ({
          ...tool,
          name: typeof tool.name === 'string' ? `${BROWSER_MCP_TOOL_PREFIX}${tool.name}` : tool.name,
        })),
      };
    }
    return JSON.stringify(message);
  };

  return { transformClientMessage, transformServerMessage };
};
