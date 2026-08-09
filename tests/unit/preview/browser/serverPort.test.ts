/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildMcpSpawnCommand,
  resolveBridgeToken,
  resolveBrowserUrl,
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

/**
 * 回归测试：issue #3883 —— Windows 上 aionui-browser MCP 完全起不来。
 *
 * npx 在 Windows 上是 npx.cmd，批处理文件没有终端无法自己执行，直接 spawn 会抛 EINVAL
 * （CVE-2024-27980 之后 Node 收紧了 .cmd 处理）。旧代码只是把可执行名换成 'npx.cmd'，
 * 而注释本身就写明「不走 shell 会失败」—— 换名恰恰就是那个失败写法。
 *
 * 这条分支此前没有任何测试覆盖（spawn 在模块顶层，单测 import 不了 browserServer.ts），
 * 所以缺陷得以合并进主干。现在命令行的组装被抽成纯函数，能直接钉住。
 *
 * Regression test for issue #3883: the aionui-browser MCP never starts on Windows. npx is
 * npx.cmd there, a batch file that cannot execute without a terminal, so spawning it directly
 * throws EINVAL (Node tightened .cmd handling after CVE-2024-27980). The old code merely
 * renamed the executable to 'npx.cmd' while its own comment said spawning without a shell
 * fails — the rename *is* the failing form.
 *
 * This branch had no test coverage (spawn runs at module scope, so browserServer.ts cannot be
 * imported by a unit test), which is how the defect reached main. The command assembly is now a
 * pure function and can be pinned directly.
 */
describe('buildMcpSpawnCommand — issue #3883', () => {
  const version = '0.16.0';
  const browserUrl = 'http://127.0.0.1:61622';

  it('never spawns npx.cmd directly on Windows (that is the EINVAL form)', () => {
    const { command } = buildMcpSpawnCommand({ platform: 'win32', version, browserUrl });
    expect(command).not.toBe('npx.cmd');
    expect(command).toBe('cmd.exe');
  });

  it('routes through cmd.exe /c on Windows with npx as an argument', () => {
    const { command, args } = buildMcpSpawnCommand({ platform: 'win32', version, browserUrl });
    expect(command).toBe('cmd.exe');
    expect(args.slice(0, 2)).toEqual(['/c', 'npx']);
    expect(args).toContain(`chrome-devtools-mcp@${version}`);
  });

  it('passes --browser-url as its own argv entry, never concatenated into one string', () => {
    /**
     * 分成两个 argv 条目是刻意的：shell: true 的写法会把整条命令拼成字符串再交给
     * cmd.exe 解析，那时 browserUrl 里的 `&` `|` `^` 都会变成元字符。保持数组形式
     * 才能让每个参数各自保留转义语义。
     *
     * Keeping these as separate argv entries is deliberate: the shell: true form concatenates
     * the whole command into one string for cmd.exe to parse, at which point `&`, `|` and `^`
     * inside browserUrl become metacharacters. The array form keeps each argument escaped.
     */
    for (const platform of ['win32', 'darwin', 'linux']) {
      const { args } = buildMcpSpawnCommand({ platform, version, browserUrl });
      const flagIndex = args.indexOf('--browser-url');
      expect(flagIndex).toBeGreaterThanOrEqual(0);
      expect(args[flagIndex + 1]).toBe(browserUrl);
      expect(args.some((a) => a.includes(`--browser-url=`))).toBe(false);
    }
  });

  it('keeps the plain npx invocation on POSIX platforms', () => {
    for (const platform of ['darwin', 'linux']) {
      const { command, args } = buildMcpSpawnCommand({ platform, version, browserUrl });
      expect(command).toBe('npx');
      expect(args[0]).toBe('-y');
      expect(args).not.toContain('/c');
    }
  });

  it('pins the MCP version rather than resolving @latest at launch', () => {
    /**
     * @latest 每次首启都要联网解析（离线直接失败），也意味着上游可以随时换掉驱动浏览器
     * 的代码 —— 而那个浏览器里有用户的登录态。
     *
     * @latest re-resolves over the network on first launch (hard failure offline) and lets an
     * uncontrolled upstream swap out the code driving a browser that holds the user's live
     * sign-in cookies.
     */
    const { args } = buildMcpSpawnCommand({ platform: 'win32', version, browserUrl });
    expect(args).not.toContain('chrome-devtools-mcp@latest');
    expect(args).toContain(`chrome-devtools-mcp@${version}`);
  });
});
