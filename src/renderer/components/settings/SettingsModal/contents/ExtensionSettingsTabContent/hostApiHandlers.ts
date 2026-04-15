import { ipcBridge } from '@/common';
import type { SessionManagementHostContext } from './sessionManagementHostApi';
import { getSessionManagementHostApiHandlers } from './sessionManagementHostApi';

export type ExtensionHostApiHandler = () => Promise<unknown>;

export const getExtensionHostApiHandlers = (
  extensionName: string,
  payload: unknown,
  context?: SessionManagementHostContext
): Record<string, ExtensionHostApiHandler> | undefined => {
  if (extensionName === 'session-management' && context) {
    return getSessionManagementHostApiHandlers(payload as never, context) as Record<string, ExtensionHostApiHandler>;
  }

  if (extensionName !== 'api-diagnostics-devtools') {
    return undefined;
  }

  return {
    'application.getApiDiagnosticsState': () => ipcBridge.application.getApiDiagnosticsState.invoke(),
    'application.updateApiDiagnosticsConfig': () =>
      ipcBridge.application.updateApiDiagnosticsConfig.invoke(
        (payload || {}) as { enabled?: boolean; outputDir?: string; sampleIntervalMs?: number }
      ),
    'application.captureApiDiagnosticsSnapshot': () =>
      ipcBridge.application.captureApiDiagnosticsSnapshot.invoke(
        (payload || {}) as {
          sessionId?: string;
          persist?: boolean;
        }
      ),
    'application.getApiDiagnosticsLiveSnapshot': () =>
      ipcBridge.application.getApiDiagnosticsLiveSnapshot.invoke(
        (payload || undefined) as {
          sessionId?: string;
        }
      ),
    'application.getApiDiagnosticsHistory': () =>
      ipcBridge.application.getApiDiagnosticsHistory.invoke(
        (payload || undefined) as {
          limit?: number;
        }
      ),
    'shell.showItemInFolder': async () => {
      if (typeof payload !== 'string' || !payload.trim()) {
        throw new Error('Missing path');
      }

      await ipcBridge.shell.showItemInFolder.invoke(payload);
      return { success: true };
    },
  };
};
