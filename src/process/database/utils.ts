import fs from 'fs';
import path from 'path';

/**
 * 确保目录存在；若不存在则递归创建
 * Ensure the given directory exists; create it recursively when missing
 */
export function ensureDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * 确保某文件的上层目录存在
 * Ensure parent directory for a file path exists
 */
export function ensureFileDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  ensureDirectory(dir);
}
