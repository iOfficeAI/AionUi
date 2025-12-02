/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MCPServerConfig, GeminiCLIExtension } from '@office-ai/aioncli-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const EXTENSIONS_DIRECTORY_NAME = path.join('.gemini', 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

/**
 * 扩展配置文件结构（gemini-extension.json）
 * Extension config file structure (gemini-extension.json)
 */
interface ExtensionConfigFile {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

/**
 * 加载工作区和用户目录下的所有扩展
 * Load all extensions from workspace and user home directory
 */
export function loadExtensions(workspaceDir: string): GeminiCLIExtension[] {
  const allExtensions = [...loadExtensionsFromDir(workspaceDir), ...loadExtensionsFromDir(os.homedir())];

  const uniqueExtensions = new Map<string, GeminiCLIExtension>();
  for (const extension of allExtensions) {
    if (!uniqueExtensions.has(extension.name)) {
      uniqueExtensions.set(extension.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

function loadExtensionsFromDir(dir: string): GeminiCLIExtension[] {
  const extensionsDir = path.join(dir, EXTENSIONS_DIRECTORY_NAME);
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: GeminiCLIExtension[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    const extension = loadExtension(extensionDir);
    if (extension != null) {
      extensions.push(extension);
    }
  }
  return extensions;
}

function loadExtension(extensionDir: string): GeminiCLIExtension | null {
  if (!fs.statSync(extensionDir).isDirectory()) {
    console.error(`Warning: unexpected file ${extensionDir} in extensions directory.`);
    return null;
  }

  const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (!fs.existsSync(configFilePath)) {
    console.error(`Warning: extension directory ${extensionDir} does not contain a config file ${configFilePath}.`);
    return null;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = JSON.parse(configContent) as ExtensionConfigFile;
    if (!config.name || !config.version) {
      console.error(`Invalid extension config in ${configFilePath}: missing name or version.`);
      return null;
    }

    const contextFiles = getContextFileNames(config)
      .map((contextFileName) => path.join(extensionDir, contextFileName))
      .filter((contextFilePath) => fs.existsSync(contextFilePath));

    return {
      name: config.name,
      version: config.version,
      isActive: true, // 默认激活，后续由 annotateActiveExtensions 调整
      path: extensionDir,
      contextFiles,
      id: `${config.name}-${config.version}`,
      mcpServers: config.mcpServers,
      excludeTools: config.excludeTools,
    };
  } catch (e) {
    console.error(`Warning: error parsing extension config in ${configFilePath}: ${e}`);
    return null;
  }
}

function getContextFileNames(config: ExtensionConfigFile): string[] {
  if (!config.contextFileName) {
    return ['QWEN.md'];
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

/**
 * 根据启用的扩展名列表标记扩展的激活状态
 * Mark extension activation status based on enabled extension names list
 */
export function annotateActiveExtensions(extensions: GeminiCLIExtension[], enabledExtensionNames: string[]): GeminiCLIExtension[] {
  // 如果没有指定启用列表，所有扩展都激活
  if (enabledExtensionNames.length === 0) {
    return extensions.map((ext) => ({ ...ext, isActive: true }));
  }

  const lowerCaseEnabledExtensions = new Set(enabledExtensionNames.map((e) => e.trim().toLowerCase()));

  // 如果指定 'none'，禁用所有扩展
  if (lowerCaseEnabledExtensions.size === 1 && lowerCaseEnabledExtensions.has('none')) {
    return extensions.map((ext) => ({ ...ext, isActive: false }));
  }

  const notFoundNames = new Set(lowerCaseEnabledExtensions);

  const annotatedExtensions = extensions.map((extension) => {
    const lowerCaseName = extension.name.toLowerCase();
    const isActive = lowerCaseEnabledExtensions.has(lowerCaseName);

    if (isActive) {
      notFoundNames.delete(lowerCaseName);
    }

    return { ...extension, isActive };
  });

  for (const requestedName of notFoundNames) {
    console.error(`Extension not found: ${requestedName}`);
  }

  return annotatedExtensions;
}
