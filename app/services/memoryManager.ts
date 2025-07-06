import * as FileSystem from 'expo-file-system';

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

  private constructor() {
    // Use consistent settings across all build types
    this.isPreviewBuild = !__DEV__;
    console.log(`[MemoryManager] Environment: ${this.isPreviewBuild ? 'Preview/Production' : 'Development'} (using consistent settings)`);
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
        console.log('[MemoryManager] Cleanup skipped - cooldown period active');
        return false;
      }

                   // Use more conservative cleanup thresholds to prevent interference with image loading
      const processedThreshold = 5;  // Increased from 2 to 5
      const historyThreshold = 8;    // Increased from 3 to 8
      
      if (this.processedImageCount > processedThreshold) {
        console.log('[MemoryManager] Cleanup recommended after processing', this.processedImageCount, 'images');
        return true;
      }
      
      if (this.imageUriHistory.length > historyThreshold) {
        console.log('[MemoryManager] Cleanup recommended due to', this.imageUriHistory.length, 'temporary files');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[MemoryManager] Error checking cleanup need:', error);
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
   * Cleans up previous image processing artifacts with enhanced timing
   */
  public async cleanupPreviousImages(excludeUri?: string): Promise<void> {
    try {
      const now = Date.now();
      this.lastCleanupTime = now;
      
      console.log(`[MemoryManager] Cleaning up ${this.imageUriHistory.length} previous image URIs${excludeUri ? ` (excluding current: ${excludeUri})` : ''}`);
      
      // Clean up temporary files, but exclude the current image being processed
      for (const uri of this.imageUriHistory) {
        try {
          // Skip deletion if this is the current image being processed
          if (excludeUri && uri === excludeUri) {
            console.log(`[MemoryManager] Skipping deletion of current image: ${uri}`);
            continue;
          }
          
          if (uri.startsWith('file://')) {
            const fileInfo = await FileSystem.getInfoAsync(uri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(uri, { idempotent: true });
              console.log(`[MemoryManager] Deleted temporary file: ${uri}`);
            }
          }
        } catch (error) {
          console.warn(`[MemoryManager] Failed to delete ${uri}:`, error);
        }
      }
      
      // Clear cache directories with higher threshold to prevent interference with image loading
      const cacheThreshold = 15;  // Increased from 10 to 15
      if (this.processedImageCount > cacheThreshold) {
        await this.clearCacheDirectories();
      }
      
      // Reset tracking but keep the current image if it was excluded
      if (excludeUri) {
        this.imageUriHistory = this.imageUriHistory.filter(uri => uri === excludeUri);
        console.log(`[MemoryManager] Keeping current image in history: ${excludeUri}`);
      } else {
        this.imageUriHistory = [];
      }
      this.processedImageCount = 0;
      
      console.log('[MemoryManager] Cleanup completed');
    } catch (error) {
      console.error('[MemoryManager] Cleanup failed:', error);
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
    
    console.log(`[MemoryManager] Tracking image: ${uri}, total processed: ${this.processedImageCount}`);
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
                console.warn(`[MemoryManager] Failed to delete cache file ${file}:`, error);
              }
            }
          }
        }
      }
      
      console.log('[MemoryManager] Cache directories cleared');
    } catch (error) {
      console.error('[MemoryManager] Failed to clear cache directories:', error);
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
           console.log(`[MemoryManager] Forced garbage collection (attempt ${i + 1}/${attempts})`);
           
           // Small delay between attempts
           if (i < attempts - 1) {
             await new Promise(resolve => setTimeout(resolve, 100));
           }
         } else {
           console.log('[MemoryManager] global.gc not available');
           break;
         }
       }
     } catch (error) {
       console.error('[MemoryManager] Garbage collection failed:', error);
     }
   }

  /**
   * Gentle cleanup for use before new operations
   */
  public async gentleCleanup(excludeCurrentImage?: string): Promise<void> {
    if (await this.shouldCleanup()) {
      console.log('[MemoryManager] Performing gentle cleanup');
      await this.cleanupPreviousImages(excludeCurrentImage);
      await this.performGarbageCollection();
    }
  }

  /**
   * Minimal cleanup that only cleans tracked images, not cache directories
   * Safe to use before image operations
   */
  public async minimalCleanup(excludeCurrentImage?: string): Promise<void> {
    console.log('[MemoryManager] Performing minimal cleanup (tracked images only)');
    
    const now = Date.now();
    this.lastCleanupTime = now;
    
    // Only clean up tracked image files, not cache directories
    for (const uri of this.imageUriHistory) {
      try {
        if (excludeCurrentImage && uri === excludeCurrentImage) {
          console.log(`[MemoryManager] Skipping deletion of current image: ${uri}`);
          continue;
        }
        
        if (uri.startsWith('file://')) {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            console.log(`[MemoryManager] Deleted temporary file: ${uri}`);
          }
        }
      } catch (error) {
        console.warn(`[MemoryManager] Failed to delete ${uri}:`, error);
      }
    }
    
    // Reset tracking but keep the current image if it was excluded
    if (excludeCurrentImage) {
      this.imageUriHistory = this.imageUriHistory.filter(uri => uri === excludeCurrentImage);
    } else {
      this.imageUriHistory = [];
    }
    this.processedImageCount = 0;
    
    console.log('[MemoryManager] Minimal cleanup completed');
  }

  /**
   * Forces garbage collection and cleanup
   */
  public async forceCleanup(): Promise<void> {
    await this.cleanupPreviousImages();
    await this.clearCacheDirectories();
    await this.performGarbageCollection();
  }

  /**
   * Very aggressive cleanup for memory pressure situations
   */
  public async emergencyCleanup(): Promise<void> {
    console.log('[MemoryManager] Emergency cleanup initiated');
    
    // Clear all tracked images
    this.imageUriHistory = [];
    this.processedImageCount = 0;
    
    // Clear cache directories multiple times
    await this.clearCacheDirectories();
    
    // Enhanced garbage collection for emergency situations
    await this.performGarbageCollection();
    
    // Additional cleanup for all builds
    await new Promise(resolve => setTimeout(resolve, 200));
    await this.performGarbageCollection();
    
    console.log('[MemoryManager] Emergency cleanup completed');
  }

  /**
   * Resets all tracking and state
   */
  public reset(): void {
    this.imageUriHistory = [];
    this.processedImageCount = 0;
    this.lastCleanupTime = 0;
    console.log('[MemoryManager] Reset completed');
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
      __DEV__: __DEV__
    };
  }
}

export default MemoryManager; 