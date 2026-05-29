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

// Vite ?worker imports — each match resolves to a constructor that creates a
// Worker for the chunked source. Used by Monaco's language workers; see
// `pages/conversation/Editor/monacoEnvironment.ts`.
declare module '*?worker' {
  const WorkerCtor: new () => Worker;
  export default WorkerCtor;
}

declare module 'unocss';
