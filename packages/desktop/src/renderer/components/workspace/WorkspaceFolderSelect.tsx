/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Check, Close, Down, FolderClose, FolderOpen } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_RECENT_WS_KEY, addRecentWorkspace, getRecentWorkspaces } from './recentWorkspaces';

const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;
const MAX_MENU_HEIGHT = 320;

type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

const estimateMenuHeight = (recentCount: number): number => {
  const recentSectionHeight = recentCount > 0 ? 36 + recentCount * 56 + 10 : 0;
  const browseActionHeight = 52;
  const menuPadding = 12;
  return recentSectionHeight + browseActionHeight + menuPadding;
};

type WorkspaceFolderSelectProps = {
  value?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder: string;
  recentLabel: string;
  chooseDifferentLabel: string;
  recentStorageKey?: string;
  triggerTestId?: string;
  menuTestId?: string;
  menuZIndex?: number;
};

const WorkspaceFolderSelect: React.FC<WorkspaceFolderSelectProps> = ({
  value,
  onChange,
  onClear,
  placeholder,
  recentLabel,
  chooseDifferentLabel,
  recentStorageKey = DEFAULT_RECENT_WS_KEY,
  triggerTestId,
  menuTestId,
  menuZIndex = 10010,
}) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition>({ top: 0, left: 0, width: 0, maxHeight: MAX_MENU_HEIGHT });
  const triggerRef = useRef<HTMLDivElement>(null);
  const recentWorkspaces = getRecentWorkspaces(recentStorageKey);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const belowSpace = Math.max(viewportHeight - rect.bottom - VIEWPORT_MARGIN, 0);
    const aboveSpace = Math.max(rect.top - VIEWPORT_MARGIN, 0);
    const estimatedHeight = Math.min(MAX_MENU_HEIGHT, estimateMenuHeight(recentWorkspaces.length));
    const openAbove = belowSpace < estimatedHeight && aboveSpace > belowSpace;
    const availableSpace = openAbove ? aboveSpace : belowSpace;

    setMenuPos({
      left: rect.left,
      width: rect.width,
      top: openAbove ? undefined : rect.bottom + MENU_GAP,
      bottom: openAbove ? viewportHeight - rect.top + MENU_GAP : undefined,
      maxHeight: Math.min(MAX_MENU_HEIGHT, availableSpace),
    });
  }, [recentWorkspaces.length]);

  useEffect(() => {
    if (!menuVisible) return;

    updateMenuPosition();

    const handleOutsideClick = (event: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setMenuVisible(false);
      }
    };

    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [menuVisible, updateMenuPosition]);

  const handleBrowse = async () => {
    setMenuVisible(false);

    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory', 'createDirectory'] });
    if (files?.[0]) {
      onChange(files[0]);
      addRecentWorkspace(files[0], recentStorageKey);
    }
  };

  const handleSelectRecent = (path: string) => {
    onChange(path);
    addRecentWorkspace(path, recentStorageKey);
    setMenuVisible(false);
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onClear?.();
    if (!onClear) {
      onChange('');
    }
    setMenuVisible(false);
  };

  const folderName = value ? value.split(/[\\/]/).pop() || value : '';

  return (
    <div className='relative' ref={triggerRef}>
      <div
        data-testid={triggerTestId}
        onClick={() => {
          if (recentWorkspaces.length === 0) {
            void handleBrowse();
            return;
          }

          if (!menuVisible) {
            updateMenuPosition();
          }
          setMenuVisible((visible) => !visible);
        }}
        className={`flex items-center gap-10px rounded-10px border px-12px py-10px transition-all ${
          menuVisible
            ? 'border-primary-5 bg-fill-2 shadow-sm'
            : 'border-border-2 bg-fill-1 hover:border-border-1 hover:bg-fill-2'
        }`}
      >
        <FolderOpen
          theme='outline'
          size='16'
          fill='currentColor'
          className='block shrink-0 text-t-secondary'
          style={{ transform: 'translateY(3px)' }}
        />
        {value ? (
          <span className='min-w-0 flex-1 truncate text-sm leading-20px text-t-primary' title={value}>
            {folderName}
          </span>
        ) : (
          <span className='min-w-0 flex-1 truncate text-sm leading-20px text-t-secondary'>{placeholder}</span>
        )}
        {value ? (
          <span
            className='flex h-20px w-20px shrink-0 cursor-pointer items-center justify-center text-t-secondary transition-colors hover:text-t-primary'
            onClick={handleClear}
          >
            <Close theme='outline' size='14' fill='currentColor' />
          </span>
        ) : (
          <span className='flex h-20px w-20px shrink-0 items-center justify-center text-t-secondary'>
            <Down size='14' fill='currentColor' />
          </span>
        )}
      </div>

      {menuVisible && (
        <div
          data-testid={menuTestId}
          style={{
            position: 'fixed',
            top: menuPos.top,
            bottom: menuPos.bottom,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: menuPos.maxHeight > 0 ? menuPos.maxHeight : undefined,
            zIndex: menuZIndex,
            backgroundColor: 'var(--bg-2)',
            opacity: 1,
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            isolation: 'isolate',
          }}
          className='overflow-x-hidden overflow-y-auto rounded-12px border border-border-1 p-6px shadow-[0_18px_48px_rgba(0,0,0,0.42)]'
        >
          {recentWorkspaces.length > 0 && (
            <>
              <div className='px-10px pb-4px pt-6px text-10px font-500 uppercase tracking-[0.08em] text-t-tertiary'>
                {recentLabel}
              </div>
              {recentWorkspaces.map((path) => {
                const recentName = path.split(/[\\/]/).pop() || path;
                const isSelected = value === path;

                return (
                  <div
                    key={path}
                    onClick={() => handleSelectRecent(path)}
                    className={`flex cursor-pointer items-center gap-10px rounded-8px px-10px py-6px transition-colors ${
                      isSelected ? 'bg-aou-1' : 'hover:bg-fill-2'
                    }`}
                    style={isSelected ? { boxShadow: 'inset 0 0 0 1px var(--aou-6)' } : undefined}
                  >
                    <FolderClose
                      theme='outline'
                      size='16'
                      fill='currentColor'
                      className={`block shrink-0 ${isSelected ? 'text-aou-6' : 'text-t-tertiary'}`}
                      style={{ transform: 'translateY(3px)' }}
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-13px leading-18px text-t-primary'>{recentName}</div>
                      <div className='truncate text-11px leading-14px text-t-tertiary'>{path}</div>
                    </div>
                    {isSelected && (
                      <span className='flex h-20px w-20px shrink-0 items-center justify-center text-aou-6'>
                        <Check size='14' fill='currentColor' />
                      </span>
                    )}
                  </div>
                );
              })}
              <div className='mx-2px my-4px h-1px bg-border-2' />
            </>
          )}

          <div
            onClick={() => void handleBrowse()}
            className='flex cursor-pointer items-center gap-10px rounded-8px px-10px py-6px transition-colors hover:bg-fill-2'
          >
            <FolderOpen
              theme='outline'
              size='16'
              fill='currentColor'
              className='block shrink-0 text-t-tertiary'
              style={{ transform: 'translateY(3px)' }}
            />
            <span className='text-13px text-t-primary'>{chooseDifferentLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceFolderSelect;
