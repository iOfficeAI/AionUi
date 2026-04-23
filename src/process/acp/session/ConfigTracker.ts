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
  current_model_id?: string;
  available_models?: Array<{ model_id: string; name: string; description?: string }>;
  current_mode_id?: string;
  available_modes?: Array<{ id: string; name: string; description?: string }>;
  config_options?: ConfigOption[];
  cwd: string;
  additionalDirectories?: string[];
  availableCommands?: AvailableCommand[];
};

type PendingChanges = {
  model: string | null;
  mode: string | null;
  config_options: Array<{ id: string; value: string | boolean }>;
};

export class ConfigTracker {
  // Current (confirmed by agent)
  private cwd = '';
  private additionalDirectories: string[] | undefined;
  private available_models: Array<{ model_id: string; name: string; description?: string }> = [];
  private available_modes: Array<{ id: string; name: string; description?: string }> = [];
  private availableCommands: AvailableCommand[] = [];

  private current_model_id: string | null = null;
  private current_mode_id: string | null = null;
  private currentConfigOptions: ConfigOption[] = [];
  // Desired (user intent, not yet synced)
  private desiredModelId: string | null = null;
  private desiredModeId: string | null = null;
  private desiredConfigOptions = new Map<string, string | boolean>();

  constructor(initialDesired?: InitialDesiredConfig) {
    if (!initialDesired) return;
    if (initialDesired.model) this.desiredModelId = initialDesired.model;
    if (initialDesired.mode) this.desiredModeId = initialDesired.mode;
    if (initialDesired.config_options) {
      for (const [id, value] of Object.entries(initialDesired.config_options)) {
        this.desiredConfigOptions.set(id, value);
      }
    }
  }

  setDesiredModel(model_id: string): void {
    this.desiredModelId = model_id;
  }

  setCurrentModel(model_id: string): void {
    this.current_model_id = model_id;
    if (this.desiredModelId === model_id) this.desiredModelId = null;
  }

  setDesiredMode(mode_id: string): void {
    this.desiredModeId = mode_id;
  }

  setCurrentMode(mode_id: string): void {
    this.current_mode_id = mode_id;
    if (this.desiredModeId === mode_id) this.desiredModeId = null;
  }

  setDesiredConfigOption(id: string, value: string | boolean): void {
    this.desiredConfigOptions.set(id, value);
  }

  setCurrentConfigOption(id: string, value: string | boolean): void {
    const opt = this.currentConfigOptions.find((o) => o.id === id);
    if (opt) opt.current_value = value;
    this.desiredConfigOptions.delete(id);
  }

  syncFromSessionResult(result: SyncResult): void {
    this.cwd = result.cwd;
    this.additionalDirectories = result.additionalDirectories;
    if (result.current_model_id !== undefined) this.current_model_id = result.current_model_id;
    if (result.available_models) this.available_models = result.available_models;
    if (result.current_mode_id !== undefined) this.current_mode_id = result.current_mode_id;
    if (result.available_modes) this.available_modes = result.available_modes;
    if (result.config_options) this.currentConfigOptions = result.config_options;
    if (result.availableCommands) this.availableCommands = result.availableCommands;
  }

  getPendingChanges(): PendingChanges {
    return {
      model: this.desiredModelId,
      mode: this.desiredModeId,
      config_options: Array.from(this.desiredConfigOptions.entries()).map(([id, value]) => ({
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
      current_model_id: this.current_model_id,
      available_models: [...this.available_models],
    };
  }

  modeSnapshot(): ModeSnapshot {
    return {
      current_mode_id: this.current_mode_id,
      available_modes: [...this.available_modes],
    };
  }

  configSnapshot(): ConfigSnapshot {
    return {
      config_options: [...this.currentConfigOptions],
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
