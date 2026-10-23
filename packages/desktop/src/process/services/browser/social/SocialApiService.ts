/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SocialPostOptions, SocialPostResult } from '@/common/browser/safetyTypes';
import { getBrowserSafetyGateService } from './BrowserSafetyGateService';
import { getSocialRateLimiter } from './SocialRateLimiter';
import { getBrowserWorkflowEngine } from '../BrowserWorkflowEngine';

export class SocialApiService {
  /**
   * Post to social media with official Graph API as preferred path,
   * falling back to human-paced browser automation.
   */
  public async post(options: SocialPostOptions): Promise<SocialPostResult> {
    const startTime = Date.now();
    const { platform, caption, mediaPath, autoApprove, apiCredentials, profileId } = options;

    // 1. Safety Gate: Explicit user approval before publishing
    const safetyGate = getBrowserSafetyGateService();
    const approved = await safetyGate.requestApproval(
      'publish',
      `Publish post to ${platform}`,
      {
        platform,
        caption,
        mediaPath,
      },
      { autoApprove }
    );

    if (!approved) {
      return {
        success: false,
        platform,
        mode: 'official_api',
        error: 'Publish action was rejected by safety gate.',
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Concurrency Lock & Rate Limiter: Prevent bulk parallel posting and enforce daily caps
    const rateLimiter = getSocialRateLimiter();

    return await rateLimiter.acquireLock(async () => {
      const capCheck = rateLimiter.checkDailyCap(platform);
      if (!capCheck.allowed) {
        return {
          success: false,
          platform,
          mode: 'official_api',
          error: `Daily post cap reached for ${platform} (${capCheck.current}/${capCheck.max}). Post aborted to prevent account restriction.`,
          durationMs: Date.now() - startTime,
        };
      }

      // 3. Preferred Path: Official API
      if (apiCredentials?.accessToken) {
        try {
          const apiResult = await this.publishViaOfficialApi(platform, caption, mediaPath, apiCredentials);
          rateLimiter.recordPost(platform);
          return {
            success: true,
            platform,
            mode: 'official_api',
            postId: apiResult.postId,
            url: apiResult.url,
            durationMs: Date.now() - startTime,
          };
        } catch (apiErr) {
          console.warn(
            `[SocialApiService] Official API failed for ${platform}, falling back to browser automation:`,
            apiErr
          );
          // Fall through to browser automation
        }
      }

      // 4. Fallback Path: Browser Automation with Human-like Pacing
      await rateLimiter.applyHumanPacing(1000, 3000);

      const workflowEngine = getBrowserWorkflowEngine();
      const workflowResult = await workflowEngine.executeWorkflow(
        'social-post',
        {
          platform,
          mediaPath,
          caption,
        },
        { profileId }
      );

      if (!workflowResult.success) {
        return {
          success: false,
          platform,
          mode: 'browser_automation',
          error: workflowResult.error || 'Browser posting workflow failed',
          durationMs: Date.now() - startTime,
        };
      }

      rateLimiter.recordPost(platform);
      return {
        success: true,
        platform,
        mode: 'browser_automation',
        durationMs: Date.now() - startTime,
      };
    });
  }

  private async publishViaOfficialApi(
    platform: 'instagram' | 'facebook',
    caption: string,
    mediaPath: string,
    credentials: { accessToken?: string; accountId?: string; pageId?: string }
  ): Promise<{ postId: string; url?: string }> {
    const { accessToken, accountId, pageId } = credentials;
    if (!accessToken) throw new Error('Access token is missing');

    if (platform === 'facebook') {
      const targetId = pageId || 'me';
      // Post to Facebook Page feed
      const url = `https://graph.facebook.com/v19.0/${targetId}/feed`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: caption,
          access_token: accessToken,
        }),
      });

      const data = (await response.json()) as { id?: string; error?: { message: string } };
      if (!response.ok || !data.id) {
        throw new Error(data.error?.message || `Facebook API error: ${response.statusText}`);
      }

      return { postId: data.id, url: `https://facebook.com/${data.id}` };
    }

    if (platform === 'instagram') {
      if (!accountId) throw new Error('Instagram account ID is required');

      // 1. Create Media Container
      const createUrl = `https://graph.facebook.com/v19.0/${accountId}/media`;
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          image_url: mediaPath.startsWith('http') ? mediaPath : undefined,
          access_token: accessToken,
        }),
      });

      const createData = (await createRes.json()) as { id?: string; error?: { message: string } };
      if (!createRes.ok || !createData.id) {
        throw new Error(createData.error?.message || `Instagram container creation failed: ${createRes.statusText}`);
      }

      // 2. Publish Media Container
      const publishUrl = `https://graph.facebook.com/v19.0/${accountId}/media_publish`;
      const publishRes = await fetch(publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: createData.id,
          access_token: accessToken,
        }),
      });

      const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } };
      if (!publishRes.ok || !publishData.id) {
        throw new Error(publishData.error?.message || `Instagram publish failed: ${publishRes.statusText}`);
      }

      return { postId: publishData.id };
    }

    throw new Error(`Unsupported platform: ${platform}`);
  }
}

let socialApiInstance: SocialApiService | null = null;

export function getSocialApiService(): SocialApiService {
  if (!socialApiInstance) {
    socialApiInstance = new SocialApiService();
  }
  return socialApiInstance;
}
