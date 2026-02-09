import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flashcard } from '../types/Flashcard';
import { Deck } from '../types/Deck';
import { logger } from '../utils/logger';
import { createDeck as createDeckSupabase, saveFlashcard, uploadImageToStorage } from './supabaseStorage';

const GUEST_FLASHCARDS_KEY = '@guest_flashcards';
const GUEST_DECKS_KEY = '@guest_decks';

/** Guest mode limits (enforced in createLocalDeck and saveLocalFlashcard) */
export const GUEST_MAX_DECKS = 2;
export const GUEST_MAX_CARDS = 20;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isLocalImageUri(uri: string | undefined): boolean {
  return !!uri && (uri.startsWith('file://') || !uri.startsWith('http'));
}

/**
 * Get all guest decks from local storage
 */
export const getLocalDecks = async (): Promise<Deck[]> => {
  try {
    const data = await AsyncStorage.getItem(GUEST_DECKS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Deck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error('[LocalFlashcardStorage] Error getting local decks:', error);
    return [];
  }
};

/**
 * Create a new deck for guest users (local only).
 * Throws if guest already has GUEST_MAX_DECKS decks.
 */
export const createLocalDeck = async (name: string): Promise<Deck> => {
  const decks = await getLocalDecks();
  if (decks.length >= GUEST_MAX_DECKS) {
    const err = new Error('GUEST_LIMIT_DECKS') as Error & { code?: string };
    err.code = 'GUEST_LIMIT_DECKS';
    throw err;
  }
  const now = Date.now();
  const newDeck: Deck = {
    id: generateUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    orderIndex: decks.length,
  };
  decks.push(newDeck);
  await AsyncStorage.setItem(GUEST_DECKS_KEY, JSON.stringify(decks));
  logger.log('[LocalFlashcardStorage] Created local deck:', newDeck.id);
  return newDeck;
};

/**
 * Get or create default deck for guests (mirrors getDecks(createDefaultIfEmpty))
 */
export const getLocalDecksWithDefault = async (): Promise<Deck[]> => {
  let decks = await getLocalDecks();
  if (decks.length === 0) {
    const defaultDeck = await createLocalDeck('Collection 1');
    decks = [defaultDeck];
  }
  return decks;
};

/**
 * Get all guest flashcards from local storage
 */
export const getLocalFlashcards = async (): Promise<Flashcard[]> => {
  try {
    const data = await AsyncStorage.getItem(GUEST_FLASHCARDS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Flashcard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error('[LocalFlashcardStorage] Error getting local flashcards:', error);
    return [];
  }
};

/**
 * Save a flashcard locally for guest users.
 * Throws if guest already has GUEST_MAX_CARDS cards.
 * imageUrl can be a local file URI (file://...) - it will be stored as-is and uploaded on migration.
 */
export const saveLocalFlashcard = async (
  flashcard: Flashcard,
  deckId: string
): Promise<Flashcard> => {
  const cards = await getLocalFlashcards();
  if (cards.length >= GUEST_MAX_CARDS) {
    const err = new Error('GUEST_LIMIT_CARDS') as Error & { code?: string };
    err.code = 'GUEST_LIMIT_CARDS';
    throw err;
  }
  const now = Date.now();
  const newCard: Flashcard = {
    ...flashcard,
    id: generateUUID(),
    deckId,
    createdAt: now,
    box: flashcard.box ?? 1,
    nextReviewDate: flashcard.nextReviewDate ?? new Date(),
  };
  cards.push(newCard);
  await AsyncStorage.setItem(GUEST_FLASHCARDS_KEY, JSON.stringify(cards));
  logger.log('[LocalFlashcardStorage] Saved local flashcard:', newCard.id);
  return newCard;
};

/**
 * Delete a local flashcard by id
 */
export const deleteLocalFlashcard = async (id: string): Promise<boolean> => {
  const cards = await getLocalFlashcards();
  const filtered = cards.filter((c) => c.id !== id);
  if (filtered.length === cards.length) return false;
  await AsyncStorage.setItem(GUEST_FLASHCARDS_KEY, JSON.stringify(filtered));
  logger.log('[LocalFlashcardStorage] Deleted local flashcard:', id);
  return true;
};

/**
 * Update a local flashcard by id (partial update)
 */
export const updateLocalFlashcard = async (
  id: string,
  updates: Partial<Pick<Flashcard, 'originalText' | 'readingsText' | 'translatedText' | 'targetLanguage' | 'imageUrl' | 'scopeAnalysis' | 'box' | 'nextReviewDate'>>
): Promise<Flashcard | null> => {
  const cards = await getLocalFlashcards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  cards[idx] = { ...cards[idx], ...updates };
  await AsyncStorage.setItem(GUEST_FLASHCARDS_KEY, JSON.stringify(cards));
  return cards[idx];
};

/**
 * Move a local flashcard to another deck
 */
export const moveLocalFlashcardToDeck = async (flashcardId: string, toDeckId: string): Promise<boolean> => {
  const cards = await getLocalFlashcards();
  const card = cards.find((c) => c.id === flashcardId);
  if (!card) return false;
  const deckIds = (await getLocalDecks()).map((d) => d.id);
  if (!deckIds.includes(toDeckId)) return false;
  const idx = cards.findIndex((c) => c.id === flashcardId);
  cards[idx] = { ...card, deckId: toDeckId };
  await AsyncStorage.setItem(GUEST_FLASHCARDS_KEY, JSON.stringify(cards));
  return true;
};

/**
 * Update a local deck's name
 */
export const updateLocalDeckName = async (deckId: string, newName: string): Promise<Deck | null> => {
  const decks = await getLocalDecks();
  const idx = decks.findIndex((d) => d.id === deckId);
  if (idx === -1) return null;
  const now = Date.now();
  decks[idx] = { ...decks[idx], name: newName.trim(), updatedAt: now };
  await AsyncStorage.setItem(GUEST_DECKS_KEY, JSON.stringify(decks));
  return decks[idx];
};

/**
 * Delete a local deck and all its flashcards
 */
export const deleteLocalDeck = async (id: string): Promise<boolean> => {
  const [decks, cards] = await Promise.all([getLocalDecks(), getLocalFlashcards()]);
  const newDecks = decks.filter((d) => d.id !== id);
  if (newDecks.length === decks.length) return false;
  const newCards = cards.filter((c) => c.deckId !== id);
  await AsyncStorage.setItem(GUEST_DECKS_KEY, JSON.stringify(newDecks));
  await AsyncStorage.setItem(GUEST_FLASHCARDS_KEY, JSON.stringify(newCards));
  logger.log('[LocalFlashcardStorage] Deleted local deck and its cards:', id);
  return true;
};

/**
 * Reset SRS progress for guest flashcards in the given decks.
 * Sets box=1 and nextReviewDate=today for all cards in deckIds (local only).
 * @param deckIds Deck IDs to reset cards for
 * @returns Number of cards reset
 */
export const resetLocalSRSProgress = async (deckIds: string[]): Promise<number> => {
  if (!deckIds?.length) return 0;
  const deckSet = new Set(deckIds);
  const cards = await getLocalFlashcards();
  const today = new Date();
  let count = 0;
  for (let i = 0; i < cards.length; i++) {
    if (deckSet.has(cards[i].deckId)) {
      cards[i] = { ...cards[i], box: 1, nextReviewDate: today };
      count++;
    }
  }
  if (count > 0) {
    await AsyncStorage.setItem(GUEST_FLASHCARDS_KEY, JSON.stringify(cards));
    logger.log('[LocalFlashcardStorage] Reset SRS for', count, 'guest cards in decks:', deckIds);
  }
  return count;
};

/**
 * Clear all guest data (after migration or logout)
 */
export const clearAllLocalData = async (): Promise<void> => {
  await Promise.all([
    AsyncStorage.removeItem(GUEST_FLASHCARDS_KEY),
    AsyncStorage.removeItem(GUEST_DECKS_KEY),
  ]);
  logger.log('[LocalFlashcardStorage] Cleared all local guest data');
};

/**
 * Check if there is any local data to migrate
 */
export const hasLocalDataToMigrate = async (): Promise<boolean> => {
  const [decks, cards] = await Promise.all([getLocalDecks(), getLocalFlashcards()]);
  return decks.length > 0 || cards.length > 0;
};

/**
 * Migrate guest decks and flashcards to Supabase for the given user.
 * Creates decks, uploads any local images, inserts flashcards, then clears local data.
 */
export const migrateLocalDataToSupabase = async (userId: string): Promise<void> => {
  const localDecks = await getLocalDecks();
  const localCards = await getLocalFlashcards();

  if (localDecks.length === 0 && localCards.length === 0) {
    return;
  }

  const deckIdMap: Record<string, string> = {};

  if (localDecks.length === 0 && localCards.length > 0) {
    const defaultDeck = await createDeckSupabase('Collection 1');
    const uniqueOldDeckIds = [...new Set(localCards.map((c) => c.deckId))];
    for (const oldId of uniqueOldDeckIds) {
      deckIdMap[oldId] = defaultDeck.id;
    }
  }

  for (const deck of localDecks) {
    const created = await createDeckSupabase(deck.name);
    deckIdMap[deck.id] = created.id;
  }

  for (const card of localCards) {
    const newDeckId = deckIdMap[card.deckId];
    if (!newDeckId) continue;

    let imageUrl: string | undefined = card.imageUrl;
    if (imageUrl && isLocalImageUri(imageUrl)) {
      try {
        const uploaded = await uploadImageToStorage(imageUrl);
        imageUrl = uploaded ?? undefined;
      } catch (err) {
        logger.error('[LocalFlashcardStorage] Failed to upload image during migration:', err);
      }
    }

    // Normalize nextReviewDate: from AsyncStorage it may be an ISO string, but saveFlashcard expects a Date
    let nextReviewDate: Date | undefined = card.nextReviewDate;
    if (nextReviewDate != null && typeof (nextReviewDate as any) === 'string') {
      nextReviewDate = new Date(nextReviewDate as unknown as string);
    }
    if (nextReviewDate == null || Number.isNaN((nextReviewDate as Date).getTime())) {
      nextReviewDate = new Date();
    }

    const cardForDb: Flashcard = {
      ...card,
      deckId: newDeckId,
      imageUrl,
      nextReviewDate,
    };
    await saveFlashcard(cardForDb, newDeckId);
  }

  await clearAllLocalData();
  logger.log('[LocalFlashcardStorage] Migration complete for user:', userId);
}
