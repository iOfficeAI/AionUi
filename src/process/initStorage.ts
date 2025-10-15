/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync as _mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { application } from '../common/ipcBridge';
import type { IMcpServer } from '../common/storage';
import { ChatMessageStorage, ChatStorage, ConfigStorage, EnvStorage } from '../common/storage';
import { copyDirectoryRecursively, getConfigPath, getDataPath, getTempPath, verifyDirectoryFiles } from './utils';
import { getDatabase, getImageStorage } from './database/export';
// Platform and architecture types (moved from deleted updateConfig)
type PlatformType = 'win32' | 'darwin' | 'linux';
type ArchitectureType = 'x64' | 'arm64' | 'ia32' | 'arm';

const nodePath = path;

const getHomePage = getConfigPath;

const mkdirSync = (path: string) => {
  return _mkdirSync(path, { recursive: true });
};

/**
 * 迁移老版本数据从temp目录到userData/config目录
 */
const migrateLegacyData = async () => {
  const oldDir = getTempPath(); // 老的temp目录
  const newDir = getConfigPath(); // 新的userData/config目录

  try {
    // 检查新目录是否为空（不存在或者存在但无内容）
    const isNewDirEmpty =
      !existsSync(newDir) ||
      (() => {
        try {
          return existsSync(newDir) && readdirSync(newDir).length === 0;
        } catch (error) {
          console.warn('[AionUi] Warning: Could not read new directory during migration check:', error);
          return false; // 假设非空以避免迁移覆盖
        }
      })();

    // 检查迁移条件：老目录存在且新目录为空
    if (existsSync(oldDir) && isNewDirEmpty) {
      // 创建目标目录
      mkdirSync(newDir);

      // 复制所有文件和文件夹
      await copyDirectoryRecursively(oldDir, newDir);

      // 验证迁移是否成功
      const isVerified = await verifyDirectoryFiles(oldDir, newDir);
      if (isVerified) {
        // 确保不会删除相同的目录
        if (path.resolve(oldDir) !== path.resolve(newDir)) {
          try {
            await fs.rm(oldDir, { recursive: true });
          } catch (cleanupError) {
            console.warn('[AionUi] 原目录清理失败，请手动删除:', oldDir, cleanupError);
          }
        }
      }

      return true;
    }
  } catch (error) {
    console.error('[AionUi] 数据迁移失败:', error);
  }

  return false;
};

const WriteFile = (path: string, data: string) => {
  return fs.writeFile(path, data);
};

const ReadFile = (path: string) => {
  return fs.readFile(path);
};

const RmFile = (path: string) => {
  return fs.rm(path, { recursive: true });
};

const CopyFile = (src: string, dest: string) => {
  return fs.copyFile(src, dest);
};

const FileBuilder = (file: string) => {
  const stack: (() => Promise<unknown>)[] = [];
  let isRunning = false;
  const run = () => {
    if (isRunning || !stack.length) return;
    isRunning = true;
    void stack
      .shift()?.()
      .finally(() => {
        isRunning = false;
        run();
      });
  };
  const pushStack = <R>(fn: () => Promise<R>) => {
    return new Promise<R>((resolve, reject) => {
      stack.push(() => fn().then(resolve).catch(reject));
      run();
    });
  };
  return {
    path: file,
    write(data: string) {
      return pushStack(() => WriteFile(file, data));
    },
    read() {
      return pushStack(() =>
        ReadFile(file).then((data) => {
          return data.toString();
        })
      );
    },
    copy(dist: string) {
      return pushStack(() => CopyFile(file, dist));
    },
    rm() {
      return pushStack(() => RmFile(file));
    },
  };
};

const JsonFileBuilder = <S extends Record<string, any>>(path: string) => {
  const file = FileBuilder(path);
  const encode = (data: unknown) => {
    return btoa(encodeURIComponent(String(data)));
  };

  const decode = (base64: string) => {
    return decodeURIComponent(atob(base64));
  };

  const toJson = async (): Promise<S> => {
    try {
      const result = await file.read();
      if (!result) return {} as S;

      // 验证文件内容不为空且不是损坏的base64
      if (result.trim() === '') {
        console.warn(`[Storage] Empty file detected: ${path}`);
        return {} as S;
      }

      const decoded = decode(result);
      if (!decoded || decoded.trim() === '') {
        console.warn(`[Storage] Empty or corrupted content after decode: ${path}`);
        return {} as S;
      }

      const parsed = JSON.parse(decoded) as S;

      // 额外验证：如果是聊天历史文件且解析结果为空对象，警告用户
      if (path.includes('chat.txt') && Object.keys(parsed).length === 0) {
        console.warn(`[Storage] Chat history file appears to be empty: ${path}`);
      }

      return parsed;
    } catch (e) {
      // console.error(`[Storage] Error reading/parsing file ${path}:`, e);
      return {} as S;
    }
  };

  const setJson = async (data: any): Promise<any> => {
    try {
      await file.write(encode(JSON.stringify(data)));
      return data;
    } catch (e) {
      return Promise.reject(e);
    }
  };

  const toJsonSync = (): S => {
    try {
      return JSON.parse(decode(readFileSync(path).toString())) as S;
    } catch (e) {
      return {} as S;
    }
  };

  return {
    toJson,
    setJson,
    toJsonSync,
    async set<K extends keyof S>(key: K, value: S[K]): Promise<S[K]> {
      const data = await toJson();
      data[key] = value;
      await setJson(data);
      return value;
    },
    async get<K extends keyof S>(key: K): Promise<S[K]> {
      const data = await toJson();
      return Promise.resolve(data[key]);
    },
    async remove<K extends keyof S>(key: K) {
      const data = await toJson();
      delete data[key];
      return setJson(data);
    },
    clear() {
      return setJson({});
    },
    getSync<K extends keyof S>(key: K): S[K] {
      const data = toJsonSync();
      return data[key];
    },
    update<K extends keyof S>(key: K, updateFn: (value: S[K], data: S) => Promise<S[K]>) {
      return toJson().then((data) => {
        return updateFn(data[key], data).then((value) => {
          data[key] = value;
          return setJson(data);
        });
      });
    },
    backup(fullName: string) {
      const dir = nodePath.dirname(fullName);
      if (!existsSync(dir)) {
        mkdirSync(dir);
      }
      return file.copy(fullName).then(() => file.rm());
    },
  };
};

/**
 * 创建默认的 MCP 服务器配置 / Build default MCP server configuration
 */
const getDefaultMcpServers = (): IMcpServer[] => {
  const now = Date.now();
  const defaultConfig = {
    mcpServers: {
      'chrome-devtools': {
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp@latest'],
      },
    },
  };

  return Object.entries(defaultConfig.mcpServers).map(([name, config], index) => ({
    id: `mcp_default_${now}_${index}`,
    name,
    description: `Default MCP server: ${name}`,
    enabled: false, // 默认不启用，让用户手动开启
    transport: {
      type: 'stdio' as const,
      command: config.command,
      args: config.args,
    },
    createdAt: now,
    updatedAt: now,
    originalJson: JSON.stringify({ [name]: config }, null, 2),
  }));
};

const initStorage = async () => {
  console.log('[AionUi] Starting storage initialization...');

  // 1. 先执行数据迁移（在任何目录创建之前）
  await migrateLegacyData();

  // 2. 创建必要的目录（迁移后再创建，确保迁移能正常进行）
  if (!existsSync(getHomePage())) {
    mkdirSync(getHomePage());
  }
  if (!existsSync(getDataPath())) {
    mkdirSync(getDataPath());
  }

  // 3. 初始化数据库（better-sqlite3）
  try {
    const _db = getDatabase();
    const _imageStorage = getImageStorage();
    console.log('[AionUi] Database initialized');

    // 4. 初始化 MCP 配置（为所有用户提供默认配置）
    try {
      const existingMcpConfig = _db.getConfig('mcp.config');

      // 仅当配置不存在或为空时，写入默认值（适用于新用户和老用户）
      if (!existingMcpConfig.success || !existingMcpConfig.data || !Array.isArray(existingMcpConfig.data) || existingMcpConfig.data.length === 0) {
        const defaultServers = getDefaultMcpServers();
        _db.setConfig('mcp.config', defaultServers);
        console.log('[AionUi] Default MCP servers initialized');
      }
    } catch (error) {
      console.error('[AionUi] Failed to initialize default MCP servers:', error);
    }

    // 设置数据库存储拦截器（优先使用 SQLite）
    ConfigStorage.interceptor({
      get: (key: string) => {
        const result = _db.getConfig(key);
        return Promise.resolve(result.data);
      },
      set: (key: string, data: any) => {
        _db.setConfig(key, data);
        return Promise.resolve(data);
      },
    });

    ChatStorage.interceptor({
      get: (key: string) => {
        if (key === 'chat.history') {
          const result = _db.getUserConversations(undefined, 0, 1000);
          return Promise.resolve(result.data || []);
        }
        return Promise.resolve(undefined);
      },
      set: (key: string, data: any) => {
        console.log('[AionUi] ChatStorage.set is deprecated, use database API instead');
        return Promise.resolve(data);
      },
    });

    ChatMessageStorage.interceptor({
      get: (key: string) => {
        const result = _db.getConversationMessages(key, 0, 1000);
        return Promise.resolve(result.data || []);
      },
      set: (key: string, data: any) => {
        console.log('[AionUi] ChatMessageStorage.set is deprecated, use database API instead');
        return Promise.resolve(data);
      },
    });

    EnvStorage.interceptor({
      get: (key: string) => {
        const result = _db.getConfig(`env.${key}`);
        return Promise.resolve(result.data);
      },
      set: (key: string, data: any) => {
        _db.setConfig(`env.${key}`, data);
        return Promise.resolve(data);
      },
    });

    console.log('[AionUi] ✓ Storage interceptors configured to use SQLite');
  } catch (error) {
    console.error('[InitStorage] Database initialization failed:', error);
    throw error;
  }

  application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });
};

const getDbInstance = () => getDatabase();

export const ProcessConfig = {
  get<T = unknown>(key: string): Promise<T | undefined> {
    const result = getDbInstance().getConfig(key);
    if (!result.success) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(result.data as T);
  },
  set<T = unknown>(key: string, value: T): Promise<T> {
    getDbInstance().setConfig(key, value as any);
    return Promise.resolve(value);
  },
};

export const ProcessEnv = {
  get<T = unknown>(key: string): Promise<T | undefined> {
    const result = getDbInstance().getConfig(`env.${key}`);
    if (!result.success) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(result.data as T);
  },
  set<T = unknown>(key: string, value: T): Promise<T> {
    getDbInstance().setConfig(`env.${key}`, value as any);
    return Promise.resolve(value);
  },
};

export const getSystemDir = () => {
  try {
    const db = getDatabase();
    const envConfig = db.getConfig('env.aionui.dir');
    const dir = envConfig.success ? (envConfig.data as { cacheDir?: string; workDir?: string } | undefined) : undefined;

    return {
      cacheDir: dir?.cacheDir || getConfigPath(),
      workDir: dir?.workDir || getDataPath(),
      platform: process.platform as PlatformType,
      arch: process.arch as ArchitectureType,
    };
  } catch (error) {
    console.warn('[AionUi] Failed to resolve system directory from database:', error);
    return {
      cacheDir: getConfigPath(),
      workDir: getDataPath(),
      platform: process.platform as PlatformType,
      arch: process.arch as ArchitectureType,
    };
  }
};

export default initStorage;
