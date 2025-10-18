import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

/**
 * Offline Authentication Service
 * Stores user ID locally so we can access cache without Supabase
 */

const OFFLINE_USER_ID_KEY = 'offline_user_id';

/**
 * Store user ID locally for offline access
 * Call this whenever user logs in or auth state changes
 */
export const storeUserIdOffline = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(OFFLINE_USER_ID_KEY, userId);
    logger.log('💾 [OfflineAuth] Stored user ID for offline access');
  } catch (error) {
    logger.error('Error storing user ID offline:', error);
  }
};

/**
 * Get user ID from local storage (works offline!)
 * This bypasses Supabase entirely
 */
export const getUserIdOffline = async (): Promise<string | null> => {
  try {
    const userId = await AsyncStorage.getItem(OFFLINE_USER_ID_KEY);
    if (userId) {
      logger.log('💾 [OfflineAuth] Retrieved user ID from local storage');
    }
    return userId;
  } catch (error) {
    logger.error('Error getting user ID offline:', error);
    return null;
  }
};

/**
 * Clear stored user ID (call on logout)
 */
export const clearUserIdOffline = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(OFFLINE_USER_ID_KEY);
    logger.log('💾 [OfflineAuth] Cleared offline user ID');
  } catch (error) {
    logger.error('Error clearing user ID offline:', error);
  }
};

