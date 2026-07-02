import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';
import { resolveCronJobId } from '@/renderer/pages/cron/cronUtils';

type RemoveAgentParams = {
  team_id: string;
  slot_id: string;
};

type RemoveTeamAssistantWithCronCleanupParams = {
  team: TTeam;
  slot_id: string;
  getConversation: (conversation_id: string) => Promise<TChatConversation | null>;
  removeCronJob: (job_id: string) => Promise<unknown>;
  removeAgent: (params: RemoveAgentParams) => Promise<unknown>;
};

type RemoveTeamWithCronCleanupParams = {
  team: TTeam;
  getConversation: (conversation_id: string) => Promise<TChatConversation | null>;
  removeCronJob: (job_id: string) => Promise<unknown>;
  removeTeam: (params: { id: string }) => Promise<unknown>;
};

export async function removeTeamAssistantWithCronCleanup({
  team,
  slot_id,
  getConversation,
  removeCronJob,
  removeAgent,
}: RemoveTeamAssistantWithCronCleanupParams): Promise<void> {
  const assistant = team.assistants.find((item) => item.slot_id === slot_id);
  if (assistant?.conversation_id) {
    const conversation = await getConversation(assistant.conversation_id);
    const cronJobId = resolveCronJobId(conversation?.extra);
    if (cronJobId) {
      await removeCronJob(cronJobId);
    }
  }

  await removeAgent({ team_id: team.id, slot_id });
}

export async function removeTeamWithCronCleanup({
  team,
  getConversation,
  removeCronJob,
  removeTeam,
}: RemoveTeamWithCronCleanupParams): Promise<void> {
  const cronJobIds = new Set<string>();
  for (const assistant of team.assistants) {
    if (!assistant.conversation_id) continue;
    const conversation = await getConversation(assistant.conversation_id);
    const cronJobId = resolveCronJobId(conversation?.extra);
    if (cronJobId) {
      cronJobIds.add(cronJobId);
    }
  }

  for (const job_id of cronJobIds) {
    await removeCronJob(job_id);
  }

  await removeTeam({ id: team.id });
}
