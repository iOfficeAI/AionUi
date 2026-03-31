// This is the only file in src/common/platform/ permitted to import from 'electron'.
import { app, Notification, powerSaveBlocker, utilityProcess, type UtilityProcess } from 'electron';
import path from 'path';
import type { IPlatformServices, IWorkerProcess } from './IPlatformServices';

class ElectronWorkerProcess implements IWorkerProcess {
  constructor(private readonly up: UtilityProcess) {}

  postMessage(message: unknown): void {
    this.up.postMessage(message);
  }

  on(event: string, handler: (...args: unknown[]) => void): this {
    this.up.on(event as Parameters<UtilityProcess['on']>[0], handler as never);
    return this;
  }

  kill(): void {
    this.up.kill();
  }
}

export class ElectronPlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => app.getPath('userData'),
    getTempDir: () => app.getPath('temp'),
    getHomeDir: () => app.getPath('home'),
    getLogsDir: () => {
      try {
        return app.getPath('logs');
      } catch {
        return path.join(app.getPath('userData'), 'logs');
      }
    },
    getAppPath: () => app.getAppPath(),
    isPackaged: () => app.isPackaged,
    getSystemPath: (name: 'desktop' | 'home' | 'downloads') => app.getPath(name),
    getName: () => app.getName(),
    getVersion: () => app.getVersion(),
    needsCliSafeSymlinks: () => process.platform === 'darwin',
  };

  worker = {
    fork: (modulePath: string, args: string[], opts: { cwd?: string; env?: Record<string, string> }): IWorkerProcess =>
      new ElectronWorkerProcess(
        utilityProcess.fork(modulePath, args, {
          cwd: opts.cwd,
          // Propagate DATA_DIR so utility processes can use NodePlatformServices
          // without needing access to app.getPath (unavailable in utility process).
          env: { DATA_DIR: app.getPath('userData'), ...opts.env },
        })
      ),
  };

  power = {
    preventSleep: (): number | null => powerSaveBlocker.start('prevent-app-suspension'),
    allowSleep: (id: number | null): void => {
      if (id !== null) powerSaveBlocker.stop(id);
    },
  };

  notification = {
    send: ({ title, body }: { title: string; body: string; icon?: string }): void => {
      new Notification({ title, body }).show();
    },
  };
}
