/**
 * Assistant Settings Migration — phase-1 governance E2E coverage.
 *
 * These tests exercise a real upgrade path:
 * 1. seed a legacy `aionui.db` using the pre-unification assistants schema
 * 2. start the current backend against that data dir
 * 3. verify phase-1 assistant fields and overlays are materialized correctly
 */
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MIGRATION_BACKEND_PORT = 25912;
const BUILTIN_ID = 'word-creator';
const LEGACY_USER_ID = 'legacy-phase1-user';
const LEGACY_PROMPT = 'Legacy prompt from previous versions';
const LEGACY_RULE = '# Legacy rule\n\nKeep this rule after upgrade.\n';

type AssistantListItem = {
  id: string;
  source: 'builtin' | 'user' | 'extension';
  name: string;
  description?: string;
  enabled: boolean;
  sort_order: number;
  preset_agent_type: string;
};

type AssistantDetail = {
  id: string;
  source: 'builtin' | 'user' | 'extension';
  profile: {
    name: string;
    description?: string;
  };
  state: {
    enabled: boolean;
    sort_order: number;
  };
  engine: {
    agent_backend: string;
  };
  rules: {
    content: string;
  };
  prompts: {
    recommended: string[];
  };
  defaults: {
    model: { mode: string; value?: string };
    permission: { mode: string; value?: string };
    skills: { mode: string; value: string[] };
    mcps: { mode: string; value: string[] };
  };
  capabilities: {
    default_skill_ids: string[];
    default_disabled_builtin_skill_ids: string[];
  };
  preferences: {
    last_model_id?: string;
    last_permission_value?: string;
    last_skill_ids: string[];
    last_disabled_builtin_skill_ids: string[];
    last_mcp_ids: string[];
  };
};

function resolveBackendBinary(): string {
  const projectRoot = process.cwd();
  const candidates = [
    process.env.AIONUI_BACKEND_BINARY,
    path.join(projectRoot, '../aionCore/target/debug/aioncore'),
    path.join(os.homedir(), '.cargo', 'bin', 'aioncore'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('aioncore binary not found for migration e2e');
}

function schemaPath(): string {
  return path.join(process.cwd(), '../aionCore/crates/aionui-db/migrations/001_initial_schema.sql');
}

function querySqliteValue(dataDir: string, sql: string): string {
  const dbPath = path.join(dataDir, 'aionui-backend.db');
  return execFileSync('sqlite3', ['-readonly', dbPath, sql], { encoding: 'utf8' }).trim();
}

function seedLegacyDatabase(dataDir: string): void {
  const legacyDbPath = path.join(dataDir, 'aionui.db');
  const schemaSql = fs.readFileSync(schemaPath(), 'utf8');
  execFileSync('sqlite3', [legacyDbPath], { input: schemaSql, encoding: 'utf8' });

  const seedSql = `
    INSERT INTO assistants (
      id, name, description, avatar, preset_agent_type,
      enabled_skills, custom_skill_names, disabled_builtin_skills,
      prompts, models, name_i18n, description_i18n, prompts_i18n,
      created_at, updated_at
    ) VALUES (
      '${LEGACY_USER_ID}',
      'Legacy Writer',
      'Migrated from legacy schema',
      '✍️',
      'aionrs',
      '["officecli-data-dashboard","officecli"]',
      '[]',
      '["cron"]',
      '["${LEGACY_PROMPT}"]',
      '[]',
      NULL,
      NULL,
      NULL,
      1000,
      1000
    );

    INSERT INTO assistant_overrides (
      assistant_id, enabled, sort_order, preset_agent_type, last_used_at, updated_at
    ) VALUES
      ('${LEGACY_USER_ID}', 0, 7, NULL, 1111, 1111),
      ('${BUILTIN_ID}', 0, 9, 'claude', 2222, 2222);
  `;
  execFileSync('sqlite3', [legacyDbPath], { input: seedSql, encoding: 'utf8' });

  const rulesDir = path.join(dataDir, 'assistant-rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, `${LEGACY_USER_ID}.en-US.md`), LEGACY_RULE, 'utf8');
}

async function waitForHealthy(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/system/info`);
      if (res.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('migration sibling backend did not become healthy in 15s');
}

async function httpJson<T>(baseUrl: string, method: string, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Backend ${method} ${route} failed (${response.status}): ${text}`);
  }
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

test.describe('Assistant Settings Migration', () => {
  test.setTimeout(120_000);

  let backend: ChildProcess | null = null;
  let dataDir = '';
  const baseUrl = `http://127.0.0.1:${MIGRATION_BACKEND_PORT}`;

  async function stopBackend(): Promise<void> {
    if (!backend) return;
    const proc = backend;
    backend = null;
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 3_000);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async function startBackend(): Promise<void> {
    const binary = resolveBackendBinary();
    const logPath = path.join(dataDir, 'assistant-migration-sibling.log');
    const logFd = fs.openSync(logPath, 'a');
    backend = spawn(binary, ['--local', '--port', String(MIGRATION_BACKEND_PORT), '--data-dir', dataDir], {
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        RUST_LOG: 'warn',
        AIONUI_EXTENSIONS_PATH: path.join(process.cwd(), 'examples'),
      },
    });
    try {
      await waitForHealthy(baseUrl);
    } catch (error) {
      const tail = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').slice(-4000) : '(no log)';
      throw new Error(`${(error as Error).message}\n--- sibling backend log tail ---\n${tail}`, { cause: error });
    }
  }

  test.beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-assistant-migration-'));
    seedLegacyDatabase(dataDir);
    await startBackend();
  });

  test.afterEach(async () => {
    await stopBackend();
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('legacy user assistant migrates into phase-1 defaults without losing existing config', async () => {
    const list = await httpJson<AssistantListItem[]>(baseUrl, 'GET', '/api/assistants');
    const migrated = list.find((assistant) => assistant.id === LEGACY_USER_ID);
    expect(migrated).toBeDefined();
    expect(migrated?.source).toBe('user');
    expect(migrated?.name).toBe('Legacy Writer');
    expect(migrated?.description).toBe('Migrated from legacy schema');
    expect(migrated?.enabled).toBe(false);
    expect(migrated?.sort_order).toBe(7);
    expect(migrated?.preset_agent_type).toBe('aionrs');

    const detail = await httpJson<AssistantDetail>(baseUrl, 'GET', `/api/assistants/${LEGACY_USER_ID}?locale=en-US`);
    expect(detail.profile.name).toBe('Legacy Writer');
    expect(detail.profile.description).toBe('Migrated from legacy schema');
    expect(detail.state.enabled).toBe(false);
    expect(detail.state.sort_order).toBe(7);
    expect(detail.engine.agent_backend).toBe('aionrs');
    expect(detail.rules.content).toBe(LEGACY_RULE);
    expect(detail.prompts.recommended).toEqual([LEGACY_PROMPT]);
    expect(detail.defaults.model.mode).toBe('auto');
    expect(detail.defaults.permission.mode).toBe('auto');
    expect(detail.defaults.skills.mode).toBe('fixed');
    expect(detail.defaults.skills.value).toEqual(['officecli-data-dashboard', 'officecli']);
    expect(detail.defaults.mcps.mode).toBe('auto');
    expect(detail.defaults.mcps.value ?? []).toEqual([]);
    expect(detail.capabilities.default_skill_ids).toEqual(['officecli-data-dashboard', 'officecli']);
    expect(detail.capabilities.default_disabled_builtin_skill_ids).toEqual(['cron']);
    expect(detail.preferences.last_skill_ids ?? []).toEqual([]);
    expect(detail.preferences.last_mcp_ids ?? []).toEqual([]);

    expect(
      querySqliteValue(
        dataDir,
        `SELECT COUNT(*) FROM assistant_definitions
         WHERE assistant_key = '${LEGACY_USER_ID}'
           AND source = 'user'
           AND name_i18n = '{}'
           AND description_i18n = '{}'
           AND recommended_prompts_i18n = '{}'
           AND default_model_mode = 'auto'
           AND default_permission_mode = 'auto'
           AND default_skills_mode = 'fixed'
           AND default_mcps_mode = 'auto'
           AND rule_resource_ref = '${LEGACY_USER_ID}'`
      )
    ).toBe('1');

    expect(
      querySqliteValue(
        dataDir,
        `SELECT enabled || ':' || sort_order
         FROM assistant_overlays
         WHERE definition_id = (
           SELECT definition_id FROM assistant_definitions WHERE assistant_key = '${LEGACY_USER_ID}'
         )`
      )
    ).toBe('0:7');
  });

  test('legacy builtin override migrates to overlays without duplicating builtin into legacy user mirror', async () => {
    const list = await httpJson<AssistantListItem[]>(baseUrl, 'GET', '/api/assistants');
    const builtin = list.find((assistant) => assistant.id === BUILTIN_ID);
    expect(builtin).toBeDefined();
    expect(builtin?.source).toBe('builtin');
    expect(builtin?.enabled).toBe(false);
    expect(builtin?.sort_order).toBe(9);
    expect(builtin?.preset_agent_type).toBe('claude');
    expect(list.filter((assistant) => assistant.id === BUILTIN_ID && assistant.source === 'user')).toHaveLength(0);

    expect(
      querySqliteValue(
        dataDir,
        `SELECT enabled || ':' || sort_order || ':' || COALESCE(agent_backend_override, '')
         FROM assistant_overlays
         WHERE definition_id = (
           SELECT definition_id FROM assistant_definitions WHERE assistant_key = '${BUILTIN_ID}'
         )`
      )
    ).toBe('0:9:claude');

    expect(querySqliteValue(dataDir, `SELECT COUNT(*) FROM assistants WHERE id = '${BUILTIN_ID}'`)).toBe('0');
  });
});
