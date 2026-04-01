/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OrchestratorMcpBridge — MCP 工具注入层
 *
 * 职责：
 * 1. 向主 agent 注入 `delegate_to_agent` MCP 工具定义（通过 system prompt 或 MCP server）
 * 2. 拦截主 agent 发出的 delegate_to_agent tool call
 * 3. 启动目标子 agent（复用 AcpAgentManager），注入任务上下文
 * 4. 收集子 agent 的完整输出，作为 tool result 返回给主 agent
 * 5. 支持传递性：子 agent 也可以发起新的委派
 */

import { agentOrchestrator, type IAgentDelegation } from "./AgentOrchestrator";
import { uuid } from "@/common/utils";
import { mainLog, mainWarn, mainError } from "@process/utils/mainLogger";
import type { AcpBackend } from "@/common/types/acpTypes";
import { isValidAcpBackend } from "@/common/types/acpTypes";

// ── 委派工具的 JSON Schema 定义 ───────────────────────────────────────────────
// 注入到主 agent 的 system prompt，让主 agent 知道可以调用此工具

export const DELEGATE_TOOL_NAME = "delegate_to_agent";

export const DELEGATE_TOOL_SCHEMA = {
  name: DELEGATE_TOOL_NAME,
  description:
    "Delegate a subtask to another AI agent (e.g., gemini, codex, qwen). " +
    "Use this when a different agent has a comparative advantage for the subtask. " +
    "The result will be returned to you so you can continue the main task.",
  inputSchema: {
    type: "object",
    properties: {
      target_agent: {
        type: "string",
        description:
          'The backend name of the target agent. Examples: "gemini", "codex", "qwen", "claude", "opencode".',
      },
      task: {
        type: "string",
        description: "A clear, self-contained description of the subtask for the target agent.",
      },
      context: {
        type: "string",
        description:
          "Optional. Relevant context to share with the target agent (e.g., file contents, prior results).",
      },
    },
    required: ["target_agent", "task"],
  },
} as const;

/**
 * 生成注入到主 agent system prompt 的工具说明段落。
 * 当 AionUi 无法通过 MCP server 动态注入工具时，使用此方式。
 */
export function buildOrchestratorSystemPromptSection(availableAgents: AcpBackend[]): string {
  if (availableAgents.length === 0) return "";

  const agentList = availableAgents.join(", ");
  return [
    "## Multi-Agent Collaboration",
    "",
    `You can delegate subtasks to other AI agents. Available agents: ${agentList}.`,
    "",
    "To delegate, output a tool call with the following format:",
    "```json",
    `{"tool": "${DELEGATE_TOOL_NAME}", "input": {"target_agent": "<agent>", "task": "<task description>", "context": "<optional context>"}}`,
    "```",
    "",
    "The result will be returned to you as a tool result. You can then continue the main task.",
    "Delegation is transitive: the target agent can also delegate to other agents.",
    "",
  ].join("\n");
}

// ── 委派执行器 ────────────────────────────────────────────────────────────────

export interface DelegateToolInput {
  target_agent: string;
  task: string;
  context?: string;
}

export interface DelegationExecutor {
  /**
   * 启动目标 agent，执行任务，返回完整输出。
   * 由 AcpAgentManager 提供具体实现（通过依赖注入）。
   */
  runSubAgent(
    targetBackend: AcpBackend,
    task: string,
    context: string | undefined,
    conversationId: string,
    delegationId: string,
  ): Promise<string>;
}

// ── OrchestratorMcpBridge 主类 ────────────────────────────────────────────────

export class OrchestratorMcpBridge {
  private executor: DelegationExecutor;
  private conversationId: string;
  private sourceBackend: AcpBackend;

  constructor(conversationId: string, sourceBackend: AcpBackend, executor: DelegationExecutor) {
    this.conversationId = conversationId;
    this.sourceBackend = sourceBackend;
    this.executor = executor;
  }

  /**
   * 检测 agent 输出的文本中是否包含 delegate_to_agent tool call。
   * 支持两种格式：
   * 1. JSON tool call 块（```json {"tool": "delegate_to_agent", ...} ```）
   * 2. 原生 MCP tool_call 消息（由 AcpAdapter 解析后传入）
   */
  detectDelegationInText(text: string): DelegateToolInput | null {
    // 匹配 ```json ... ``` 块中的 delegate_to_agent 调用
    const jsonBlockRegex = /```json\s*(\{[\s\S]*?"tool"\s*:\s*"delegate_to_agent"[\s\S]*?\})\s*```/;
    const match = text.match(jsonBlockRegex);
    if (!match) return null;

    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool === DELEGATE_TOOL_NAME && parsed.input?.target_agent && parsed.input?.task) {
        return parsed.input as DelegateToolInput;
      }
    } catch {
      mainWarn("[OrchestratorMcpBridge]", "Failed to parse delegation JSON block");
    }
    return null;
  }

  /**
   * 执行委派：创建委派记录 → 运行子 agent → 返回结果字符串。
   * 调用方（AcpAgentManager）将结果作为 tool result 注入回主 agent。
   */
  async executeDelegation(
    input: DelegateToolInput,
    parentDelegationId?: string,
  ): Promise<{ delegation: IAgentDelegation; result: string }> {
    const targetBackend = input.target_agent as AcpBackend;

    if (!isValidAcpBackend(targetBackend)) {
      const errMsg = `Unknown agent backend: "${input.target_agent}". Available backends can be found in AionUi settings.`;
      mainWarn("[OrchestratorMcpBridge]", errMsg);
      const delegation = agentOrchestrator.createDelegation(
        this.sourceBackend,
        input.target_agent,
        input.task,
        { parentDelegationId },
      );
      agentOrchestrator.updateDelegation(delegation.id, "failed", { error: errMsg });
      return { delegation, result: `[Delegation failed] ${errMsg}` };
    }

    const delegation = agentOrchestrator.createDelegation(
      this.sourceBackend,
      targetBackend,
      input.task,
      { sharedContext: input.context, parentDelegationId },
    );

    mainLog(
      "[OrchestratorMcpBridge]",
      `Delegating from ${this.sourceBackend} → ${targetBackend}: "${input.task.slice(0, 80)}..."`,
    );

    agentOrchestrator.updateDelegation(delegation.id, "running");

    try {
      const result = await this.executor.runSubAgent(
        targetBackend,
        input.task,
        input.context,
        this.conversationId,
        delegation.id,
      );
      agentOrchestrator.updateDelegation(delegation.id, "completed", { result });
      mainLog(
        "[OrchestratorMcpBridge]",
        `Delegation ${delegation.id} completed (${targetBackend})`,
      );
      return { delegation, result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      agentOrchestrator.updateDelegation(delegation.id, "failed", { error: errMsg });
      mainError("[OrchestratorMcpBridge]", `Delegation ${delegation.id} failed:`, errMsg);
      return {
        delegation,
        result: `[Delegation failed] ${targetBackend} agent encountered an error: ${errMsg}`,
      };
    }
  }
}
