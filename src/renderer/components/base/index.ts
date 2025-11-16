/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AionUi 基础组件库统一导出 / AionUi base components unified exports
 *
 * 提供所有基础组件和类型的统一导出入口
 * Provides unified export entry for all base components and types
 */

// ==================== 组件导出 / Component Exports ====================

export { default as AionModal } from './AionModal';
export { default as AionCollapse } from './AionCollapse';
export { default as AionSelect } from './AionSelect';
export { default as AionScrollArea } from './AionScrollArea';
export { default as AionSteps } from './AionSteps';

// ==================== 类型导出 / Type Exports ====================

// AionModal 类型 / AionModal types
export type { ModalSize, ModalHeaderConfig, ModalFooterConfig, ModalContentStyleConfig, AionModalProps } from './AionModal';
export { MODAL_SIZES } from './AionModal';

// AionCollapse 类型 / AionCollapse types
export type { AionCollapseProps, AionCollapseItemProps } from './AionCollapse';

// AionSelect 类型 / AionSelect types
export type { AionSelectProps } from './AionSelect';

// AionSteps 类型 / AionSteps types
export type { AionStepsProps } from './AionSteps';
