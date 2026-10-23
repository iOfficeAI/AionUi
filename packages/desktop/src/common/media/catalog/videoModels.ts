/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in video model catalog.
 *
 * All video generation in the wild is Form C (submit + poll). These entries
 * carry real protocol data now so phase 3 only wires drivers — but nothing
 * here is selectable or executable until 'C' enters EXECUTABLE_FORMS and the
 * video tool ships. Keeping the data adjacent to the image catalog is part of
 * the "build the base layer complete" decision (progress doc, 2026-08-05).
 */

import type { MediaModelSpec } from './types';

export const BUILTIN_VIDEO_MODELS: MediaModelSpec[] = [
  {
    // ByteDance Seedance on Volcano Ark (contents/generations/tasks).
    id: 'ark-seedance',
    kind: 'video',
    form: 'C',
    endpointStyle: 'ark-task',
    match: { model: /seedance/i },
    params: {
      durations: [5, 10],
      resolutions: ['480p', '720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '4:3', '1:1', '21:9'],
      imageToVideo: true,
      firstLastFrame: true,
      seed: true,
    },
    defaults: { durationSeconds: 5, resolution: '720p' },
    polling: { intervalMs: 5000, timeoutMs: 600_000 },
  },
  {
    // Tongyi WanX video on DashScope (video-generation task API).
    id: 'dashscope-wanx-video',
    kind: 'video',
    form: 'C',
    endpointStyle: 'dashscope-task',
    match: { model: /^wan(x|2).*(t2v|i2v|video)/i },
    params: {
      durations: [5],
      resolutions: ['480p', '720p', '1080p'],
      imageToVideo: true,
      seed: true,
      negativePrompt: true,
    },
    defaults: { durationSeconds: 5, resolution: '720p' },
    polling: { intervalMs: 5000, timeoutMs: 600_000 },
  },
  {
    // Kling video (JWT-signed task API) — driver lands with phase 3.
    id: 'kling-video',
    kind: 'video',
    form: 'C',
    endpointStyle: 'kling',
    match: { model: /kling/i },
    params: {
      durations: [5, 10],
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      imageToVideo: true,
      cameras: ['none', 'horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'],
    },
    defaults: { durationSeconds: 5, resolution: '720p' },
    polling: { intervalMs: 5000, timeoutMs: 600_000 },
  },
  {
    // OpenAI Sora-style /v1/videos task API.
    id: 'openai-video',
    kind: 'video',
    form: 'C',
    endpointStyle: 'openai-video',
    match: { model: /^sora/i },
    params: {
      durations: [4, 8, 12],
      sizes: ['1280x720', '720x1280', '1024x1792', '1792x1024'],
      imageToVideo: true,
    },
    defaults: { durationSeconds: 4 },
    polling: { intervalMs: 5000, timeoutMs: 600_000 },
  },
  {
    // Zhipu CogVideoX async task API.
    id: 'cogvideox',
    kind: 'video',
    form: 'C',
    endpointStyle: 'cogvideox',
    match: { model: /cogvideox/i },
    params: {
      durations: [5, 10],
      resolutions: ['720p', '1080p', '4k'],
      imageToVideo: true,
    },
    defaults: { durationSeconds: 5, resolution: '1080p' },
    polling: { intervalMs: 5000, timeoutMs: 600_000 },
  },
];
