/* Type declarations for @aionui/native */

// --- Credential Crypto (aionui-cred) ---

export function isEncryptionAvailable(): boolean;
export function encryptString(plaintext: string): string;
export function decryptString(encoded: string): string;
export function encryptCredentials(
  credentials: Record<string, string | number | boolean | undefined> | undefined | null
): Record<string, string | number | boolean | undefined> | null;
export function decryptCredentials(
  credentials: Record<string, string | number | boolean | undefined> | undefined | null
): Record<string, string | number | boolean | undefined> | null;

// --- Auth (aionui-auth) ---

export interface JwtPayload {
  userId: string;
  username: string;
}

export interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function hashPassword(password: string): Promise<string>;
export function verifyPassword(password: string, hash: string): Promise<boolean>;
export function generateToken(payload: JwtPayload, secret: string, expiresIn: string): string;
export function verifyJwt(token: string, secret: string): JwtPayload | null;
export function validateUsername(username: string): ValidationResult;
export function validatePasswordStrength(password: string): ValidationResult;
export function generateRandomPassword(): string;
export function generateUserCredentials(): UserCredentials;
export function generateSessionId(): string;
export function generateSecretKey(): string;
export function constantTimeCompare(a: string, b: string): boolean;
export function sha256Hex(input: string): string;

// --- Filesystem (aionui-fs) ---

export interface DirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<DirOrFile>;
}

export function readDirectoryTree(
  dirPath: string,
  root?: string | undefined | null,
  maxDepth?: number | undefined | null,
  skipNames?: string[] | undefined | null,
  searchText?: string | undefined | null
): Promise<DirOrFile | null>;

export function copyDirectory(src: string, dest: string, overwrite?: boolean | undefined | null): Promise<void>;

export function verifyDirectoryStructure(dir1: string, dir2: string): Promise<boolean>;

export function ensureDir(dirPath: string): void;
