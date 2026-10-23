/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TeamAssistant, TeammateStatus } from '@/common/types/team/teamTypes';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { useTeamRunView } from '../hooks/useTeamRunView';
import {
  getCachedLastPrompt,
  getWatchdogInterval,
  setCachedLastPrompt,
  setWatchdogInterval,
} from './teamWatchdogStorage';
import type { TeamWatchdogInterval, TeamWatchdogPrompt } from './watchdogTypes';

const TICK_INTERVAL_MS = 5_000;
const RECOVERY_COOLDOWN_MS = 1_500;
const MAX_CONSECUTIVE_RETRIES = 2;

type AgentStatusInfo = {
  slot_id: string;
  status: TeammateStatus;
  last_message?: string;
};

type UseTeamWatchdogOptions = {
  team_id: string;
  teamRun: ReturnType<typeof useTeamRunView>;
  statusMap?: Map<string, AgentStatusInfo>;
  assistants?: TeamAssistant[];
};

export function useTeamWatchdog({ team_id, teamRun, statusMap, assistants }: UseTeamWatchdogOptions) {
  const { t } = useTranslation();
  const [intervalMs, setLocalIntervalMs] = useState<TeamWatchdogInterval>(() => getWatchdogInterval(team_id));
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const lastActivityTimeRef = useRef<number>(Date.now());
  const lastPromptRef = useRef<TeamWatchdogPrompt | null>(getCachedLastPrompt(team_id));
  const retryCountRef = useRef(0);
  const isRecoveringRef = useRef(false);

  // Keep references to frequently updating values so tick timer is never torn down prematurely
  const teamRunRef = useRef(teamRun);
  teamRunRef.current = teamRun;

  const statusMapRef = useRef(statusMap);
  statusMapRef.current = statusMap;

  const assistantsRef = useRef(assistants);
  assistantsRef.current = assistants;

  const intervalMsRef = useRef(intervalMs);
  intervalMsRef.current = intervalMs;

  // Synchronize state when team_id changes
  useEffect(() => {
    const loadedInterval = getWatchdogInterval(team_id);
    setLocalIntervalMs(loadedInterval);
    intervalMsRef.current = loadedInterval;
    lastPromptRef.current = getCachedLastPrompt(team_id);
    lastActivityTimeRef.current = Date.now();
    retryCountRef.current = 0;
  }, [team_id]);

  const updateInterval = useCallback(
    (newInterval: TeamWatchdogInterval) => {
      setLocalIntervalMs(newInterval);
      intervalMsRef.current = newInterval;
      setWatchdogInterval(team_id, newInterval);
    },
    [team_id]
  );

  const recordSentPrompt = useCallback(
    (payload: { input: string; files?: TeamWatchdogPrompt['files']; slot_id?: string }) => {
      const prompt: TeamWatchdogPrompt = {
        input: payload.input,
        files: payload.files,
        slot_id: payload.slot_id,
        timestamp: Date.now(),
      };
      lastPromptRef.current = prompt;
      setCachedLastPrompt(team_id, prompt);
      lastActivityTimeRef.current = Date.now();
      retryCountRef.current = 0;
      setIsMonitoring(true);
    },
    [team_id]
  );

  // Stream activity heartbeat: actual token or response chunk arrival refreshes last activity timestamp
  useEffect(() => {
    const onStreamActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };

    const unsubStream1 = ipcBridge.acpConversation?.responseStream?.on?.(onStreamActivity) ?? (() => {});
    const unsubStream2 = ipcBridge.conversation?.responseStream?.on?.(onStreamActivity) ?? (() => {});

    const unsubChildStart =
      ipcBridge.team?.childTurnStarted?.on?.((event) => {
        if (event.team_id === team_id) {
          lastActivityTimeRef.current = Date.now();
        }
      }) ?? (() => {});

    const unsubChildComplete =
      ipcBridge.team?.childTurnCompleted?.on?.((event) => {
        if (event.team_id === team_id) {
          lastActivityTimeRef.current = Date.now();
        }
      }) ?? (() => {});

    const unsubRunCancelled =
      ipcBridge.team?.runCancelled?.on?.((event) => {
        if (event.team_id === team_id) {
          setIsMonitoring(false);
        }
      }) ?? (() => {});

    const unsubRunFailed =
      ipcBridge.team?.runFailed?.on?.((event) => {
        if (event.team_id === team_id) {
          setIsMonitoring(false);
        }
      }) ?? (() => {});

    return () => {
      unsubStream1();
      unsubStream2();
      unsubChildStart();
      unsubChildComplete();
      unsubRunCancelled();
      unsubRunFailed();
    };
  }, [team_id]);

  // Execute stop and retry
  const executeRecovery = useCallback(
    async (isManual = false) => {
      if (isRecoveringRef.current) return;
      isRecoveringRef.current = true;
      setIsRecovering(true);

      const currentInterval = intervalMsRef.current;
      const minutes = currentInterval > 0 ? Math.round(currentInterval / 60_000) : 2;

      try {
        if (!isManual) {
          Message.warning(
            t('team.watchdog.triggerToast', {
              minutes,
              defaultValue: `Prompt stalled for over ${minutes}m without progress. Auto-stopping and retrying...`,
            })
          );
        }

        // 1. Cancel active run if present
        const activeRun = teamRunRef.current.state.activeRun;
        if (activeRun) {
          await ipcBridge.team.cancelRun.invoke({ team_id, team_run_id: activeRun.team_run_id }).catch(() => {});
        }

        // 2. Pause any slots still marked running or starting and restart stuck agent processes
        const runningSlotWork = Object.entries(teamRunRef.current.state.slotWorkBySlot || {}).filter(
          ([, work]) => work && (work.state === 'running' || work.state === 'starting')
        );

        const activeFromStatusMap = (assistantsRef.current || [])
          .filter((a) => statusMapRef.current?.get(a.slot_id)?.status === 'active')
          .map((a) => a.slot_id);

        const allStuckSlotIds = Array.from(
          new Set([...runningSlotWork.map(([slot_id]) => slot_id), ...activeFromStatusMap])
        );

        if (allStuckSlotIds.length > 0) {
          await Promise.allSettled(
            allStuckSlotIds.map(async (slot_id) => {
              const runId = teamRunRef.current.state.slotWorkBySlot[slot_id]?.team_run_id || activeRun?.team_run_id;
              if (runId) {
                await ipcBridge.team.pauseSlotWork
                  .invoke({
                    team_id,
                    team_run_id: runId,
                    slot_id,
                    reason: 'user_stop',
                  })
                  .catch(() => {});
              }
              // Force kill stuck agent process and rebuild runtime
              await ipcBridge.team.restartAgentRuntime.invoke({ team_id, slot_id }).catch(() => {});
            })
          );
        }

        // 3. Force state reconcile
        await teamRunRef.current.reconcile('watchdog-recovery');

        // 4. Cooldown for backend process release
        await new Promise((resolve) => setTimeout(resolve, RECOVERY_COOLDOWN_MS));

        // 5. Heal any failed teammate runtimes if needed
        const failedSlots = Object.entries(teamRunRef.current.state.slotWorkBySlot || {}).filter(
          ([, work]) => work?.blocked_reason === 'runtime_failed'
        );
        if (failedSlots.length > 0) {
          await Promise.allSettled(
            failedSlots.map(([slot_id]) => ipcBridge.team.attachAgent.invoke({ team_id, slot_id }))
          );
        }

        // 6. Retry prompt if recorded
        const cachedPrompt = lastPromptRef.current ?? getCachedLastPrompt(team_id);
        if (cachedPrompt?.input) {
          if (cachedPrompt.slot_id) {
            const ack = await ipcBridge.team.sendMessageToAgent.invoke({
              team_id,
              slot_id: cachedPrompt.slot_id,
              input: cachedPrompt.input,
              files: cachedPrompt.files,
            });
            teamRunRef.current.applyAck(ack);
          } else {
            const ack = await ipcBridge.team.sendMessage.invoke({
              team_id,
              input: cachedPrompt.input,
              files: cachedPrompt.files,
            });
            teamRunRef.current.applyAck(ack);
          }

          lastActivityTimeRef.current = Date.now();
          setIsMonitoring(true);
          Message.success(
            t('team.watchdog.retrySuccess', { defaultValue: 'Watchdog successfully retried the prompt.' })
          );
        } else {
          Message.info(
            t('team.watchdog.stoppedOnly', {
              defaultValue: 'Stalled process was stopped and reset. Please re-enter your prompt.',
            })
          );
          setIsMonitoring(false);
        }
      } catch (error) {
        console.warn('[useTeamWatchdog] recovery failed', error);
        Message.error(t('team.stopAgentFailed', { defaultValue: 'Failed to stop this assistant. Please try again.' }));
      } finally {
        isRecoveringRef.current = false;
        setIsRecovering(false);
      }
    },
    [t, team_id]
  );

  // Manual Check Progress & Retry Now
  const checkAndRetryNow = useCallback(async () => {
    if (isRecoveringRef.current) return;

    const isRunning =
      Boolean(teamRunRef.current.state.activeRun) ||
      Object.values(teamRunRef.current.state.slotWorkBySlot || {}).some(
        (w) => w && (w.state === 'running' || w.state === 'starting')
      ) ||
      Boolean(
        statusMapRef.current &&
        assistantsRef.current &&
        assistantsRef.current.some((a) => statusMapRef.current?.get(a.slot_id)?.status === 'active')
      );

    if (isRunning) {
      await executeRecovery(true);
    } else {
      Message.info(t('team.watchdog.idle', { defaultValue: 'Team is idle. No active process to retry.' }));
    }
  }, [executeRecovery, t]);

  // Watchdog tick loop - runs reliably every 5 seconds when intervalMs > 0
  useEffect(() => {
    if (intervalMs === 0) {
      setIsMonitoring(false);
      return;
    }

    const timer = setInterval(() => {
      if (isRecoveringRef.current) return;

      const isRunning =
        Boolean(teamRunRef.current.state.activeRun) ||
        Object.values(teamRunRef.current.state.slotWorkBySlot || {}).some(
          (w) => w && (w.state === 'running' || w.state === 'starting')
        ) ||
        Boolean(
          statusMapRef.current &&
          assistantsRef.current &&
          assistantsRef.current.some((a) => statusMapRef.current?.get(a.slot_id)?.status === 'active')
        ) ||
        (lastPromptRef.current !== null && Date.now() - lastPromptRef.current.timestamp < 30_000);

      if (!isRunning) {
        setIsMonitoring(false);
        retryCountRef.current = 0;
        return;
      }

      setIsMonitoring(true);

      const idleDurationMs = Date.now() - lastActivityTimeRef.current;
      console.debug(
        `[TeamWatchdog] Tick check: idle for ${Math.round(idleDurationMs / 1000)}s / ${Math.round(intervalMsRef.current / 1000)}s`
      );

      if (idleDurationMs >= intervalMsRef.current) {
        if (retryCountRef.current >= MAX_CONSECUTIVE_RETRIES) {
          Message.error(
            t('team.watchdog.maxRetriesReached', {
              defaultValue: 'Process stalled repeatedly. Auto-recovery stopped. Please check agent configuration.',
            })
          );
          setIsMonitoring(false);
          const activeRun = teamRunRef.current.state.activeRun;
          if (activeRun) {
            void ipcBridge.team.cancelRun.invoke({ team_id, team_run_id: activeRun.team_run_id }).catch(() => {});
          }
          return;
        }

        retryCountRef.current += 1;
        void executeRecovery(false);
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [executeRecovery, intervalMs, t, team_id]);

  return {
    intervalMs,
    setIntervalMs: updateInterval,
    isMonitoring,
    isRecovering,
    recordSentPrompt,
    checkAndRetryNow,
  };
}
