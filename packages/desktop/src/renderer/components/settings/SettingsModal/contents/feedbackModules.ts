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
  readonly descriptionI18nKey: string;
  readonly tag: string;
};

export const FEEDBACK_MODULES: readonly FeedbackModule[] = [
  {
    i18nKey: 'settings.bugReportModulePermission',
    descriptionI18nKey: 'settings.bugReportModulePermissionDescription',
    tag: 'agent-detection',
  },
  {
    i18nKey: 'settings.bugReportModuleAssistant',
    descriptionI18nKey: 'settings.bugReportModuleAssistantDescription',
    tag: 'assistant-preset',
  },
  {
    i18nKey: 'settings.bugReportModuleLlmConfig',
    descriptionI18nKey: 'settings.bugReportModuleLlmConfigDescription',
    tag: 'model-auth',
  },
  {
    i18nKey: 'settings.bugReportModuleMcp',
    descriptionI18nKey: 'settings.bugReportModuleMcpDescription',
    tag: 'mcp-tools',
  },
  {
    i18nKey: 'settings.bugReportModuleSkills',
    descriptionI18nKey: 'settings.bugReportModuleSkillsDescription',
    tag: 'skills-plugin',
  },
  {
    i18nKey: 'settings.bugReportModuleChannel',
    descriptionI18nKey: 'settings.bugReportModuleChannelDescription',
    tag: 'channel',
  },
  {
    i18nKey: 'settings.bugReportModuleChat',
    descriptionI18nKey: 'settings.bugReportModuleChatDescription',
    tag: 'conversation-session',
  },
  {
    i18nKey: 'settings.bugReportModuleSession',
    descriptionI18nKey: 'settings.bugReportModuleSessionDescription',
    tag: 'search-history',
  },
  {
    i18nKey: 'settings.bugReportModuleWorkspace',
    descriptionI18nKey: 'settings.bugReportModuleWorkspaceDescription',
    tag: 'workspace-preview',
  },
  {
    i18nKey: 'settings.bugReportModuleWebui',
    descriptionI18nKey: 'settings.bugReportModuleWebuiDescription',
    tag: 'webui-remote',
  },
  {
    i18nKey: 'settings.bugReportModuleScheduledTask',
    descriptionI18nKey: 'settings.bugReportModuleScheduledTaskDescription',
    tag: 'scheduled-task',
  },
  {
    i18nKey: 'settings.bugReportModuleAgentTeam',
    descriptionI18nKey: 'settings.bugReportModuleAgentTeamDescription',
    tag: 'agent-team',
  },
  {
    i18nKey: 'settings.bugReportModuleDisplaySettings',
    descriptionI18nKey: 'settings.bugReportModuleDisplaySettingsDescription',
    tag: 'display-desktop',
  },
  {
    i18nKey: 'settings.bugReportModuleSystemSettings',
    descriptionI18nKey: 'settings.bugReportModuleSystemSettingsDescription',
    tag: 'system-settings',
  },
  {
    i18nKey: 'settings.bugReportModuleOther',
    descriptionI18nKey: 'settings.bugReportModuleOtherDescription',
    tag: 'other',
  },
] as const;
