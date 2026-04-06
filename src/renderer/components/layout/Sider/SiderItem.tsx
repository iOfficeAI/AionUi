/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Pushpin } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';

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
          'py-8px rd-8px flex items-center px-12px cursor-pointer relative overflow-hidden shrink-0 group min-w-0 transition-colors',
          {
            'hover:bg-[rgba(var(--primary-6),0.14)]': true,
            '!bg-active': selected,
          }
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* Leading icon */}
        <span className='flex-shrink-0 line-height-0'>{icon}</span>

        {/* Name with truncation */}
        <div className='h-24px min-w-0 flex-1 ml-10px pr-18px overflow-hidden'>
          <div
            className={classNames(
              'overflow-hidden text-ellipsis block w-full text-14px lh-24px whitespace-nowrap min-w-0 group-hover:text-1',
              selected ? 'text-1 font-medium' : 'text-2'
            )}
          >
            <span className='block overflow-hidden text-ellipsis whitespace-nowrap'>{name}</span>
          </div>
        </div>

        {/* Right-side actions: pin indicator + three-dot menu */}
        {hasMenu && (
          <div
            className={classNames('absolute right-0px top-0px h-full items-center justify-end pr-8px', {
              flex: pinned || menuVisible,
              'hidden group-hover:flex': !pinned && !menuVisible,
            })}
            style={{
              backgroundImage: selected
                ? `linear-gradient(to right, transparent, var(--aou-2) 50%)`
                : `linear-gradient(to right, transparent, var(--aou-1) 50%)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {pinned && !menuVisible && (
              <span className='flex-center text-t-secondary group-hover:hidden pr-4px'>
                <Pushpin theme='outline' size='16' />
              </span>
            )}
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
