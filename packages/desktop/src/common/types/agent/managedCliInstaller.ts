export type ManagedCliInstallTarget = 'claude' | 'hermes' | 'opencode' | 'openclaw';

export type ManagedCliInstallMirror = 'default' | 'npmmirror';

export type ManagedCliInstallStatus = 'idle' | 'installing' | 'installed' | 'uninstalling' | 'not_installed' | 'failed';

export type ManagedCliInstallOptions = {
  target: ManagedCliInstallTarget;
  mirror?: ManagedCliInstallMirror;
};

export type ManagedCliInstallResult = {
  success: boolean;
  status: ManagedCliInstallStatus;
  message?: string;
};
