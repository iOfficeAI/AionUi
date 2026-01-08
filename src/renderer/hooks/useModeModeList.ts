import { ipcBridge } from '@/common';
import useSWR from 'swr';

export interface GeminiModeOption {
  label: string;
  value: string;
  description: string;
  modelHint?: string;
  /** Manual 模式的子模型列表 / Sub-models for Manual mode */
  subModels?: Array<{ label: string; value: string }>;
}

type GeminiModeDescriptions = {
  autoGemini3: string;
  autoGemini25: string;
  manual: string;
};

type GeminiModeListOptions = {
  descriptions?: GeminiModeDescriptions;
};

const defaultGeminiModeDescriptions: GeminiModeDescriptions = {
  autoGemini3: 'Let Gemini CLI decide the best model for the task: gemini-3-pro-preview, gemini-2.5-flash',
  autoGemini25: 'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
  manual: 'Manually select a model',
};

// 生成 Gemini 模型列表，与终端 CLI 保持一致 / Build Gemini model list matching terminal CLI
// TODO: 后端 aioncli-core 需要支持 auto-25 值以实现真正的 Gemini 2.5 auto 模式
// TODO: Backend aioncli-core needs to support auto-25 value for true Gemini 2.5 auto mode
export const getGeminiModeList = (options?: GeminiModeListOptions): GeminiModeOption[] => {
  const descriptions = options?.descriptions || defaultGeminiModeDescriptions;

  return [
    {
      label: 'Auto (Gemini 3)',
      value: 'auto', // 使用 model router 自动选择 gemini-3-pro-preview 或 gemini-2.5-flash
      description: descriptions.autoGemini3,
      modelHint: 'gemini-3-pro-preview, gemini-2.5-flash',
    },
    {
      label: 'Auto (Gemini 2.5)',
      value: 'gemini-2.5-pro', // 显式使用 gemini-2.5-pro，暂不支持 auto-routing
      description: descriptions.autoGemini25,
      modelHint: 'gemini-2.5-pro, gemini-2.5-flash',
    },
    {
      label: 'Manual',
      value: 'manual', // 展开子菜单选择具体模型 / Expand submenu to select specific model
      description: descriptions.manual,
      // 与 aioncli-core/src/config/models.ts 中定义的模型名保持一致
      // Match model names defined in aioncli-core/src/config/models.ts
      // PREVIEW_GEMINI_MODEL = 'gemini-3-pro-preview'
      // DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'
      // DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash'
      // DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite'
      subModels: [
        { label: 'gemini-3-pro-preview', value: 'gemini-3-pro-preview' },
        { label: 'gemini-2.5-pro', value: 'gemini-2.5-pro' },
        { label: 'gemini-2.5-flash', value: 'gemini-2.5-flash' },
        { label: 'gemini-2.5-flash-lite', value: 'gemini-2.5-flash-lite' },
      ],
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
  return useSWR([platform + '/models', { platform, base_url, api_key, try_fix }], async ([_url, { platform, base_url, api_key, try_fix }]): Promise<{ models: { label: string; value: string }[]; fix_base_url?: string }> => {
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
