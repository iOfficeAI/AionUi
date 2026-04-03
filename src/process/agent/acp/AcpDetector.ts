/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendAll, PresetAgentType } from '@/common/types/acpTypes';
import { POTENTIAL_ACP_CLIS } from '@/common/types/acpTypes';
import { ExtensionRegistry } from '@process/extensions';
import { ProcessConfig } from '@process/utils/initStorage';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import { execSync } from 'child_process';

interface DetectedAgent {
  backend: AcpBackendAll;
  name: string;
  cliPath?: string;
  acpArgs?: string[];
  customAgentId?: string;
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: PresetAgentType | string;
  isExtension?: boolean;
  extensionName?: string;
}

/**
 * Global ACP detector — detects available agents from three sources:
 *
 * **Builtin agents** — Defined in POTENTIAL_ACP_CLIS. These are well-known
 * CLI tools (claude, qwen, goose, etc.) that the app knows about at compile
 * time. Each has a real `backendId` (e.g. 'claude', 'qwen') and is detected
 * via `which`/`where` on the system PATH. Gemini is a special builtin that
 * is always present (no CLI detection needed).
 *
 * **Extension agents** — Contributed by installed extensions via
 * `contributes.acpAdapters` in the extension manifest. Discovered from
 * ExtensionRegistry at runtime. Always have `backend: 'custom'` with a
 * `customAgentId` of the form `ext:<extensionName>:<adapterId>` and
 * `isExtension: true`. Also verified via `isCliAvailable` before inclusion.
 *
 * **Custom agents** — User-configured agents from the config store
 * (`acp.customAgents`). Always have `backend: 'custom'`. No CLI detection
 * is performed — the user is responsible for ensuring the CLI is available.
 * Includes preset agents (built-in templates like Academic Paper).
 *
 * All three sources run in parallel during detection, then results are
 * deduplicated by `cliPath` (first wins). Merge order determines priority:
 * Gemini > Builtin > Extension > Custom.
 */
class AcpDetector {
  private detectedAgents: DetectedAgent[] = [];
  private isDetected = false;
  private enhancedEnv: NodeJS.ProcessEnv | undefined;

  /**
   * Check if a CLI command is available on the system PATH.
   */
  private isCliAvailable(cliCommand: string): boolean {
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

  // ---------------------------------------------------------------------------
  // Three detection sources — each returns an array of DetectedAgent candidates
  // ---------------------------------------------------------------------------

  /**
   * Source 1: Built-in POTENTIAL_ACP_CLIS — parallel CLI availability check.
   */
  private async detectBuiltinAgents(): Promise<DetectedAgent[]> {
    const promises = POTENTIAL_ACP_CLIS.map((cli) =>
      Promise.resolve().then((): DetectedAgent | null =>
        this.isCliAvailable(cli.cmd)
          ? { backend: cli.backendId, name: cli.name, cliPath: cli.cmd, acpArgs: cli.args }
          : null
      )
    );

    const results = await Promise.allSettled(promises);
    return results
      .filter((r): r is PromiseFulfilledResult<DetectedAgent> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value);
  }

  /**
   * Source 2: Extension-contributed ACP adapters — parallel CLI availability check.
   */
  private async detectExtensionAgents(): Promise<DetectedAgent[]> {
    try {
      const adapters = ExtensionRegistry.getInstance().getAcpAdapters();
      if (!adapters || adapters.length === 0) return [];

      const candidates: Array<{ agent: DetectedAgent; cliCommand: string }> = [];

      for (const item of adapters) {
        const adapter = item as Record<string, unknown>;
        const id = typeof adapter.id === 'string' ? adapter.id : '';
        const name = typeof adapter.name === 'string' ? adapter.name : id;
        const cliCommand = typeof adapter.cliCommand === 'string' ? adapter.cliCommand : undefined;
        const acpArgs = Array.isArray(adapter.acpArgs)
          ? adapter.acpArgs.filter((v): v is string => typeof v === 'string')
          : undefined;
        const avatar = typeof adapter.avatar === 'string' ? adapter.avatar : undefined;
        const extensionName = typeof adapter._extensionName === 'string' ? adapter._extensionName : 'unknown-extension';
        const connectionType = typeof adapter.connectionType === 'string' ? adapter.connectionType : 'unknown';

        if (connectionType !== 'cli' && connectionType !== 'stdio') continue;
        if (!cliCommand) continue;

        candidates.push({
          cliCommand,
          agent: {
            backend: 'custom' as const,
            name,
            cliPath: cliCommand,
            acpArgs,
            avatar,
            customAgentId: id,
            isExtension: true,
            extensionName,
          },
        });
      }

      const promises = candidates.map((c) =>
        Promise.resolve().then((): DetectedAgent | null => (this.isCliAvailable(c.cliCommand) ? c.agent : null))
      );

      const results = await Promise.allSettled(promises);
      return results
        .filter((r): r is PromiseFulfilledResult<DetectedAgent> => r.status === 'fulfilled' && r.value !== null)
        .map((r) => r.value);
    } catch (error) {
      console.warn('[AcpDetector] Failed to load extension ACP adapters:', error);
      return [];
    }
  }

  /**
   * Source 3: User-configured custom agents (no CLI check — user is responsible).
   */
  private async detectCustomAgents(): Promise<DetectedAgent[]> {
    try {
      const customAgents = await ProcessConfig.get('acp.customAgents');
      if (!customAgents || !Array.isArray(customAgents) || customAgents.length === 0) return [];

      const enabledAgents = customAgents.filter((agent) => agent.enabled && (agent.defaultCliPath || agent.isPreset));
      if (enabledAgents.length === 0) return [];

      return enabledAgents.map((agent) => ({
        backend: 'custom' as const,
        name: agent.name || 'Custom Agent',
        cliPath: agent.defaultCliPath,
        acpArgs: agent.acpArgs,
        customAgentId: agent.id,
        isPreset: agent.isPreset,
        context: agent.context,
        avatar: agent.avatar,
        presetAgentType: agent.presetAgentType,
      }));
    } catch (error) {
      if (error instanceof Error && (error.message.includes('ENOENT') || error.message.includes('not found'))) {
        return [];
      }
      console.warn('[AcpDetector] Unexpected error loading custom agents:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  /**
   * Deduplicate agents by cliPath. First occurrence wins (so ordering of the
   * input arrays determines priority: builtin > extension > custom).
   * Agents without cliPath (e.g. Gemini, presets) are always kept.
   */
  private deduplicate(agents: DetectedAgent[]): DetectedAgent[] {
    const seen = new Set<string>();
    const result: DetectedAgent[] = [];
    // console.debug(`[AcpDetector] Deduplicating ${agents.length} agents: [ ${agents.map((a) => a.name).join(', ')} ]`);
    // console.debug(`[AcpDetector] Deduplicating ${agents.length} agents: [ ${agents.map((a) => JSON.stringify(a)).join('\n')} ]`);
    for (const agent of agents) {
      if (agent.cliPath) {
        if (seen.has(agent.cliPath)) continue;
        seen.add(agent.cliPath);
      }
      result.push(agent);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isDetected) return;

    console.log('[ACP] Starting agent detection...');
    const startTime = Date.now();

    // Run all three sources in parallel
    const [builtinAgents, extensionAgents, customAgents] = await Promise.all([
      this.detectBuiltinAgents(),
      this.detectExtensionAgents(),
      this.detectCustomAgents(),
    ]);

    // Merge with priority: Gemini (always first) > builtin > extension > custom
    const gemini: DetectedAgent = {
      backend: 'gemini',
      name: 'Gemini CLI',
      cliPath: undefined,
      acpArgs: undefined,
    };

    this.detectedAgents = this.deduplicate([gemini, ...builtinAgents, ...extensionAgents, ...customAgents]);
    this.isDetected = true;
    const elapsed = Date.now() - startTime;
    console.log(`[ACP] Detection completed in ${elapsed}ms, found ${this.detectedAgents.length} agents`);
  }

  getDetectedAgents(): DetectedAgent[] {
    return this.detectedAgents;
  }

  hasAgents(): boolean {
    return this.detectedAgents.length > 0;
  }

  /**
   * Refresh custom agents detection only (called when config changes).
   */
  async refreshCustomAgents(): Promise<void> {
    this.detectedAgents = this.detectedAgents.filter((agent) => !(agent.backend === 'custom' && !agent.isExtension));
    const customAgents = await this.detectCustomAgents();
    this.detectedAgents.push(...customAgents);
    this.detectedAgents = this.deduplicate(this.detectedAgents);
  }

  /**
   * Refresh builtin CLI agents only (called when system PATH may have changed).
   * Clears cached env so newly installed/removed CLIs are detected.
   * Gemini is a builtin that requires no CLI — it is always kept.
   */
  async refreshBuiltinAgents(): Promise<void> {
    this.enhancedEnv = undefined;
    // Snapshot old builtin backends for diff logging
    const oldBuiltins = this.detectedAgents
      .filter((a) => a.backend !== 'gemini' && a.backend !== 'custom')
      .map((a) => a.backend);
    // Remove builtin CLI agents (keep Gemini, extension agents, and custom agents)
    this.detectedAgents = this.detectedAgents.filter((a) => a.backend === 'gemini' || a.backend === 'custom');
    const builtinAgents = await this.detectBuiltinAgents();
    const newBuiltins = builtinAgents.map((a) => a.backend);
    // Prepend so builtin priority is preserved after deduplicate
    this.detectedAgents = this.deduplicate([...builtinAgents, ...this.detectedAgents]);

    const added = newBuiltins.filter((b) => !oldBuiltins.includes(b));
    const removed = oldBuiltins.filter((b) => !newBuiltins.includes(b));
    if (added.length > 0 || removed.length > 0) {
      console.log(`[AcpDetector] Builtin agents changed: +[${added.join(', ')}] -[${removed.join(', ')}]`);
    }
  }

  /**
   * Refresh extension-contributed agents (called after ExtensionRegistry.hotReload).
   * Clears cached env so newly installed CLIs are discoverable.
   */
  async refreshExtensionAgents(): Promise<void> {
    this.enhancedEnv = undefined;
    this.detectedAgents = this.detectedAgents.filter((agent) => !agent.isExtension);
    const extensionAgents = await this.detectExtensionAgents();
    this.detectedAgents.push(...extensionAgents);
    this.detectedAgents = this.deduplicate(this.detectedAgents);
  }

  /**
   * Re-run all three detection paths from scratch.
   * Called after hub install since onInstall hooks may have installed new CLIs.
   * Clears cached env to pick up PATH changes.
   */
  async refreshAll(): Promise<void> {
    this.enhancedEnv = undefined;

    const [builtinAgents, extensionAgents, customAgents] = await Promise.all([
      this.detectBuiltinAgents(),
      this.detectExtensionAgents(),
      this.detectCustomAgents(),
    ]);

    const gemini: DetectedAgent = {
      backend: 'gemini',
      name: 'Gemini CLI',
      cliPath: undefined,
      acpArgs: undefined,
    };

    this.detectedAgents = this.deduplicate([gemini, ...builtinAgents, ...extensionAgents, ...customAgents]);
  }
}

export const acpDetector = new AcpDetector();
