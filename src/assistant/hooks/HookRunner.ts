/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { copyDirectoryRecursively } from '@/process/utils';
import { getSkillsDir } from '@/process/initStorage';
import { loadHookModules } from './ModuleLoader';
import { executeHooks } from './HookExecutor';
import type { ExecuteHooksResult } from './HookExecutor';
import type { HookEvent, HookContext, HookUtils } from './types';
import { conversation, preview } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';

/**
 * Create utility functions for hooks
 */
export function createHookUtils(): HookUtils {
  const utils: HookUtils = {
    copyDirectory: async (source, target, options) => {
      await copyDirectoryRecursively(source, target, options);
    },
    readFile: async (filePath, encoding = 'utf-8') => {
      return await fs.promises.readFile(filePath, encoding);
    },
    writeFile: async (filePath, content, encoding = 'utf-8') => {
      await fs.promises.writeFile(filePath, content, encoding);
    },
    exists: async (filePath) => {
      try {
        await fs.promises.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    ensureDir: async (dirPath) => {
      await fs.promises.mkdir(dirPath, { recursive: true });
    },
    join: (...paths) => path.join(...paths),
    symlinkSkill: async (skillName, targetDir) => {
      const skillsSourceDir = getSkillsDir();
      const sourcePath = path.join(skillsSourceDir, skillName);
      const targetPath = path.join(targetDir, skillName);

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Skill ${skillName} not found in ${skillsSourceDir}`);
      }

      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }

      try {
        if (process.platform === 'win32') {
          fs.symlinkSync(sourcePath, targetPath, 'junction');
        } else {
          fs.symlinkSync(sourcePath, targetPath);
        }
      } catch (error) {
        throw new Error(`Failed to symlink skill ${skillName}: ${error.message}`);
      }
    },
    readSkillContent: async (skillName) => {
      const skillsSourceDir = getSkillsDir();
      const skillPath = path.join(skillsSourceDir, skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        throw new Error(`Skill file not found: ${skillPath}`);
      }
      return fs.readFileSync(skillPath, 'utf-8');
    },
    getSkillMetadata: async (skillName) => {
      const content = await utils.readSkillContent(skillName);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return { name: skillName, description: '' };
      }
      const frontmatter = frontmatterMatch[1];
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      return {
        name: nameMatch ? nameMatch[1].trim() : skillName,
        description: descMatch ? descMatch[1].trim() : '',
      };
    },
  };
  return utils;
}

/**
 * Create emitMessage function for hooks to send progress/status to UI
 */
function createEmitMessage(conversationId?: string) {
  return (message: { content: string; type?: 'info' | 'warning' | 'error' | 'success'; category?: string }) => {
    if (!conversationId) {
      // No conversation yet, log to console
      console.log(`[Hook Message] ${message.content}`);
      return;
    }

    // Emit directly to conversation UI via IPC
    conversation.responseStream.emit({
      type: 'system_message',
      conversation_id: conversationId,
      msg_id: uuid(),
      data: {
        content: message.content,
        messageType: message.type || 'info',
        category: message.category || 'hook',
      },
      timestamp: Date.now(),
    });
  };
}

/**
 * Create openPreview function for hooks to open the preview sidebar
 */
function createOpenPreview() {
  return (options: { content: string; contentType: 'html' | 'markdown' | 'code' | 'url'; title?: string; fileName?: string }) => {
    preview.open.emit({
      content: options.content,
      contentType: options.contentType,
      metadata: {
        title: options.title,
        fileName: options.fileName,
      },
    });
  };
}

/**
 * Run hooks for assistant-level customization
 *
 * Hook modules are loaded from:
 * - {assistantPath}/hooks/*.js (assistant-level)
 * - {workspace}/hooks/*.js (workspace-level fallback)
 *
 * Each module exports an object with event handlers:
 *   module.exports = {
 *     onSendMessage: { handler: (ctx) => {...}, priority: 10 },
 *     onWorkspaceInit: (ctx) => {...}  // Shorthand
 *   };
 *
 * @param event - The hook event (e.g., 'onSendMessage')
 * @param context - Hook context object
 * @returns ExecuteHooksResult with transformed content and accumulated queueMessages
 */
export async function runHooks(event: HookEvent, context: Partial<HookContext>): Promise<ExecuteHooksResult> {
  const noop = () => {};
  const hooksDir = context.assistantPath ? path.join(context.assistantPath, 'hooks') : context.workspace ? path.join(context.workspace, 'hooks') : undefined;

  if (!hooksDir || !fs.existsSync(hooksDir)) {
    return { content: context.content, queueMessages: [] };
  }

  const hookModules = loadHookModules(hooksDir);
  if (hookModules.length === 0) {
    return { content: context.content, queueMessages: [] };
  }

  const fullContext: HookContext = {
    event,
    workspace: context.workspace!,
    utils: createHookUtils(),
    enabledSkills: [],
    skillsSourceDir: getSkillsDir(),
    enqueue: noop,
    emitMessage: createEmitMessage(context.conversationId),
    openPreview: createOpenPreview(),
    ...context,
  };

  return await executeHooks(event, fullContext, hookModules);
}
