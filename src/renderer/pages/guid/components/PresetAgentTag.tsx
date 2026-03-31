/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CUSTOM_AVATAR_IMAGE_MAP } from '../constants';
import type { AcpBackendConfig, AvailableAgent } from '../types';
import { IconClose } from '@arco-design/web-react/icon';
import { Down, Robot } from '@icon-park/react';
import React from 'react';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { Dropdown, Menu } from '@arco-design/web-react';
import styles from '../index.module.css';

export type AgentSwitcherItem = {
  key: string;
  label: string;
  isCurrent: boolean;
};

type PresetAgentTagProps = {
  agentInfo: AvailableAgent;
  customAgents: AcpBackendConfig[];
  localeKey: string;
  onClose: () => void;
  agentLogo?: string | null;
  agentSwitcherItems?: AgentSwitcherItem[];
  onAgentSwitch?: (key: string) => void;
};

const PresetAgentTag: React.FC<PresetAgentTagProps> = ({
  agentInfo,
  customAgents,
  localeKey,
  onClose,
  agentLogo,
  agentSwitcherItems,
  onAgentSwitch,
}) => {
  const avatarValue = agentInfo.avatar?.trim();
  const mappedAvatar = avatarValue ? CUSTOM_AVATAR_IMAGE_MAP[avatarValue] : undefined;
  const resolvedAvatar = avatarValue ? resolveExtensionAssetUrl(avatarValue) : undefined;
  const avatarImage = mappedAvatar || resolvedAvatar;
  const isImageAvatar = Boolean(
    avatarImage &&
    (/\.(svg|png|jpe?g|webp|gif)$/i.test(avatarImage) ||
      /^(https?:|aion-asset:\/\/|file:\/\/|data:)/i.test(avatarImage))
  );
  const agent = customAgents.find((a) => a.id === agentInfo.customAgentId);
  const name = agent?.nameI18n?.[localeKey] || agent?.name || agentInfo.name;

  const hasSwitcher = Boolean(agentSwitcherItems && agentSwitcherItems.length > 0 && onAgentSwitch);

  const droplist = hasSwitcher ? (
    <Menu onClickMenuItem={(key) => onAgentSwitch?.(key)}>
      {agentSwitcherItems!.map((item) => (
        <Menu.Item key={item.key}>
          <div className='flex items-center justify-between gap-12px min-w-120px'>
            <span>{item.label}</span>
            {item.isCurrent ? <span>✓</span> : null}
          </div>
        </Menu.Item>
      ))}
    </Menu>
  ) : null;

  const mainBody = (
    <div className={styles.presetAgentTagMain}>
      {agentLogo ? (
        <>
          <img src={agentLogo} alt='' width={15} height={15} className={styles.presetAgentTagAgentLogo} />
          {hasSwitcher ? (
            <span className={styles.presetAgentTagChevron} aria-hidden='true'>
              <Down theme='outline' size={12} fill='currentColor' />
            </span>
          ) : null}
          <span className={styles.presetAgentTagInnerDivider} aria-hidden='true' />
        </>
      ) : hasSwitcher ? (
        <span className={styles.presetAgentTagChevron} aria-hidden='true'>
          <Down theme='outline' size={12} fill='currentColor' />
        </span>
      ) : null}
      {isImageAvatar ? (
        <img src={avatarImage} alt='' width={15} height={15} style={{ objectFit: 'contain', flexShrink: 0 }} />
      ) : avatarValue ? (
        <span style={{ fontSize: 14, lineHeight: '15px', flexShrink: 0 }}>{avatarValue}</span>
      ) : (
        <Robot theme='outline' size={15} style={{ flexShrink: 0 }} />
      )}
      <span className={styles.presetAgentTagName}>{name}</span>
    </div>
  );

  return (
    <div className={styles.presetAgentTag}>
      {/* Left: agent logo | avatar + name + ▾ — whole area triggers agent switcher dropdown */}
      {hasSwitcher ? (
        <Dropdown trigger='click' position='bl' droplist={droplist}>
          {mainBody}
        </Dropdown>
      ) : (
        mainBody
      )}

      {/* Divider */}
      <span className={styles.presetAgentTagDivider} aria-hidden='true' />

      {/* Right: always × to close */}
      <div
        className={styles.presetAgentTagClose}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <IconClose style={{ fontSize: 12, color: 'var(--color-text-3)' }} />
      </div>
    </div>
  );
};

export default PresetAgentTag;
