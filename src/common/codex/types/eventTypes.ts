/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Codex Agent Event Types
export enum CodexAgentEventType {
  // 会话和配置事件 Session and configuration events
  /**
   * 会话配置事件 - 确认客户端的配置消息
   * prompt: '你好 codex'
   * payload: {
   *  session_id: string,
   *  model: string,
   *  reasoning_effort: string | null,
   *  history_log_id: number,
   *  history_entry_count: number,
   *  initial_messages: EventMsg[] | null,
   *  rollout_path: string
   * }
   * */
  SESSION_CONFIGURED = 'session_configured',

  /**
   * 任务开始事件 - 代理已开始任务
   * prompt: '你好 codex'
   * payload: { model_context_window: number | null }
   */
  TASK_STARTED = 'task_started',

  /**
   * 任务完成事件 - 代理已完成所有操作
   * prompt: '你好 codex'
   * payload: { last_agent_message: string | null }
   */
  TASK_COMPLETE = 'task_complete',

  // Text & reasoning events
  /**
   * 代理消息增量事件 - 代理文本输出的增量消息（流式增量消息）
   * prompt: '你好 codex'
   * payload: { delta: string }
   */
  AGENT_MESSAGE_DELTA = 'agent_message_delta',

  /**
   * 代理消息事件 - 代理文本输出消息（完整输出消息）
   * prompt: '你好 codex'
   * payload: { message: string }
   */
  AGENT_MESSAGE = 'agent_message',

  /**
   * 用户消息事件 - 用户/系统输入消息（发送给模型的内容）
   * prompt: '你好 codex'
   * payload: { message: string, kind: InputMessageKind | null, images: string[] | null }
   */
  USER_MESSAGE = 'user_message',

  /**
   * 代理推理事件 - 来自代理的推理事件（完整的思考文本）
   * prompt: '我想翻阅codex收发消息原始数据格式的接口文档,应该去哪获取？'
   * payload: { text: string }
   */
  AGENT_REASONING = 'agent_reasoning',

  /**
   * 代理推理增量事件 - 来自代理的推理增量事件（流式增量输出文本）
   * prompt: '可以给我一个openAI 官方 url吗？'
   * payload: { delta: string }
   */
  AGENT_REASONING_DELTA = 'agent_reasoning_delta',

  /**
   * 代理推理原始内容事件 - 来自代理的原始思维链
   * prompt: 'TypeScript 编译错误：'Property X does not exist'，请帮我分析原因'
   * payload: { text: string }
   */
  AGENT_REASONING_RAW_CONTENT = 'agent_reasoning_raw_content',

  /**
   * 代理推理原始内容增量事件 - 来自代理的推理内容增量事件
   * payload: { delta: string }
   */
  AGENT_REASONING_RAW_CONTENT_DELTA = 'agent_reasoning_raw_content_delta',

  /**
   * 代理推理章节分隔事件 - 当模型开始新的推理摘要部分时发出信号（例如，新的标题块）
   * prompt: 'TypeScript 编译错误：'Property X does not exist'，请帮我分析原因'
   * payload: {}
   */
  AGENT_REASONING_SECTION_BREAK = 'agent_reasoning_section_break',

  // Usage / telemetry
  /**
   * 令牌计数事件 - 当前会话的使用情况更新，包括总计和上一次
   * prompt: '你好 codex'
   * payload: { info: {
      "total_token_usage": {
        "input_tokens": 2439,
        "cached_input_tokens": 2048,
        "output_tokens": 18,
        "reasoning_output_tokens": 0,
        "total_tokens": 2457
      },
      "last_token_usage": {
        "input_tokens": 2439,
        "cached_input_tokens": 2048,
        "output_tokens": 18,
        "reasoning_output_tokens": 0,
        "total_tokens": 2457
      },
      "model_context_window": 272000
    } | null }
   */
  TOKEN_COUNT = 'token_count',

  // 命令执行事件 Command execution events
  /**
   * 执行命令开始事件 - 通知服务器即将执行命令
   * prompt: 'TypeScript 编译错误：'Property X does not exist'，请帮我分析原因'
   * payload: {
      "type": "exec_command_begin",
      "call_id": "call_vufa8VWQV91WSWcc5BlFTsmQ",
      "command": [ "bash", "-lc", "ls -a" ],
      "cwd": "/Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1758954404275",
      "parsed_cmd": [
        {
        "type": "list_files",
        "cmd": "ls -a",
        "path": null
        }
      ]
    }
   */
  EXEC_COMMAND_BEGIN = 'exec_command_begin',

  /**
   * 执行命令输出增量事件 - 正在运行命令的增量输出块
   * prompt: 'TypeScript 编译错误：'Property X does not exist'，请帮我分析原因'
   * payload: { call_id: string, stream: ExecOutputStream, chunk: number[] }
   * {
      "type": "exec_command_output_delta",
      "call_id": "call_vufa8VWQV91WSWcc5BlFTsmQ",
      "stream": "stdout",
      "chunk": "LgouLgo="
    }
   */
  EXEC_COMMAND_OUTPUT_DELTA = 'exec_command_output_delta',

  /**
   * 执行命令结束事件 - 表示命令执行完成
   * prompt: 'TypeScript 编译错误：'Property X does not exist'，请帮我分析原因'
   * payload: {
   *  "type": "exec_command_end",
   *  "call_id": "call_vufa8VWQV91WSWcc5BlFTsmQ",
   *  "stdout": ".\\n..\\n",
   *  "stderr": "",
   *  "aggregated_output": ".\\n..\\n",
   *  "exit_code": 0,
   *  "duration": {
   *    "secs": 0,
   *    "nanos": 297701750
   *  },
   *  "formatted_output": ".\\n..\\n"
   * }
   */
  EXEC_COMMAND_END = 'exec_command_end',

  /**
   * 执行批准请求事件 - 请求批准命令执行
   * prompt: 帮我创建一个文件 hello.txt , 内容为 ’hello codex‘
   * payload:  {
      "type": "exec_approval_request",
      "call_id": "call_W5qxMSKOP2eHaEq16QCtrhVS",
      "command": ["bash", "-lc", "echo '1231231' > hello.txt" ],
      "cwd": "/Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1758954404275",
      "reason": "Need to create hello.txt with requested content per user instruction"
    }
   */
  EXEC_APPROVAL_REQUEST = 'exec_approval_request',

  //  补丁/文件修改事件 Patch/file modification events
  /**
   * 应用补丁批准请求事件 - 请求批准应用代码补丁
   * prompt: 帮我创建一个文件 hello.txt , 内容为 ’hello codex‘
   * payload: {
      type: 'apply_patch_approval_request',
      call_id: 'patch-7',
      changes: {
        'src/app.ts': { type: 'update', unified_diff: '--- a\n+++ b\n+console.log("hi")\n', move_path: null },
        'README.md': { type: 'add', content: '# Readme\n' },
      },
      reason: null,
      grant_root: null,
    }
   */
  APPLY_PATCH_APPROVAL_REQUEST = 'apply_patch_approval_request',

  /**
   * 补丁应用开始事件 - 通知代理即将应用代码补丁。镜像 `ExecCommandBegin`，以便前端可以显示进度指示器
   * tips: codex 运行在 sandbox_mode=read-only 模式下，无法直接写入文件，不会触发 patch_apply_begin → patch_apply_end 流程。
   *      需要在 ~/.codex/config.toml 中 修改配置，sandbox_mode = "workspace-write" apply_patch = true
   * prompt: 用命令 apply_patch <<'PATCH' … PATCH 写入一个文件，内容和文件名你自由发挥
   * payload: {
      "type": "patch_apply_begin",
          "call_id": "call_3tChlyDszdHuQRQTWnuZ8Jvb",
          "auto_approved": false,
          "changes": {
            "/Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759144414815/note.txt": {
            "add": {
              "content": "This file was created via apply_patch.\nValue: 100.\n"
            }
          }
        }
      }
   */
  PATCH_APPLY_BEGIN = 'patch_apply_begin',

  /**
   * 补丁应用结束事件 - 通知补丁应用已完成
   * prompt:  用命令 apply_patch <<'PATCH' … PATCH 写入一个文件，内容和文件名你自由发挥
   * payload: {
      "type": "patch_apply_end",
      "call_id": "call_3tChlyDszdHuQRQTWnuZ8Jvb",
      "stdout": "Success. Updated the following files:\nA note.txt\n",
      "stderr": "",
      "success": true
    }
   */
  PATCH_APPLY_END = 'patch_apply_end',

  // MCP tool events
  /**
   * MCP工具调用开始事件 - 表示MCP工具调用开始
   * tips: 需要先安装 codex mcp add 12306-mcp，12306-mcp 是一个 MCP 服务器, 更多MCP可查考 https://modelscope.cn/mcp?page=1 , 安装完成通过 codex mcp list 查看是否安装成功
   * prompt: 帮我查询 2025-10-10 从深圳到广州的高铁票
   * payload: {
      "type": "mcp_tool_call_begin",
      "call_id": "call_2ZBKJbPYIBgm5qo2mzRpqi1U",
        "invocation": {
        "server": "12306-mcp",
        "tool": "get-tickets",
        "arguments": {
          "date": "2025-10-10",
          "fromStation": "SZQ",
          "toStation": "GZQ"
        }
      }
    }
   */
  MCP_TOOL_CALL_BEGIN = 'mcp_tool_call_begin',

  /**
   * MCP工具调用结束事件 - 表示MCP工具调用结束
   * 
   * prompt: 帮我查询 2025-10-10 从深圳到广州的高铁票
   * payload: {
    "type": "mcp_tool_call_end",
      "call_id": "call_VNRuLW1UoklIAK3QTL5iE47l",
      "invocation": {
        "server": "12306-mcp",
        "tool": "get-tickets",
        "arguments": {
          "date": "2025-10-10",
          "fromStation": "SZQ",
          "toStation": "GZQ"
          }
        },
        "duration": {
          "secs": 0,
          "nanos": 874102541
        },
        "result": {
          "Ok": {
          "content": [
            {
            "text": "车次|出发站 -> 到达站|出发时间 -> 到达时间|历时\nG834 深圳北(telecode:IOQ) -> 广州南(telecode:IZQ) 06:10 -> 06:46 历时：00:36\n-……",
            "type": "text"
            }
          ]
        }
      }
    }
   */
  MCP_TOOL_CALL_END = 'mcp_tool_call_end',

  /**
   * MCP列表工具响应事件 - 代理可用的MCP工具列表
   * payload: { tools: Record<string, McpTool> }
   */
  MCP_LIST_TOOLS_RESPONSE = 'mcp_list_tools_response',

  // Web search events
  /**
   * 网络搜索开始事件 - 表示网络搜索开始
   * tips：web_serach 的能力需要手动设置开启，~/.codex/config.toml 中 添加 web_search = true
   * prompt: 查找 TypeScript 5.0 的新功能， 不要用现有知识库回答我，去官网搜索最新资料
   * payload: {
   *  "type":"web_search_begin",
   *  "call_id":"ws_010bdd5c4db8ef410168da04c74a648196b7e30cb864885b26"
   * }
   */
  WEB_SEARCH_BEGIN = 'web_search_begin',

  /**
   * 网络搜索结束事件 - 表示网络搜索结束
   * prompt: 查找 TypeScript 5.0 的新功能， 不要用现有知识库回答我，去官网搜索最新资料
   * payload: {
   *  "type":"web_search_end",
   *  "call_id":"ws_010bdd5c4db8ef410168da04c74a648196b7e30cb864885b26",
   *  "query":"TypeScript 5.0 whats new site:devblogs.microsoft.com/typescript"
   * }
   */
  WEB_SEARCH_END = 'web_search_end',

  // Conversation history & context
  /**
   * 转换差异事件 - 表示转换之间的差异
   * prompt: 用命令 apply_patch <<'PATCH' … PATCH 写入一个文件，内容和文件名你自由发挥
   * payload: {
      "type": "turn_diff",
      // eslint-disable-next-line max-len
      "unified_diff": "diff --git a//Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759197123355/freestyle.txt b//Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759197123355/freestyle.txt\nnew file mode 100644\nindex 0000000000000000000000000000000000000000..151e31d7a6627e3fb0df2e49b3c0c179f96e46cc\n--- /dev/null\n+++ b//Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759197123355/freestyle.txt\n@@ -0,0 +1,2 @@\n+This file was created via apply_patch.\n+Line two says hello.\n"
    }
   */
  TURN_DIFF = 'turn_diff',

  /**
   * 获取历史条目响应事件 - GetHistoryEntryRequest 的响应
   * prompt: 查看当前会话的历史记录
   * payload: { offset: number, log_id: number, entry: HistoryEntry | null }
   */
  GET_HISTORY_ENTRY_RESPONSE = 'get_history_entry_response',

  /**
   * 列出自定义提示响应事件 - 代理可用的自定义提示列表
   * payload: { custom_prompts: CustomPrompt[] }
   */
  LIST_CUSTOM_PROMPTS_RESPONSE = 'list_custom_prompts_response',

  /**
   * 对话路径事件 - 表示对话路径信息
   * payload: { conversation_id: string, path: string }
   */
  CONVERSATION_PATH = 'conversation_path',

  /**
   * 后台事件 - 后台处理事件
   * payload: { message: string }
   */
  BACKGROUND_EVENT = 'background_event',

  /**
   * 转换中止事件 - 表示转换已中止
   * payload: { reason: TurnAbortReason }
   */
  TURN_ABORTED = 'turn_aborted',
}
