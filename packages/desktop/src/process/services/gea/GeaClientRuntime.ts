/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, net, powerMonitor } from 'electron';
import path from 'node:path';
import { platform, arch } from 'node:os';
import type { GeaLarkAuthService } from '@aionui/web-host';
import { ClientPresenceService } from './ClientPresenceService';
import {
  GeaClientAdapter,
  GeaClientError,
  type ClientVersion,
  type GeaClientRelease,
} from '@/common/adapter/geaClient';
import type { UpdateCheckResult } from '@/common/update/updateTypes';
import { getGeaEnvironment } from './GeaEnvironmentService';
import { MandatoryUpdatePolicyStore, type MandatoryUpdateRequirement } from './MandatoryUpdatePolicy';

/** Explicit admission for development or a separately marked packaged acceptance build. */
export function isGeaClientIntegrationEnabled(): boolean {
  return (
    process.env.AIONUI_GEA_CLIENT_INTEGRATION === '1' &&
    (!app.isPackaged || process.env.AIONUI_GEA_PACKAGED_ACCEPTANCE === '1')
  );
}

export function getGeaClientVersion(): ClientVersion {
  const raw = process.env.AIONUI_GEA_VERSION_CODE;
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new GeaClientError('CLIENT_VERSION_UNCONFIGURED');
  if ((platform() !== 'darwin' && platform() !== 'win32') || (arch() !== 'arm64' && arch() !== 'x64')) {
    throw new GeaClientError('CLIENT_PLATFORM_UNSUPPORTED');
  }
  return {
    platform: platform() === 'darwin' ? 'MACOS' : 'WINDOWS',
    architecture: arch() === 'x64' ? 'x86_64' : 'arm64',
    versionName: app.getVersion(),
    versionCode: Number(raw),
  };
}

export function createGeaClientAdapter(): GeaClientAdapter {
  return new GeaClientAdapter(
    getGeaEnvironment().baseUrl,
    (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init),
    // Electron net.fetch rejects manual redirects. Package transfers are anonymous
    // and must expose each Location to the adapter before following it.
    (input, init) => globalThis.fetch(input, init)
  );
}

let checking: Promise<UpdateCheckResult> | undefined;
let checkedRelease: GeaClientRelease | undefined;
let releaseGeneration = 0;

export function resetGeaClientEnvironment(): void {
  stopGeaClientPresence();
  releaseGeneration += 1;
  checking = undefined;
  checkedRelease = undefined;
}
export function getCheckedGeaRelease(url: string): GeaClientRelease {
  if (!checkedRelease || checkedRelease.downloadUrl !== url || checkedRelease.distributionType !== 'UPLOAD')
    throw new GeaClientError('CLIENT_RELEASE_UNCHECKED');
  return checkedRelease;
}

const mapRelease = (version: ClientVersion, release: GeaClientRelease): UpdateCheckResult => {
  const asset =
    release.distributionType === 'UPLOAD' && release.sha256 && release.fileSize && release.downloadUrl
      ? { name: `GEAUi-${release.versionCode}`, url: release.downloadUrl, size: release.fileSize }
      : undefined;
  return {
    currentVersion: version.versionName,
    currentVersionCode: version.versionCode,
    updateAvailable: release.upgradeAvailable,
    ...(release.upgradeAvailable
      ? {
          latest: {
            tagName: release.versionName!,
            version: release.versionName!,
            versionCode: release.versionCode!,
            mandatory: release.mandatory,
            body: release.releaseNotes ?? '',
            htmlUrl: '',
            prerelease: false,
            draft: false,
            assets: asset ? [asset] : [],
            recommendedAsset: asset,
          },
        }
      : {}),
  };
};

const mapPersistedRequirement = (
  version: ClientVersion,
  requirement: MandatoryUpdateRequirement
): UpdateCheckResult => ({
  currentVersion: version.versionName,
  currentVersionCode: version.versionCode,
  updateAvailable: true,
  latest: {
    tagName: requirement.versionName,
    version: requirement.versionName,
    versionCode: requirement.versionCode,
    mandatory: true,
    body: requirement.releaseNotes,
    htmlUrl: '',
    prerelease: false,
    draft: false,
    assets: [],
  },
});

export async function checkGeaClientRelease(): Promise<UpdateCheckResult> {
  if (checking) return checking;
  const generation = releaseGeneration;
  const assertCurrent = () => {
    if (generation !== releaseGeneration) throw new GeaClientError('CLIENT_ENVIRONMENT_CHANGED');
  };
  checking = (async () => {
    const version = getGeaClientVersion();
    const environment = getGeaEnvironment();
    const policy = new MandatoryUpdatePolicyStore(app.getPath('userData'), environment.environmentId);
    let requirement: MandatoryUpdateRequirement | null = null;
    try {
      requirement = await policy.load();
      if (requirement && version.versionCode >= requirement.versionCode) {
        requirement = null;
        await policy.clear();
      }
    } catch {
      console.warn('[GEA] Mandatory update requirement could not be read');
    }

    let release: GeaClientRelease;
    assertCurrent();
    try {
      release = await createGeaClientAdapter().check(version);
    } catch (error) {
      assertCurrent();
      checkedRelease = undefined;
      if (requirement) return mapPersistedRequirement(version, requirement);
      throw error;
    }
    assertCurrent();
    const confirmedRequirement = release.mandatory
      ? {
          versionCode: release.versionCode!,
          versionName: release.versionName!,
          releaseNotes: release.releaseNotes ?? '',
        }
      : null;
    if (confirmedRequirement && requirement && requirement.versionCode > confirmedRequirement.versionCode) {
      checkedRelease = undefined;
      return mapPersistedRequirement(version, requirement);
    }
    checkedRelease = release;
    try {
      if (confirmedRequirement) {
        await policy.save(confirmedRequirement);
      } else {
        await policy.clear();
      }
    } catch {
      console.warn('[GEA] Mandatory update requirement could not be persisted');
    }
    assertCurrent();
    return mapRelease(version, release);
  })();
  try {
    return await checking;
  } finally {
    if (generation === releaseGeneration) checking = undefined;
  }
}

let presence: ClientPresenceService | undefined;
let removeListeners: (() => void) | undefined;

export async function startGeaClientPresence(
  auth: GeaLarkAuthService,
  onAuthRequired: () => Promise<void>
): Promise<void> {
  if (!isGeaClientIntegrationEnabled()) return;
  if (!auth.getStatus().authenticated) {
    stopGeaClientPresence();
    return;
  }
  try {
    if (!presence) {
      presence = new ClientPresenceService(
        path.join(app.getPath('userData'), 'client-device-instance-id'),
        createGeaClientAdapter(),
        getGeaClientVersion(),
        auth,
        onAuthRequired
      );
      const suspend = () => presence?.stop();
      const resume = () => {
        void presence?.start();
      };
      powerMonitor.on('suspend', suspend);
      powerMonitor.on('resume', resume);
      app.once('before-quit', stopGeaClientPresence);
      removeListeners = () => {
        powerMonitor.removeListener('suspend', suspend);
        powerMonitor.removeListener('resume', resume);
        app.removeListener('before-quit', stopGeaClientPresence);
      };
    }
    await presence.start();
  } catch {
    // Do not turn telemetry configuration failure into a login failure.
    console.warn('[GEA] Client presence could not start');
  }
}

export function stopGeaClientPresence(): void {
  presence?.stop();
  presence = undefined;
  removeListeners?.();
  removeListeners = undefined;
}
