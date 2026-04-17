// src/process/acp/session/ConfigTracker.ts

import type {
  AvailableCommand,
  ConfigOption,
  ConfigSnapshot,
  InitialDesiredConfig,
  ModelSnapshot,
  ModeSnapshot,
} from '@process/acp/types';

type SyncResult = {
  currentModelId?: string;
  availableModels?: Array<{ modelId: string; name: string; description?: string }>;
  currentModeId?: string;
  availableModes?: Array<{ id: string; name: string; description?: string }>;
  configOptions?: ConfigOption[];
  cwd: string;
  additionalDirectories?: string[];
  availableCommands?: AvailableCommand[];
};

type PendingChanges = {
  model: string | null;
  mode: string | null;
  configOptions: Array<{ id: string; value: string | boolean }>;
};

export class ConfigTracker {
  // Current (confirmed by agent)
  private cwd = '';
  private additionalDirectories: string[] | undefined;
  private availableModels: Array<{ modelId: string; name: string; description?: string }> = [];
  private availableModes: Array<{ id: string; name: string; description?: string }> = [];
  private availableCommands: AvailableCommand[] = [];

  private currentModelId: string | null = null;
  private currentModeId: string | null = null;
  private currentConfigOptions: ConfigOption[] = [];
  // Desired (user intent, not yet synced)
  private desiredModelId: string | null = null;
  private desiredModeId: string | null = null;
  private desiredConfigOptions = new Map<string, string | boolean>();

  constructor(initialDesired?: InitialDesiredConfig) {
    if (!initialDesired) return;
    if (initialDesired.model) this.desiredModelId = initialDesired.model;
    if (initialDesired.mode) this.desiredModeId = initialDesired.mode;
    if (initialDesired.configOptions) {
      for (const [id, value] of Object.entries(initialDesired.configOptions)) {
        this.desiredConfigOptions.set(id, value);
      }
    }
  }

  setDesiredModel(modelId: string): void {
    this.desiredModelId = modelId;
  }

  setCurrentModel(modelId: string): void {
    this.currentModelId = modelId;
    if (this.desiredModelId === modelId) this.desiredModelId = null;
  }

  setDesiredMode(modeId: string): void {
    this.desiredModeId = modeId;
  }

  setCurrentMode(modeId: string): void {
    this.currentModeId = modeId;
    if (this.desiredModeId === modeId) this.desiredModeId = null;
  }

  setDesiredConfigOption(id: string, value: string | boolean): void {
    this.desiredConfigOptions.set(id, value);
  }

  setCurrentConfigOption(id: string, value: string | boolean): void {
    const opt = this.currentConfigOptions.find((o) => o.id === id);
    if (opt) opt.currentValue = value;
    this.desiredConfigOptions.delete(id);
  }

  syncFromSessionResult(result: SyncResult): void {
    this.cwd = result.cwd;
    this.additionalDirectories = result.additionalDirectories;
    if (result.currentModelId !== undefined) this.currentModelId = result.currentModelId;
    if (result.availableModels) this.availableModels = result.availableModels;
    if (result.currentModeId !== undefined) this.currentModeId = result.currentModeId;
    if (result.availableModes) this.availableModes = result.availableModes;
    if (result.configOptions) this.currentConfigOptions = result.configOptions;
    if (result.availableCommands) this.availableCommands = result.availableCommands;
  }

  getPendingChanges(): PendingChanges {
    return {
      model: this.desiredModelId,
      mode: this.desiredModeId,
      configOptions: Array.from(this.desiredConfigOptions.entries()).map(([id, value]) => ({
        id,
        value,
      })),
    };
  }

  clearPending(): void {
    this.desiredModelId = null;
    this.desiredModeId = null;
    this.desiredConfigOptions.clear();
  }

  modelSnapshot(): ModelSnapshot {
    return {
      currentModelId: this.currentModelId,
      availableModels: [...this.availableModels],
    };
  }

  modeSnapshot(): ModeSnapshot {
    return {
      currentModeId: this.currentModeId,
      availableModes: [...this.availableModes],
    };
  }

  configSnapshot(): ConfigSnapshot {
    return {
      configOptions: [...this.currentConfigOptions],
      availableCommands: [...this.availableCommands],
      cwd: this.cwd,
      additionalDirectories: this.additionalDirectories,
    };
  }

  updateConfigOptions(options: ConfigOption[]): void {
    this.currentConfigOptions = options;
  }

  updateAvailableCommands(commands: AvailableCommand[]): void {
    this.availableCommands = commands;
  }
}
