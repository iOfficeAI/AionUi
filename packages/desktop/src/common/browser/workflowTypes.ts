/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LocatorTarget } from './types';

export type WorkflowParameterDefinition = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  description: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: string[]; // For enum
};

export type WorkflowStepAction =
  | 'open'
  | 'click'
  | 'type'
  | 'pressKey'
  | 'select'
  | 'wait'
  | 'snapshot'
  | 'screenshot'
  | 'download'
  | 'upload'
  | 'evaluate';

export type WorkflowStep = {
  id: string;
  name: string;
  action: WorkflowStepAction;
  locator?: LocatorTarget;
  value?: string; // May include {{variable}}
  timeoutMs?: number;
  optional?: boolean;
  description?: string;
  options?: Record<string, unknown>;
};

export type BrowserWorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  version: string;
  site?: string;
  parameters: WorkflowParameterDefinition[];
  steps: WorkflowStep[];
};

export type WorkflowStepResult = {
  stepId: string;
  stepName: string;
  action: WorkflowStepAction;
  success: boolean;
  durationMs: number;
  data?: unknown;
  error?: string;
  screenshotOnFailure?: string;
};

export type BrowserWorkflowExecutionResult = {
  success: boolean;
  workflowId: string;
  stepResults: WorkflowStepResult[];
  outputs: Record<string, unknown>;
  error?: string;
  durationMs: number;
};
