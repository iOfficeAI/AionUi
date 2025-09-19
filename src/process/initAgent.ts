/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation, TProviderWithModel } from '@/common/storage';
import { AIONUI_TIMESTAMP_REGEX } from '@/common/constants';
import fs from 'fs/promises';
import path from 'path';
import type { ICreateConversationParams } from '@/common/ipcBridge';
import { getSystemDir } from './initStorage';
import { generateHashWithFullName } from './utils';

const buildWorkspaceWidthFiles = async (defaultWorkspaceName: string, workspace?: string, defaultFiles?: string[]) => {
  const customWorkspace = !!workspace;
  if (!workspace) {
    const tempPath = getSystemDir().workDir;
    workspace = path.join(tempPath, defaultWorkspaceName);
    await fs.mkdir(workspace, { recursive: true });
  }
  if (defaultFiles) {
    for (const file of defaultFiles) {
      let fileName = path.basename(file);

      // 如果是临时文件，去掉 AionUI 时间戳后缀
      const { cacheDir } = getSystemDir();
      const tempDir = path.join(cacheDir, 'temp');
      if (file.startsWith(tempDir)) {
        fileName = fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
      }

      const destPath = path.join(workspace, fileName);
      await fs.copyFile(file, destPath);
    }
  }
  return { workspace, customWorkspace };
};

export const createGeminiAgent = async (model: TProviderWithModel, workspace?: string, defaultFiles?: string[], webSearchEngine?: 'google' | 'default'): Promise<TChatConversation> => {
  const { workspace: newWorkspace, customWorkspace } = await buildWorkspaceWidthFiles(`gemini-temp-${Date.now()}`, workspace, defaultFiles);
  return {
    type: 'gemini',
    model,
    extra: { workspace: newWorkspace, customWorkspace, webSearchEngine },
    desc: customWorkspace ? newWorkspace : '临时工作区',
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: newWorkspace,
    id: generateHashWithFullName(newWorkspace),
  };
};

export const createAcpAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(`${extra.backend}-temp-${Date.now()}`, extra.workspace, extra.defaultFiles);
  return {
    type: 'acp',
    extra: { workspace: workspace, customWorkspace, backend: extra.backend, cliPath: extra.cliPath },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: generateHashWithFullName(workspace),
  };
};

export const createCodexAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(`codex-temp-${Date.now()}`, extra.workspace, extra.defaultFiles);
  return {
    type: 'codex',
    extra: { workspace: workspace, customWorkspace, cliPath: extra.cliPath },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: generateHashWithFullName(workspace),
  } as any;
};
