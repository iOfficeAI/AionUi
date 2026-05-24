/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isCodexNoSandboxMode } from '@/common/types/codex/codexModes';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import { readFileSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, posix, win32 } from 'path';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type SupportedCodexSandboxMode = 'workspace-write' | 'danger-full-access';

const isWindowsStylePath = (value: string): boolean => /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');

const getCodexPathApi = (baseDirectory: string) =>
  process.platform === 'win32' || isWindowsStylePath(baseDirectory) ? win32 : posix;

export function normalizeCodexSandboxMode(sandboxMode?: CodexSandboxMode | null): SupportedCodexSandboxMode {
  return sandboxMode === 'danger-full-access' ? 'danger-full-access' : 'workspace-write';
}

export function getCodexSandboxModeForSessionMode(
  mode?: string | null,
  fallbackMode?: CodexSandboxMode | null
): SupportedCodexSandboxMode {
  if (mode) {
    return isCodexNoSandboxMode(mode) ? 'danger-full-access' : 'workspace-write';
  }

  return normalizeCodexSandboxMode(fallbackMode);
}

export function getCodexConfigPath(): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    return getCodexPathApi(codexHome).join(codexHome, 'config.toml');
  }

  const homeDirectory = homedir();
  return getCodexPathApi(homeDirectory).join(homeDirectory, '.codex', 'config.toml');
}

function stripInlineComment(value: string): string {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === '\\') {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }
    if (char === '#' && !quote) {
      return value.slice(0, i).trim();
    }
  }
  return value.trim();
}

function parseTomlScalar(value: string): string | undefined {
  const trimmed = stripInlineComment(value);
  if (!trimmed) return undefined;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseCodexConfiguredModel(text: string): { model: string; providerId?: string; providerName?: string } | null {
  let section: string | null = null;
  let model: string | undefined;
  let providerId: string | undefined;
  const providerNames = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex < 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = parseTomlScalar(line.slice(eqIndex + 1));
    if (!value) continue;

    if (!section) {
      if (key === 'model') model = value;
      if (key === 'model_provider') providerId = value;
      continue;
    }

    if (key === 'name' && section.startsWith('model_providers.')) {
      const id = section.slice('model_providers.'.length).replace(/^["']|["']$/g, '');
      providerNames.set(id, value);
    }
  }

  if (!model) return null;
  return { model, providerId, providerName: providerId ? providerNames.get(providerId) : undefined };
}

export function readCodexConfiguredModelInfo(): AcpModelInfo | null {
  let content: string;
  try {
    content = readFileSync(getCodexConfigPath(), 'utf8');
  } catch {
    return null;
  }

  const configured = parseCodexConfiguredModel(content);
  if (!configured) return null;
  const label =
    configured.providerName && configured.providerName !== configured.providerId
      ? `${configured.model} (${configured.providerName})`
      : configured.model;

  return {
    source: 'models',
    sourceDetail: 'persisted-model',
    currentModelId: configured.model,
    currentModelLabel: label,
    availableModels: [{ id: configured.model, label }],
    canSwitch: true,
  };
}

export function mergeCodexConfiguredModelInfo(
  modelInfo: AcpModelInfo | null,
  preferConfiguredCurrent = false
): AcpModelInfo | null {
  const configured = readCodexConfiguredModelInfo();
  if (!configured) return modelInfo;
  if (!modelInfo) return configured;

  const configuredModel = configured.availableModels[0];
  if (!configuredModel) return modelInfo;
  const models = [configuredModel, ...modelInfo.availableModels.filter((model) => model.id !== configuredModel.id)];
  const currentModelId = preferConfiguredCurrent ? configured.currentModelId : modelInfo.currentModelId;
  const currentModelLabel = preferConfiguredCurrent
    ? configured.currentModelLabel
    : models.find((model) => model.id === currentModelId)?.label || modelInfo.currentModelLabel || currentModelId;

  return {
    ...modelInfo,
    currentModelId,
    currentModelLabel,
    availableModels: models,
    canSwitch: models.length > 0,
  };
}

export async function writeCodexSandboxMode(sandboxMode: CodexSandboxMode): Promise<void> {
  const path = getCodexConfigPath();
  let content = '';

  try {
    content = await readFile(path, 'utf8');
  } catch {
    content = '';
  }

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const sandboxLine = `sandbox_mode = "${sandboxMode}"`;
  let nextContent: string;

  if (/^\s*sandbox_mode\s*=.*$/m.test(content)) {
    nextContent = content.replace(/^\s*sandbox_mode\s*=.*$/m, sandboxLine);
  } else {
    const sectionIndex = content.search(/^\s*\[/m);

    if (sectionIndex >= 0) {
      const prefix = content.slice(0, sectionIndex).trimEnd();
      const suffix = content.slice(sectionIndex);
      nextContent = prefix
        ? `${prefix}${newline}${sandboxLine}${newline}${newline}${suffix}`
        : `${sandboxLine}${newline}${newline}${suffix}`;
    } else if (content.trim().length > 0) {
      nextContent = `${content.trimEnd()}${newline}${sandboxLine}${newline}`;
    } else {
      nextContent = `${sandboxLine}${newline}`;
    }
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, nextContent, 'utf8');
}
