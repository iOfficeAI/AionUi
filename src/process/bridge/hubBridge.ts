import { ipcBridge } from '@/common';
import { hubIndexManager } from '@process/extensions/hub/HubIndexManager';
import { hubInstaller } from '@process/extensions/hub/HubInstaller';
import { hubStateManager } from '@process/extensions/hub/HubStateManager';

export function initHubBridge(): void {
  ipcBridge.hub.getExtensionList.provider(async () => {
    try {
      await hubIndexManager.loadIndexes();
      return {
        success: true,
        data: await hubStateManager.getExtensionListWithStatus(hubIndexManager.getExtensionList()),
      };
    } catch (error) {
      return { success: false, msg: String(error) };
    }
  });

  ipcBridge.hub.install.provider(async ({ name }) => {
    try {
      await hubInstaller.install(name);
      return { success: true };
    } catch (error) {
      return { success: false, msg: String(error) };
    }
  });

  ipcBridge.hub.retryInstall.provider(async ({ name }) => {
    try {
      await hubInstaller.retryInstall(name);
      return { success: true };
    } catch (error) {
      return { success: false, msg: String(error) };
    }
  });

  ipcBridge.hub.checkUpdates.provider(async () => {
    return { success: true, data: [] };
  });

  ipcBridge.hub.update.provider(async ({ name }) => {
    try {
      await hubInstaller.install(name);
      return { success: true };
    } catch (error) {
      return { success: false, msg: String(error) };
    }
  });

  ipcBridge.hub.uninstall.provider(async (_params) => {
    return { success: false, msg: 'Uninstall not supported yet.' };
  });
}
