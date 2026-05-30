/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Dropdown, Input, Menu, Tooltip } from '@arco-design/web-react';
import { Down, Lightning } from '@icon-park/react';
import MarqueePillLabel from './MarqueePillLabel';
import { iconColors } from '@/renderer/styles/colors';
import styles from './RemoteSkillsPicker.module.css';

interface RemoteSkillInfo {
  name: string;
  description?: string;
}

export type RemoteSkillsPickerProps = {
  available: RemoteSkillInfo[];
  selected: string[];
  onToggle: (name: string) => void;
  /** Aria label for the trigger button. Defaults to "Skills". */
  ariaLabel?: string;
};

/**
 * Lightning-bolt button that opens a model-selector–style panel for
 * choosing server-side OpenCode skills. Stateless — parent owns selection.
 * Self-hides when `available` is empty.
 */
const RemoteSkillsPicker: React.FC<RemoteSkillsPickerProps> = ({
  available,
  selected,
  onToggle,
  ariaLabel = 'Skills',
}) => {
  const [searchValue, setSearchValue] = useState('');

  if (available.length === 0) return null;

  const filtered = searchValue.trim()
    ? available.filter((s) => s.name.toLowerCase().includes(searchValue.trim().toLowerCase()))
    : available;

  const panel = (
    <div className={styles.panel}>
      <div className={styles.searchWrap}>
        <Input
          allowClear
          size='small'
          className={styles.searchInput}
          value={searchValue}
          onChange={setSearchValue}
          placeholder='Search skills…'
        />
      </div>
      <Menu className={styles.menu}>
        <Menu.ItemGroup title='Skills'>
          {filtered.map((skill) => {
            const isSelected = selected.includes(skill.name);
            return (
              <Menu.Item
                key={skill.name}
                className={`${styles.option} ${isSelected ? styles.selected : ''}`}
                onClick={() => onToggle(skill.name)}
              >
                <div className='flex items-center gap-8px w-full min-w-0'>
                  <span className={`w-12px shrink-0 ${styles.checkmark}`}>{isSelected ? '✓' : ''}</span>
                  <Tooltip content={skill.description} position='left' disabled={!skill.description}>
                    <span className={styles.optionLabel}>{skill.name}</span>
                  </Tooltip>
                </div>
              </Menu.Item>
            );
          })}
          {filtered.length === 0 && (
            <Menu.Item key='no-match' disabled className={styles.emptyOption}>
              No matching skills
            </Menu.Item>
          )}
        </Menu.ItemGroup>
      </Menu>
    </div>
  );

  const hasSelection = selected.length > 0;

  return (
    <Dropdown droplist={panel} position='top' trigger='click'>
      <Tooltip content={`Skills${hasSelection ? ` (${selected.length} selected)` : ''}`}>
        <Button
          size='small'
          aria-label={ariaLabel}
          className={`sendbox-model-btn header-model-btn ${hasSelection ? styles.triggerActive : ''}`}
          shape='round'
        >
          <span className='flex items-center gap-6px min-w-0'>
            <Lightning
              theme='outline'
              size='14'
              fill={hasSelection ? 'var(--brand)' : iconColors.secondary}
              className='shrink-0'
            />
            <MarqueePillLabel>{hasSelection ? `Skills · ${selected.length}` : 'Skills'}</MarqueePillLabel>
            <Down size={12} fill={iconColors.secondary} className='shrink-0' />
          </span>
        </Button>
      </Tooltip>
    </Dropdown>
  );
};

export default RemoteSkillsPicker;
