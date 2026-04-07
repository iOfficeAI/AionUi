/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Pushpin } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';

import styles from './Sider.module.css';

export type SiderMenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
};

export type SiderItemProps = {
  icon: React.ReactNode;
  name: string;
  selected?: boolean;
  pinned?: boolean;
  menuItems?: SiderMenuItem[];
  onMenuAction?: (key: string) => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

const SiderItem: React.FC<SiderItemProps> = ({
  icon,
  name,
  selected,
  pinned,
  menuItems,
  onMenuAction,
  onClick,
  onContextMenu,
}) => {
  const [menuVisible, setMenuVisible] = useState(false);

  const hasMenu = menuItems && menuItems.length > 0;

  return (
    <Tooltip
      content={name}
      disabled={!name}
      trigger='hover'
      popupVisible={name ? undefined : false}
      unmountOnExit
      popupHoverStay={false}
      position='top'
    >
      <div
        className={classNames(
          'h-40px rd-8px flex items-center gap-8px px-10px cursor-pointer relative overflow-hidden shrink-0 group min-w-0 transition-colors',
          {
            'hover:bg-[rgba(var(--primary-6),0.14)]': true,
            '!bg-active': selected,
          }
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* Leading icon — fixed 28px column to align with other sidebar rows */}
        <span className='w-28px h-28px flex items-center justify-center shrink-0 line-height-0'>{icon}</span>

        {/* Name with truncation — reserve extra room on the right when pinned
            so the pushpin never overlaps the text in the resting state. */}
        <div
          className={classNames('h-24px min-w-0 flex-1 overflow-hidden', pinned ? styles.pinnedTextSlot : 'pr-18px')}
        >
          <div
            className={classNames(
              'overflow-hidden text-ellipsis block w-full text-14px lh-24px whitespace-nowrap min-w-0 group-hover:text-1',
              selected ? 'text-1 font-medium' : 'text-2'
            )}
          >
            <span className='block overflow-hidden text-ellipsis whitespace-nowrap'>{name}</span>
          </div>
        </div>

        {/* Resting pin indicator — sits in its own reserved slot, no gradient overlay */}
        {hasMenu && pinned && !menuVisible && (
          <span className='absolute right-8px top-1/2 -translate-y-1/2 flex-center text-t-secondary group-hover:hidden pointer-events-none'>
            <Pushpin theme='outline' size='16' />
          </span>
        )}

        {/* Hover/active actions: three-dot menu with soft gradient fade */}
        {hasMenu && (
          <div
            className={classNames('absolute right-0px top-0px h-full items-center justify-end pr-8px', {
              flex: menuVisible,
              'hidden group-hover:flex': !menuVisible,
            })}
            style={{
              backgroundImage: selected
                ? `linear-gradient(to right, transparent, var(--aou-2) 20%)`
                : `linear-gradient(to right, transparent, var(--aou-1) 20%)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    setMenuVisible(false);
                    onMenuAction?.(key);
                  }}
                >
                  {menuItems.map((item) => (
                    <Menu.Item key={item.key}>
                      <div
                        className={classNames('flex items-center gap-8px', {
                          'text-[rgb(var(--warning-6))]': item.danger,
                        })}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </Menu.Item>
                  ))}
                </Menu>
              }
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={setMenuVisible}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                className={classNames(
                  'flex-center cursor-pointer hover:bg-fill-2 rd-4px p-4px transition-colors relative text-t-primary',
                  {
                    flex: menuVisible,
                    'hidden group-hover:flex': !menuVisible,
                  }
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuVisible(true);
                }}
              >
                <div
                  className='flex flex-col gap-2px items-center justify-center'
                  style={{ width: '16px', height: '16px' }}
                >
                  <div className='w-2px h-2px rounded-full bg-current' />
                  <div className='w-2px h-2px rounded-full bg-current' />
                  <div className='w-2px h-2px rounded-full bg-current' />
                </div>
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default SiderItem;
