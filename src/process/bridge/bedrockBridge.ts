/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

// Default Bedrock model for connection testing
const DEFAULT_BEDROCK_MODEL = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

export function initBedrockBridge(): void {
  // Test AWS Bedrock connection with provided credentials
  ipcBridge.bedrock.testConnection.provider(async ({ bedrock_config }) => {
    try {
      // Dynamically import BedrockContentGenerator to avoid loading unnecessary dependencies
      const { BedrockContentGenerator } =
        await import('@office-ai/aioncli-core/dist/src/core/bedrockContentGenerator.js');

      // Store original environment variables to restore later
      const originalEnv = {
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_PROFILE: process.env.AWS_PROFILE,
        AWS_REGION: process.env.AWS_REGION,
      };

      try {
        // Set environment variables based on auth method
        if (bedrock_config.auth_method === 'accessKey') {
          if (!bedrock_config.access_key_id || !bedrock_config.secret_access_key) {
            throw new Error('AWS credentials missing for access key authentication');
          }
          process.env.AWS_ACCESS_KEY_ID = bedrock_config.access_key_id;
          process.env.AWS_SECRET_ACCESS_KEY = bedrock_config.secret_access_key;
          delete process.env.AWS_PROFILE;
        } else if (bedrock_config.auth_method === 'profile') {
          if (!bedrock_config.profile) {
            throw new Error('AWS profile name missing');
          }
          process.env.AWS_PROFILE = bedrock_config.profile;
          delete process.env.AWS_ACCESS_KEY_ID;
          delete process.env.AWS_SECRET_ACCESS_KEY;
        }
        process.env.AWS_REGION = bedrock_config.region;

        // Create Bedrock client and test with a simple call
        const client = new BedrockContentGenerator({
          model: DEFAULT_BEDROCK_MODEL,
          region: bedrock_config.region,
        });

        // Test connection with countTokens (lightweight, no quota usage)
        await client.countTokens({
          model: DEFAULT_BEDROCK_MODEL,
          contents: 'test',
        });

        return {
          success: true,
          msg: 'Connection successful! AWS credentials are valid.',
        };
      } finally {
        // Restore original environment variables
        if (originalEnv.AWS_ACCESS_KEY_ID !== undefined) {
          process.env.AWS_ACCESS_KEY_ID = originalEnv.AWS_ACCESS_KEY_ID;
        } else {
          delete process.env.AWS_ACCESS_KEY_ID;
        }
        if (originalEnv.AWS_SECRET_ACCESS_KEY !== undefined) {
          process.env.AWS_SECRET_ACCESS_KEY = originalEnv.AWS_SECRET_ACCESS_KEY;
        } else {
          delete process.env.AWS_SECRET_ACCESS_KEY;
        }
        if (originalEnv.AWS_PROFILE !== undefined) {
          process.env.AWS_PROFILE = originalEnv.AWS_PROFILE;
        } else {
          delete process.env.AWS_PROFILE;
        }
        if (originalEnv.AWS_REGION !== undefined) {
          process.env.AWS_REGION = originalEnv.AWS_REGION;
        } else {
          delete process.env.AWS_REGION;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        msg: `Connection failed: ${errorMessage}`,
      };
    }
  });
}
