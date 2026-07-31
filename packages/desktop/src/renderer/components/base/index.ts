/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CSBU WorkMate 基础组件库统一导出 / CSBU WorkMate base components unified exports
 *
 * 提供所有基础组件和类型的统一导出入口
 * Provides unified export entry for all base components and types
 */

// ==================== 组件导出 / Component Exports ====================

export { default as WorkMateModal } from './WorkMateModal';
export { default as WorkMateCollapse } from './WorkMateCollapse';
export { default as WorkMateSelect } from './WorkMateSelect';
export { default as WorkMateScrollArea } from './WorkMateScrollArea';
export { default as WorkMateSteps } from './WorkMateSteps';
export { default as WorkMateSearchInput } from './WorkMateSearchInput';
export { default as WorkMateInlineSearchInput } from './WorkMateInlineSearchInput';

// ==================== 类型导出 / Type Exports ====================

// WorkMateModal 类型 / WorkMateModal types
export type {
  ModalSize,
  ModalHeaderConfig,
  ModalFooterConfig,
  ModalContentStyleConfig,
  WorkMateModalProps,
} from './WorkMateModal';
export { MODAL_SIZES } from './WorkMateModal';

// WorkMateCollapse 类型 / WorkMateCollapse types
export type { WorkMateCollapseProps, WorkMateCollapseItemProps } from './WorkMateCollapse';

// WorkMateSelect 类型 / WorkMateSelect types
export type { WorkMateSelectProps } from './WorkMateSelect';

// WorkMateSteps 类型 / WorkMateSteps types
export type { WorkMateStepsProps } from './WorkMateSteps';

// WorkMateSearchInput 类型 / WorkMateSearchInput types
export type { WorkMateSearchInputProps } from './WorkMateSearchInput';

// WorkMateInlineSearchInput 类型 / WorkMateInlineSearchInput types
export type { WorkMateInlineSearchInputProps } from './WorkMateInlineSearchInput';
