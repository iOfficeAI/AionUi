/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  buildMcpSpawnCommand,
  resolveBridgeToken,
  resolveBrowserUrl,
  resolveBundledChromeDevtoolsMcpPath,
} from '@/process/resources/builtinMcp/browserServerPort';

describe('resolveBrowserUrl', () => {
  it('builds the URL from the port inherited down the process tree', () => {
    expect(resolveBrowserUrl({ env: { AIONUI_CDP_ACTIVE_PORT: '9230' } })).toBe('http://127.0.0.1:9230');
  });

  it('pins the host to loopback so the agent can never be aimed at a remote debugger', () => {
    expect(resolveBrowserUrl({ env: { AIONUI_CDP_ACTIVE_PORT: '9230' } })).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });

  it('rejects malformed or out-of-range ports', () => {
    for (const port of ['0', '-1', 'abc', '70000', '9230.5', '']) {
      expect(resolveBrowserUrl({ env: { AIONUI_CDP_ACTIVE_PORT: port } })).toBeNull();
    }
  });

  it('refuses to start when no port was inherited', () => {
    // 拿不到端口只有两种情况：用户关掉了 CDP，或不是从应用里启动的。
    // 两种都必须失败，不能去猜 —— 猜错会把 Agent 连到另一个实例的浏览器上。
    //
    // No inherited port means either the user disabled CDP or this was not launched
    // by the app. Both must fail rather than guess: guessing wrong would connect the
    // agent to a *different* instance's browser.
    expect(resolveBrowserUrl({ env: {} })).toBeNull();
  });

  it('ignores the user-facing AIONUI_CDP_PORT so a disabled setting cannot be re-enabled by inheritance', () => {
    // AIONUI_CDP_PORT 是「用户输入」,优先级高于配置文件。如果这里也读它,
    // 用户关掉 CDP 后点应用内重启,继承来的值会被当成「用户要求开启」,
    // 把刚保存的设置悄悄覆盖掉。两个用途必须分开。
    //
    // AIONUI_CDP_PORT is user input that outranks the config file. Reading it here
    // too would mean a disabled setting gets silently re-enabled after an in-app
    // restart, because the relaunched process inherits the value.
    expect(resolveBrowserUrl({ env: { AIONUI_CDP_PORT: '9230' } })).toBeNull();
  });
});

describe('resolveBridgeToken', () => {
  it('returns the token inherited from the process tree', () => {
    expect(resolveBridgeToken({ env: { AIONUI_CDP_BRIDGE_TOKEN: 'abc123' } })).toBe('abc123');
  });

  it('returns null when absent, so the caller refuses to start rather than connecting unauthenticated', () => {
    expect(resolveBridgeToken({ env: {} })).toBeNull();
  });

  it('treats a whitespace-only token as absent', () => {
    expect(resolveBridgeToken({ env: { AIONUI_CDP_BRIDGE_TOKEN: '   ' } })).toBeNull();
  });

  it('trims surrounding whitespace picked up from env plumbing', () => {
    expect(resolveBridgeToken({ env: { AIONUI_CDP_BRIDGE_TOKEN: ' tok \n' } })).toBe('tok');
  });
});

describe('buildMcpSpawnCommand', () => {
  const browserUrl = 'http://127.0.0.1:61622';
  const nodeExecutable = 'C:\\WorkMate\\node.exe';
  const mcpEntryPath = 'C:\\WorkMate\\node_modules\\chrome-devtools-mcp\\build\\src\\index.js';

  it('launches the bundled MCP with the current Node runtime', () => {
    const { command, args } = buildMcpSpawnCommand({ nodeExecutable, mcpEntryPath, browserUrl });
    expect(command).toBe(nodeExecutable);
    expect(args[0]).toBe(mcpEntryPath);
  });

  it('passes --browser-url as its own argv entry, never concatenated into one string', () => {
    const { args } = buildMcpSpawnCommand({ nodeExecutable, mcpEntryPath, browserUrl });
    const flagIndex = args.indexOf('--browser-url');
    expect(args[flagIndex + 1]).toBe(browserUrl);
    expect(args.some((arg) => arg.includes('--browser-url='))).toBe(false);
  });

  it('does not invoke a package manager or shell at runtime', () => {
    const { command, args } = buildMcpSpawnCommand({ nodeExecutable, mcpEntryPath, browserUrl });
    expect([command, ...args].join(' ')).not.toMatch(/\b(?:npx|npm|bunx|cmd\.exe)\b/);
  });

  it('disables upstream usage statistics', () => {
    const { args } = buildMcpSpawnCommand({ nodeExecutable, mcpEntryPath, browserUrl });
    expect(args).toContain('--no-usage-statistics');
  });
});

describe('resolveBundledChromeDevtoolsMcpPath', () => {
  it('resolves the package beside out/main in development and packaged layouts', () => {
    const launcherDir = path.resolve('app/resources/app.asar.unpacked/out/main');
    expect(resolveBundledChromeDevtoolsMcpPath(launcherDir)).toBe(
      path.resolve('app/resources/app.asar.unpacked/node_modules/chrome-devtools-mcp/build/src/index.js')
    );
  });
});
