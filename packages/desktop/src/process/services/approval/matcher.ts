/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApprovalLeafMatcher, ApprovalMatcher, ApprovalMatchMode, ChislPermissionRequest } from './types';

function matchMode(mode: ApprovalMatchMode | undefined, results: boolean[]): boolean {
  const effective = mode ?? 'any';
  return effective === 'all' ? results.every(Boolean) : results.some(Boolean);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const source = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
  return new RegExp(source);
}

function matchPattern(type: ApprovalLeafMatcher['type'], value: string, pattern: string): boolean {
  switch (type) {
    case 'exact':
      return value === pattern;
    case 'prefix':
      return value.startsWith(pattern);
    case 'glob':
      return globToRegExp(pattern).test(value);
    case 'regex':
      return new RegExp(pattern).test(value);
    default:
      return false;
  }
}

function readMetadataValue(metadata: Record<string, unknown> | undefined, path: string): unknown {
  if (!metadata || !path) return undefined;
  const segments = path.split('.').filter(Boolean);
  let current: unknown = metadata;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function fieldValues(request: ChislPermissionRequest, field: ApprovalLeafMatcher['field']): string[] {
  switch (field) {
    case 'permission':
      return [request.permission];
    case 'sessionID':
      return [request.sessionID];
    case 'id':
      return [request.id];
    case 'patterns':
      return request.patterns;
    case 'metadata':
      return [];
    default:
      return [];
  }
}

function matchLeaf(request: ChislPermissionRequest, matcher: ApprovalLeafMatcher): boolean {
  if (matcher.field === 'metadata') {
    const expected = matcher.patterns ?? [];
    if (expected.length === 0) return false;
    const actual = readMetadataValue(request.metadata, matcher.path ?? '');
    const actualStr = actual === undefined || actual === null ? '' : String(actual);
    const results = expected.map((pattern) => matchPattern(matcher.type, actualStr, pattern));
    return matchMode(matcher.matchMode, results);
  }

  const values = fieldValues(request, matcher.field);
  const patterns = matcher.patterns ?? [];
  if (patterns.length === 0 || values.length === 0) return false;

  if ((matcher.matchMode ?? 'any') === 'all') {
    return patterns.every((pattern) => values.some((value) => matchPattern(matcher.type, value, pattern)));
  }
  return patterns.some((pattern) => values.some((value) => matchPattern(matcher.type, value, pattern)));
}

export function matchesApprovalRule(request: ChislPermissionRequest, matcher: ApprovalMatcher): boolean {
  if (matcher.type === 'composite') {
    const childResults = matcher.children.map((child) => matchesApprovalRule(request, child));
    return matcher.operator === 'and' ? childResults.every(Boolean) : childResults.some(Boolean);
  }
  return matchLeaf(request, matcher);
}
