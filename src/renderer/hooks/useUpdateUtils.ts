/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { generatePlaceholderChecksum } from '@/common/utils/checksum';
import type { IUpdatePackageData } from '@/common/ipcBridge';
import type { ArchitectureType, PlatformType } from '../../common/update/updateConfig';
import { formatBytes } from '../../common/update/updateConfig';

interface SystemInfo {
  cacheDir: string;
  workDir: string;
  platform: PlatformType;
  arch: ArchitectureType;
}

// formatBytes 函数已移到 @/common/updateConfig 中统一管理

/**
 * 更新工具 Hook
 *
 * 提供平台信息获取和更新包信息构建功能，避免重复代码
 */
export function useUpdateUtils() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  // 获取系统信息
  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const info = await ipcBridge.application.systemInfo.invoke();
        setSystemInfo(info);
      } catch (error) {
        console.error('Failed to get system info:', error);
      }
    };

    fetchSystemInfo();
  }, []);

  /**
   * 构建更新包信息（降级方案）
   *
   * ⚠️  重要提示：这是降级方案！
   * ✅ 优先使用：updateCheckResult.availablePackages 中的真实数据（从 UpdateChecker 获取）
   * 🔄 降级使用：此函数的估算数据（仅在真实数据不可用时使用）
   *
   * 真实数据包含：
   * - GitHub API 的准确文件大小 (asset.size)
   * - 准确的下载链接 (asset.download_url)
   * - 准确的文件名和内容类型
   */
  const buildPackageInfo = useCallback(
    (version: string): IUpdatePackageData | null => {
      if (!systemInfo) {
        console.warn('System info not available, cannot build package info');
        return null;
      }

      const { platform, arch } = systemInfo;

      // 根据平台生成文件扩展名
      const getFileExtension = (platform: string): string => {
        switch (platform) {
          case 'darwin':
            return 'dmg';
          case 'win32':
            return 'exe';
          case 'linux':
            return 'AppImage';
          default:
            return 'bin';
        }
      };

      const extension = getFileExtension(platform);

      // GitHub releases 使用不同的平台命名规则
      const getPlatformNameForGitHub = (platform: string): string => {
        switch (platform) {
          case 'darwin':
            return 'mac';
          case 'win32':
            return 'win';
          case 'linux':
            return 'linux';
          default:
            return platform;
        }
      };

      // GitHub releases 使用不同的架构命名规则
      const getArchNameForGitHub = (arch: string): string => {
        switch (arch) {
          case 'x64':
            return 'x64';
          case 'arm64':
            return 'arm64';
          case 'ia32':
            return 'x86';
          case 'armv7l':
            return 'armv7l';
          default:
            return arch;
        }
      };

      const githubPlatform = getPlatformNameForGitHub(platform);
      const githubArch = getArchNameForGitHub(arch);
      const expectedFilename = `AionUi-${version}-${githubPlatform}-${githubArch}.${extension}`;

      console.warn('[useUpdateUtils] Using fallback package info - recommend using real availablePackages data instead');

      // 获取文件大小 - 基于实际GitHub releases数据分析，定期更新
      const getEstimatedFileSize = (platform: string, arch: string, version: string): number => {
        // TODO: 这里应该从主进程的UpdateChecker中获取真实的availablePackages数据
        // 当前是降级方案，基于最新releases的实际数据分析

        // 基于 GitHub releases 的实际数据分析 (最后更新: 2024-09)
        const sizeMap: Record<string, Record<string, number>> = {
          darwin: {
            arm64: 134 * 1024 * 1024, // ~134MB (实际测量)
            x64: 138 * 1024 * 1024, // ~138MB (实际测量)
          },
          win32: {
            x64: 120 * 1024 * 1024, // ~120MB (实际测量)
            ia32: 115 * 1024 * 1024, // ~115MB (估算)
          },
          linux: {
            x64: 118 * 1024 * 1024, // ~118MB (实际测量)
            arm64: 115 * 1024 * 1024, // ~115MB (估算)
            armv7l: 112 * 1024 * 1024, // ~112MB (估算)
          },
        };

        const platformSizes = sizeMap[platform];
        if (!platformSizes) {
          console.warn(`[getEstimatedFileSize] Unknown platform: ${platform}, using default size`);
          return 120 * 1024 * 1024; // 120MB default
        }

        const size = platformSizes[arch];
        if (!size) {
          console.warn(`[getEstimatedFileSize] Unknown arch ${arch} for platform ${platform}, using fallback`);
          // 使用该平台的第一个可用大小作为降级
          const fallbackSize = Object.values(platformSizes)[0];
          return fallbackSize || 120 * 1024 * 1024;
        }

        console.log(`[getEstimatedFileSize] Estimated size for ${platform}-${arch}: ${formatBytes(size)}`);
        return size;
      };

      return {
        version,
        platform,
        arch,
        downloadUrl: `https://github.com/iOfficeAI/AionUi/releases/download/v${version}/${expectedFilename}`,
        fileSize: getEstimatedFileSize(platform, arch, version),
        checksum: generatePlaceholderChecksum(`${version}-${platform}-${arch}`),
        signature: undefined,
        isDelta: false,
        baseVersion: undefined,
      };
    },
    [systemInfo]
  );

  /**
   * 从真实的 availablePackages 数据中获取文件大小
   * 这个函数展示了如何正确使用真实数据
   */
  const getRealFileSizeFromPackages = useCallback((availablePackages: IUpdatePackageData[]): number | null => {
    if (!availablePackages || availablePackages.length === 0) {
      console.warn('[getRealFileSizeFromPackages] No available packages provided');
      return null;
    }

    const compatiblePackage = availablePackages[0]; // 第一个包通常是兼容的
    const realFileSize = compatiblePackage.fileSize;

    console.log(`[getRealFileSizeFromPackages] Real file size from GitHub API: ${formatBytes(realFileSize)}`);
    console.log(`[getRealFileSizeFromPackages] Package info:`, {
      version: compatiblePackage.version,
      platform: compatiblePackage.platform,
      arch: compatiblePackage.arch,
      filename: compatiblePackage.filename,
      fileSize: realFileSize,
    });

    return realFileSize;
  }, []);

  return {
    systemInfo,
    buildPackageInfo,
    getRealFileSizeFromPackages,
    formatBytes,
  };
}
