/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { buildListTasksPath } from '@/common/adapter/teamTaskPath';

describe('buildListTasksPath', () => {
  it('uses limit when no ids', () => {
    expect(buildListTasksPath({ team_id: 't1' })).toBe('/api/teams/t1/tasks?limit=500');
    expect(buildListTasksPath({ team_id: 't1', limit: 20 })).toBe('/api/teams/t1/tasks?limit=20');
  });
  it('uses ids filter when ids provided', () => {
    expect(buildListTasksPath({ team_id: 't1', ids: ['a', 'b'] })).toBe('/api/teams/t1/tasks?ids=a%2Cb');
  });
  it('falls back to limit when ids is empty', () => {
    expect(buildListTasksPath({ team_id: 't1', ids: [] })).toBe('/api/teams/t1/tasks?limit=500');
  });
});
