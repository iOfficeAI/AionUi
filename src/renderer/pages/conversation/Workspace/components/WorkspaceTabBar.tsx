/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge, Dropdown, Menu, Tabs, Tree } from '@arco-design/web-react';
import type { NodeProps } from '@arco-design/web-react/es/Tree/interface';
import { BranchOne, CheckSmall } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useMemo } from 'react';
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

type TreeNodeData = {
  key: string;
  title: string;
  children?: TreeNodeData[];
  isLeaf?: boolean;
  selectable?: boolean;
};

function buildTreeData(branches: string[]): TreeNodeData[] {
  type TempNode = { children: Map<string, TempNode>; fullPath: string | null };
  const root: TempNode = { children: new Map(), fullPath: null };

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

  function toTreeNodes(node: TempNode): TreeNodeData[] {
    const entries = Array.from(node.children.entries());
    const folders = entries.filter(([, c]) => c.children.size > 0).sort(([a], [b]) => a.localeCompare(b));
    const leaves = entries.filter(([, c]) => c.children.size === 0).sort(([a], [b]) => a.localeCompare(b));

    return [
      ...folders.map(([name, child]) => ({
        key: child.fullPath ?? name,
        title: name,
        children: toTreeNodes(child),
        selectable: false,
      })),
      ...leaves.map(([name, child]) => ({
        key: child.fullPath!,
        title: name,
        isLeaf: true,
        selectable: false,
      })),
    ];
  }

  return toTreeNodes(root);
}

/** Collect ancestor folder keys for default expansion */
function getExpandedKeys(branch: string): string[] {
  const parts = branch.split('/');
  const keys: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    keys.push(parts.slice(0, i).join('/'));
  }
  return keys;
}

const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({
  t,
  activeTab,
  onTabChange,
  changeCount,
  branch,
  branches,
}) => {
  const treeData = useMemo(() => buildTreeData(branches), [branches]);
  const defaultExpandedKeys = useMemo(() => (branch ? getExpandedKeys(branch) : []), [branch]);

  const renderTitle = (nodeProps: NodeProps) => {
    const isCurrent = nodeProps.isLeaf && nodeProps._key === branch;
    if (!nodeProps.isLeaf) {
      return <span className='text-12px text-t-tertiary'>{nodeProps.title}</span>;
    }
    return (
      <span className='flex items-center gap-4px'>
        {isCurrent ? <CheckSmall size={14} className='text-primary-6' /> : <span className='w-14px' />}
        <span className={`text-12px ${isCurrent ? 'font-medium text-primary-6' : ''}`}>
          {nodeProps.title as string}
        </span>
      </span>
    );
  };

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
          <Menu style={{ maxHeight: 320, overflowY: 'auto', minWidth: 180 }}>
            <Tree
              treeData={treeData}
              defaultExpandedKeys={defaultExpandedKeys}
              blockNode
              size='mini'
              renderTitle={renderTitle}
            />
          </Menu>
        }
      >
        <span className='flex items-center gap-4px text-12px text-t-tertiary mr-8px cursor-pointer hover:text-t-secondary transition-colors'>
          <BranchOne size={14} />
          <span className='max-w-120px overflow-hidden text-ellipsis whitespace-nowrap'>{branch}</span>
        </span>
      </Dropdown>
    ) : branch ? (
      <span className='flex items-center gap-4px text-12px text-t-tertiary mr-8px'>
        <BranchOne size={14} />
        <span className='max-w-120px overflow-hidden text-ellipsis whitespace-nowrap'>{branch}</span>
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
