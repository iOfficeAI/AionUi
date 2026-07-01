import { useEffect } from 'react';
import { ipcBridge } from '@/common';

export const ACTIVE_LEASE_RENEW_INTERVAL_MS = 30_000;

export type ActiveLeaseTarget = { type: 'conversation'; id?: string | null } | { type: 'team'; id?: string | null };

export function useActiveLease(target: ActiveLeaseTarget): void {
  useEffect(() => {
    const id = target.id;
    if (!id) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const renew = () => {
      if (target.type === 'conversation') {
        void ipcBridge.conversation.activeLease.invoke({ conversation_id: id }).catch(() => {});
      } else {
        void ipcBridge.team.activeLease.invoke({ team_id: id }).catch(() => {});
      }
    };

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const start = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      stop();
      renew();
      intervalId = setInterval(renew, ACTIVE_LEASE_RENEW_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stop();
    };
  }, [target.id, target.type]);
}
