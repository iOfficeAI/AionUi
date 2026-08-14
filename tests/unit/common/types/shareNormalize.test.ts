/**
 * @vitest-environment node
 */

import { normalizeShareList, normalizeShareRecord, normalizeUserDirectory } from '@/common/types/platform/share';
import { resolveProjectIdFromConversations } from '@/renderer/pages/settings/WebuiSettings/shareUi';
import { describe, expect, it } from 'vitest';

describe('share payload normalization', () => {
  const valid = {
    id: 's1',
    resource_type: 'conversation',
    resource_id: 'c1',
    resource_name: 'Draft',
    permission: 'edit',
    owner_user_id: 'o1',
    owner_username: 'owner',
    grantee_user_id: 'g1',
    grantee_username: 'guest',
    created_at: 42,
  };

  it('accepts a complete share record', () => {
    expect(normalizeShareRecord(valid)).toEqual(valid);
  });

  it('drops incomplete or unknown share records', () => {
    expect(normalizeShareRecord(null)).toBeNull();
    expect(normalizeShareRecord({ ...valid, permission: 'admin' })).toBeNull();
    expect(normalizeShareRecord({ ...valid, resource_type: 'team' })).toBeNull();
    expect(normalizeShareRecord({ ...valid, id: '' })).toBeNull();
  });

  it('normalizes both list envelope shapes', () => {
    expect(normalizeShareList({ items: [valid] }).items).toHaveLength(1);
    expect(normalizeShareList([valid, { bad: true }]).items).toEqual([valid]);
    expect(normalizeShareList({ shares: [valid] }).items).toHaveLength(1);
    expect(normalizeShareList(undefined).items).toEqual([]);
  });

  it('normalizes directory users from items or users arrays', () => {
    expect(normalizeUserDirectory({ items: [{ id: '1', username: 'a' }] }).items).toEqual([{ id: '1', username: 'a' }]);
    expect(normalizeUserDirectory([{ id: '2', username: 'b' }, { id: 'x' }]).items).toEqual([
      { id: '2', username: 'b' },
    ]);
    expect(normalizeUserDirectory({ users: [{ id: '3', username: 'c' }] }).items).toEqual([{ id: '3', username: 'c' }]);
  });
});

describe('resolveProjectIdFromConversations', () => {
  it('returns the first non-empty project id', () => {
    expect(
      resolveProjectIdFromConversations([
        { project_id: '' },
        { project_id: '  ' },
        { project_id: ' project-9 ' },
        { project_id: 'other' },
      ])
    ).toBe('project-9');
  });

  it('returns null when no conversation carries a project id', () => {
    expect(resolveProjectIdFromConversations([{}, { project_id: null }])).toBeNull();
  });
});
