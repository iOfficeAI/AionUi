import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getSendBoxDraftHook } from '@renderer/hooks/chat/useSendBoxDraft';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';

const useAcpDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});
const useGeminiDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

type DraftType = 'acp' | 'gemini';

type Props = {
  conversationId: string;
  agentName: string;
  agentType: string;
  draftType?: DraftType;
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

const TeamChatEmptyState: React.FC<Props> = ({ conversationId, agentName, agentType, draftType = 'acp' }) => {
  const { t } = useTranslation();
  const acpDraft = useAcpDraft(conversationId);
  const geminiDraft = useGeminiDraft(conversationId);
  const logo = getAgentLogo(agentType);

  const fillDraft = useCallback(
    (text: string) => {
      if (draftType === 'gemini') {
        geminiDraft.mutate((prev) => ({ ...prev, content: text }));
        return;
      }

      acpDraft.mutate((prev) => ({ ...prev, content: text }));
    },
    [acpDraft, draftType, geminiDraft]
  );

  return (
    <div className='flex flex-col items-center gap-20px px-24px text-center max-w-360px'>
      {logo ? (
        <img src={logo} alt={agentName} className='w-48px h-48px object-contain rounded-8px opacity-80' />
      ) : (
        <div className='w-48px h-48px rounded-full bg-fill-3 flex items-center justify-center text-20px font-medium text-t-secondary'>
          {agentName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className='flex flex-col gap-6px'>
        <span className='text-16px font-semibold text-t-primary'>{agentName}</span>
        <span className='text-13px text-t-secondary'>
          {t('team.emptyState.subtitle', { defaultValue: "Describe your goal and I'll get the team working on it" })}
        </span>
      </div>
      <div className='flex flex-col gap-6px w-full'>
        {SUGGESTIONS.map((s) => {
          const label = t(`team.emptyState.suggestions.${s.key}`, { defaultValue: SUGGESTION_DEFAULTS[s.key] });
          return (
            <div
              key={s.key}
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
