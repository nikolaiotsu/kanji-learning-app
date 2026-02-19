import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {
  cacheAudioMapping,
  getCachedAudioPath,
  removeAudioMapping,
} from './offlineStorage';
import { logger } from '../utils/logger';

/**
 * Audio Cache Service
 * Manages caching of TTS-generated audio files
 */

const CACHE_DIR = `${FileSystem.documentDirectory}audio_cache/`;

const ensureCacheDir = async (): Promise<void> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      logger.log('📁 [AudioCache] Created cache directory');
    }
  } catch (error) {
    logger.error('Error creating audio cache directory:', error);
    throw error;
  }
};

/**
 * Generate a deterministic cache key from text + languageCode
 */
const getCacheKey = async (text: string, languageCode: string): Promise<string> => {
  const input = `${text}|${languageCode}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return hash;
};

/**
 * Write base64 audio to local file and store mapping
 */
export const cacheAudio = async (
  userId: string,
  text: string,
  languageCode: string,
  base64Data: string
): Promise<string | null> => {
  try {
    const cacheKey = await getCacheKey(text, languageCode);

    const cachedPath = await getCachedAudioPath(userId, cacheKey);
    if (cachedPath) {
      const fileInfo = await FileSystem.getInfoAsync(cachedPath);
      if (fileInfo.exists) {
        logger.log('🔊 [AudioCache] Audio already cached:', cacheKey);
        return cachedPath;
      }
    }

    await ensureCacheDir();
    const filename = `${cacheKey}.mp3`;
    const localPath = `${CACHE_DIR}${userId}_${filename}`;

    await FileSystem.writeAsStringAsync(localPath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await cacheAudioMapping(userId, cacheKey, localPath);
    logger.log('🔊 [AudioCache] Audio cached successfully:', localPath);
    return localPath;
  } catch (error) {
    logger.error('Error caching audio:', error);
    return null;
  }
};

/**
 * Get cached audio URI if available
 * Returns local file path if cached, null otherwise
 */
export const getCachedAudioUri = async (
  userId: string,
  text: string,
  languageCode: string
): Promise<string | null> => {
  try {
    const cacheKey = await getCacheKey(text, languageCode);
    const cachedPath = await getCachedAudioPath(userId, cacheKey);

    if (cachedPath) {
      const fileInfo = await FileSystem.getInfoAsync(cachedPath);
      if (fileInfo.exists) {
        logger.log('🔊 [AudioCache] Using cached audio:', cachedPath);
        return cachedPath;
      }
    }

    return null;
  } catch (error) {
    logger.error('Error getting cached audio URI:', error);
    return null;
  }
};

/**
 * Delete cached audio for a specific card's text and language.
 * Call when a flashcard is deleted to avoid orphaned cache files.
 * @param userId User ID
 * @param text Card's originalText (must match what was used when audio was cached)
 * @param languageCode BCP-47 language code (e.g. 'it-IT', 'en-US')
 */
export const deleteCachedAudioForCard = async (
  userId: string,
  text: string,
  languageCode: string
): Promise<void> => {
  try {
    const trimmed = text?.trim();
    if (!trimmed || !languageCode) return;

    const cacheKey = await getCacheKey(trimmed, languageCode);
    const cachedPath = await getCachedAudioPath(userId, cacheKey);

    if (cachedPath) {
      const fileInfo = await FileSystem.getInfoAsync(cachedPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(cachedPath, { idempotent: true });
        logger.log('🔊 [AudioCache] Deleted cached audio for removed card:', cacheKey);
      }
      await removeAudioMapping(userId, cacheKey);
    }
  } catch (error) {
    logger.error('Error deleting cached audio for card:', error);
    // Don't throw - audio cleanup failure should not block card deletion
  }
};

/**
 * Clear all cached audio for a user
 */
export const clearAudioCache = async (userId: string): Promise<void> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);

    if (dirInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);

      for (const file of files) {
        if (file.startsWith(`${userId}_`)) {
          const filePath = `${CACHE_DIR}${file}`;
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
      }

      logger.log('🔊 [AudioCache] Cleared audio cache for user:', userId);
    }
  } catch (error) {
    logger.error('Error clearing audio cache:', error);
    throw error;
  }
};

/**
 * Get total size of cached audio for a user (in bytes)
 */
export const getAudioCacheSize = async (userId: string): Promise<number> => {
  try {
    let totalSize = 0;

    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);

    if (dirInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);

      for (const file of files) {
        if (file.startsWith(`${userId}_`)) {
          const filePath = `${CACHE_DIR}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (fileInfo.exists && 'size' in fileInfo && fileInfo.size) {
            totalSize += fileInfo.size;
          }
        }
      }
    }

    return totalSize;
  } catch (error) {
    logger.error('Error calculating audio cache size:', error);
    return 0;
  }
};
