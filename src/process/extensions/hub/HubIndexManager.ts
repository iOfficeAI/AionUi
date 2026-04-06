import type { IHubExtension, IHubIndex } from '@/common/types/hub';
import { net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  HUB_REMOTE_URLS,
  HUB_INDEX_FILE,
  HUB_SUPPORTED_SCHEMA_VERSION,
  getHubResourcesDir,
} from '@process/extensions/constants';

/**
 * HubIndexManager
 *
 * Merges local bundled index + remote index, resolves `bundled` flag,
 * and derives runtime status for each extension.
 *
 * Data flow:
 *   1. AcpDetector completes first (external dependency)
 *   2. Load local bundled index
 *   3. Fetch remote index as supplement (local takes priority on conflict)
 *   4. Resolve `bundled` flag: true only if zip exists in Resources dir
 *   5. Derive status: AcpDetector-detected agents → installed
 */
class HubIndexManagerImpl {
  private mergedIndex: Record<string, IHubExtension> = {};
  private localLoaded = false;
  private remoteLoaded = false;

  /**
   * Load and merge indexes.
   * Local index is loaded once. Remote index is retried on every call
   * until it succeeds, so opening the Hub Modal after a network failure
   * will automatically retry.
   */
  public async loadIndexes(): Promise<void> {
    // Step 1: Local index — load once
    if (!this.localLoaded) {
      const localIndex = this.fetchLocalIndex();
      for (const [name, ext] of Object.entries(localIndex)) {
        this.mergedIndex[name] = ext;
      }
      this.localLoaded = true;
    }

    // Step 2: Remote index — retry until success
    if (!this.remoteLoaded) {
      const remoteIndex = await this.fetchRemoteIndex();
      if (Object.keys(remoteIndex).length > 0) {
        // Merge: existing (local) wins on name conflict
        for (const [name, ext] of Object.entries(remoteIndex)) {
          if (!this.mergedIndex[name]) {
            this.mergedIndex[name] = ext;
          }
        }
        this.remoteLoaded = true;
      }
    }

    // Step 3: Resolve `bundled` flag — true only if zip actually exists in Resources
    const hubDir = getHubResourcesDir();
    for (const ext of Object.values(this.mergedIndex)) {
      ext.bundled = fs.existsSync(path.join(hubDir, path.basename(ext.dist.tarball)));
    }
  }

  public getExtensionList(): Record<string, IHubExtension> {
    return this.mergedIndex;
  }

  public getExtension(name: string): IHubExtension | undefined {
    return this.mergedIndex[name];
  }

  /**
   * Validate that the index schemaVersion is compatible with this app.
   * Returns true if compatible, false otherwise.
   */
  private isSchemaCompatible(data: IHubIndex, source: string): boolean {
    if (data.schemaVersion > HUB_SUPPORTED_SCHEMA_VERSION) {
      console.warn(
        `[HubIndexManager] ${source} index schemaVersion ${data.schemaVersion} ` +
          `> supported ${HUB_SUPPORTED_SCHEMA_VERSION}, skipping`
      );
      return false;
    }
    return true;
  }

  private fetchLocalIndex(): Record<string, IHubExtension> {
    try {
      const indexPath = path.join(getHubResourcesDir(), 'index.json');

      if (!fs.existsSync(indexPath)) {
        return {};
      }

      const content = fs.readFileSync(indexPath, 'utf-8');
      const data = JSON.parse(content) as IHubIndex;
      if (!this.isSchemaCompatible(data, 'Local')) return {};
      return data.extensions ?? {};
    } catch (error) {
      console.error('[HubIndexManager] Failed to read local bundled index:', error);
      return {};
    }
  }

  private async fetchRemoteIndex(): Promise<Record<string, IHubExtension>> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Fetch timeout')), 5000)
    );

    for (const baseUrl of HUB_REMOTE_URLS) {
      const url = new URL(HUB_INDEX_FILE, baseUrl).toString();
      try {
        console.log(`[HubIndexManager] Attempting to fetch remote index from: ${url}`);

        const response = (await Promise.race([net.fetch(url), timeoutPromise])) as Response;
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const data = (await response.json()) as IHubIndex;

        if (!this.isSchemaCompatible(data, 'Remote')) return {};
        return data.extensions ?? {};
      } catch (error) {
        console.warn(`[HubIndexManager] Fetch failed from ${url} (${error})`);
      }
    }
    console.error('[HubIndexManager] Failed to fetch remote index from all sources');
    return {};
  }
}

export const hubIndexManager = new HubIndexManagerImpl();
