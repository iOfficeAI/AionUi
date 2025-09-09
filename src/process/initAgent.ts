/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation, TProviderWithModel } from '@/common/storage';
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
      const fileName = path.basename(file);
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
