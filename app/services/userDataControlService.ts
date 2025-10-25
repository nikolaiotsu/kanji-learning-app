import { supabase } from './supabaseClient';
import { logger } from '../utils/logger';
import { getUserIdOffline } from './offlineAuth';
import { clearCache } from './offlineStorage';
import { deleteCachedImages } from './imageCache';
import { sanitizeForLogging } from './privacyService';

/**
 * User Data Control Service
 * Provides users with control over their data (export, delete, etc.)
 */

export interface UserDataExport {
  user: {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string;
  };
  decks: Array<{
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    order_index: number;
  }>;
  flashcards: Array<{
    id: string;
    original_text: string;
    furigana_text: string;
    translated_text: string;
    target_language: string;
    created_at: string;
    image_url: string | null;
    deck_id: string;
  }>;
  export_metadata: {
    export_date: string;
    total_decks: number;
    total_flashcards: number;
    app_version: string;
  };
}

/**
 * Export all user data in a structured format
 */
export const exportUserData = async (): Promise<UserDataExport | null> => {
  try {
    const userId = await getUserIdOffline();
    if (!userId) {
      logger.error('No user ID available for data export');
      return null;
    }
    
    logger.log(`📤 [UserDataControl] Starting data export for user: ${userId}`);
    
    // Get user information
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      logger.error('Error fetching user data:', userError);
      return null;
    }
    
    // Get user's decks
    const { data: decks, error: decksError } = await supabase
      .from('decks')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true });
    
    if (decksError) {
      logger.error('Error fetching decks:', decksError);
      return null;
    }
    
    // Get user's flashcards
    const { data: flashcards, error: flashcardsError } = await supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    
    if (flashcardsError) {
      logger.error('Error fetching flashcards:', flashcardsError);
      return null;
    }
    
    const exportData: UserDataExport = {
      user: {
        id: userData.user.id,
        email: userData.user.email || '',
        created_at: userData.user.created_at,
        last_sign_in_at: userData.user.last_sign_in_at || '',
      },
      decks: decks || [],
      flashcards: flashcards || [],
      export_metadata: {
        export_date: new Date().toISOString(),
        total_decks: decks?.length || 0,
        total_flashcards: flashcards?.length || 0,
        app_version: '1.0.0', // You might want to get this from app config
      }
    };
    
    logger.log(`📤 [UserDataControl] Data export completed: ${exportData.export_metadata.total_decks} decks, ${exportData.export_metadata.total_flashcards} flashcards`);
    
    return exportData;
  } catch (error) {
    logger.error('Error in exportUserData:', error);
    return null;
  }
};

/**
 * Delete all user data (account deletion)
 */
export const deleteAllUserData = async (): Promise<{ success: boolean; errors: string[] }> => {
  const result = { success: true, errors: [] as string[] };
  
  try {
    const userId = await getUserIdOffline();
    if (!userId) {
      result.success = false;
      result.errors.push('No user ID available');
      return result;
    }
    
    logger.log(`🗑️ [UserDataControl] Starting complete data deletion for user: ${userId}`);
    
    // Get all image URLs before deletion
    const { data: flashcards, error: fetchError } = await supabase
      .from('flashcards')
      .select('image_url')
      .eq('user_id', userId);
    
    if (fetchError) {
      logger.error('Error fetching flashcards for image cleanup:', fetchError);
      result.errors.push('Failed to fetch flashcards for cleanup');
    }
    
    const imageUrls = flashcards?.map(f => f.image_url).filter(url => url) || [];
    
    // Delete flashcards (cascade will handle deck deletion)
    const { error: flashcardsError } = await supabase
      .from('flashcards')
      .delete()
      .eq('user_id', userId);
    
    if (flashcardsError) {
      logger.error('Error deleting flashcards:', flashcardsError);
      result.errors.push('Failed to delete flashcards');
      result.success = false;
    }
    
    // Delete decks
    const { error: decksError } = await supabase
      .from('decks')
      .delete()
      .eq('user_id', userId);
    
    if (decksError) {
      logger.error('Error deleting decks:', decksError);
      result.errors.push('Failed to delete decks');
      result.success = false;
    }
    
    // Delete API usage logs
    const { error: logsError } = await supabase
      .from('api_usage_logs')
      .delete()
      .eq('user_id', userId);
    
    if (logsError) {
      logger.error('Error deleting API logs:', logsError);
      result.errors.push('Failed to delete API logs');
      result.success = false;
    }
    
    // Delete daily usage records
    const { error: usageError } = await supabase
      .from('user_daily_usage')
      .delete()
      .eq('user_id', userId);
    
    if (usageError) {
      logger.error('Error deleting daily usage:', usageError);
      result.errors.push('Failed to delete usage records');
      result.success = false;
    }
    
    // Delete images from storage
    if (imageUrls.length > 0) {
      try {
        const filePaths = imageUrls.map(url => {
          // Handle both public and signed URLs
          let fileName: string;
          
          if (url.includes('flashcard-images/')) {
            const parts = url.split('flashcard-images/');
            if (parts.length > 1) {
              // Remove query parameters (from signed URLs)
              fileName = parts[1].split('?')[0];
            } else {
              // Fallback: use last part of URL
              const urlParts = url.split('/');
              fileName = urlParts[urlParts.length - 1].split('?')[0];
            }
          } else {
            // Fallback: use last part of URL
            const urlParts = url.split('/');
            fileName = urlParts[urlParts.length - 1].split('?')[0];
          }
          
          return `flashcard-images/${fileName}`;
        });
        
        const { error: storageError } = await supabase.storage
          .from('flashcards')
          .remove(filePaths);
        
        if (storageError) {
          logger.error('Error deleting images from storage:', storageError);
          result.errors.push('Failed to delete some images from storage');
        }
      } catch (error) {
        logger.error('Error processing image deletion:', error);
        result.errors.push('Failed to process image deletion');
      }
    }
    
    // Clear local cache
    try {
      await clearCache(userId);
      await deleteCachedImages(userId, imageUrls);
    } catch (error) {
      logger.error('Error clearing local cache:', error);
      result.errors.push('Failed to clear local cache');
    }
    
    // Delete user account (this should be done last)
    if (result.success) {
      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
          logger.error('Error deleting user account:', authError);
          result.errors.push('Failed to delete user account');
          result.success = false;
        }
      } catch (error) {
        logger.error('Error in user account deletion:', error);
        result.errors.push('Failed to delete user account');
        result.success = false;
      }
    }
    
    if (result.success) {
      logger.log(`🗑️ [UserDataControl] Complete data deletion successful for user: ${userId}`);
    } else {
      logger.error(`🗑️ [UserDataControl] Data deletion completed with errors:`, result.errors);
    }
    
    return result;
  } catch (error) {
    logger.error('Error in deleteAllUserData:', error);
    result.success = false;
    result.errors.push(`General error: ${error}`);
    return result;
  }
};

/**
 * Delete specific flashcard and its associated data
 */
export const deleteFlashcardData = async (flashcardId: string): Promise<boolean> => {
  try {
    const userId = await getUserIdOffline();
    if (!userId) {
      logger.error('No user ID available for flashcard deletion');
      return false;
    }
    
    logger.log(`🗑️ [UserDataControl] Deleting flashcard: ${flashcardId}`);
    
    // Get flashcard data first
    const { data: flashcard, error: fetchError } = await supabase
      .from('flashcards')
      .select('image_url')
      .eq('id', flashcardId)
      .eq('user_id', userId)
      .single();
    
    if (fetchError) {
      logger.error('Error fetching flashcard for deletion:', fetchError);
      return false;
    }
    
    // Delete flashcard
    const { error: deleteError } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', flashcardId)
      .eq('user_id', userId);
    
    if (deleteError) {
      logger.error('Error deleting flashcard:', deleteError);
      return false;
    }
    
    // Delete associated image
    if (flashcard.image_url) {
      try {
        // Handle both public and signed URLs
        let fileName: string;
        
        if (flashcard.image_url.includes('flashcard-images/')) {
          const parts = flashcard.image_url.split('flashcard-images/');
          if (parts.length > 1) {
            // Remove query parameters (from signed URLs)
            fileName = parts[1].split('?')[0];
          } else {
            // Fallback: use last part of URL
            const urlParts = flashcard.image_url.split('/');
            fileName = urlParts[urlParts.length - 1].split('?')[0];
          }
        } else {
          // Fallback: use last part of URL
          const urlParts = flashcard.image_url.split('/');
          fileName = urlParts[urlParts.length - 1].split('?')[0];
        }
        
        const filePath = `flashcard-images/${fileName}`;
        
        const { error: storageError } = await supabase.storage
          .from('flashcards')
          .remove([filePath]);
        
        if (storageError) {
          logger.warn('Failed to delete flashcard image:', storageError);
        }
      } catch (error) {
        logger.warn('Error deleting flashcard image:', error);
      }
    }
    
    logger.log(`🗑️ [UserDataControl] Flashcard deleted successfully: ${flashcardId}`);
    return true;
  } catch (error) {
    logger.error('Error in deleteFlashcardData:', error);
    return false;
  }
};

/**
 * Get user data summary
 */
export const getUserDataSummary = async (): Promise<{
  totalDecks: number;
  totalFlashcards: number;
  totalImages: number;
  accountAge: number; // in days
  lastActivity: string | null;
} | null> => {
  try {
    const userId = await getUserIdOffline();
    if (!userId) {
      return null;
    }
    
    const [decksResult, flashcardsResult, userResult] = await Promise.all([
      supabase.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.auth.getUser()
    ]);
    
    const { data: userData } = userResult;
    const accountCreatedAt = userData?.user?.created_at;
    const accountAge = accountCreatedAt 
      ? Math.floor((Date.now() - new Date(accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    // Get last activity (most recent flashcard creation)
    const { data: lastActivity } = await supabase
      .from('flashcards')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    return {
      totalDecks: decksResult.count || 0,
      totalFlashcards: flashcardsResult.count || 0,
      totalImages: flashcardsResult.count || 0, // Assuming each flashcard has an image
      accountAge,
      lastActivity: lastActivity?.created_at || null,
    };
  } catch (error) {
    logger.error('Error getting user data summary:', error);
    return null;
  }
};

/**
 * Anonymize user data (replace personal content with anonymized versions)
 */
export const anonymizeUserData = async (): Promise<boolean> => {
  try {
    const userId = await getUserIdOffline();
    if (!userId) {
      logger.error('No user ID available for data anonymization');
      return false;
    }
    
    logger.log(`🔒 [UserDataControl] Starting data anonymization for user: ${userId}`);
    
    // Get all flashcards
    const { data: flashcards, error: fetchError } = await supabase
      .from('flashcards')
      .select('id, original_text, furigana_text, translated_text')
      .eq('user_id', userId);
    
    if (fetchError) {
      logger.error('Error fetching flashcards for anonymization:', fetchError);
      return false;
    }
    
    // Anonymize each flashcard
    for (const flashcard of flashcards || []) {
      const updates = {
        original_text: sanitizeForLogging(flashcard.original_text),
        furigana_text: flashcard.furigana_text ? sanitizeForLogging(flashcard.furigana_text) : null,
        translated_text: flashcard.translated_text ? sanitizeForLogging(flashcard.translated_text) : null,
      };
      
      const { error: updateError } = await supabase
        .from('flashcards')
        .update(updates)
        .eq('id', flashcard.id)
        .eq('user_id', userId);
      
      if (updateError) {
        logger.error(`Error anonymizing flashcard ${flashcard.id}:`, updateError);
        return false;
      }
    }
    
    logger.log(`🔒 [UserDataControl] Data anonymization completed for ${flashcards?.length || 0} flashcards`);
    return true;
  } catch (error) {
    logger.error('Error in anonymizeUserData:', error);
    return false;
  }
};

export default {
  exportUserData,
  deleteAllUserData,
  deleteFlashcardData,
  getUserDataSummary,
  anonymizeUserData,
};
