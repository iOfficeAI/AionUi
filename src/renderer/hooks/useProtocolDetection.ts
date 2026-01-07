/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProtocolDetectionResponse } from '@/common/utils/protocolDetector';
import { ipcBridge } from '@/common';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 协议检测 Hook 配置
 * Protocol detection hook configuration
 */
interface UseProtocolDetectionOptions {
  /** 防抖延迟（毫秒）/ Debounce delay in milliseconds */
  debounceMs?: number;
  /** 是否自动检测 / Whether to auto-detect */
  autoDetect?: boolean;
  /** 超时时间（毫秒）/ Timeout in milliseconds */
  timeout?: number;
  /** 是否测试所有 Key / Whether to test all keys */
  testAllKeys?: boolean;
}

/**
 * 协议检测 Hook 返回值
 * Protocol detection hook return value
 */
interface UseProtocolDetectionResult {
  /** 是否正在检测 / Whether detecting */
  isDetecting: boolean;
  /** 检测结果 / Detection result */
  result: ProtocolDetectionResponse | null;
  /** 错误信息 / Error message */
  error: string | null;
  /** 手动触发检测 / Manually trigger detection */
  detect: (baseUrl: string, apiKey: string) => Promise<void>;
  /** 重置状态 / Reset state */
  reset: () => void;
}

/**
 * 协议检测 Hook
 * Protocol Detection Hook
 *
 * 用于自动检测 API 端点使用的协议类型
 * Used to auto-detect the protocol type used by an API endpoint
 *
 * @param baseUrl - Base URL
 * @param apiKey - API Key（可以是逗号或换行分隔的多个 Key）
 * @param options - 配置选项
 */
export function useProtocolDetection(baseUrl: string, apiKey: string, options: UseProtocolDetectionOptions = {}): UseProtocolDetectionResult {
  const { debounceMs = 800, autoDetect = true, timeout = 10000, testAllKeys = false } = options;

  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState<ProtocolDetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 防抖定时器
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 请求版本号（用于取消过期请求）
  const requestVersionRef = useRef(0);

  /**
   * 执行协议检测
   * Execute protocol detection
   */
  const detect = useCallback(
    async (url: string, key: string) => {
      // 清除之前的定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // 验证输入
      if (!url || !key) {
        setResult(null);
        setError(null);
        return;
      }

      // 增加请求版本号
      const currentVersion = ++requestVersionRef.current;

      setIsDetecting(true);
      setError(null);

      try {
        const response = await ipcBridge.mode.detectProtocol.invoke({
          baseUrl: url,
          apiKey: key,
          timeout,
          testAllKeys,
        });

        // 检查是否是最新的请求
        if (currentVersion !== requestVersionRef.current) {
          return;
        }

        if (response.success && response.data) {
          setResult(response.data);
          setError(null);
        } else {
          setResult(response.data || null);
          setError(response.msg || 'Detection failed');
        }
      } catch (e: any) {
        // 检查是否是最新的请求
        if (currentVersion !== requestVersionRef.current) {
          return;
        }

        setResult(null);
        setError(e.message || String(e));
      } finally {
        // 检查是否是最新的请求
        if (currentVersion === requestVersionRef.current) {
          setIsDetecting(false);
        }
      }
    },
    [timeout, testAllKeys]
  );

  /**
   * 重置状态
   * Reset state
   */
  const reset = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    requestVersionRef.current++;
    setIsDetecting(false);
    setResult(null);
    setError(null);
  }, []);

  /**
   * 自动检测（带防抖）
   * Auto-detect with debounce
   */
  useEffect(() => {
    if (!autoDetect) {
      return;
    }

    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 如果没有有效输入，重置状态
    if (!baseUrl || !apiKey) {
      setResult(null);
      setError(null);
      return;
    }

    // 设置防抖定时器
    debounceTimerRef.current = setTimeout(() => {
      void detect(baseUrl, apiKey);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [baseUrl, apiKey, autoDetect, debounceMs, detect]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      requestVersionRef.current++;
    };
  }, []);

  return {
    isDetecting,
    result,
    error,
    detect,
    reset,
  };
}

export default useProtocolDetection;
