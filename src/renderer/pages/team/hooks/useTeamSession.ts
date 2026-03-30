// src/renderer/pages/team/hooks/useTeamSession.ts
import { ipcBridge } from '@/common';
import type { ITeamAgentStatusEvent, ITeamMessageEvent, TeamAgent, TeamAgentRuntime, TTeam } from '@process/team/types';
import { useCallback, useEffect, useState } from 'react';

export function useTeamSession(team: TTeam) {
  const [runtimes, setRuntimes] = useState<Map<string, TeamAgentRuntime>>(
    new Map(team.agents.map((a) => [a.slotId, { slotId: a.slotId, status: 'idle' as const }]))
  );

  const [messages, setMessages] = useState<Map<string, ITeamMessageEvent[]>>(
    new Map(team.agents.map((a): [string, ITeamMessageEvent[]] => [a.slotId, []]))
  );

  useEffect(() => {
    const unsubStatus = ipcBridge.team.agentStatusChanged.on((event: ITeamAgentStatusEvent) => {
      if (event.teamId !== team.id) return;
      setRuntimes((prev) => {
        const next = new Map(prev);
        next.set(event.slotId, { slotId: event.slotId, status: event.status, lastMessage: event.lastMessage });
        return next;
      });
    });

    const unsubMessages = ipcBridge.team.messageStream.on((event: ITeamMessageEvent) => {
      if (event.teamId !== team.id) return;
      setMessages((prev) => {
        const next = new Map(prev);
        const existing = next.get(event.slotId) ?? [];
        next.set(event.slotId, [...existing, event]);
        return next;
      });
    });

    return () => {
      unsubStatus();
      unsubMessages();
    };
  }, [team.id]);

  const sendMessage = useCallback(
    async (content: string) => {
      await ipcBridge.team.sendMessage.invoke({ teamId: team.id, content });
    },
    [team.id]
  );

  const addAgent = useCallback(
    async (agent: Omit<TeamAgent, 'slotId'>) => {
      await ipcBridge.team.addAgent.invoke({ teamId: team.id, agent });
    },
    [team.id]
  );

  return { runtimes, messages, sendMessage, addAgent };
}
