/**
 * WebUI config I/O — JSON persistence at userDataPath/webui.config.json.
 *
 * Intentionally atomic: write to a .tmp sibling then rename. Prevents
 * corruption if the process is killed mid-write.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppMetadata, WebUIConfig } from '../types.js';

const CONFIG_FILE_NAME = 'webui.config.json';
const DEFAULT_ADMIN_USERNAME = 'admin';

function resolveConfigPath(app: AppMetadata): string {
  return path.join(app.userDataPath, CONFIG_FILE_NAME);
}

function defaultConfig(): WebUIConfig {
  return {
    passwordHash: '',
    adminUsername: DEFAULT_ADMIN_USERNAME,
  };
}

/**
 * Read webui.config.json. Returns a default config (empty passwordHash,
 * adminUsername='admin') when the file is missing or unparseable.
 * Missing-or-corrupt semantics match legacy webserver's tolerance.
 */
export async function readConfig(app: AppMetadata): Promise<WebUIConfig> {
  const filePath = resolveConfigPath(app);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig();
    throw err;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaultConfig();
    const obj = parsed as Partial<WebUIConfig>;
    return {
      passwordHash: typeof obj.passwordHash === 'string' ? obj.passwordHash : '',
      adminUsername:
        typeof obj.adminUsername === 'string' && obj.adminUsername.length > 0
          ? obj.adminUsername
          : DEFAULT_ADMIN_USERNAME,
      port: typeof obj.port === 'number' ? obj.port : undefined,
      allowRemote: typeof obj.allowRemote === 'boolean' ? obj.allowRemote : undefined,
      passwordUpdatedAt:
        typeof obj.passwordUpdatedAt === 'string' ? obj.passwordUpdatedAt : undefined,
    };
  } catch {
    return defaultConfig();
  }
}

/**
 * Atomic write: userDataPath/webui.config.json.
 * Creates userDataPath if it doesn't exist.
 */
export async function writeConfig(app: AppMetadata, config: WebUIConfig): Promise<void> {
  const filePath = resolveConfigPath(app);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const payload = JSON.stringify(config, null, 2) + '\n';
  await fs.writeFile(tmpPath, payload, { encoding: 'utf-8', mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}
