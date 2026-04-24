/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildOpenApiSpec } from '../../src/webserver/docs/openapi';

describe('openapi conversation create schema', () => {
  it('documents ACP configOptionValues for CLI conversation creation', () => {
    const spec = buildOpenApiSpec();
    const properties = spec.components.schemas.ConversationCreateRequest.properties;

    expect(properties.configOptionValues).toEqual(
      expect.objectContaining({
        type: 'object',
        example: {
          reasoning_effort: 'high',
        },
      })
    );
    expect(properties.configOptionValues.additionalProperties).toEqual({
      type: 'string',
    });
  });
});
