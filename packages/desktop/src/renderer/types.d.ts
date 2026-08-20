declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module 'unocss';

/**
 * WaveDrom (wavedrom@3.6.2) ships CommonJS without bundled type declarations and
 * has no @types package, so its public API surface is declared here. Only the
 * render-to-string path is used by WavedromBlock: renderAny builds an onml tree,
 * onml.stringify turns it into an SVG string.
 */
declare module 'wavedrom' {
  /** WaveJSON source object: signal lanes, assign expressions or register lanes. */
  export type WaveSource = {
    signal?: unknown[];
    assign?: unknown;
    reg?: unknown;
    config?: Record<string, unknown>;
    [key: string]: unknown;
  };
  /** A WaveDrom skin module: `{ default: {...} }`, `{ dark: {...} }`, ... */
  export type WaveSkin = Record<string, Record<string, unknown>>;
  /** onml tree: `[tag, attrs?, ...children]`. */
  export type OnmlTree = [string, Record<string, unknown>?, ...unknown[]];

  export const version: string;
  export function renderAny(index: number, source: WaveSource, waveSkin?: WaveSkin, notFirstSignal?: boolean): OnmlTree;
  export function renderWaveElement(
    index: number,
    source: WaveSource,
    outputElement: Element,
    waveSkin?: WaveSkin,
    notFirstSignal?: boolean
  ): void;
  export const onml: {
    stringify: (tree: OnmlTree) => string;
    tt: unknown;
  };
  export const waveSkin: WaveSkin;
  const WaveDrom: {
    version: string;
    renderAny: typeof renderAny;
    renderWaveElement: typeof renderWaveElement;
    onml: typeof onml;
    waveSkin: typeof waveSkin;
  };
  export default WaveDrom;
}

declare module 'wavedrom/skins/default.js' {
  const skin: import('wavedrom').WaveSkin;
  export default skin;
}

declare module 'wavedrom/skins/dark.js' {
  const skin: import('wavedrom').WaveSkin;
  export default skin;
}
