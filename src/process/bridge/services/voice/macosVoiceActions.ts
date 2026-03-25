import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type FrontmostAppInfo = {
  appName?: string;
  bundleId?: string;
};

export const getFrontmostAppInfo = async (): Promise<FrontmostAppInfo> => {
  if (process.platform !== 'darwin') {
    return {};
  }

  try {
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to set frontApp to first application process whose frontmost is true',
      '-e',
      'set appName to name of frontApp',
      '-e',
      'try',
      '-e',
      'set bundleId to bundle identifier of frontApp',
      '-e',
      'on error',
      '-e',
      'set bundleId to ""',
      '-e',
      'end try',
      '-e',
      'return appName & "||" & bundleId',
    ]);
    const [appName = '', bundleId = ''] = stdout.trim().split('||');
    return {
      appName: appName || undefined,
      bundleId: bundleId || undefined,
    };
  } catch {
    return {};
  }
};

export const pasteTextToActiveApp = async (text: string): Promise<'inserted' | 'copied'> => {
  if (process.platform !== 'darwin') {
    return 'copied';
  }

  const previousClipboardText = clipboard.readText();
  clipboard.writeText(text);

  try {
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events"',
      '-e',
      'keystroke "v" using command down',
      '-e',
      'end tell',
    ]);
    await new Promise((resolve) => setTimeout(resolve, 180));
    clipboard.writeText(previousClipboardText);
    return 'inserted';
  } catch {
    return 'copied';
  }
};
