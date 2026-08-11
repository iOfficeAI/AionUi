/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@renderer/styles/colors';
import { getSiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { DeleteOne, EditOne, Peoples, Pushpin } from '@icon-park/react';
import { Spin, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import SiderItem from '@renderer/components/layout/Sider/SiderItem';
import type { SiderMenuItem } from '@renderer/components/layout/Sider/SiderItem';

export type TeamRowProps = {
  team_id: string;
  name: string;
  pinned: boolean;
  selected: boolean;
  badgeCount: number;
  isRunning: boolean;
  collapsed: boolean;
  /** Indent to align with conversation rows nested in the same project group. */
  dimIcon?: boolean;
  tooltipEnabled?: boolean;
  onClick: () => void;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
};

/**
 * A single team row for the sidebar, folded into its group by the backend read
 * model (pinned / project / chats). Extracted from the retired
 * `TeamSiderSection` so team rows render inline with conversations in group
 * order. Grouping / order / pinned come from the sidebar item; badge / running
 * come from `useTeamList` (joined by `team_id` upstream) — see `useTeamRows`.
 */
const TeamRow: React.FC<TeamRowProps> = ({
  team_id,
  name,
  pinned,
  selected,
  badgeCount,
  isRunning,
  collapsed,
  dimIcon,
  tooltipEnabled = false,
  onClick,
  onPin,
  onRename,
  onDelete,
}) => {
  const { t } = useTranslation();
  const badge = badgeCount > 99 ? '99+' : badgeCount;

  if (collapsed) {
    return (
      <Tooltip {...getSiderTooltipProps(tooltipEnabled)} content={name} position='right'>
        <div
          data-testid={`collapsed-team-item-${team_id}`}
          className={classNames(
            'relative w-full h-40px flex items-center justify-center cursor-pointer transition-colors rd-8px',
            selected ? '!bg-active' : 'hover:bg-fill-3 active:bg-fill-4'
          )}
          onClick={onClick}
        >
          {isRunning ? (
            <span data-testid={`collapsed-team-spinner-${team_id}`} className='flex items-center justify-center'>
              <Spin size={16} />
            </span>
          ) : (
            <Peoples
              data-testid={`collapsed-team-icon-${team_id}`}
              data-icon-fill={iconColors.primary}
              theme='outline'
              size='16'
              fill={iconColors.primary}
              style={{ lineHeight: 0 }}
            />
          )}
          {badgeCount > 0 && (
            <span
              className='absolute top-4px right-4px w-18px h-18px rounded-full text-10px font-bold flex items-center justify-center leading-none bg-danger-6 text-white'
              style={{ lineHeight: 1 }}
            >
              {badge}
            </span>
          )}
        </div>
      </Tooltip>
    );
  }

  const menuItems: SiderMenuItem[] = [
    {
      key: 'pin',
      icon: <Pushpin theme='outline' size='14' />,
      label: pinned ? t('team.sider.unpin') : t('team.sider.pin'),
    },
    {
      key: 'rename',
      icon: <EditOne theme='outline' size='14' />,
      label: t('team.sider.rename'),
    },
    {
      key: 'delete',
      icon: <DeleteOne theme='outline' size='14' />,
      label: t('team.sider.delete'),
      danger: true,
    },
  ];

  return (
    <div className='relative group'>
      <SiderItem
        icon={
          isRunning ? (
            <span data-testid={`team-spinner-${team_id}`} className='flex items-center justify-center'>
              <Spin size={16} />
            </span>
          ) : (
            <Peoples
              data-testid={`team-icon-${team_id}`}
              theme='outline'
              size='16'
              fill='currentColor'
              style={{ lineHeight: 0 }}
            />
          )
        }
        name={name}
        selected={selected}
        pinned={pinned && !isRunning}
        dimIcon={dimIcon}
        menuItems={menuItems}
        onMenuAction={(key) => {
          if (key === 'pin') onPin();
          else if (key === 'rename') onRename();
          else if (key === 'delete') onDelete();
        }}
        pinAction={{
          pinned,
          onToggle: onPin,
          pinLabel: t('team.sider.pin'),
          unpinLabel: t('team.sider.unpin'),
          testId: `team-row-pin-${team_id}`,
        }}
        onClick={onClick}
      />
      {badgeCount > 0 && (
        <span
          className='absolute right-11px top-1/2 -translate-y-1/2 w-18px h-18px rounded-full text-10px font-bold flex items-center justify-center pointer-events-none z-10 group-hover:hidden bg-danger-6 text-white'
          style={{ lineHeight: 1 }}
        >
          {badge}
        </span>
      )}
    </div>
  );
};

export default TeamRow;
