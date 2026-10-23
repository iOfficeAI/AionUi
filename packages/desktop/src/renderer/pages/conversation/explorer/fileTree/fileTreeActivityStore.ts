/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live agent activity store for the Claude Code Filetree view.
 * Tracks when the AI agent reads, writes/edits, or commits files in the workspace,
 * powering the purple/orange/green shimmering effects and the footer activity chip.
 */

import { useSyncExternalStore } from 'react';
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

export type ActivityTone = 'read' | 'write' | 'commit';

export type FileActivity = {
  path: string;
  tone: ActivityTone;
  inFlight: boolean;
  timestamp: number;
};

export type ActivityChip = {
  tone: ActivityTone;
  label: string;
  detail: string;
  inFlight: boolean;
  timestamp: number;
};

type FileTreeActivityState = {
  /** Normalized path -> FileActivity */
  activities: Map<string, FileActivity>;
  latestChip: ActivityChip | null;
  followAgent: boolean;
};

const SHIMMER_DECAY_MS = 4500;
const FOLLOW_AGENT_STORAGE_KEY = 'filetree-follow-agent';

let activities = new Map<string, FileActivity>();
let latestChip: ActivityChip | null = null;
let followAgent = true;

// Restore followAgent preference if available
try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(FOLLOW_AGENT_STORAGE_KEY);
    if (saved !== null) {
      followAgent = saved === 'true';
    }
  }
} catch {
  // localStorage unavailable
}

const listeners = new Set<() => void>();
let snapshot: FileTreeActivityState = {
  activities: new Map(activities),
  latestChip,
  followAgent,
};

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const notify = (): void => {
  snapshot = {
    activities: new Map(activities),
    latestChip,
    followAgent,
  };
  listeners.forEach((l) => l());
};

const ensureCleanupTimer = (): void => {
  if (cleanupTimer !== null) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [key, act] of activities.entries()) {
      if (!act.inFlight && now - act.timestamp > SHIMMER_DECAY_MS) {
        activities.delete(key);
        changed = true;
      }
    }
    if (changed) {
      notify();
    }
    if (activities.size === 0 && cleanupTimer !== null) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 1000);
};

/** Normalize file path to forward slashes without leading/trailing whitespace */
export const normalizeActivityPath = (rawPath: string): string => {
  return rawPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
};

/** Extract target file paths from tool arguments or confirmation details */
const extractPathsFromTool = (
  name: string,
  args: Record<string, unknown> | undefined,
  details: Record<string, unknown> | undefined,
  output: string | undefined
): { paths: string[]; tone: ActivityTone; label: string } | null => {
  const lowerName = name.toLowerCase();

  // 1. Write / Edit
  const isWriteTool =
    lowerName.includes('write') ||
    lowerName.includes('edit') ||
    lowerName.includes('replace') ||
    lowerName.includes('save') ||
    details?.type === 'edit';

  if (isWriteTool) {
    const p =
      (typeof details?.file_name === 'string' && details.file_name) ||
      (typeof args?.TargetFile === 'string' && args.TargetFile) ||
      (typeof args?.target_file === 'string' && args.target_file) ||
      (typeof args?.path === 'string' && args.path) ||
      (typeof args?.file_path === 'string' && args.file_path) ||
      (typeof args?.filename === 'string' && args.filename);

    if (p) {
      return {
        paths: [normalizeActivityPath(p)],
        tone: 'write',
        label: `Editing ${p.split('/').pop() || p}`,
      };
    }
  }

  // 2. Read / Search
  const isReadTool =
    lowerName.includes('read') ||
    lowerName.includes('view') ||
    lowerName.includes('grep') ||
    lowerName.includes('find') ||
    lowerName.includes('glob') ||
    lowerName.includes('search');

  if (isReadTool) {
    const p =
      (typeof args?.AbsolutePath === 'string' && args.AbsolutePath) ||
      (typeof args?.path === 'string' && args.path) ||
      (typeof args?.file_path === 'string' && args.file_path) ||
      (typeof args?.file === 'string' && args.file) ||
      (typeof args?.filename === 'string' && args.filename);

    if (p) {
      return {
        paths: [normalizeActivityPath(p)],
        tone: 'read',
        label: `Reading ${p.split('/').pop() || p}`,
      };
    }
  }

  // 3. Git commits & operations via bash / exec
  const isExec = lowerName.includes('bash') || lowerName.includes('exec') || lowerName.includes('run_command');
  if (isExec) {
    const cmd =
      (typeof details?.command === 'string' && details.command) ||
      (typeof args?.CommandLine === 'string' && args.CommandLine) ||
      (typeof args?.command === 'string' && args.command) ||
      '';

    if (cmd.includes('git commit')) {
      const hashMatch = output ? output.match(/\[[a-zA-Z0-9_\-/\s]+([0-9a-f]{7,8})\]/) : null;
      const hash = hashMatch ? hashMatch[1] : '';
      return {
        paths: [],
        tone: 'commit',
        label: hash ? `Committed ${hash}` : 'Git commit',
      };
    }
  }

  return null;
};

/**
 * Handle tool activity message and record shimmer + footer chip
 */
export const recordToolActivity = (
  rawName: string,
  args?: Record<string, unknown>,
  details?: Record<string, unknown>,
  output?: string,
  inFlight = false
): void => {
  const result = extractPathsFromTool(rawName, args, details, output);
  if (!result) return;

  const now = Date.now();
  const { paths, tone, label } = result;

  for (const path of paths) {
    activities.set(path, {
      path,
      tone,
      inFlight,
      timestamp: now,
    });
  }

  latestChip = {
    tone,
    label,
    detail: paths[0] ?? '',
    inFlight,
    timestamp: now,
  };

  ensureCleanupTimer();
  notify();
};

/** Inspect message stream frame for agent activity */
const handleStreamMessage = (msg: IResponseMessage): void => {
  if (!msg) return;

  // 1. tool_group
  if (msg.type === 'tool_group' && Array.isArray(msg.data)) {
    const items = msg.data as Array<{
      name?: string;
      status?: string;
      confirmationDetails?: Record<string, unknown>;
      result_display?: unknown;
    }>;

    for (const item of items) {
      if (!item.name) continue;
      const inFlight = item.status === 'Executing' || item.status === 'Pending' || item.status === 'Confirming';
      recordToolActivity(
        item.name,
        undefined,
        item.confirmationDetails as Record<string, unknown> | undefined,
        typeof item.result_display === 'string' ? item.result_display : undefined,
        inFlight
      );
    }
    return;
  }

  // 2. tool_call
  if (msg.type === 'tool_call' && msg.data && typeof msg.data === 'object') {
    const data = msg.data as {
      name?: string;
      args?: Record<string, unknown>;
      input?: Record<string, unknown>;
      status?: string;
      output?: string;
    };
    if (data.name) {
      const inFlight = data.status === 'running';
      recordToolActivity(data.name, data.args ?? data.input, undefined, data.output, inFlight);
    }
    return;
  }

  // 3. acp_tool_call
  if (msg.type === 'acp_tool_call' && msg.data && typeof msg.data === 'object') {
    const data = msg.data as {
      update?: {
        name?: string;
        input?: Record<string, unknown>;
        status?: string;
        output?: string;
      };
    };
    if (data.update?.name) {
      const inFlight = data.update.status === 'running' || data.update.status === 'pending';
      recordToolActivity(data.update.name, data.update.input, undefined, data.update.output, inFlight);
    }
    return;
  }

  // 4. acp_terminal_output
  if (msg.type === 'acp_terminal_output' && msg.data && typeof msg.data === 'object') {
    const terminal = msg.data as { command?: string; output?: string };
    if (terminal.command?.includes('git commit')) {
      recordToolActivity('bash', { command: terminal.command }, undefined, terminal.output, false);
    }
  }
};

let initialized = false;

export const initFileTreeActivityListener = (): (() => void) => {
  const unsubs: Array<() => void> = [];

  try {
    const unsub1 = ipcBridge.conversation?.responseStream?.on?.(handleStreamMessage);
    if (typeof unsub1 === 'function') unsubs.push(unsub1);
  } catch {
    // optional bridge
  }

  try {
    const unsub2 = ipcBridge.acpConversation?.responseStream?.on?.(handleStreamMessage);
    if (typeof unsub2 === 'function') unsubs.push(unsub2);
  } catch {
    // optional bridge
  }

  return () => {
    unsubs.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
  };
};

export const subscribeActivity = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getActivitySnapshot = (): FileTreeActivityState => snapshot;

export const useFileTreeActivity = (): FileTreeActivityState => {
  return useSyncExternalStore(subscribeActivity, getActivitySnapshot, getActivitySnapshot);
};

export const setFollowAgent = (enable: boolean): void => {
  followAgent = enable;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FOLLOW_AGENT_STORAGE_KEY, String(enable));
    }
  } catch {
    // ignore
  }
  notify();
};

/**
 * Check whether a node (by relativePath or fileName) has an active shimmer
 */
export const checkNodeShimmer = (
  activitiesMap: Map<string, FileActivity> | undefined | null,
  relativePath: string,
  name: string
): ActivityTone | null => {
  if (!activitiesMap || typeof activitiesMap.size !== 'number' || activitiesMap.size === 0) return null;

  const normalizedRel = normalizeActivityPath(relativePath || '');

  // Exact relative path match
  if (activitiesMap.has(normalizedRel)) {
    return activitiesMap.get(normalizedRel)?.tone ?? null;
  }

  // End-with or name match for paths
  for (const [key, act] of activitiesMap.entries()) {
    if (key.endsWith('/' + normalizedRel) || key === name || key.endsWith('/' + name)) {
      return act.tone;
    }
  }

  return null;
};
