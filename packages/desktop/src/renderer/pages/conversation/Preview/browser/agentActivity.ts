/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 从工具调用流里识别「Agent 正在操作应用内浏览器」。
 *
 * 纯函数、无副作用，因此可以单测 —— 这段判断的正确性很重要：判错了会导致
 * 角标常亮或者永不亮，而这正是用户理解"刚才发生了什么"的唯一线索。
 *
 * Detects "the agent is driving the in-app browser" from the tool-call stream.
 * Kept pure and side-effect free so it can be unit tested: getting this wrong
 * leaves the activity badge either permanently on or never on, and it is the
 * user's only cue about what just happened.
 */

/**
 * 内置浏览器 MCP 的注册名，定义在 common 以便主进程注册、渲染进程识别用同一份值。
 * 从这里重新导出，方便本目录内就近取用。
 *
 * Registered name of the built-in browser MCP. Defined in common so the main
 * process (which registers it) and the renderer (which recognises it) share one
 * value; re-exported here for local use within this directory.
 */
export { BUILTIN_BROWSER_MCP_NAME } from '@/common/config/constants';

import { BUILTIN_BROWSER_MCP_NAME } from '@/common/config/constants';

/**
 * 工具执行中的状态。
 *
 * `Confirming` 也算"进行中"：此时 Agent 已经在等用户批准某个浏览器操作，
 * 用户更需要知道注意力该放哪儿。
 *
 * Statuses that count as in-flight. `Confirming` is included: at that point the
 * agent is waiting for approval of a browser action, which is exactly when the
 * user most needs to know where to look.
 */
const IN_FLIGHT_STATUSES = new Set(['Executing', 'Pending', 'Confirming']);

type ToolGroupEntry = {
  name?: string;
  status?: string;
  confirmationDetails?: { type?: string; server_name?: string } | Record<string, unknown>;
};

const isBrowserMcpEntry = (entry: ToolGroupEntry): boolean => {
  const details = entry.confirmationDetails as { type?: string; server_name?: string } | undefined;
  if (details?.type === 'mcp' && details.server_name === BUILTIN_BROWSER_MCP_NAME) return true;

  /**
   * 兜底按工具名前缀匹配：不同引擎对 MCP 工具的命名方式不一致，有的会带
   * `<server>__<tool>` 前缀而不填 confirmationDetails。少认一次比误认一次好，
   * 但这两条覆盖了目前所有已知形态。
   *
   * Fall back to the tool-name prefix: engines differ in how they name MCP tools,
   * and some emit `<server>__<tool>` without confirmationDetails. Under-detecting
   * beats over-detecting, but these two checks cover every known shape today.
   */
  const name = entry.name;
  if (typeof name === 'string' && name.startsWith(`${BUILTIN_BROWSER_MCP_NAME}__`)) return true;

  return false;
};

/**
 * 判断一条 tool_group 消息是否表示 Agent 正在操作浏览器。
 * Whether a tool_group message means the agent is currently driving the browser.
 */
export const isBrowserMcpActivity = (messageType: string, data: unknown): boolean => {
  if (messageType !== 'tool_group') return false;
  if (!Array.isArray(data)) return false;

  return (data as ToolGroupEntry[]).some(
    (entry) => isBrowserMcpEntry(entry) && IN_FLIGHT_STATUSES.has(String(entry.status))
  );
};

/**
 * 判断一条 tool_group 消息是否表示浏览器操作已经结束（成功或失败）。
 *
 * 单独判断"结束"而不是靠"不在进行中"取反：一条消息里可能同时有别的工具，
 * 取反会把无关消息误判成"浏览器操作结束"，角标就会提前熄灭。
 *
 * Whether a tool_group message means a browser action has finished (either way).
 * Detected explicitly rather than as the negation of in-flight: a single message
 * may carry unrelated tools, and negating would misread those as "browser done",
 * extinguishing the badge too early.
 */
export const isBrowserMcpSettled = (messageType: string, data: unknown): boolean => {
  if (messageType !== 'tool_group') return false;
  if (!Array.isArray(data)) return false;

  const entries = (data as ToolGroupEntry[]).filter(isBrowserMcpEntry);
  if (entries.length === 0) return false;

  return entries.every((entry) => !IN_FLIGHT_STATUSES.has(String(entry.status)));
};
