import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys from flashcardStorage.ts
const FLASHCARDS_STORAGE_KEY = 'kanji_app_flashcards';
const DECKS_STORAGE_KEY = 'kanji_app_decks';

/**
 * Clear all decks and flashcards from AsyncStorage
 * @returns Promise<void>
 */
export const clearFlashcardsAndDecks = async (): Promise<void> => {
  try {
    // Remove decks
    await AsyncStorage.removeItem(DECKS_STORAGE_KEY);
    // Remove flashcards
    await AsyncStorage.removeItem(FLASHCARDS_STORAGE_KEY);
    console.log('Successfully cleared local flashcards and decks from AsyncStorage');
  } catch (error) {
    console.error('Error clearing local storage:', error);
    throw error;
  }
}; 