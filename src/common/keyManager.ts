/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage, IModel } from './storage';

export enum KeyStatus {
  Active = 'active',
  RateLimited = 'rate-limited',
  Invalid = 'invalid',
}

export interface ManagedKey {
  key: IModel;
  status: KeyStatus;
  resetTime?: number;
}

export class GeminiKeyManager {
  private static instance: GeminiKeyManager;
  private keys: ManagedKey[] = [];
  private currentIndex = 0;

  private constructor() {
    this.loadKeys();
  }

  public static getInstance(): GeminiKeyManager {
    if (!GeminiKeyManager.instance) {
      GeminiKeyManager.instance = new GeminiKeyManager();
    }
    return GeminiKeyManager.instance;
  }

  private async loadKeys() {
    const modelConfig = await ConfigStorage.get('model.config');
    if (modelConfig) {
      this.keys = modelConfig
        .filter(model => model.platform === 'gemini')
        .map(key => ({
          key,
          status: KeyStatus.Active,
        }));
    }
  }

  public setInitialKey(apiKey: string) {
    const index = this.keys.findIndex(k => k.key.apiKey === apiKey);
    if (index !== -1) {
      this.currentIndex = index;
    }
  }

  public async getKey(): Promise<IModel | null> {
    if (this.keys.length === 0) {
      await this.loadKeys();
    }

    if (this.keys.length === 0) {
        return null;
    }

    const initialIndex = this.currentIndex;
    while (true) {
      const managedKey = this.keys[this.currentIndex];
      if (managedKey.status === KeyStatus.Active) {
        const keyToReturn = managedKey.key;
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return keyToReturn;
      }

      if (managedKey.status === KeyStatus.RateLimited && managedKey.resetTime && Date.now() > managedKey.resetTime) {
        managedKey.status = KeyStatus.Active;
        managedKey.resetTime = undefined;
        const keyToReturn = managedKey.key;
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return keyToReturn;
      }

      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      if (this.currentIndex === initialIndex) {
        return null; // All keys are rate-limited or invalid
      }
    }
  }

  public setKeyStatus(apiKey: string, status: KeyStatus, resetTime?: number) {
    const managedKey = this.keys.find(k => k.key.apiKey === apiKey);
    if (managedKey) {
      managedKey.status = status;
      managedKey.resetTime = resetTime;
    }
  }

  public getKeysStatus(): ManagedKey[] {
    return this.keys;
  }
}
