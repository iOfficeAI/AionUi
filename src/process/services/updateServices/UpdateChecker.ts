/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { VersionInfo } from '@/common/update/models/VersionInfo';
import { UpdatePackage } from '@/common/update/models/UpdatePackage';
import { 
  UPDATE_CONFIG, 
  UpdateErrorType, 
  PlatformType, 
  ArchitectureType,
  parseFilename,
  generateFilenamePattern
} from '@/common/update/updateConfig';
import { 
  UpdateError, 
  NetworkError, 
  UpdateErrorFactory, 
  RetryManager 
} from '@/common/update/updateErrors';
import * as semver from 'semver';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * 更新检查结果接口
 */
export interface UpdateCheckResult {
  success: boolean;
  isUpdateAvailable: boolean;
  versionInfo?: VersionInfo;
  availablePackages?: UpdatePackage[];
  error?: UpdateError;
  lastCheckTime: number;
  cacheUsed: boolean;
}

/**
 * GitHub Release 接口
 */
interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: Array<{
    name: string;
    download_url: string;
    size: number;
    content_type?: string;
  }>;
  prerelease: boolean;
  draft: boolean;
}

/**
 * 优化后的更新检查服务
 * 
 * 改进点：
 * - 使用统一的配置管理
 * - 完善的错误处理和重试机制
 * - 优化的缓存策略
 * - 更好的类型安全
 * - 平台检测逻辑统一
 */
export class UpdateChecker {
  private cacheData: Map<string, { result: UpdateCheckResult; timestamp: number }> = new Map();
  private retryManager: RetryManager;
  private currentPlatform: PlatformType;
  private currentArch: ArchitectureType;

  constructor() {
    this.retryManager = new RetryManager(
      UPDATE_CONFIG.CACHE.MAX_RETRIES,
      UPDATE_CONFIG.CACHE.RETRY_DELAY
    );
    
    // 初始化平台信息
    this.currentPlatform = this.detectPlatform();
    this.currentArch = this.detectArchitecture();
  }

  /**
   * 执行更新检查
   */
  async checkForUpdates(force: boolean = false): Promise<UpdateCheckResult> {
    const cacheKey = 'update-check';
    
    console.log('[UpdateChecker] Starting update check, force:', force);
    
    try {
      // 检查缓存
      if (!force) {
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
          console.log('[UpdateChecker] Using cached result');
          return { ...cachedResult, cacheUsed: true };
        }
      }

      // 执行检查（带重试机制）
      console.log('[UpdateChecker] Performing update check with retry mechanism');
      const result = await this.retryManager.execute(async () => {
        return await this.performUpdateCheck();
      });

      console.log('[UpdateChecker] Update check completed successfully:', { 
        success: result.success, 
        isUpdateAvailable: result.isUpdateAvailable,
        currentVersion: result.versionInfo?.current,
        latestVersion: result.versionInfo?.latest
      });

      // 缓存结果
      this.setCachedResult(cacheKey, result);
      
      return { ...result, cacheUsed: false };
      
    } catch (error) {
      console.error('[UpdateChecker] Update check failed:', error);
      
      const updateError = UpdateErrorFactory.fromError(error as Error, UpdateErrorType.UNKNOWN_ERROR, {
        operation: 'checkForUpdates',
        force,
        platform: this.currentPlatform,
        arch: this.currentArch,
      });

      const failedResult = {
        success: false,
        isUpdateAvailable: false,
        error: updateError,
        lastCheckTime: Date.now(),
        cacheUsed: false,
      };
      
      console.log('[UpdateChecker] Returning failed result:', failedResult);
      return failedResult;
    }
  }

  /**
   * 获取版本信息（优化后）
   */
  async getVersionInfo(): Promise<VersionInfo> {
    try {
      const currentVersion = await this.getCurrentVersion();
      
      // 尝试获取最新的版本信息
      const checkResult = await this.checkForUpdates();
      
      if (checkResult.success && checkResult.versionInfo) {
        return checkResult.versionInfo;
      } else {
        // 如果无法获取远程信息，返回仅包含当前版本的信息
        return VersionInfo.fromCurrentVersion(currentVersion);
      }
    } catch (error) {
      // 出错时返回基本版本信息
      const currentVersion = await this.getCurrentVersion();
      return VersionInfo.fromCurrentVersion(currentVersion);
    }
  }

  /**
   * 执行实际的更新检查
   */
  private async performUpdateCheck(): Promise<UpdateCheckResult> {
    const checkTime = Date.now();
    
    // 获取当前版本信息
    const currentVersion = await this.getCurrentVersion();
    
    // 从 GitHub API 获取最新版本信息
    const releaseInfo = await this.fetchLatestRelease();
    
    if (!releaseInfo) {
      throw new UpdateError(UpdateErrorType.NETWORK_ERROR, 'Failed to fetch release information from GitHub');
    }

    // 解析版本信息
    const latestVersion = this.parseVersion(releaseInfo.tag_name);
    
    // 检查是否有更新
    const isUpdateAvailable = semver.gt(latestVersion, currentVersion);
    
    // 查找兼容的更新包
    const availablePackages = await this.findCompatiblePackages(releaseInfo);
    
    // 构建版本信息对象
    const versionInfo = VersionInfo.create({
      current: currentVersion,
      latest: latestVersion,
      releaseNotes: releaseInfo.body || '',
      releaseDate: releaseInfo.published_at,
    });

    return {
      success: true,
      isUpdateAvailable,
      versionInfo,
      availablePackages,
      lastCheckTime: checkTime,
      cacheUsed: false,
    };
  }

  /**
   * 从 GitHub API 获取最新版本信息（优化后）
   */
  private async fetchLatestRelease(): Promise<GitHubRelease | null> {
    const url = `${UPDATE_CONFIG.GITHUB.API_BASE}/repos/${UPDATE_CONFIG.GITHUB.REPO}/releases/latest`;
    
    console.log('[UpdateChecker] Starting GitHub API request to:', url);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPDATE_CONFIG.GITHUB.TIMEOUT);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': UPDATE_CONFIG.GITHUB.USER_AGENT,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      console.log('[UpdateChecker] GitHub API response status:', response.status);

      if (!response.ok) {
        const errorMsg = `GitHub API request failed: ${response.status} ${response.statusText}`;
        console.error('[UpdateChecker]', errorMsg);
        throw new NetworkError(
          errorMsg,
          { url, status: response.status, statusText: response.statusText }
        );
      }

      const releaseData = await response.json();
      console.log('[UpdateChecker] GitHub API response data:', { tag_name: releaseData.tag_name, assets_count: releaseData.assets?.length });
      
      // 验证必要字段
      if (!releaseData.tag_name || !releaseData.assets) {
        const errorMsg = 'Invalid release data from GitHub API';
        console.error('[UpdateChecker]', errorMsg, { releaseData });
        throw new UpdateError(
          UpdateErrorType.VALIDATION_ERROR,
          errorMsg,
          { code: 'INVALID_RELEASE_DATA', context: { releaseData } }
        );
      }

      console.log('[UpdateChecker] Successfully fetched release data');
      return releaseData as GitHubRelease;
      
    } catch (error) {
      console.error('[UpdateChecker] Error in fetchLatestRelease:', error);
      
      if (error instanceof UpdateError) {
        throw error;
      }
      
      // 处理网络错误
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new UpdateError(UpdateErrorType.TIMEOUT_ERROR, 'Request timeout', {
            context: { url, timeout: UPDATE_CONFIG.GITHUB.TIMEOUT }
          });
        }
        
        throw new NetworkError(
          `Failed to fetch latest release: ${error.message}`,
          { url, originalError: error.message },
          error
        );
      }
      
      throw new UpdateError(UpdateErrorType.UNKNOWN_ERROR, 'Unknown error occurred while fetching release');
    }
  }

  /**
   * 查找兼容当前平台的更新包（优化后）
   */
  private async findCompatiblePackages(release: GitHubRelease): Promise<UpdatePackage[]> {
    const packages: UpdatePackage[] = [];

    for (const asset of release.assets) {
      try {
        // 解析文件名获取平台信息
        const fileInfo = parseFilename(asset.name);
        
        if (!fileInfo) continue;

        // 检查是否兼容当前平台
        if (fileInfo.platform === this.currentPlatform && fileInfo.arch === this.currentArch) {
          console.log(`[UpdateCheckerV2] Found compatible package: ${asset.name}`);
          console.log(`[UpdateCheckerV2] Real file size from GitHub API: ${(asset.size / (1024 * 1024)).toFixed(1)}MB`);
          
          const updatePackage = new UpdatePackage({
            version: this.parseVersion(release.tag_name),
            platform: fileInfo.platform,
            arch: fileInfo.arch,
            downloadUrl: asset.download_url,
            fileSize: asset.size, // 真实的 GitHub API 文件大小
            checksum: '', // 需要从其他地方获取或生成
            filename: asset.name,
            contentType: asset.content_type,
          });

          packages.push(updatePackage);
        }
      } catch (error) {
        // 单个包解析失败不影响其他包
        console.warn(`Failed to parse asset ${asset.name}:`, error);
        continue;
      }
    }

    return packages;
  }

  /**
   * 获取当前版本（优化后）
   */
  private async getCurrentVersion(): Promise<string> {
    try {
      const packageJsonPath = await this.findPackageJson();
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      
      if (!packageJson.version) {
        throw new UpdateError(
          UpdateErrorType.VALIDATION_ERROR,
          'Version not found in package.json',
          { context: { packageJsonPath } }
        );
      }

      // 验证版本格式
      if (!semver.valid(packageJson.version)) {
        throw new UpdateError(
          UpdateErrorType.VALIDATION_ERROR,
          `Invalid version format in package.json: ${packageJson.version}`,
          { context: { version: packageJson.version, packageJsonPath } }
        );
      }

      return packageJson.version;
    } catch (error) {
      if (error instanceof UpdateError) {
        throw error;
      }
      
      throw UpdateErrorFactory.fromError(
        error as Error, 
        UpdateErrorType.VALIDATION_ERROR,
        { operation: 'getCurrentVersion' }
      );
    }
  }

  /**
   * 查找 package.json 文件（优化后）
   */
  private async findPackageJson(): Promise<string> {
    let currentDir = __dirname;
    const maxDepth = 10; // 防止无限循环
    let depth = 0;

    while (depth < maxDepth) {
      const packageJsonPath = path.join(currentDir, 'package.json');
      
      try {
        await fs.access(packageJsonPath);
        return packageJsonPath;
      } catch {
        // 继续向上查找
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // 已到根目录
        
        currentDir = parentDir;
        depth++;
      }
    }

    throw new UpdateError(
      UpdateErrorType.VALIDATION_ERROR,
      'package.json not found',
      { context: { searchStartDir: __dirname, maxDepth } }
    );
  }

  /**
   * 解析版本字符串（优化后）
   */
  private parseVersion(versionString: string): string {
    // 移除可能的 'v' 前缀
    const cleaned = versionString.replace(/^v/, '');
    
    if (!semver.valid(cleaned)) {
      throw new UpdateError(
        UpdateErrorType.VALIDATION_ERROR,
        `Invalid version string: ${versionString}`,
        { context: { original: versionString, cleaned } }
      );
    }
    
    return cleaned;
  }

  /**
   * 检测当前平台（优化后）
   */
  private detectPlatform(): PlatformType {
    const platform = process.platform;
    
    switch (platform) {
      case 'darwin':
      case 'win32':
      case 'linux':
        return platform;
      default:
        throw new UpdateError(
          UpdateErrorType.VALIDATION_ERROR,
          `Unsupported platform: ${platform}`,
          { context: { detectedPlatform: platform } }
        );
    }
  }

  /**
   * 检测当前架构（优化后）
   */
  private detectArchitecture(): ArchitectureType {
    const arch = process.arch;
    
    switch (arch) {
      case 'x64':
      case 'arm64':
      case 'ia32':
        return arch;
      case 'arm':
        return 'armv7l';
      default:
        throw new UpdateError(
          UpdateErrorType.VALIDATION_ERROR,
          `Unsupported architecture: ${arch}`,
          { context: { detectedArch: arch } }
        );
    }
  }

  /**
   * 获取缓存结果
   */
  private getCachedResult(key: string): UpdateCheckResult | null {
    const cached = this.cacheData.get(key);
    
    if (!cached) return null;
    
    const now = Date.now();
    const isExpired = (now - cached.timestamp) > UPDATE_CONFIG.CACHE.EXPIRY_TIME;
    
    if (isExpired) {
      this.cacheData.delete(key);
      return null;
    }
    
    return cached.result;
  }

  /**
   * 设置缓存结果
   */
  private setCachedResult(key: string, result: UpdateCheckResult): void {
    this.cacheData.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cacheData.clear();
  }

  /**
   * 获取当前平台信息
   */
  getPlatformInfo(): { platform: PlatformType; arch: ArchitectureType } {
    return {
      platform: this.currentPlatform,
      arch: this.currentArch,
    };
  }
}