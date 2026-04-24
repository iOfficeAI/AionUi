import { ipcBridge } from '@/common';
import useSWR from 'swr';

export type { GeminiModeOption } from '@/common/utils/geminiModes';
export { getGeminiModeList } from '@/common/utils/geminiModes';
import { getGeminiModeList } from '@/common/utils/geminiModes';

export const geminiModeList = getGeminiModeList();

// Gemini 模型排序函数：Pro 优先，版本号降序
const sortGeminiModels = (models: { label: string; value: string }[]) => {
  return models.toSorted((a, b) => {
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

const useModeModeList = (
  platform: string,
  base_url?: string,
  api_key?: string,
  try_fix?: boolean,
  bedrock_config?: {
    auth_method: 'accessKey' | 'profile';
    region: string;
    access_key_id?: string;
    secret_access_key?: string;
    profile?: string;
  }
) => {
  return useSWR(
    [platform + '/models', { platform, base_url, api_key, try_fix, bedrock_config }],
    async ([_url, { platform, base_url, api_key, try_fix, bedrock_config }]): Promise<{
      models: { label: string; value: string }[];
      fix_base_url?: string;
    }> => {
      // Only call the backend when we have credentials it can actually use:
      // - bedrock: bedrock_config carries the credentials (api_key not required)
      // - everything else: api_key is mandatory per backend validator
      const hasUsableCredentials = platform === 'bedrock' ? !!bedrock_config : !!api_key;
      if (hasUsableCredentials) {
        const res = await ipcBridge.mode.fetchModelList.invoke({
          base_url,
          api_key: api_key ?? '',
          try_fix,
          platform,
          bedrock_config,
        });
        let modelList = res.models.map((v) => {
          // Handle both string and object formats (Bedrock returns objects with id and name)
          if (typeof v === 'string') {
            return { label: v, value: v };
          } else {
            return { label: v.name, value: v.id };
          }
        });

        // 如果是 Gemini 平台，优化排序
        if (platform?.includes('gemini')) {
          modelList = sortGeminiModels(modelList);
        }

        // 如果返回了修复的 base_url，将其添加到结果中
        if (res.fixed_base_url) {
          return {
            models: modelList,
            fix_base_url: res.fixed_base_url,
          };
        }

        return { models: modelList };
      }

      // 既没有 API key 也没有 base_url 也没有 bedrock_config 时，返回空列表
      return { models: [] };
    }
  );
};

export default useModeModeList;
