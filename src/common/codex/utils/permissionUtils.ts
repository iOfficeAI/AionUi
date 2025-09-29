/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { conversation } from '@/common/ipcBridge';
import type { CodexPermissionOption } from '../types/permissionTypes';
import { useState } from 'react';
import { PermissionType, PermissionSeverity, PERMISSION_DECISION_MAP } from '../types/permissionTypes';

/**
 * 基础权限选项配置
 * 提供四种标准的权限决策选项
 */
const BASE_PERMISSION_OPTIONS: ReadonlyArray<CodexPermissionOption> = [
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
const PERMISSION_CONFIGS: Record<PermissionType, PermissionConfig> = {
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
function getPermissionConfig(type: PermissionType): PermissionConfig {
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

// Shared interface for confirmation data
export interface ConfirmationData {
  confirmKey: string;
  msg_id: string;
  conversation_id: string;
  callId: string;
}

/**
 * Common hook to handle message confirmation for both tool groups and codex permissions
 */
export const useConfirmationHandler = () => {
  const handleConfirmation = async (data: ConfirmationData): Promise<{ success: boolean; error?: string }> => {
    try {
      await conversation.confirmMessage.invoke(data);
      return { success: true, error: undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  return { handleConfirmation };
};

/**
 * Hook to handle local storage state for permissions
 */
export const usePermissionState = (storageKey: string, responseKey: string) => {
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const [hasResponded, setHasResponded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(responseKey) === 'true';
    } catch {
      return false;
    }
  });

  return { selected, setSelected, hasResponded, setHasResponded };
};

/**
 * Hook to clean up old permission storage entries (older than 7 days)
 */
export const usePermissionStorageCleanup = () => {
  const cleanupOldPermissionStorage = () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('codex_permission_choice_') || key.startsWith('codex_permission_responded_')) {
        const timestamp = localStorage.getItem(`${key}_timestamp`);
        if (timestamp && parseInt(timestamp, 10) < sevenDaysAgo) {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_timestamp`);
        }
      }
    });
  };

  return { cleanupOldPermissionStorage };
};
