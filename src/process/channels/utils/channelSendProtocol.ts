/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelMediaAction } from '../types';
import path from 'path';
import { existsSync, lstatSync, realpathSync, statSync } from 'fs';
import { getDatabase } from '@process/services/database';

const CHANNEL_SEND_BLOCK_RE = /\[AIONUI_CHANNEL_SEND\]\s*([\s\S]*?)\s*\[\/AIONUI_CHANNEL_SEND\]/g;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

type RawChannelMediaAction = {
  type: 'image' | 'file';
  path: string;
  fileName?: string;
  caption?: string;
};

function normalizeVisibleText(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n').trim();
}

function parseRawChannelMediaAction(jsonText: string): RawChannelMediaAction | null {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const type = parsed.type;
    const actionPath = parsed.path;
    if ((type !== 'image' && type !== 'file') || typeof actionPath !== 'string' || !actionPath.trim()) {
      return null;
    }

    return {
      type,
      path: actionPath.trim(),
      ...(typeof parsed.fileName === 'string' && parsed.fileName.trim() ? { fileName: parsed.fileName.trim() } : {}),
      ...(typeof parsed.caption === 'string' && parsed.caption.trim() ? { caption: parsed.caption.trim() } : {}),
    };
  } catch {
    return null;
  }
}

function isPathInsideWorkspace(candidatePath: string, workspace: string): boolean {
  const relative = path.relative(workspace, candidatePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function extractChannelSendProtocol(content: string): {
  visibleText: string;
  actions: RawChannelMediaAction[];
} {
  const actions: RawChannelMediaAction[] = [];

  const visibleText = normalizeVisibleText(
    content.replace(CHANNEL_SEND_BLOCK_RE, (fullMatch, jsonText: string) => {
      const parsed = parseRawChannelMediaAction(jsonText);
      if (!parsed) return fullMatch;
      actions.push(parsed);
      return '';
    })
  );

  return { visibleText, actions };
}

export async function resolveChannelSendProtocol(
  content: string,
  conversationId: string
): Promise<{
  visibleText: string;
  mediaActions: IChannelMediaAction[];
}> {
  const extracted = extractChannelSendProtocol(content);
  if (extracted.actions.length === 0) {
    return { visibleText: extracted.visibleText, mediaActions: [] };
  }

  const db = await getDatabase();
  const conversation = db.getConversation(conversationId);
  const workspace = conversation.success ? conversation.data?.extra?.workspace : undefined;
  if (!workspace || !existsSync(workspace)) {
    return { visibleText: extracted.visibleText, mediaActions: [] };
  }

  let workspaceRoot: string;
  try {
    workspaceRoot = realpathSync(workspace);
  } catch {
    return { visibleText: extracted.visibleText, mediaActions: [] };
  }

  const mediaActions: IChannelMediaAction[] = [];
  for (const action of extracted.actions) {
    const resolvedPath = path.isAbsolute(action.path)
      ? path.resolve(action.path)
      : path.resolve(workspaceRoot, action.path);

    if (!resolvedPath) continue;
    if (!existsSync(resolvedPath)) continue;

    try {
      const pathInfo = lstatSync(resolvedPath);
      const canonicalPath = realpathSync(resolvedPath);
      if (!isPathInsideWorkspace(canonicalPath, workspaceRoot)) continue;

      const stats = pathInfo.isSymbolicLink() ? statSync(canonicalPath) : pathInfo;
      if (!stats.isFile() || stats.size > MAX_MEDIA_BYTES) continue;

      mediaActions.push({
        ...action,
        path: canonicalPath,
      });
    } catch {
      continue;
    }
  }

  return {
    visibleText: extracted.visibleText,
    mediaActions,
  };
}
