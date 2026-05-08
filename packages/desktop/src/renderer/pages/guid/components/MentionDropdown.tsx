/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentionOption } from '../types';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { Dropdown, Menu } from '@arco-design/web-react';
import { Down, Robot } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type MentionDropdownProps = {
  menuRef: React.RefObject<HTMLDivElement>;
  options: MentionOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
};

const MentionDropdown: React.FC<MentionDropdownProps> = ({ menuRef, options, selectedKey, onSelect }) => {
  const { t } = useTranslation();

  return (
    <div
      ref={menuRef}
      className='bg-bg-2 border border-[var(--color-border-2)] rd-12px shadow-lg overflow-hidden'
      style={{ boxShadow: '0 0 0 1px var(--color-border-2), 0 12px 24px rgba(0, 0, 0, 0.12)' }}
    >
      <Menu
        selectedKeys={[selectedKey]}
        onClickMenuItem={(key) => onSelect(String(key))}
        className='min-w-180px max-h-200px overflow-auto'
      >
        {options.length > 0 ? (
          options.map((option, index) => (
            <Menu.Item key={option.key} data-mention-index={index}>
              <div className='flex items-center gap-8px'>
                {option.avatarImage ? (
                  <img
                    src={resolveExtensionAssetUrl(option.avatarImage)}
                    alt=''
                    width={16}
                    height={16}
                    style={{ objectFit: 'contain' }}
                  />
                ) : option.avatar ? (
                  <span style={{ fontSize: 14, lineHeight: '16px' }}>{option.avatar}</span>
                ) : option.logo ? (
                  <img src={option.logo} alt={option.label} width={16} height={16} style={{ objectFit: 'contain' }} />
                ) : (
                  <Robot theme='outline' size={16} />
                )}
                <span>{option.label}</span>
              </div>
            </Menu.Item>
          ))
        ) : (
          <Menu.Item key='empty' disabled>
            {t('conversation.welcome.none', { defaultValue: 'None' })}
          </Menu.Item>
        )}
      </Menu>
    </div>
  );
};

export default MentionDropdown;

// MentionSelectorBadge component
type MentionSelectorBadgeProps = {
  visible: boolean;
  open: boolean;
  onOpenChange: (visible: boolean) => void;
  agentLabel: string;
  mentionMenu: React.ReactNode;
  onResetQuery: () => void;
};

export const MentionSelectorBadge: React.FC<MentionSelectorBadgeProps> = ({
  visible,
  open,
  onOpenChange,
  agentLabel,
  mentionMenu,
  onResetQuery,
}) => {
  if (!visible) return null;

  return (
    <div className='flex items-center gap-8px mb-8px'>
      <Dropdown
        trigger='click'
        popupVisible={open}
        onVisibleChange={(v) => {
          onOpenChange(v);
          if (v) {
            onResetQuery();
          }
        }}
        droplist={mentionMenu}
      >
        <div className='flex items-center gap-6px bg-fill-2 px-10px py-4px rd-16px cursor-pointer select-none'>
          <span className='text-14px font-medium text-t-primary'>@{agentLabel}</span>
          <Down theme='outline' size={12} />
        </div>
      </Dropdown>
    </div>
  );
};
