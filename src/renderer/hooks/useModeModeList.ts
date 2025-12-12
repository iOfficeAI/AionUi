import { ipcBridge } from '@/common';
import useSWR from 'swr';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
const GEMINI_PRO_PREVIEW_MODEL = 'gemini-3-pro-preview';

export interface GeminiModeOption {
  label: string;
  value: string;
  description: string;
  modelHint?: string;
}

type GeminiModeDescriptions = {
  auto: string;
  pro: string;
  flash: string;
};

type GeminiModeListOptions = {
  includeProPreview?: boolean;
  descriptions?: GeminiModeDescriptions;
};

const defaultGeminiModeDescriptions: GeminiModeDescriptions = {
  auto: 'Let the system choose the best model for your task.',
  pro: 'For complex tasks that require deep reasoning and creativity',
  flash: 'For tasks that need a balance of speed and reasoning',
};

// 生成基础 Gemini 列表，可根据订阅态插入 preview 模型 / Build Gemini model list with optional previews
export const getGeminiModeList = (options?: GeminiModeListOptions): GeminiModeOption[] => {
  const proModels = options?.includeProPreview ? [GEMINI_PRO_PREVIEW_MODEL, DEFAULT_GEMINI_MODEL] : [DEFAULT_GEMINI_MODEL];
  const descriptions = options?.descriptions || defaultGeminiModeDescriptions;

  return [
    {
      label: 'Auto',
      value: 'auto',
      description: descriptions.auto,
    },
    {
      label: 'Pro',
      value: 'pro',
      modelHint: proModels.join(', '),
      description: descriptions.pro,
    },
    {
      label: 'Flash',
      value: 'flash',
      modelHint: DEFAULT_GEMINI_FLASH_MODEL,
      description: descriptions.flash,
    },
  ];
};

export const geminiModeList = getGeminiModeList();

// Gemini 模型排序函数：Pro 优先，版本号降序
const sortGeminiModels = (models: { label: string; value: string }[]) => {
  return models.sort((a, b) => {
    const aPro = a.value.toLowerCase().includes('pro');
    const bPro = b.value.toLowerCase().includes('pro');

    // Pro 模型排在前面
    if (aPro && !bPro) return -1;
    if (!aPro && bPro) return 1;

    // 提取版本号进行比较
    const extractVersion = (name: string) => {
      const match = name.match(/(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : 0;
    };

    const aVersion = extractVersion(a.value);
    const bVersion = extractVersion(b.value);

    // 版本号大的排在前面
    if (aVersion !== bVersion) {
      return bVersion - aVersion;
    }

    // 版本号相同时按字母顺序排序
    return a.value.localeCompare(b.value);
  });
};

const useModeModeList = (platform: string, base_url?: string, api_key?: string, try_fix?: boolean) => {
  return useSWR([platform + '/models', { platform, base_url, api_key, try_fix }], async ([url, { platform, base_url, api_key, try_fix }]): Promise<{ models: { label: string; value: string }[]; fix_base_url?: string }> => {
    // 如果有 API key 或 base_url，尝试通过 API 获取模型列表
    if (api_key || base_url) {
      const res = await ipcBridge.mode.fetchModelList.invoke({ base_url, api_key, try_fix, platform });
      if (res.success) {
        let modelList =
          res.data?.mode.map((v) => ({
            label: v,
            value: v,
          })) || [];

        // 如果是 Gemini 平台，优化排序
        if (platform?.includes('gemini')) {
          modelList = sortGeminiModels(modelList);
        }

        // 如果返回了修复的 base_url，将其添加到结果中
        if (res.data?.fix_base_url) {
          return {
            models: modelList,
            fix_base_url: res.data.fix_base_url,
          };
        }

        return { models: modelList };
      }
      // 后端已经处理了回退逻辑，这里直接抛出错误
      return Promise.reject(res.msg);
    }

    // 既没有 API key 也没有 base_url 时，返回空列表
    return { models: [] };
  });
};

export default useModeModeList;
