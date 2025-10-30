/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Empty, Input, Tree, Tooltip } from '@arco-design/web-react';
import { Refresh, Search, FileAddition } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDebounce from '../../hooks/useDebounce';
import { iconColors } from '@/renderer/theme/colors';
interface WorkspaceProps {
  workspace: string;
  conversation_id: string;
  eventPrefix?: 'gemini' | 'acp' | 'codex';
}

const useLoading = () => {
  const [loading, setLoading] = useState(false);
  const lastLoadingTime = useRef(Date.now());
  const setLoadingHandler = (newState: boolean) => {
    if (newState) {
      lastLoadingTime.current = Date.now();
      setLoading(true);
    } else {
      //@mark 这么做主要是为了让loading的动画保持， 以免出现图标“闪烁”效果
      if (Date.now() - lastLoadingTime.current > 1000) {
        setLoading(false);
      } else {
        setTimeout(() => {
          setLoading(false);
        }, 1000);
      }
    }
  };
  return [loading, setLoadingHandler] as const;
};

const ChatWorkspace: React.FC<WorkspaceProps> = ({ conversation_id, workspace, eventPrefix = 'gemini' }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loading, setLoading] = useLoading();
  const [treeKey, setTreeKey] = useState(Math.random());
  const [showSearch, setShowSearch] = useState(false);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  const [searchText, setSearchText] = useState('');
  useAddEventListener(`${eventPrefix}.selected.file.clear`, () => {
    setSelected([]);
  });

  useAddEventListener(`${eventPrefix}.selected.file`, (files) => {
    setSelected(files);
  });

  const loadWorkspace = useCallback(
    (path: string, search?: string) => {
      setLoading(true);
      return ipcBridge.conversation.getWorkspace
        .invoke({ path, workspace, conversation_id, search: search || '' })
        .then((res) => {
          setFiles(res);
          setTreeKey(Math.random());
          return res;
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [conversation_id, workspace]
  );

  const refreshWorkspace = useCallback(() => {
    void loadWorkspace(workspace).then((files) => {
      setShowSearch(files.length > 0 && files[0]?.children?.length > 0);
    });
  }, [workspace, loadWorkspace]);

  const handleAddFiles = useCallback(() => {
    ipcBridge.dialog.showOpen
      .invoke({
        properties: ['openFile', 'multiSelections'],
        defaultPath: workspace,
      })
      .then((selectedFiles) => {
        if (selectedFiles && selectedFiles.length > 0) {
          return ipcBridge.fs.copyFilesToWorkspace.invoke({ filePaths: selectedFiles, workspace }).then((result) => {
            if (result.success && result.data?.copiedFiles.length > 0) {
              setTimeout(() => {
                refreshWorkspace();
              }, 300);
            } else {
              console.error('Failed to copy files:', result.msg);
            }
          });
        }
      })
      .catch((error) => {
        console.error('Failed to add files:', error);
      });
  }, [workspace, refreshWorkspace]);

  const onSearch = useDebounce(
    (value: string) => {
      void loadWorkspace(workspace, value);
    },
    200,
    [workspace, loadWorkspace]
  );

  useEffect(() => {
    setFiles([]);
    refreshWorkspace();
    emitter.emit(`${eventPrefix}.selected.file`, []);
  }, [conversation_id, eventPrefix, refreshWorkspace]);

  useEffect(() => {
    const handleGeminiResponse = (data: { type: string }) => {
      if (data.type === 'tool_group' || data.type === 'tool_call') {
        refreshWorkspace();
      }
    };
    const handleAcpResponse = (data: { type: string }) => {
      if (data.type === 'acp_tool_call') {
        refreshWorkspace();
      }
    };
    const handleCodexResponse = (data: { type: string }) => {
      if (data.type === 'codex_tool_call') {
        refreshWorkspace();
      }
    };
    const unsubscribeGemini = ipcBridge.geminiConversation.responseStream.on(handleGeminiResponse);
    const unsubscribeAcp = ipcBridge.acpConversation.responseStream.on(handleAcpResponse);
    const unsubscribeCodex = ipcBridge.codexConversation.responseStream.on(handleCodexResponse);

    return () => {
      unsubscribeGemini();
      unsubscribeAcp();
      unsubscribeCodex();
    };
  }, [conversation_id, eventPrefix]);

  useAddEventListener(`${eventPrefix}.workspace.refresh`, () => refreshWorkspace(), [refreshWorkspace]);

  useEffect(() => {
    return ipcBridge.conversation.responseSearchWorkSpace.provider((data) => {
      if (data.match) setFiles([data.match]);
      return Promise.resolve();
    });
  }, []);

  const hasOriginalFiles = files.length > 0 && files[0]?.children?.length > 0;

  return (
    <div className='size-full flex flex-col'>
      <div className='px-16px pb-8px' onMouseEnter={() => setIsHeaderHovered(true)} onMouseLeave={() => setIsHeaderHovered(false)}>
        <div className='flex items-center justify-start gap-8px'>
          <span className='font-bold text-14px text-t-primary'>{t('common.file')}</span>
          {isHeaderHovered && (
            <div className='flex items-center gap-8px'>
              <Tooltip content={t('conversation.workspace.addFile')}>
                <span>
                  <FileAddition className='cursor-pointer flex' theme='outline' size='16' fill={iconColors.secondary} onClick={handleAddFiles} />
                </span>
              </Tooltip>
              <Tooltip content={t('conversation.workspace.refresh')}>
                <span>
                  <Refresh className={loading ? 'loading lh-[1] flex cursor-pointer' : 'flex cursor-pointer'} theme='outline' size='16' fill={iconColors.secondary} onClick={() => refreshWorkspace()} />
                </span>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
      {(showSearch || searchText) && (
        <div className='px-16px pb-8px'>
          <Input
            className='w-full'
            placeholder={t('conversation.workspace.searchPlaceholder')}
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              onSearch(value);
            }}
            allowClear
            prefix={<Search theme='outline' size='14' fill={iconColors.primary} />}
          />
        </div>
      )}
      <FlexFullContainer containerClassName='overflow-y-auto'>
        {!hasOriginalFiles ? (
          <div className=' flex-1 size-full flex items-center justify-center px-16px box-border'>
            <Empty
              description={
                <div>
                  <span className='text-t-secondary font-bold text-14px'>{searchText ? t('conversation.workspace.search.empty') : t('conversation.workspace.empty')}</span>
                  <div className='text-t-secondary'>{searchText ? '' : t('conversation.workspace.emptyDescription')}</div>
                </div>
              }
            />
          </div>
        ) : (
          <Tree
            className={'!px-16px'}
            showLine
            key={treeKey}
            selectedKeys={selected}
            treeData={files}
            fieldNames={{
              children: 'children',
              title: 'name',
              key: 'relativePath',
              isLeaf: 'isFile',
            }}
            multiple
            renderTitle={(node) => {
              const path = node.dataRef.fullPath;
              return (
                <span
                  className='flex items-center gap-4px group'
                  onDoubleClick={() => {
                    void ipcBridge.shell.openFile.invoke(path);
                  }}
                >
                  {node.title}
                </span>
              );
            }}
            onSelect={(keys) => {
              const newKeys = keys.filter((key) => key !== workspace);
              setSelected(newKeys);
              emitter.emit(`${eventPrefix}.selected.file`, newKeys);
            }}
            loadMore={(treeNode) => {
              const path = treeNode.props.dataRef.fullPath;
              return ipcBridge.conversation.getWorkspace.invoke({ conversation_id, workspace, path }).then((res) => {
                treeNode.props.dataRef.children = res[0].children;
                setFiles([...files]);
              });
            }}
          ></Tree>
        )}
      </FlexFullContainer>
    </div>
  );
};

export default ChatWorkspace;
