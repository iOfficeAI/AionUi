import { ipcMain } from 'electron';
import { AibangAuthChannel, aibangAuthService } from '@process/services/AibangAuthService';

export function initAibangAuthBridge(): void {
  ipcMain.handle(AibangAuthChannel.getStatus, () => aibangAuthService.getStatus());
  ipcMain.handle(AibangAuthChannel.login, (_event, input) => aibangAuthService.login(input));
  ipcMain.handle(AibangAuthChannel.clearSession, () => aibangAuthService.clearSession());
  ipcMain.handle(AibangAuthChannel.refreshSession, () => aibangAuthService.refreshSession());
  ipcMain.handle(AibangAuthChannel.register, (_event, input) => aibangAuthService.register(input));
  ipcMain.handle(AibangAuthChannel.sendEmailVerification, (_event, input) =>
    aibangAuthService.sendEmailVerification(input)
  );
  ipcMain.handle(AibangAuthChannel.redeem, (_event, input) => aibangAuthService.redeem(input));
}
