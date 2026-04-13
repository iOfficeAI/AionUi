declare module '@xterm/headless/lib-headless/xterm-headless.js';
declare module 'diff';
declare module 'smol-toml' {
  export function parse(input: string): unknown;
  export function stringify(input: unknown): string;
}

declare module 'cookie' {
  export type CookieParseOptions = {
    decode?: (value: string) => string;
  };

  export function parse(cookieHeader: string, options?: CookieParseOptions): Record<string, string>;
}
