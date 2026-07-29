/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  chatFileRefKey,
  chatFileRefPath,
  isChatFileRef,
  localFileRef,
  projectFileRef,
  uploadFileRef,
} from '@/common/types/chatFile';

describe('ChatFileRef builders', () => {
  it('builds project / upload / local refs with their discriminant', () => {
    expect(projectFileRef('pe-1', 'src/a.ts')).toEqual({ kind: 'project', pe_id: 'pe-1', relative_path: 'src/a.ts' });
    expect(uploadFileRef('/tmp/aionui/a.png')).toEqual({ kind: 'upload', path: '/tmp/aionui/a.png' });
    expect(localFileRef('/backend/abs/a.ts')).toEqual({ kind: 'local', path: '/backend/abs/a.ts' });
  });
});

describe('chatFileRefPath', () => {
  it('returns relative_path for project and path for upload/local', () => {
    expect(chatFileRefPath(projectFileRef('pe-1', 'src/a.ts'))).toBe('src/a.ts');
    expect(chatFileRefPath(uploadFileRef('/tmp/u.png'))).toBe('/tmp/u.png');
    expect(chatFileRefPath(localFileRef('/backend/l.ts'))).toBe('/backend/l.ts');
  });
});

describe('chatFileRefKey', () => {
  it('keys project by pe identity and upload/local by kind-tagged path', () => {
    expect(chatFileRefKey(projectFileRef('pe-1', 'a.ts'))).toBe('project\0pe-1\0a.ts');
    expect(chatFileRefKey(uploadFileRef('/p/x'))).toBe('upload\0/p/x');
    expect(chatFileRefKey(localFileRef('/p/x'))).toBe('local\0/p/x');
  });

  it('keeps an upload and a local sharing a path string distinct', () => {
    expect(chatFileRefKey(uploadFileRef('/p/x'))).not.toBe(chatFileRefKey(localFileRef('/p/x')));
  });
});

describe('isChatFileRef', () => {
  it('accepts well-formed project / upload / local refs', () => {
    expect(isChatFileRef({ kind: 'project', pe_id: 'p', relative_path: 'a.ts' })).toBe(true);
    expect(isChatFileRef({ kind: 'upload', path: '/a' })).toBe(true);
    expect(isChatFileRef({ kind: 'local', path: '/a' })).toBe(true);
  });

  it('rejects malformed or foreign shapes', () => {
    expect(isChatFileRef(null)).toBe(false);
    expect(isChatFileRef('/a')).toBe(false);
    expect(isChatFileRef({ kind: 'local' })).toBe(false); // missing path
    expect(isChatFileRef({ kind: 'upload', path: 3 })).toBe(false); // wrong type
    expect(isChatFileRef({ kind: 'project', pe_id: 'p' })).toBe(false); // missing relative_path
    expect(isChatFileRef({ kind: 'other', path: '/a' })).toBe(false); // unknown kind
  });
});
