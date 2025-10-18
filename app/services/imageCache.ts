import * as FileSystem from 'expo-file-system';
import { cacheImageMapping, getCachedImagePath } from './offlineStorage';
import { logger } from '../utils/logger';

/**
 * Image Cache Service
 * Manages downloading and caching of flashcard images
 */

// Directory for cached images
const CACHE_DIR = `${FileSystem.documentDirectory}image_cache/`;

// Ensure cache directory exists
const ensureCacheDir = async (): Promise<void> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      logger.log('📁 [ImageCache] Created cache directory');
    }
  } catch (error) {
    logger.error('Error creating cache directory:', error);
    throw error;
  }
};

/**
 * Generate a safe filename from URL
 */
const getFilenameFromUrl = (url: string): string => {
  // Extract filename from URL and sanitize
  const urlParts = url.split('/');
  const filename = urlParts[urlParts.length - 1];
  // Remove query parameters and sanitize
  const sanitized = filename.split('?')[0].replace(/[^a-zA-Z0-9.-]/g, '_');
  return sanitized || `image_${Date.now()}.jpg`;
};

/**
 * Download and cache an image
 */
export const cacheImage = async (
  userId: string,
  imageUrl: string
): Promise<string | null> => {
  try {
    // Check if already cached
    const cachedPath = await getCachedImagePath(userId, imageUrl);
    if (cachedPath) {
      const fileInfo = await FileSystem.getInfoAsync(cachedPath);
      if (fileInfo.exists) {
        logger.log('🖼️ [ImageCache] Image already cached:', imageUrl);
        return cachedPath;
      }
    }

    // Ensure cache directory exists
    await ensureCacheDir();

    // Generate local path
    const filename = getFilenameFromUrl(imageUrl);
    const localPath = `${CACHE_DIR}${userId}_${filename}`;

    // Download image
    logger.log('🖼️ [ImageCache] Downloading image:', imageUrl);
    const downloadResult = await FileSystem.downloadAsync(imageUrl, localPath);

    if (downloadResult.status === 200) {
      // Save mapping
      await cacheImageMapping(userId, imageUrl, localPath);
      logger.log('🖼️ [ImageCache] Image cached successfully:', localPath);
      return localPath;
    } else {
      logger.error('🖼️ [ImageCache] Download failed with status:', downloadResult.status);
      return null;
    }
  } catch (error) {
    logger.error('Error caching image:', error);
    return null;
  }
};

/**
 * Get cached image URI for use in Image component
 * Returns local file URI if cached, otherwise returns original URL
 */
export const getCachedImageUri = async (
  userId: string,
  imageUrl: string
): Promise<string> => {
  try {
    const cachedPath = await getCachedImagePath(userId, imageUrl);
    
    if (cachedPath) {
      const fileInfo = await FileSystem.getInfoAsync(cachedPath);
      if (fileInfo.exists) {
        logger.log('🖼️ [ImageCache] Using cached image:', cachedPath);
        return cachedPath;
      }
    }
    
    // Return original URL as fallback
    return imageUrl;
  } catch (error) {
    logger.error('Error getting cached image URI:', error);
    return imageUrl;
  }
};

/**
 * Batch cache images in background
 * Useful for caching all images in a deck
 */
export const batchCacheImages = async (
  userId: string,
  imageUrls: string[]
): Promise<void> => {
  try {
    logger.log(`🖼️ [ImageCache] Starting batch cache of ${imageUrls.length} images`);
    
    // Cache images one at a time to avoid overwhelming the system
    for (const url of imageUrls) {
      try {
        await cacheImage(userId, url);
      } catch (error) {
        // Log but continue with other images
        logger.warn('Failed to cache image, continuing:', url);
      }
    }
    
    logger.log('🖼️ [ImageCache] Batch cache complete');
  } catch (error) {
    logger.error('Error in batch cache:', error);
  }
};

/**
 * Clear cached images for a user
 */
export const clearImageCache = async (userId: string): Promise<void> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    
    if (dirInfo.exists) {
      // Get all files in cache directory
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      
      // Delete files that belong to this user
      for (const file of files) {
        if (file.startsWith(`${userId}_`)) {
          const filePath = `${CACHE_DIR}${file}`;
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
      }
      
      logger.log('🖼️ [ImageCache] Cleared image cache for user:', userId);
    }
  } catch (error) {
    logger.error('Error clearing image cache:', error);
    throw error;
  }
};

/**
 * Get total size of cached images for a user (in bytes)
 */
export const getImageCacheSize = async (userId: string): Promise<number> => {
  try {
    let totalSize = 0;
    
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    
    if (dirInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      
      for (const file of files) {
        if (file.startsWith(`${userId}_`)) {
          const filePath = `${CACHE_DIR}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (fileInfo.exists && fileInfo.size) {
            totalSize += fileInfo.size;
          }
        }
      }
    }
    
    return totalSize;
  } catch (error) {
    logger.error('Error calculating image cache size:', error);
    return 0;
  }
};

