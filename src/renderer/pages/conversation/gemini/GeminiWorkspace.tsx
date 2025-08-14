/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Empty, Tree } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
const GeminiWorkspace: React.FC<{
  workspace: string;
  customWorkspace?: boolean;
}> = ({ workspace, customWorkspace }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loading, setLoading] = useState(false);
  useAddEventListener('gemini.selected.file.clear', () => {
    setSelected([]);
  });

  useAddEventListener('gemini.selected.file', (files) => {
    setSelected(files);
  });

  const refreshWorkspace = () => {
    setLoading(true);
    const startTime = Date.now();
    ipcBridge.geminiConversation.getWorkspace
      .invoke({ workspace: workspace })
      .then((res) => {
        console.log('----getWorkspace', res);
        setFiles(res);
      })
      .finally(() => {
        if (Date.now() - startTime > 1000) {
          setLoading(false);
        } else {
          setTimeout(() => {
            setLoading(false);
          }, 1000);
        }
      });
  };

  useEffect(() => {
    setFiles([]);
    refreshWorkspace();
    emitter.emit('gemini.selected.file', []);
  }, [workspace]);

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((data) => {
      if (data.type === 'tool_group' || data.type === 'tool_call') {
        refreshWorkspace();
      }
    });
  }, [workspace]);

  useAddEventListener('gemini.workspace.refresh', () => refreshWorkspace(), [workspace]);

  const hasFile = files.length > 0 && files[0].children.length > 0;
  return (
    <div className='size-full flex flex-col'>
      <div className='px-16px pb-0px flex items-center justify-start gap-4px'>
        <span className='font-bold text-14px'>{t('common.file')}</span>
        <Refresh className={loading ? 'loading lh-[1] flex' : 'flex'} theme='outline' fill='#333' onClick={refreshWorkspace} />
      </div>
      <FlexFullContainer containerClassName='overflow-y-auto'>
        {!hasFile ? (
          <div className=' flex-1 size-full flex items-center justify-center px-16px box-border'>
            <Empty
              description={
                <div>
                  <span className='color-#6b7280 font-bold text-14px'>{t('conversation.workspace.empty')}</span>
                  <div>{t('conversation.workspace.emptyDescription')}</div>
                </div>
              }
            />
          </div>
        ) : (
          <Tree
            className={'!px-16px'}
            showLine
            selectedKeys={selected}
            treeData={files}
            autoExpandParent
            fieldNames={{
              children: 'children',
              title: 'name',
              key: 'path',
            }}
            multiple
            renderTitle={(node) => {
              let timer: any;
              const path = node.dataRef.path;
              let time = Date.now();
              return (
                <span
                  className='flex items-center gap-4px group'
                  onClick={() => {
                    return;
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                      setSelected((list) => {
                        let newList = [...list];
                        if (list.some((key) => key === path)) newList = list.filter((key) => key !== path);
                        else newList = [...list, path];
                        emitter.emit('gemini.selected.file', newList);
                        return newList;
                      });
                    }, 100);
                    console.log('----click', timer, Date.now() - time);
                    time = Date.now();
                  }}
                  onDoubleClick={() => {
                    if (path === workspace) {
                      // first node is workspace
                      return ipcBridge.shell.openFile.invoke(path);
                    }
                    ipcBridge.shell.openFile.invoke(workspace + '/' + path);
                  }}
                >
                  {node.title}
                </span>
              );
            }}
            onSelect={(keys) => {
              setSelected(keys);
              emitter.emit('gemini.selected.file', keys);
            }}
          ></Tree>
        )}
      </FlexFullContainer>
    </div>
  );
};

export default GeminiWorkspace;
