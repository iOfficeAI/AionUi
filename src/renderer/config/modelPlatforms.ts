/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 模型平台配置模块
 * Model Platform Configuration Module
 *
 * 集中管理所有模型平台的配置信息，便于扩展和维护
 * Centralized management of all model platform configurations for extensibility and maintainability
 */

// Provider Logo imports
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import OpenAILogo from '@/renderer/assets/logos/openai.svg';
import AnthropicLogo from '@/renderer/assets/logos/anthropic.svg';
import DeepSeekLogo from '@/renderer/assets/logos/deepseek.svg';
import OpenRouterLogo from '@/renderer/assets/logos/openrouter.svg';
import SiliconFlowLogo from '@/renderer/assets/logos/siliconflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import ZhipuLogo from '@/renderer/assets/logos/zhipu.svg';
import XaiLogo from '@/renderer/assets/logos/xai.svg';
import VolcengineLogo from '@/renderer/assets/logos/volcengine.svg';
import BaiduLogo from '@/renderer/assets/logos/baidu.svg';
import TencentLogo from '@/renderer/assets/logos/tencent.svg';
import LingyiLogo from '@/renderer/assets/logos/lingyiwanwu.svg';
import PoeLogo from '@/renderer/assets/logos/poe.svg';
import ModelScopeLogo from '@/renderer/assets/logos/modelscope.svg';
import InfiniAILogo from '@/renderer/assets/logos/infiniai.svg';
import CtyunLogo from '@/renderer/assets/logos/ctyun.svg';
import StepFunLogo from '@/renderer/assets/logos/stepfun.svg';

/**
 * 平台类型
 * Platform type
 */
export type PlatformType = 'gemini' | 'gemini-vertex-ai' | 'custom';

/**
 * 模型平台配置接口
 * Model Platform Configuration Interface
 */
export interface PlatformConfig {
  /** 平台名称 / Platform name */
  name: string;
  /** 平台值（用于表单） / Platform value (for form) */
  value: string;
  /** Logo 路径 / Logo path */
  logo: string | null;
  /** 平台标识 / Platform identifier */
  platform: PlatformType;
  /** Base URL（预设供应商使用） / Base URL (for preset providers) */
  baseUrl?: string;
  /** 国际化 key（可选，用于需要翻译的平台名称） / i18n key (optional, for platform names that need translation) */
  i18nKey?: string;
}

/**
 * 模型平台选项列表
 * Model Platform options list
 *
 * 顺序：
 * 1. Gemini (官方)
 * 2. Gemini Vertex AI
 * 3. 自定义（需要用户输入 base url）
 * 4+ 预设供应商
 */
export const MODEL_PLATFORMS: PlatformConfig[] = [
  // 自定义选项（需要用户输入 base url）/ Custom option (requires user to input base url)
  { name: 'Custom', value: 'custom', logo: null, platform: 'custom', i18nKey: 'settings.platformCustom' },

  // 官方 Gemini 平台
  { name: 'Gemini', value: 'gemini', logo: GeminiLogo, platform: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  { name: 'Gemini (Vertex AI)', value: 'gemini-vertex-ai', logo: GeminiLogo, platform: 'gemini-vertex-ai' },

  // 预设供应商（按字母顺序排列）
  { name: 'OpenAI', value: 'OpenAI', logo: OpenAILogo, platform: 'custom', baseUrl: 'https://api.openai.com/v1' },
  { name: 'Anthropic', value: 'Anthropic', logo: AnthropicLogo, platform: 'custom', baseUrl: 'https://api.anthropic.com/v1' },
  { name: 'DeepSeek', value: 'DeepSeek', logo: DeepSeekLogo, platform: 'custom', baseUrl: 'https://api.deepseek.com' },
  { name: 'OpenRouter', value: 'OpenRouter', logo: OpenRouterLogo, platform: 'custom', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Dashscope', value: 'Dashscope', logo: QwenLogo, platform: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: 'SiliconFlow', value: 'SiliconFlow', logo: SiliconFlowLogo, platform: 'custom', baseUrl: 'https://api.siliconflow.cn/v1' },
  { name: 'Zhipu', value: 'Zhipu', logo: ZhipuLogo, platform: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: 'Moonshot', value: 'Moonshot', logo: KimiLogo, platform: 'custom', baseUrl: 'https://api.moonshot.cn/v1' },
  { name: 'xAI', value: 'xAI', logo: XaiLogo, platform: 'custom', baseUrl: 'https://api.x.ai/v1' },
  { name: 'Ark', value: 'Ark', logo: VolcengineLogo, platform: 'custom', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { name: 'Qianfan', value: 'Qianfan', logo: BaiduLogo, platform: 'custom', baseUrl: 'https://qianfan.baidubce.com/v2' },
  { name: 'Hunyuan', value: 'Hunyuan', logo: TencentLogo, platform: 'custom', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1' },
  { name: 'Lingyi', value: 'Lingyi', logo: LingyiLogo, platform: 'custom', baseUrl: 'https://api.lingyiwanwu.com/v1' },
  { name: 'Poe', value: 'Poe', logo: PoeLogo, platform: 'custom', baseUrl: 'https://api.poe.com/v1' },
  { name: 'ModelScope', value: 'ModelScope', logo: ModelScopeLogo, platform: 'custom', baseUrl: 'https://api-inference.modelscope.cn/v1' },
  { name: 'InfiniAI', value: 'InfiniAI', logo: InfiniAILogo, platform: 'custom', baseUrl: 'https://cloud.infini-ai.com/maas/v1' },
  { name: 'Ctyun', value: 'Ctyun', logo: CtyunLogo, platform: 'custom', baseUrl: 'https://wishub-x1.ctyun.cn/v1' },
  { name: 'StepFun', value: 'StepFun', logo: StepFunLogo, platform: 'custom', baseUrl: 'https://api.stepfun.com/v1' },
];

// ============ 工具函数 / Utility Functions ============

/**
 * 根据 value 获取平台配置
 * Get platform config by value
 */
export const getPlatformByValue = (value: string): PlatformConfig | undefined => {
  return MODEL_PLATFORMS.find((p) => p.value === value);
};

/**
 * 获取所有预设供应商（有 baseUrl 的）
 * Get all preset providers (with baseUrl)
 */
export const getPresetProviders = (): PlatformConfig[] => {
  return MODEL_PLATFORMS.filter((p) => p.baseUrl);
};

/**
 * 获取官方 Gemini 平台
 * Get official Gemini platforms
 */
export const getGeminiPlatforms = (): PlatformConfig[] => {
  return MODEL_PLATFORMS.filter((p) => p.platform === 'gemini' || p.platform === 'gemini-vertex-ai');
};

/**
 * 检查平台是否为 Gemini 类型
 * Check if platform is Gemini type
 */
export const isGeminiPlatform = (platform: PlatformType): boolean => {
  return platform === 'gemini' || platform === 'gemini-vertex-ai';
};

/**
 * 检查是否为自定义选项（无预设 baseUrl）
 * Check if it's custom option (no preset baseUrl)
 */
export const isCustomOption = (value: string): boolean => {
  const platform = getPlatformByValue(value);
  return value === 'custom' && !platform?.baseUrl;
};

/**
 * 根据名称搜索平台（不区分大小写）
 * Search platforms by name (case-insensitive)
 */
export const searchPlatformsByName = (keyword: string): PlatformConfig[] => {
  const lowerKeyword = keyword.toLowerCase();
  return MODEL_PLATFORMS.filter((p) => p.name.toLowerCase().includes(lowerKeyword));
};
