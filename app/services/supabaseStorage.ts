import { supabase, getCurrentUser } from './supabaseClient';
import { Flashcard } from '../types/Flashcard';
import { Deck } from '../types/Deck';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import { logFlashcardCreation } from './apiUsageLogger';
import { validateImageFile, validateDeckName } from '../utils/inputValidation';
import { isOnline, isNetworkError } from './networkManager';
import { 
  cacheFlashcards, 
  getCachedFlashcards, 
  cacheDecks, 
  getCachedDecks 
} from './offlineStorage';
import { batchCacheImages } from './imageCache';
import { getUserIdOffline } from './offlineAuth';

import { logger } from '../utils/logger';
// Simple UUID generator that doesn't rely on crypto.getRandomValues()
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Get user ID - tries Supabase first, falls back to offline storage
 * This works even when completely offline!
 */
const getUserId = async (): Promise<string | null> => {
  try {
    // Try to get user from Supabase first (works when online)
    const user = await getCurrentUser();
    if (user) {
      return user.id;
    }
  } catch (error) {
    // Supabase failed (probably offline), try offline storage
    logger.log('💾 [getUserId] Supabase failed, trying offline storage...');
  }
  
  // Fallback to offline storage (works when offline!)
  const offlineUserId = await getUserIdOffline();
  if (offlineUserId) {
    logger.log('💾 [getUserId] Using offline user ID');
    return offlineUserId;
  }
  
  logger.log('❌ [getUserId] No user ID available (online or offline)');
  return null;
};

/**
 * Transform database flashcard format to app format
 * @param card Raw flashcard data from database
 * @returns Transformed flashcard object
 */
const transformFlashcard = (card: any): Flashcard => ({
  id: card.id,
  originalText: card.original_text,
  furiganaText: card.furigana_text,
  translatedText: card.translated_text,
  targetLanguage: card.target_language || 'en', // Default to English for backward compatibility
  createdAt: new Date(card.created_at).getTime(),
  deckId: card.deck_id,
  imageUrl: card.image_url || undefined, // Include image URL if available
});

/**
 * Transform array of database flashcards to app format
 * @param cards Raw flashcard data array from database
 * @returns Array of transformed flashcard objects
 */
const transformFlashcards = (cards: any[]): Flashcard[] => cards.map(transformFlashcard);

/**
 * Get all decks for the current user
 * Cache-first strategy: Check cache first, then fetch from network if online
 * @returns Array of decks
 */
export const getDecks = async (createDefaultIfEmpty: boolean = false): Promise<Deck[]> => {
  let userId: string | null = null;
  let online = false;
  
  try {
    // Get user ID (works offline via local storage!)
    userId = await getUserId();
    
    try {
      online = await isOnline();
    } catch (error) {
      logger.error('Error checking online status:', error);
      online = false; // Assume offline if check fails
    }
    
    // CACHE-FIRST STRATEGY: Always check cache first, regardless of network state
    if (userId) {
      try {
        const cachedDecks = await getCachedDecks(userId);
        
        // If we have cached data, return it immediately
        if (cachedDecks.length > 0) {
          logger.log('📦 [Cache-First] Returning cached decks:', cachedDecks.length);
          
          // If online, fetch fresh data in background and update cache
          if (online) {
            logger.log('🔄 [Cache-First] Fetching fresh decks in background...');
            fetchAndCacheDecks(userId, createDefaultIfEmpty).catch(err => {
              logger.error('Failed to fetch fresh decks in background:', err);
            });
          }
          
          return cachedDecks;
        }
      } catch (cacheError) {
        logger.error('Error reading cache:', cacheError);
        // Continue to network fetch if cache read fails
      }
    }
    
    // No cache available - must fetch from network
    if (!online) {
      logger.log('📶 [Offline] No cache available and offline');
      return [];
    }
    
    // Fetch from network (first time or cache miss)
    logger.log('🌐 [Network] Fetching decks from Supabase...');
    return await fetchAndCacheDecks(userId || undefined, createDefaultIfEmpty);
  } catch (error) {
    // Last resort: try cache even if we had an error
    if (isNetworkError(error)) {
      logger.log('📶 [Network Error] Attempting cache fallback in getDecks');
      try {
        // Try to get userId again if we don't have it
        const fallbackUserId = userId || await getUserId();
        if (fallbackUserId) {
          const cachedDecks = await getCachedDecks(fallbackUserId);
          if (cachedDecks.length > 0) {
            logger.log('📶 [Cache Rescue] Returning', cachedDecks.length, 'cached decks after network error');
            return cachedDecks;
          }
        }
      } catch (cacheError) {
        logger.error('Cache fallback also failed:', cacheError);
      }
    }
    
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('Error in getDecks:', error);
    }
    return [];
  }
};

/**
 * Helper function to fetch decks from Supabase and cache them
 * @param userId User ID for caching
 * @param createDefaultIfEmpty Whether to create a default deck if none exist
 * @returns Array of decks
 */
const fetchAndCacheDecks = async (userId?: string, createDefaultIfEmpty: boolean = false): Promise<Deck[]> => {
  // Check online status FIRST - don't attempt Supabase if offline
  const online = await isOnline().catch(() => false);
  if (!online) {
    logger.log('📶 [Offline] Skipping background fetch - offline');
    return [];
  }
  
  try {
    // Try ordering by order_index first (new schema). If the column does not exist yet, fall back to created_at.
    let query = supabase
      .from('decks')
      .select('*');

    // Attempt to order by order_index – if this fails (e.g., column missing) we will catch and retry.
    let { data: decks, error } = await query.order('order_index', { ascending: true, nullsFirst: false });

    if (error) {
      // Silent log for order_index fallback
      ({ data: decks, error } = await supabase
        .from('decks')
        .select('*')
        .order('created_at', { ascending: false }));
      if (error) {
        // Don't log network errors
        if (!isNetworkError(error)) {
          logger.error('Error fetching decks:', error.message);
        }
        throw error;
      }
    }
    
    // Create a default deck if requested and no decks exist
    if (createDefaultIfEmpty && (!decks || decks.length === 0)) {
      logger.log('No decks found, creating default deck');
      const defaultDeck = await createDeck('Collection 1');
      return [defaultDeck];
    }
    
    // Ensure we have an array to map over
    const deckList = decks || [];

    // Transform from database format to app format, including orderIndex if present
    const transformedDecks = deckList.map((deck: any) => ({
      id: deck.id,
      name: deck.name,
      createdAt: new Date(deck.created_at).getTime(),
      updatedAt: new Date(deck.updated_at).getTime(),
      orderIndex: deck.order_index ?? undefined,
    }));
    
    // Cache decks for offline use
    if (userId && transformedDecks.length > 0) {
      cacheDecks(userId, transformedDecks).catch(err => 
        logger.error('Failed to cache decks:', err)
      );
    }
    
    return transformedDecks;
  } catch (error) {
    // If this is a network error and we have a userId, try to return cached decks
    if (isNetworkError(error) && userId) {
      logger.log('📶 [Network Error] Fetching decks failed, attempting to return cached decks');
      try {
        const cachedDecks = await getCachedDecks(userId);
        if (cachedDecks.length > 0) {
          logger.log('📶 [Cache Fallback] Returning', cachedDecks.length, 'cached decks');
          return cachedDecks;
        }
      } catch (cacheError) {
        logger.error('Failed to retrieve cached decks:', cacheError);
      }
    }
    
    // If not a network error or cache fallback failed, throw the error
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('fetchAndCacheDecks failed:', error);
    }
    throw error;
  }
};

/**
 * Create a new deck
 * @param name The name of the deck
 * @returns The created deck
 */
export const createDeck = async (name: string): Promise<Deck> => {
  try {
    // Validate deck name
    const validation = validateDeckName(name);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Let Supabase generate the UUID on the server when possible
    // Only generate locally if needed for specific use cases
    const newDeck = {
      name: name.trim(), // Trim whitespace
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('decks')
      .insert(newDeck)
      .select()
      .single();
    
    if (error) {
      logger.error('Error creating deck:', error.message);
      throw error;
    }
    
    // Transform from database format to app format
    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  } catch (error) {
    logger.error('Error creating deck:', error);
    throw error;
  }
};

/**
 * Initialize decks if they don't exist (legacy function - kept for compatibility)
 * @deprecated Use getDecks(true) instead which creates a default deck if needed
 */
export const initializeDecks = async (): Promise<void> => {
  try {
    // Simply delegate to getDecks with createDefaultIfEmpty=true
    await getDecks(true);
  } catch (error) {
    logger.error('Error initializing decks:', error);
  }
};

/**
 * Upload an image to Supabase Storage and return the URL
 * @param imageUri Local URI of the image to upload
 * @returns URL of the uploaded image
 */
export const uploadImageToStorage = async (imageUri: string): Promise<string | null> => {
  try {
    logger.log('Uploading image to storage:', imageUri);
    
    // Validate image before upload (security + cost protection)
    const validation = await validateImageFile(imageUri, async (uri: string) => {
      const info = await FileSystem.getInfoAsync(uri);
      return { size: info.exists ? info.size : undefined };
    });
    
    if (!validation.isValid) {
      logger.error('Image validation failed:', validation.error);
      // Throw error with specific message so it can be caught and displayed
      throw new Error(validation.error);
    }
    
    // Generate a unique filename for the image
    const fileExt = imageUri.split('.').pop();
    const fileName = `${generateUUID()}.${fileExt}`;
    const filePath = `flashcard-images/${fileName}`;
    
    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // Convert base64 to ArrayBuffer
    const arrayBuffer = decode(base64);
    
    // Upload to Supabase Storage
    const { data, error } = await supabase
      .storage
      .from('flashcards')  // Make sure this bucket exists in your Supabase project
      .upload(filePath, arrayBuffer, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });
    
    if (error) {
      logger.error('Error uploading image:', error.message);
      throw new Error('Failed to upload image to storage.');
    }
    
    // Get public URL for the uploaded image
    const { data: { publicUrl } } = supabase
      .storage
      .from('flashcards')
      .getPublicUrl(filePath);
    
    logger.log('Image uploaded successfully, URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    logger.error('Error uploading image:', error);
    // Re-throw to preserve error message for user display
    throw error;
  }
};

/**
 * Delete an image from Supabase Storage
 * @param imageUrl URL of the image to delete
 * @returns True if deleted successfully, false otherwise
 */
export const deleteImageFromStorage = async (imageUrl: string): Promise<boolean> => {
  try {
    // Extract the file path from the URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = `flashcard-images/${fileName}`;
    
    const { error } = await supabase
      .storage
      .from('flashcards')
      .remove([filePath]);
    
    if (error) {
      logger.error('Error deleting image:', error.message);
      return false;
    }
    
    logger.log('Image deleted successfully');
    return true;
  } catch (error) {
    logger.error('Error deleting image:', error);
    return false;
  }
};

/**
 * Save a flashcard to the database
 * @param flashcard The flashcard to save
 * @param deckId The ID of the deck to save the flashcard to
 */
export const saveFlashcard = async (flashcard: Flashcard, deckId: string): Promise<void> => {
  try {
    const newFlashcard = {
      // Let Supabase generate the UUID automatically
      original_text: flashcard.originalText,
      furigana_text: flashcard.furiganaText,
      translated_text: flashcard.translatedText,
      target_language: flashcard.targetLanguage,
      created_at: new Date().toISOString(),
      deck_id: deckId,
      image_url: flashcard.imageUrl || null, // Include image URL if available
    };
    
    const { error } = await supabase
      .from('flashcards')
      .insert(newFlashcard);
    
    if (error) {
      logger.error('Error saving flashcard:', error.message);
      throw error;
    }
    
    logger.log('Flashcard saved successfully to deck:', deckId);
    
    // Log successful flashcard creation
    await logFlashcardCreation(true, {
      deckId,
      originalTextLength: flashcard.originalText.length,
      targetLanguage: flashcard.targetLanguage,
      hasImage: !!flashcard.imageUrl,
      hasFurigana: !!flashcard.furiganaText
    });
    
    // Import the flashcard counter hook dynamically to avoid circular dependencies
    // This will be handled in the component that calls saveFlashcard instead
    // to keep the service layer clean
    
  } catch (error) {
    logger.error('Error saving flashcard:', error);
    
    // Log failed flashcard creation
    await logFlashcardCreation(false, {
      deckId,
      originalTextLength: flashcard.originalText.length,
      targetLanguage: flashcard.targetLanguage,
      hasImage: !!flashcard.imageUrl,
      hasFurigana: !!flashcard.furiganaText,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
};

/**
 * Get all saved flashcards
 * Cache-first strategy: Check cache first, then fetch from network if online
 * @returns Array of saved flashcards
 */
export const getFlashcards = async (): Promise<Flashcard[]> => {
  let userId: string | null = null;
  let online = false;
  
  try {
    // Get user ID (works offline via local storage!)
    userId = await getUserId();
    
    try {
      online = await isOnline();
    } catch (error) {
      logger.error('Error checking online status:', error);
      online = false;
    }
    
    // CACHE-FIRST STRATEGY: Always check cache first, regardless of network state
    if (userId) {
      try {
        // Get all decks to know which caches to check
        const decks = await getCachedDecks(userId);
        const deckIds = decks.map(d => d.id);
        
        if (deckIds.length > 0) {
          const cachedCards = await getCachedFlashcards(userId, deckIds);
          
          // If we have cached data, return it immediately
          if (cachedCards.length > 0) {
            logger.log('📦 [Cache-First] Returning all cached flashcards:', cachedCards.length);
            
            // If online, fetch fresh data in background and update cache
            if (online) {
              logger.log('🔄 [Cache-First] Fetching fresh flashcards in background...');
              fetchAndCacheAllFlashcards(userId).catch(err => {
                logger.error('Failed to fetch fresh flashcards in background:', err);
              });
            }
            
            return cachedCards;
          }
        }
      } catch (cacheError) {
        logger.error('Error reading cache:', cacheError);
      }
    }
    
    // No cache available - must fetch from network
    if (!online) {
      logger.log('📶 [Offline] No cache available and offline');
      return [];
    }
    
    // Fetch from network (first time or cache miss)
    logger.log('🌐 [Network] Fetching all flashcards from Supabase...');
    return await fetchAndCacheAllFlashcards(userId || undefined);
  } catch (error) {
    // Last resort: try cache even if we had an error
    if (isNetworkError(error)) {
      logger.log('📶 [Network Error] Attempting cache fallback in getFlashcards');
      try {
        // Try to get userId again if we don't have it
        const fallbackUserId = userId || await getUserId();
        if (fallbackUserId) {
          const decks = await getCachedDecks(fallbackUserId);
          const deckIds = decks.map(d => d.id);
          if (deckIds.length > 0) {
            const cachedCards = await getCachedFlashcards(fallbackUserId, deckIds);
            if (cachedCards.length > 0) {
              logger.log('📶 [Cache Rescue] Returning', cachedCards.length, 'cached flashcards after network error');
              return cachedCards;
            }
          }
        }
      } catch (cacheError) {
        logger.error('Cache fallback also failed:', cacheError);
      }
    }
    
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('Error in getFlashcards:', error);
    }
    return [];
  }
};

/**
 * Helper function to fetch all flashcards from Supabase and cache them
 * @param userId User ID for caching
 * @returns Array of flashcards
 */
const fetchAndCacheAllFlashcards = async (userId?: string): Promise<Flashcard[]> => {
  // Check online status FIRST - don't attempt Supabase if offline
  const online = await isOnline().catch(() => false);
  if (!online) {
    logger.log('📶 [Offline] Skipping background fetch - offline');
    return [];
  }
  
  try {
    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      // Don't log network errors
      if (!isNetworkError(error)) {
        logger.error('Error fetching all flashcards:', error.message);
      }
      throw error;
    }
    
    // Transform from database format to app format
    const transformedCards = transformFlashcards(flashcards || []);
    
    // Cache flashcards for offline use (grouped by deck)
    if (userId && transformedCards.length > 0) {
      // Group cards by deck and cache separately
      const cardsByDeck = new Map<string, Flashcard[]>();
      
      for (const card of transformedCards) {
        if (!cardsByDeck.has(card.deckId)) {
          cardsByDeck.set(card.deckId, []);
        }
        cardsByDeck.get(card.deckId)!.push(card);
      }
      
      // Cache each deck's cards
      for (const [deckId, cards] of cardsByDeck) {
        cacheFlashcards(userId, deckId, cards).catch(err =>
          logger.error(`Failed to cache cards for deck ${deckId}:`, err)
        );
      }
      
      // Extract image URLs and cache images in background
      const imageUrls = transformedCards
        .filter(card => card.imageUrl)
        .map(card => card.imageUrl!);
      
      if (imageUrls.length > 0) {
        // Don't await - cache images in background
        batchCacheImages(userId, imageUrls).catch(err =>
          logger.error('Failed to batch cache images:', err)
        );
      }
    }
    
    return transformedCards;
  } catch (error) {
    // If this is a network error and we have a userId, try to return cached flashcards
    if (isNetworkError(error) && userId) {
      logger.log('📶 [Network Error] Fetching all flashcards failed, attempting to return cached flashcards');
      try {
        const decks = await getCachedDecks(userId);
        const deckIds = decks.map(d => d.id);
        if (deckIds.length > 0) {
          const cachedCards = await getCachedFlashcards(userId, deckIds);
          if (cachedCards.length > 0) {
            logger.log('📶 [Cache Fallback] Returning', cachedCards.length, 'cached flashcards');
            return cachedCards;
          }
        }
      } catch (cacheError) {
        logger.error('Failed to retrieve cached flashcards:', cacheError);
      }
    }
    
    // If not a network error or cache fallback failed, throw the error
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('fetchAndCacheAllFlashcards failed:', error);
    }
    throw error;
  }
};

/**
 * Get flashcards by deck ID
 * Cache-first strategy: Check cache first, then fetch from network if online
 * @param deckId The ID of the deck to get flashcards for
 * @returns Array of flashcards in the specified deck
 */
export const getFlashcardsByDeck = async (deckId: string): Promise<Flashcard[]> => {
  let userId: string | null = null;
  let online = false;
  
  try {
    // Get user ID (works offline via local storage!)
    userId = await getUserId();
    
    try {
      online = await isOnline();
    } catch (error) {
      logger.error('Error checking online status:', error);
      online = false;
    }
    
    // CACHE-FIRST STRATEGY: Always check cache first, regardless of network state
    if (userId) {
      try {
        const cachedCards = await getCachedFlashcards(userId, [deckId]);
        
        // If we have cached data, return it immediately
        if (cachedCards.length > 0) {
          logger.log('📦 [Cache-First] Returning cached flashcards for deck:', deckId, 'count:', cachedCards.length);
          
          // If online, fetch fresh data in background and update cache
          if (online) {
            logger.log('🔄 [Cache-First] Fetching fresh flashcards in background...');
            fetchAndCacheFlashcardsByDeck(userId, deckId).catch(err => {
              logger.error('Failed to fetch fresh flashcards in background:', err);
            });
          }
          
          return cachedCards;
        }
      } catch (cacheError) {
        logger.error('Error reading cache:', cacheError);
      }
    }
    
    // No cache available - must fetch from network
    if (!online) {
      logger.log('📶 [Offline] No cache available and offline for deck:', deckId);
      return [];
    }
    
    // Fetch from network (first time or cache miss)
    logger.log('🌐 [Network] Fetching flashcards from Supabase for deck:', deckId);
    return await fetchAndCacheFlashcardsByDeck(userId || undefined, deckId);
  } catch (error) {
    // Last resort: try cache even if we had an error
    if (isNetworkError(error)) {
      logger.log('📶 [Network Error] Attempting cache fallback in getFlashcardsByDeck');
      try {
        // Try to get userId again if we don't have it
        const fallbackUserId = userId || await getUserId();
        if (fallbackUserId) {
          const cachedCards = await getCachedFlashcards(fallbackUserId, [deckId]);
          if (cachedCards.length > 0) {
            logger.log('📶 [Cache Rescue] Returning', cachedCards.length, 'cached flashcards after network error');
            return cachedCards;
          }
        }
      } catch (cacheError) {
        logger.error('Cache fallback also failed:', cacheError);
      }
    }
    
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('Error in getFlashcardsByDeck:', error);
    }
    return [];
  }
};

/**
 * Helper function to fetch flashcards from Supabase and cache them
 * @param userId User ID for caching
 * @param deckId Deck ID to fetch flashcards for
 * @returns Array of flashcards
 */
const fetchAndCacheFlashcardsByDeck = async (userId?: string, deckId?: string): Promise<Flashcard[]> => {
  if (!deckId) return [];
  
  // Check online status FIRST - don't attempt Supabase if offline
  const online = await isOnline().catch(() => false);
  if (!online) {
    logger.log('📶 [Offline] Skipping background fetch - offline');
    return [];
  }
  
  try {
    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false });
    
    if (error) {
      // Don't log network errors
      if (!isNetworkError(error)) {
        logger.error('Error fetching flashcards by deck:', error.message);
      }
      throw error;
    }
    
    // Transform from database format to app format
    const transformedCards = transformFlashcards(flashcards || []);
    
    // Cache flashcards for offline use
    if (userId && transformedCards.length > 0) {
      cacheFlashcards(userId, deckId, transformedCards).catch(err =>
        logger.error('Failed to cache cards for deck:', err)
      );
      
      // Extract image URLs and cache images in background
      const imageUrls = transformedCards
        .filter(card => card.imageUrl)
        .map(card => card.imageUrl!);
      
      if (imageUrls.length > 0) {
        // Don't await - cache images in background
        batchCacheImages(userId, imageUrls).catch(err =>
          logger.error('Failed to batch cache images:', err)
        );
      }
    }
    
    return transformedCards;
  } catch (error) {
    // If this is a network error and we have a userId, try to return cached flashcards
    if (isNetworkError(error) && userId && deckId) {
      logger.log('📶 [Network Error] Fetching flashcards for deck failed, attempting to return cached flashcards');
      try {
        const cachedCards = await getCachedFlashcards(userId, [deckId]);
        if (cachedCards.length > 0) {
          logger.log('📶 [Cache Fallback] Returning', cachedCards.length, 'cached flashcards for deck');
          return cachedCards;
        }
      } catch (cacheError) {
        logger.error('Failed to retrieve cached flashcards for deck:', cacheError);
      }
    }
    
    // If not a network error or cache fallback failed, throw the error
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('fetchAndCacheFlashcardsByDeck failed:', error);
    }
    throw error;
  }
};

/**
 * Get flashcards by multiple deck IDs
 * Cache-first strategy: Check cache first, then fetch from network if online
 * @param deckIds Array of deck IDs to get flashcards for
 * @returns Array of flashcards in the specified decks
 */
export const getFlashcardsByDecks = async (deckIds: string[]): Promise<Flashcard[]> => {
  if (!deckIds || deckIds.length === 0) {
    return [];
  }

  let userId: string | null = null;
  let online = false;
  
  try {
    // Get user ID (works offline via local storage!)
    userId = await getUserId();
    
    try {
      online = await isOnline();
    } catch (error) {
      logger.error('Error checking online status:', error);
      online = false;
    }
    
    // CACHE-FIRST STRATEGY: Always check cache first, regardless of network state
    if (userId) {
      try {
        const cachedCards = await getCachedFlashcards(userId, deckIds);
        
        // If we have cached data, return it immediately
        if (cachedCards.length > 0) {
          logger.log('📦 [Cache-First] Returning cached flashcards for', deckIds.length, 'decks, count:', cachedCards.length);
          
          // If online, fetch fresh data in background and update cache
          if (online) {
            logger.log('🔄 [Cache-First] Fetching fresh flashcards for decks in background...');
            fetchAndCacheFlashcardsByDecks(userId, deckIds).catch(err => {
              logger.error('Failed to fetch fresh flashcards for decks in background:', err);
            });
          }
          
          return cachedCards;
        }
      } catch (cacheError) {
        logger.error('Error reading cache:', cacheError);
      }
    }
    
    // No cache available - must fetch from network
    if (!online) {
      logger.log('📶 [Offline] No cache available and offline for decks:', deckIds.length);
      return [];
    }
    
    // Fetch from network (first time or cache miss)
    logger.log('🌐 [Network] Fetching flashcards from Supabase for', deckIds.length, 'decks');
    return await fetchAndCacheFlashcardsByDecks(userId || undefined, deckIds);
  } catch (error) {
    // Last resort: try cache even if we had an error
    if (isNetworkError(error)) {
      logger.log('📶 [Network Error] Attempting cache fallback in getFlashcardsByDecks');
      try {
        // Try to get userId again if we don't have it
        const fallbackUserId = userId || await getUserId();
        if (fallbackUserId) {
          const cachedCards = await getCachedFlashcards(fallbackUserId, deckIds);
          if (cachedCards.length > 0) {
            logger.log('📶 [Cache Rescue] Returning', cachedCards.length, 'cached flashcards after network error');
            return cachedCards;
          }
        }
      } catch (cacheError) {
        logger.error('Cache fallback also failed:', cacheError);
      }
    }
    
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('Error in getFlashcardsByDecks:', error);
    }
    return [];
  }
};

/**
 * Helper function to fetch flashcards for multiple decks from Supabase and cache them
 * @param userId User ID for caching
 * @param deckIds Array of deck IDs
 * @returns Array of flashcards
 */
const fetchAndCacheFlashcardsByDecks = async (userId?: string, deckIds?: string[]): Promise<Flashcard[]> => {
  if (!deckIds || deckIds.length === 0) return [];
  
  // Check online status FIRST - don't attempt Supabase if offline
  const online = await isOnline().catch(() => false);
  if (!online) {
    logger.log('📶 [Offline] Skipping background fetch - offline');
    return [];
  }
  
  try {
    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*')
      .in('deck_id', deckIds)
      .order('created_at', { ascending: false });
    
    if (error) {
      // Don't log network errors
      if (!isNetworkError(error)) {
        logger.error('Error fetching flashcards by decks:', error.message);
      }
      throw error;
    }
    
    // Transform from database format to app format
    const transformedCards = transformFlashcards(flashcards || []);
    
    // Cache flashcards for offline use (per deck)
    if (userId && transformedCards.length > 0) {
      // Group cards by deck and cache separately
      const cardsByDeck = new Map<string, Flashcard[]>();
      
      for (const card of transformedCards) {
        if (!cardsByDeck.has(card.deckId)) {
          cardsByDeck.set(card.deckId, []);
        }
        cardsByDeck.get(card.deckId)!.push(card);
      }
      
      // Cache each deck's cards
      for (const [deckId, cards] of cardsByDeck) {
        cacheFlashcards(userId, deckId, cards).catch(err =>
          logger.error(`Failed to cache cards for deck ${deckId}:`, err)
        );
      }
      
      // Extract image URLs and cache images in background
      const imageUrls = transformedCards
        .filter(card => card.imageUrl)
        .map(card => card.imageUrl!);
      
      if (imageUrls.length > 0) {
        // Don't await - cache images in background
        batchCacheImages(userId, imageUrls).catch(err =>
          logger.error('Failed to batch cache images:', err)
        );
      }
    }
    
    return transformedCards;
  } catch (error) {
    // If this is a network error and we have a userId, try to return cached flashcards
    if (isNetworkError(error) && userId && deckIds && deckIds.length > 0) {
      logger.log('📶 [Network Error] Fetching flashcards for decks failed, attempting to return cached flashcards');
      try {
        const cachedCards = await getCachedFlashcards(userId, deckIds);
        if (cachedCards.length > 0) {
          logger.log('📶 [Cache Fallback] Returning', cachedCards.length, 'cached flashcards for decks');
          return cachedCards;
        }
      } catch (cacheError) {
        logger.error('Failed to retrieve cached flashcards for decks:', cacheError);
      }
    }
    
    // If not a network error or cache fallback failed, throw the error
    // Don't log network errors
    if (!isNetworkError(error)) {
      logger.error('fetchAndCacheFlashcardsByDecks failed:', error);
    }
    throw error;
  }
};

/**
 * Get a flashcard by ID
 * @param id The ID of the flashcard to get
 * @returns The flashcard if found, null otherwise
 */
export const getFlashcardById = async (id: string): Promise<Flashcard | null> => {
  try {
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      logger.error('Error fetching flashcard by ID:', error.message);
      return null;
    }
    
    // Transform from database format to app format
    return transformFlashcard(data);
  } catch (error) {
    logger.error('Error getting flashcard by ID:', error);
    return null;
  }
};

/**
 * Delete a flashcard by ID
 * @param id The ID of the flashcard to delete
 * @returns True if deleted successfully, false otherwise
 */
export const deleteFlashcard = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', id);
    
    if (error) {
      logger.error('Error deleting flashcard:', error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error deleting flashcard:', error);
    return false;
  }
};

/**
 * Delete a deck by ID and optionally its flashcards
 * @param deckId The ID of the deck to delete
 * @param deleteFlashcards Whether to delete the flashcards in the deck
 * @returns True if deleted successfully, false otherwise
 */
export const deleteDeck = async (deckId: string, deleteFlashcards: boolean = true): Promise<boolean> => {
  try {
    // Delete flashcards in the deck if requested
    if (deleteFlashcards) {
      const { error: flashcardsError } = await supabase
        .from('flashcards')
        .delete()
        .eq('deck_id', deckId);
      
      if (flashcardsError) {
        logger.error('Error deleting flashcards in deck:', flashcardsError.message);
        return false;
      }
    }
    
    // Delete the deck
    const { error: deckError } = await supabase
      .from('decks')
      .delete()
      .eq('id', deckId);
    
    if (deckError) {
      logger.error('Error deleting deck:', deckError.message);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error deleting deck:', error);
    return false;
  }
};

/**
 * Update a deck's name
 * @param deckId The ID of the deck to update
 * @param newName The new name for the deck
 * @returns The updated deck if successful, null otherwise
 */
export const updateDeckName = async (deckId: string, newName: string): Promise<Deck | null> => {
  try {
    // Validate deck name
    const validation = validateDeckName(newName);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const { data, error } = await supabase
      .from('decks')
      .update({ 
        name: newName.trim(), // Trim whitespace
        updated_at: new Date().toISOString()
      })
      .eq('id', deckId)
      .select()
      .single();
    
    if (error) {
      logger.error('Error updating deck name:', error.message);
      return null;
    }
    
    // Transform from database format to app format
    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  } catch (error) {
    logger.error('Error updating deck name:', error);
    return null;
  }
};

/**
 * Update a deck's order_index
 * @param deckId The ID of the deck to update
 * @param newOrderIndex The new order_index for the deck
 * @returns The updated deck if successful, null otherwise
 */
export const updateDeckOrder = async (deckId: string, newOrderIndex: number): Promise<Deck | null> => {
  try {
    const { data, error } = await supabase
      .from('decks')
      .update({ 
        order_index: newOrderIndex
      })
      .eq('id', deckId)
      .select()
      .single();
    
    if (error) {
      logger.error('Error updating deck order:', error.message);
      return null;
    }
    
    // Transform from database format to app format
    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  } catch (error) {
    logger.error('Error updating deck order:', error);
    return null;
  }
};

/**
 * Move a flashcard to a different deck
 * @param flashcardId The ID of the flashcard to move
 * @param targetDeckId The ID of the target deck
 * @returns True if moved successfully, false otherwise
 */
export const moveFlashcardToDeck = async (flashcardId: string, targetDeckId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('flashcards')
      .update({ 
        deck_id: targetDeckId
      })
      .eq('id', flashcardId);
    
    if (error) {
      logger.error('Error moving flashcard to deck:', error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error moving flashcard to deck:', error);
    return false;
  }
};

/**
 * Update a flashcard
 * @param flashcard The flashcard to update
 * @returns True if updated successfully, false otherwise
 */
export const updateFlashcard = async (flashcard: Flashcard): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('flashcards')
      .update({
        original_text: flashcard.originalText,
        furigana_text: flashcard.furiganaText,
        translated_text: flashcard.translatedText,
        target_language: flashcard.targetLanguage,
        image_url: flashcard.imageUrl || null, // Include image URL in update
      })
      .eq('id', flashcard.id);
    
    if (error) {
      logger.error('Error updating flashcard:', error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error updating flashcard:', error);
    return false;
  }
};

// Add default export to satisfy Expo Router's requirement
export default {
  getDecks,
  createDeck,
  initializeDecks,
  saveFlashcard,
  getFlashcards,
  getFlashcardsByDeck,
  getFlashcardsByDecks,
  getFlashcardById,
  deleteFlashcard,
  deleteDeck,
  updateDeckName,
  updateDeckOrder,
  moveFlashcardToDeck,
  updateFlashcard
}; 