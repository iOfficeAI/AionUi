/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LarkCliStatus } from '@/common/adapter/ipcBridge';
import { activateLarkCliDirectory, getBundledLarkCliDirectory } from '@/process/startup/bundledCliPath';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const RELEASE_ROOT = 'https://github.com/larksuite/cli/releases/download';
const LATEST_RELEASE_URL = 'https://api.github.com/repos/larksuite/cli/releases/latest';

type ActiveVersion = { version: string; runtimeKey: string };
type ManagedManifest = ActiveVersion & { binarySha256: string; archiveSha256: string; source: string };
type ReleaseResponse = { tag_name?: string };
type ExecFileRunner = (file: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => Promise<unknown>;

export type LarkCliManagerOptions = {
  userDataPath: string;
  resourcesPath: string;
  cwd: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  arch: string;
  env: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  execFile?: ExecFileRunner;
};

const normalizeVersion = (version: string): string => {
  const normalized = version.trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) throw new Error('Invalid Lark CLI version');
  return normalized;
};

const getBinaryName = (platform: NodeJS.Platform): string => (platform === 'win32' ? 'lark-cli.exe' : 'lark-cli');

const getAssetName = (platform: NodeJS.Platform, arch: string, version: string): string => {
  const platformNames: Partial<Record<NodeJS.Platform, string>> = {
    win32: 'windows',
    darwin: 'darwin',
    linux: 'linux',
  };
  const archNames: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };
  const platformName = platformNames[platform];
  const archName = archNames[arch];
  if (!platformName || !archName) throw new Error('Unsupported Lark CLI runtime');
  const extension = platform === 'win32' ? '.zip' : '.tar.gz';
  return `lark-cli-${normalizeVersion(version)}-${platformName}-${archName}${extension}`;
};

const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');

const parseChecksum = (content: string, assetName: string): string => {
  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+(.+)$/);
    if (match?.[2] === assetName) return match[1].toLowerCase();
  }
  throw new Error('Checksum entry not found for Lark CLI asset');
};

const compareVersions = (left: string, right: string): number => {
  const a = normalizeVersion(left).split('-')[0].split('.').map(Number);
  const b = normalizeVersion(right).split('-')[0].split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
};

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const findBinary = async (directory: string, binaryName: string): Promise<string | null> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const direct = entries.find((entry) => entry.isFile() && entry.name === binaryName);
  if (direct) return path.join(directory, direct.name);
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => findBinary(path.join(directory, entry.name), binaryName))
  );
  return nested.find((candidate): candidate is string => candidate !== null) ?? null;
};

export class LarkCliManager {
  private readonly fetcher: typeof fetch;
  private readonly exec: ExecFileRunner;
  private readonly managedRoot: string;
  private readonly runtimeKey: string;

  constructor(private readonly options: LarkCliManagerOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.exec = options.execFile ?? execFileAsync;
    this.managedRoot = path.join(options.userDataPath, 'tools', 'lark-cli');
    this.runtimeKey = `${options.platform}-${options.arch}`;
  }

  private get activePath(): string {
    return path.join(this.managedRoot, 'active.json');
  }

  private get bundledRoot(): string {
    return path.join(
      this.options.isPackaged ? this.options.resourcesPath : path.join(this.options.cwd, 'resources'),
      'bundled-lark-cli'
    );
  }

  private async fetchBytes(url: string): Promise<Uint8Array> {
    const response = await this.fetcher(url, { headers: { Accept: 'application/octet-stream' } });
    if (!response.ok) throw new Error(`Lark CLI download failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.fetcher(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`Lark CLI update check failed (${response.status})`);
    return response.text();
  }

  private async getBundledVersion(): Promise<string | null> {
    const directory = getBundledLarkCliDirectory({
      isPackaged: this.options.isPackaged,
      resourcesPath: this.options.resourcesPath,
      cwd: this.options.cwd,
      platform: this.options.platform,
      arch: this.options.arch,
      env: this.options.env,
    });
    if (!directory) return null;
    const manifest = await readJson<{ version?: string }>(path.join(directory, 'manifest.json'));
    return manifest?.version ? normalizeVersion(manifest.version) : null;
  }

  private async getManagedVersion(): Promise<{ version: string; directory: string } | null> {
    const active = await readJson<ActiveVersion>(this.activePath);
    if (!active || active.runtimeKey !== this.runtimeKey) return null;
    const directory = path.join(this.managedRoot, active.version, this.runtimeKey);
    const manifest = await readJson<ManagedManifest>(path.join(directory, 'manifest.json'));
    const binaryPath = path.join(directory, getBinaryName(this.options.platform));
    if (!manifest || manifest.version !== active.version || manifest.runtimeKey !== this.runtimeKey) return null;
    try {
      const binary = await fs.readFile(binaryPath);
      if (sha256(binary) !== manifest.binarySha256) return null;
      return { version: active.version, directory };
    } catch {
      return null;
    }
  }

  async getStatus(latestVersion?: string): Promise<LarkCliStatus> {
    const [managed, bundledVersion] = await Promise.all([this.getManagedVersion(), this.getBundledVersion()]);
    const currentVersion = managed?.version ?? bundledVersion;
    const normalizedLatest = latestVersion ? normalizeVersion(latestVersion) : undefined;
    return {
      bundledVersion,
      currentVersion,
      latestVersion: normalizedLatest,
      source: managed ? 'managed' : 'bundled',
      supported:
        ['win32', 'darwin', 'linux'].includes(this.options.platform) && ['x64', 'arm64'].includes(this.options.arch),
      updateAvailable: Boolean(
        currentVersion && normalizedLatest && compareVersions(normalizedLatest, currentVersion) > 0
      ),
    };
  }

  async checkForUpdates(): Promise<LarkCliStatus> {
    const release = JSON.parse(await this.fetchText(LATEST_RELEASE_URL)) as ReleaseResponse;
    if (!release.tag_name) throw new Error('Latest Lark CLI release has no version');
    return this.getStatus(release.tag_name);
  }

  async install(version: string): Promise<LarkCliStatus> {
    const normalizedVersion = normalizeVersion(version);
    const assetName = getAssetName(this.options.platform, this.options.arch, normalizedVersion);
    const releaseBase = `${RELEASE_ROOT}/v${normalizedVersion}`;
    const [checksums, archive] = await Promise.all([
      this.fetchText(`${releaseBase}/checksums.txt`),
      this.fetchBytes(`${releaseBase}/${assetName}`),
    ]);
    const expectedChecksum = parseChecksum(checksums, assetName);
    const archiveChecksum = sha256(archive);
    if (archiveChecksum !== expectedChecksum) throw new Error('Lark CLI checksum mismatch');

    const temporaryRoot = path.join(this.managedRoot, `.install-${randomUUID()}`);
    const archivePath = path.join(temporaryRoot, assetName);
    const extractedPath = path.join(temporaryRoot, 'extracted');
    const stagedPath = path.join(temporaryRoot, 'staged');
    const targetPath = path.join(this.managedRoot, normalizedVersion, this.runtimeKey);
    await fs.mkdir(extractedPath, { recursive: true });
    await fs.writeFile(archivePath, archive);
    try {
      if (this.options.platform === 'win32') {
        await this.exec(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:LARK_CLI_ARCHIVE -DestinationPath $env:LARK_CLI_DEST -Force",
          ],
          { env: { ...this.options.env, LARK_CLI_ARCHIVE: archivePath, LARK_CLI_DEST: extractedPath } }
        );
      } else {
        await this.exec('tar', ['-xzf', archivePath, '-C', extractedPath]);
      }
      const binaryName = getBinaryName(this.options.platform);
      const extractedBinary = await findBinary(extractedPath, binaryName);
      if (!extractedBinary) throw new Error('Lark CLI binary is missing from the release archive');
      await fs.mkdir(stagedPath, { recursive: true });
      const stagedBinary = path.join(stagedPath, binaryName);
      await fs.copyFile(extractedBinary, stagedBinary);
      if (this.options.platform !== 'win32') await fs.chmod(stagedBinary, 0o755);
      const binarySha256 = sha256(await fs.readFile(stagedBinary));
      const manifest: ManagedManifest = {
        version: normalizedVersion,
        runtimeKey: this.runtimeKey,
        binarySha256,
        archiveSha256: archiveChecksum,
        source: `${releaseBase}/${assetName}`,
      };
      await fs.writeFile(path.join(stagedPath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const backupTargetPath = `${targetPath}.backup-${randomUUID()}`;
      const hadPreviousTarget = await pathExists(targetPath);
      if (hadPreviousTarget) await fs.rename(targetPath, backupTargetPath);
      const stagedActivePath = path.join(this.managedRoot, `.active-${randomUUID()}.tmp`);
      const backupActivePath = path.join(this.managedRoot, `.active-${randomUUID()}.backup`);
      const hadPreviousActive = await pathExists(this.activePath);
      try {
        await fs.rename(stagedPath, targetPath);
        await fs.writeFile(
          stagedActivePath,
          `${JSON.stringify({ version: normalizedVersion, runtimeKey: this.runtimeKey })}\n`
        );
        if (hadPreviousActive) await fs.rename(this.activePath, backupActivePath);
        try {
          await fs.rename(stagedActivePath, this.activePath);
        } catch (error) {
          if (hadPreviousActive) await fs.rename(backupActivePath, this.activePath);
          throw error;
        }
        await fs.rm(backupActivePath, { force: true });
        await fs.rm(backupTargetPath, { recursive: true, force: true });
      } catch (error) {
        await fs.rm(targetPath, { recursive: true, force: true });
        if (hadPreviousTarget && (await pathExists(backupTargetPath))) {
          await fs.rename(backupTargetPath, targetPath);
        }
        throw error;
      }
      activateLarkCliDirectory({
        directory: targetPath,
        managedRoot: this.managedRoot,
        bundledRoot: this.bundledRoot,
        platform: this.options.platform,
        env: this.options.env,
      });
      return this.getStatus(normalizedVersion);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  async restoreBundled(): Promise<LarkCliStatus> {
    const directory = getBundledLarkCliDirectory({
      isPackaged: this.options.isPackaged,
      resourcesPath: this.options.resourcesPath,
      cwd: this.options.cwd,
      platform: this.options.platform,
      arch: this.options.arch,
      env: this.options.env,
    });
    if (!directory) throw new Error('Bundled Lark CLI is unavailable');
    await fs.rm(this.activePath, { force: true });
    activateLarkCliDirectory({
      directory,
      managedRoot: this.managedRoot,
      bundledRoot: this.bundledRoot,
      platform: this.options.platform,
      env: this.options.env,
    });
    return this.getStatus();
  }
}
