/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Feedback module options for the bug report form.
 * Each entry maps a user-visible i18n key to a Sentry tag value.
 */

export type FeedbackModule = {
  readonly i18nKey: string;
  readonly tag: string;
};

export const FEEDBACK_MODULES: readonly FeedbackModule[] = [
  { i18nKey: 'settings.bugReportModuleSkills', tag: 'skills' },
  { i18nKey: 'settings.bugReportModuleWebui', tag: 'webui' },
  { i18nKey: 'settings.bugReportModuleMcp', tag: 'mcp' },
  { i18nKey: 'settings.bugReportModuleChannel', tag: 'channel' },
  { i18nKey: 'settings.bugReportModuleChat', tag: 'chat' },
  { i18nKey: 'settings.bugReportModuleScheduledTask', tag: 'scheduled-task' },
  { i18nKey: 'settings.bugReportModuleLlmConfig', tag: 'llm-config' },
  { i18nKey: 'settings.bugReportModuleAssistant', tag: 'assistant' },
  { i18nKey: 'settings.bugReportModulePermission', tag: 'permission' },
  { i18nKey: 'settings.bugReportModuleSession', tag: 'session' },
  { i18nKey: 'settings.bugReportModuleWorkspace', tag: 'workspace' },
  { i18nKey: 'settings.bugReportModulePreview', tag: 'preview' },
  { i18nKey: 'settings.bugReportModuleSystemSettings', tag: 'system-settings' },
  { i18nKey: 'settings.bugReportModuleDisplaySettings', tag: 'display-settings' },
  { i18nKey: 'settings.bugReportModulePlugin', tag: 'plugin' },
  { i18nKey: 'settings.bugReportModuleAgentTeam', tag: 'agent-team' },
  { i18nKey: 'settings.bugReportModulePet', tag: 'pet' },
  { i18nKey: 'settings.bugReportModuleOther', tag: 'other' },
] as const;
