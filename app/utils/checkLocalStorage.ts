import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys from flashcardStorage.ts
const FLASHCARDS_STORAGE_KEY = 'kanji_app_flashcards';
const DECKS_STORAGE_KEY = 'kanji_app_decks';

/**
 * Check if there are any decks or flashcards in AsyncStorage
 * @returns Promise<{hasDecks: boolean, hasFlashcards: boolean}>
 */
export const checkLocalStorage = async (): Promise<{hasDecks: boolean, hasFlashcards: boolean}> => {
  try {
    // Check for decks
    const decksJson = await AsyncStorage.getItem(DECKS_STORAGE_KEY);
    const hasDecks = !!decksJson && JSON.parse(decksJson).length > 0;
    
    // Check for flashcards
    const flashcardsJson = await AsyncStorage.getItem(FLASHCARDS_STORAGE_KEY);
    const hasFlashcards = !!flashcardsJson && JSON.parse(flashcardsJson).length > 0;
    
    console.log('Local storage check:', { hasDecks, hasFlashcards });
    
    return { hasDecks, hasFlashcards };
  } catch (error) {
    console.error('Error checking local storage:', error);
    return { hasDecks: false, hasFlashcards: false };
  }
}; 

// Add default export to satisfy Expo Router's requirement
const LocalStorageUtils = { checkLocalStorage };
export default LocalStorageUtils; 