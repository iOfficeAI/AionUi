import { describe, it, expect } from 'vitest';
import { fromApiAgentUsage } from '@/common/types/agentUsage';
import type { AgentUsageResponseRaw } from '@/common/types/agentUsage';

describe('fromApiAgentUsage', () => {
  it('maps snake_case API shape to camelCase domain model', () => {
    const raw: AgentUsageResponseRaw = {
      scanned_at: '2026-05-18T10:30:00Z',
      sources: [{ agent: 'claude', files_total: 1, files_parsed: 1, files_skipped: 0, available: true, error: null }],
      summary: {
        by_agent: [
          {
            agent: 'claude',
            sessions: 1,
            messages: 2,
            input_tokens: 10,
            output_tokens: 5,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            total_tokens: 15,
          },
        ],
      },
      by_model: [],
      by_project: [
        {
          agent: 'claude',
          project: '/work/p',
          sessions: 1,
          input_tokens: 5,
          output_tokens: 4,
          cache_read_tokens: 3,
          cache_creation_tokens: 3,
          total_tokens: 15,
        },
      ],
      trend: {
        granularity: 'day',
        points: [
          {
            bucket: '2026-05-17',
            by_segment: { claude: 15 },
            by_token_kind: { input: 5, output: 4, cache_read: 3, cache_creation: 3 },
          },
        ],
      },
      time_range: '30d',
      sessions_total: 1,
      sessions_limit: 200,
      sessions_offset: 0,
      sessions: [
        {
          agent: 'claude',
          session_id: 's1',
          project: '/work/p',
          model: 'claude-opus-4-7',
          started_at: '2026-05-17T08:00:00Z',
          last_active_at: '2026-05-17T09:00:00Z',
          messages: 2,
          total_tokens: 15,
        },
      ],
    };
    const m = fromApiAgentUsage(raw);
    expect(m.scannedAt).toBe('2026-05-18T10:30:00Z');
    expect(m.summary.byAgent[0].totalTokens).toBe(15);
    expect(m.sessionsTotal).toBe(1);
    expect(m.sessions[0].sessionId).toBe('s1');
    expect(m.sessions[0].lastActiveAt).toBe('2026-05-17T09:00:00Z');
    expect(m.trend.points[0].bySegment.claude).toBe(15);
    expect(m.trend.points[0].byTokenKind).toEqual({ input: 5, output: 4, cacheRead: 3, cacheCreation: 3 });
    expect(m.byProject[0]).toMatchObject({ project: '/work/p', totalTokens: 15, cacheReadTokens: 3 });
  });
});
