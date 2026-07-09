/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AllApplication, Square } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamViewMode } from '../hooks/useTeamViewMode';

type Props = {
  value: TeamViewMode;
  onChange: (mode: TeamViewMode) => void;
};

/**
 * 并行 / 单聊视图切换 —— 放在标题行右侧的分段控件。
 * 并行：所有成员并排；单聊：全屏当前选中成员。
 */
const TeamViewToggle: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const options: Array<{ mode: TeamViewMode; icon: React.ReactNode; label: string }> = [
    {
      mode: 'parallel',
      icon: <AllApplication theme='outline' size='15' fill='currentColor' />,
      label: t('team.view.parallel', { defaultValue: 'Parallel' }),
    },
    {
      mode: 'single',
      icon: <Square theme='outline' size='15' fill='currentColor' />,
      label: t('team.view.single', { defaultValue: 'Single' }),
    },
  ];

  return (
    <div className='flex items-center gap-6px' data-testid='team-view-toggle'>
      <span className='text-12px text-[color:var(--color-text-3)] whitespace-nowrap select-none'>
        {t('team.view.label', { defaultValue: 'View' })}
      </span>
      <div className='flex items-center gap-2px p-2px rounded-8px bg-2'>
        {options.map((opt) => {
          const selected = value === opt.mode;
          return (
            <button
              key={opt.mode}
              type='button'
              data-testid={`team-view-toggle-${opt.mode}`}
              data-selected={selected ? 'true' : 'false'}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => onChange(opt.mode)}
              className={`flex items-center justify-center h-26px w-30px rounded-6px border-none cursor-pointer transition-colors duration-150 ${
                selected
                  ? 'bg-[color:var(--brand)] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                  : 'bg-transparent text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] hover:bg-[color:var(--bg-3)]'
              }`}
            >
              {opt.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TeamViewToggle;
