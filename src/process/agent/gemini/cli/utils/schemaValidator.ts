/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Simple schema validator for AionUi - without external dependencies
export class SchemaValidator {
  /**
   * Returns null if the data conforms to the schema described by schema (or if schema
   * is null). Otherwise, returns a string describing the error.
   */
  static validate(schema: unknown | undefined, data: unknown): string | null {
    if (!schema) {
      return null;
    }
    if (typeof data !== 'object' || data === null) {
      return 'Value of params must be an object';
    }

    // Basic validation without ajv dependency
    const schemaObj = schema as any;
    const dataObj = data as any;

    if (schemaObj.required) {
      for (const field of schemaObj.required) {
        if (!(field in dataObj)) {
          return `Missing required parameter: ${field}`;
        }
      }
    }

    return null;
  }
}
