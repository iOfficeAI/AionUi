#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 应用内浏览器 MCP 启动器 / In-app browser MCP launcher.
 *
 * 为什么需要这个中间层：
 *
 * chrome-devtools-mcp 只接受命令行参数 `--browser-url`，不认环境变量。而我们的
 * CDP 端口是启动时动态决定的（默认 9230，被占用就往上找，多开几个实例端口各不同）。
 * 如果把端口直接写进 MCP 注册记录的 args 里，每次启动都得改写数据库里的这条记录，
 * 而且多实例共用一份注册表时必然写串。
 *
 * 所以注册记录保持不变（永远指向这个脚本），端口通过环境变量传进来，由这个脚本
 * 在运行时翻译成 `--browser-url` 参数再拉起真正的 chrome-devtools-mcp。
 * 注册记录是静态的，端口是动态的，两边都不用妥协。
 *
 * Why this indirection exists: chrome-devtools-mcp only accepts the CLI flag
 * `--browser-url` — it has no environment variable for it. Our CDP port is
 * resolved at launch (9230 by default, incremented when taken, distinct per
 * instance). Baking the port into the MCP registration's args would mean
 * rewriting that database record on every launch, and would race across
 * instances sharing one registry. Instead the registration stays static (always
 * pointing at this script) and the port arrives via environment variable, which
 * this script translates into `--browser-url` before spawning the real server.
 */

import { spawn } from 'node:child_process';
import { resolveBridgeToken, resolveBrowserUrl } from './browserServerPort';

/**
 * stdio MCP 服务器的 stdout 是协议通道，任何附加输出都会破坏握手。
 * 因此所有诊断信息只能走 stderr。
 *
 * A stdio MCP server's stdout is the protocol channel; anything extra breaks the
 * handshake. All diagnostics therefore go to stderr.
 */
const logDiagnostic = (message: string): void => {
  process.stderr.write(`[builtin-mcp-browser] ${message}\n`);
};

const browserUrl = resolveBrowserUrl({ env: process.env });
const bridgeToken = resolveBridgeToken({ env: process.env });

if (!browserUrl || !bridgeToken) {
  /**
   * 没有端口或口令就直接退出，而不是拉起一个会自己开新 Chrome 的 MCP 服务器。
   * 后者更糟：Agent 会以为自己在操作 APP 内的浏览器，实际操作的是一个用户看不见的
   * 独立 Chrome —— 侧边栏什么都不会发生，问题极难排查。
   *
   * 口令与端口同等重要：单目标通道要求口令，没有它连上去只会被 403 拒绝，
   * 那时 chrome-devtools-mcp 就会退回去自己开 Chrome，正是我们要消灭的行为。
   *
   * Exit rather than launching a server that would spawn its own Chrome. That failure mode
   * is worse: the agent believes it is driving the in-app browser while actually driving an
   * invisible separate Chrome, so nothing happens in the side panel and the cause is very
   * hard to find.
   *
   * The token matters as much as the port: the single-target bridge requires it, and
   * connecting without one is refused with 403 — at which point chrome-devtools-mcp would
   * fall back to spawning its own Chrome, exactly what we are eliminating.
   */
  logDiagnostic(
    'CDP bridge port or token is unavailable — refusing to start so the agent cannot drive a hidden browser instead.'
  );
  process.exit(1);
}

/**
 * 刻意把口令留在服务端，不拼进 --browser-url。
 *
 * puppeteer 会执行 `new URL('/json/version', browserUrl)`，绝对路径会丢掉整个 query，
 * 所以拼上去的口令根本传不到服务端 —— 反而会让人误以为发现段受了保护。
 * 真正的校验发生在 WebSocket 段：通道在 /json/version 的响应里回填带口令的 ws 地址，
 * puppeteer 原样拿去建连，口令就在那一跳生效。
 *
 * 这里仍然要求 env 里有口令：它是「通道确实起来了」的凭证，缺了就说明通道没起，
 * 此时必须退出而不是让 MCP 回退去开独立 Chrome。
 *
 * The token deliberately stays server-side rather than being appended to --browser-url.
 * puppeteer runs `new URL('/json/version', browserUrl)` and an absolute path drops the
 * whole query, so a token there never reaches the server and would merely create the
 * illusion that discovery is protected. Enforcement lives on the WebSocket leg: the bridge
 * writes a tokened ws address into its /json/version response, which puppeteer reuses
 * verbatim, so the token takes effect on that hop.
 *
 * We still require the token in the env: it is proof the bridge actually started. Its
 * absence means there is no bridge, and we must exit rather than let the MCP fall back to
 * spawning its own Chrome.
 */
logDiagnostic(`Connecting chrome-devtools-mcp to the in-app browser bridge at ${browserUrl}`);

/**
 * 固定版本，不用 @latest。
 *
 * @latest 每次首启都要联网解析，离线直接失败，还意味着一个不受控的上游可以随时换掉
 * 驱动浏览器的代码 —— 而那个浏览器里有用户的登录态。
 *
 * Pinned rather than @latest: @latest re-resolves over the network on first launch
 * (silent multi-second delay, hard failure offline) and leaves an uncontrolled
 * upstream able to swap out the code that drives a browser holding the user's live
 * sign-in cookies.
 */
const CHROME_DEVTOOLS_MCP_VERSION = '0.16.0';

/**
 * Windows 上 npx 是 npx.cmd，而 .cmd 属于批处理文件，没有终端无法自己执行。
 * 直接 spawn('npx.cmd') 会同步抛错（CVE-2024-27980 修复后 Node 收紧了 .cmd 处理，
 * 表现为 EINVAL；见 issue #3883），于是 MCP 在 Windows 上根本起不来。
 *
 * 这里显式走 cmd.exe /c，而不是加 shell: true：后者虽然也能跑通，但 Node 已用
 * DEP0190 弃用「shell + args 数组」的组合，而且会把 browserUrl 交给 shell 解析。
 * cmd.exe /c 是官方推荐写法，保留参数数组各自的转义语义。
 *
 * On Windows npx is npx.cmd, a batch file that cannot execute without a terminal, so
 * spawn('npx.cmd') throws synchronously (Node tightened .cmd handling after
 * CVE-2024-27980, surfacing as EINVAL — see issue #3883) and the MCP never starts.
 *
 * We go through cmd.exe /c rather than setting shell: true: that also works, but Node
 * deprecated the "shell + args array" combination (DEP0190) and it would hand browserUrl
 * to the shell for parsing. cmd.exe /c is the documented approach and keeps each argument
 * individually escaped.
 */
const isWindows = process.platform === 'win32';

const mcpArgs = ['-y', `chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION}`, '--browser-url', browserUrl];

const child = spawn(isWindows ? 'cmd.exe' : 'npx', isWindows ? ['/c', 'npx', ...mcpArgs] : mcpArgs, {
  // stdio 直通：这个进程只是转发者，MCP 协议流不能被中间层缓冲或改写
  // Pass stdio straight through: this process is a forwarder, and the MCP
  // protocol stream must not be buffered or rewritten in between.
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  logDiagnostic(`Failed to spawn chrome-devtools-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

// 转发终止信号，避免 MCP 客户端关闭后留下孤儿进程
// Forward termination signals so no orphan survives the MCP client shutting down.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
