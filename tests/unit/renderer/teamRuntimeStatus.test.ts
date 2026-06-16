import { describe, expect, it } from 'vitest';
import { formatElapsedShort, getTeamRuntimeStatus } from '@/renderer/pages/team/components/teamRuntimeStatus';
import zhCNTeamLocale from '@/renderer/services/i18n/locales/zh-CN/team.json';

describe('teamRuntimeStatus', () => {
  it('prefers slow when backend marks an active turn slow', () => {
    const status = getTeamRuntimeStatus({
      slot_id: 'worker-1',
      role: 'teammate',
      pending_wake_count: 1,
      starting_child_count: 0,
      active_turn_id: 'turn-worker',
      active_turn_elapsed_ms: 720_000,
      active_turn_slow: true,
      active_turn_slow_threshold_ms: 600_000,
    });

    expect(status?.kind).toBe('slow');
    expect(status?.elapsed).toBe('12m');
    expect(status?.noticeKey).toBe('team.runtime.notice.slow');
  });

  it('returns suppressed status for paused suppressed work', () => {
    const status = getTeamRuntimeStatus({
      slot_id: 'lead-1',
      role: 'lead',
      pending_wake_count: 0,
      starting_child_count: 0,
      paused: true,
      suppressed_wake_count: 2,
    });

    expect(status?.kind).toBe('suppressed');
    expect(status?.noticeKey).toBe('team.runtime.notice.suppressedByPause');
  });

  it('returns unhealthy status from backend runtime health', () => {
    const status = getTeamRuntimeStatus({
      slot_id: 'worker-1',
      role: 'teammate',
      pending_wake_count: 1,
      starting_child_count: 0,
      runtime_health: 'unhealthy',
    });

    expect(status?.kind).toBe('unhealthy');
    expect(status?.noticeKey).toBe('team.runtime.notice.unhealthy');
  });

  it('does not show a runtime badge for normal active work covered by the status dot', () => {
    const status = getTeamRuntimeStatus({
      slot_id: 'worker-1',
      role: 'teammate',
      pending_wake_count: 0,
      starting_child_count: 0,
      active_turn_id: 'turn-worker',
      active_turn_slow: false,
    });

    expect(status).toBeUndefined();
  });

  it('shows queued work behind an active turn instead of a generic busy badge', () => {
    const status = getTeamRuntimeStatus({
      slot_id: 'worker-1',
      role: 'teammate',
      pending_wake_count: 2,
      starting_child_count: 0,
      active_turn_id: 'turn-worker',
      active_turn_slow: false,
    });

    expect(status?.kind).toBe('queued');
    expect(status?.noticeKey).toBe('team.runtime.notice.queued');
  });

  it('formats elapsed values as short interpolation values', () => {
    expect(formatElapsedShort(59_000)).toBe('59s');
    expect(formatElapsedShort(600_000)).toBe('10m');
    expect(formatElapsedShort(3_600_000)).toBe('1h');
  });

  it('uses localized zh-CN runtime labels instead of English placeholders', () => {
    expect('badge' in zhCNTeamLocale.runtime).toBe(false);
    expect(zhCNTeamLocale.runtime.notice.queued).toBe('已为该 Agent 排队。');
    expect(zhCNTeamLocale.runtime.notice.slow).toBe('该 Agent 已运行 {{elapsed}}，仍在处理中。');
  });
});
