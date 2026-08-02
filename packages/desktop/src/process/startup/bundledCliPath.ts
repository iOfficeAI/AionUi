import { existsSync } from 'node:fs';
import path from 'node:path';

type BundledCliPathOptions = {
  isPackaged: boolean;
  resourcesPath: string;
  cwd: string;
  platform: NodeJS.Platform;
  arch: string;
  env: NodeJS.ProcessEnv;
};

const getBinaryName = (platform: NodeJS.Platform): string => (platform === 'win32' ? 'lark-cli.exe' : 'lark-cli');

export function getBundledLarkCliDirectory(options: BundledCliPathOptions): string | null {
  const resourcesRoot = options.isPackaged ? options.resourcesPath : path.join(options.cwd, 'resources');
  const bundleDirectory = path.join(resourcesRoot, 'bundled-lark-cli', `${options.platform}-${options.arch}`);
  return existsSync(path.join(bundleDirectory, getBinaryName(options.platform))) ? bundleDirectory : null;
}

export function prependBundledLarkCliToPath(options: BundledCliPathOptions): string | null {
  const bundleDirectory = getBundledLarkCliDirectory(options);
  if (!bundleDirectory) return null;

  const currentPath = options.env.PATH || options.env.Path || '';
  const isWindows = options.platform === 'win32';
  const normalize = (entry: string) => {
    const normalized = path.resolve(entry);
    return isWindows ? normalized.toLowerCase() : normalized;
  };
  const alreadyPresent = currentPath
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => normalize(entry) === normalize(bundleDirectory));
  const nextPath = alreadyPresent ? currentPath : [bundleDirectory, currentPath].filter(Boolean).join(path.delimiter);

  options.env.PATH = nextPath;
  if (isWindows) options.env.Path = nextPath;
  return bundleDirectory;
}
