/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Common cron job actions
 */
interface CronJobActionsResult {
  pauseJob: (job_id: string) => Promise<void>;
  resumeJob: (job_id: string) => Promise<void>;
  deleteJob: (job_id: string) => Promise<void>;
  updateJob: (job_id: string, updates: Partial<ICronJob>) => Promise<ICronJob>;
}

/**
 * Creates common cron job action handlers
 */
function useCronJobActions(
  onJobUpdated?: (job_id: string, job: ICronJob) => void,
  onJobDeleted?: (job_id: string) => void
): CronJobActionsResult {
  const pauseJob = useCallback(
    async (job_id: string) => {
      const updated = await ipcBridge.cron.updateJob.invoke({ job_id, updates: { enabled: false } });
      onJobUpdated?.(job_id, updated);
    },
    [onJobUpdated]
  );

  const resumeJob = useCallback(
    async (job_id: string) => {
      const updated = await ipcBridge.cron.updateJob.invoke({ job_id, updates: { enabled: true } });
      onJobUpdated?.(job_id, updated);
    },
    [onJobUpdated]
  );

  const deleteJob = useCallback(
    async (job_id: string) => {
      await ipcBridge.cron.removeJob.invoke({ job_id });
      onJobDeleted?.(job_id);
    },
    [onJobDeleted]
  );

  const updateJob = useCallback(
    async (job_id: string, updates: Partial<ICronJob>) => {
      const updated = await ipcBridge.cron.updateJob.invoke({ job_id, updates });
      onJobUpdated?.(job_id, updated);
      return updated;
    },
    [onJobUpdated]
  );

  return { pauseJob, resumeJob, deleteJob, updateJob };
}

/**
 * Event handlers for cron job subscription
 */
interface CronJobEventHandlers {
  onJobCreated: (job: ICronJob) => void;
  onJobUpdated: (job: ICronJob) => void;
  onJobRemoved: (data: { job_id: string }) => void;
}

/**
 * Subscribe to cron job events with unified cleanup
 */
function useCronJobSubscription(handlers: CronJobEventHandlers) {
  useEffect(() => {
    const unsubCreate = ipcBridge.cron.onJobCreated.on(handlers.onJobCreated);
    const unsubUpdate = ipcBridge.cron.onJobUpdated.on(handlers.onJobUpdated);
    const unsubRemove = ipcBridge.cron.onJobRemoved.on(handlers.onJobRemoved);

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubRemove();
    };
  }, [handlers.onJobCreated, handlers.onJobUpdated, handlers.onJobRemoved]);
}

/**
 * Hook for managing cron jobs for a specific conversation
 * @param conversation_id - The conversation ID to fetch jobs for
 */
export function useCronJobs(conversation_id?: string) {
  const [jobs, setJobs] = useState<ICronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch jobs for the conversation
  const fetchJobs = useCallback(async () => {
    if (!conversation_id) {
      setJobs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await ipcBridge.cron.listJobsByConversation.invoke({ conversation_id });
      setJobs(result || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch cron jobs'));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [conversation_id]);

  // Initial fetch
  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // Event handlers
  const eventHandlers = useMemo<CronJobEventHandlers>(
    () => ({
      onJobCreated: (job: ICronJob) => {
        if (job.metadata.conversation_id === conversation_id) {
          setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [...prev, job]));
        }
      },
      onJobUpdated: (job: ICronJob) => {
        if (job.metadata.conversation_id === conversation_id) {
          setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
        }
      },
      onJobRemoved: ({ job_id }: { job_id: string }) => {
        setJobs((prev) => prev.filter((j) => j.id !== job_id));
      },
    }),
    [conversation_id]
  );

  useCronJobSubscription(eventHandlers);

  // Actions (without local state updates, rely on events)
  const actions = useCronJobActions();

  // Computed values
  const hasJobs = jobs.length > 0;
  const activeJobsCount = jobs.filter((j) => j.enabled).length;
  const hasError = jobs.some((j) => j.state.lastStatus === 'error');

  return {
    jobs,
    loading,
    error,
    hasJobs,
    activeJobsCount,
    hasError,
    refetch: fetchJobs,
    ...actions,
  };
}

/**
 * Hook for managing all cron jobs across all conversations
 */
export function useAllCronJobs() {
  const [jobs, setJobs] = useState<ICronJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all jobs
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const allJobs = await ipcBridge.cron.listJobs.invoke();
      setJobs(allJobs || []);
    } catch (err) {
      console.error('[useAllCronJobs] Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // Event handlers
  const eventHandlers = useMemo<CronJobEventHandlers>(
    () => ({
      onJobCreated: (job: ICronJob) => {
        setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [...prev, job]));
      },
      onJobUpdated: (job: ICronJob) => {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
      },
      onJobRemoved: ({ job_id }: { job_id: string }) => {
        setJobs((prev) => prev.filter((j) => j.id !== job_id));
      },
    }),
    []
  );

  useCronJobSubscription(eventHandlers);

  // Actions with local state updates
  const handleJobUpdated = useCallback((job_id: string, job: ICronJob) => {
    setJobs((prev) => prev.map((j) => (j.id === job_id ? job : j)));
  }, []);

  const handleJobDeleted = useCallback((job_id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== job_id));
  }, []);

  const actions = useCronJobActions(handleJobUpdated, handleJobDeleted);

  // Computed values
  const activeCount = useMemo(() => jobs.filter((j) => j.enabled).length, [jobs]);
  const hasError = useMemo(() => jobs.some((j) => j.state.lastStatus === 'error'), [jobs]);

  return {
    jobs,
    loading,
    activeCount,
    hasError,
    refetch: fetchJobs,
    ...actions,
  };
}

/**
 * Hook for getting cron job status for all conversations
 * Used by ChatHistory to show indicators
 */
export function useCronJobsMap() {
  const [jobsMap, setJobsMap] = useState<Map<string, ICronJob[]>>(new Map());
  const [loading, setLoading] = useState(true);
  // Track conversations with unread cron executions (red dot indicator)
  const [unreadConversations, setUnreadConversations] = useState<Set<string>>(() => {
    // Restore from localStorage
    try {
      const stored = localStorage.getItem('aionui_cron_unread');
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    return new Set();
  });
  // Track lastRunAtMs for each job to detect new executions
  const lastRunAtMapRef = useRef<Map<string, number>>(new Map());
  // Track current active conversation (use ref to access latest value in event handlers)
  const activeConversationIdRef = useRef<string | null>(null);

  // Persist unread state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('aionui_cron_unread', JSON.stringify([...unreadConversations]));
    } catch {
      // ignore
    }
  }, [unreadConversations]);

  // Fetch all jobs and group by conversation
  const fetchAllJobs = useCallback(async () => {
    setLoading(true);
    try {
      const allJobs = await ipcBridge.cron.listJobs.invoke();
      const map = new Map<string, ICronJob[]>();

      for (const job of allJobs || []) {
        const convId = job.metadata.conversation_id;
        if (!map.has(convId)) {
          map.set(convId, []);
        }
        map.get(convId)!.push(job);
        // Initialize lastRunAtMap for detecting new executions
        if (job.state.lastRunAtMs) {
          lastRunAtMapRef.current.set(job.id, job.state.lastRunAtMs);
        }
      }

      setJobsMap(map);
    } catch (err) {
      console.error('[useCronJobsMap] Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchAllJobs();
  }, [fetchAllJobs]);

  // Event handlers
  const eventHandlers = useMemo<CronJobEventHandlers>(
    () => ({
      onJobCreated: (job: ICronJob) => {
        setJobsMap((prev) => {
          const convId = job.metadata.conversation_id;
          const existing = prev.get(convId) || [];
          if (existing.some((j) => j.id === job.id)) {
            return prev;
          }
          const newMap = new Map(prev);
          newMap.set(convId, [...existing, job]);
          return newMap;
        });
        // Refresh conversation list to update sorting (modifyTime was updated)
        console.log('[useCronJobsMap] onJobCreated, triggering chat.history.refresh');
        emitter.emit('chat.history.refresh');
      },
      onJobUpdated: (job: ICronJob) => {
        const convId = job.metadata.conversation_id;

        // Check if this is a new execution (lastRunAtMs changed)
        const prevLastRunAt = lastRunAtMapRef.current.get(job.id);
        const newLastRunAt = job.state.lastRunAtMs;
        if (newLastRunAt && newLastRunAt !== prevLastRunAt) {
          lastRunAtMapRef.current.set(job.id, newLastRunAt);

          // Mark as unread only if user is not currently viewing this conversation
          // Use ref to access the latest activeConversationId value
          if (activeConversationIdRef.current !== convId) {
            setUnreadConversations((prev) => {
              if (prev.has(convId)) return prev;
              const newSet = new Set(prev);
              newSet.add(convId);
              return newSet;
            });
          }

          // Refresh conversation list to update sorting (modifyTime was updated after execution)
          emitter.emit('chat.history.refresh');
        }

        setJobsMap((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(convId) || [];
          newMap.set(
            convId,
            existing.map((j) => (j.id === job.id ? job : j))
          );
          return newMap;
        });
      },
      onJobRemoved: ({ job_id }: { job_id: string }) => {
        setJobsMap((prev) => {
          const newMap = new Map(prev);
          for (const [convId, convJobs] of newMap.entries()) {
            const filtered = convJobs.filter((j) => j.id !== job_id);
            if (filtered.length === 0) {
              newMap.delete(convId);
            } else if (filtered.length !== convJobs.length) {
              newMap.set(convId, filtered);
            }
          }
          return newMap;
        });
      },
    }),
    []
  );

  useEffect(() => {
    const unsubCreate = ipcBridge.cron.onJobCreated.on(eventHandlers.onJobCreated);
    const unsubUpdate = ipcBridge.cron.onJobUpdated.on(eventHandlers.onJobUpdated);
    const unsubRemove = ipcBridge.cron.onJobRemoved.on(eventHandlers.onJobRemoved);

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubRemove();
    };
  }, [eventHandlers]);

  // Helper functions
  const hasJobsForConversation = useCallback(
    (conversation_id: string) => {
      return jobsMap.has(conversation_id) && jobsMap.get(conversation_id)!.length > 0;
    },
    [jobsMap]
  );

  const getJobsForConversation = useCallback(
    (conversation_id: string): ICronJob[] => {
      return jobsMap.get(conversation_id) || [];
    },
    [jobsMap]
  );

  const getJobStatus = useCallback(
    (conversation_id: string): 'none' | 'active' | 'paused' | 'error' | 'unread' => {
      const convJobs = jobsMap.get(conversation_id);
      if (!convJobs || convJobs.length === 0) {
        return 'none';
      }

      // Check if conversation has unread cron executions (highest priority for visual indicator)
      if (unreadConversations.has(conversation_id)) return 'unread';

      // Check if any job has error
      if (convJobs.some((j) => j.state.lastStatus === 'error')) return 'error';

      // Check if all jobs are paused
      if (convJobs.every((j) => !j.enabled)) return 'paused';

      return 'active';
    },
    [jobsMap, unreadConversations]
  );

  // Mark a conversation as read (clear unread status)
  const markAsRead = useCallback((conversation_id: string) => {
    activeConversationIdRef.current = conversation_id;
    setUnreadConversations((prev) => {
      if (!prev.has(conversation_id)) {
        return prev;
      }
      const newSet = new Set(prev);
      newSet.delete(conversation_id);
      return newSet;
    });
  }, []);

  // Update active conversation ref without triggering state update
  // Use this to sync the ref when route changes (e.g., URL navigation)
  const setActiveConversation = useCallback((conversation_id: string) => {
    activeConversationIdRef.current = conversation_id;
  }, []);

  // Check if a conversation has unread cron executions
  const hasUnread = useCallback(
    (conversation_id: string) => {
      return unreadConversations.has(conversation_id);
    },
    [unreadConversations]
  );

  return useMemo(
    () => ({
      jobsMap,
      loading,
      hasJobsForConversation,
      getJobsForConversation,
      getJobStatus,
      markAsRead,
      setActiveConversation,
      hasUnread,
      refetch: fetchAllJobs,
    }),
    [
      jobsMap,
      loading,
      hasJobsForConversation,
      getJobsForConversation,
      getJobStatus,
      markAsRead,
      setActiveConversation,
      hasUnread,
      fetchAllJobs,
    ]
  );
}

/**
 * Hook for fetching conversations spawned by a specific cron job
 * @param job_id - The cron job ID to fetch conversations for
 */
export function useCronJobConversations(job_id: string | undefined) {
  const [conversations, setConversations] = useState<TChatConversation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!job_id) {
      setConversations([]);
      return;
    }

    setLoading(true);
    try {
      const result = await ipcBridge.conversation.listByCronJob.invoke({ cron_job_id: job_id });
      setConversations(result || []);
    } catch (err) {
      console.error('[useCronJobConversations] Failed to fetch:', err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [job_id]);

  // Initial fetch
  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  // Refetch when job executes or a new conversation is created
  useEffect(() => {
    if (!job_id) return;
    const unsubExecuted = ipcBridge.cron.onJobExecuted.on((data) => {
      if (data.job_id === job_id) {
        void fetchConversations();
      }
    });
    const unsubListChanged = ipcBridge.conversation.listChanged.on((data) => {
      if (data.action === 'created' || data.action === 'deleted') {
        void fetchConversations();
      }
    });
    return () => {
      unsubExecuted();
      unsubListChanged();
    };
  }, [job_id, fetchConversations]);

  // Listen to chat.history.refresh to handle conversation renames
  useEffect(() => {
    if (!job_id) return;
    const handleRefresh = () => {
      void fetchConversations();
    };
    emitter.on('chat.history.refresh', handleRefresh);
    return () => {
      emitter.off('chat.history.refresh', handleRefresh);
    };
  }, [job_id, fetchConversations]);

  return { conversations, loading };
}

export default useCronJobs;
