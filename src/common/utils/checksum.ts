/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 生成临时校验和（仅用于测试/开发）
 * 在生产环境中应从可信的校验和来源获取
 *
 * @param input 用于生成校验和的输入字符串
 * @returns 64位十六进制字符串（SHA256格式）
 */
export function generatePlaceholderChecksum(input: string): string {
  // 基于输入生成一个确定性的64位十六进制字符串（SHA256格式）
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) & 0xffffffff;
  }

  // 将哈希值转换为正数并生成64位十六进制字符串
  const positiveHash = Math.abs(hash);
  const baseHash = positiveHash.toString(16).padStart(8, '0');

  // 重复baseHash以创建64位字符串
  let result = '';
  while (result.length < 64) {
    result += baseHash;
  }

  return result.slice(0, 64);
}
