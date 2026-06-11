/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildSkillLibrary, resolveSkillLibrarySource } from '@/process/commandEve/skillLibraryCore';

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-skill-library-test-'));
  tempRoots.push(root);
  return root;
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Command EVE skill library core', () => {
  it('blocks loudly without runtime reconciliation', () => {
    const result = buildSkillLibrary({ env: {} });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('RUNTIME_RECONCILIATION_SOURCE_MISSING');
  });

  it('resolves runtime reconciliation from user data path', () => {
    const source = resolveSkillLibrarySource({
      userDataPath: '/tmp/eve-user-data',
      env: {},
    });

    expect(source.runtime_reconciliation_path).toBe(
      '/tmp/eve-user-data/command-eve-runtime/capabilities/command-eve-runtime-reconciliation.json'
    );
  });

  it('renders executable, prompt-label and gated skills without exposing secrets', () => {
    const root = makeRoot();
    const reconciliationPath = path.join(root, 'command-eve-runtime-reconciliation.json');
    const capabilityPackPath = path.join(root, 'command-eve-capabilities.json');
    writeJson(capabilityPackPath, {
      version: 'command-eve-capability-pack/v0',
      release: '1.0.0-alpha.5',
      skills: [
        {
          id: 'first-run-company-discovery',
          name: 'First-run Company Discovery',
          source: 'company-os-kit/.company-os/eve/skills/first-run-company-discovery.md',
          default_state: 'active',
        },
        {
          id: 'content-machine',
          name: 'Content Machine',
          source: 'domains/marketing/content-machine',
          default_state: 'available',
        },
        {
          id: 'marketing-publishing-stack',
          name: 'Marketing Publishing Stack',
          source: 'connector-manifest',
          default_state: 'gated',
        },
      ],
      connectors: [],
    });
    writeJson(reconciliationPath, {
      version: 'command-eve-runtime-reconciliation/v0',
      managed_skill_dir: path.join(root, 'skills-command-eve'),
      executable_skill_ids: ['first-run-company-discovery'],
      prompt_label_skill_ids: ['content-machine'],
      gated_skill_ids: ['marketing-publishing-stack'],
      connector_ids: ['github-gitnexus'],
      hermes_config: {
        mcp_servers: [],
        skills_external_dirs: ['${HERMES_HOME}/skills-command-eve'],
        disabled_skills: ['red-teaming/godmode', 'weixin'],
        kanban_dispatch_in_gateway: false,
        kanban_auto_decompose: false,
      },
      blocked_external_mcp_transports: ['http', 'sse'],
      warnings: ['Token abc123SECRET must not appear in user visible fields.'],
    });

    const result = buildSkillLibrary({ runtimeReconciliationPath: reconciliationPath, capabilityPackPath, env: {} });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.model?.summary.executable).toBe(1);
    expect(result.model?.summary.prompt_label).toBe(1);
    expect(result.model?.summary.gated).toBe(1);
    expect(result.model?.summary.disabled).toBe(2);
    expect(result.model?.skills.find((skill) => skill.id === 'first-run-company-discovery')?.state).toBe('executable');
    expect(result.model?.skills.find((skill) => skill.id === 'content-machine')?.state).toBe('prompt_label');
    expect(result.model?.skills.find((skill) => skill.id === 'marketing-publishing-stack')?.state).toBe('gated');
    expect(result.model?.skills.find((skill) => skill.id === 'red-teaming/godmode')?.state).toBe('disabled');
    expect(JSON.stringify(result)).not.toContain('abc123SECRET');
    expect(result.model?.warnings[0]).toContain('[redacted]');
    expect(result.model?.blocked_external_mcp_transports).toEqual(['http', 'sse']);
    expect(result.model?.kanban.dispatch_in_gateway).toBe(false);
    expect(result.model?.kanban.auto_decompose).toBe(false);
  });
});
