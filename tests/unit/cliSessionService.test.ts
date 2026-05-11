import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const codexRowsMock = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const betterSqliteMock = vi.hoisted(() =>
  vi.fn(function BetterSqlite3Mock() {
    return {
      prepare: vi.fn(() => ({
        all: vi.fn(() => codexRowsMock),
      })),
      close: vi.fn(),
    };
  })
);

vi.mock('better-sqlite3', () => ({
  default: betterSqliteMock,
}));

import {
  CliSessionService,
  listClaudeCliSessionsFromProjectsDir,
  listCodexCliSessionsFromStateDb,
} from '../../src/process/services/cliSessionService';

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  codexRowsMock.length = 0;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('cliSessionService', () => {
  it('lists Claude CLI sessions from project transcripts', async () => {
    const rootDir = await createTempDir('aionui-claude-sessions-');
    const projectsDir = path.join(rootDir, 'projects');
    const workspaceDir = path.join(rootDir, 'workspace');
    const projectDir = path.join(projectsDir, '-Users-test-workspace');
    const sessionPath = path.join(projectDir, '12345678-1234-1234-1234-123456789abc.jsonl');

    await mkdir(projectDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(
      sessionPath,
      [
        JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-04-16T00:00:00.000Z' }),
        JSON.stringify({
          type: 'user',
          timestamp: '2026-04-16T00:00:01.000Z',
          cwd: workspaceDir,
          message: {
            role: 'user',
            content: 'Investigate flaky sidebar animation in AionUI',
          },
        }),
      ].join('\n')
    );

    const sessions = await listClaudeCliSessionsFromProjectsDir(projectsDir, 10);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      backend: 'claude',
      sessionId: '12345678-1234-1234-1234-123456789abc',
      workspace: workspaceDir,
      workspaceExists: true,
    });
    expect(sessions[0]?.title).toContain('Investigate flaky sidebar animation');
  });

  it('lists Codex CLI sessions from state sqlite', async () => {
    const rootDir = await createTempDir('aionui-codex-sessions-');
    const workspaceDir = path.join(rootDir, 'workspace');
    const dbPath = path.join(rootDir, 'state_1.sqlite');

    await mkdir(workspaceDir, { recursive: true });

    await writeFile(dbPath, 'mock');
    codexRowsMock.push({
      id: '019d-session-codex',
      rollout_path: path.join(rootDir, 'rollout.jsonl'),
      created_at: 1_765_290_001,
      updated_at: 1_765_290_111,
      cwd: workspaceDir,
      title: 'Fix recent session import flow',
      first_user_message: 'Fix recent session import flow',
    });

    const sessions = await listCodexCliSessionsFromStateDb(dbPath, 10);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      backend: 'codex',
      sessionId: '019d-session-codex',
      workspace: workspaceDir,
      workspaceExists: true,
    });
    expect(sessions[0]?.title).toContain('Fix recent session import flow');
  });

  it('merges recent Claude and Codex sessions', async () => {
    const rootDir = await createTempDir('aionui-cli-sessions-');
    const projectsDir = path.join(rootDir, '.claude', 'projects', 'demo');
    const codexRoot = path.join(rootDir, '.codex');
    const workspaceDir = path.join(rootDir, 'workspace');
    const claudeSessionPath = path.join(projectsDir, 'session-claude.jsonl');
    const codexDbPath = path.join(codexRoot, 'state_5.sqlite');

    await mkdir(projectsDir, { recursive: true });
    await mkdir(codexRoot, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });

    await writeFile(
      claudeSessionPath,
      JSON.stringify({
        type: 'user',
        timestamp: '2026-04-16T00:00:01.000Z',
        cwd: workspaceDir,
        message: { role: 'user', content: 'Resume Claude investigation' },
      })
    );

    await writeFile(codexDbPath, 'mock');
    codexRowsMock.push({
      id: 'session-codex',
      rollout_path: path.join(rootDir, 'rollout-codex.jsonl'),
      created_at: 1_765_290_001,
      updated_at: 1_765_290_222,
      cwd: workspaceDir,
      title: 'Resume Codex investigation',
      first_user_message: 'Resume Codex investigation',
    });

    const service = new CliSessionService({
      claudeProjectsDir: path.join(rootDir, '.claude', 'projects'),
      codexRoot,
    });

    const sessions = await service.listRecentSessions(10);

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.backend).toSorted()).toEqual(['claude', 'codex']);
  });
});
