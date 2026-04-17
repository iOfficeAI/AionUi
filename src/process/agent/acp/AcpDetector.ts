/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { POTENTIAL_ACP_CLIS } from '@/common/types/acpTypes';
import type { AcpDetectedAgent } from '@/common/types/detectedAgent';
import { ExtensionRegistry } from '@process/extensions';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import { execSync } from 'child_process';

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
 * This class is a pure detection module — it does NOT own state or coordinate
 * multiple detectors. State management and orchestration live in AgentRegistry.
 */
class AcpDetector {
  private enhancedEnv: NodeJS.ProcessEnv | undefined;

  /** Clear cached environment so newly installed/removed CLIs are detected. */
  clearEnvCache(): void {
    this.enhancedEnv = undefined;
  }

  /** Check if a CLI command is available on the system PATH. */
  isCliAvailable(cliCommand: string): boolean {
    // Reject commands with shell metacharacters to prevent injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(cliCommand)) return false;

    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';

    if (!this.enhancedEnv) {
      this.enhancedEnv = getEnhancedEnv();
    }

    try {
      execSync(`${whichCommand} ${cliCommand}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 1000,
        env: this.enhancedEnv,
      });
      return true;
    } catch {
      if (!isWindows) return false;
    }

    if (isWindows) {
      try {
        execSync(
          `powershell -NoProfile -NonInteractive -Command "Get-Command -All ${cliCommand} | Select-Object -First 1 | Out-Null"`,
          {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 1000,
            env: this.enhancedEnv,
          }
        );
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Detect built-in ACP CLI agents via parallel CLI availability check.
   */
  async detectBuiltinAgents(): Promise<AcpDetectedAgent[]> {
    const promises = POTENTIAL_ACP_CLIS.map((cli) =>
      Promise.resolve().then((): AcpDetectedAgent | null =>
        this.isCliAvailable(cli.cmd)
          ? {
              id: cli.backendId,
              name: cli.name,
              kind: 'acp',
              available: true,
              backend: cli.backendId,
              cliPath: cli.cmd,
              acpArgs: cli.args,
            }
          : null
      )
    );

    const results = await Promise.allSettled(promises);
    return results
      .filter((r): r is PromiseFulfilledResult<AcpDetectedAgent> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value);
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
}

export const acpDetector = new AcpDetector();
