import { onNetworkChange, isOnline, isNetworkError } from './networkManager';
import { logger } from '../utils/logger';
import { supabase, getCurrentUser } from './supabaseClient';
import { cacheDecks, cacheFlashcards } from './offlineStorage';
import { batchCacheImages } from './imageCache';
import { Deck } from '../types/Deck';
import { Flashcard } from '../types/Flashcard';

/**
 * Sync Manager Service
 * Handles background synchronization when network becomes available
 */

let isSyncing = false;
let syncCallbacks: Array<() => Promise<void>> = [];
let syncStatusCallbacks: Array<(status: boolean) => void> = [];

/**
 * Register a sync callback to be called when network becomes available
 */
export const registerSyncCallback = (callback: () => Promise<void>): void => {
  syncCallbacks.push(callback);
};

/**
 * Unregister a sync callback
 */
export const unregisterSyncCallback = (callback: () => Promise<void>): void => {
  syncCallbacks = syncCallbacks.filter(cb => cb !== callback);
};

/**
 * Register a callback to be notified of sync status changes
 */
export const onSyncStatusChange = (callback: (isSyncing: boolean) => void): (() => void) => {
  syncStatusCallbacks.push(callback);
  
  // Return unsubscribe function
  return () => {
    syncStatusCallbacks = syncStatusCallbacks.filter(cb => cb !== callback);
  };
};

/**
 * Notify all sync status listeners
 */
const notifySyncStatus = (status: boolean) => {
  for (const callback of syncStatusCallbacks) {
    try {
      callback(status);
    } catch (error) {
      logger.error('Error in sync status callback:', error);
    }
  }
};

/**
 * Check if sync is currently in progress
 */
export const getIsSyncing = (): boolean => {
  return isSyncing;
};

/**
 * Transform database flashcard format to app format
 */
const transformFlashcard = (card: any): Flashcard => ({
  id: card.id,
  originalText: card.original_text,
  furiganaText: card.furigana_text,
  translatedText: card.translated_text,
  targetLanguage: card.target_language || 'en',
  createdAt: new Date(card.created_at).getTime(),
  deckId: card.deck_id,
  imageUrl: card.image_url || undefined,
});

/**
 * Sync all user data (decks and flashcards) to local cache
 * This is the comprehensive sync function that proactively caches everything
 */
export const syncAllUserData = async (): Promise<boolean> => {
  // Prevent concurrent syncs
  if (isSyncing) {
    logger.log('🔄 [SyncManager] Sync already in progress, skipping');
    return false;
  }
  
  // Pre-flight checks BEFORE setting sync status
  const user = await getCurrentUser();
  if (!user) {
    logger.log('⚠️ [SyncManager] No authenticated user, skipping sync');
    return false;
  }
  
  const online = await isOnline();
  if (!online) {
    logger.log('📶 [SyncManager] Offline, skipping sync');
    return false;
  }
  
  // Only set syncing status if we're actually going to sync
  try {
    isSyncing = true;
    notifySyncStatus(true);
    logger.log('🔄 [SyncManager] Starting comprehensive data sync...');

    
    // Double-check we're still online before Supabase query
    const stillOnline = await isOnline().catch(() => false);
    if (!stillOnline) {
      logger.log('📶 [SyncManager] Went offline during sync, aborting');
      return false;
    }
    
    // Fetch all decks
    logger.log('🔄 [SyncManager] Fetching decks...');
    const { data: decksData, error: decksError } = await supabase
      .from('decks')
      .select('*')
      .order('order_index', { ascending: true, nullsFirst: false });
    
    if (decksError) {
      if (isNetworkError(decksError)) {
        logger.log('📶 [SyncManager] Network error fetching decks (offline)');
      } else {
        logger.error('❌ [SyncManager] Error fetching decks:', decksError.message);
      }
      return false;
    }
    
    const decks: Deck[] = (decksData || []).map((deck: any) => ({
      id: deck.id,
      name: deck.name,
      createdAt: new Date(deck.created_at).getTime(),
      updatedAt: new Date(deck.updated_at).getTime(),
      orderIndex: deck.order_index ?? undefined,
    }));
    
    logger.log(`✅ [SyncManager] Fetched ${decks.length} decks`);
    
    // Cache decks
    if (decks.length > 0) {
      await cacheDecks(user.id, decks);
      logger.log(`💾 [SyncManager] Cached ${decks.length} decks successfully for user: ${user.id.substring(0, 8)}...`);
      logger.log(`📋 [SyncManager] Deck names: ${decks.map(d => d.name).join(', ')}`);
    } else {
      logger.log('⚠️ [SyncManager] No decks to cache');
    }
    
    // Fetch all flashcards
    logger.log('🔄 [SyncManager] Fetching flashcards...');
    const { data: flashcardsData, error: flashcardsError } = await supabase
      .from('flashcards')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (flashcardsError) {
      if (isNetworkError(flashcardsError)) {
        logger.log('📶 [SyncManager] Network error fetching flashcards (offline)');
      } else {
        logger.error('❌ [SyncManager] Error fetching flashcards:', flashcardsError.message);
      }
      return false;
    }
    
    const allFlashcards = (flashcardsData || []).map(transformFlashcard);
    logger.log(`✅ [SyncManager] Fetched ${allFlashcards.length} flashcards from Supabase`);
    
    // Group flashcards by deck and cache
    const flashcardsByDeck = new Map<string, Flashcard[]>();
    for (const card of allFlashcards) {
      if (!flashcardsByDeck.has(card.deckId)) {
        flashcardsByDeck.set(card.deckId, []);
      }
      flashcardsByDeck.get(card.deckId)!.push(card);
    }
    
    // Cache flashcards for each deck
    let totalCachedCards = 0;
    for (const [deckId, cards] of flashcardsByDeck) {
      await cacheFlashcards(user.id, deckId, cards);
      totalCachedCards += cards.length;
      const deckName = decks.find(d => d.id === deckId)?.name || 'Unknown';
      logger.log(`💾 [SyncManager] Cached ${cards.length} cards for deck "${deckName}" (${deckId.substring(0, 8)}...)`);
    }
    logger.log(`✅ [SyncManager] Total cached: ${totalCachedCards} flashcards across ${flashcardsByDeck.size} decks`);
    
    // Collect all image URLs for batch caching
    const imageUrls = allFlashcards
      .filter(card => card.imageUrl)
      .map(card => card.imageUrl!);
    
    if (imageUrls.length > 0) {
      logger.log(`🖼️ [SyncManager] Starting batch image cache for ${imageUrls.length} images...`);
      // Don't await - let images cache in background
      batchCacheImages(user.id, imageUrls).catch(err =>
        logger.error('Failed to batch cache images during sync:', err)
      );
    }
    
    logger.log('✅ [SyncManager] Comprehensive data sync complete');
    return true;
  } catch (error) {
    logger.error('❌ [SyncManager] Error during comprehensive sync:', error);
    return false;
  } finally {
    isSyncing = false;
    notifySyncStatus(false);
  }
};

/**
 * Trigger sync manually
 */
export const triggerSync = async (): Promise<void> => {
  if (isSyncing) {
    logger.log('🔄 [SyncManager] Sync already in progress, skipping');
    return;
  }

  isSyncing = true;
  logger.log('🔄 [SyncManager] Starting sync...');

  try {
    // First, do comprehensive data sync
    await syncAllUserData();
    
    // Then execute all registered sync callbacks
    for (const callback of syncCallbacks) {
      try {
        await callback();
      } catch (error) {
        logger.error('Sync callback error:', error);
        // Continue with other callbacks even if one fails
      }
    }
    
    logger.log('✅ [SyncManager] Sync complete');
  } catch (error) {
    logger.error('Error during sync:', error);
  } finally {
    isSyncing = false;
  }
};

/**
 * Initialize sync manager
 * Sets up network listener to auto-sync when online
 */
export const initializeSyncManager = (): (() => void) => {
  logger.log('🔄 [SyncManager] Initializing...');
  
  let previousState = true; // Assume online initially
  
  const unsubscribe = onNetworkChange((isConnected) => {
    // Only trigger sync when transitioning from offline to online
    if (isConnected && !previousState) {
      logger.log('🔄 [SyncManager] Network restored, triggering sync');
      
      // Add a small delay to ensure connection is stable
      setTimeout(() => {
        triggerSync();
      }, 1000);
    }
    
    previousState = isConnected;
  });

  return unsubscribe;
};

