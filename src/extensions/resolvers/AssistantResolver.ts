/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension, ExtAssistant } from '../types';

export async function resolveAssistants(extensions: LoadedExtension[]): Promise<Record<string, unknown>[]> {
  const assistants: Record<string, unknown>[] = [];
  for (const ext of extensions) {
    const declaredAssistants = ext.manifest.contributes.assistants;
    if (!declaredAssistants || declaredAssistants.length === 0) continue;
    for (const assistant of declaredAssistants) {
      try {
        const config = await convertAssistant(assistant, ext);
        assistants.push(config);
      } catch (error) {
        console.warn(`[Extensions] Failed to resolve assistant "${assistant.id}" from ${ext.manifest.name}:`, error instanceof Error ? error.message : error);
      }
    }
  }
  return assistants;
}

async function convertAssistant(assistant: ExtAssistant, ext: LoadedExtension): Promise<Record<string, unknown>> {
  const context = await readContextFile(assistant.contextFile, ext.directory);
  let contextI18n: Record<string, string> | undefined;

  if (assistant.contextFileI18n) {
    contextI18n = {};
    for (const [locale, filePath] of Object.entries(assistant.contextFileI18n)) {
      const content = await readContextFile(filePath, ext.directory);
      if (content) {
        contextI18n[locale] = content;
      }
    }
    if (Object.keys(contextI18n).length === 0) {
      contextI18n = undefined;
    }
  }

  return {
    id: `ext-${assistant.id}`,
    name: assistant.name,
    nameI18n: assistant.nameI18n,
    description: assistant.description,
    descriptionI18n: assistant.descriptionI18n,
    avatar: assistant.avatar ? resolveIconPath(assistant.avatar, ext.directory) : undefined,
    presetAgentType: assistant.presetAgentType,
    context: context || '',
    contextI18n,
    models: assistant.models,
    enabledSkills: assistant.enabledSkills,
    prompts: assistant.prompts,
    promptsI18n: assistant.promptsI18n,
    isPreset: true,
    isBuiltin: false,
    enabled: true,
    _source: 'extension',
    _extensionName: ext.manifest.name,
  };
}

async function readContextFile(relativePath: string, extensionDir: string): Promise<string | null> {
  const absolutePath = path.resolve(extensionDir, relativePath);
  if (!absolutePath.startsWith(extensionDir)) {
    console.warn(`[Extensions] Context file path traversal attempt: ${relativePath}`);
    return null;
  }
  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Context file not found: ${absolutePath}`);
    return null;
  }
  try {
    return await fs.readFile(absolutePath, 'utf-8');
  } catch (error) {
    console.warn(`[Extensions] Failed to read context file ${absolutePath}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function resolveIconPath(icon: string, extensionDir: string): string {
  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon;
  if (!icon.includes('/') && !icon.includes('\\') && !icon.includes('.')) return icon;
  const absPath = path.isAbsolute(icon) ? icon : path.resolve(extensionDir, icon);
  return `file://${absPath.replace(/\\/g, '/')}`;
}
