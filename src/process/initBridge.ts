/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TChatConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import { AuthType, clearCachedCredentialFile, Config, getOauthInfoWithCache, loginWithOauth } from '@office-ai/aioncli-core';
import { logger } from '@office-ai/platform';
import { app, dialog, shell } from 'electron';
import fs from 'fs/promises';
import OpenAI from 'openai';
import path from 'path';
import { ipcBridge } from '../common';
import { createGeminiAgent } from './initAgent';
import { getSystemDir, ProcessChat, ProcessChatMessage, ProcessConfig, ProcessEnv } from './initStorage';
import { nextTickToLocalFinish } from './message';
import type { AcpAgentConfig } from './task/AcpAgentTask';
import { AcpAgentTask } from './task/AcpAgentTask';
import type { GeminiAgentManager } from './task/GeminiAgentManager';
import { copyDirectoryRecursively, generateHashWithFullName, readDirectoryRecursive } from './utils';
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
ipcBridge.fs.getImageBase64.provider(async ({ path: filePath }) => {
  try {
    const ext = (path.extname(filePath) || '').toLowerCase().replace(/^\./, '');
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      avif: 'image/avif',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const base64 = await fs.readFile(filePath, { encoding: 'base64' });
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    console.error(`Failed to read image file: ${filePath}`, error);
    // Return a placeholder data URL instead of throwing
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
  }
});

ipcBridge.conversation.create.provider(async ({ type, extra, name, model }): Promise<TChatConversation> => {
  try {
    if (type === 'gemini') {
      const conversation = await createGeminiAgent(model, extra.workspace, extra.defaultFiles, extra.webSearchEngine);
      if (name) {
        conversation.name = name;
      }
      WorkerManage.buildConversation(conversation);
      await ProcessChat.get('chat.history').then((history) => {
        // 区分真正的空历史和读取失败
        let safeHistory: TChatConversation[];
        if (Array.isArray(history)) {
          safeHistory = history;
        } else if (history === null || history === undefined) {
          // 全新用户或首次使用，创建空的历史列表
          safeHistory = [];
        } else {
          // 其他异常情况（比如解析错误），为安全起见不保存
          return;
        }
        
        // 检查是否已存在
        if (safeHistory.some((h) => h.id === conversation.id)) return;
        
        // 安全地添加新会话
        ProcessChat.set('chat.history', [...safeHistory, conversation]);
      });
      return conversation;
    } else if (type === 'acp') {
      if (!extra.backend) {
        throw new Error('ACP backend is required');
      }

      // Create unique workspace directory for each ACP conversation
      // Always create a new acp-temp directory, even if workspace is provided
      const baseWorkspace = extra.workspace || getSystemDir().workDir;
      const fileName = `acp-temp-${Date.now()}`;
      const workspace = path.join(baseWorkspace, fileName);
      // Create the unique workspace directory
      await fs.mkdir(workspace, { recursive: true });
      
      // Copy default files if provided
      if (extra.defaultFiles) {
        for (const file of extra.defaultFiles) {
          const fileName = path.basename(file);
          const destPath = path.join(workspace, fileName);
          await fs.copyFile(file, destPath);
        }
      }
      
      const customWorkspace = !!extra.workspace;

      const conversationId = generateHashWithFullName(`${extra.backend}-acp-${workspace}`);
      
      // Check if conversation already exists before creating
      const history = await ProcessChat.get('chat.history');
      let safeHistory: TChatConversation[];
      if (Array.isArray(history)) {
        safeHistory = history;
      } else if (history === null || history === undefined) {
        // 全新用户或首次使用，创建空的历史列表
        safeHistory = [];
      } else {
        // 其他异常情况（比如解析错误），为安全起见不保存
        safeHistory = [];
      }
      
      // 检查是否已存在
      const existingConversation = safeHistory.find((h) => h.id === conversationId);
      if (existingConversation) {
        // Re-add to WorkerManage if not already present
        if (!WorkerManage.getTaskById(conversationId)) {
          const existingConfig: AcpAgentConfig = {
            id: existingConversation.id,
            name: existingConversation.name,
            backend: (existingConversation.extra as any)?.backend || (extra as any).backend,
            cliPath: (existingConversation.extra as any)?.cliPath || (extra as any).cliPath,
            workingDir: existingConversation.extra?.workspace || workspace,
            createTime: existingConversation.createTime,
            modifyTime: existingConversation.modifyTime,
            extra: existingConversation.extra as any,
            model: existingConversation.model as any, // Type compatibility for legacy models
          };
          const restoredConversation = new AcpAgentTask(existingConfig);
          WorkerManage.addTask(conversationId, restoredConversation);
        }
        return existingConversation;
      }

      const config: AcpAgentConfig = {
        id: conversationId,
        name: name || `${extra.backend} ACP`,
        backend: extra.backend,
        cliPath: extra.cliPath,
        workingDir: workspace,
        extra: {
          workspace: workspace,
          backend: extra.backend,
          cliPath: extra.cliPath,
          customWorkspace: customWorkspace,
        },
      };

      // Save CLI path if provided
      // TODO: Fix saveCliPath blocking issue
      // if (extra.cliPath) {
      //   await AcpConfigManager.saveCliPath(extra.backend, extra.cliPath);
      // }

      const conversation = new AcpAgentTask(config);

      // ACP messages are handled directly in AcpAgentTask, no need for additional listeners

      // Add the ACP task to WorkerManage
      WorkerManage.addTask(conversation.id, conversation);
      
      // Convert AcpAgentTask to TChatConversation for storage
      const conversationForStorage: TChatConversation = {
        id: conversation.id,
        name: conversation.name,
        type: 'acp' as const,
        createTime: conversation.createTime,
        modifyTime: conversation.modifyTime,
        model: conversation.model as any, // Type compatibility for legacy models
        extra: conversation.extra,
        status: conversation.status,
      };

      // 安全地添加新会话到历史记录
      ProcessChat.set('chat.history', [...safeHistory, conversationForStorage]);

      // Start the ACP connection asynchronously - don't block conversation creation

      // Start connection in background - don't block conversation creation
      setTimeout(async () => {
        try {
          const startPromise = conversation.start();

          await Promise.race([
            startPromise,
            new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error('ACP start timeout after 120 seconds'));
              }, 120000);
            }),
          ]);
        } catch (error) {
          // Don't throw - just log the error so the conversation remains in the list
        }
      }, 100);

      // Convert AcpAgentTask to TChatConversation format for return
      return {
        id: conversation.id,
        name: conversation.name,
        type: 'acp' as const,
        createTime: conversation.createTime,
        modifyTime: conversation.modifyTime,
        model: conversation.model as any, // Type assertion for compatibility
        extra: conversation.extra,
        status: conversation.status,
      };
    }
    throw new Error('Unsupported conversation type');
  } catch (e) {
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
      nextTickToLocalFinish(() => ProcessChatMessage.backup(id));
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
      return history?.find((item) => item.id === id);
    })
    .then(async (conversation) => {
      if (!conversation) {
        return null;
      }

      let task = WorkerManage.getTaskById(id);

      // If task doesn't exist and this is an ACP conversation, try to recreate it
      if (!task && conversation.type === 'acp') {
        try {
          const config: AcpAgentConfig = {
            id: conversation.id,
            name: conversation.name,
            backend: conversation.extra?.backend || 'claude',
            cliPath: conversation.extra?.cliPath,
            workingDir: conversation.extra?.workspace || process.cwd(),
            // Preserve original conversation metadata
            createTime: conversation.createTime,
            modifyTime: conversation.modifyTime,
            extra: conversation.extra,
            model: conversation.model as any, // Type compatibility for legacy models
          };

          
          const newTask = new AcpAgentTask(config);

          // ACP messages are handled directly in AcpAgentTask

          // Add to WorkerManage
          WorkerManage.addTask(conversation.id, newTask);
          task = newTask;
        } catch (error) {
          console.error('Failed to create ACP task:', error);
        }
      }

      if (task) {
        conversation.status = task.status;
      }

      return conversation;
    });
});

ipcBridge.application.restart.provider(async () => {
  // 清理所有工作进程
  WorkerManage.clear();
  // 重启应用 - 使用标准的 Electron 重启方式
  app.relaunch();
  app.exit(0);
});

ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
  try {
    const oldDir = getSystemDir();
    if (oldDir.cacheDir !== cacheDir) {
      await copyDirectoryRecursively(oldDir.cacheDir, cacheDir);
    }
    await ProcessEnv.set('aionui.dir', { cacheDir, workDir });
    return { success: true };
  } catch (e) {
    return { success: false, msg: e.message || e.toString() };
  }
});

ipcBridge.geminiConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
  const task = WorkerManage.getTaskById(conversation_id) as GeminiAgentManager;
  if (!task) return { success: false, msg: 'conversation not found' };

  // Handle files for both Gemini and ACP tasks
  if (files) {
    for (const file of files) {
      const fileName = path.basename(file);
      const workspace = (task as any).workspace || process.cwd();
      const destPath = path.join(workspace, fileName);
      await fs.copyFile(file, destPath);
    }
  }

  // Support Gemini tasks only, ACP has its own provider
  if ((task as any).type === 'gemini' || (task as any).type === 'gemini2') {
    return (task as GeminiAgentManager)
      .sendMessage(other)
      .then(() => ({ success: true }))
      .catch((err) => {
        return { success: false, msg: err };
      });
  }

  return { success: false, msg: 'unsupported task type for Gemini provider' };
});

// ACP 专用的 sendMessage provider
ipcBridge.acpConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
  let task = WorkerManage.getTaskById(conversation_id);
  if (!task) {
    // Try to find the conversation in chat history and recreate the task
    const history = await ProcessChat.get('chat.history');
    const conversation = history?.find((conv) => conv.id === conversation_id);

    if (conversation && conversation.type === 'acp') {
      // Recreate the ACP task
      const config = {
        id: conversation.id,
        name: conversation.name,
        backend: conversation.extra?.backend || 'claude',
        cliPath: conversation.extra?.cliPath,
        workingDir: conversation.extra?.workspace || process.cwd(),
      };

      const newTask = new AcpAgentTask(config);

      // ACP messages are handled directly in AcpAgentTask

      // Add to WorkerManage
      WorkerManage.addTask(conversation.id, newTask);

      // Start the task
      try {
        await newTask.start();
        task = newTask;
      } catch (error) {
        return { success: false, msg: 'failed to recreate task: ' + error };
      }
    } else {
      return { success: false, msg: 'conversation not found in history' };
    }
  }

  // Handle files for ACP tasks
  if (files) {
    for (const file of files) {
      const fileName = path.basename(file);
      const workspace = (task as any).workspace || process.cwd();
      const destPath = path.join(workspace, fileName);
      await fs.copyFile(file, destPath);
    }
  }

  // Support ACP tasks only
  if ((task as any).type === 'acp') {
    return (task as unknown as AcpAgentTask)
      .sendMessage({ content: other.input, files, msg_id: other.msg_id })
      .then(() => ({ success: true }))
      .catch((err) => {
        return { success: false, msg: err };
      });
  }

  return { success: false, msg: 'unsupported task type for ACP provider' };
});
ipcBridge.geminiConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
  const task: GeminiAgentManager = WorkerManage.getTaskById(conversation_id) as any;
  if (!task) return { success: false, msg: 'conversation not found' };
  if ((task as any).type !== 'gemini' && (task as any).type !== 'gemini2') return { success: false, msg: 'not support' };
  return (task as GeminiAgentManager)
    .confirmMessage({ confirmKey, msg_id, callId })
    .then(() => ({ success: true }))
    .catch((err) => {
      return { success: false, msg: err };
    });
});

ipcBridge.acpConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
  const task = WorkerManage.getTaskById(conversation_id);
  if (!task) {
    return { success: false, msg: 'conversation not found' };
  }
  
  if ((task as any).type !== 'acp') {
    return { success: false, msg: 'not support' };
  }
  
  return (task as unknown as AcpAgentTask)
    .confirmMessage({ confirmKey, msg_id, callId })
    .then(() => ({ success: true }))
    .catch((err) => ({ success: false, msg: err }));
});

// Debug provider to check environment variables
ipcBridge.acpConversation.checkEnv.provider(async () => {
  return {
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[SET]' : '[NOT SET]',
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? '[SET]' : '[NOT SET]',
      NODE_ENV: process.env.NODE_ENV || '[NOT SET]',
    },
  };
});

// Force clear all ACP and Google auth cache - temporarily commented out
/*
// @ts-expect-error - temporary fix for type issue
ipcBridge.acpConversation.clearAllCache?.provider(async () => {
  try {
    // Clear ACP config cache
    await AcpConfigManager.clearAllConfig();
    
    // Clear Google OAuth cache
    const oauthResult = await clearCachedCredentialFile();
    
    return { 
      success: true, 
      msg: 'All cache cleared successfully',
      details: { oauthResult }
    };
  } catch (error) {
    return { 
      success: false, 
      msg: error instanceof Error ? error.message : String(error) 
    };
  }
});
*/

ipcBridge.acpConversation.detectCliPath.provider(async ({ backend }) => {
  const { execSync } = await import('child_process');
  try {
    const isWindows = process.platform === 'win32';
    let command: string;

    if (backend === 'claude') {
      command = isWindows ? 'where claude' : 'which claude';
    } else if (backend === 'gemini') {
      command = isWindows ? 'where gemini' : 'which gemini';
    } else {
      return { success: false, msg: `Unsupported backend: ${backend}` };
    }

    let cliPath = execSync(command, { encoding: 'utf-8' }).trim();

    // Windows의 where 명령어는 여러 줄을 반환할 수 있음, 첫 번째 줄 사용
    if (isWindows && cliPath.includes('\n')) {
      cliPath = cliPath.split('\n')[0].trim();
    }

    return { success: true, data: { path: cliPath } };
  } catch (error) {
    return { success: false, msg: error instanceof Error ? error.message : String(error) };
  }
});

ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
  const task = WorkerManage.getTaskById(conversation_id);
  if (!task) return { success: true, msg: 'conversation not found' };
  if ((task as any).type !== 'gemini' && (task as any).type !== 'gemini2' && (task as any).type !== 'acp') return { success: false, msg: 'not support' };
  return (task as any).stop().then(() => ({ success: true }));
});

ipcBridge.geminiConversation.getWorkspace.provider(async ({ workspace }) => {
  const task = WorkerManage.getTaskById(generateHashWithFullName(workspace));
  if (!task || ((task as any).type !== 'gemini' && (task as any).type !== 'gemini2')) return [];
  return task.postMessagePromise('gemini.get.workspace', {}).then((res: any) => {
    return res;
  });
});

// ACP 的 getWorkspace 实现
ipcBridge.acpConversation.getWorkspace.provider(async ({ workspace }) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // 检查目录是否存在
    if (!fs.existsSync(workspace)) {
      return [];
    }
    
    // 读取目录内容
    const buildFileTree = (dirPath: string, basePath: string = dirPath): any[] => {
      const result = [];
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        // 跳过隐藏文件和系统文件
        if (item.startsWith('.')) continue;
        if (item === 'node_modules') continue;
        
        const itemPath = path.join(dirPath, item);
        const relativePath = path.relative(basePath, itemPath);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          const children = buildFileTree(itemPath, basePath);
          if (children.length > 0) {
            result.push({
              name: item,
              path: relativePath,
              isDir: true,
              isFile: false,
              children
            });
          }
        } else {
          result.push({
            name: item,
            path: relativePath,
            isDir: false,
            isFile: true
          });
        }
      }
      
      return result.sort((a, b) => {
        // 目录优先，然后按名称排序
        if (a.isDir && b.isFile) return -1;
        if (a.isFile && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    };
    
    const files = buildFileTree(workspace);
    
    // 返回的格式需要与 gemini 保持一致
    const result = [{
      name: path.basename(workspace),
      path: workspace,
      isDir: true,
      isFile: false,
      children: files
    }];
    
    return result;
    
  } catch (error) {
    return [];
  }
});

ipcBridge.googleAuth.status.provider(async ({ proxy }) => {
  try {
    const info = await getOauthInfoWithCache(proxy);

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
  
  if (client) {
    // After successful login, get the actual account info
    try {
      const oauthInfo = await getOauthInfoWithCache(proxy);
      if (oauthInfo && oauthInfo.email) {
        return { success: true, data: { account: oauthInfo.email } };
      }
    } catch (_error) {
      // Even if we can't get the email, login was successful
    }
    return { success: true, data: { account: '' } };
  }
  return { success: false };
});

ipcBridge.googleAuth.logout.provider(async ({}) => {
  return clearCachedCredentialFile();
});

ipcBridge.mode.fetchModelList.provider(async function fetchModelList({ base_url, api_key, try_fix }): Promise<{ success: boolean; msg?: string; data?: { mode: Array<string>; fix_base_url?: string } }> {
  const openai = new OpenAI({
    baseURL: base_url,
    apiKey: api_key,
  });

  try {
    const res = await openai.models.list();
    // 检查返回的数据是否有效 lms 获取失败时仍然会返回有效空数据
    if (res.data?.length === 0) {
      throw new Error('Invalid response: empty data');
    }
    return { success: true, data: { mode: res.data.map((v) => v.id) } };
  } catch (e) {
    const errRes = { success: false, msg: e.message || e.toString() };

    if (!try_fix) return errRes;

    // 如果是API key问题，直接返回错误，不尝试修复URL
    if (e.status === 401 || e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('Invalid API key')) {
      return errRes;
    }

    const url = new URL(base_url);
    const fixedBaseUrl = `${url.protocol}//${url.host}/v1`;

    if (fixedBaseUrl === base_url) return errRes;

    const retryRes = await fetchModelList({ base_url: fixedBaseUrl, api_key: api_key, try_fix: false });
    if (retryRes.success) {
      return { ...retryRes, data: { mode: retryRes.data.mode, fix_base_url: fixedBaseUrl } };
    }
    return retryRes;
  }
});

ipcBridge.mode.saveModelConfig.provider((models) => {
  return ProcessConfig.set('model.config', models)
    .then(() => {
      return { success: true };
    })
    .catch((e) => {
      return { success: false, msg: e.message || e.toString() };
    });
});

ipcBridge.mode.getModelConfig.provider(async () => {
  return ProcessConfig.get('model.config')
    .then((data) => {
      if (!data) return [];
      return data.map((v) => ({ ...v, id: v.id || uuid() }));
    })
    .catch(() => {
      return [] as IProvider[];
    });
});
