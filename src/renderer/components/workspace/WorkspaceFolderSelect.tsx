/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Input } from '@arco-design/web-react';
import { Check, Close, Down, Folder, FolderOpen, FolderPlus } from '@icon-park/react';
import { isElectronDesktop } from '@renderer/utils/platform';
import React, { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_RECENT_WS_KEY = 'aionui:recent-workspaces';
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

const getRecentWorkspaces = (storageKey: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  } catch {
    return [];
  }
};

const addRecentWorkspace = (path: string, storageKey: string) => {
  try {
    const prev = getRecentWorkspaces(storageKey);
    const next = [path, ...prev.filter((item) => item !== path)].slice(0, 5);
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
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
  inputPlaceholder?: string;
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
  inputPlaceholder,
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
  const isDesktop = isElectronDesktop();
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

  if (!isDesktop) {
    return <Input placeholder={inputPlaceholder ?? placeholder} value={value ?? ''} onChange={onChange} />;
  }

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
        className={`flex min-h-44px items-center gap-10px rounded-10px border px-12px py-0 transition-all ${
          menuVisible
            ? 'border-primary-5 bg-fill-2 shadow-sm'
            : 'border-border-2 bg-fill-1 hover:border-border-1 hover:bg-fill-2'
        }`}
      >
        <FolderOpen theme='outline' size='16' fill='currentColor' className='shrink-0 text-t-secondary' />
        <div className='min-w-0 flex-1'>
          {value ? (
            <div className='flex flex-col'>
              <span className='text-sm leading-20px text-t-primary'>{folderName}</span>
              <span className='truncate text-11px leading-16px text-t-tertiary'>{value}</span>
            </div>
          ) : (
            <span className='text-sm text-t-secondary'>{placeholder}</span>
          )}
        </div>
        {value ? (
          <Close
            theme='outline'
            size='14'
            fill='currentColor'
            className='shrink-0 text-t-secondary transition-colors hover:text-t-primary'
            onClick={handleClear}
          />
        ) : (
          <Down size='14' fill='currentColor' className='shrink-0 text-t-secondary' />
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
              <div className='px-10px py-6px text-11px font-medium uppercase tracking-[0.08em] text-t-tertiary'>
                {recentLabel}
              </div>
              {recentWorkspaces.map((path) => {
                const recentName = path.split(/[\\/]/).pop() || path;
                const isSelected = value === path;

                return (
                  <div
                    key={path}
                    onClick={() => handleSelectRecent(path)}
                    className={`mx-2px flex cursor-pointer items-center gap-10px rounded-10px px-10px py-8px transition-all ${
                      isSelected
                        ? 'border border-primary-5 bg-fill-2 shadow-[0_0_0_1px_rgba(var(--primary-6),0.24)] hover:bg-fill-2'
                        : 'border border-transparent hover:border-border-2 hover:bg-fill-1'
                    }`}
                  >
                    <Folder theme='outline' size='16' fill='currentColor' className='shrink-0 text-t-secondary' />
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm leading-20px text-t-primary'>{recentName}</div>
                      <div className='truncate text-11px leading-16px text-t-secondary'>{path}</div>
                    </div>
                    {isSelected && <Check size='14' fill='currentColor' className='shrink-0 text-primary-6' />}
                  </div>
                );
              })}
              <div className='mx-6px my-4px border-t border-border-2' />
            </>
          )}

          <div
            onClick={() => void handleBrowse()}
            className='mx-2px flex cursor-pointer items-center gap-10px rounded-10px border border-transparent px-10px py-8px transition-all hover:border-border-2 hover:bg-fill-1'
          >
            <FolderPlus theme='outline' size='16' fill='currentColor' className='shrink-0 text-t-secondary' />
            <span className='text-sm text-t-primary'>{chooseDifferentLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceFolderSelect;
