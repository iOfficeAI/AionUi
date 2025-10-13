/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDataPath } from '../utils';
import type { IImageMetadata, IQueryResult } from './types';
import { getDatabase } from './index';

/**
 * Image storage service
 * Handles file system storage for images while database stores metadata
 */
export class ImageStorage {
  private imageDir: string;

  constructor(imageDir?: string) {
    this.imageDir = imageDir || path.join(getDataPath(), 'images');

    // Ensure image directory exists
    if (!existsSync(this.imageDir)) {
      mkdirSync(this.imageDir, { recursive: true });
      console.log(`[ImageStorage] Created image directory: ${this.imageDir}`);
    }
  }

  /**
   * Calculate SHA256 hash of buffer
   */
  private calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Get image extension from buffer by checking magic numbers
   */
  private getImageExtension(buffer: Buffer): string {
    // Check magic numbers
    if (buffer.length >= 2) {
      // JPEG: FF D8 FF
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'jpg';
      }
      // PNG: 89 50 4E 47
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return 'png';
      }
      // GIF: 47 49 46
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'gif';
      }
      // WebP: 52 49 46 46 ... 57 45 42 50
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp';
      }
      // BMP: 42 4D
      if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
        return 'bmp';
      }
    }

    return 'bin'; // Unknown format
  }

  /**
   * Get MIME type from extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Get MIME type from buffer
   */
  private getMimeTypeFromBuffer(buffer: Buffer): string {
    const ext = this.getImageExtension(buffer);
    return this.getMimeType(ext);
  }

  /**
   * Get image dimensions (simplified version, only for common formats)
   */
  private getImageDimensions(buffer: Buffer): { width?: number; height?: number } {
    try {
      // PNG dimensions
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }

      // JPEG dimensions (simplified - reads SOF0 marker)
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        let offset = 2;
        while (offset < buffer.length) {
          if (buffer[offset] !== 0xff) break;

          const marker = buffer[offset + 1];
          offset += 2;

          if (marker === 0xc0 || marker === 0xc2) {
            // SOF0 or SOF2
            const height = buffer.readUInt16BE(offset + 1);
            const width = buffer.readUInt16BE(offset + 3);
            return { width, height };
          }

          const size = buffer.readUInt16BE(offset);
          offset += size;
        }
      }

      // GIF dimensions
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return { width, height };
      }

      return {};
    } catch {
      return {};
    }
  }

  /**
   * Save image to file system and create metadata in database
   */
  async saveImage(buffer: Buffer, messageId?: string, conversationId?: string): Promise<IQueryResult<IImageMetadata>> {
    try {
      const hash = this.calculateHash(buffer);
      const db = getDatabase();

      // Check if image with same hash already exists
      const existing = db.getImageByHash(hash);
      if (existing.success && existing.data) {
        console.log(`[ImageStorage] Image already exists (deduped): ${existing.data.file_path}`);
        return existing;
      }

      // Get image info
      const ext = this.getImageExtension(buffer);
      const mimeType = this.getMimeTypeFromBuffer(buffer);
      const dimensions = this.getImageDimensions(buffer);

      // Generate file path
      const fileName = `${hash}.${ext}`;
      const filePath = path.join(this.imageDir, fileName);

      // Save to file system
      await fs.writeFile(filePath, buffer);
      console.log(`[ImageStorage] Image saved: ${filePath}`);

      // Create metadata
      const metadata: IImageMetadata = {
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        message_id: messageId,
        conversation_id: conversationId,
        file_path: filePath,
        file_hash: hash,
        file_size: buffer.length,
        mime_type: mimeType,
        width: dimensions.width,
        height: dimensions.height,
        created_at: Date.now(),
      };

      // Save metadata to database
      return db.createImageMetadata(metadata);
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Save image from file path
   */
  async saveImageFromPath(filePath: string, messageId?: string, conversationId?: string): Promise<IQueryResult<IImageMetadata>> {
    try {
      const buffer = await fs.readFile(filePath);
      return await this.saveImage(buffer, messageId, conversationId);
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get image buffer by ID
   */
  async getImage(imageId: string): Promise<IQueryResult<Buffer>> {
    try {
      const db = getDatabase();
      const result = db.getImageByHash(imageId);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: 'Image metadata not found',
        };
      }

      const buffer = await fs.readFile(result.data.file_path);

      return {
        success: true,
        data: buffer,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get image file path by hash
   */
  getImagePath(hash: string): IQueryResult<string> {
    try {
      const db = getDatabase();
      const result = db.getImageByHash(hash);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: 'Image not found',
        };
      }

      return {
        success: true,
        data: result.data.file_path,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete image by hash (removes both file and metadata)
   */
  async deleteImage(hash: string): Promise<IQueryResult<boolean>> {
    try {
      const db = getDatabase();
      const result = db.getImageByHash(hash);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: 'Image not found',
        };
      }

      // Delete file
      if (existsSync(result.data.file_path)) {
        await fs.unlink(result.data.file_path);
        console.log(`[ImageStorage] Deleted image file: ${result.data.file_path}`);
      }

      // Note: Database will handle metadata deletion via CASCADE when message/conversation is deleted
      // If manual deletion is needed, we can add a method to AionDatabase

      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Clean up orphaned images (images without metadata)
   */
  async cleanupOrphanedImages(): Promise<IQueryResult<number>> {
    try {
      const db = getDatabase();
      const files = await fs.readdir(this.imageDir);

      let deletedCount = 0;

      for (const file of files) {
        const hash = file.split('.')[0];
        const result = db.getImageByHash(hash);

        // If no metadata exists, delete the file
        if (!result.success) {
          const filePath = path.join(this.imageDir, file);
          await fs.unlink(filePath);
          deletedCount++;
          console.log(`[ImageStorage] Deleted orphaned image: ${filePath}`);
        }
      }

      return {
        success: true,
        data: deletedCount,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get total storage size
   */
  async getStorageSize(): Promise<IQueryResult<number>> {
    try {
      const files = await fs.readdir(this.imageDir);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.imageDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }

      return {
        success: true,
        data: totalSize,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
let imageStorageInstance: ImageStorage | null = null;

export function getImageStorage(imageDir?: string): ImageStorage {
  if (!imageStorageInstance) {
    imageStorageInstance = new ImageStorage(imageDir);
  }
  return imageStorageInstance;
}
