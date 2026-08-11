/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import stripJsonComments from 'strip-json-comments';
import { isPathWithinDirectory } from '../../sandbox/pathSafety';

const FILE_REF_PREFIX = '$file:';
const JSON_EXTENSIONS = new Set(['.json', '.jsonc', '.json5']);

function isFileRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(FILE_REF_PREFIX);
}

function extractFilePath(ref: string): string {
  return ref.slice(FILE_REF_PREFIX.length).trim();
}

export async function resolveFileRefs(
  obj: unknown,
  extensionDir: string,
  resolvedPaths?: Set<string>
): Promise<unknown> {
  const visited = resolvedPaths ?? new Set<string>();

  if (isFileRef(obj)) {
    return await resolveFileRefValue(obj, extensionDir, visited);
  }
  if (Array.isArray(obj)) {
    const results = await Promise.all(obj.map((item) => resolveFileRefs(item, extensionDir, visited)));
    return results;
  }
  if (obj !== null && typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    const resolved = await Promise.all(
      entries.map(async ([key, value]) => [key, await resolveFileRefs(value, extensionDir, visited)])
    );
    return Object.fromEntries(resolved);
  }
  return obj;
}

async function resolveFileRefValue(ref: string, extensionDir: string, visited: Set<string>): Promise<unknown> {
  const relativePath = extractFilePath(ref);
  const absolutePath = path.resolve(extensionDir, relativePath);

  // Security: prevent path traversal — $file references must resolve within the extension directory
  if (!isPathWithinDirectory(absolutePath, extensionDir)) {
    console.warn(`[Extensions] Path traversal attempt in $file: reference: ${relativePath}`);
    return ref;
  }

  if (visited.has(absolutePath)) {
    console.warn(`[Extensions] Circular $file: reference detected: ${relativePath}`);
    return ref;
  }
  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Referenced file not found: ${absolutePath} (from $file:${relativePath})`);
    return ref;
  }

  visited.add(absolutePath);
  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const ext = path.extname(absolutePath).toLowerCase();
    if (JSON_EXTENSIONS.has(ext)) {
      const stripped = stripJsonComments(content);
      const parsed = JSON.parse(stripped);
      return resolveFileRefs(parsed, extensionDir, visited);
    }
    return content.replace(/\n$/, '');
  } catch (error) {
    console.warn(
      `[Extensions] Failed to resolve $file:${relativePath}:`,
      error instanceof Error ? error.message : error
    );
    return ref;
  }
}
