/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Library data source — reads real conversation history from the backend.
 * All operations are read-only; no existing data is modified.
 */

import i18n from 'i18next';
import { database, fs, assistants as assistantsApi, extensions } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import type { IMessageToolGroup, IMessageAcpToolCall } from '@/common/chat/chatLib';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { LibraryAsset, LibraryFile, LibraryFileType } from './types';

// ---------------------------------------------------------------------------
// Tool whitelist — only these tool names produce files we track.
// ---------------------------------------------------------------------------

// tool_group: names of tools that write files
const TOOL_GROUP_WRITE_NAMES = new Set(['WriteFile', 'write_file', 'create_file', 'Edit', 'MultiEdit']);

// acp_tool_call: kind='edit' with status!='failed' means a file write
const ACP_WRITE_KIND = 'edit';
// acp_tool_call: kind='execute' shell commands that create Office docs (officecli create / morph)
const ACP_EXECUTE_KIND = 'execute';

// Office document extensions we track from shell commands
const OFFICE_EXTS_RE = /\b([\w./~-]+\.(?:pptx|docx|xlsx|ppt|doc|xls))\b/gi;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

function nameOf(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/** Resolve an absolute path from a workspace root + relative file path. */
function resolveFilePath(workspace: string | undefined, filePath: string): string {
  if (!workspace) return filePath;
  // Already absolute (starts with / on mac/linux or drive letter on windows)
  if (/^([a-zA-Z]:[/\\]|\/)/.test(filePath)) return filePath;
  // Join with a trailing slash guard
  const base = workspace.endsWith('/') || workspace.endsWith('\\') ? workspace : `${workspace}/`;
  return `${base}${filePath}`;
}

/** Resolve assistant display name from preset_assistant_id or custom_agent_id. */
function resolveAssistantName(
  extra: Record<string, unknown>,
  assistantList: Assistant[],
  acpAdapters: Record<string, unknown>[]
): string | null {
  // Extra fields are camelCase in the DB (presetAssistantId / customAgentId)
  const presetId =
    (extra?.presetAssistantId as string | undefined) ?? (extra?.preset_assistant_id as string | undefined) ?? '';
  const customId = (extra?.customAgentId as string | undefined) ?? (extra?.custom_agent_id as string | undefined) ?? '';
  const rawId = presetId || customId;
  if (!rawId) return null;

  // Extension ACP adapter format: ext:{extensionName}:{adapterId}
  if (rawId.startsWith('ext:')) {
    const parts = rawId.split(':');
    if (parts.length >= 3) {
      const extensionName = parts[1];
      const adapterId = parts.slice(2).join(':');
      const adapter = acpAdapters.find((a) => {
        const extName = typeof a._extensionName === 'string' ? a._extensionName : '';
        const id = typeof a.id === 'string' ? a.id : '';
        return extName === extensionName && id === adapterId;
      });
      if (adapter) {
        return typeof adapter.name === 'string' && adapter.name ? adapter.name : null;
      }
    }
    return null;
  }

  // Strip builtin- prefix for matching (same logic as usePresetAssistantInfo)
  const bareId = rawId.replace(/^builtin-/, '');
  const match = assistantList.find((a) => a.id === rawId || a.id === bareId || a.id === `builtin-${bareId}`);
  if (!match) return null;
  const lang = i18n.language;
  return match.name_i18n?.[lang] || match.name_i18n?.['zh-CN'] || match.name_i18n?.['en-US'] || match.name || null;
}

/** Agent display name and backend id extracted from conversation. */
function agentInfo(
  conv: TChatConversation,
  assistantList: Assistant[],
  acpAdapters: Record<string, unknown>[]
): { label: string; backend: string } {
  const extra = (conv.extra as Record<string, unknown> | undefined) ?? {};
  const backend = ((extra?.backend as string | undefined) ?? '').replace(/^(cli:|preset:)/, '');

  // If this conversation was started from a preset assistant, use its display name
  const assistantName = resolveAssistantName(extra, assistantList, acpAdapters);
  if (assistantName) return { label: assistantName, backend: backend || conv.type };

  // agentName covers CLI-launched agents with a display name set (camelCase in DB)
  const agentName = (extra?.agentName as string | undefined) ?? (extra?.agent_name as string | undefined) ?? '';
  if (agentName) return { label: agentName, backend: backend || conv.type };

  // Fallback: bare backend id
  const label = backend || conv.type;
  return { label, backend: label };
}

/** Conversation title — used as the prompt preview until we fetch the real first message. */
function conversationTitle(conv: TChatConversation): string {
  return conv.name;
}

// ---------------------------------------------------------------------------
// Extract files from messages
// ---------------------------------------------------------------------------

interface ExtractedFile {
  filePath: string; // absolute path on disk
  fileName: string;
}

/**
 * Extract written files from a tool_group message.
 *
 * Real data format (confirmed from DB):
 *   - WriteFile / Edit: path is in confirmationDetails.filePath (camelCase, absolute)
 *   - ImageGeneration:  path is in resultDisplay.img_url (absolute)
 *
 * resultDisplay.file_name does NOT exist in real data — it only appears in
 * the TypeScript type as a union variant; actual backend sends filePath via
 * confirmationDetails.
 */
function extractFilesFromToolGroup(msg: IMessageToolGroup, workspace?: string): ExtractedFile[] {
  const results: ExtractedFile[] = [];
  const items = msg.content;
  if (!Array.isArray(items)) return results;

  for (const item of items) {
    if (item.status !== 'Success') continue;

    if (TOOL_GROUP_WRITE_NAMES.has(item.name)) {
      // Path lives in confirmationDetails.filePath (absolute)
      const cd = item.confirmationDetails as Record<string, unknown> | undefined;
      const rawPath = (cd?.filePath as string | undefined) ?? '';
      if (!rawPath) continue;
      const filePath = resolveFilePath(workspace, rawPath);
      results.push({ filePath, fileName: nameOf(rawPath) });
      continue;
    }

    if (item.name === 'ImageGeneration') {
      // resultDisplay.img_url is an absolute path
      const rd = item.result_display as Record<string, unknown> | undefined;
      const rawPath = (rd?.img_url as string | undefined) ?? '';
      if (!rawPath) continue;
      const filePath = resolveFilePath(workspace, rawPath);
      results.push({ filePath, fileName: nameOf(rawPath) });
    }
  }
  return results;
}

/**
 * Extract written files from an acp_tool_call message.
 *
 * Handles two kinds:
 *   kind='edit'    — direct file write; path in rawInput.file_path or rawInput.abs_path
 *   kind='execute' — shell command (e.g. `officecli create foo.pptx`); extract Office doc
 *                    paths from the command string, resolved against rawInput.cwd
 */
function extractFilesFromAcpToolCall(msg: IMessageAcpToolCall): ExtractedFile[] {
  const update = msg.content?.update;
  if (!update) return [];

  const u = update as Record<string, unknown>;
  const kind = u.kind as string | undefined;
  const status = u.status as string | undefined;
  if (status === 'failed') return [];

  if (kind === ACP_WRITE_KIND) {
    const rawInput = u.rawInput as Record<string, unknown> | undefined;
    // file_path (mcp__acp__Write) takes priority over abs_path (native edit tool)
    const rawPath = (rawInput?.file_path as string | undefined) ?? (rawInput?.abs_path as string | undefined) ?? '';
    if (!rawPath) return [];
    return [{ filePath: rawPath, fileName: nameOf(rawPath) }];
  }

  if (kind === ACP_EXECUTE_KIND) {
    return extractFilesFromShellCommand(u);
  }

  return [];
}

/**
 * Parse Office document paths from a shell execute message.
 * rawInput.command can be a string or ["/bin/zsh", "-lc", "<cmd>"].
 * Relative paths are resolved against rawInput.cwd, with cd-override detection.
 */
function extractFilesFromShellCommand(update: Record<string, unknown>): ExtractedFile[] {
  const rawInput = update.rawInput as Record<string, unknown> | undefined;
  if (!rawInput) return [];

  const rawCwd = (rawInput.cwd as string | undefined) ?? '';

  // command may be a plain string or an array like ["/bin/zsh", "-lc", "<script>"]
  let cmdText = '';
  const cmd = rawInput.command;
  if (typeof cmd === 'string') {
    cmdText = cmd;
  } else if (Array.isArray(cmd)) {
    // last element is the actual shell script
    cmdText = String(cmd[cmd.length - 1] ?? '');
  }
  if (!cmdText) return [];

  // If command starts with `cd "..."` or `cd '...'`, use that as effective cwd
  const cdMatch = /^\s*cd\s+["']([^"']+)["']\s*&&/.exec(cmdText);
  const cwd = cdMatch ? cdMatch[1] : rawCwd;

  const found: ExtractedFile[] = [];
  const seen = new Set<string>();
  const re = new RegExp(OFFICE_EXTS_RE.source, 'gi');
  let m: RegExpExecArray | null;

  while ((m = re.exec(cmdText)) !== null) {
    let raw = m[1];
    // Strip surrounding quotes if present
    raw = raw.replace(/^['"]|['"]$/g, '');
    if (!raw) continue;

    // Resolve relative path against cwd
    const filePath = resolveFilePath(cwd || undefined, raw);
    if (!seen.has(filePath)) {
      seen.add(filePath);
      found.push({ filePath, fileName: nameOf(filePath) });
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Fetch all pages of messages for a conversation
// ---------------------------------------------------------------------------

const PAGE_SIZE = 200;
const MAX_PAGES = 20; // guard against extremely long conversations

interface FetchedMessages {
  toolGroups: IMessageToolGroup[];
  acpToolCalls: IMessageAcpToolCall[];
}

async function fetchAllMessages(conversationId: string): Promise<FetchedMessages> {
  const toolGroups: IMessageToolGroup[] = [];
  const acpToolCalls: IMessageAcpToolCall[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop -- sequential pagination: each page depends on has_more from previous
    const res = await database.getConversationMessages.invoke({
      conversation_id: conversationId,
      page,
      page_size: PAGE_SIZE,
      order: 'asc',
    });

    for (const msg of res.items) {
      if (msg.type === 'tool_group') {
        toolGroups.push(msg as unknown as IMessageToolGroup);
      } else if (msg.type === 'acp_tool_call') {
        acpToolCalls.push(msg as unknown as IMessageAcpToolCall);
      }
    }

    hasMore = res.has_more;
    page++;
  }

  return { toolGroups, acpToolCalls };
}

// ---------------------------------------------------------------------------
// Validate that files still exist on disk (lazy check)
// ---------------------------------------------------------------------------

async function filterExistingFiles(files: LibraryFile[], workspace?: string): Promise<LibraryFile[]> {
  const BATCH = 8;
  const existing: LibraryFile[] = [];
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop -- intentional batching to avoid IPC saturation
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const meta = await fs.getFileMetadata.invoke({ path: file.path, workspace });
          if (!meta || meta.isDirectory) return null;
          return { ...file, size: formatFileSize(meta.size) };
        } catch {
          return null;
        }
      })
    );
    for (const f of results) if (f) existing.push(f);
  }
  return existing;
}

// ---------------------------------------------------------------------------
// Build LibraryAsset list from a conversation
// ---------------------------------------------------------------------------

async function buildAssetFromConversation(
  conv: TChatConversation,
  assistantList: Assistant[],
  acpAdapters: Record<string, unknown>[]
): Promise<LibraryAsset | null> {
  const { toolGroups, acpToolCalls } = await fetchAllMessages(conv.id);
  if (toolGroups.length === 0 && acpToolCalls.length === 0) return null;

  const extra = conv.extra as Record<string, unknown> | undefined;
  const workspace = extra?.workspace as string | undefined;

  // Collect unique file paths (deduplicate by absolute path, keep latest occurrence).
  const fileMap = new Map<string, ExtractedFile>();

  for (const msg of toolGroups) {
    for (const f of extractFilesFromToolGroup(msg, workspace)) {
      fileMap.set(f.filePath, f);
    }
  }
  for (const msg of acpToolCalls) {
    for (const f of extractFilesFromAcpToolCall(msg)) {
      fileMap.set(f.filePath, f);
    }
  }

  if (fileMap.size === 0) return null;

  const rawFiles: LibraryFile[] = [...fileMap.values()].map(({ filePath, fileName }) => ({
    name: fileName,
    ext: extOf(fileName),
    size: '—',
    path: filePath,
  }));

  // Filter out files that no longer exist on disk.
  const existingFiles = await filterExistingFiles(rawFiles, workspace);
  if (existingFiles.length === 0) return null;

  const { label, backend } = agentInfo(conv, assistantList, acpAdapters);

  return {
    id: conv.id,
    conversationId: conv.id,
    conversationName: conv.name,
    agent: label,
    agentBackend: backend,
    prompt: conversationTitle(conv),
    createdAt: conv.created_at,
    updatedAt: conv.modified_at,
    files: existingFiles,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module-level cache — survives page navigation, cleared on account switch
// ---------------------------------------------------------------------------

interface LibraryCache {
  assets: LibraryAsset[];
  /** ms timestamp of the most recent conversation.modified_at we've seen */
  lastScanAt: number;
}

let _cache: LibraryCache | null = null;

/**
 * In-flight full-scan promise. If a scan is already running, new callers
 * attach to the same promise instead of starting a duplicate scan.
 */
let _scanInFlight: Promise<LibraryAsset[]> | null = null;

/** Discard the cache (call on account switch / logout). */
export function clearLibraryCache(): void {
  _cache = null;
  // Also drop any in-flight scan so stale results don't land after clear.
  _scanInFlight = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maxModifiedAt(items: { modified_at: number }[]): number {
  // Avoid Math.max(...spread) which throws RangeError on arrays > ~100k items.
  return items.reduce((m, c) => (c.modified_at > m ? c.modified_at : m), 0);
}

async function scanConversations(
  conversations: TChatConversation[],
  assistantList: Assistant[],
  acpAdapters: Record<string, unknown>[]
): Promise<LibraryAsset[]> {
  const BATCH = 5;
  const assets: LibraryAsset[] = [];
  for (let i = 0; i < conversations.length; i += BATCH) {
    const batch = conversations.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop -- intentional batching to avoid hammering the backend
    const results = await Promise.all(
      batch.map((c) => buildAssetFromConversation(c, assistantList, acpAdapters).catch((): null => null))
    );
    for (const asset of results) {
      if (asset) assets.push(asset);
    }
  }
  return assets;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return cached assets immediately if available, otherwise run a full scan.
 *
 * - Cache hit (no new conversations): O(1), zero IPC.
 * - Cache hit (new conversations exist): returns cache immediately, kicks off
 *   an incremental background scan and calls onIncremental when done.
 * - Cache miss: deduplicates concurrent callers via _scanInFlight so only one
 *   full scan runs even if called multiple times before the first resolves.
 *
 * Call clearLibraryCache() on account switch to force a fresh full scan.
 */
export async function listLibraryAssets(
  preloadedConversations: TChatConversation[],
  onIncremental?: (updated: LibraryAsset[]) => void
): Promise<LibraryAsset[]> {
  // ── Cache hit ──────────────────────────────────────────────────────────────
  if (_cache) {
    const { assets: cached, lastScanAt } = _cache;
    const newConvs = preloadedConversations.filter((c) => c.modified_at > lastScanAt);

    if (newConvs.length > 0 && onIncremental) {
      // Background incremental — capture cache ref at call time to avoid stale reads.
      const cacheAtStart = _cache;
      Promise.all([
        assistantsApi.list.invoke().catch((): Assistant[] => []),
        extensions.getAcpAdapters.invoke().catch((): Record<string, unknown>[] => []),
      ])
        .then(([assistantList, acpAdapters]) => scanConversations(newConvs, assistantList, acpAdapters))
        .then((newAssets) => {
          // Abort if cache was cleared (account switch) while we were scanning.
          if (_cache !== cacheAtStart) return;
          const assetMap = new Map(cacheAtStart.assets.map((a) => [a.conversationId, a]));
          for (const a of newAssets) assetMap.set(a.conversationId, a);
          const merged = [...assetMap.values()].toSorted((a, b) => b.updatedAt - a.updatedAt);
          _cache = {
            assets: merged,
            lastScanAt: Math.max(lastScanAt, maxModifiedAt(newConvs)),
          };
          onIncremental(merged);
        })
        .catch((e) => console.error('[Library] incremental scan failed:', e));
    }

    return cached;
  }

  // ── Cache miss: full scan — deduplicate concurrent callers ─────────────────
  if (_scanInFlight) return _scanInFlight;

  _scanInFlight = (async () => {
    try {
      const [assistantList, acpAdapters] = await Promise.all([
        assistantsApi.list.invoke().catch((): Assistant[] => []),
        extensions.getAcpAdapters.invoke().catch((): Record<string, unknown>[] => []),
      ]);

      const conversations =
        preloadedConversations.length > 0
          ? preloadedConversations
          : (await database.getUserConversations.invoke({ limit: 10_000 })).items;

      const assets = await scanConversations(conversations, assistantList, acpAdapters);
      const sorted = assets.toSorted((a, b) => b.updatedAt - a.updatedAt);

      // Only write cache if it hasn't been cleared mid-scan (account switch).
      if (_scanInFlight !== null) {
        _cache = {
          assets: sorted,
          lastScanAt: conversations.length > 0 ? maxModifiedAt(conversations) : Date.now(),
        };
      }
      return sorted;
    } finally {
      _scanInFlight = null;
    }
  })();

  return _scanInFlight;
}

// ---------------------------------------------------------------------------
// File type classifier (unchanged)
// ---------------------------------------------------------------------------

export function fileTypeOf(ext: string): LibraryFileType {
  const e = ext.toLowerCase();
  if (['docx', 'doc', 'md', 'txt', 'pdf'].includes(e)) return 'doc';
  if (['xlsx', 'xls', 'csv'].includes(e)) return 'sheet';
  if (['pptx', 'ppt'].includes(e)) return 'slide';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mmd', 'mermaid', 'mindmap'].includes(e)) return 'image';
  if (e === 'html' || e === 'htm') return 'html';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'json', 'yml', 'yaml', 'sh', 'css'].includes(e)) return 'code';
  return 'doc';
}
