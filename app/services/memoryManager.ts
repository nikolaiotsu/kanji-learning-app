import * as FileSystem from 'expo-file-system';

import { logger } from '../utils/logger';
interface ImageProcessingConfig {
  maxDimension: number;
  compress: number;
  format: 'JPEG' | 'PNG';
}

class MemoryManager {
  private static instance: MemoryManager;
  private imageUriHistory: string[] = [];
  private processedImageCount: number = 0;
  private maxHistorySize: number = 10;
  private isPreviewBuild: boolean = false;
  private lastCleanupTime: number = 0;
  private cleanupCooldownMs: number = 2000; // 2 seconds between cleanups
  // Add a persistent reference to the original image
  private originalImageUri: string | null = null;

  private constructor() {
    // Use consistent settings across all build types
    this.isPreviewBuild = !__DEV__;
    logger.log(`[MemoryManager] Environment: ${this.isPreviewBuild ? 'Preview/Production' : 'Development'} (using consistent settings)`);
  }

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Enhanced cleanup check that considers build environment
   */
  public async shouldCleanup(): Promise<boolean> {
    try {
      const now = Date.now();
      
      // Respect cleanup cooldown to prevent excessive cleanup
      if (now - this.lastCleanupTime < this.cleanupCooldownMs) {
        logger.log('[MemoryManager] Cleanup skipped - cooldown period active');
        return false;
      }

                   // Use more conservative cleanup thresholds to prevent interference with image loading
      const processedThreshold = 5;  // Increased from 2 to 5
      const historyThreshold = 8;    // Increased from 3 to 8
      
      if (this.processedImageCount > processedThreshold) {
        logger.log('[MemoryManager] Cleanup recommended after processing', this.processedImageCount, 'images');
        return true;
      }
      
      if (this.imageUriHistory.length > historyThreshold) {
        logger.log('[MemoryManager] Cleanup recommended due to', this.imageUriHistory.length, 'temporary files');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('[MemoryManager] Error checking cleanup need:', error);
      return true;
    }
  }

  /**
   * Gets consistent image processing configuration for all builds
   */
  public getStandardImageConfig(): ImageProcessingConfig {
    return {
      maxDimension: 1800, // Conservative max dimension for all builds
      compress: 0.75,     // Conservative compression for all builds
      format: 'JPEG'
    };
  }

  /**
   * Marks an image URI as the original image that should always be preserved
   * This is used to ensure the original uncropped image is always available
   */
  public markAsOriginalImage(uri: string): void {
    if (!uri || !uri.startsWith('file://')) return;
    
    // Store in the persistent original image reference
    this.originalImageUri = uri;
    
    // Make sure it's in the history
    if (!this.imageUriHistory.includes(uri)) {
      this.trackProcessedImage(uri);
    }
    
    logger.log(`[MemoryManager] Marked as original image: ${uri}`);
  }

  /**
   * Gets the original image URI if it exists
   */
  public getOriginalImageUri(): string | null {
    return this.originalImageUri;
  }

  /**
   * Checks if the original image still exists in the file system
   */
  public async originalImageExists(): Promise<boolean> {
    if (!this.originalImageUri) return false;
    
    try {
      const fileInfo = await FileSystem.getInfoAsync(this.originalImageUri);
      return fileInfo.exists;
    } catch (error) {
      logger.warn(`[MemoryManager] Error checking if original image exists:`, error);
      return false;
    }
  }

  /**
   * Cleans up previous image processing artifacts with enhanced timing
   */
  public async cleanupPreviousImages(...excludeUris: string[]): Promise<void> {
    try {
      const now = Date.now();
      this.lastCleanupTime = now;
      
      // Always add the original image to the exclude list if it exists
      let preserveUris = [...excludeUris];
      if (this.originalImageUri && !preserveUris.includes(this.originalImageUri)) {
        preserveUris.push(this.originalImageUri);
        logger.log(`[MemoryManager] Adding original image to preserved URIs: ${this.originalImageUri}`);
      }
      
      logger.log(`[MemoryManager] Cleaning up ${this.imageUriHistory.length} previous image URIs${preserveUris.length ? ` (excluding ${preserveUris.length} URIs)` : ''}`);
      
      // Clean up temporary files, but exclude the specified images
      for (const uri of this.imageUriHistory) {
        try {
          // Skip deletion if this URI is in the excluded list
          if (preserveUris.includes(uri)) {
            logger.log(`[MemoryManager] Skipping deletion of preserved image: ${uri}`);
            continue;
          }
          
          if (uri.startsWith('file://')) {
            const fileInfo = await FileSystem.getInfoAsync(uri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(uri, { idempotent: true });
              logger.log(`[MemoryManager] Deleted temporary file: ${uri}`);
            }
          }
        } catch (error) {
          logger.warn(`[MemoryManager] Failed to delete ${uri}:`, error);
        }
      }
      
      // Clear cache directories with higher threshold to prevent interference with image loading
      const cacheThreshold = 15;  // Increased from 10 to 15
      if (this.processedImageCount > cacheThreshold) {
        await this.clearCacheDirectories();
      }
      
      // Reset tracking but keep the excluded images and original image
      const imagesToKeep = preserveUris;
      this.imageUriHistory = this.imageUriHistory.filter(uri => imagesToKeep.includes(uri));
      logger.log(`[MemoryManager] Keeping ${this.imageUriHistory.length} images in history`);
      
      this.processedImageCount = 0;
      
      logger.log('[MemoryManager] Cleanup completed');
    } catch (error) {
      logger.error('[MemoryManager] Cleanup failed:', error);
    }
  }

  /**
   * Tracks a new processed image URI
   */
  public trackProcessedImage(uri: string): void {
    this.imageUriHistory.push(uri);
    this.processedImageCount++;
    
    // Keep history size manageable
    if (this.imageUriHistory.length > this.maxHistorySize) {
      this.imageUriHistory.shift();
    }
    
    logger.log(`[MemoryManager] Tracking image: ${uri}, total processed: ${this.processedImageCount}`);
  }

  /**
   * Clears app cache directories
   */
  private async clearCacheDirectories(): Promise<void> {
    try {
      const directories = [
        FileSystem.cacheDirectory
      ];
      
      for (const dir of directories) {
        if (dir) {
          const dirInfo = await FileSystem.getInfoAsync(dir);
          if (dirInfo.exists) {
            const files = await FileSystem.readDirectoryAsync(dir);
            
            for (const file of files) {
              const filePath = `${dir}${file}`;
              try {
                await FileSystem.deleteAsync(filePath, { idempotent: true });
              } catch (error) {
                logger.warn(`[MemoryManager] Failed to delete cache file ${file}:`, error);
              }
            }
          }
        }
      }
      
      logger.log('[MemoryManager] Cache directories cleared');
    } catch (error) {
      logger.error('[MemoryManager] Failed to clear cache directories:', error);
    }
  }

     /**
    * Enhanced garbage collection with consistent approach for all builds
    */
   private async performGarbageCollection(): Promise<void> {
     try {
       // Multiple attempts at garbage collection for all builds
       const attempts = 2;
       
       for (let i = 0; i < attempts; i++) {
         if (global.gc) {
           global.gc();
           logger.log(`[MemoryManager] Forced garbage collection (attempt ${i + 1}/${attempts})`);
           
           // Small delay between attempts
           if (i < attempts - 1) {
             await new Promise(resolve => setTimeout(resolve, 100));
           }
         } else {
           logger.log('[MemoryManager] global.gc not available');
           break;
         }
       }
     } catch (error) {
       logger.error('[MemoryManager] Garbage collection failed:', error);
     }
   }

  /**
   * Gentle cleanup for use before new operations
   */
  public async gentleCleanup(excludeCurrentImage?: string): Promise<void> {
    if (await this.shouldCleanup()) {
      logger.log('[MemoryManager] Performing gentle cleanup');
      if (excludeCurrentImage && typeof excludeCurrentImage === 'string') {
        await this.cleanupPreviousImages(excludeCurrentImage);
      } else {
        await this.cleanupPreviousImages();
      }
      await this.performGarbageCollection();
    }
  }

  /**
   * Minimal cleanup that only cleans tracked images, not cache directories
   * Safe to use before image operations
   */
  public async minimalCleanup(excludeCurrentImage?: string): Promise<void> {
    logger.log('[MemoryManager] Performing minimal cleanup (tracked images only)');
    
    const now = Date.now();
    this.lastCleanupTime = now;
    
    // Create a list of images to preserve
    let preserveUris: string[] = [];
    if (excludeCurrentImage) {
      preserveUris.push(excludeCurrentImage);
    }
    
    // Always preserve the original image
    if (this.originalImageUri && !preserveUris.includes(this.originalImageUri)) {
      preserveUris.push(this.originalImageUri);
      logger.log(`[MemoryManager] Adding original image to preserved URIs during minimal cleanup: ${this.originalImageUri}`);
    }
    
    // Only clean up tracked image files, not cache directories
    for (const uri of this.imageUriHistory) {
      try {
        if (preserveUris.includes(uri)) {
          logger.log(`[MemoryManager] Skipping deletion of preserved image: ${uri}`);
          continue;
        }
        
        if (uri.startsWith('file://')) {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            logger.log(`[MemoryManager] Deleted temporary file: ${uri}`);
          }
        }
      } catch (error) {
        logger.warn(`[MemoryManager] Failed to delete ${uri}:`, error);
      }
    }
    
    // Reset tracking but keep the preserved images
    this.imageUriHistory = this.imageUriHistory.filter(uri => preserveUris.includes(uri));
    this.processedImageCount = 0;
    
    logger.log('[MemoryManager] Minimal cleanup completed');
  }

  /**
   * Forces garbage collection and cleanup
   */
  public async forceCleanup(...excludeUris: string[]): Promise<void> {
    // Always add the original image to the exclude list if it exists
    let preserveUris = [...excludeUris];
    if (this.originalImageUri && !preserveUris.includes(this.originalImageUri)) {
      preserveUris.push(this.originalImageUri);
      logger.log(`[MemoryManager] Adding original image to preserved URIs during force cleanup: ${this.originalImageUri}`);
    }
    
    if (preserveUris.length > 0) {
      await this.cleanupPreviousImages(...preserveUris);
    } else {
      await this.cleanupPreviousImages();
    }
    await this.clearCacheDirectories();
    await this.performGarbageCollection();
  }

  /**
   * Very aggressive cleanup for memory pressure situations
   */
  public async emergencyCleanup(): Promise<void> {
    logger.log('[MemoryManager] Emergency cleanup initiated');
    
    // Preserve the original image if it exists
    let originalImageToKeep = null;
    if (this.originalImageUri) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(this.originalImageUri);
        if (fileInfo.exists) {
          originalImageToKeep = this.originalImageUri;
          logger.log(`[MemoryManager] Preserving original image during emergency cleanup: ${this.originalImageUri}`);
        }
      } catch (error) {
        logger.warn(`[MemoryManager] Error checking original image during emergency cleanup:`, error);
      }
    }
    
    // Clear all tracked images except the original
    if (originalImageToKeep) {
      this.imageUriHistory = this.imageUriHistory.filter(uri => uri === originalImageToKeep);
    } else {
      this.imageUriHistory = [];
    }
    this.processedImageCount = 0;
    
    // Clear cache directories multiple times
    await this.clearCacheDirectories();
    
    // Enhanced garbage collection for emergency situations
    await this.performGarbageCollection();
    
    // Additional cleanup for all builds
    await new Promise(resolve => setTimeout(resolve, 200));
    await this.performGarbageCollection();
    
    logger.log('[MemoryManager] Emergency cleanup completed');
  }

  /**
   * Resets all tracking and state
   */
  public reset(): void {
    this.imageUriHistory = [];
    this.processedImageCount = 0;
    this.lastCleanupTime = 0;
    this.originalImageUri = null; // Reset original image reference
    logger.log('[MemoryManager] Reset completed');
  }

  /**
   * Debug method to verify environment detection and settings
   */
  public getDebugInfo(): object {
    return {
      isPreviewBuild: this.isPreviewBuild,
      processedImageCount: this.processedImageCount,
      imageHistoryLength: this.imageUriHistory.length,
      lastCleanupTime: this.lastCleanupTime,
      cleanupCooldownMs: this.cleanupCooldownMs,
      maxHistorySize: this.maxHistorySize,
      standardConfig: this.getStandardImageConfig(),
      environment: this.isPreviewBuild ? 'Preview/Production' : 'Development' + ' (consistent settings)',
      globalGcAvailable: typeof global.gc !== 'undefined',
      __DEV__: __DEV__,
      originalImageUri: this.originalImageUri || 'N/A'
    };
  }
}

export default MemoryManager; 