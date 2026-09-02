/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Capability routing for the built-in image generation tool.
 *
 * Chat-style providers return images from a chat completion (`message.images`
 * or markdown). Dedicated image models use the OpenAI-compatible Images API.
 * Keep this routing model-specific: a provider can expose both ordinary chat
 * models and image models, and provider names alone are not sufficient.
 */

import { AuthType, type AuthType as ProviderAuthType } from '@/common/types/provider/authType';
import { getProviderAuthType } from '@/common/utils/platformAuthType';

type ProviderShape = {
  platform?: string;
  base_url?: string;
  name?: string;
  auth_type?: ProviderAuthType;
  model_protocols?: Record<string, string>;
};

const IMAGE_NAME_PATTERN = /(image|banana|imagine)/i;
const OPENAI_IMAGES_MODEL_PATTERNS = [
  /^gpt-image/i,
  /^dall-e-[23]/i,
  /^grok[-_/ ]?imagine[-_/ ]?image/i,
  /seedream/i,
  /flux/i,
  /(stable[-_/ ]?(?:diffusion|image)|(?:^|[-_/])sd(?:xl|[-_.]?3(?:[-_.]?5)?)(?:$|[-_/]))/i,
  /recraft/i,
  /qwen[-_/ ]?image/i,
  /(?:^|[-_/])z[-_/ ]?image/i,
  /ideogram/i,
  /(?:^|[-_/])mai[-_/ ]?image/i,
  /hidream/i,
  /cogview/i,
  /hunyuan[-_/ ]?image/i,
  /kolors/i,
  /^krea(?:[-_/ ]|$)/i,
  /^reve(?:[-_/ ]|$)/i,
  /firefly[-_/ ]?image/i,
  /midjourney/i,
];

/**
 * Official endpoints on these hosts use a vendor-specific payload, auth flow,
 * or submit-and-poll job protocol. The same model families can still be used
 * when they are exposed by an OpenAI-compatible gateway.
 */
const NATIVE_IMAGE_API_HOST_MARKERS = [
  'api.stability.ai',
  'api.replicate.com',
  'fal.run',
  'api.bfl.ai',
  'api.bfl.ml',
  'api.ideogram.ai',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'api.dev.runwayml.com',
  'firefly-api.adobe.io',
  'cloud.leonardo.ai',
  'api.midjourney.com',
];

type ImageGenerationApiMode = 'chat-completions' | 'openai-images';

const RULES: Array<{
  id: string;
  match: (provider: ProviderShape) => boolean;
}> = [
  {
    id: 'gemini',
    match: (p) => p.platform === 'gemini' || p.platform === 'gemini-vertex-ai',
  },
  {
    id: 'openrouter',
    match: (p) => !!p.base_url?.includes('openrouter.ai'),
  },
  {
    id: 'antigravity',
    match: (p) => !!p.name?.toLowerCase().includes('antigravity'),
  },
];

const includesIgnoreCase = (value: string | undefined, markers: string[]): boolean => {
  const lowerValue = value?.toLowerCase();
  return !!lowerValue && markers.some((marker) => lowerValue.includes(marker.toLowerCase()));
};

const isOpenAIImagesModel = (modelName: string): boolean =>
  OPENAI_IMAGES_MODEL_PATTERNS.some((pattern) => pattern.test(modelName));

const isMicrosoftMaiImagesEndpoint = (baseUrl: string | undefined): boolean =>
  includesIgnoreCase(baseUrl, ['services.ai.azure.com/mai/v1']);

export const resolveImageGenerationApiMode = (
  provider: ProviderShape,
  modelName: string
): ImageGenerationApiMode | undefined => {
  if (
    (IMAGE_NAME_PATTERN.test(modelName) || isOpenAIImagesModel(modelName)) &&
    RULES.some((rule) => rule.match(provider))
  ) {
    return 'chat-completions';
  }

  const authType = getProviderAuthType({
    platform: provider.platform || 'custom',
    auth_type: provider.auth_type,
    model_protocols: provider.model_protocols,
    use_model: modelName,
  });
  if (
    (isOpenAIImagesModel(modelName) || isMicrosoftMaiImagesEndpoint(provider.base_url)) &&
    authType === AuthType.USE_OPENAI &&
    !includesIgnoreCase(provider.base_url, NATIVE_IMAGE_API_HOST_MARKERS)
  ) {
    return 'openai-images';
  }

  return undefined;
};

export const isImageGenSupported = (provider: ProviderShape, modelName: string): boolean =>
  resolveImageGenerationApiMode(provider, modelName) !== undefined;
