import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import type { TChatConversation } from '@/common/config/storage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { getSendBoxDraftHook } from '@renderer/hooks/chat/useSendBoxDraft';
import { resolveAgentAvatar, useAgentLogos } from '@renderer/utils/model/agentLogo';
import { usePresetAssistantInfo } from '@renderer/hooks/agent/usePresetAssistantInfo';
import { resolveConversationBackend } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';
import { useTeammateColor } from '../identity/TeamIdentityContext';
import { Robot } from '@icon-park/react';

const useAcpDraft = getSendBoxDraftHook('acp', { _type: 'acp', atPath: [], content: '', uploadFile: [] });
const useAionrsDraft = getSendBoxDraftHook('aionrs', { _type: 'aionrs', atPath: [], content: '', uploadFile: [] });

type Props = {
  conversation_id: string;
  assistant_name?: string;
  assistant_backend?: string;
  icon?: string;
  isLeader?: boolean;
};

const SUGGESTIONS = [
  { key: 'debate', icon: '🎭' },
  { key: 'add_member', icon: '➕' },
  { key: 'expert_review', icon: '🧠' },
];

const SUGGESTION_DEFAULTS: Record<string, string> = {
  debate: 'Organize a debate with assistants taking different sides',
  add_member: 'Help me add a member good at ___ to the team',
  expert_review: 'Have multiple experts analyze the same problem',
};

type TeamDraftKind = 'acp' | 'aionrs';

/** Map a conversation.type onto the runnable draft store. */
const toDraftKind = (type: TChatConversation['type']): TeamDraftKind => {
  return type === 'aionrs' ? 'aionrs' : 'acp';
};

const resolveAssistantName = (
  conversation: TChatConversation,
  presetName: string | null,
  explicitAssistantName?: string
): string => {
  if (presetName) return presetName;
  const trimmedExplicitName = explicitAssistantName?.trim();
  if (trimmedExplicitName) return trimmedExplicitName;
  const extraAgentName = (conversation.extra as { agent_name?: string } | undefined)?.agent_name;
  if (extraAgentName && extraAgentName.trim()) return extraAgentName.trim();
  // conversation.name is typically "teamName - agentRole"
  const segments = conversation.name?.split(' - ') ?? [];
  const role = segments[segments.length - 1]?.trim();
  if (role) return role;
  return 'Leader';
};

const TeamChatEmptyState: React.FC<Props> = ({
  conversation_id,
  assistant_name,
  assistant_backend,
  icon,
  isLeader = false,
}) => {
  const { t } = useTranslation();
  const logos = useAgentLogos();
  // 头像下方的名字用该成员的身份色（拿不到时回退到主文字色）。
  const identityColor = useTeammateColor(conversation_id);

  // Reuse the same SWR key as AgentChatSlot so this hits cache instead of a new fetch.
  const { data: conversation } = useSWR(conversation_id ? ['team-conversation', conversation_id] : null, () =>
    getConversationOrNull(conversation_id)
  );
  const { info: presetInfo } = usePresetAssistantInfo(conversation ?? undefined);

  // Hooks must run unconditionally; the lookup below picks the right draft at call time.
  const acpDraft = useAcpDraft(conversation_id);
  const aionrsDraft = useAionrsDraft(conversation_id);
  const setContentByKind = {
    acp: (text: string) => acpDraft.mutate((prev) => ({ ...prev, content: text })),
    aionrs: (text: string) => aionrsDraft.mutate((prev) => ({ ...prev, content: text })),
  } satisfies Record<TeamDraftKind, (text: string) => void>;

  const fillDraft = useCallback(
    (text: string) => {
      if (!conversation) return;
      setContentByKind[toDraftKind(conversation.type)](text);
    },
    [conversation, setContentByKind]
  );

  if (!conversation) return null;
  const team_id = (
    (conversation.extra as { team_id?: string; teamId?: string } | undefined)?.team_id ??
    (conversation.extra as { teamId?: string } | undefined)?.teamId
  )?.trim();
  if (!team_id) return null;

  const assistantBackend = resolveConversationBackend(conversation, assistant_backend || presetInfo?.backend) || 'acp';
  const assistantName = resolveAssistantName(conversation, presetInfo?.name ?? null, assistant_name);
  const agentAvatar = resolveAgentAvatar(logos, { icon, backend: assistantBackend });

  const renderAvatar = () => {
    if (presetInfo) {
      if (presetInfo.isFallback) {
        return (
          <span className='w-48px h-48px rounded-8px flex items-center justify-center bg-fill-2'>
            <Robot theme='outline' size={24} />
          </span>
        );
      }
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
    if (agentAvatar.kind === 'image') {
      return (
        <img
          src={agentAvatar.value}
          alt={assistantName}
          className='w-48px h-48px object-contain rounded-8px opacity-80'
        />
      );
    }
    if (agentAvatar.kind === 'emoji') {
      return (
        <span className='w-48px h-48px rounded-8px flex items-center justify-center text-32px leading-none bg-fill-2'>
          {agentAvatar.value}
        </span>
      );
    }
    return (
      <div className='w-48px h-48px rounded-full bg-fill-3 flex items-center justify-center text-20px font-medium text-t-secondary'>
        <Robot theme='outline' size={24} />
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
        <span className='text-16px font-semibold' style={identityColor ? { color: identityColor } : undefined}>
          {assistantName}
        </span>
        <span data-testid='team-chat-empty-state-subtitle' className='text-13px text-t-secondary'>
          {isLeader
            ? t('team.emptyState.leaderGreeting', {
                defaultValue:
                  "Hi, I'm the Leader. I understand your goal and coordinate the team — describe what you want and I'll arrange it.",
              })
            : t('team.emptyState.memberGreeting', {
                defaultValue: "Hi, I'm a team member. I take direction from the Leader and you.",
              })}
        </span>
      </div>
      {isLeader && (
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
      )}
    </div>
  );
};

export default TeamChatEmptyState;
