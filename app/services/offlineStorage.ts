import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flashcard } from '../types/Flashcard';
import { Deck } from '../types/Deck';
import { logger } from '../utils/logger';

/**
 * Offline Storage Service
 * Manages local caching of flashcards and deck data
 */

// Storage key generators
const getCardsKey = (userId: string, deckId: string) => `offline_cards_${userId}_${deckId}`;
const getDecksKey = (userId: string) => `offline_decks_${userId}`;
const getImageMappingKey = (userId: string) => `offline_images_${userId}`;
const getMetadataKey = (userId: string) => `offline_metadata_${userId}`;

export interface CacheMetadata {
  lastUpdated: number;
  deckIds: string[];
  cardCount: number;
  imageCount: number;
}

/**
 * Cache flashcards for specific decks
 */
export const cacheFlashcards = async (
  userId: string,
  deckId: string,
  cards: Flashcard[]
): Promise<void> => {
  try {
    const key = getCardsKey(userId, deckId);
    const data = JSON.stringify(cards);
    await AsyncStorage.setItem(key, data);
    
    // Update metadata
    await updateCacheMetadata(userId, deckId, cards.length);
    
    logger.log(`💾 [OfflineStorage] Cached ${cards.length} cards for deck: ${deckId}`);
  } catch (error) {
    logger.error('Error caching flashcards:', error);
    throw error;
  }
};

/**
 * Get cached flashcards for specific decks
 */
export const getCachedFlashcards = async (
  userId: string,
  deckIds: string[]
): Promise<Flashcard[]> => {
  try {
    const allCards: Flashcard[] = [];
    
    for (const deckId of deckIds) {
      const key = getCardsKey(userId, deckId);
      const data = await AsyncStorage.getItem(key);
      
      if (data) {
        const cards = JSON.parse(data) as Flashcard[];
        allCards.push(...cards);
      }
    }
    
    logger.log(`💾 [OfflineStorage] Retrieved ${allCards.length} cached cards from ${deckIds.length} decks`);
    return allCards;
  } catch (error) {
    logger.error('Error getting cached flashcards:', error);
    return [];
  }
};

/**
 * Cache deck metadata
 */
export const cacheDecks = async (userId: string, decks: Deck[]): Promise<void> => {
  try {
    const key = getDecksKey(userId);
    const data = JSON.stringify(decks);
    await AsyncStorage.setItem(key, data);
    
    logger.log(`💾 [OfflineStorage] Cached ${decks.length} decks`);
  } catch (error) {
    logger.error('Error caching decks:', error);
    throw error;
  }
};

/**
 * Get cached decks
 */
export const getCachedDecks = async (userId: string): Promise<Deck[]> => {
  try {
    const key = getDecksKey(userId);
    const data = await AsyncStorage.getItem(key);
    
    if (data) {
      const decks = JSON.parse(data) as Deck[];
      logger.log(`💾 [OfflineStorage] Retrieved ${decks.length} cached decks`);
      return decks;
    }
    
    return [];
  } catch (error) {
    logger.error('Error getting cached decks:', error);
    return [];
  }
};

/**
 * Cache image URL to local path mapping
 */
export const cacheImageMapping = async (
  userId: string,
  imageUrl: string,
  localPath: string
): Promise<void> => {
  try {
    const key = getImageMappingKey(userId);
    const data = await AsyncStorage.getItem(key);
    const mapping = data ? JSON.parse(data) : {};
    
    mapping[imageUrl] = localPath;
    
    await AsyncStorage.setItem(key, JSON.stringify(mapping));
    logger.log(`💾 [OfflineStorage] Cached image mapping: ${imageUrl}`);
  } catch (error) {
    logger.error('Error caching image mapping:', error);
    throw error;
  }
};

/**
 * Get local path for cached image
 */
export const getCachedImagePath = async (
  userId: string,
  imageUrl: string
): Promise<string | null> => {
  try {
    const key = getImageMappingKey(userId);
    const data = await AsyncStorage.getItem(key);
    
    if (data) {
      const mapping = JSON.parse(data);
      return mapping[imageUrl] || null;
    }
    
    return null;
  } catch (error) {
    logger.error('Error getting cached image path:', error);
    return null;
  }
};

/**
 * Update cache metadata
 */
const updateCacheMetadata = async (
  userId: string,
  deckId: string,
  cardCount: number
): Promise<void> => {
  try {
    const key = getMetadataKey(userId);
    const data = await AsyncStorage.getItem(key);
    const metadata: CacheMetadata = data ? JSON.parse(data) : {
      lastUpdated: 0,
      deckIds: [],
      cardCount: 0,
      imageCount: 0,
    };
    
    // Update metadata
    metadata.lastUpdated = Date.now();
    if (!metadata.deckIds.includes(deckId)) {
      metadata.deckIds.push(deckId);
    }
    metadata.cardCount = cardCount;
    
    await AsyncStorage.setItem(key, JSON.stringify(metadata));
  } catch (error) {
    logger.error('Error updating cache metadata:', error);
  }
};

/**
 * Get cache metadata
 */
export const getCacheMetadata = async (userId: string): Promise<CacheMetadata | null> => {
  try {
    const key = getMetadataKey(userId);
    const data = await AsyncStorage.getItem(key);
    
    if (data) {
      return JSON.parse(data) as CacheMetadata;
    }
    
    return null;
  } catch (error) {
    logger.error('Error getting cache metadata:', error);
    return null;
  }
};

/**
 * Clear all cached data for a user
 */
export const clearCache = async (userId: string): Promise<void> => {
  try {
    // Get all cached deck IDs
    const metadata = await getCacheMetadata(userId);
    
    if (metadata) {
      // Clear all deck caches
      for (const deckId of metadata.deckIds) {
        const key = getCardsKey(userId, deckId);
        await AsyncStorage.removeItem(key);
      }
    }
    
    // Clear other caches
    await AsyncStorage.removeItem(getDecksKey(userId));
    await AsyncStorage.removeItem(getImageMappingKey(userId));
    await AsyncStorage.removeItem(getMetadataKey(userId));
    
    logger.log(`💾 [OfflineStorage] Cleared all cache for user: ${userId}`);
  } catch (error) {
    logger.error('Error clearing cache:', error);
    throw error;
  }
};

/**
 * Get approximate cache size (in bytes)
 * Note: This is an estimate based on string length
 */
export const getCacheSize = async (userId: string): Promise<number> => {
  try {
    let totalSize = 0;
    
    const metadata = await getCacheMetadata(userId);
    
    if (metadata) {
      // Calculate size of cached cards
      for (const deckId of metadata.deckIds) {
        const key = getCardsKey(userId, deckId);
        const data = await AsyncStorage.getItem(key);
        if (data) {
          totalSize += data.length;
        }
      }
      
      // Add size of decks cache
      const decksData = await AsyncStorage.getItem(getDecksKey(userId));
      if (decksData) {
        totalSize += decksData.length;
      }
      
      // Add size of image mappings
      const imageMappingData = await AsyncStorage.getItem(getImageMappingKey(userId));
      if (imageMappingData) {
        totalSize += imageMappingData.length;
      }
    }
    
    return totalSize;
  } catch (error) {
    logger.error('Error calculating cache size:', error);
    return 0;
  }
};

/**
 * Check if cache is stale (older than 7 days)
 */
export const isCacheStale = async (userId: string): Promise<boolean> => {
  try {
    const metadata = await getCacheMetadata(userId);
    
    if (!metadata) {
      return true;
    }
    
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const cacheAge = Date.now() - metadata.lastUpdated;
    
    return cacheAge > sevenDaysInMs;
  } catch (error) {
    logger.error('Error checking cache staleness:', error);
    return true;
  }
};

/**
 * Get cache status for debugging
 * Returns detailed information about what's cached
 */
export const getCacheStatus = async (userId: string): Promise<{
  hasCache: boolean;
  deckCount: number;
  cardCount: number;
  lastUpdated: number | null;
  cacheAge: string | null;
}> => {
  try {
    const metadata = await getCacheMetadata(userId);
    const decks = await getCachedDecks(userId);
    
    let totalCards = 0;
    if (metadata && metadata.deckIds.length > 0) {
      const allCards = await getCachedFlashcards(userId, metadata.deckIds);
      totalCards = allCards.length;
    }
    
    let cacheAge: string | null = null;
    if (metadata?.lastUpdated) {
      const ageMs = Date.now() - metadata.lastUpdated;
      const ageMinutes = Math.floor(ageMs / 60000);
      const ageHours = Math.floor(ageMinutes / 60);
      const ageDays = Math.floor(ageHours / 24);
      
      if (ageDays > 0) {
        cacheAge = `${ageDays} day(s) ago`;
      } else if (ageHours > 0) {
        cacheAge = `${ageHours} hour(s) ago`;
      } else {
        cacheAge = `${ageMinutes} minute(s) ago`;
      }
    }
    
    const status = {
      hasCache: decks.length > 0 || totalCards > 0,
      deckCount: decks.length,
      cardCount: totalCards,
      lastUpdated: metadata?.lastUpdated || null,
      cacheAge,
    };
    
    logger.log('📊 [Cache Status]:', JSON.stringify(status, null, 2));
    return status;
  } catch (error) {
    logger.error('Error getting cache status:', error);
    return {
      hasCache: false,
      deckCount: 0,
      cardCount: 0,
      lastUpdated: null,
      cacheAge: null,
    };
  }
};

/**
 * Remove a specific deck and its cached cards from local cache
 */
export const removeDeckFromCache = async (userId: string, deckId: string): Promise<void> => {
  try {
    // Remove cached cards for this deck and compute removed count
    const cardsKey = getCardsKey(userId, deckId);
    const existingCardsStr = await AsyncStorage.getItem(cardsKey);
    let removedCount = 0;
    if (existingCardsStr) {
      try {
        const existingCards: Flashcard[] = JSON.parse(existingCardsStr) || [];
        removedCount = Array.isArray(existingCards) ? existingCards.length : 0;
      } catch {
        removedCount = 0;
      }
      await AsyncStorage.removeItem(cardsKey);
    }

    // Remove deck from cached deck list
    const decksKey = getDecksKey(userId);
    const decksStr = await AsyncStorage.getItem(decksKey);
    if (decksStr) {
      try {
        const decks: Deck[] = JSON.parse(decksStr) || [];
        const filtered = decks.filter(d => d.id !== deckId);
        await AsyncStorage.setItem(decksKey, JSON.stringify(filtered));
      } catch (e) {
        logger.error('Error pruning deck from cache:', e);
      }
    }

    // Update metadata
    const metadataKey = getMetadataKey(userId);
    const metadataStr = await AsyncStorage.getItem(metadataKey);
    if (metadataStr) {
      try {
        const metadata: CacheMetadata = JSON.parse(metadataStr);
        metadata.deckIds = (metadata.deckIds || []).filter(id => id !== deckId);
        if (removedCount > 0) {
          metadata.cardCount = Math.max(0, (metadata.cardCount || 0) - removedCount);
        }
        metadata.lastUpdated = Date.now();
        await AsyncStorage.setItem(metadataKey, JSON.stringify(metadata));
      } catch (e) {
        logger.error('Error updating cache metadata for deck removal:', e);
      }
    }

    logger.log(`🧹 [OfflineStorage] Removed deck from cache: ${deckId}`);
  } catch (error) {
    logger.error('Error removing deck from cache:', error);
  }
};

/**
 * Remove a specific flashcard from local cache
 */
export const removeFlashcardFromCache = async (
  userId: string,
  deckId: string,
  cardId: string
): Promise<void> => {
  try {
    const key = getCardsKey(userId, deckId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      try {
        const cards: Flashcard[] = JSON.parse(data) || [];
        const filtered = cards.filter(c => c.id !== cardId);
        await AsyncStorage.setItem(key, JSON.stringify(filtered));
      } catch (e) {
        logger.error('Error parsing cached cards while removing flashcard:', e);
      }
    }

    // Update metadata (best-effort)
    const metadataKey = getMetadataKey(userId);
    const metadataStr = await AsyncStorage.getItem(metadataKey);
    if (metadataStr) {
      try {
        const metadata: CacheMetadata = JSON.parse(metadataStr);
        metadata.cardCount = Math.max(0, (metadata.cardCount || 0) - 1);
        metadata.lastUpdated = Date.now();
        await AsyncStorage.setItem(metadataKey, JSON.stringify(metadata));
      } catch (e) {
        logger.error('Error updating cache metadata for flashcard removal:', e);
      }
    }

    logger.log(`🧹 [OfflineStorage] Removed flashcard from cache: ${cardId}`);
  } catch (error) {
    logger.error('Error removing flashcard from cache:', error);
  }
};

/**
 * Remove a single image mapping from cache (does not delete file)
 */
export const removeImageMapping = async (
  userId: string,
  imageUrl: string
): Promise<void> => {
  try {
    const key = getImageMappingKey(userId);
    const data = await AsyncStorage.getItem(key);
    const mapping = data ? JSON.parse(data) : {};
    if (mapping && mapping[imageUrl]) {
      delete mapping[imageUrl];
      await AsyncStorage.setItem(key, JSON.stringify(mapping));
      logger.log(`🧹 [OfflineStorage] Removed image mapping: ${imageUrl}`);
    }
  } catch (error) {
    logger.error('Error removing image mapping:', error);
  }
};

