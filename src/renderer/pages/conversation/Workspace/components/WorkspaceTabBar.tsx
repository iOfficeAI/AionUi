/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge, Dropdown, Tabs } from '@arco-design/web-react';
import { BranchOne, CheckSmall, Down, Right } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useCallback, useMemo, useState } from 'react';
import type { WorkspaceTab } from '../types';

type WorkspaceTabBarProps = {
  t: TFunction;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  changeCount: number;
  branch: string | null;
  branches: string[];
};

// --- Branch tree helpers ---

type BranchNode = {
  children: Map<string, BranchNode>;
  fullPath: string | null;
};

function buildBranchTree(branches: string[]): BranchNode {
  const root: BranchNode = { children: new Map(), fullPath: null };
  for (const branch of branches) {
    const parts = branch.split('/');
    let node = root;
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map(), fullPath: null });
      }
      node = node.children.get(part)!;
    }
    node.fullPath = branch;
  }
  return root;
}

function getAncestorPaths(branch: string): string[] {
  const parts = branch.split('/');
  const keys: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    keys.push(parts.slice(0, i).join('/'));
  }
  return keys;
}

// --- Recursive branch list ---

type BranchListProps = {
  node: BranchNode;
  currentBranch: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  prefix?: string;
  depth?: number;
};

const INDENT = 12;

const BranchList: React.FC<BranchListProps> = ({ node, currentBranch, expanded, onToggle, prefix = '', depth = 0 }) => {
  const entries = Array.from(node.children.entries());
  const folders = entries.filter(([, c]) => c.children.size > 0).toSorted(([a], [b]) => a.localeCompare(b));
  const leaves = entries.filter(([, c]) => c.children.size === 0).toSorted(([a], [b]) => a.localeCompare(b));

  return (
    <>
      {folders.map(([name, child]) => {
        const folderPath = prefix ? `${prefix}/${name}` : name;
        const isOpen = expanded.has(folderPath);
        return (
          <React.Fragment key={`f:${folderPath}`}>
            <div
              className='flex items-center h-26px px-8px text-t-tertiary cursor-pointer hover:bg-fill-2 select-none text-12px'
              style={{ paddingLeft: 8 + depth * INDENT }}
              onClick={() => onToggle(folderPath)}
            >
              {isOpen ? (
                <Down size={10} className='shrink-0 mr-4px' />
              ) : (
                <Right size={10} className='shrink-0 mr-4px' />
              )}
              {name}
            </div>
            {isOpen && (
              <BranchList
                node={child}
                currentBranch={currentBranch}
                expanded={expanded}
                onToggle={onToggle}
                prefix={folderPath}
                depth={depth + 1}
              />
            )}
          </React.Fragment>
        );
      })}
      {leaves.map(([name, child]) => {
        const isCurrent = child.fullPath === currentBranch;
        return (
          <div
            key={`b:${child.fullPath}`}
            className={`flex items-center h-26px px-8px text-12px ${isCurrent ? 'text-primary-6' : 'text-t-primary'}`}
            style={{ paddingLeft: 8 + depth * INDENT }}
          >
            {isCurrent ? <CheckSmall size={14} className='shrink-0 mr-2px' /> : <span className='w-16px shrink-0' />}
            <span className={`truncate ${isCurrent ? 'font-medium' : ''}`}>{name}</span>
          </div>
        );
      })}
    </>
  );
};

// --- Main component ---

const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({
  t,
  activeTab,
  onTabChange,
  changeCount,
  branch,
  branches,
}) => {
  const tree = useMemo(() => buildBranchTree(branches), [branches]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(branch ? getAncestorPaths(branch) : []));

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const changesTitle = (
    <span className='flex items-center gap-4px'>
      {t('conversation.workspace.changes.tab')}
      {changeCount > 0 && <Badge count={changeCount} maxCount={99} style={{ fontSize: '11px' }} />}
    </span>
  );

  const branchDropdown =
    branch && branches.length > 0 ? (
      <Dropdown
        trigger='click'
        position='bl'
        droplist={
          <div
            className='rounded-6px py-4px shadow-lg'
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              width: 220,
              background: 'var(--color-bg-popup)',
              border: '1px solid var(--color-border)',
            }}
          >
            <BranchList node={tree} currentBranch={branch} expanded={expanded} onToggle={toggleFolder} />
          </div>
        }
      >
        <span className='flex items-center gap-4px text-12px text-t-tertiary mx-8px cursor-pointer hover:text-t-secondary transition-colors w-100px'>
          <BranchOne size={14} className='shrink-0' />
          <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{branch}</span>
        </span>
      </Dropdown>
    ) : branch ? (
      <span className='flex items-center gap-4px text-12px text-t-tertiary mx-8px w-100px'>
        <BranchOne size={14} className='shrink-0' />
        <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{branch}</span>
      </span>
    ) : null;

  return (
    <Tabs
      activeTab={activeTab}
      onChange={(key) => onTabChange(key as WorkspaceTab)}
      type='line'
      size='small'
      className='px-12px [&_.arco-tabs-nav]:border-b-0'
      extra={branchDropdown}
    >
      <Tabs.TabPane key='files' title={t('conversation.workspace.changes.filesTab')} />
      <Tabs.TabPane key='changes' title={changesTitle} />
    </Tabs>
  );
};

export default WorkspaceTabBar;
