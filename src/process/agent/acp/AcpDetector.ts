/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { POTENTIAL_ACP_CLIS } from '@/common/types/acpTypes';
import type { AcpDetectedAgent } from '@/common/types/detectedAgent';
import { ExtensionRegistry } from '@process/extensions';
import { safeExec, safeExecFile } from '@process/utils/safeExec';
import { ProcessConfig } from '@process/utils/initStorage';
import { getEnhancedEnv } from '@process/utils/shellEnv';

/**
 * ACP agent detector — discovers ACP protocol agents from two sources:
 *
 * **Builtin agents** — Well-known CLI tools (claude, qwen, goose, etc.) defined
 * in POTENTIAL_ACP_CLIS. Detected via `which`/`where` on the system PATH.
 *
 * **Extension agents** — Contributed by installed extensions via
 * `contributes.acpAdapters` in the extension manifest. Discovered from
 * ExtensionRegistry at runtime. Verified via CLI availability before inclusion.
 *
 * **Custom agents** — User-defined ACP CLIs from ConfigStorage 'assistants'.
 * No CLI availability check — the user is responsible for the path they provide.
 *
 * This class is a pure detection module — it does NOT own state or coordinate
 * multiple detectors. State management and orchestration live in AgentRegistry.
 */
class AcpDetector {
  private enhancedEnv: NodeJS.ProcessEnv | undefined;

  /** Clear cached environment so newly installed/removed CLIs are detected. */
  clearEnvCache(): void {
    this.enhancedEnv = undefined;
  }

  /** Check if a single CLI command is available on the system PATH (sync). */
  isCliAvailable(cliCommand: string): boolean {
    return this.batchCheckCliAvailabilitySync([cliCommand]).has(cliCommand);
  }

  /**
   * Batch-check which CLI commands are available on the system PATH.
   *
   * POSIX: single shell invocation using `command -v` (shell builtin,
   * no per-command process spawn).
   *
   * Windows: parallel `where` calls with PowerShell fallback.
   */
  async batchCheckCliAvailability(commands: string[]): Promise<Set<string>> {
    if (commands.length === 0) return new Set();

    // Reject commands with shell metacharacters to prevent injection
    const safe = commands.filter((cmd) => /^[a-zA-Z0-9_.-]+$/.test(cmd));
    if (safe.length === 0) return new Set();

    if (!this.enhancedEnv) {
      this.enhancedEnv = getEnhancedEnv();
    }

    const isWindows = process.platform === 'win32';

    if (!isWindows) {
      const checks = safe.map((cmd) => `command -v '${cmd}' >/dev/null 2>&1 && echo '${cmd}'`);
      const script = checks.join('; ') + '; true';
      try {
        const { stdout } = await safeExec(script, { timeout: 3000, env: this.enhancedEnv });
        return new Set(stdout.trim().split('\n').filter(Boolean));
      } catch (err) {
        console.error('[AcpDetector] Batch CLI check failed:', err);
        return new Set();
      }
    }

    const results = await Promise.allSettled(
      safe.map(async (cmd): Promise<string | null> => {
        try {
          await safeExecFile('where', [cmd], { timeout: 3000, env: this.enhancedEnv });
          return cmd;
        } catch (err) {
          console.warn(`[AcpDetector] 'where ${cmd}' failed, trying PowerShell:`, (err as Error).message);
        }
        try {
          await safeExecFile(
            'powershell',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `Get-Command -All ${cmd} | Select-Object -First 1 | Out-Null`,
            ],
            { timeout: 5000, env: this.enhancedEnv }
          );
          return cmd;
        } catch (err) {
          console.warn(`[AcpDetector] PowerShell Get-Command '${cmd}' also failed:`, (err as Error).message);
          return null;
        }
      })
    );
    return new Set(
      results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
        .map((r) => r.value)
    );
  }

  /**
   * Synchronous single-command fallback for callers that cannot await.
   * Used by isCliAvailable() and AgentRegistry for one-off checks.
   */
  private batchCheckCliAvailabilitySync(commands: string[]): Set<string> {
    if (commands.length === 0) return new Set();
    const safe = commands.filter((cmd) => /^[a-zA-Z0-9_.-]+$/.test(cmd));
    if (safe.length === 0) return new Set();

    if (!this.enhancedEnv) {
      this.enhancedEnv = getEnhancedEnv();
    }

    const { execSync } = require('child_process') as typeof import('child_process');
    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';
    const found = new Set<string>();

    for (const cmd of safe) {
      try {
        execSync(`${whichCommand} ${cmd}`, { encoding: 'utf-8', stdio: 'pipe', timeout: 3000, env: this.enhancedEnv });
        found.add(cmd);
        continue;
      } catch (err) {
        if (!isWindows) continue;
        console.warn(`[AcpDetector] sync 'where ${cmd}' failed:`, (err as Error).message);
      }
      try {
        execSync(
          `powershell -NoProfile -NonInteractive -Command "Get-Command -All ${cmd} | Select-Object -First 1 | Out-Null"`,
          { encoding: 'utf-8', stdio: 'pipe', timeout: 5000, env: this.enhancedEnv }
        );
        found.add(cmd);
      } catch (err) {
        console.warn(`[AcpDetector] sync PowerShell '${cmd}' failed:`, (err as Error).message);
      }
    }
    return found;
  }

  /**
   * Detect built-in ACP CLI agents via async batch CLI availability check.
   */
  async detectBuiltinAgents(): Promise<AcpDetectedAgent[]> {
    const available = await this.batchCheckCliAvailability(POTENTIAL_ACP_CLIS.map((cli) => cli.cmd));

    return POTENTIAL_ACP_CLIS.filter((cli) => available.has(cli.cmd)).map((cli) => ({
      id: cli.backendId,
      name: cli.name,
      kind: 'acp' as const,
      available: true,
      backend: cli.backendId,
      cliPath: cli.cmd,
      acpArgs: cli.args,
    }));
  }

  /**
   * Detect extension-contributed ACP adapters via parallel CLI availability check.
   */
  async detectExtensionAgents(): Promise<AcpDetectedAgent[]> {
    try {
      const adapters = ExtensionRegistry.getInstance().getAcpAdapters();
      if (!adapters || adapters.length === 0) return [];

      const candidates: Array<{ agent: AcpDetectedAgent; cliCommand: string }> = [];

      for (const item of adapters) {
        const adapter = item as Record<string, unknown>;
        const id = typeof adapter.id === 'string' ? adapter.id : '';
        const name = typeof adapter.name === 'string' ? adapter.name : id;
        const cliCommand = typeof adapter.cliCommand === 'string' ? adapter.cliCommand : undefined;
        const acpArgs = Array.isArray(adapter.acpArgs)
          ? adapter.acpArgs.filter((v): v is string => typeof v === 'string')
          : undefined;
        const extensionName = typeof adapter._extensionName === 'string' ? adapter._extensionName : 'unknown-extension';
        const connectionType = typeof adapter.connectionType === 'string' ? adapter.connectionType : 'unknown';

        if (connectionType !== 'cli' && connectionType !== 'stdio') continue;
        if (!cliCommand) continue;

        candidates.push({
          cliCommand,
          agent: {
            id,
            name,
            kind: 'acp',
            available: true,
            backend: id,
            cliPath: typeof adapter.defaultCliPath === 'string' ? adapter.defaultCliPath : cliCommand,
            acpArgs,
            isExtension: true,
            extensionName,
          },
        });
      }

      // Extension adapters are trusted — skip CLI availability check.
      // They declare a defaultCliPath (e.g. "bunx @augmentcode/auggie") as fallback,
      // so the CLI doesn't need to be on PATH.
      return candidates.map((c) => c.agent);
    } catch (error) {
      console.warn('[AcpDetector] Failed to load extension ACP adapters:', error);
      return [];
    }
  }

  /**
   * Detect user-defined custom ACP agents from ConfigStorage 'acp.customAgents'.
   * No CLI availability check — user is responsible for the path they provide.
   */
  async detectCustomAgents(): Promise<AcpDetectedAgent[]> {
    try {
      const customAgents = (await ProcessConfig.get('acp.customAgents')) as AcpBackendConfig[] | undefined;
      if (!customAgents?.length) return [];

      return customAgents
        .filter((a) => a.enabled !== false && !a.isPreset && a.defaultCliPath)
        .map((a) => ({
          id: `custom:${a.id}`,
          name: a.name || 'Custom Agent',
          kind: 'acp' as const,
          available: true,
          backend: 'custom',
          cliPath: a.defaultCliPath,
          acpArgs: a.acpArgs,
          customAgentId: a.id,
        }));
    } catch (error) {
      if (error instanceof Error && (error.message.includes('ENOENT') || error.message.includes('not found'))) {
        return [];
      }
      console.warn('[AcpDetector] Unexpected error loading custom agents:', error);
      return [];
    }
  }
}

export const acpDetector = new AcpDetector();
