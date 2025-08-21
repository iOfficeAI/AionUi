/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation, TModelWithConversation } from '@/common/storage';
import fs from 'fs/promises';
import path from 'path';
import { getSystemDir } from './initStorage';
import { generateHashWithFullName } from './utils';

export const createGeminiAgent = async (model: TModelWithConversation, workspace?: string, defaultFiles?: string[]): Promise<TChatConversation> => {
  const customWorkspace = !!workspace;
  if (!workspace) {
    const tempPath = getSystemDir().workDir;
    const fileName = `gemini-temp-${Date.now()}`;
    workspace = path.join(tempPath, fileName);
    await fs.mkdir(workspace, { recursive: true });
    if (defaultFiles) {
      for (const file of defaultFiles) {
        const fileName = path.basename(file);
        const destPath = path.join(workspace, fileName);
        await fs.copyFile(file, destPath);
      }
    }
  }
  return {
    type: 'gemini',
    model,
    extra: { workspace: workspace, customWorkspace },
    desc: customWorkspace ? workspace : '临时工作区',
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: generateHashWithFullName(workspace),
  };
};
