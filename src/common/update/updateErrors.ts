/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { UpdateErrorType } from './updateConfig';

/**
 * 统一的更新错误处理系统
 */

/**
 * 更新错误基类
 */
export class UpdateError extends Error {
  public readonly type: UpdateErrorType;
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: number;
  public readonly cause?: Error;

  constructor(
    type: UpdateErrorType,
    message: string,
    options: {
      code?: string;
      recoverable?: boolean;
      context?: Record<string, any>;
      cause?: Error;
    } = {}
  ) {
    super(message);

    this.name = 'UpdateError';
    this.type = type;
    this.code = options.code || type;
    this.recoverable = options.recoverable ?? false;
    this.context = options.context;
    this.timestamp = Date.now();
    this.cause = options.cause;

    // 保持正确的错误堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UpdateError);
    }
  }

  /**
   * 转换为可序列化的对象
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * 从对象创建错误实例
   */
  static fromJSON(data: any): UpdateError {
    const error = new UpdateError(data.type, data.message, {
      code: data.code,
      recoverable: data.recoverable,
      context: data.context,
    });
    error.stack = data.stack;
    return error;
  }
}

/**
 * 网络相关错误
 */
export class NetworkError extends UpdateError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(UpdateErrorType.NETWORK_ERROR, message, {
      code: 'NETWORK_ERROR',
      recoverable: true,
      context,
      cause,
    });
  }
}

/**
 * 下载相关错误
 */
export class DownloadError extends UpdateError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(UpdateErrorType.DOWNLOAD_ERROR, message, {
      code: 'DOWNLOAD_ERROR',
      recoverable: true,
      context,
      cause,
    });
  }
}

/**
 * 校验和错误
 */
export class ChecksumError extends UpdateError {
  constructor(message: string, context?: Record<string, any>) {
    super(UpdateErrorType.CHECKSUM_ERROR, message, {
      code: 'CHECKSUM_ERROR',
      recoverable: false,
      context,
    });
  }
}

/**
 * 权限错误
 */
export class PermissionError extends UpdateError {
  constructor(message: string, context?: Record<string, any>) {
    super(UpdateErrorType.PERMISSION_ERROR, message, {
      code: 'PERMISSION_ERROR',
      recoverable: false,
      context,
    });
  }
}

/**
 * 磁盘空间错误
 */
export class DiskSpaceError extends UpdateError {
  constructor(message: string, context?: Record<string, any>) {
    super(UpdateErrorType.DISK_SPACE_ERROR, message, {
      code: 'DISK_SPACE_ERROR',
      recoverable: false,
      context,
    });
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends UpdateError {
  constructor(message: string, context?: Record<string, any>) {
    super(UpdateErrorType.TIMEOUT_ERROR, message, {
      code: 'TIMEOUT_ERROR',
      recoverable: true,
      context,
    });
  }
}

/**
 * 错误工厂函数
 */
export class UpdateErrorFactory {
  /**
   * 从任意错误创建更新错误
   */
  static fromError(error: Error, type?: UpdateErrorType, context?: Record<string, any>): UpdateError {
    if (error instanceof UpdateError) {
      return error;
    }

    // 根据错误信息自动推断类型
    const inferredType = this.inferErrorType(error);
    const errorType = type || inferredType;

    return new UpdateError(errorType, error.message, {
      code: error.name,
      recoverable: this.isRecoverable(errorType),
      context: {
        ...context,
        originalName: error.name,
        originalStack: error.stack,
      },
      cause: error,
    });
  }

  /**
   * 从错误信息推断错误类型
   */
  private static inferErrorType(error: Error): UpdateErrorType {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (name.includes('timeout') || message.includes('timeout')) {
      return UpdateErrorType.TIMEOUT_ERROR;
    }

    if (name.includes('network') || message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return UpdateErrorType.NETWORK_ERROR;
    }

    if (message.includes('permission') || message.includes('access denied')) {
      return UpdateErrorType.PERMISSION_ERROR;
    }

    if (message.includes('space') || message.includes('disk full')) {
      return UpdateErrorType.DISK_SPACE_ERROR;
    }

    if (message.includes('checksum') || message.includes('hash') || message.includes('integrity')) {
      return UpdateErrorType.CHECKSUM_ERROR;
    }

    if (message.includes('download') || message.includes('transfer')) {
      return UpdateErrorType.DOWNLOAD_ERROR;
    }

    return UpdateErrorType.UNKNOWN_ERROR;
  }

  /**
   * 判断错误是否可恢复
   */
  private static isRecoverable(type: UpdateErrorType): boolean {
    const recoverableTypes = [UpdateErrorType.NETWORK_ERROR, UpdateErrorType.DOWNLOAD_ERROR, UpdateErrorType.TIMEOUT_ERROR];

    return recoverableTypes.includes(type);
  }
}

/**
 * 重试机制
 */
export class RetryManager {
  private attemptCount: number = 0;
  private lastError: UpdateError | null = null;

  constructor(
    private maxRetries: number = 3,
    private baseDelay: number = 1000,
    private maxDelay: number = 30000,
    private backoffMultiplier: number = 2
  ) {}

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.attemptCount = 0;
    this.lastError = null;

    while (this.attemptCount <= this.maxRetries) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        this.attemptCount++;
        this.lastError = UpdateErrorFactory.fromError(error as Error);

        // 如果不可恢复或达到最大重试次数，直接抛出错误
        if (!this.lastError.recoverable || this.attemptCount > this.maxRetries) {
          throw this.lastError;
        }

        // 计算延迟时间
        const delay = this.calculateDelay();
        await this.delay(delay);
      }
    }

    // 这里应该不会到达，但为了类型安全
    throw this.lastError || new UpdateError(UpdateErrorType.UNKNOWN_ERROR, 'Maximum retries exceeded');
  }

  /**
   * 计算延迟时间（指数退避）
   */
  private calculateDelay(): number {
    const delay = this.baseDelay * Math.pow(this.backoffMultiplier, this.attemptCount - 1);
    return Math.min(delay, this.maxDelay);
  }

  /**
   * 延迟执行
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取当前重试次数
   */
  get attempts(): number {
    return this.attemptCount;
  }

  /**
   * 获取最后一次错误
   */
  get error(): UpdateError | null {
    return this.lastError;
  }
}
