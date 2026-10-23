/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Hook Sentry IPC so renderer SDK uses ipcRenderer.send instead of falling
// back to fetch('sentry-ipc://...') which floods the DevTools Network panel.
// Bundled into preload by `externalizeDepsPlugin({ exclude: [...] })` so
// Electron's sandbox-mode preload doesn't try to resolve node_modules.
import '@sentry/electron/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ADAPTER_BRIDGE_EVENT_KEY } from '../common/adapter/constant';

/**
 * @description 注入到renderer进程中, 用于与main进程通信
 */
contextBridge.exposeInMainWorld('electronAPI', {
  emit: (name: string, data: unknown) => {
    return ipcRenderer
      .invoke(
        ADAPTER_BRIDGE_EVENT_KEY,
        JSON.stringify({
          name: name,
          data: data,
        })
      )
      .catch((error) => {
        console.error('IPC invoke error:', error);
        throw error;
      });
  },

  on: (callback: (payload: { event: unknown; value: unknown }) => void) => {
    const handler = (event: unknown, value: unknown) => {
      callback({ event, value });
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },

  // 获取拖拽文件/目录的绝对路径 / Get absolute path of dragged file/directory
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // Feedback: collect and compress recent log files
  collectFeedbackLogs: () => ipcRenderer.invoke('feedback:collect-logs'),
  // Feedback: capture screenshot of the current window
  captureFeedbackScreenshot: () => ipcRenderer.invoke('feedback:capture-screenshot'),
  // Feedback: forward diagnostics logs to main process console
  logFeedbackEvent: (payload: { details?: unknown; level: 'info' | 'warn' | 'error'; message: string }) =>
    ipcRenderer.send('feedback:renderer-log', payload),
  recoverCorruptedDatabase: () => ipcRenderer.invoke('backend:recover-corrupted-database'),
  // Browser automation commands
  browserNavigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
  browserClick: (selector: string) => ipcRenderer.invoke('browser:click', selector),
  browserType: (selector: string, text: string) => ipcRenderer.invoke('browser:type', selector, text),
  browserScroll: (x: number, y: number) => ipcRenderer.invoke('browser:scroll', x, y),
  browserScreenshot: () => ipcRenderer.invoke('browser:screenshot'),
  browserGetProfiles: () => ipcRenderer.invoke('browser:getProfiles'),
  browserGetActiveProfile: () => ipcRenderer.invoke('browser:getActiveProfile'),
  browserSetActiveProfile: (id: string) => ipcRenderer.invoke('browser:setActiveProfile', id),
  browserCreateProfile: (input: unknown) => ipcRenderer.invoke('browser:createProfile', input),
  browserUpdateProfile: (input: unknown) => ipcRenderer.invoke('browser:updateProfile', input),
  browserDeleteProfile: (id: string) => ipcRenderer.invoke('browser:deleteProfile', id),
  browserClearProfileData: (id: string) => ipcRenderer.invoke('browser:clearProfileData', id),
  browserProbeExternalChrome: (port?: number) => ipcRenderer.invoke('browser:probeExternalChrome', port),
  browserLaunchExternalChrome: (config: unknown) => ipcRenderer.invoke('browser:launchExternalChrome', config),
  browserExecuteAction: (request: unknown) => ipcRenderer.invoke('browser:executeAction', request),
  browserGetSnapshot: (options?: unknown) => ipcRenderer.invoke('browser:getSnapshot', options),
  browserTakeScreenshot: (options?: unknown) => ipcRenderer.invoke('browser:takeScreenshot', options),
  browserWaitForDownload: (options?: unknown) => ipcRenderer.invoke('browser:waitForDownload', options),
  browserGetDownloads: () => ipcRenderer.invoke('browser:getDownloads'),
  browserGetToolDefinitions: () => ipcRenderer.invoke('browser:getToolDefinitions'),
  browserCallTool: (payload: { tool: string; args?: unknown; taskId?: string }) =>
    ipcRenderer.invoke('browser:callTool', payload),
  browserCancelToolTask: (taskId: string) => ipcRenderer.invoke('browser:cancelToolTask', taskId),
  browserGetWorkflows: () => ipcRenderer.invoke('browser:getWorkflows'),
  browserExecuteWorkflow: (payload: { workflowId: string; params?: unknown; profileId?: string }) =>
    ipcRenderer.invoke('browser:executeWorkflow', payload),
  browserPostSocial: (options: unknown) => ipcRenderer.invoke('browser:postSocial', options),
  browserRespondSafetyApproval: (payload: { requestId: string; approved: boolean; rememberChoice?: boolean }) =>
    ipcRenderer.invoke('browser:respondSafetyApproval', payload),
  browserSetSafetyAutoApprove: (payload: { actionType: string; enabled: boolean }) =>
    ipcRenderer.invoke('browser:setSafetyAutoApprove', payload),
  browserGetSafetyAutoApprove: (actionType: string) => ipcRenderer.invoke('browser:getSafetyAutoApprove', actionType),
  browserSetSocialDailyCap: (cap: number) => ipcRenderer.invoke('browser:setSocialDailyCap', cap),
  browserGetSocialDailyCap: () => ipcRenderer.invoke('browser:getSocialDailyCap'),
  browserGetSocialDailyCount: (platform: string) => ipcRenderer.invoke('browser:getSocialDailyCount', platform),
  onBrowserToolProgress: (callback: (event: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('browser:toolProgress', handler);
    return () => {
      ipcRenderer.off('browser:toolProgress', handler);
    };
  },
  onBrowserSafetyApprovalRequest: (callback: (request: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('browser:safetyApprovalRequest', handler);
    return () => {
      ipcRenderer.off('browser:safetyApprovalRequest', handler);
    };
  },
  // Teamwork Multi-Agent Orchestration APIs
  teamworkInitiate: (params: unknown) => ipcRenderer.invoke('teamwork:initiate', params),
  teamworkSubmitInterview: (params: unknown) => ipcRenderer.invoke('teamwork:submit-interview', params),
  teamworkConfirmPlan: (params: unknown) => ipcRenderer.invoke('teamwork:confirm-plan', params),
  teamworkAbort: (params: unknown) => ipcRenderer.invoke('teamwork:abort', params),
  teamworkGetState: (params: unknown) => ipcRenderer.invoke('teamwork:get-state', params),
  onTeamworkStatusUpdate: (callback: (state: unknown) => void) => {
    const handler = (_event: unknown, state: unknown) => callback(state);
    ipcRenderer.on('teamwork:status-update', handler);
    return () => {
      ipcRenderer.off('teamwork:status-update', handler);
    };
  },
  // Team Scoping & Verification APIs
  teamInitiateScoping: (params: unknown) => ipcRenderer.invoke('team:initiateScoping', params),
  teamSubmitInterviewAnswers: (params: unknown) => ipcRenderer.invoke('team:submitInterviewAnswers', params),
  teamApprovePlan: (params: unknown) => ipcRenderer.invoke('team:approvePlan', params),
  teamRejectPlan: (params: unknown) => ipcRenderer.invoke('team:rejectPlan', params),
  teamCancelScoping: (params: unknown) => ipcRenderer.invoke('team:cancelScoping', params),
  teamGetScopingState: (params: unknown) => ipcRenderer.invoke('team:getScopingState', params),
  onTeamScopingStatusChanged: (callback: (event: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('team.scopingStatusChanged', handler);
    return () => {
      ipcRenderer.off('team.scopingStatusChanged', handler);
    };
  },
  // Knowledge Repos APIs
  knowledgeRepoList: () => ipcRenderer.invoke('knowledgeRepo:list'),
  knowledgeRepoGet: (id: string) => ipcRenderer.invoke('knowledgeRepo:get', id),
  knowledgeRepoAdd: (params: unknown) => ipcRenderer.invoke('knowledgeRepo:add', params),
  knowledgeRepoUpdate: (id: string) => ipcRenderer.invoke('knowledgeRepo:update', id),
  knowledgeRepoRollback: (id: string) => ipcRenderer.invoke('knowledgeRepo:rollback', id),
  knowledgeRepoPin: (params: unknown) => ipcRenderer.invoke('knowledgeRepo:pin', params),
  knowledgeRepoSetTrust: (params: unknown) => ipcRenderer.invoke('knowledgeRepo:setTrust', params),
  knowledgeRepoRemove: (id: string) => ipcRenderer.invoke('knowledgeRepo:remove', id),
  knowledgeRepoBuildInstructions: (params: unknown) => ipcRenderer.invoke('knowledgeRepo:buildInstructions', params),
  knowledgeRepoBuildTeamCapabilityCards: (members: unknown) =>
    ipcRenderer.invoke('knowledgeRepo:buildTeamCapabilityCards', members),
  knowledgeRepoSetTaskRunning: (params: unknown) => ipcRenderer.invoke('knowledgeRepo:setTaskRunning', params),
  knowledgeRepoRunSetup: (params: unknown) => ipcRenderer.invoke('knowledgeRepo:runSetup', params),
  knowledgeRepoCheckEnvironment: (repoId: string) => ipcRenderer.invoke('knowledgeRepo:checkEnvironment', repoId),
  knowledgeRepoProvisionWorkingCopy: (params: unknown) =>
    ipcRenderer.invoke('knowledgeRepo:provisionWorkingCopy', params),
  knowledgeRepoSetEnvVars: (params: unknown) => ipcRenderer.invoke('knowledgeRepo:setEnvVars', params),
  // Gateway & Combos APIs
  gatewayGetStatus: () => ipcRenderer.invoke('gateway:getStatus'),
  gatewayGetAccounts: () => ipcRenderer.invoke('gateway:getAccounts'),
  gatewaySaveAccount: (account: unknown) => ipcRenderer.invoke('gateway:saveAccount', account),
  gatewayDeleteAccount: (id: string) => ipcRenderer.invoke('gateway:deleteAccount', id),
  gatewayGetCombos: () => ipcRenderer.invoke('gateway:getCombos'),
  gatewaySaveCombo: (combo: unknown) => ipcRenderer.invoke('gateway:saveCombo', combo),
  gatewayDeleteCombo: (id: string) => ipcRenderer.invoke('gateway:deleteCombo', id),
  gatewayGetLogs: (params?: unknown) => ipcRenderer.invoke('gateway:getLogs', params),
  gatewayClearLogs: () => ipcRenderer.invoke('gateway:clearLogs'),
  gatewayResetCooldown: (accountId: string) => ipcRenderer.invoke('gateway:resetCooldown', accountId),
  gatewaySyncBackend: () => ipcRenderer.invoke('gateway:syncBackend'),
  gatewaySyncLocalOmniRoute: () => ipcRenderer.invoke('gateway:syncLocalOmniRoute'),
  gatewayCheckOmniRouteStatus: () => ipcRenderer.invoke('gateway:checkOmniRouteStatus'),
  gatewayGoogleOAuthLogin: () => ipcRenderer.invoke('gateway:googleOAuthLogin'),
  onGatewayLogAdded: (callback: (log: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('gateway:logAdded', handler);
    return () => {
      ipcRenderer.off('gateway:logAdded', handler);
    };
  },
  onGatewayQuotaUpdated: (callback: (account: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('gateway:quotaUpdated', handler);
    return () => {
      ipcRenderer.off('gateway:quotaUpdated', handler);
    };
  },
});

// Synchronously fetch aioncore port and expose to renderer via
// contextBridge (direct window assignment is invisible under contextIsolation).
const backendPort = ipcRenderer.sendSync('get-backend-port') as number;
const initialLanguage = ipcRenderer.sendSync('get-initial-language') as string | null;
const backendStartupFailed = ipcRenderer.sendSync('get-backend-startup-failed') as boolean;
const backendStartupFailure = ipcRenderer.sendSync('get-backend-startup-failure') as unknown;
contextBridge.exposeInMainWorld('__backendPort', backendPort > 0 ? backendPort : 0);
contextBridge.exposeInMainWorld('__initialLanguage', initialLanguage || null);
contextBridge.exposeInMainWorld('__aionuiE2ETest', process.env.AIONUI_E2E_TEST === '1');
contextBridge.exposeInMainWorld('__backendStartupFailed', backendStartupFailed === true);
contextBridge.exposeInMainWorld('__backendStartupFailure', backendStartupFailure || null);

// Backend startup state bridge: `getState` re-reads current failure info on
// mount (resolves the "READY arrived before the renderer subscribed" race),
// `subscribe` receives subsequent ready/exit pushes on backend-startup-state
// channel. All communication stays behind preload contextBridge.
contextBridge.exposeInMainWorld('__backendStartupBridge', {
  getState: () => ipcRenderer.sendSync('get-backend-startup-failure'),
  subscribe: (callback: (state: unknown) => void) => {
    const handler = (_event: unknown, value: unknown) => callback(value);
    ipcRenderer.on('backend-startup-state', handler);
    return () => {
      ipcRenderer.off('backend-startup-state', handler);
    };
  },
});

// 托盘事件监听 IPC 事件转换为 DOM 事件
// Tray event listeners convert IPC events to DOM events
const trayEvents = [
  'tray:navigate-to-guid',
  'tray:navigate-to-conversation',
  'tray:open-about',
  'tray:pause-all-tasks',
  'tray:check-update',
] as const;

for (const channel of trayEvents) {
  ipcRenderer.on(channel, (_event, ...args) => {
    window.dispatchEvent(new CustomEvent(channel, { detail: args[0] }));
  });
}
