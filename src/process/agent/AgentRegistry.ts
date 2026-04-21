/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@process/agent/acp/AcpDetector';
import type {
  AcpDetectedAgent,
  AionrsDetectedAgent,
  DetectedAgent,
  GeminiDetectedAgent,
  NanobotDetectedAgent,
  OpenClawDetectedAgent,
  RemoteDetectedAgent,
} from '@/common/types/detectedAgent';
import { isAgentKind } from '@/common/types/detectedAgent';
import type { RemoteAgentConfig } from '@process/agent/remote/types';

/**
 * Central registry for ALL detected execution engines.
 *
 * Coordinates sub-detectors, owns merged state, and provides the unified
 * `getDetectedAgents()` API consumed by IPC bridges.
 *
 * Sources:
 *   - Gemini       — always present (no CLI detection)
 *   - ACP builtin  — CLI agents on PATH (claude, qwen, codex, …)
 *   - ACP extension — contributed by hub extensions
 *   - Remote       — user-configured WebSocket agents (from DB)
 *   - Aionrs       — always present (Rust binary, availability resolved at runtime)
 *   - OpenClaw GW  — detected via `openclaw` CLI on PATH
 *   - Nanobot      — detected via `nanobot` CLI on PATH
 *   - Custom ACP   — user-defined ACP CLIs from ConfigStorage 'assistants'
 *
 * Preset assistants (prompt-only presets with no CLI binary) are NOT
 * execution engines — they live in the configuration layer and reference
 * execution engines by backend type.
 */
class AgentRegistry {
  private detectedAgents: DetectedAgent[] = [];
  private isInitialized = false;
  private mutationQueue: Promise<void> = Promise.resolve();

  // Cache sub-detector results for partial refresh
  private builtinAgents: AcpDetectedAgent[] = [];
  private extensionAgents: AcpDetectedAgent[] = [];
  private remoteAgents: RemoteDetectedAgent[] = [];
  private otherAgents: DetectedAgent[] = [];
  private customAgents: AcpDetectedAgent[] = [];

  private createGeminiAgent(): GeminiDetectedAgent {
    return {
      id: 'gemini',
      name: 'Gemini CLI',
      kind: 'gemini',
      available: true,
      backend: 'gemini',
    };
  }

  private createAionrsAgent(): AionrsDetectedAgent {
    return {
      id: 'aionrs',
      name: 'Aion CLI',
      kind: 'aionrs',
      available: true,
      backend: 'aionrs',
    };
  }

  /**
   * Detect non-ACP CLI agents (openclaw-gateway, nanobot) via CLI availability.
   * Uses the same `which`/`where` check as AcpDetector.
   */
  private detectOtherCliAgents(): DetectedAgent[] {
    const agents: DetectedAgent[] = [];

    if (acpDetector.isCliAvailable('openclaw')) {
      agents.push({
        id: 'openclaw-gateway',
        name: 'OpenClaw Gateway',
        kind: 'openclaw-gateway',
        available: true,
        backend: 'openclaw-gateway',
        cliPath: 'openclaw',
      } satisfies OpenClawDetectedAgent);
    }

    if (acpDetector.isCliAvailable('nanobot')) {
      agents.push({
        id: 'nanobot',
        name: 'Nanobot',
        kind: 'nanobot',
        available: true,
        backend: 'nanobot',
        cliPath: 'nanobot',
      } satisfies NanobotDetectedAgent);
    }

    return agents;
  }

  private async loadRemoteAgents(): Promise<RemoteDetectedAgent[]> {
    try {
      // Dynamic import to avoid circular dependency at module load time
      const { getDatabase } = await import('@process/services/database');
      const db = await getDatabase();
      const configs: RemoteAgentConfig[] = db.getRemoteAgents();
      return configs.map((config) => ({
        id: `remote:${config.id}`,
        name: config.name,
        kind: 'remote' as const,
        available: true,
        backend: 'remote',
        remoteAgentId: config.id,
        url: config.url,
        protocol: config.protocol,
        authType: config.authType,
      }));
    } catch (error) {
      console.error('[AgentRegistry] Failed to load remote agents:', error);
      return [];
    }
  }

  /**
   * Deduplicate agents by backend ID. First occurrence wins — merge order
   * determines priority: Aionrs > Gemini > Builtin > Other > Remote > Extension > Custom.
   * When an extension contributes the same backend as a builtin, the builtin wins.
   *
   * Remote and custom agents share their `backend` string but are individually
   * addressable via their unique `id`, so they skip backend dedup.
   */
  private deduplicate(agents: DetectedAgent[]): DetectedAgent[] {
    const seen = new Set<string>();
    const result: DetectedAgent[] = [];

    for (const agent of agents) {
      const key = agent.kind === 'remote' || agent.backend === 'custom' ? agent.id : agent.backend;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(agent);
    }

    return result;
  }

  // prettier-ignore
  private merge(): void {
    this.detectedAgents = this.deduplicate([
      this.createAionrsAgent(),
      this.createGeminiAgent(),
      ...this.builtinAgents,
      ...this.otherAgents,
      ...this.remoteAgents,
      ...this.extensionAgents,
      ...this.customAgents,
    ]);
  }

  private async runExclusiveMutation<T>(task: () => Promise<T>): Promise<T> {
    const previousMutation = this.mutationQueue;
    let releaseCurrentMutation: (() => void) | undefined;

    this.mutationQueue = new Promise<void>((resolve) => {
      releaseCurrentMutation = resolve;
    });

    await previousMutation;

    try {
      return await task();
    } finally {
      releaseCurrentMutation?.();
    }
  }

  /**
   * Run all detection paths and update cached results.
   * Shared by initialize() and refreshAll().
   */
  private async detectAll(): Promise<void> {
    acpDetector.clearEnvCache();

    const [builtinAgents, extensionAgents, remoteAgents, customAgents] = await Promise.all([
      acpDetector.detectBuiltinAgents(),
      acpDetector.detectExtensionAgents(),
      this.loadRemoteAgents(),
      acpDetector.detectCustomAgents(),
    ]);

    this.builtinAgents = builtinAgents;
    this.extensionAgents = extensionAgents;
    this.remoteAgents = remoteAgents;
    this.customAgents = customAgents;
    this.otherAgents = this.detectOtherCliAgents();
    this.merge();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    await this.runExclusiveMutation(async () => {
      if (this.isInitialized) return;

      console.log('[AgentRegistry] Starting agent detection...');
      const startTime = Date.now();

      await this.detectAll();
      this.isInitialized = true;

      const elapsed = Date.now() - startTime;
      const agentSummary = this.detectedAgents.map((a) => a.name).join(', ');
      console.log(
        `[AgentRegistry] Completed in ${elapsed}ms, found ${this.detectedAgents.length} agents: ${agentSummary}`
      );
    });
  }

  getDetectedAgents(): DetectedAgent[] {
    return [...this.detectedAgents];
  }

  getAcpAgents(): AcpDetectedAgent[] {
    return this.detectedAgents.filter((a): a is AcpDetectedAgent => isAgentKind(a, 'acp'));
  }

  hasAgents(): boolean {
    return this.detectedAgents.length > 0;
  }

  /**
   * Refresh builtin CLI agents only (called when system PATH may have changed).
   * Clears cached env so newly installed/removed CLIs are detected.
   */
  async refreshBuiltinAgents(): Promise<void> {
    await this.runExclusiveMutation(async () => {
      acpDetector.clearEnvCache();

      const oldBuiltins = this.builtinAgents.map((a) => a.backend);
      this.builtinAgents = await acpDetector.detectBuiltinAgents();
      this.otherAgents = this.detectOtherCliAgents();
      const newBuiltins = this.builtinAgents.map((a) => a.backend);
      this.merge();

      const added = newBuiltins.filter((b) => !oldBuiltins.includes(b));
      const removed = oldBuiltins.filter((b) => !newBuiltins.includes(b));
      if (added.length > 0 || removed.length > 0) {
        console.log(`[AgentRegistry] Builtin agents changed: +[${added.join(', ')}] -[${removed.join(', ')}]`);
      }
    });
  }

  /**
   * Refresh extension-contributed agents (called after ExtensionRegistry.hotReload).
   * Clears cached env so newly installed CLIs are discoverable.
   */
  async refreshExtensionAgents(): Promise<void> {
    await this.runExclusiveMutation(async () => {
      acpDetector.clearEnvCache();
      this.extensionAgents = await acpDetector.detectExtensionAgents();
      this.merge();
    });
  }

  /**
   * Refresh remote agents from the database.
   * Called when remote agent config changes (create/update/delete).
   */
  async refreshRemoteAgents(): Promise<void> {
    await this.runExclusiveMutation(async () => {
      this.remoteAgents = await this.loadRemoteAgents();
      this.merge();
    });
  }

  /**
   * Refresh custom ACP agents from ConfigStorage 'assistants'.
   * Called after the user adds/edits/deletes a custom agent in Settings.
   */
  async refreshCustomAgents(): Promise<void> {
    await this.runExclusiveMutation(async () => {
      this.customAgents = await acpDetector.detectCustomAgents();
      this.merge();
    });
  }

  /**
   * Re-run all detection paths from scratch.
   * Called after hub install since onInstall hooks may have installed new CLIs.
   */
  async refreshAll(): Promise<void> {
    await this.runExclusiveMutation(() => this.detectAll());
  }
}

export const agentRegistry = new AgentRegistry();
