/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { HookManifest } from '@/common/types/hookTypes';
import fs from 'fs/promises';
import path from 'path';
import { getHooksDir } from '@process/utils/initStorage';

type HookRuntimeResult = {
  content: string;
  appliedHooks: string[];
};

const BEFORE_USER_PROMPT_EVENT = 'before_user_prompt';

const renderTemplate = (template: string, values: Record<string, string>): string => {
  let rendered = template;

  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }

  return rendered;
};

const getConversationExtra = (conversation: TChatConversation): Record<string, unknown> => {
  return (conversation.extra || {}) as Record<string, unknown>;
};

const getEnabledHooks = (conversation: TChatConversation): string[] => {
  const enabledHooks = getConversationExtra(conversation).enabledHooks;
  if (!Array.isArray(enabledHooks)) return [];

  return enabledHooks
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
};

const isSafeHookName = (hookName: string): boolean => {
  const trimmed = hookName.trim();
  return trimmed.length > 0 && path.basename(trimmed) === trimmed;
};

const resolveBackend = (conversation: TChatConversation): string => {
  const extra = getConversationExtra(conversation);

  switch (conversation.type) {
    case 'acp':
      return typeof extra.backend === 'string' ? extra.backend : 'acp';
    case 'openclaw-gateway':
      return typeof extra.backend === 'string' ? extra.backend : 'openclaw-gateway';
    default:
      return conversation.type;
  }
};

export class AssistantHookRuntime {
  async applyBeforeUserPrompt(conversation: TChatConversation, input: string): Promise<HookRuntimeResult> {
    const enabledHooks = [...new Set(getEnabledHooks(conversation))];
    if (enabledHooks.length === 0) {
      return { content: input, appliedHooks: [] };
    }

    let content = input;
    const appliedHooks: string[] = [];

    for (const hookName of enabledHooks) {
      // Hooks must run in selection order because each transform consumes the previous output.
      // eslint-disable-next-line no-await-in-loop
      const transformed = await this.applyPromptTransformHook(conversation, hookName, content);
      if (!transformed) continue;

      content = transformed;
      appliedHooks.push(hookName);
    }

    return { content, appliedHooks };
  }

  private async applyPromptTransformHook(
    conversation: TChatConversation,
    hookName: string,
    input: string
  ): Promise<string | null> {
    if (!isSafeHookName(hookName)) {
      console.warn(`[AssistantHookRuntime] Skip unsafe hook name: ${hookName}`);
      return null;
    }

    const hookDir = path.join(getHooksDir(), hookName);
    const manifest = await this.readHookManifest(hookDir);
    if (!manifest) return null;

    if (manifest.executionType !== 'prompt-transform') return null;
    if (!manifest.events?.includes(BEFORE_USER_PROMPT_EVENT)) return null;

    const backend = resolveBackend(conversation);
    if (
      Array.isArray(manifest.supportedBackends) &&
      manifest.supportedBackends.length > 0 &&
      !manifest.supportedBackends.includes(backend)
    ) {
      return null;
    }

    const template = await this.readPromptTemplate(hookDir);
    if (!template) {
      console.warn(`[AssistantHookRuntime] Missing prompt template for hook: ${hookName}`);
      return null;
    }

    const extra = getConversationExtra(conversation);
    const rendered = renderTemplate(template, {
      userPrompt: input,
      conversationId: conversation.id,
      workspace: typeof extra.workspace === 'string' ? extra.workspace : '',
      agentType: backend,
      backend,
      hookName,
      timestamp: new Date().toISOString(),
    }).trim();

    if (!rendered) return null;

    if (template.includes('{{userPrompt}}')) {
      return rendered;
    }

    return `${rendered}\n\n[User Request]\n${input}`;
  }

  private async readHookManifest(hookDir: string): Promise<HookManifest | null> {
    try {
      const content = await fs.readFile(path.join(hookDir, 'manifest.json'), 'utf-8');
      return JSON.parse(content) as HookManifest;
    } catch {
      return null;
    }
  }

  private async readPromptTemplate(hookDir: string): Promise<string | null> {
    const [eventTemplate, defaultTemplate] = await Promise.allSettled([
      fs.readFile(path.join(hookDir, 'before_user_prompt.md'), 'utf-8'),
      fs.readFile(path.join(hookDir, 'prompt.md'), 'utf-8'),
    ]);

    if (eventTemplate.status === 'fulfilled') {
      return eventTemplate.value;
    }

    if (defaultTemplate.status === 'fulfilled') {
      return defaultTemplate.value;
    }

    return null;
  }
}
