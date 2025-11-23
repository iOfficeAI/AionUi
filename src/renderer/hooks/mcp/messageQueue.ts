/**
 * 全局消息队列管理器（单例模式）
 * Global message queue manager (singleton pattern)
 *
 * 作用：确保所有 MCP 相关消息按顺序显示，避免同时触发导致覆盖
 * Purpose: Ensure all MCP-related messages are displayed sequentially to prevent overlap when triggered simultaneously
 *
 * 使用场景 / Use cases:
 * - 快速切换多个 MCP 工具配置开关时 / When rapidly toggling multiple MCP tool configuration switches
 * - 批量测试 MCP 连接时 / When batch testing MCP connections
 * - 同时进行多个同步/移除操作时 / When performing multiple sync/remove operations simultaneously
 */
class MessageQueue {
  private static instance: MessageQueue;
  private queue: Array<() => void> = [];
  private isProcessing = false;
  private readonly delay = 100; // 每条消息间隔 100ms，确保 Arco Design 有足够时间渲染 / 100ms delay between messages to ensure Arco Design has enough time to render
  private readonly maxQueueSize = 50; // 最大队列长度，防止内存溢出 / Maximum queue size to prevent memory overflow

  private constructor() {}

  /**
   * 获取全局单例实例
   * Get the global singleton instance
   */
  static getInstance(): MessageQueue {
    if (!MessageQueue.instance) {
      MessageQueue.instance = new MessageQueue();
    }
    return MessageQueue.instance;
  }

  /**
   * 将消息添加到队列并触发处理
   * Add a message to the queue and trigger processing
   * @param showMessageFn 显示消息的函数 / Function to display the message
   */
  async add(showMessageFn: () => void): Promise<void> {
    // 检查队列长度，如果超过限制则丢弃新消息而不是旧消息
    // Check queue length, discard new message if limit exceeded (not old ones)
    if (this.queue.length >= this.maxQueueSize) {
      console.warn(`Message queue size exceeded ${this.maxQueueSize}, dropping new message`);
      return;
    }
    this.queue.push(showMessageFn);
    if (!this.isProcessing) {
      await this.process();
    }
  }

  /**
   * 按顺序处理队列中的所有消息
   * Process all messages in the queue sequentially
   */
  private async process(): Promise<void> {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) {
        fn();
        // 添加延迟，让 Arco Design 有时间完成动画和布局计算
        // Add delay to allow Arco Design time to complete animations and layout calculations
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }
    }
    this.isProcessing = false;
  }
}

/**
 * 全局消息队列实例
 * Global message queue instance
 *
 * 在所有 MCP 相关的 hooks 中使用，确保消息不会重叠显示
 * Used in all MCP-related hooks to ensure messages don't overlap when displayed
 */
export const globalMessageQueue = MessageQueue.getInstance();
