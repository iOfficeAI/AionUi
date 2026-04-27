/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewContentType, PreviewSnapshotInfo } from '../types/preview';

// ── Backend → Frontend ─────────────────────────────────────────────────

const VALID_CONTENT_TYPES = new Set<PreviewContentType>([
  'markdown',
  'diff',
  'code',
  'html',
  'pdf',
  'ppt',
  'word',
  'excel',
  'image',
  'url',
]);

function toContentType(raw: string | undefined): PreviewContentType {
  return VALID_CONTENT_TYPES.has(raw as PreviewContentType) ? (raw as PreviewContentType) : 'code';
}

export function fromBackendSnapshot(raw: unknown): PreviewSnapshotInfo {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: (r.id as string | undefined) ?? '',
    label: (r.label as string | undefined) ?? '',
    created_at: (r.created_at as number | undefined) ?? 0,
    size: (r.size as number | undefined) ?? 0,
    contentType: toContentType((r.content_type as string | undefined) ?? (r.contentType as string | undefined)),
    file_name: r.file_name as string | undefined,
    file_path: r.file_path as string | undefined,
  };
}

export function fromBackendSnapshotList(raw: unknown): PreviewSnapshotInfo[] {
  return Array.isArray(raw) ? (raw as unknown[]).map(fromBackendSnapshot) : [];
}

export function fromBackendSnapshotContent(raw: unknown): { snapshot: PreviewSnapshotInfo; content: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.snapshot) return null;
  return {
    snapshot: fromBackendSnapshot(r.snapshot),
    content: (r.content as string | undefined) ?? '',
  };
}
