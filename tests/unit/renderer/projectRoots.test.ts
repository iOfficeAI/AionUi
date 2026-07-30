import { describe, expect, it } from 'vitest';

import type { ProjectDetailDto, ProjectEntryDto } from '@/common/types/project';
import { entryToRootRef, toRootRefs } from '@/renderer/pages/conversation/explorer/projectRoots';

const entry = (over: Partial<ProjectEntryDto> = {}): ProjectEntryDto => ({
  pe_id: 'pe1',
  role: 'workspace',
  display_name: null,
  display_path: '/Users/me/app',
  order_index: 0,
  runtime_status: 'available',
  ...over,
});

describe('entryToRootRef title fallback', () => {
  it('uses the user display_name when present', () => {
    expect(entryToRootRef(entry({ display_name: 'My App' })).title).toBe('My App');
  });

  it('falls back to the display_path basename when display_name is null', () => {
    expect(entryToRootRef(entry({ display_name: null, display_path: '/Users/me/sentry-patrol' })).title).toBe(
      'sentry-patrol'
    );
  });

  it('falls back to basename when display_name is blank (whitespace only)', () => {
    expect(entryToRootRef(entry({ display_name: '   ', display_path: '/a/b/proj' })).title).toBe('proj');
  });

  it('ignores a trailing slash when deriving the basename', () => {
    expect(entryToRootRef(entry({ display_name: null, display_path: '/a/b/proj/' })).title).toBe('proj');
  });

  it('handles Windows-style backslash display paths', () => {
    expect(entryToRootRef(entry({ display_name: null, display_path: 'C:\\Users\\me\\proj' })).title).toBe('proj');
  });

  it('last-resort falls back to pe_id when both name and path basename are empty', () => {
    expect(entryToRootRef(entry({ pe_id: 'pe-x', display_name: null, display_path: '' })).title).toBe('pe-x');
  });

  it('passes role and runtime_status through onto the root', () => {
    const ref = entryToRootRef(entry({ role: 'attached', runtime_status: 'missing' }));
    expect(ref.role).toBe('attached');
    expect(ref.runtimeStatus).toBe('missing');
  });
});

describe('toRootRefs', () => {
  it('maps every entry and preserves the backend order', () => {
    const detail: ProjectDetailDto = {
      project_id: 'p1',
      name: 'Proj',
      explorer: {
        workspace_pe_id: 'peW',
        entries: [
          entry({ pe_id: 'peW', role: 'workspace', display_name: 'Workspace', order_index: 0 }),
          entry({ pe_id: 'peA', role: 'attached', display_name: 'Lib', order_index: 1 }),
        ],
      },
    };
    const refs = toRootRefs(detail);
    expect(refs.map((r) => r.pe_id)).toEqual(['peW', 'peA']);
    expect(refs.map((r) => r.title)).toEqual(['Workspace', 'Lib']);
    expect(refs.map((r) => r.role)).toEqual(['workspace', 'attached']);
  });

  it('returns an empty array for a project with no entries', () => {
    const detail: ProjectDetailDto = {
      project_id: 'p1',
      name: 'Empty',
      explorer: { workspace_pe_id: '', entries: [] },
    };
    expect(toRootRefs(detail)).toEqual([]);
  });
});
