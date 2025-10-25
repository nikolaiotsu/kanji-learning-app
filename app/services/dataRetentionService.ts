import { supabase } from './supabaseClient';
import { logger } from '../utils/logger';
import { getRetentionConfig, isAutoCleanupEnabled } from './privacyService';

/**
 * Data Retention Service
 * Handles automatic cleanup of old data based on retention policies
 */

interface RetentionStats {
  flashcardsDeleted: number;
  apiLogsDeleted: number;
  imagesDeleted: number;
  errors: string[];
}

/**
 * Clean up old flashcards based on retention policy
 * NOTE: This function is disabled to protect user data - flashcards are never auto-deleted
 */
export const cleanupOldFlashcards = async (): Promise<number> => {
  logger.log('🧹 [DataRetention] Flashcard cleanup is DISABLED to protect user data');
  return 0; // Never delete user flashcards automatically
};

/**
 * Clean up old API usage logs
 */
export const cleanupOldApiLogs = async (): Promise<number> => {
  try {
    const retentionDays = getRetentionConfig().API_LOGS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    logger.log(`🧹 [DataRetention] Cleaning up API logs older than ${retentionDays} days`);
    
    const { error } = await supabase
      .from('api_usage_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());
    
    if (error) {
      logger.error('Error deleting old API logs:', error);
      return 0;
    }
    
    logger.log(`🧹 [DataRetention] Cleaned up old API logs`);
    return 1; // We don't get count from delete, so return 1 for success
  } catch (error) {
    logger.error('Error in cleanupOldApiLogs:', error);
    return 0;
  }
};

/**
 * Clean up orphaned images from storage
 */
export const cleanupOrphanedImages = async (imageUrls: string[]): Promise<number> => {
  try {
    let deletedCount = 0;
    
    for (const imageUrl of imageUrls) {
      try {
        // Extract file path from URL (handles both public and signed URLs)
        let fileName: string;
        
        if (imageUrl.includes('flashcard-images/')) {
          const parts = imageUrl.split('flashcard-images/');
          if (parts.length > 1) {
            // Remove query parameters (from signed URLs)
            fileName = parts[1].split('?')[0];
          } else {
            // Fallback: use last part of URL
            const urlParts = imageUrl.split('/');
            fileName = urlParts[urlParts.length - 1].split('?')[0];
          }
        } else {
          // Fallback: use last part of URL
          const urlParts = imageUrl.split('/');
          fileName = urlParts[urlParts.length - 1].split('?')[0];
        }
        
        const filePath = `flashcard-images/${fileName}`;
        
        // Delete from Supabase Storage
        const { error } = await supabase.storage
          .from('flashcards')
          .remove([filePath]);
        
        if (error) {
          logger.warn(`Failed to delete image ${fileName}:`, error.message);
        } else {
          deletedCount++;
          logger.log(`🧹 [DataRetention] Deleted orphaned image: ${fileName}`);
        }
      } catch (error) {
        logger.warn(`Error deleting image ${imageUrl}:`, error);
      }
    }
    
    return deletedCount;
  } catch (error) {
    logger.error('Error in cleanupOrphanedImages:', error);
    return 0;
  }
};

/**
 * Find and clean up orphaned images (images not referenced by any flashcard)
 * This is SAFE because it only removes images that are truly orphaned
 */
export const findAndCleanupOrphanedImages = async (): Promise<number> => {
  try {
    logger.log('🧹 [DataRetention] Finding orphaned images (safe cleanup)...');
    
    // Get all image URLs from flashcards
    const { data: flashcards, error: fetchError } = await supabase
      .from('flashcards')
      .select('image_url');
    
    if (fetchError) {
      logger.error('Error fetching flashcards for orphaned image cleanup:', fetchError);
      return 0;
    }
    
    const referencedImages = new Set(
      flashcards
        ?.map(f => f.image_url)
        .filter(url => url && url.trim() !== '')
        .map(url => {
          // Handle both public and signed URLs
          if (url!.includes('flashcard-images/')) {
            const parts = url!.split('flashcard-images/');
            if (parts.length > 1) {
              // Remove query parameters (from signed URLs)
              return parts[1].split('?')[0];
            }
          }
          // Fallback: use last part of URL
          const urlParts = url!.split('/');
          return urlParts[urlParts.length - 1].split('?')[0];
        }) || []
    );
    
    // List all images in storage
    const { data: storageFiles, error: listError } = await supabase.storage
      .from('flashcards')
      .list('flashcard-images');
    
    if (listError) {
      logger.error('Error listing storage files:', listError);
      return 0;
    }
    
    // Find orphaned files (images not referenced by any flashcard)
    const orphanedFiles = storageFiles?.filter(file => 
      !referencedImages.has(file.name)
    ) || [];
    
    if (orphanedFiles.length === 0) {
      logger.log('🧹 [DataRetention] No orphaned images found');
      return 0;
    }
    
    logger.log(`🧹 [DataRetention] Found ${orphanedFiles.length} orphaned images (safe to delete)`);
    
    // Delete orphaned files
    const filePaths = orphanedFiles.map(file => `flashcard-images/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from('flashcards')
      .remove(filePaths);
    
    if (deleteError) {
      logger.error('Error deleting orphaned images:', deleteError);
      return 0;
    }
    
    logger.log(`🧹 [DataRetention] Deleted ${orphanedFiles.length} orphaned images`);
    return orphanedFiles.length;
  } catch (error) {
    logger.error('Error in findAndCleanupOrphanedImages:', error);
    return 0;
  }
};

/**
 * Perform comprehensive data cleanup
 */
export const performDataCleanup = async (): Promise<RetentionStats> => {
  const stats: RetentionStats = {
    flashcardsDeleted: 0,
    apiLogsDeleted: 0,
    imagesDeleted: 0,
    errors: []
  };
  
  if (!isAutoCleanupEnabled()) {
    logger.log('🧹 [DataRetention] Auto cleanup is disabled');
    return stats;
  }
  
  try {
    logger.log('🧹 [DataRetention] Starting comprehensive data cleanup...');
    
    // Skip flashcard cleanup - user data is never auto-deleted
    stats.flashcardsDeleted = 0;
    
    // Clean up old API logs
    try {
      stats.apiLogsDeleted = await cleanupOldApiLogs();
    } catch (error) {
      stats.errors.push(`API logs cleanup failed: ${error}`);
    }
    
    // Clean up orphaned images (only images not referenced by any flashcard)
    try {
      stats.imagesDeleted = await findAndCleanupOrphanedImages();
    } catch (error) {
      stats.errors.push(`Orphaned image cleanup failed: ${error}`);
    }
    
    logger.log('🧹 [DataRetention] Cleanup completed:', stats);
    return stats;
  } catch (error) {
    logger.error('Error in performDataCleanup:', error);
    stats.errors.push(`General cleanup error: ${error}`);
    return stats;
  }
};

/**
 * Schedule automatic cleanup (call this periodically)
 */
export const scheduleDataCleanup = (): void => {
  // Run cleanup daily at 2 AM
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(2, 0, 0, 0);
  
  const timeUntilCleanup = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    performDataCleanup().catch(error => {
      logger.error('Scheduled cleanup failed:', error);
    });
    
    // Schedule next cleanup
    scheduleDataCleanup();
  }, timeUntilCleanup);
  
  logger.log(`🧹 [DataRetention] Next cleanup scheduled for ${tomorrow.toISOString()}`);
};

/**
 * Get data retention statistics
 */
export const getRetentionStats = async (): Promise<{
  totalFlashcards: number;
  totalApiLogs: number;
  oldestFlashcard: string | null;
  oldestApiLog: string | null;
}> => {
  try {
    const [flashcardsResult, apiLogsResult] = await Promise.all([
      supabase
        .from('flashcards')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1),
      supabase
        .from('api_usage_logs')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
    ]);
    
    const [flashcardsCount, apiLogsCount] = await Promise.all([
      supabase.from('flashcards').select('id', { count: 'exact', head: true }),
      supabase.from('api_usage_logs').select('id', { count: 'exact', head: true })
    ]);
    
    return {
      totalFlashcards: flashcardsCount.count || 0,
      totalApiLogs: apiLogsCount.count || 0,
      oldestFlashcard: flashcardsResult.data?.[0]?.created_at || null,
      oldestApiLog: apiLogsResult.data?.[0]?.created_at || null,
    };
  } catch (error) {
    logger.error('Error getting retention stats:', error);
    return {
      totalFlashcards: 0,
      totalApiLogs: 0,
      oldestFlashcard: null,
      oldestApiLog: null,
    };
  }
};

export default {
  cleanupOldFlashcards,
  cleanupOldApiLogs,
  cleanupOrphanedImages,
  findAndCleanupOrphanedImages,
  performDataCleanup,
  scheduleDataCleanup,
  getRetentionStats,
};
