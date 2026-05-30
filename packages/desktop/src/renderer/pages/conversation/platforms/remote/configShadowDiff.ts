/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M19 (Option A) — shadow detection for the Server config editor.
 *
 * The editor writes to the server's *global* config layer (`/global/config`).
 * On a server where a key is also defined in a higher-precedence layer
 * (a project-level `opencode.json` or an agent file), the global edit is
 * persisted but silently overridden — the engine keeps running the
 * higher-layer value. These helpers diff the keys the user actually changed
 * against the *effective* config (`/config`) and report any whose effective
 * value does not match what was written, so the UI can warn that the edit
 * won't take effect.
 */

type Json = unknown;

/** Structural deep equality for JSON values (objects key-order-insensitive). */
export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, Json>;
    const bo = b as Record<string, Json>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
  }
  return false;
}

function isPlainObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type LeafChange = { path: string[]; value: Json };

/**
 * Leaf paths in `after` that were added or changed relative to `before`.
 * Arrays are compared whole (treated as leaves) so e.g. a `permission` array
 * surfaces as a single path rather than per-index noise.
 */
export function changedLeaves(before: Json, after: Json, prefix: string[] = []): LeafChange[] {
  if (!isPlainObject(after)) {
    return deepEqual(before, after) ? [] : [{ path: prefix, value: after }];
  }
  const beforeObj = isPlainObject(before) ? before : {};
  const out: LeafChange[] = [];
  for (const key of Object.keys(after)) {
    const next = after[key];
    const prev = beforeObj[key];
    const path = [...prefix, key];
    if (isPlainObject(next)) {
      out.push(...changedLeaves(prev, next, path));
    } else if (!deepEqual(prev, next)) {
      out.push({ path, value: next });
    }
  }
  return out;
}

/** Read a value at a path array from a nested object; `undefined` if absent. */
export function getAtPath(obj: Json, path: string[]): Json {
  let cur: Json = obj;
  for (const key of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * Given the pre-edit baseline, the just-written object, and the server's
 * effective config, return the dotted paths of edits that are shadowed —
 * i.e. the effective config does not reflect the value the user wrote.
 */
export function findShadowedPaths(before: Json, written: Json, effective: Json): string[] {
  return changedLeaves(before, written)
    .filter((leaf) => !deepEqual(getAtPath(effective, leaf.path), leaf.value))
    .map((leaf) => leaf.path.join('.'));
}
