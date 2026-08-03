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
import { resolveBrowserUrl } from './browserServerPort';

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

const browserUrl = resolveBrowserUrl({ env: process.env, onDiagnostic: logDiagnostic });

if (!browserUrl) {
  /**
   * 没有端口就直接退出，而不是拉起一个会自己开新 Chrome 的 MCP 服务器。
   * 后者更糟：Agent 会以为自己在操作 APP 内的浏览器，实际操作的是一个用户看不见的
   * 独立 Chrome —— 侧边栏什么都不会发生，问题极难排查。
   *
   * Exit rather than launching a server that would spawn its own Chrome. That
   * failure mode is worse: the agent believes it is driving the in-app browser
   * while actually driving an invisible separate Chrome, so nothing happens in
   * the side panel and the cause is very hard to find.
   */
  logDiagnostic('CDP port is unavailable — refusing to start so the agent cannot drive a hidden browser instead.');
  process.exit(1);
}

logDiagnostic(`Connecting chrome-devtools-mcp to ${browserUrl}`);

const child = spawn('npx', ['-y', 'chrome-devtools-mcp@latest', '--browser-url', browserUrl], {
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
