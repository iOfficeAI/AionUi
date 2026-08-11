/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BetterSqlite3Driver } from '../../../../src/process/services/database/drivers/BetterSqlite3Driver';
import {
  buildClaudeModelInfoFromCcSwitchConfig,
  readClaudeProviderEnvFromCcSwitch,
  readClaudeModelInfoFromCcSwitch,
} from '../../../../src/process/services/ccSwitchModelSource';

let nativeModuleAvailable = true;
try {
  const driver = new BetterSqlite3Driver(':memory:');
  driver.close();
} catch (error) {
  if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

describeOrSkip('ccSwitchModelSource', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('builds a switchable Claude model info from cc-switch settings config', () => {
    const modelInfo = buildClaudeModelInfoFromCcSwitchConfig(
      {
        model: 'haiku',
        env: {
          ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250514',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-20250514',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-20260301',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20250514',
        },
      },
      new Map([
        ['claude-opus-4-6-20260301', 'Claude Opus 4.6'],
        ['claude-sonnet-4-5-20250514', 'Claude Sonnet 4.5'],
        ['claude-haiku-4-5-20250514', 'Claude Haiku 4.5'],
      ]),
      'haiku'
    );

    expect(modelInfo).toEqual({
      currentModelId: 'haiku',
      currentModelLabel: 'Claude Haiku 4.5',
      availableModels: [
        { id: 'default', label: 'Claude Sonnet 4.5' },
        { id: 'opus', label: 'Claude Opus 4.6' },
        { id: 'haiku', label: 'Claude Haiku 4.5' },
      ],
      canSwitch: true,
      source: 'models',
      sourceDetail: 'cc-switch',
    });
  });

  it('returns null when the settings config is empty', () => {
    expect(buildClaudeModelInfoFromCcSwitchConfig(null)).toBeNull();
    expect(buildClaudeModelInfoFromCcSwitchConfig({ env: {} })).toBeNull();
  });

  it('uses fallback model and removes duplicates when env models overlap', () => {
    const modelInfo = buildClaudeModelInfoFromCcSwitchConfig(
      {
        model: 'default',
        env: {
          ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250514',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-20250514',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-20260301',
        },
      },
      new Map([
        ['claude-sonnet-4-5-20250514', 'Claude Sonnet 4.5'],
        ['claude-opus-4-6-20260301', 'Claude Opus 4.6'],
      ]),
      'default'
    );

    expect(modelInfo).toEqual({
      currentModelId: 'default',
      currentModelLabel: 'Claude Sonnet 4.5',
      availableModels: [
        { id: 'default', label: 'Claude Sonnet 4.5' },
        { id: 'opus', label: 'Claude Opus 4.6' },
      ],
      canSwitch: true,
      source: 'models',
      sourceDetail: 'cc-switch',
    });
  });

  it('keeps cc-switch model info read-only when only one model is configured', () => {
    const modelInfo = buildClaudeModelInfoFromCcSwitchConfig(
      {
        env: {
          ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250514',
        },
      },
      new Map([['claude-sonnet-4-5-20250514', 'Claude Sonnet 4.5']]),
      'default'
    );

    expect(modelInfo).toEqual({
      currentModelId: 'default',
      currentModelLabel: 'Claude Sonnet 4.5',
      availableModels: [{ id: 'default', label: 'Claude Sonnet 4.5' }],
      canSwitch: false,
      source: 'models',
      sourceDetail: 'cc-switch',
    });
  });

  it('reads the current Claude provider from cc-switch files', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'aionui-cc-switch-'));
    tempDirs.push(tempDir);

    const settingsPath = path.join(tempDir, 'settings.json');
    const databasePath = path.join(tempDir, 'cc-switch.db');
    const claudeSettingsPath = path.join(tempDir, 'claude-settings.json');

    writeFileSync(settingsPath, JSON.stringify({ currentProviderClaude: 'provider-1' }), 'utf-8');
    writeFileSync(claudeSettingsPath, JSON.stringify({ model: 'default' }), 'utf-8');

    const driver = new BetterSqlite3Driver(databasePath);
    driver.exec(`
      CREATE TABLE providers (
        id TEXT PRIMARY KEY,
        settings_config TEXT
      );
      CREATE TABLE model_pricing (
        model_id TEXT PRIMARY KEY,
        display_name TEXT
      );
    `);
    driver.prepare('INSERT INTO providers (id, settings_config) VALUES (?, ?)').run(
      'provider-1',
      JSON.stringify({
        env: {
          ANTHROPIC_MODEL: 'claude-opus-4-6-20260301',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-20250514',
        },
      })
    );
    driver
      .prepare('INSERT INTO model_pricing (model_id, display_name) VALUES (?, ?), (?, ?)')
      .run('claude-opus-4-6-20260301', 'Claude Opus 4.6', 'claude-sonnet-4-5-20250514', 'Claude Sonnet 4.5');
    driver.close();

    const modelInfo = readClaudeModelInfoFromCcSwitch({ settingsPath, databasePath, claudeSettingsPath });

    expect(modelInfo).toEqual({
      currentModelId: 'default',
      currentModelLabel: 'Claude Sonnet 4.5',
      availableModels: [{ id: 'default', label: 'Claude Sonnet 4.5' }],
      canSwitch: false,
      source: 'models',
      sourceDetail: 'cc-switch',
    });
  });

  it('returns null when cc-switch files do not describe a Claude provider', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'aionui-cc-switch-'));
    tempDirs.push(tempDir);

    const settingsPath = path.join(tempDir, 'settings.json');
    const databasePath = path.join(tempDir, 'cc-switch.db');

    writeFileSync(settingsPath, JSON.stringify({ currentProviderClaude: 'missing-provider' }), 'utf-8');

    const driver = new BetterSqlite3Driver(databasePath);
    driver.exec(`
      CREATE TABLE providers (
        id TEXT PRIMARY KEY,
        settings_config TEXT
      );
      CREATE TABLE model_pricing (
        model_id TEXT PRIMARY KEY,
        display_name TEXT
      );
    `);
    driver.close();

    expect(readClaudeModelInfoFromCcSwitch({ settingsPath, databasePath })).toBeNull();
  });

  it('returns null when the settings file does not exist', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'aionui-cc-switch-'));
    tempDirs.push(tempDir);

    expect(
      readClaudeModelInfoFromCcSwitch({
        settingsPath: path.join(tempDir, 'missing-settings.json'),
        databasePath: path.join(tempDir, 'missing.db'),
      })
    ).toBeNull();
  });

  it('reads the current Claude provider env from cc-switch files', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'aionui-cc-switch-'));
    tempDirs.push(tempDir);

    const settingsPath = path.join(tempDir, 'settings.json');
    const databasePath = path.join(tempDir, 'cc-switch.db');

    writeFileSync(settingsPath, JSON.stringify({ currentProviderClaude: 'provider-1' }), 'utf-8');

    const driver = new BetterSqlite3Driver(databasePath);
    driver.exec(`
      CREATE TABLE providers (
        id TEXT PRIMARY KEY,
        settings_config TEXT
      );
    `);
    driver.prepare('INSERT INTO providers (id, settings_config) VALUES (?, ?)').run(
      'provider-1',
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://localhost:4000',
          ANTHROPIC_AUTH_TOKEN: 'sk-test-token',
          ANTHROPIC_MODEL: 'claude-opus-4-6',
          EMPTY_VALUE: '',
        },
      })
    );
    driver.close();

    expect(readClaudeProviderEnvFromCcSwitch({ settingsPath, databasePath })).toEqual({
      ANTHROPIC_BASE_URL: 'http://localhost:4000',
      ANTHROPIC_AUTH_TOKEN: 'sk-test-token',
      ANTHROPIC_MODEL: 'claude-opus-4-6',
    });
  });
});
