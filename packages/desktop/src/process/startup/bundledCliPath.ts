import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type BundledCliPathOptions = {
  isPackaged: boolean;
  resourcesPath: string;
  cwd: string;
  platform: NodeJS.Platform;
  arch: string;
  env: NodeJS.ProcessEnv;
};

type ActivateCliPathOptions = {
  directory: string;
  managedRoot?: string;
  bundledRoot?: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
};

type PreferredCliPathOptions = BundledCliPathOptions & { userDataPath: string };

export type ActiveLarkCli = { directory: string; source: 'managed' | 'bundled'; version: string | null };

const getBinaryName = (platform: NodeJS.Platform): string => (platform === 'win32' ? 'lark-cli.exe' : 'lark-cli');

const isWithin = (root: string, target: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

/** Put one trusted Lark CLI directory first and remove stale managed/bundled entries. */
export function activateLarkCliDirectory(options: ActivateCliPathOptions): void {
  const currentPath = options.env.PATH || options.env.Path || '';
  const roots = [options.managedRoot, options.bundledRoot].filter((root): root is string => Boolean(root));
  const entries = currentPath.split(path.delimiter).filter(Boolean);
  const filtered = entries.filter((entry) => !roots.some((root) => isWithin(root, entry)));
  const nextPath = [options.directory, ...filtered].join(path.delimiter);
  options.env.PATH = nextPath;
  if (options.platform === 'win32') options.env.Path = nextPath;
}

export function getBundledLarkCliDirectory(options: BundledCliPathOptions): string | null {
  const resourcesRoot = options.isPackaged ? options.resourcesPath : path.join(options.cwd, 'resources');
  const bundleDirectory = path.join(resourcesRoot, 'bundled-lark-cli', `${options.platform}-${options.arch}`);
  return existsSync(path.join(bundleDirectory, getBinaryName(options.platform))) ? bundleDirectory : null;
}

export function prependBundledLarkCliToPath(options: BundledCliPathOptions): string | null {
  const bundleDirectory = getBundledLarkCliDirectory(options);
  if (!bundleDirectory) return null;

  activateLarkCliDirectory({
    directory: bundleDirectory,
    bundledRoot: bundleDirectory,
    platform: options.platform,
    env: options.env,
  });
  return bundleDirectory;
}

/** Resolve a verified managed version first, then fall back to the immutable bundled version. */
export function prependPreferredLarkCliToPath(options: PreferredCliPathOptions): ActiveLarkCli | null {
  const managedRoot = path.join(options.userDataPath, 'tools', 'lark-cli');
  const bundledRoot = path.join(
    options.isPackaged ? options.resourcesPath : path.join(options.cwd, 'resources'),
    'bundled-lark-cli'
  );
  try {
    const active = JSON.parse(readFileSync(path.join(managedRoot, 'active.json'), 'utf8')) as {
      version?: string;
      runtimeKey?: string;
    };
    const runtimeKey = `${options.platform}-${options.arch}`;
    if (active.version && active.runtimeKey === runtimeKey) {
      const directory = path.join(managedRoot, active.version, runtimeKey);
      const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as {
        version?: string;
        runtimeKey?: string;
        binarySha256?: string;
      };
      const binaryPath = path.join(directory, getBinaryName(options.platform));
      const binarySha256 = createHash('sha256').update(readFileSync(binaryPath)).digest('hex');
      if (
        manifest.version === active.version &&
        manifest.runtimeKey === runtimeKey &&
        manifest.binarySha256 === binarySha256
      ) {
        activateLarkCliDirectory({
          directory,
          managedRoot,
          bundledRoot,
          platform: options.platform,
          env: options.env,
        });
        return { directory, source: 'managed', version: active.version };
      }
    }
  } catch {
    // Invalid or incomplete managed installs are ignored in favor of the bundled baseline.
  }

  const directory = getBundledLarkCliDirectory(options);
  if (!directory) return null;
  activateLarkCliDirectory({ directory, managedRoot, bundledRoot, platform: options.platform, env: options.env });
  try {
    const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as { version?: string };
    return { directory, source: 'bundled', version: manifest.version ?? null };
  } catch {
    return { directory, source: 'bundled', version: null };
  }
}
