/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ErrorRequestHandler, Response } from 'express';

/**
 * 应用错误类 - 自定义错误类，包含状态码和错误代码
 * Application Error Class - Custom error class with status code and error code
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'internal_error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * 错误命令接口 - 定义错误响应的执行方式
 * Error Command Interface - Define how error responses are executed
 */
interface ErrorCommand {
  execute(res: Response): void;
}

/**
 * JSON 错误命令 - 返回 JSON 格式的错误响应
 * JSON Error Command - Return error response in JSON format
 */
class JsonErrorCommand implements ErrorCommand {
  constructor(
    private readonly statusCode: number,
    private readonly payload: Record<string, unknown>
  ) {}

  execute(res: Response): void {
    res.status(this.statusCode).json({ success: false, ...this.payload });
  }
}

/**
 * 全局错误处理中间件
 * Global error handling middleware
 *
 * 处理所有未被捕获的错误，统一返回格式化的错误响应
 * Handles all uncaught errors and returns formatted error responses
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'internal_error';
  const message = isAppError ? err.message : 'Internal server error';

  // 仅记录非预期错误 / Only log unexpected errors
  if (!isAppError) {
    console.error('[Error]', err);
  }

  const command = new JsonErrorCommand(statusCode, {
    error: message,
    code,
  });

  command.execute(res);
};

/**
 * 创建应用错误
 * Create application error
 * @param message - 错误消息 / Error message
 * @param statusCode - HTTP 状态码 / HTTP status code
 * @param code - 错误代码 / Error code
 * @returns AppError 实例 / AppError instance
 */
export const createAppError = (message: string, statusCode = 400, code = 'bad_request'): AppError => {
  return new AppError(message, statusCode, code);
};
