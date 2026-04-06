import type { HubExtensionStatus, IHubAgentItem, IHubExtension } from '@/common/types/hub';
import { acpDetector } from '@process/agent/acp/AcpDetector';
import { ipcBridge } from '@/common';
import { ExtensionRegistry } from '@process/extensions/ExtensionRegistry';
import { loadPersistedStates, savePersistedStates } from '@process/extensions/lifecycle/statePersistence';

/**
 * HubStateManager
 *
 * Manages transient in-memory states (installing/uninstalling), persistent
 * error tracking, and derives runtime status for hub extensions.
 */
class HubStateManagerImpl {
  // Store transient statuses during active installation or uninstallation
  private transientStates = new Map<string, HubExtensionStatus>();

  // ---------------------------------------------------------------------------
  // Transient state
  // ---------------------------------------------------------------------------

  public getTransientState(name: string): HubExtensionStatus | undefined {
    return this.transientStates.get(name);
  }

  public setTransientState(name: string, status: HubExtensionStatus, error?: string) {
    if (status === 'installing' || status === 'uninstalling') {
      this.transientStates.set(name, status);
    } else {
      // Clear transient state when reaching a final state
      this.transientStates.delete(name);
    }

    // Sync to persistent store if it's an error state
    if (status === 'install_failed' && error) {
      this.setPersistentInstallError(name, error);
    } else if (status === 'installed' || status === 'installing') {
      this.clearPersistentInstallError(name);
    }

    // Broadcast state change to renderer
    ipcBridge.hub.onStateChanged.emit({ name, status, error });
  }

  // ---------------------------------------------------------------------------
  // Persistent error state
  // ---------------------------------------------------------------------------

  public getPersistentInstallError(name: string): string | undefined {
    const states = loadPersistedStates();
    return states.get(name)?.installError;
  }

  private setPersistentInstallError(name: string, error: string) {
    const states = loadPersistedStates();
    const extState = states.get(name) || { enabled: true };

    states.set(name, { ...extState, installError: error });

    savePersistedStates(states);
  }

  private clearPersistentInstallError(name: string) {
    const states = loadPersistedStates();
    const extState = states.get(name);

    if (extState?.installError) {
      states.set(name, { ...extState, installError: undefined });
      savePersistedStates(states);
    }
  }

  // ---------------------------------------------------------------------------
  // Status derivation
  // ---------------------------------------------------------------------------

  /**
   * Returns the full extension list with runtime status derived from
   * ExtensionRegistry, AcpDetector, transient states, and persistent errors.
   *
   * Refreshes builtin agent detection before reading so that CLI changes
   * (install/uninstall) since last check are reflected immediately.
   */
  public async getExtensionListWithStatus(extensions: Record<string, IHubExtension>): Promise<IHubAgentItem[]> {
    // Refresh builtin CLI detection so status reflects current PATH
    const refreshStart = Date.now();
    await acpDetector.refreshBuiltinAgents();
    console.log(`[HubStateManager] refreshBuiltinAgents completed in ${Date.now() - refreshStart}ms`);

    const loadedByName = new Map(
      ExtensionRegistry.getInstance()
        .getLoadedExtensions()
        .map((e) => [e.manifest.name, e])
    );

    const detectedAgents = acpDetector.getDetectedAgents();
    const detectedBackends = new Set<string>(
      detectedAgents
        .map((a) => {
          if (a.backend === 'custom' && a.isExtension) return a.customAgentId ?? a.name;
          if (a.backend !== 'custom') return a.backend;
          return null;
        })
        .filter((b): b is string => b !== null)
    );

    console.log(
      `[HubStateManager] Status context: ${loadedByName.size} loaded extension(s) [${[...loadedByName.keys()].join(', ')}], ` +
        `${detectedAgents.length} detected agent(s) [${[...detectedBackends].join(', ')}], ` +
        `${Object.keys(extensions).length} hub extension(s)`
    );

    const result: IHubAgentItem[] = [];

    for (const ext of Object.values(extensions)) {
      const status = this.deriveStatus(ext, loadedByName, detectedBackends);

      result.push({
        ...ext,
        status,
        installError: this.getPersistentInstallError(ext.name),
      });
    }

    return result;
  }

  /**
   * Derive the runtime status for a single hub extension.
   *
   * Priority:
   *   1. Transient state (installing / uninstalling)
   *   2. Persistent install error
   *   3. Loaded in ExtensionRegistry (check for update)
   *   4. AcpDetector already detected all contributed backends → installed
   *   5. not_installed
   */
  private deriveStatus(
    ext: IHubExtension,
    loadedByName: Map<string, { directory: string }>,
    detectedBackends: Set<string>
  ): HubExtensionStatus {
    // 1. Transient state (installing / uninstalling)
    const transient = this.transientStates.get(ext.name);
    if (transient) return transient;

    // 2. Persistent install error
    const hasError = this.getPersistentInstallError(ext.name);
    if (hasError) return 'install_failed';

    // 3. Loaded in ExtensionRegistry — check for update
    // TODO: integrity 各平台不一致，暂时无法使用。后续可以考虑在安装时记录版本号或自定义 hash 来辅助判断更新。
    // const loaded = loadedByName.get(ext.name);
    // if (loaded) {
    //   const manifestPath = path.join(loaded.directory, EXTENSION_MANIFEST_FILE);
    //   try {
    //     if (fs.existsSync(manifestPath)) {
    //       const localManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    //       if (localManifest.dist?.integrity && localManifest.dist.integrity !== ext.dist.integrity) {
    //         return 'update_available';
    //       }
    //     }
    //   } catch {
    //     // Ignore read errors — treat as installed
    //   }
    // }

    // 4. All contributed acpAdapters are already detected on system
    const adapterIds = ext.contributes?.acpAdapters;
    if (adapterIds && adapterIds.length > 0) {
      if (adapterIds.every((id) => detectedBackends.has(id))) {
        return 'installed';
      }
    }

    return 'not_installed';
  }
}

export const hubStateManager = new HubStateManagerImpl();
