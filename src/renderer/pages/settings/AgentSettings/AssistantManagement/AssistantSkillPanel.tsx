/**
 * AssistantSkillPanel — Per-assistant skill configuration panel.
 *
 * Displays the list of installed skills with per-assistant enable/disable toggles.
 * Skills in `added` are in "precise selection mode"; an empty `added` array means
 * "inherit all globally-enabled skills".
 */
import type { AssistantSkillConfig } from '@process/skills/types';
import { useSkillRepository } from '@/renderer/hooks/skill/useSkillRepository';
import { Switch, Tooltip } from '@arco-design/web-react';
import { Info } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

type AssistantSkillPanelProps = {
  /** Current per-assistant skill config (from assistant storage). */
  skillConfig: AssistantSkillConfig;
  /** Called whenever the config changes so the parent can persist. */
  onChange: (updated: AssistantSkillConfig) => void;
  /** When true, all controls are read-only. */
  readonly?: boolean;
};

const AssistantSkillPanel: React.FC<AssistantSkillPanelProps> = ({ skillConfig, onChange, readonly = false }) => {
  const { t } = useTranslation();
  const { skills, loading } = useSkillRepository();

  const isPreciseMode = skillConfig.added.length > 0;

  /**
   * Determine whether a skill is currently active for this assistant.
   * - Precise mode: skill is active iff its name is in `added`.
   * - Inherit mode: skill is active unless it is in `blocked`.
   */
  const isActive = useCallback(
    (name: string) => {
      if (skillConfig.blocked.includes(name)) return false;
      if (isPreciseMode) return skillConfig.added.includes(name);
      return true;
    },
    [skillConfig, isPreciseMode]
  );

  const handleToggle = useCallback(
    (name: string, checked: boolean) => {
      let { added, blocked } = skillConfig;

      if (checked) {
        // Remove from blocked
        blocked = blocked.filter((b) => b !== name);
        // If we were already in precise mode, add to added
        if (isPreciseMode) {
          added = added.includes(name) ? added : [...added, name];
        }
        // In inherit mode: removing from blocked is sufficient — skill becomes active
      } else {
        if (isPreciseMode) {
          // Remove from added; if added becomes empty, all skills would re-inherit — keep blocked as guard
          added = added.filter((a) => a !== name);
          if (!blocked.includes(name)) blocked = [...blocked, name];
        } else {
          // Switch to precise mode: add all skills except the deselected one
          const allNames = skills.map((s) => s.name);
          added = allNames.filter((n) => n !== name);
          blocked = blocked.filter((b) => b !== name);
        }
      }

      onChange({ added, blocked });
    },
    [skillConfig, isPreciseMode, skills, onChange]
  );

  if (loading) {
    return (
      <div className='py-24px text-center text-13px text-t-tertiary'>
        {t('common.loading', { defaultValue: 'Loading...' })}
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className='py-24px text-center text-13px text-t-secondary'>
        {t('settings.skillsHub.noSkills', { defaultValue: 'No skills found. Import some to get started.' })}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4px'>
      {/* Mode hint */}
      <div className='flex items-center gap-6px text-12px text-t-tertiary mb-8px'>
        <Info size={13} className='shrink-0' />
        <span>
          {isPreciseMode
            ? t('settings.skillPanel.preciseMode', {
                defaultValue: 'Precise mode: only selected skills are active for this assistant.',
              })
            : t('settings.skillPanel.inheritMode', {
                defaultValue: 'Inherit mode: all globally-enabled skills are active unless individually disabled.',
              })}
        </span>
      </div>

      {skills.map((skill) => {
        const active = isActive(skill.name);
        return (
          <div
            key={skill.name}
            className='flex items-center gap-12px px-12px py-10px bg-fill-1 hover:bg-fill-2 rd-8px transition-colors'
          >
            {/* Avatar */}
            <div className='w-32px h-32px rd-8px bg-fill-3 border border-border-1 flex items-center justify-center font-bold text-13px text-t-secondary uppercase shrink-0'>
              {skill.name.charAt(0)}
            </div>

            {/* Info */}
            <div className='flex-1 min-w-0'>
              <div className='flex items-center gap-8px flex-wrap'>
                <span className='text-13px font-medium text-t-primary truncate'>{skill.name}</span>
                {skill.isCustom ? (
                  <span className='bg-[rgba(var(--orange-6),0.08)] text-orange-6 border border-[rgba(var(--orange-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                    {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
                  </span>
                ) : (
                  <span className='bg-[rgba(var(--blue-6),0.08)] text-blue-6 border border-[rgba(var(--blue-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                    {t('settings.skillsHub.builtin', { defaultValue: 'Built-in' })}
                  </span>
                )}
              </div>
              {skill.description && (
                <Tooltip content={skill.description} position='top' mini>
                  <p className='text-12px text-t-tertiary line-clamp-1 m-0 mt-2px cursor-default'>{skill.description}</p>
                </Tooltip>
              )}
            </div>

            {/* Toggle */}
            <Switch
              size='small'
              checked={active}
              disabled={readonly}
              onChange={(checked) => handleToggle(skill.name, checked)}
            />
          </div>
        );
      })}
    </div>
  );
};

export default AssistantSkillPanel;
