/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 解析应用内浏览器 MCP 该连接的 CDP 地址。
 *
 * 单独成文件是为了可测试：browserServer.ts 是个有顶层副作用的启动脚本（会 spawn
 * 子进程），没法直接在单测里 import。
 *
 * Resolves which CDP endpoint the in-app browser MCP should connect to. Kept in
 * its own module for testability: browserServer.ts is an entry script with
 * top-level side effects (it spawns a child), so it cannot be imported by tests.
 */

const DEFAULT_CDP_HOST = '127.0.0.1';

export type ResolveBrowserUrlDeps = {
  env: NodeJS.ProcessEnv;
};

const toBrowserUrl = (port: number): string | null => {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return `http://${DEFAULT_CDP_HOST}:${port}`;
};

/**
 * 只认自己进程树继承下来的端口。
 *
 * 端口由 Electron 主进程写进 AIONUI_CDP_ACTIVE_PORT，经 aioncore 继承到这里，所以
 * 「拿不到」只有两种情况：CDP 被用户关掉了，或者不是从应用里启动的。两种情况都应当
 * 拒绝启动，而不是去猜一个端口——猜错会把 Agent 连到另一个实例的浏览器上。
 *
 * Only trust the port inherited down this process tree. The Electron main process
 * writes it into AIONUI_CDP_ACTIVE_PORT and aioncore passes it down, so failing to
 * read it means one of two things: the user disabled CDP, or this was not launched by
 * the app. Both must refuse to start rather than guess a port — guessing wrong
 * connects the agent to a *different* instance's browser.
 */
export const resolveBrowserUrl = (deps: ResolveBrowserUrlDeps): string | null => {
  const { env } = deps;

  const rawPort = env.AIONUI_CDP_ACTIVE_PORT?.trim();
  if (rawPort) {
    const fromEnv = toBrowserUrl(Number(rawPort));
    if (fromEnv) return fromEnv;
  }

  return null;
};

/**
 * 单目标 CDP 通道的访问口令。
 *
 * 口令由主进程随机生成后写进 env，顺着进程继承链传到这里。它的作用是**阻止盲连**：
 * 没读过发现段、不带口令的连接一律被通道 403 掉。
 *
 * 但它**不是身份证明** —— HTTP 发现段不鉴权且响应里就带着口令，同机同用户的任意进程
 * 一个 GET 就能取回来（详见 cdpBridge.ts 里的威胁模型说明）。所以这里要求 env 里有口令，
 * 真正的意义是「通道确实起来了」的凭证：缺了就说明桥没起（或 CDP 被关掉了），此时必须
 * 退出，而不是让 MCP 回退去开一个用户看不见的独立 Chrome。
 *
 * Access token for the single-target CDP bridge. The main process generates it randomly and
 * writes it into the env, from where it travels down the process inheritance chain. Its job is
 * to **prevent blind connections**: anything connecting without it (i.e. without having read
 * discovery) is refused with a 403.
 *
 * It is **not proof of identity** — HTTP discovery is unauthenticated and its response embeds
 * the token, so any process running as the same user can fetch it with one GET (see the threat
 * model note in cdpBridge.ts). Requiring it here really means "the bridge is up": its absence
 * means there is no bridge (or CDP is switched off), and we must exit rather than let the MCP
 * fall back to spawning a separate Chrome the user cannot see.
 */
export const resolveBridgeToken = (deps: ResolveBrowserUrlDeps): string | null => {
  const raw = deps.env.AIONUI_CDP_BRIDGE_TOKEN?.trim();
  return raw ? raw : null;
};

/**
 * 决定用什么命令行拉起 chrome-devtools-mcp。
 *
 * 抽到这里只为可测：browserServer.ts 顶层就 spawn，单测没法 import 它，于是 Windows
 * 那条分支以前完全没有测试覆盖 —— 这正是 issue #3883 能溜过去的原因。
 *
 * Windows 上 npx 是 npx.cmd，批处理文件没有终端无法自己执行，直接 spawn 会抛 EINVAL
 * （CVE-2024-27980 之后 Node 收紧了 .cmd 处理）。这里走 cmd.exe /c 而不是 shell: true，
 * 理由见 browserServer.ts 里的详细说明（DEP0190 + browserUrl 会被 shell 解析）。
 *
 * Decides the command line used to launch chrome-devtools-mcp. Extracted purely for
 * testability: browserServer.ts spawns at module scope so tests cannot import it, which left
 * the Windows branch with no coverage at all — the reason issue #3883 slipped through.
 *
 * On Windows npx is npx.cmd, a batch file that cannot execute without a terminal, so spawning
 * it directly throws EINVAL (Node tightened .cmd handling after CVE-2024-27980). We route
 * through cmd.exe /c rather than shell: true; see browserServer.ts for the full rationale
 * (DEP0190, plus browserUrl would be parsed by the shell).
 */
export const buildMcpSpawnCommand = (deps: {
  platform: string;
  version: string;
  browserUrl: string;
}): { command: string; args: string[] } => {
  const mcpArgs = ['-y', `chrome-devtools-mcp@${deps.version}`, '--browser-url', deps.browserUrl];
  return deps.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/c', 'npx', ...mcpArgs] }
    : { command: 'npx', args: mcpArgs };
};
