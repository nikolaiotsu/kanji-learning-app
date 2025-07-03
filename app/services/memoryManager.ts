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

  private constructor() {}

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }



  /**
   * Simple cleanup check - just ensures we clean up before new operations
   */
  public async shouldCleanup(): Promise<boolean> {
    try {
      // Clean up if we have processed multiple images
      if (this.processedImageCount > 3) {
        console.log('[MemoryManager] Cleanup recommended after processing', this.processedImageCount, 'images');
        return true;
      }
      
      // Clean up if we have many temporary files
      if (this.imageUriHistory.length > 5) {
        console.log('[MemoryManager] Cleanup recommended due to', this.imageUriHistory.length, 'temporary files');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[MemoryManager] Error checking cleanup need:', error);
      return true; // Default to cleanup on error
    }
  }

  /**
   * Gets standard image processing configuration (simplified)
   */
  public getStandardImageConfig(): ImageProcessingConfig {
    return {
      maxDimension: 2000,
      compress: 0.8,
      format: 'JPEG'
    };
  }

  /**
   * Cleans up previous image processing artifacts
   */
  public async cleanupPreviousImages(excludeUri?: string): Promise<void> {
    try {
      console.log(`[MemoryManager] Cleaning up ${this.imageUriHistory.length} previous image URIs`);
      
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
      
      // Clear cache directories periodically
      if (this.processedImageCount > 20) {
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
   * Forces garbage collection and cleanup
   */
  public async forceCleanup(): Promise<void> {
    await this.cleanupPreviousImages();
    await this.clearCacheDirectories();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('[MemoryManager] Forced garbage collection');
    }
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
    
    // Force garbage collection multiple times if available
    if (global.gc) {
      global.gc();
      setTimeout(() => {
        if (global.gc) {
          global.gc();
          console.log('[MemoryManager] Emergency garbage collection completed');
        }
      }, 100);
    }
    
    console.log('[MemoryManager] Emergency cleanup completed');
  }

  /**
   * Resets all tracking and state
   */
  public reset(): void {
    this.imageUriHistory = [];
    this.processedImageCount = 0;
    console.log('[MemoryManager] Reset completed');
  }
}

export default MemoryManager; 