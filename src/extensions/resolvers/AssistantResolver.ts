/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension, ExtAssistant } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';
import { toAssetUrl } from '../protocol/assetProtocol';

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
        console.warn(
          `[Extensions] Failed to resolve assistant "${assistant.id}" from ${ext.manifest.name}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }
  return assistants;
}

/**
 * Resolve agents — structurally identical to assistants but sourced from `contributes.agents`.
 * Agents represent autonomous agent presets (e.g. leis, openfang, opencode style).
 */
export async function resolveAgents(extensions: LoadedExtension[]): Promise<Record<string, unknown>[]> {
  const agents: Record<string, unknown>[] = [];
  for (const ext of extensions) {
    const declaredAgents = ext.manifest.contributes.agents;
    if (!declaredAgents || declaredAgents.length === 0) continue;
    for (const agent of declaredAgents) {
      try {
        const config = await convertAssistant(agent, ext, 'agent');
        agents.push(config);
      } catch (error) {
        console.warn(
          `[Extensions] Failed to resolve agent "${agent.id}" from ${ext.manifest.name}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }
  return agents;
}

async function convertAssistant(
  assistant: ExtAssistant,
  ext: LoadedExtension,
  kind: 'assistant' | 'agent' = 'assistant'
): Promise<Record<string, unknown>> {
  const context = await readContextFile(assistant.contextFile, ext.directory);

  return {
    id: `ext-${assistant.id}`,
    name: assistant.name,
    description: assistant.description,
    avatar: assistant.avatar ? resolveIconPath(assistant.avatar, ext.directory) : undefined,
    presetAgentType: assistant.presetAgentType,
    context: context || '',
    models: assistant.models,
    enabledSkills: assistant.enabledSkills,
    prompts: assistant.prompts,
    isPreset: true,
    isBuiltin: false,
    enabled: true,
    _source: 'extension',
    _extensionName: ext.manifest.name,
    _kind: kind,
  };
}

async function readContextFile(relativePath: string, extensionDir: string): Promise<string | null> {
  const absolutePath = path.resolve(extensionDir, relativePath);
  if (!isPathWithinDirectory(absolutePath, extensionDir)) {
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
    console.warn(
      `[Extensions] Failed to read context file ${absolutePath}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function resolveIconPath(icon: string, extensionDir: string): string | undefined {
  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon;
  if (!icon.includes('/') && !icon.includes('\\') && !icon.includes('.')) return icon;
  const absPath = path.isAbsolute(icon) ? icon : path.resolve(extensionDir, icon);
  if (!isPathWithinDirectory(absPath, extensionDir)) {
    console.warn(`[Extensions] Assistant icon path traversal attempt: ${icon}`);
    return undefined;
  }
  return toAssetUrl(absPath);
}
