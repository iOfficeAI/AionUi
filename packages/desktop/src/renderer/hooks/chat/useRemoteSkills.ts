import { ipcBridge } from '@/common';
import { useCallback, useEffect, useRef, useState } from 'react';

interface RemoteSkillInfo {
  name: string;
  description?: string;
}

const skillsCache = new Map<string, { skills: RemoteSkillInfo[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedSkills(key: string): RemoteSkillInfo[] | null {
  const entry = skillsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    skillsCache.delete(key);
    return null;
  }
  return entry.skills;
}

/**
 * Hook managing the server-side OpenCode skill catalog and the user's
 * sticky multi-selection.
 *
 * `sourceKey` discriminates the cache: on RemoteSendBox this is the
 * conversation id (fetched via `/api/conversations/{id}/skills`), and on the
 * Guid page it is the remote-agent row id (fetched via
 * `/api/remote-agents/{id}/skills`). Both endpoints return the same
 * `RemoteSkillInfo` shape.
 *
 * When `source` is `'remote-agent'` we go through `ipcBridge.remoteAgent.listSkills`,
 * used on the Guid page before any conversation exists. Otherwise we route
 * through the per-conversation endpoint.
 */
export function useRemoteSkills(
  sourceKey: string,
  enabled: boolean,
  source: 'conversation' | 'remote-agent' = 'conversation'
) {
  const requestIdRef = useRef(0);
  const [available, setAvailable] = useState<RemoteSkillInfo[]>(() => getCachedSkills(`${source}:${sourceKey}`) || []);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let isCancelled = false;

    if (!enabled || !sourceKey) {
      setAvailable([]);
      return;
    }

    const cacheKey = `${source}:${sourceKey}`;
    const cached = getCachedSkills(cacheKey);
    if (cached) {
      setAvailable(cached);
    }

    const invoke =
      source === 'remote-agent'
        ? ipcBridge.remoteAgent.listSkills.invoke({ id: sourceKey })
        : ipcBridge.conversation.getRemoteSkills.invoke({ conversation_id: sourceKey });

    void invoke
      .then((result) => {
        if (isCancelled || requestId !== requestIdRef.current) return;
        const list = Array.isArray(result) ? result : [];
        skillsCache.set(cacheKey, { skills: list, timestamp: Date.now() });
        setAvailable(list);
      })
      .catch((error) => {
        if (isCancelled || requestId !== requestIdRef.current) return;
        console.error('[useRemoteSkills] Failed to load skills:', error);
        setAvailable([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [sourceKey, enabled, source]);

  const toggle = useCallback((name: string) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  }, []);

  const setSelection = useCallback((names: string[]) => setSelected(names), []);

  return { available, selected, toggle, setSelection };
}
