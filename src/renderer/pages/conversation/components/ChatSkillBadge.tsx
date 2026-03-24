/**
 * ChatSkillBadge — Chat header badge showing active skills for an assistant.
 *
 * Displays a pill with the count of active skills. Clicking it opens a popover
 * listing each skill name and description.
 */
import { useEffectiveSkills } from '@/renderer/hooks/skill/useEffectiveSkills';
import type { AssistantSkillConfig } from '@process/skills/types';
import { Popover, Tag } from '@arco-design/web-react';
import { Toolkit } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type ChatSkillBadgeProps = {
  /** Per-assistant skill override config. Pass null/undefined to hide the badge. */
  skillConfig: AssistantSkillConfig | null | undefined;
};

const ChatSkillBadge: React.FC<ChatSkillBadgeProps> = ({ skillConfig }) => {
  const { t } = useTranslation();
  const { effectiveSkills, loading } = useEffectiveSkills(skillConfig);

  if (!skillConfig || loading || !effectiveSkills || effectiveSkills.skills.length === 0) {
    return null;
  }

  const { skills } = effectiveSkills;

  const popoverContent = (
    <div className='flex flex-col gap-6px min-w-[200px] max-w-[280px] max-h-[320px] overflow-y-auto custom-scrollbar p-4px'>
      <div className='text-12px font-semibold text-t-secondary px-4px mb-4px'>
        {t('settings.assistantSkills', { defaultValue: 'Skills' })}
      </div>
      {skills.map((skill) => (
        <div
          key={skill.name}
          className='flex items-start gap-8px px-6px py-6px rd-6px hover:bg-fill-2 transition-colors'
        >
          <div className='w-24px h-24px rd-6px bg-fill-3 border border-border-1 flex items-center justify-center font-bold text-11px text-t-secondary uppercase shrink-0 mt-1px'>
            {skill.name.charAt(0)}
          </div>
          <div className='flex-1 min-w-0'>
            <div className='text-12px font-medium text-t-primary truncate'>{skill.name}</div>
            {skill.metadata.description && (
              <div className='text-11px text-t-tertiary line-clamp-2 mt-1px'>{skill.metadata.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Popover content={popoverContent} position='bottom' trigger='click' className='p-8px'>
      <Tag
        className='cursor-pointer flex items-center gap-4px px-8px py-2px rd-[100px] bg-[rgba(var(--primary-6),0.08)] border border-[rgba(var(--primary-6),0.15)] text-primary-6 hover:bg-[rgba(var(--primary-6),0.14)] transition-colors'
        bordered={false}
      >
        <Toolkit size={12} className='shrink-0' />
        <span className='text-11px font-medium'>{skills.length}</span>
      </Tag>
    </Popover>
  );
};

export default ChatSkillBadge;
