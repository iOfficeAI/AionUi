/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';

const formatAgentLabel = (agentName?: string, backend?: string): string => {
  const rawLabel = (agentName || backend || 'agent').trim();
  if (!rawLabel) return 'Agent';

  return rawLabel
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getAcpToolStatusIcon = (status: 'pending' | 'in_progress' | 'completed' | 'failed'): string => {
  switch (status) {
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    case 'pending':
    case 'in_progress':
    default:
      return '⏳';
  }
};

const getCodexToolStatusIcon = (status?: string): string => {
  switch (status) {
    case 'success':
      return '✅';
    case 'error':
    case 'canceled':
      return '❌';
    case 'pending':
    case 'executing':
    default:
      return '⏳';
  }
};

const getAcpToolLocation = (rawInput?: Record<string, unknown>, locations?: Array<{ path: string }>): string | null => {
  const explicitPath = locations?.find((item) => item?.path)?.path;
  if (explicitPath) {
    return explicitPath;
  }

  const rawPath = rawInput?.path;
  return typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : null;
};

const formatAgentStatus = (message: Extract<TMessage, { type: 'agent_status' }>): string => {
  const label = formatAgentLabel(message.content.agentName, message.content.backend);

  switch (message.content.status) {
    case 'connecting':
      return `⏳ Connecting to ${label}...`;
    case 'connected':
      return `🔌 Connected to ${label}`;
    case 'authenticated':
      return `🔐 Authenticated with ${label}`;
    case 'session_active':
      return `🚀 ${label} is ready`;
    case 'disconnected':
      return `⚠️ ${label} disconnected`;
    case 'error':
      return `❌ ${label} reported an error`;
    default:
      return `⏳ ${label} is processing...`;
  }
};

const formatPlanUpdate = (message: Extract<TMessage, { type: 'plan' }>): string => {
  const entries = message.content.entries || [];
  if (entries.length === 0) {
    return '📝 Plan updated';
  }

  const completedCount = entries.filter((entry) => entry.status === 'completed').length;
  const activeEntry = entries.find((entry) => entry.status === 'in_progress') || entries.find((entry) => entry.status === 'pending') || entries[0];
  const currentLine = activeEntry?.content?.trim();
  const progressLine = `📝 Plan updated (${completedCount}/${entries.length} completed)`;

  return currentLine ? `${progressLine}\nCurrent: ${currentLine}` : progressLine;
};

const formatAcpToolCall = (message: Extract<TMessage, { type: 'acp_tool_call' }>): string => {
  const tool = message.content.update;
  const title = tool.title?.trim() || 'Running tool';
  const icon = getAcpToolStatusIcon(tool.status);
  const location = getAcpToolLocation(tool.rawInput, tool.locations);

  if (location) {
    return `${icon} ${title}\n${location}`;
  }

  return `${icon} ${title}`;
};

const formatCodexToolCall = (message: Extract<TMessage, { type: 'codex_tool_call' }>): string => {
  const tool = message.content;
  const icon = getCodexToolStatusIcon(tool.status);
  const title = tool.title?.trim() || tool.description?.trim() || 'Running tool';
  const filePath = tool.content?.find((item) => item.filePath)?.filePath;

  if (filePath) {
    return `${icon} ${title}\n${filePath}`;
  }

  return `${icon} ${title}`;
};

export function formatChannelProgressText(message: TMessage): string | null {
  switch (message.type) {
    case 'agent_status':
      return formatAgentStatus(message);
    case 'plan':
      return formatPlanUpdate(message);
    case 'acp_tool_call':
      return formatAcpToolCall(message);
    case 'codex_tool_call':
      return formatCodexToolCall(message);
    default:
      return null;
  }
}
