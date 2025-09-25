/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexPermissionOption } from '../types/permissionTypes';
import { PermissionType, PermissionSeverity, PERMISSION_DECISION_MAP } from '../types/permissionTypes';

/**
 * 基础权限选项配置
 * 提供四种标准的权限决策选项
 */
export const BASE_PERMISSION_OPTIONS: ReadonlyArray<CodexPermissionOption> = [
  {
    optionId: 'allow_once',
    name: 'codex.permissions.allow_once',
    kind: 'allow_once' as const,
    description: 'codex.permissions.allow_once_desc',
    severity: PermissionSeverity.LOW,
  },
  {
    optionId: 'allow_always',
    name: 'codex.permissions.allow_always',
    kind: 'allow_always' as const,
    description: 'codex.permissions.allow_always_desc',
    severity: PermissionSeverity.MEDIUM,
  },
  {
    optionId: 'reject_once',
    name: 'codex.permissions.reject_once',
    kind: 'reject_once' as const,
    description: 'codex.permissions.reject_once_desc',
    severity: PermissionSeverity.LOW,
  },
  {
    optionId: 'reject_always',
    name: 'codex.permissions.reject_always',
    kind: 'reject_always' as const,
    description: 'codex.permissions.reject_always_desc',
    severity: PermissionSeverity.HIGH,
  },
] as const;

/**
 * 权限配置接口
 */
interface PermissionConfig {
  titleKey: string;
  descriptionKey: string;
  icon: string;
  severity: PermissionSeverity;
  options: CodexPermissionOption[];
}

/**
 * 预定义的权限配置
 * 为不同类型的权限请求提供标准化配置
 */
export const PERMISSION_CONFIGS: Record<PermissionType, PermissionConfig> = {
  [PermissionType.COMMAND_EXECUTION]: {
    titleKey: 'codex.permissions.titles.command_execution',
    descriptionKey: 'codex.permissions.descriptions.command_execution',
    icon: '⚡',
    severity: PermissionSeverity.HIGH,
    options: createPermissionOptions(PermissionType.COMMAND_EXECUTION),
  },
  [PermissionType.FILE_WRITE]: {
    titleKey: 'codex.permissions.titles.file_write',
    descriptionKey: 'codex.permissions.descriptions.file_write',
    icon: '📝',
    severity: PermissionSeverity.MEDIUM,
    options: createPermissionOptions(PermissionType.FILE_WRITE),
  },
  [PermissionType.FILE_READ]: {
    titleKey: 'codex.permissions.titles.file_read',
    descriptionKey: 'codex.permissions.descriptions.file_read',
    icon: '📖',
    severity: PermissionSeverity.LOW,
    options: createPermissionOptions(PermissionType.FILE_READ),
  },
};

/**
 * 创建特定权限类型的选项
 * 为每个选项生成类型特定的描述键
 */
function createPermissionOptions(permissionType: PermissionType): CodexPermissionOption[] {
  return BASE_PERMISSION_OPTIONS.map((option) => ({
    ...option,
    description: `codex.permissions.${permissionType}.${option.optionId}_desc`,
  }));
}

/**
 * 获取权限配置
 */
export function getPermissionConfig(type: PermissionType): PermissionConfig {
  return PERMISSION_CONFIGS[type];
}

/**
 * 根据权限类型创建选项
 * 工厂函数，简化权限选项的创建
 */
export function createPermissionOptionsForType(permissionType: PermissionType): CodexPermissionOption[] {
  const config = getPermissionConfig(permissionType);
  return config.options;
}

/**
 * 将UI选项决策转换为后端决策
 */
export function mapPermissionDecision(optionId: keyof typeof PERMISSION_DECISION_MAP): string {
  return PERMISSION_DECISION_MAP[optionId] || 'denied';
}

/**
 * 获取权限类型的显示信息
 */
export function getPermissionDisplayInfo(type: PermissionType) {
  const config = getPermissionConfig(type);
  return {
    titleKey: config.titleKey,
    descriptionKey: config.descriptionKey,
    icon: config.icon,
    severity: config.severity,
  };
}

/**
 * 根据严重级别获取推荐的默认选项
 */
export function getRecommendedDefaultOption(severity: PermissionSeverity): string {
  switch (severity) {
    case PermissionSeverity.LOW:
      return 'allow_once';
    case PermissionSeverity.MEDIUM:
      return 'reject_once';
    case PermissionSeverity.HIGH:
    case PermissionSeverity.CRITICAL:
      return 'reject_always';
    default:
      return 'reject_once';
  }
}

/**
 * 检查选项是否为允许类型
 */
export function isAllowOption(optionId: string): boolean {
  return optionId === 'allow_once' || optionId === 'allow_always';
}

/**
 * 检查选项是否为拒绝类型
 */
export function isRejectOption(optionId: string): boolean {
  return optionId === 'reject_once' || optionId === 'reject_always';
}

/**
 * 检查选项是否为持久性选项（影响后续相同类型请求）
 */
export function isPersistentOption(optionId: string): boolean {
  return optionId === 'allow_always' || optionId === 'reject_always';
}

/**
 * 验证权限选项ID是否有效
 */
export function isValidPermissionOption(optionId: string): boolean {
  return ['allow_once', 'allow_always', 'reject_once', 'reject_always'].includes(optionId);
}

/**
 * 获取权限选项的严重级别
 */
export function getOptionSeverity(optionId: string): PermissionSeverity | null {
  const option = BASE_PERMISSION_OPTIONS.find((opt) => opt.optionId === optionId);
  return option?.severity || null;
}

/**
 * 根据权限类型获取默认推荐选项
 */
export function getDefaultOptionForPermissionType(permissionType: PermissionType): string {
  const config = getPermissionConfig(permissionType);
  return getRecommendedDefaultOption(config.severity);
}
