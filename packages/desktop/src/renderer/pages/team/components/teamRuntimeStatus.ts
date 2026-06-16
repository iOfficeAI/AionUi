import type { ITeamSlotWork } from '@/common/types/team/teamTypes';

export type TeamRuntimeStatusKind = 'queued' | 'slow' | 'suppressed' | 'disconnected' | 'unhealthy';

export type TeamRuntimeStatus = {
  kind: TeamRuntimeStatusKind;
  noticeKey?: string;
  elapsed?: string;
};

export const formatElapsedShort = (elapsedMs: number): string => {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
};

export const getTeamRuntimeStatus = (work?: ITeamSlotWork): TeamRuntimeStatus | undefined => {
  if (!work) return undefined;

  if (work.runtime_health === 'disconnected') {
    return {
      kind: 'disconnected',
      noticeKey: 'team.runtime.notice.disconnected',
    };
  }

  if (work.runtime_health === 'unhealthy') {
    return {
      kind: 'unhealthy',
      noticeKey: 'team.runtime.notice.unhealthy',
    };
  }

  if (work.active_turn_id && work.active_turn_slow) {
    return {
      kind: 'slow',
      noticeKey: 'team.runtime.notice.slow',
      elapsed: formatElapsedShort(work.active_turn_elapsed_ms ?? 0),
    };
  }

  if (work.paused && (work.suppressed_wake_count ?? 0) > 0) {
    return {
      kind: 'suppressed',
      noticeKey: 'team.runtime.notice.suppressedByPause',
    };
  }

  if ((work.pending_wake_count ?? 0) > 0) {
    return {
      kind: 'queued',
      noticeKey: 'team.runtime.notice.queued',
    };
  }

  return undefined;
};
