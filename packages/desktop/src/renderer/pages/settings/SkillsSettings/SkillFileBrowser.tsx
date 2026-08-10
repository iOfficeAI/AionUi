/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { SkillFileNode } from '@/common/adapter/ipcBridge';
import CodeEditor from '@/renderer/pages/conversation/Preview/components/editors/CodeEditor';
import MarkdownViewer from '@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer';
import { Empty, Spin, Tree } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type SkillFileBrowserProps = {
  skill: {
    location: string;
  };
};

const findFirstFile = (nodes: SkillFileNode[]): SkillFileNode | undefined => {
  for (const node of nodes) {
    if (node.type === 'file') return node;
    const nested = findFirstFile(node.children ?? []);
    if (nested) return nested;
  }
  return undefined;
};

export const findPreferredSkillFile = (nodes: SkillFileNode[]): SkillFileNode | undefined =>
  nodes.find((node) => node.type === 'file' && node.relativePath.toLowerCase() === 'skill.md') ?? findFirstFile(nodes);

const toSkillRoot = (skillLocation: string): string =>
  skillLocation.replace(/[\\/]SKILL\.md$/i, '').replace(/[\\/]$/, '');

const toAbsoluteFilePath = (skillRoot: string, relativePath: string): string => {
  const separator = skillRoot.includes('\\') ? '\\' : '/';
  return `${skillRoot}${separator}${relativePath.replaceAll('/', separator)}`;
};

const SkillFileBrowser: React.FC<SkillFileBrowserProps> = ({ skill }) => {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<SkillFileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [content, setContent] = useState('');
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const isMarkdown = /\.md$/i.test(selectedPath);
  const skillRoot = useMemo(() => toSkillRoot(skill.location), [skill.location]);
  const absoluteFilePath = useMemo(
    () => (selectedPath ? toAbsoluteFilePath(skillRoot, selectedPath) : undefined),
    [selectedPath, skillRoot]
  );

  const loadFile = useCallback(
    async (relativePath: string) => {
      setSelectedPath(relativePath);
      setLoadingContent(true);
      setLoadFailed(false);
      try {
        const nextContent = await ipcBridge.fs.readSkillFile.invoke({
          skill_location: skill.location,
          relative_path: relativePath,
        });
        setContent(nextContent);
      } catch (error) {
        console.error('[SkillFileBrowser] Failed to read skill file:', error);
        setContent('');
        setLoadFailed(true);
      } finally {
        setLoadingContent(false);
      }
    },
    [skill.location]
  );

  useEffect(() => {
    let active = true;
    setLoadingTree(true);
    setLoadFailed(false);
    setNodes([]);
    setSelectedPath('');
    setContent('');

    void ipcBridge.fs.listSkillFiles
      .invoke({ skill_location: skill.location })
      .then((nextNodes) => {
        if (!active) return;
        setNodes(nextNodes);
        const preferred = findPreferredSkillFile(nextNodes);
        if (preferred) void loadFile(preferred.relativePath);
      })
      .catch((error) => {
        console.error('[SkillFileBrowser] Failed to list skill files:', error);
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoadingTree(false);
      });

    return () => {
      active = false;
    };
  }, [loadFile, skill.location]);

  if (loadingTree) {
    return (
      <div className='h-320px flex items-center justify-center'>
        <Spin />
      </div>
    );
  }

  if (loadFailed && !selectedPath) {
    return (
      <div className='h-240px flex items-center justify-center text-13px text-t-tertiary'>
        {t('settings.skillsHub.detailFilesError', { defaultValue: "Could not load this skill's files." })}
      </div>
    );
  }

  return (
    <div className='h-420px min-h-0 flex overflow-hidden rounded-10px border border-solid border-border-3 bg-bg-1'>
      <div data-testid='skill-file-tree-panel' className='w-220px min-w-160px shrink-0 overflow-auto bg-2 p-8px'>
        <Tree
          data-testid='skill-file-tree'
          treeData={nodes}
          selectedKeys={selectedPath ? [selectedPath] : []}
          actionOnClick={['select', 'expand']}
          fieldNames={{ children: 'children', title: 'name', key: 'relativePath' }}
          onSelect={(_keys, extra) => {
            const node = extra?.node?.props?.dataRef as SkillFileNode | undefined;
            if (node?.type === 'file') void loadFile(node.relativePath);
          }}
        />
      </div>

      <div className='min-w-0 flex-1 flex flex-col'>
        <div className='h-40px shrink-0 flex items-center gap-8px border-b border-solid border-border-3 px-10px'>
          <span className='min-w-0 truncate text-12px text-t-secondary'>{selectedPath}</span>
        </div>

        <div className='min-h-0 flex-1 overflow-hidden'>
          {loadingContent ? (
            <div className='size-full flex items-center justify-center'>
              <Spin />
            </div>
          ) : loadFailed ? (
            <div className='size-full flex items-center justify-center text-13px text-t-tertiary'>
              {t('settings.skillsHub.detailFilesError', { defaultValue: "Could not load this skill's files." })}
            </div>
          ) : !selectedPath ? (
            <Empty />
          ) : isMarkdown ? (
            <MarkdownViewer content={content} viewMode='preview' file_path={absoluteFilePath} workspace={skillRoot} />
          ) : (
            <CodeEditor value={content} onChange={() => undefined} fileName={selectedPath} readOnly />
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillFileBrowser;
