/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 解析应用内浏览器 MCP 该连接的 CDP 地址。
 *
 * 单独成文件是为了可测试：browserServer.ts 是个有顶层副作用的启动脚本（会 spawn
 * 子进程），没法直接在单测里 import。
 *
 * Resolves which CDP endpoint the in-app browser MCP should connect to. Kept in
 * its own module for testability: browserServer.ts is an entry script with
 * top-level side effects (it spawns a child), so it cannot be imported by tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CDP_HOST = '127.0.0.1';

/**
 * 多实例 CDP 注册表，由主进程写入。
 * Multi-instance CDP registry written by the main process.
 */
export const CDP_REGISTRY_FILE = path.join(os.homedir(), '.aionui-cdp-registry.json');

export type ResolveBrowserUrlDeps = {
  env: NodeJS.ProcessEnv;
  readRegistry?: () => string | null;
  isProcessAlive?: (pid: number) => boolean;
  onDiagnostic?: (message: string) => void;
};

const defaultReadRegistry = (): string | null => {
  try {
    if (!fs.existsSync(CDP_REGISTRY_FILE)) return null;
    return fs.readFileSync(CDP_REGISTRY_FILE, 'utf-8');
  } catch {
    return null;
  }
};

const defaultIsProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const toBrowserUrl = (port: number): string | null => {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return `http://${DEFAULT_CDP_HOST}:${port}`;
};

/**
 * 从注册表兜底解析端口。
 *
 * 只在恰好有一个存活实例时才使用：多开时无法判断该连哪一个，猜错会让 Agent
 * 操作另一个窗口 —— 那比直接报错更难排查。
 *
 * Fallback port resolution from the registry. Only used when exactly one live
 * instance exists: with several running there is no way to tell which one is
 * meant, and guessing would have the agent drive the wrong window — harder to
 * diagnose than a clean failure.
 */
const resolvePortFromRegistry = (
  readRegistry: () => string | null,
  isProcessAlive: (pid: number) => boolean
): number | null => {
  const raw = readRegistry();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const alive = parsed.filter(
      (entry): entry is { pid: number; port: number } =>
        typeof entry?.pid === 'number' && typeof entry?.port === 'number' && isProcessAlive(entry.pid)
    );

    if (alive.length !== 1) return null;
    return alive[0].port;
  } catch {
    return null;
  }
};

/**
 * 优先级：显式 URL > 环境变量端口 > 注册表中唯一存活实例。
 * 全部失败返回 null，调用方应当拒绝启动而不是让 MCP 自己开一个隐藏的 Chrome。
 *
 * Priority: explicit URL > env port > the single live registry instance. Returns
 * null when all fail; the caller must refuse to start rather than let the MCP
 * server spawn its own hidden Chrome.
 */
export const resolveBrowserUrl = (deps: ResolveBrowserUrlDeps): string | null => {
  const { env, readRegistry = defaultReadRegistry, isProcessAlive = defaultIsProcessAlive, onDiagnostic } = deps;

  const explicitUrl = env.AIONUI_CDP_BROWSER_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const rawPort = env.AIONUI_CDP_PORT?.trim();
  if (rawPort) {
    const fromEnv = toBrowserUrl(Number(rawPort));
    if (fromEnv) return fromEnv;
  }

  const registryPort = resolvePortFromRegistry(readRegistry, isProcessAlive);
  if (registryPort) {
    onDiagnostic?.('CDP port not in environment — resolved the single live instance from the registry.');
    return toBrowserUrl(registryPort);
  }

  return null;
};
