import path from 'node:path';
import { Node, SyntaxKind, type Project } from 'ts-morph';
export type Source = { file: string; line: number; caller: string };
export function sourceLocation(node: Node, root: string): Source {
  const fn = node.getFirstAncestor(Node.isFunctionDeclaration);
  return {
    file: path.relative(root, node.getSourceFile().getFilePath()).split(path.sep).join('/'),
    line: node.getStartLineNumber(),
    caller: node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? fn?.getName() ?? '<anonymous>',
  };
}

export function loadProductionSources(project: Project, directories: string[]) {
  // ts-morph paths and glob patterns use forward slashes on every platform.
  const prefixes = directories.map((directory) => directory.replaceAll('\\', '/'));
  for (const directory of prefixes) project.addSourceFilesAtPaths(`${directory}/**/*.{ts,tsx}`);
  return project
    .getSourceFiles()
    .filter(
      (file) =>
        prefixes.some((directory) => file.getFilePath().startsWith(directory + '/')) &&
        !/\.(?:d|test|spec)\.tsx?$/.test(file.getFilePath()) &&
        !/\/(?:__tests__|fixtures)\//.test(file.getFilePath())
    );
}
