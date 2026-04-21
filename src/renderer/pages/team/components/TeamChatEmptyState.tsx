import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { DetectedAgentKind } from '@/common/types/detectedAgent';
import { getSendBoxDraftHook } from '@renderer/hooks/chat/useSendBoxDraft';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { usePresetAssistantInfo } from '@renderer/hooks/agent/usePresetAssistantInfo';

const useAcpDraft = getSendBoxDraftHook('acp', { _type: 'acp', atPath: [], content: '', uploadFile: [] });
const useGeminiDraft = getSendBoxDraftHook('gemini', { _type: 'gemini', atPath: [], content: '', uploadFile: [] });
const useOpenClawDraft = getSendBoxDraftHook('openclaw-gateway', {
  _type: 'openclaw-gateway',
  atPath: [],
  content: '',
  uploadFile: [],
});
const useNanobotDraft = getSendBoxDraftHook('nanobot', { _type: 'nanobot', atPath: [], content: '', uploadFile: [] });
const useRemoteDraft = getSendBoxDraftHook('remote', { _type: 'remote', atPath: [], content: '', uploadFile: [] });
const useAionrsDraft = getSendBoxDraftHook('aionrs', { _type: 'aionrs', atPath: [], content: '', uploadFile: [] });

type Props = {
  conversationId: string;
};

const SUGGESTIONS = [
  { key: 'debate', icon: '🎭' },
  { key: 'interview', icon: '🎙️' },
  { key: 'expert_review', icon: '🧠' },
];

const SUGGESTION_DEFAULTS: Record<string, string> = {
  debate: 'Organize a debate with agents taking different sides',
  interview: 'Plan an in-depth interview between agents',
  expert_review: 'Have multiple experts analyze the same problem',
};

/** Map a conversation.type onto a DetectedAgentKind so draft hooks stay exhaustive. */
const toDetectedKind = (type: TChatConversation['type']): DetectedAgentKind => {
  // Codex conversations are rendered via the ACP pipeline and share the acp draft store.
  if (type === 'codex') return 'acp';
  return type;
};

const resolveAgentTypeFromConversation = (conversation: TChatConversation): string => {
  if (conversation.type === 'acp') {
    return (conversation.extra as { backend?: string } | undefined)?.backend ?? 'acp';
  }
  if (conversation.type === 'openclaw-gateway') {
    return (conversation.extra as { backend?: string } | undefined)?.backend ?? 'openclaw-gateway';
  }
  return conversation.type;
};

const resolveAgentName = (conversation: TChatConversation, presetName: string | null): string => {
  if (presetName) return presetName;
  const extraAgentName = (conversation.extra as { agentName?: string } | undefined)?.agentName;
  if (extraAgentName && extraAgentName.trim()) return extraAgentName.trim();
  // conversation.name is typically "teamName - agentRole"
  const segments = conversation.name?.split(' - ') ?? [];
  const role = segments[segments.length - 1]?.trim();
  if (role) return role;
  return 'Leader';
};

const TeamChatEmptyState: React.FC<Props> = ({ conversationId }) => {
  const { t } = useTranslation();

  // Reuse the same SWR key as AgentChatSlot so this hits cache instead of a new fetch.
  const { data: conversation } = useSWR(conversationId ? ['team-conversation', conversationId] : null, () =>
    ipcBridge.conversation.get.invoke({ id: conversationId })
  );
  const { info: presetInfo } = usePresetAssistantInfo(conversation ?? undefined);

  // Hooks must run unconditionally; the lookup below picks the right draft at call time.
  // `satisfies Record<DetectedAgentKind, ...>` keeps the map exhaustive — adding a new
  // DetectedAgentKind without wiring up a draft setter here becomes a typecheck error.
  const acpDraft = useAcpDraft(conversationId);
  const geminiDraft = useGeminiDraft(conversationId);
  const aionrsDraft = useAionrsDraft(conversationId);
  const nanobotDraft = useNanobotDraft(conversationId);
  const remoteDraft = useRemoteDraft(conversationId);
  const openClawDraft = useOpenClawDraft(conversationId);
  const setContentByKind = {
    acp: (text: string) => acpDraft.mutate((prev) => ({ ...prev, content: text })),
    gemini: (text: string) => geminiDraft.mutate((prev) => ({ ...prev, content: text })),
    aionrs: (text: string) => aionrsDraft.mutate((prev) => ({ ...prev, content: text })),
    nanobot: (text: string) => nanobotDraft.mutate((prev) => ({ ...prev, content: text })),
    remote: (text: string) => remoteDraft.mutate((prev) => ({ ...prev, content: text })),
    'openclaw-gateway': (text: string) => openClawDraft.mutate((prev) => ({ ...prev, content: text })),
  } satisfies Record<DetectedAgentKind, (text: string) => void>;

  const fillDraft = useCallback(
    (text: string) => {
      if (!conversation) return;
      setContentByKind[toDetectedKind(conversation.type)](text);
    },
    [conversation, setContentByKind]
  );

  if (!conversation) return null;
  const teamId = (conversation.extra as { teamId?: string } | undefined)?.teamId?.trim();
  if (!teamId) return null;

  const agentType = resolveAgentTypeFromConversation(conversation);
  const agentName = resolveAgentName(conversation, presetInfo?.name ?? null);
  const backendLogo = getAgentLogo(agentType);

  const renderAvatar = () => {
    if (presetInfo) {
      if (presetInfo.isEmoji) {
        return (
          <span className='w-48px h-48px rounded-8px flex items-center justify-center text-32px leading-none bg-fill-2'>
            {presetInfo.logo}
          </span>
        );
      }
      return (
        <img
          src={presetInfo.logo}
          alt={presetInfo.name}
          className='w-48px h-48px object-contain rounded-8px opacity-90'
        />
      );
    }
    if (backendLogo) {
      return <img src={backendLogo} alt={agentName} className='w-48px h-48px object-contain rounded-8px opacity-80' />;
    }
    return (
      <div className='w-48px h-48px rounded-full bg-fill-3 flex items-center justify-center text-20px font-medium text-t-secondary'>
        {agentName.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <div
      data-testid='team-chat-empty-state'
      className='flex flex-col items-center gap-20px px-24px text-center max-w-360px'
    >
      {renderAvatar()}
      <div className='flex flex-col gap-6px'>
        <span className='text-16px font-semibold text-t-primary'>{agentName}</span>
        <span data-testid='team-chat-empty-state-subtitle' className='text-13px text-t-secondary'>
          {t('team.emptyState.subtitle', { defaultValue: "Describe your goal and I'll get the team working on it" })}
        </span>
      </div>
      <div className='flex flex-col gap-6px w-full'>
        {SUGGESTIONS.map((s) => {
          const label = t(`team.emptyState.suggestions.${s.key}`, { defaultValue: SUGGESTION_DEFAULTS[s.key] });
          return (
            <div
              key={s.key}
              data-testid={`team-chat-empty-state-suggestion-${s.key}`}
              onClick={() => fillDraft(label)}
              className='flex items-center gap-10px px-14px py-10px rd-10px bg-fill-2 hover:bg-fill-3 cursor-pointer transition-colors text-left border border-transparent hover:border-[var(--color-border-2)]'
            >
              <span className='text-15px shrink-0'>{s.icon}</span>
              <span className='text-13px text-t-secondary'>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamChatEmptyState;
