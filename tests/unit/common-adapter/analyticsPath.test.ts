import { describe, it, expect } from 'vitest';
import { buildAgentUsagePath } from '@/common/adapter/ipcBridge';

describe('buildAgentUsagePath', () => {
  it('builds path with no params', () => {
    expect(buildAgentUsagePath(undefined)).toBe('/api/analytics/agent-usage');
  });
  it('maps camelCase params to snake_case query', () => {
    const p = buildAgentUsagePath({
      trendGranularity: 'week',
      trendDimension: 'project',
      timeRange: '7d',
      refresh: true,
      sessionsLimit: 50,
      sessionsOffset: 100,
    });
    expect(p).toBe(
      '/api/analytics/agent-usage?trend_granularity=week&trend_dimension=project&time_range=7d&refresh=true&sessions_limit=50&sessions_offset=100'
    );
  });
  it('omits falsy refresh and undefined fields', () => {
    expect(buildAgentUsagePath({ timeRange: '30d', refresh: false })).toBe('/api/analytics/agent-usage?time_range=30d');
  });
  it('sessionsLimit=0 / sessionsOffset=0 仍被发送 (用 != null 判断)', () => {
    // 边界: 0 是合法值, 不该被当 falsy 丢弃
    const p = buildAgentUsagePath({ sessionsLimit: 0, sessionsOffset: 0 });
    expect(p).toBe('/api/analytics/agent-usage?sessions_limit=0&sessions_offset=0');
  });
  it('支持 today 时间窗', () => {
    expect(buildAgentUsagePath({ timeRange: 'today' })).toBe('/api/analytics/agent-usage?time_range=today');
  });
});
