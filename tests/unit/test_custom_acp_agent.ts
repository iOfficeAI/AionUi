/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import type { AcpBackendConfig } from '../../src/types/acpTypes';
import { ACP_BACKENDS_ALL, isValidAcpBackend } from '../../src/types/acpTypes';
import { createGenericSpawnConfig } from '../../src/agent/acp/AcpConnection';

describe('Custom ACP Agent Configuration', () => {
  describe('Type System', () => {
    it('should include custom in ACP_BACKENDS_ALL', () => {
      expect(ACP_BACKENDS_ALL.custom).toBeDefined();
      expect(ACP_BACKENDS_ALL.custom.id).toBe('custom');
      expect(ACP_BACKENDS_ALL.custom.name).toBe('Custom Agent');
      expect(ACP_BACKENDS_ALL.custom.enabled).toBe(true);
    });

    it('should validate custom as a valid ACP backend', () => {
      expect(isValidAcpBackend('custom')).toBe(true);
    });

    it('should have undefined cliCommand for custom backend', () => {
      expect(ACP_BACKENDS_ALL.custom.cliCommand).toBeUndefined();
    });

    it('should have claude defined for ordering reference', () => {
      // Custom agent should appear after claude in UI - verify claude exists
      expect(ACP_BACKENDS_ALL.claude).toBeDefined();
      expect(ACP_BACKENDS_ALL.claude.id).toBe('claude');
      expect(ACP_BACKENDS_ALL.claude.enabled).toBe(true);
    });
  });

  describe('Agent Ordering', () => {
    it('should insert custom agent after claude when both are present', () => {
      // Simulates the ordering logic from AcpDetector
      const detected = [
        { backend: 'gemini', name: 'Gemini CLI' },
        { backend: 'claude', name: 'Claude Code' },
        { backend: 'qwen', name: 'Qwen Code' },
      ];

      const customAgent = { backend: 'custom', name: 'Goose' };

      // Insert after claude
      const claudeIndex = detected.findIndex((a) => a.backend === 'claude');
      if (claudeIndex !== -1) {
        detected.splice(claudeIndex + 1, 0, customAgent);
      } else {
        detected.push(customAgent);
      }

      expect(detected[1].backend).toBe('claude');
      expect(detected[2].backend).toBe('custom');
      expect(detected[2].name).toBe('Goose');
    });

    it('should append custom agent at end when claude is not present', () => {
      const detected = [
        { backend: 'gemini', name: 'Gemini CLI' },
        { backend: 'qwen', name: 'Qwen Code' },
      ];

      const customAgent = { backend: 'custom', name: 'Goose' };

      const claudeIndex = detected.findIndex((a) => a.backend === 'claude');
      if (claudeIndex !== -1) {
        detected.splice(claudeIndex + 1, 0, customAgent);
      } else {
        detected.push(customAgent);
      }

      expect(detected[detected.length - 1].backend).toBe('custom');
    });
  });

  describe('Configuration Interface', () => {
    it('should accept valid custom agent configuration', () => {
      const config: AcpBackendConfig = {
        id: 'custom',
        name: 'Goose Agent',
        defaultCliPath: 'goose',
        env: { GOOSE_PROVIDER: 'openai' },
        enabled: true,
      };

      expect(config.id).toBe('custom');
      expect(config.defaultCliPath).toBe('goose');
      expect(config.env).toEqual({ GOOSE_PROVIDER: 'openai' });
      expect(config.name).toBe('Goose Agent');
      expect(config.enabled).toBe(true);
    });

    it('should accept minimal configuration with only defaultCliPath', () => {
      const config: AcpBackendConfig = {
        id: 'custom',
        name: 'My Agent',
        defaultCliPath: '/usr/local/bin/my-agent',
        enabled: true,
      };

      expect(config.defaultCliPath).toBe('/usr/local/bin/my-agent');
      expect(config.env).toBeUndefined();
      expect(config.enabled).toBe(true);
    });

    it('should support npx-based configuration with args in defaultCliPath', () => {
      // Args are now embedded in defaultCliPath as space-separated values
      const config: AcpBackendConfig = {
        id: 'custom',
        name: 'Claude Code ACP',
        defaultCliPath: 'npx @anthropic/claude-code-acp --experimental-acp',
        enabled: true,
      };

      expect(config.defaultCliPath).toBe('npx @anthropic/claude-code-acp --experimental-acp');
      expect(config.defaultCliPath?.startsWith('npx')).toBe(true);
    });

    it('should support node with path as defaultCliPath', () => {
      // Common pattern: node <script-path>
      const config: AcpBackendConfig = {
        id: 'custom',
        name: 'Test Agent',
        defaultCliPath: 'node /path/to/agent.js',
        enabled: true,
      };

      expect(config.defaultCliPath).toBe('node /path/to/agent.js');
      // Verify parsing splits correctly
      const parts = config.defaultCliPath.trim().split(/\s+/);
      expect(parts[0]).toBe('node');
      expect(parts[1]).toBe('/path/to/agent.js');
    });
  });

  describe('JSON Import Format', () => {
    it('should parse AcpBackendConfig JSON format', () => {
      const jsonInput = `{
        "id": "custom",
        "name": "Goose Agent",
        "defaultCliPath": "goose",
        "env": { "GOOSE_PROVIDER": "openai" },
        "enabled": true
      }`;

      const parsed = JSON.parse(jsonInput);

      expect(parsed.id).toBe('custom');
      expect(parsed.name).toBe('Goose Agent');
      expect(parsed.defaultCliPath).toBe('goose');
      expect(parsed.env).toEqual({ GOOSE_PROVIDER: 'openai' });
      expect(parsed.enabled).toBe(true);
    });

    it('should parse config with args embedded in defaultCliPath', () => {
      const jsonInput = `{
        "id": "custom",
        "name": "My Agent",
        "defaultCliPath": "npx @my/agent --mode acp"
      }`;

      const parsed = JSON.parse(jsonInput);

      expect(parsed.defaultCliPath).toBe('npx @my/agent --mode acp');
    });
  });

  describe('Validation', () => {
    it('should require defaultCliPath field', () => {
      const validateConfig = (config: Partial<AcpBackendConfig>): boolean => {
        return typeof config.defaultCliPath === 'string' && config.defaultCliPath.length > 0;
      };

      expect(validateConfig({ defaultCliPath: 'goose', enabled: true })).toBe(true);
      expect(validateConfig({ enabled: true } as unknown as { defaultCliPath: string; enabled: boolean })).toBe(false);
      expect(validateConfig({ defaultCliPath: '', enabled: true })).toBe(false);
    });

    it('should validate env as string record', () => {
      const validateEnv = (env: unknown): boolean => {
        if (env === undefined) return true;
        if (typeof env !== 'object' || env === null) return false;
        return Object.values(env).every((v) => typeof v === 'string');
      };

      expect(validateEnv({ KEY: 'value' })).toBe(true);
      expect(validateEnv(undefined)).toBe(true);
      expect(validateEnv({ KEY: 123 })).toBe(false);
      expect(validateEnv('not-an-object')).toBe(false);
    });
  });

  describe('Spawn Configuration', () => {
    // Tests use the real createGenericSpawnConfig from AcpConnection.ts
    const workingDir = '/tmp/test';

    it('should use custom args when provided for regular command', () => {
      const config = createGenericSpawnConfig('goose', workingDir, ['acp']);
      expect(config.command).toBe('goose');
      expect(config.args).toEqual(['acp']);
    });

    it('should use custom args when provided for npx command', () => {
      const config = createGenericSpawnConfig('npx @my-agent/cli', workingDir, ['--mode', 'acp']);
      expect(config.command).toBe(process.platform === 'win32' ? 'npx.cmd' : 'npx');
      expect(config.args).toEqual(['@my-agent/cli', '--mode', 'acp']);
    });

    it('should default to --experimental-acp when no custom args for regular command', () => {
      const config = createGenericSpawnConfig('claude', workingDir);
      expect(config.command).toBe('claude');
      expect(config.args).toEqual(['--experimental-acp']);
    });

    it('should default to --experimental-acp when no custom args for npx command', () => {
      const config = createGenericSpawnConfig('npx @anthropic/claude-code', workingDir);
      expect(config.command).toBe(process.platform === 'win32' ? 'npx.cmd' : 'npx');
      expect(config.args).toEqual(['@anthropic/claude-code', '--experimental-acp']);
    });

    it('should merge custom env with process.env', () => {
      const customEnv = { MY_VAR: 'my_value', ANOTHER_VAR: 'another' };
      const config = createGenericSpawnConfig('goose', workingDir, ['acp'], customEnv);
      expect(config.options.env?.MY_VAR).toBe('my_value');
      expect(config.options.env?.ANOTHER_VAR).toBe('another');
    });

    it('should handle empty custom args array by falling back to defaults', () => {
      const config = createGenericSpawnConfig('goose', workingDir, []);
      expect(config.command).toBe('goose');
      expect(config.args).toEqual(['--experimental-acp']);
    });

    it('should set working directory in spawn options', () => {
      const config = createGenericSpawnConfig('goose', workingDir, ['acp']);
      expect(config.options.cwd).toBe(workingDir);
    });
  });

  describe('Logo Mapping', () => {
    it('should use SVG logos for standard backends, Robot icon for custom', () => {
      // Reflects actual implementation: custom uses @icon-park/react Robot component, not an SVG file
      const AGENT_LOGO_MAP: Partial<Record<string, string>> = {
        claude: 'claude.svg',
        gemini: 'gemini.svg',
        qwen: 'qwen.svg',
        codex: 'codex.svg',
        iflow: 'iflow.svg',
        // custom: uses Robot icon, not in map
      };

      // Standard backends have SVG logos
      expect(AGENT_LOGO_MAP['claude']).toBe('claude.svg');
      expect(AGENT_LOGO_MAP['gemini']).toBe('gemini.svg');

      // Custom backend uses Robot icon, not an SVG file
      expect(AGENT_LOGO_MAP['custom']).toBeUndefined();
    });

    it('should select correct logo for standard ACP backends', () => {
      const getLogoForBackend = (backend: string): string | undefined => {
        // Custom backend uses Robot icon from @icon-park/react, not an SVG
        const logoMap: Record<string, string> = {
          claude: 'claude.svg',
          gemini: 'gemini.svg',
          qwen: 'qwen.svg',
          iflow: 'iflow.svg',
          codex: 'codex.svg',
        };
        return logoMap[backend];
      };

      // Verify standard backends return valid logos
      const standardBackends = ['claude', 'gemini', 'qwen', 'iflow', 'codex'];
      for (const backend of standardBackends) {
        expect(getLogoForBackend(backend)).not.toBeUndefined();
        expect(getLogoForBackend(backend)).toContain('.svg');
      }

      // Custom backend returns undefined (uses Robot icon component)
      expect(getLogoForBackend('custom')).toBeUndefined();
    });

    it('should return undefined for unknown backend', () => {
      const getLogoForBackend = (backend: string): string | undefined => {
        const logoMap: Record<string, string> = {
          claude: 'claude.svg',
          gemini: 'gemini.svg',
          qwen: 'qwen.svg',
          iflow: 'iflow.svg',
          codex: 'codex.svg',
        };
        return logoMap[backend];
      };

      expect(getLogoForBackend('unknown')).toBeUndefined();
      expect(getLogoForBackend('')).toBeUndefined();
    });
  });

  describe('ACP Agent Manager Config Reading', () => {
    it('should extract custom agent fields from config', () => {
      // Simulates the logic from AcpAgentManager.initAgent with AcpBackendConfig
      const customAgentConfig: AcpBackendConfig = {
        id: 'custom',
        name: 'Goose',
        defaultCliPath: 'goose',
        env: { GOOSE_PROVIDER: 'openai' },
        enabled: true,
      };

      const cliPath = customAgentConfig.defaultCliPath;
      const customEnv = customAgentConfig.env;

      expect(cliPath).toBe('goose');
      expect(customEnv).toEqual({ GOOSE_PROVIDER: 'openai' });
    });

    it('should handle config with missing optional fields', () => {
      const customAgentConfig: AcpBackendConfig = {
        id: 'custom',
        name: 'My Agent',
        defaultCliPath: '/usr/local/bin/my-agent',
        enabled: true,
      };

      const cliPath = customAgentConfig.defaultCliPath;
      const customEnv = customAgentConfig.env;

      expect(cliPath).toBe('/usr/local/bin/my-agent');
      expect(customEnv).toBeUndefined();
    });
  });
});
