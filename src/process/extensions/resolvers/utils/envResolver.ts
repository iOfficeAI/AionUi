/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIONUI_STRICT_ENV_ENV } from '../../constants';

const ENV_TEMPLATE_REGEX = /\$\{env:([^}]+)\}/g;

type EnvResolverOptions = {
  strictMode?: boolean;
};

let _globalStrictMode: boolean | undefined;

export function isGlobalStrictMode(): boolean {
  if (_globalStrictMode === undefined) {
    _globalStrictMode = process.env[AIONUI_STRICT_ENV_ENV] === '1' || process.env[AIONUI_STRICT_ENV_ENV] === 'true';
  }
  return _globalStrictMode;
}

export function clearStrictModeCache(): void {
  _globalStrictMode = undefined;
}

export class UndefinedEnvVariableError extends Error {
  constructor(
    public readonly varName: string,
    message: string
  ) {
    super(message);
    this.name = 'UndefinedEnvVariableError';
  }
}

export function resolveEnvTemplates(value: string, options?: EnvResolverOptions): string {
  const strictMode = options?.strictMode ?? isGlobalStrictMode();
  const undefinedVars: string[] = [];

  const result = value.replace(ENV_TEMPLATE_REGEX, (_match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      undefinedVars.push(varName);
      if (strictMode) {
        throw new UndefinedEnvVariableError(
          varName,
          `[Extensions] Strict mode: Required environment variable "${varName}" is not defined. Set the variable or disable strict mode (AIONUI_STRICT_ENV=0).`
        );
      }
      console.warn(`[Extensions] Environment variable not defined: ${varName}`);
      return '';
    }
    return envValue;
  });

  if (!strictMode && undefinedVars.length > 0) {
    console.warn(
      `[Extensions] ${undefinedVars.length} undefined environment variable(s): ${undefinedVars.join(', ')}. Enable strict mode (AIONUI_STRICT_ENV=1) to catch these errors early.`
    );
  }

  return result;
}

export function resolveEnvInObject(obj: unknown, options?: EnvResolverOptions): unknown {
  if (typeof obj === 'string') {
    return resolveEnvTemplates(obj, options);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvInObject(item, options));
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveEnvInObject(v, options)]));
  }
  return obj;
}
