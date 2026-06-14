/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import {
  DEFAULT_COMMAND_EVE_CAPABILITY_PACK,
  commandEveOllamaContextModelRef,
  ensureCommandEveRuntimeBootstrap,
  loadCommandEveCapabilityPack,
  loadCommandEveRuntimeBootstrapManifest,
  parseOllamaListHasModel,
  prepareCommandEveRuntimeProcessEnv,
  resolveCommandEveFirstRunProfile,
  resolveCommandEveCapabilityManifestPath,
  resolveCommandEveRuntimeBootstrapPaths,
  resolveCommandEveRuntimeBootstrapManifestPath,
  validateCommandEveCapabilityPack,
  type RuntimeBootstrapCommandResult,
  type RuntimeBootstrapRunner,
} from '@/process/commandEve/runtimeBootstrapCore';
import { registerTenant } from '@/process/commandEve/entitlementCore';

type Harness = {
  root: string;
  commands: string[];
  runner: RuntimeBootstrapRunner;
};

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-runtime-bootstrap-test-'));
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const commandResult = (
  command: string,
  args: string[],
  ok = true,
  stdout = '',
  stderr = ''
): RuntimeBootstrapCommandResult => ({
  command,
  args,
  ok,
  status: ok ? 0 : 1,
  stdout,
  stderr,
});

const makeHarness = (
  options: {
    ollamaInitiallyInstalled?: boolean;
    modelInitiallyPulled?: boolean;
    hermesInitiallyInstalled?: string;
  } = {}
): Harness => {
  const root = makeRoot();
  let ollamaInstalled = Boolean(options.ollamaInitiallyInstalled);
  const pulledModels = new Set<string>(options.modelInitiallyPulled ? ['gemma4:e4b'] : []);
  const contextModels = new Set<string>(
    options.modelInitiallyPulled ? [commandEveOllamaContextModelRef('gemma4:e4b', 65_536)] : []
  );
  let hermesVersion = options.hermesInitiallyInstalled || '';
  const commands: string[] = [];
  const runner: RuntimeBootstrapRunner = async (command, args) => {
    commands.push([command, ...args].join(' '));
    if (command === 'bash' && args[0] === '-lc') {
      const target = args[3];
      const paths: Record<string, string> = {
        python3: '/usr/bin/python3',
        'python3.13': '/usr/bin/python3.13',
        brew: '/opt/homebrew/bin/brew',
        ollama: ollamaInstalled ? '/opt/homebrew/bin/ollama' : '',
      };
      const targetPath = paths[target] || '';
      return commandResult(command, args, Boolean(targetPath), targetPath);
    }
    if (command === '/usr/bin/python3.13' && args[0] === '--version') {
      return commandResult(command, args, true, 'Python 3.13.13\n');
    }
    if (command === '/usr/bin/python3' && args[0] === '--version') {
      return commandResult(command, args, true, 'Python 3.14.5\n');
    }
    if (command === '/usr/bin/python3.13' && args[0] === '-m' && args[1] === 'venv') {
      const venv = args[2];
      fs.mkdirSync(path.join(venv, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(venv, 'bin', 'python'), '#!/usr/bin/env bash\n');
      fs.chmodSync(path.join(venv, 'bin', 'python'), 0o755);
      return commandResult(command, args);
    }
    if (command.endsWith('/bin/python') && args.includes('pip')) {
      const installTarget = args.at(-1) || '';
      if (
        installTarget === 'hermes-agent[acp]==0.16.0' ||
        installTarget.endsWith('hermes_agent-0.16.0-py3-none-any.whl[acp]')
      ) {
        hermesVersion = '0.16.0';
        fs.writeFileSync(path.join(path.dirname(command), 'hermes'), '#!/usr/bin/env bash\n');
        fs.chmodSync(path.join(path.dirname(command), 'hermes'), 0o755);
      }
      return commandResult(command, args);
    }
    if (command.endsWith('/bin/hermes') && args[0] === '--version') {
      return commandResult(
        command,
        args,
        Boolean(hermesVersion),
        hermesVersion ? `Hermes Agent v${hermesVersion}\n` : ''
      );
    }
    if (command === '/opt/homebrew/bin/brew' && args.join(' ') === 'install ollama') {
      ollamaInstalled = true;
      return commandResult(command, args);
    }
    const isOllamaCommand = command === '/opt/homebrew/bin/ollama' || command.endsWith('/ollama');
    if (isOllamaCommand && args[0] === 'list') {
      const rows = ['NAME              ID      SIZE      MODIFIED'];
      for (const model of pulledModels) rows.push(`${model}        abc     9.6 GB    now`);
      for (const model of contextModels) rows.push(`${model}        def     9.6 GB    now`);
      const stdout = `${rows.join('\n')}\n`;
      return commandResult(command, args, true, stdout);
    }
    if (isOllamaCommand && args[0] === 'pull' && /^gemma4:/.test(args[1] || '')) {
      pulledModels.add(args[1]);
      return commandResult(command, args);
    }
    if (isOllamaCommand && args[0] === 'create' && (args[1] || '').startsWith('command-eve-')) {
      const modelfilePath = args[3];
      const modelfile = fs.existsSync(modelfilePath) ? fs.readFileSync(modelfilePath, 'utf8') : '';
      const sourceModelRef = modelfile.match(/^FROM\s+(.+)$/m)?.[1]?.trim() || '';
      const ok = pulledModels.has(sourceModelRef);
      if (ok) contextModels.add(args[1]);
      return commandResult(command, args, ok);
    }
    return commandResult(command, args);
  };
  return { root, commands, runner };
};

const withOllamaServer = async <T>(run: (baseUrl: string) => Promise<T>): Promise<T> => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"models":[]}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected test server address');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

const writeManifest = (root: string, baseUrl: string, overrides = ''): string => {
  const manifest = {
    ...loadCommandEveRuntimeBootstrapManifest(),
    local_runtime: {
      ...loadCommandEveRuntimeBootstrapManifest().local_runtime,
      base_url: baseUrl,
      egress_proxy_url: baseUrl,
    },
  };
  const file = path.join(root, 'manifest.json');
  fs.writeFileSync(file, overrides || `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
};

describe('Command EVE runtime bootstrap core', () => {
  it('parses exact Ollama model names from list output', () => {
    expect(parseOllamaListHasModel('NAME ID SIZE MODIFIED\ngemma4:e4b abc 1 GB now\n', 'gemma4:e4b')).toBe(true);
    expect(parseOllamaListHasModel('NAME ID SIZE MODIFIED\ngemma4:12b abc 1 GB now\n', 'gemma4:e4b')).toBe(false);
  });

  it('resolves packaged Electron extraResources manifest before app.asar fallback', () => {
    const root = makeRoot();
    const resourcesPath = path.join(root, 'Resources');
    const appPath = path.join(resourcesPath, 'app.asar');
    fs.mkdirSync(resourcesPath, { recursive: true });
    fs.mkdirSync(path.join(appPath, 'out', 'renderer'), { recursive: true });
    const manifestPath = path.join(resourcesPath, 'command-eve-runtime-bootstrap.json');
    const asarManifestPath = path.join(appPath, 'out', 'renderer', 'command-eve-runtime-bootstrap.json');
    fs.writeFileSync(manifestPath, '{}\n');
    fs.writeFileSync(asarManifestPath, '{"release":"stale"}\n');

    expect(resolveCommandEveRuntimeBootstrapManifestPath({ appPath, resourcesPath })).toBe(manifestPath);
  });

  it('resolves and validates the packaged Command EVE capability pack', () => {
    const root = makeRoot();
    const resourcesPath = path.join(root, 'Resources');
    const appPath = path.join(resourcesPath, 'app.asar');
    fs.mkdirSync(resourcesPath, { recursive: true });
    const capabilityPath = path.join(resourcesPath, 'command-eve-capabilities.json');
    fs.writeFileSync(capabilityPath, `${JSON.stringify(DEFAULT_COMMAND_EVE_CAPABILITY_PACK, null, 2)}\n`);

    const resolved = resolveCommandEveCapabilityManifestPath({ appPath, resourcesPath });
    const capabilityPack = loadCommandEveCapabilityPack(resolved);

    expect(resolved).toBe(capabilityPath);
    expect(validateCommandEveCapabilityPack(capabilityPack)).toEqual([]);
    expect(capabilityPack.skills.some((skill) => skill.id === 'content-machine')).toBe(true);
    expect(capabilityPack.connectors.some((connector) => connector.id === 'codex-cli')).toBe(true);
  });

  it('installs Hermes, installs Ollama via Homebrew, pulls the default model, and writes receipts', async () => {
    const harness = makeHarness();
    await withOllamaServer(async (baseUrl) => {
      const manifestPath = writeManifest(harness.root, baseUrl);
      const receipt = await ensureCommandEveRuntimeBootstrap({
        userDataPath: harness.root,
        manifestPath,
        runner: harness.runner,
        detachedSpawner: () => {},
        statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
        totalMemoryBytes: 32 * 1024 ** 3,
        ollamaBinaryCandidates: [],
        env: { COMMAND_EVE_FOUNDER_NAME: 'Mathias', COMMAND_EVE_COMPANY_NAME: 'FYN Labs' },
      });

      const paths = resolveCommandEveRuntimeBootstrapPaths(harness.root);
      const runtimeModelRef = commandEveOllamaContextModelRef('gemma4:e4b', 65_536);
      expect(receipt.status).toBe('ready');
      expect(receipt.capabilities.skills).toBeGreaterThanOrEqual(10);
      expect(receipt.capabilities.connectors).toBeGreaterThanOrEqual(10);
      expect(receipt.default_model).toBe(runtimeModelRef);
      expect(receipt.base_model).toBe('gemma4:e4b');
      expect(fs.existsSync(paths.hermesWrapper)).toBe(true);
      expect(fs.existsSync(paths.hermesShim)).toBe(true);
      expect(fs.readFileSync(paths.capabilityPack, 'utf8')).toContain('content-machine');
      expect(fs.readFileSync(path.join(paths.hermesHome, 'command-eve-capabilities.json'), 'utf8')).toContain(
        'github-gitnexus'
      );
      const configYaml = fs.readFileSync(path.join(paths.hermesHome, 'config.yaml'), 'utf8');
      expect(configYaml).toContain('model:');
      expect(configYaml).toContain('provider: custom');
      expect(configYaml).toContain(`default: ${runtimeModelRef}`);
      expect(configYaml).toContain(`base_url: ${baseUrl}/v1`);
      expect(configYaml).toContain('context_length: 65536');
      expect(configYaml).toContain('ollama_num_ctx: 65536');
      expect(configYaml).toContain('max_tokens: 512');
      expect(configYaml).toContain('reasoning_effort: none');
      expect(configYaml).toContain('skills:');
      expect(configYaml).toContain('external_dirs:');
      expect(configYaml).toContain('"${HERMES_HOME}/skills-command-eve"');
      expect(configYaml).toContain('disabled:');
      expect(configYaml).toContain('"red-teaming/godmode"');
      expect(configYaml).toContain('platform_toolsets:');
      expect(configYaml).toContain('mcp_servers: {}');
      expect(configYaml).toContain('kanban:');
      expect(configYaml).toContain('dispatch_in_gateway: false');
      expect(configYaml).toContain('auto_decompose: false');
      expect(configYaml).toContain(`model_url: ${baseUrl}`);
      expect(fs.existsSync(path.join(paths.managedSkillsRoot, 'first-run-company-discovery', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(paths.managedSkillsRoot, 'content-machine', 'SKILL.md'))).toBe(false);
      const reconciliation = JSON.parse(fs.readFileSync(paths.runtimeReconciliation, 'utf8')) as {
        executable_skill_ids: string[];
        prompt_label_skill_ids: string[];
        hermes_config: {
          mcp_servers: string[];
          skills_external_dirs: string[];
          kanban_dispatch_in_gateway: boolean;
          kanban_auto_decompose: boolean;
        };
        blocked_external_mcp_transports: string[];
      };
      expect(reconciliation.executable_skill_ids).toContain('first-run-company-discovery');
      expect(reconciliation.prompt_label_skill_ids).toContain('content-machine');
      expect(reconciliation.hermes_config.skills_external_dirs).toEqual(['${HERMES_HOME}/skills-command-eve']);
      expect(reconciliation.hermes_config.mcp_servers).toEqual([]);
      expect(reconciliation.hermes_config.kanban_dispatch_in_gateway).toBe(false);
      expect(reconciliation.hermes_config.kanban_auto_decompose).toBe(false);
      expect(reconciliation.blocked_external_mcp_transports).toEqual(['http', 'sse']);
      expect(fs.readFileSync(path.join(paths.hermesHome, 'context_length_cache.yaml'), 'utf8')).toContain(
        `${runtimeModelRef}@${baseUrl}/v1: 65536`
      );
      expect(fs.readFileSync(path.join(paths.hermesHome, 'context_length_cache.yaml'), 'utf8')).toContain(
        `${commandEveOllamaContextModelRef('gemma4:12b', 65_536)}@${baseUrl}/v1: 65536`
      );
      const modelfile = fs.readFileSync(
        path.join(paths.runtimeRoot, 'ollama-modelfiles', `${runtimeModelRef.replace(/[:/]/g, '-')}.Modelfile`),
        'utf8'
      );
      expect(modelfile).toContain('FROM gemma4:e4b');
      expect(modelfile).toContain('PARAMETER num_ctx 65536');
      const providerOverride = fs.readFileSync(
        path.join(paths.hermesHome, 'plugins', 'model-providers', 'custom', '__init__.py'),
        'utf8'
      );
      expect(providerOverride).toContain('top_level["reasoning_effort"] = "none"');
      expect(fs.readFileSync(paths.firstRunProfile, 'utf8')).toContain('Mathias');
      expect(receipt.identity?.founder_name).toBe('Mathias');
      expect(receipt.identity?.company_name).toBe('FYN Labs');
      expect(receipt.identity?.confidence).toBe('verified');
      expect(receipt.identity?.needs_confirmation).toBe(false);
      expect(harness.commands.some((command) => command.includes('brew install ollama'))).toBe(true);
      expect(harness.commands.some((command) => command.includes('ollama pull gemma4:e4b'))).toBe(true);
      expect(harness.commands.some((command) => command.includes(`ollama create ${runtimeModelRef}`))).toBe(true);
      expect(harness.commands.some((command) => command.includes('curl'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(paths.receiptPath, 'utf8')).status).toBe('ready');
    });
  });

  it('uses the selected local model tier when Command EVE requests 12B planning', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    await withOllamaServer(async (baseUrl) => {
      const manifestPath = writeManifest(harness.root, baseUrl);
      const receipt = await ensureCommandEveRuntimeBootstrap({
        userDataPath: harness.root,
        manifestPath,
        runner: harness.runner,
        detachedSpawner: () => {},
        statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
        totalMemoryBytes: 32 * 1024 ** 3,
        ollamaBinaryCandidates: [],
        env: { COMMAND_EVE_LOCAL_MODEL_TIER: 'gemma-4-12b-local-planning' },
      });

      const paths = resolveCommandEveRuntimeBootstrapPaths(harness.root);
      const runtimeModelRef = commandEveOllamaContextModelRef('gemma4:12b', 65_536);
      expect(receipt.status).toBe('ready');
      expect(receipt.default_model).toBe(runtimeModelRef);
      expect(receipt.base_model).toBe('gemma4:12b');
      expect(fs.readFileSync(path.join(paths.hermesHome, 'config.yaml'), 'utf8')).toContain(
        `default: ${runtimeModelRef}`
      );
      expect(harness.commands.some((command) => command.includes('ollama pull gemma4:12b'))).toBe(true);
      expect(harness.commands.some((command) => command.includes(`ollama create ${runtimeModelRef}`))).toBe(true);
    });
  });

  it('uses the packaged macOS Ollama binary when it exists outside PATH', async () => {
    const harness = makeHarness({ modelInitiallyPulled: true });
    const bundledOllama = path.join(harness.root, 'Ollama.app', 'Contents', 'Resources', 'ollama');
    fs.mkdirSync(path.dirname(bundledOllama), { recursive: true });
    fs.writeFileSync(bundledOllama, '#!/usr/bin/env bash\n');
    fs.chmodSync(bundledOllama, 0o755);

    await withOllamaServer(async (baseUrl) => {
      const manifestPath = writeManifest(harness.root, baseUrl);
      const receipt = await ensureCommandEveRuntimeBootstrap({
        userDataPath: harness.root,
        manifestPath,
        runner: harness.runner,
        detachedSpawner: () => {},
        statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
        totalMemoryBytes: 32 * 1024 ** 3,
        ollamaBinaryCandidates: [bundledOllama],
      });

      expect(receipt.status).toBe('ready');
      expect(harness.commands.some((command) => command.startsWith(`${bundledOllama} list`))).toBe(true);
      expect(harness.commands.some((command) => command.includes('brew install ollama'))).toBe(false);
    });
  });

  it('installs Hermes from a bundled wheel when packaged resources provide one', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true, modelInitiallyPulled: true });
    const resourcesPath = path.join(harness.root, 'Resources');
    const wheelPath = path.join(resourcesPath, 'bundled-hermes', 'hermes_agent-0.16.0-py3-none-any.whl');
    fs.mkdirSync(path.dirname(wheelPath), { recursive: true });
    fs.writeFileSync(wheelPath, 'fake wheel\n');

    await withOllamaServer(async (baseUrl) => {
      const manifestPath = writeManifest(harness.root, baseUrl);
      const receipt = await ensureCommandEveRuntimeBootstrap({
        userDataPath: harness.root,
        manifestPath,
        resourcesPath,
        runner: harness.runner,
        detachedSpawner: () => {},
        statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
        totalMemoryBytes: 32 * 1024 ** 3,
      });

      expect(receipt.status).toBe('ready');
      expect(harness.commands.some((command) => command.includes(`${wheelPath}[acp]`))).toBe(true);
      expect(harness.commands.some((command) => command.includes('hermes-agent[acp]==0.16.0'))).toBe(false);
    });
  });

  it('upgrades an existing Hermes runtime when its version does not match the manifest', async () => {
    const harness = makeHarness({
      ollamaInitiallyInstalled: true,
      modelInitiallyPulled: true,
      hermesInitiallyInstalled: '0.15.0',
    });
    const paths = resolveCommandEveRuntimeBootstrapPaths(harness.root);
    fs.mkdirSync(path.join(paths.hermesVenv, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(paths.hermesVenv, 'bin', 'python'), '#!/usr/bin/env bash\n');
    fs.writeFileSync(path.join(paths.hermesVenv, 'bin', 'hermes'), '#!/usr/bin/env bash\n');
    fs.chmodSync(path.join(paths.hermesVenv, 'bin', 'python'), 0o755);
    fs.chmodSync(path.join(paths.hermesVenv, 'bin', 'hermes'), 0o755);

    await withOllamaServer(async (baseUrl) => {
      const manifestPath = writeManifest(harness.root, baseUrl);
      const receipt = await ensureCommandEveRuntimeBootstrap({
        userDataPath: harness.root,
        manifestPath,
        runner: harness.runner,
        detachedSpawner: () => {},
        statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
        totalMemoryBytes: 32 * 1024 ** 3,
      });

      expect(receipt.status).toBe('ready');
      expect(receipt.stages.find((stage) => stage.id === 'hermes')?.detail).toContain('Updated hermes-agent 0.16.0');
      expect(harness.commands.some((command) => command.includes('Hermes Agent v0.15.0'))).toBe(false);
      expect(harness.commands.some((command) => command.includes('0.16.0') && command.includes('pip install'))).toBe(
        true
      );
    });
  });

  it('rejects Python 3.14 when no Hermes-compatible interpreter exists', async () => {
    const root = makeRoot();
    const commands: string[] = [];
    const runner: RuntimeBootstrapRunner = async (command, args) => {
      commands.push([command, ...args].join(' '));
      if (command === 'bash' && args[0] === '-lc') {
        return commandResult(command, args, args[3] === 'python3', args[3] === 'python3' ? '/usr/bin/python3' : '');
      }
      if (command === '/usr/bin/python3' && args[0] === '--version') {
        return commandResult(command, args, true, 'Python 3.14.5\n');
      }
      return commandResult(command, args);
    };

    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: root,
      runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.stages.some((stage) => stage.code === 'PYTHON_UNSUPPORTED')).toBe(true);
    expect(commands.some((command) => command.includes('-m venv'))).toBe(false);
  });

  it('blocks before installing anything when capacity is too small', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 1, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.stages.some((stage) => stage.code === 'BLOCKED_DISK')).toBe(true);
    expect(harness.commands.length).toBe(0);
  });

  it('seeds the macOS display name as unverified first-run context before heavy installs', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 1, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
      displayNameLookup: () => 'Mathias Heinke',
      env: { USER: 'admin' },
    });

    const paths = resolveCommandEveRuntimeBootstrapPaths(harness.root);
    const profile = JSON.parse(fs.readFileSync(paths.firstRunProfile, 'utf8')) as { founder_name: string };

    expect(receipt.status).toBe('blocked');
    expect(receipt.identity?.founder_name).toBe('Mathias Heinke');
    expect(receipt.identity?.source).toBe('macos_full_name');
    expect(receipt.identity?.confidence).toBe('needs_confirmation');
    expect(receipt.identity?.needs_confirmation).toBe(true);
    expect(profile.founder_name).toBe('Mathias Heinke');
    expect(receipt.stages.find((stage) => stage.id === 'identity')?.status).toBe('pass');
    expect(harness.commands.length).toBe(0);
  });

  it('seeds EVE first-run from the gate-confirmed registration so it greets by name (COMPA-596)', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    // The user completed the registration gate (name + company + GDPR consent).
    const reg = registerTenant(
      { name: 'Mathias Heinke', company: 'FYN Labs', email: 'mathias@fynlabs.de', consent: true },
      { userDataPath: harness.root }
    );
    expect(reg.ok).toBe(true);

    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 1, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
      displayNameLookup: () => 'Some Other Name', // registration must outrank the macOS name
      env: { USER: 'admin' },
    });

    const paths = resolveCommandEveRuntimeBootstrapPaths(harness.root);
    const profile = JSON.parse(fs.readFileSync(paths.firstRunProfile, 'utf8')) as {
      founder_name: string;
      company_name: string;
      source: string;
      needs_confirmation: boolean;
    };

    expect(receipt.identity?.founder_name).toBe('Mathias Heinke');
    expect(receipt.identity?.source).toBe('registration');
    expect(receipt.identity?.needs_confirmation).toBe(false);
    expect(profile.founder_name).toBe('Mathias Heinke');
    expect(profile.company_name).toBe('FYN Labs');
    expect(profile.source).toBe('registration');
  });

  it('does not treat placeholder local usernames as a verified founder identity', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 1, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
      displayNameLookup: () => '',
      env: { USER: 'admin', COMMAND_EVE_USER_NAME: 'system_default_user' },
    });

    expect(receipt.identity?.founder_name).toBeUndefined();
    expect(receipt.identity?.confidence).toBe('placeholder');
    expect(receipt.identity?.needs_confirmation).toBe(true);
    expect(receipt.stages.find((stage) => stage.id === 'identity')?.status).toBe('skip');
    expect(harness.commands.length).toBe(0);
  });

  it('fails closed when the manifest tries to route local runtime to a non-loopback URL', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    const manifest = loadCommandEveRuntimeBootstrapManifest();
    const manifestPath = writeManifest(
      harness.root,
      'http://127.0.0.1:11434',
      `${JSON.stringify(
        {
          ...manifest,
          local_runtime: {
            ...manifest.local_runtime,
            base_url: 'https://example.com',
          },
        },
        null,
        2
      )}\n`
    );
    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      manifestPath,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.stages[0].code).toBe('BLOCKED_MANIFEST');
    expect(harness.commands.length).toBe(0);
  });

  it('fails closed when an explicit manifest file cannot be parsed', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    const manifestPath = writeManifest(harness.root, 'http://127.0.0.1:11434', '{not-json');

    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      manifestPath,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.stages[0].code).toBe('BLOCKED_MANIFEST_PARSE');
    expect(harness.commands.length).toBe(0);
  });

  it('fails closed before runtime installation when the capability pack cannot be parsed', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    const capabilityManifestPath = path.join(harness.root, 'broken-capabilities.json');
    fs.writeFileSync(capabilityManifestPath, '{not-json');

    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      capabilityManifestPath,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.stages.some((stage) => stage.code === 'BLOCKED_CAPABILITY_PACK_PARSE')).toBe(true);
    expect(harness.commands.length).toBe(0);
  });

  it('fails closed before runtime installation when the capability pack is unsafe', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true });
    const capabilityManifestPath = path.join(harness.root, 'unsafe-capabilities.json');
    fs.writeFileSync(
      capabilityManifestPath,
      `${JSON.stringify(
        {
          ...DEFAULT_COMMAND_EVE_CAPABILITY_PACK,
          skills: [
            {
              ...DEFAULT_COMMAND_EVE_CAPABILITY_PACK.skills[0],
              id: 'bad id',
            },
          ],
        },
        null,
        2
      )}\n`
    );

    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      capabilityManifestPath,
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.stages.some((stage) => stage.code === 'BLOCKED_CAPABILITY_PACK')).toBe(true);
    expect(receipt.stages.some((stage) => stage.detail?.includes('capabilities.skill_id_unsafe'))).toBe(true);
    expect(harness.commands.length).toBe(0);
  });

  it('check mode reports missing Hermes without trying to install it', async () => {
    const harness = makeHarness({ ollamaInitiallyInstalled: true, modelInitiallyPulled: true });
    const receipt = await ensureCommandEveRuntimeBootstrap({
      userDataPath: harness.root,
      mode: 'check',
      runner: harness.runner,
      detachedSpawner: () => {},
      statfs: () => ({ bavail: 50 * 1024 * 1024, bsize: 1024 }),
      totalMemoryBytes: 32 * 1024 ** 3,
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.stages.some((stage) => stage.code === 'HERMES_MISSING')).toBe(true);
    expect(harness.commands.some((command) => command.includes('pip install'))).toBe(false);
  });

  it('prepares PATH for an existing Hermes runtime before aioncore scans agents', () => {
    const root = makeRoot();
    const paths = resolveCommandEveRuntimeBootstrapPaths(root);
    fs.mkdirSync(path.join(paths.hermesVenv, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(paths.hermesVenv, 'bin', 'hermes'), '#!/usr/bin/env bash\n');
    fs.chmodSync(path.join(paths.hermesVenv, 'bin', 'hermes'), 0o755);

    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
    const prepared = prepareCommandEveRuntimeProcessEnv(root, env);

    expect(prepared.hermesRoot).toBe(paths.hermesRoot);
    expect(fs.existsSync(paths.hermesShim)).toBe(true);
    expect(env.PATH?.split(path.delimiter)[0]).toBe(paths.hermesRoot);
  });
});

describe('resolveCommandEveFirstRunProfile registration seed (COMPA-596)', () => {
  const now = () => new Date('2026-06-13T00:00:00.000Z');

  it('uses the gate-confirmed founder + company as the highest verified source', () => {
    const profile = resolveCommandEveFirstRunProfile({
      env: { COMMAND_EVE_FOUNDER_NAME: 'Someone Else', COMMAND_EVE_COMPANY_NAME: 'Env Co' },
      now,
      displayNameLookup: () => 'macOS Name',
      registration: { founder_name: 'Mathias Heinke', company_name: 'FYN Labs' },
    });
    expect(profile.founder_name).toBe('Mathias Heinke');
    expect(profile.company_name).toBe('FYN Labs');
    expect(profile.source).toBe('registration');
    expect(profile.confidence).toBe('verified');
    expect(profile.needs_confirmation).toBe(false);
  });

  it('falls back to the macOS display name when there is no registration (backward compatible)', () => {
    const profile = resolveCommandEveFirstRunProfile({
      env: {},
      now,
      displayNameLookup: () => 'Mathias Heinke',
    });
    expect(profile.founder_name).toBe('Mathias Heinke');
    expect(profile.source).toBe('macos_full_name');
    expect(profile.needs_confirmation).toBe(true);
  });

  it('treats a gate-confirmed company without a founder name as verified', () => {
    const profile = resolveCommandEveFirstRunProfile({
      env: {},
      now,
      displayNameLookup: () => '',
      registration: { company_name: 'FYN Labs' },
    });
    expect(profile.company_name).toBe('FYN Labs');
    expect(profile.source).toBe('registration');
    expect(profile.needs_confirmation).toBe(false);
  });
});
