/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { IModel } from '@/common/storage';
import { AuthType, clearCachedCredentialFile, Config, getOauthInfoWithCache, loginWithOauth } from '@office-ai/aioncli-core';
import { logger } from '@office-ai/platform';
import { app, dialog, shell } from 'electron';
import fs from 'fs/promises';
import OpenAI from 'openai';
import path from 'path';
import { ipcBridge } from '../common';
import { createGeminiAgent } from './initAgent';
import { ProcessChat, ProcessConfig } from './initStorage';
import type { GeminiAgentTask } from './task/GeminiAgentTask';
import { generateHashWithFullName, readDirectoryRecursive } from './utils';
import WorkerManage from './WorkerManage';

logger.config({ print: true });

ipcBridge.dialog.showOpen.provider((options) => {
  return dialog
    .showOpenDialog({
      defaultPath: options?.defaultPath,
      properties: options?.properties,
    })
    .then((res) => {
      return res.filePaths;
    });
});

ipcBridge.shell.openFile.provider(async (path) => {
  shell.openPath(path);
});

ipcBridge.shell.showItemInFolder.provider(async (path) => {
  shell.showItemInFolder(path);
});
ipcBridge.shell.openExternal.provider(async (url) => {
  return shell.openExternal(url);
});

ipcBridge.fs.getFilesByDir.provider(async ({ dir }) => {
  const tree = await readDirectoryRecursive(dir);
  return tree ? [tree] : [];
});

ipcBridge.conversation.create.provider(async ({ type, extra, name, model }) => {
  try {
    if (type === 'gemini') {
      const conversation = await createGeminiAgent(model, extra.workspace, extra.defaultFiles);
      if (name) {
        conversation.name = name;
      }
      WorkerManage.buildConversation(conversation);
      await ProcessChat.get('chat.history').then((history) => {
        if (!history) {
          ProcessChat.set('chat.history', [conversation]);
        } else {
          if (history.some((h) => h.id === conversation.id)) return;
          ProcessChat.set('chat.history', [...history, conversation]);
        }
      });
      return conversation;
    }
    throw new Error('Unsupported conversation type');
  } catch (e) {
    console.error('-----createConversation error-----', e);
    return null;
  }
});

ipcBridge.conversation.remove.provider(async ({ id }) => {
  return ProcessChat.get('chat.history').then((history) => {
    try {
      WorkerManage.kill(id);
      if (!history) return;
      ProcessChat.set(
        'chat.history',
        history.filter((item) => item.id !== id)
      );
      return true;
    } catch (e) {
      return false;
    }
  });
});

ipcBridge.conversation.reset.provider(async ({ id }) => {
  if (id) {
    WorkerManage.kill(id);
  } else WorkerManage.clear();
});

ipcBridge.conversation.get.provider(async ({ id }) => {
  return ProcessChat.get('chat.history')
    .then((history) => {
      return history.find((item) => item.id === id);
    })
    .then((conversation) => {
      if (conversation) {
        const task = WorkerManage.getTaskById(id);
        conversation.status = task.status;
      }
      return conversation;
    });
});

ipcBridge.application.restart.provider(async () => {
  app.relaunch();
  app.exit(0);
});

ipcBridge.geminiConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
  const task = WorkerManage.getTaskById(conversation_id) as GeminiAgentTask;
  if (!task) return { success: false, msg: 'conversation not found' };
  if (files) {
    for (const file of files) {
      const fileName = path.basename(file);
      const destPath = path.join(task.workspace, fileName);
      await fs.copyFile(file, destPath);
    }
  }
  return task
    .sendMessage(other)
    .then(() => ({ success: true }))
    .catch((err) => {
      return { success: false, msg: err };
    });
});
ipcBridge.geminiConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
  const task: GeminiAgentTask = WorkerManage.getTaskById(conversation_id) as any;
  if (!task) return { success: false, msg: 'conversation not found' };
  if (task.type !== 'gemini' && task.type !== 'gemini2') return { success: false, msg: 'not support' };
  return task
    .confirmMessage({ confirmKey, msg_id, callId })
    .then(() => ({ success: true }))
    .catch((err) => {
      return { success: false, msg: err };
    });
});

ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
  const task = WorkerManage.getTaskById(conversation_id);
  if (!task) return { success: true, msg: 'conversation not found' };
  if (task.type !== 'gemini') return { success: true, msg: 'not support' };
  return task.stop().then(() => ({ success: true }));
});

ipcBridge.geminiConversation.getWorkspace.provider(async ({ workspace }) => {
  const task = WorkerManage.getTaskById(generateHashWithFullName(workspace));
  console.log('geminiConversation.getWorkspace', task.type);
  if (!task || task.type !== 'gemini') return [];
  return task.postMessagePromise('gemini.get.workspace', {}).then((res: any) => {
    return res;
  });
});

ipcBridge.googleAuth.status.provider(async ({ proxy }) => {
  try {
    const info = await getOauthInfoWithCache(proxy);
    console.log('getOauthInfoWithCache----->', proxy, info);

    if (info) return { success: true, data: { account: info.email } };
    return { success: false };
  } catch (e) {
    return { success: false, msg: e.message || e.toString() };
  }
});
ipcBridge.googleAuth.login.provider(async ({ proxy }) => {
  const config = new Config({
    proxy,
    sessionId: '',
    targetDir: '',
    debugMode: false,
    cwd: '',
    model: '',
  });
  const client = await loginWithOauth(AuthType.LOGIN_WITH_GOOGLE, config);
  if (client) return { success: true, data: { account: '' } };
  return { success: false };
});

ipcBridge.googleAuth.logout.provider(async ({}) => {
  console.log('clearCachedCredentialFile');
  return clearCachedCredentialFile();
});

ipcBridge.mode.fetchModelList.provider(async ({ base_url, api_key }) => {
  const openai = new OpenAI({
    baseURL: base_url,
    apiKey: api_key,
  });
  try {
    const res = await openai.models.list();
    return { success: true, data: { mode: res.data.map((v) => v.id) } };
  } catch (e) {
    return { success: false, msg: e.message || e.toString() };
  }
});

ipcBridge.mode.saveModelConfig.provider((models) => {
  console.log('saveModelConfig', models);
  return ProcessConfig.set('model.config', models)
    .then(() => {
      return { success: true };
    })
    .catch((e) => {
      console.error('saveModelConfig error', e);
      return { success: false, msg: e.message || e.toString() };
    });
});

ipcBridge.mode.getModelConfig.provider(async () => {
  return ProcessConfig.get('model.config').catch(() => {
    return [] as IModel[];
  });
});
