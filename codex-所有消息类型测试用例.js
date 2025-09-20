/**
 * Codex 输入测试用例
 * 用于触发特定消息类型的用户输入示例
 * 基于 codex-全部消息类型示例.js 中的推理类和文件类消息类型
 */

// ======================== 推理类消息触发测试用例 ========================

/**
 * 触发 agent_reasoning 相关消息类型的用户输入
 * 这些输入会让 Codex 进行复杂推理，从而产生推理相关的消息
 */
const reasoningTriggerInputs = {
  // 复杂分析任务 - 触发 agent_reasoning、agent_reasoning_delta
  codebaseAnalysis: ['请分析这个项目的整体架构，并告诉我主要组件之间的关系', '帮我理解这个 React 项目的状态管理模式，分析数据流向', '请深入分析这个 TypeScript 项目的类型系统使用情况', '分析这个项目中的设计模式使用情况，并评估代码质量', '请检查这个项目是否遵循了最佳实践，找出潜在的问题'],

  // 问题诊断 - 触发 agent_reasoning、agent_reasoning_raw_content
  problemSolving: ['这个代码有什么问题？请详细分析错误原因', '为什么我的 React 组件不重新渲染？请帮我排查问题', "TypeScript 编译错误：'Property X does not exist'，请帮我分析原因", '为什么我的异步函数没有按预期执行？请分析可能的原因', '这个性能问题的根源是什么？请深入分析'],

  // 复杂重构任务 - 触发 agent_reasoning_section_break
  refactoringTasks: ['请将这个大型组件拆分为多个小组件，并保持功能完整性', '帮我重构这个项目的文件夹结构，使其更符合最佳实践', '请优化这个函数的性能，并解释优化思路', '将这个类组件转换为函数组件，保持所有功能不变', '请重构这个项目的状态管理，从 Redux 迁移到 Zustand'],

  // 学习解释任务 - 触发 agent_reasoning_raw_content
  educationalQueries: ['请详细解释这段代码的工作原理，包括每一步的逻辑', '这个算法是如何工作的？请一步步分析', '为什么要使用这种设计模式？请分析其优缺点', '请解释 React 的渲染机制，包括虚拟 DOM 的工作原理', 'TypeScript 的类型推断是如何工作的？请详细说明'],
};

/**
 * 触发 agent_message 相关消息类型的用户输入
 * 这些是相对简单的请求，会直接获得回答
 */
const simpleMessageTriggerInputs = {
  // 简单查询 - 触发 agent_message、agent_message_delta
  basicQueries: ['你好，请介绍一下自己', '当前时间是什么？', '请列出这个目录下的所有文件', '这个项目使用了哪些主要的依赖库？', '请显示 package.json 的内容'],

  // 代码查看 - 触发 agent_message_delta 流式输出
  codeViewing: ['请显示 src/App.tsx 的内容', '帮我查看 src/components/Button.tsx 文件', '显示 package.json 中的 scripts 部分', '请查看 tsconfig.json 的配置', '显示 README.md 的内容'],
};

// ======================== 文件类消息触发测试用例 ========================

/**
 * 触发 apply_patch_approval_request 的用户输入
 * 这些请求会让 Codex 要求修改文件，触发审批流程
 */
const fileOperationTriggerInputs = {
  // 创建新文件 - 触发 apply_patch_approval_request (type: 'add')
  createFiles: ['帮我创建一个新的 React 组件 src/components/UserProfile.tsx', '请创建一个工具函数文件 src/utils/dateHelpers.ts', '创建一个新的页面组件 src/pages/Dashboard.tsx', '帮我创建一个类型定义文件 src/types/user.ts', '创建一个 API 服务文件 src/services/userService.ts'],

  // 修改现有文件 - 触发 apply_patch_approval_request (type: 'update')
  updateFiles: ['请在 src/App.tsx 中添加一个新的路由配置', '帮我给 src/components/Button.tsx 添加一个 loading 属性', '请修改 package.json，添加一个新的脚本命令', '在 src/config.ts 中添加一个新的配置项', '请优化 src/utils/helpers.ts 中的性能问题'],

  // 删除文件 - 触发 apply_patch_approval_request (type: 'delete')
  deleteFiles: ['请删除不再使用的文件 src/legacy/oldComponent.tsx', '帮我移除 src/unused/deprecated.ts 文件', '删除测试文件 src/__tests__/obsolete.test.ts', '请移除 src/temp/ 目录下的所有临时文件', '删除 old-config.json 配置文件'],

  // 重命名/移动文件 - 触发 apply_patch_approval_request (move_path)
  moveFiles: ['请将 src/components/Modal.tsx 移动到 src/components/common/ 目录', '帮我将 src/utils/api.ts 重命名为 src/services/api.ts', '将 src/types/index.ts 移动到 src/types/common/index.ts', '请重命名 src/pages/Home.tsx 为 src/pages/Homepage.tsx', '将所有 .jsx 文件的扩展名改为 .tsx'],

  // 批量文件操作 - 触发复杂的 apply_patch_approval_request
  batchOperations: ['请重构整个组件文件夹结构，按功能模块组织', '帮我将所有的 JavaScript 文件转换为 TypeScript', '请更新所有组件文件，添加 TypeScript 类型注解', '批量重命名所有测试文件，添加 .spec 后缀', '请整理所有的导入语句，使用绝对路径'],
};

/**
 * 触发复杂文件操作流程的用户输入
 * 这些会触发完整的 patch_apply_begin -> patch_apply_end 流程
 */
const complexFileOperationInputs = {
  // 功能开发 - 完整的文件操作流程
  featureDevelopment: ['帮我实现一个用户认证系统，包括登录、注册和权限管理', '请创建一个完整的表单组件，包括验证和提交功能', '实现一个数据表格组件，支持排序、筛选和分页', '帮我构建一个文件上传组件，支持拖拽和预览', '创建一个主题切换功能，支持暗色和亮色模式'],

  // 项目重构 - 大规模文件操作
  projectRefactoring: ['请重构这个项目，使用现代的 React Hook 替换类组件', '帮我将项目从 JavaScript 迁移到 TypeScript', '重构状态管理，从 Context API 迁移到 Redux Toolkit', '请优化项目的打包配置，提高构建性能', '重新组织项目结构，按照领域驱动设计原则'],

  // 修复和优化 - 涉及多文件修改
  fixAndOptimize: ['修复这个项目中的所有 TypeScript 类型错误', '请优化所有组件的性能，减少不必要的重渲染', '修复项目中的安全漏洞，更新依赖版本', '优化代码质量，修复所有 ESLint 警告', '提升项目的可访问性，添加必要的 ARIA 属性'],
};

// ======================== 特殊场景触发测试用例 ========================

/**
 * 触发特殊消息类型的边界情况测试
 */
const edgeCaseTriggerInputs = {
  // 可能触发权限错误的操作
  permissionTests: ['请修改系统级配置文件 /etc/hosts', '帮我创建一个需要管理员权限的文件', '修改 node_modules 目录下的文件', '请删除受保护的系统文件'],

  // 可能触发文件冲突的操作
  conflictTests: ['创建一个已经存在的文件 src/App.tsx', '请删除一个不存在的文件 src/nonexistent.ts', '修改一个正在被其他进程使用的文件', '重命名文件到一个已存在的文件名'],

  // 可能触发超时的复杂操作
  timeoutTests: ['请分析这个包含10000个文件的大型项目', '帮我重构整个 node_modules 目录', '分析所有依赖的安全漏洞，并提供修复方案', '请对整个项目进行全面的代码审查和优化建议'],
};

// ======================== 会话与任务类消息触发测试用例 ========================

/**
 * 触发 session_configured, task_started, task_complete 等会话管理消息
 */
const sessionAndTaskTriggerInputs = {
  // 会话开始 - 触发 session_configured, task_started
  sessionStart: ['你好，我需要开始一个新的编程任务', '请帮我开始分析这个项目', '我想要创建一个新功能，让我们开始吧', '开始新的会话，准备进行代码重构', '初始化工作环境，准备开发任务'],

  // 任务完成 - 触发 task_complete
  taskCompletion: ['任务完成，请总结一下我们做了什么', '好的，这个功能开发完成了', '修改已完成，请确认所有更改', '重构工作结束，请提供最终报告', '项目分析完毕，请给出结论'],

  // 会话管理
  sessionManagement: ['显示当前会话的历史记录', '我想查看之前的对话内容', '请恢复到上一个检查点', '保存当前进度状态', '切换到新的工作目录'],
};

// ======================== 命令执行类消息触发测试用例 ========================

/**
 * 触发 exec_command_begin, exec_command_output_delta, exec_command_end, exec_approval_request
 */
const commandExecutionTriggerInputs = {
  // 需要执行权限的命令 - 触发 exec_approval_request
  privilegedCommands: ['请运行 npm install 安装依赖', '执行 npm run build 构建项目', '运行 npm test 执行测试', "请执行 git commit -m 'update files'", '运行 yarn start 启动开发服务器'],

  // 文件搜索命令 - 触发 exec_command_begin/end
  searchCommands: ['搜索项目中所有的 TODO 注释', "查找包含 'useState' 的所有文件", '搜索项目中的 TypeScript 错误', '找出所有未使用的导入', '查找项目中的安全漏洞'],

  // 文件系统操作 - 触发完整的 exec 流程
  fileSystemCommands: ['列出当前目录下的所有文件', '查看 package.json 的内容', '显示项目的目录结构', '检查文件权限和大小', '统计项目中的代码行数'],

  // 开发工具命令
  developmentCommands: ['运行 ESLint 检查代码质量', '执行 TypeScript 类型检查', '运行 Prettier 格式化代码', '执行单元测试并生成覆盖率报告', '分析项目的依赖关系'],

  // Git 操作命令
  gitCommands: ['查看 Git 状态和未提交的更改', '显示最近的提交历史', '检查是否有冲突需要解决', '查看分支信息', '显示文件的修改差异'],
};

// ======================== 工具调用类消息触发测试用例 ========================

/**
 * 触发 mcp_tool_call_begin, mcp_tool_call_end, web_search_begin, web_search_end
 */
const toolCallTriggerInputs = {
  // Web 搜索 - 触发 web_search_begin/end
  webSearchQueries: ['搜索 React 18 的最新特性', '查找 TypeScript 5.0 的新功能', '搜索如何优化 Webpack 构建性能', '查找 Node.js 最佳实践指南', '搜索前端安全相关的文档'],

  // MCP 工具调用 - 触发 mcp_tool_call_begin/end
  mcpToolCalls: ['使用文档工具搜索 API 说明', '调用代码分析工具检查质量', '使用测试工具验证功能', '调用性能分析工具', '使用安全扫描工具'],

  // 外部服务集成
  externalServices: ['连接到 GitHub API 获取仓库信息', '调用 NPM Registry 检查包版本', '使用 CI/CD 工具检查构建状态', '连接数据库检查连接状态', '调用第三方 API 服务'],
};

// ======================== 用户消息类触发测试用例 ========================

/**
 * 触发 user_message 相关消息类型
 */
const userMessageTriggerInputs = {
  // 纯文本指令 - kind: 'plain'
  plainInstructions: ['请帮我创建一个登录页面', '我需要优化这个函数的性能', '解释一下这段代码的作用', '修复这个 TypeScript 错误', '重构这个组件使其更简洁'],

  // 用户指令 - kind: 'user_instructions'
  userInstructions: ['按照以下要求实现功能：1. 支持暗色主题 2. 响应式设计 3. 可访问性支持', '遵循这些编码规范：使用 TypeScript，遵循 ESLint 规则，添加单元测试', '按照 React 最佳实践重写这个组件，确保性能和可维护性', '实现用户权限系统，包括角色管理和访问控制', '创建一个完整的 CRUD 界面，支持分页和搜索功能'],

  // 环境上下文 - kind: 'environment_context'
  environmentContext: ['当前项目使用 React 18 + TypeScript + Vite，请基于此技术栈开发', '这是一个 Node.js 后端项目，使用 Express 和 MongoDB', '项目采用微前端架构，使用 Module Federation', '这是一个移动端 React Native 项目', '项目使用 Next.js 框架，需要考虑 SSR'],

  // 带图片的消息 - images: string[]
  messagesWithImages: ['请分析这个设计稿并实现对应的 UI 组件', '根据这个错误截图帮我定位问题', '参考这个界面设计创建相应的代码', '这是我的代码编辑器截图，请帮我分析问题', '根据这个流程图实现相应的业务逻辑'],
};

// ======================== 令牌统计类消息触发测试用例 ========================

/**
 * 触发 token_count 消息（通常在大型任务后自动触发）
 */
const tokenCountTriggerInputs = {
  // 大型分析任务 - 会产生大量 token 使用
  largeAnalysisTasks: ['请对整个项目进行全面的代码审查，包括架构、性能、安全性分析', '生成详细的项目文档，包括 API 文档、用户手册和开发指南', '分析项目中的所有依赖关系，检查安全漏洞和更新建议', '创建完整的测试套件，包括单元测试、集成测试和端到端测试', '重构整个项目架构，从单体应用改为微服务架构'],

  // 复杂生成任务
  complexGenerationTasks: ['根据需求文档生成完整的前后端代码', '创建一个包含多个页面的完整 Web 应用', '生成详细的性能优化报告和改进建议', '创建完整的 CI/CD 流水线配置', '生成多语言国际化支持的完整方案'],
};

// ======================== 其他类型消息触发测试用例 ========================

/**
 * 触发 turn_diff, background_event, stream_error, turn_aborted 等其他消息类型
 */
const miscellaneousTriggerInputs = {
  // 可能触发 turn_diff 的操作
  diffOperations: ['显示我刚才所做的所有更改', '对比修改前后的代码差异', '展示这次重构的具体变更', '查看文件的修改历史', '比较两个版本之间的差异'],

  // 可能触发 background_event 的长时间任务
  backgroundTasks: ['在后台运行完整的项目构建', '启动长时间的依赖安装过程', '后台执行大规模的代码格式化', '在后台进行完整的测试覆盖率分析', '后台运行安全漏洞扫描'],

  // 可能触发 stream_error 的操作
  errorProneOperations: ['连接到不存在的数据库', '访问没有权限的文件', '执行语法错误的命令', '调用不存在的 API 接口', '处理超大的文件'],

  // 可能触发 turn_aborted 的中断操作
  interruptibleOperations: ['开始一个复杂的分析任务，然后我会中断它', '启动长时间运行的构建过程', '开始大型文件的处理任务', '启动复杂的代码生成过程', '开始深度的项目重构任务'],

  // 获取响应类消息
  responseQueries: ['显示可用的 MCP 工具列表', '查看当前会话的历史记录', '显示自定义提示模板', '获取当前对话的路径信息', '查看系统支持的功能'],
};

// ======================== 导出测试用例 ========================

module.exports = {
  // 推理类触发测试用例
  reasoning: reasoningTriggerInputs,

  // 简单消息触发测试用例
  simpleMessage: simpleMessageTriggerInputs,

  // 文件操作触发测试用例
  fileOperations: fileOperationTriggerInputs,

  // 复杂文件操作触发测试用例
  complexFileOperations: complexFileOperationInputs,

  // 会话与任务类触发测试用例
  sessionAndTask: sessionAndTaskTriggerInputs,

  // 命令执行类触发测试用例
  commandExecution: commandExecutionTriggerInputs,

  // 工具调用类触发测试用例
  toolCalls: toolCallTriggerInputs,

  // 用户消息类触发测试用例
  userMessage: userMessageTriggerInputs,

  // 令牌统计类触发测试用例
  tokenCount: tokenCountTriggerInputs,

  // 其他类型触发测试用例
  miscellaneous: miscellaneousTriggerInputs,

  // 边界情况触发测试用例
  edgeCases: edgeCaseTriggerInputs,

  // 获取所有测试用例
  getAllInputs: function () {
    return {
      ...this.reasoning,
      ...this.simpleMessage,
      ...this.fileOperations,
      ...this.complexFileOperations,
      ...this.sessionAndTask,
      ...this.commandExecution,
      ...this.toolCalls,
      ...this.userMessage,
      ...this.tokenCount,
      ...this.miscellaneous,
      ...this.edgeCases,
    };
  },

  // 获取随机测试用例
  getRandomInput: function (category = null) {
    const categories = category ? [category] : Object.keys(this).filter((key) => typeof this[key] === 'object' && key !== 'getAllInputs' && key !== 'getRandomInput');
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const categoryInputs = this[randomCategory];

    if (typeof categoryInputs === 'object' && !Array.isArray(categoryInputs)) {
      const subCategories = Object.keys(categoryInputs);
      const randomSubCategory = subCategories[Math.floor(Math.random() * subCategories.length)];
      const inputs = categoryInputs[randomSubCategory];
      return inputs[Math.floor(Math.random() * inputs.length)];
    }

    return categoryInputs[Math.floor(Math.random() * categoryInputs.length)];
  },

  // 获取特定消息类型的测试用例
  getTestsForMessageType: function (messageType) {
    const typeMapping = {
      // Session & Task
      session_configured: this.sessionAndTask.sessionStart,
      task_started: this.sessionAndTask.sessionStart,
      task_complete: this.sessionAndTask.taskCompletion,

      // Text & Reasoning
      agent_message_delta: this.simpleMessage.basicQueries,
      agent_message: this.simpleMessage.basicQueries,
      user_message: this.userMessage.plainInstructions,
      agent_reasoning: this.reasoning.codebaseAnalysis,
      agent_reasoning_delta: this.reasoning.problemSolving,
      agent_reasoning_raw_content: this.reasoning.educationalQueries,
      agent_reasoning_raw_content_delta: this.reasoning.educationalQueries,
      agent_reasoning_section_break: this.reasoning.refactoringTasks,

      // Usage
      token_count: this.tokenCount.largeAnalysisTasks,

      // Exec
      exec_command_begin: this.commandExecution.fileSystemCommands,
      exec_command_output_delta: this.commandExecution.searchCommands,
      exec_command_end: this.commandExecution.developmentCommands,
      exec_approval_request: this.commandExecution.privilegedCommands,

      // Patch
      apply_patch_approval_request: this.fileOperations.createFiles,
      patch_apply_begin: this.fileOperations.updateFiles,
      patch_apply_end: this.complexFileOperations.featureDevelopment,

      // MCP tools & Web search
      mcp_tool_call_begin: this.toolCalls.mcpToolCalls,
      mcp_tool_call_end: this.toolCalls.externalServices,
      web_search_begin: this.toolCalls.webSearchQueries,
      web_search_end: this.toolCalls.webSearchQueries,

      // Misc
      turn_diff: this.miscellaneous.diffOperations,
      background_event: this.miscellaneous.backgroundTasks,
      stream_error: this.miscellaneous.errorProneOperations,
      turn_aborted: this.miscellaneous.interruptibleOperations,
      get_history_entry_response: this.miscellaneous.responseQueries,
      mcp_list_tools_response: this.miscellaneous.responseQueries,
      list_custom_prompts_response: this.miscellaneous.responseQueries,
      conversation_path: this.sessionAndTask.sessionManagement,
    };

    return typeMapping[messageType] || ['未找到对应的测试用例'];
  },
};

// ======================== 使用示例 ========================

/*
// 使用方式示例：
const testInputs = require('./codex-input-test-cases.js');

// 获取推理类触发输入
console.log('Complex Analysis Inputs:', testInputs.reasoning.codebaseAnalysis);

// 获取文件操作触发输入
console.log('File Creation Inputs:', testInputs.fileOperations.createFiles);

// 获取随机测试输入
const randomInput = testInputs.getRandomInput('fileOperations');
console.log('Random File Operation Input:', randomInput);

// 循环测试所有输入
testInputs.reasoning.codebaseAnalysis.forEach((input, index) => {
  console.log(`Sending to Codex [${index + 1}]: ${input}`);
  // 这里调用你的 Codex 发送消息函数
  // sendMessageToCodex(input);
});
*/
