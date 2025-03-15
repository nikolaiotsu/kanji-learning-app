import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flashcard } from '../types/Flashcard';

// Storage key for flashcards
const STORAGE_KEY = 'kanji_app_flashcards';

/**
 * Save a flashcard to storage
 * @param flashcard The flashcard to save
 */
export const saveFlashcard = async (flashcard: Flashcard): Promise<void> => {
  try {
    // Get existing flashcards
    const existingFlashcards = await getFlashcards();
    
    // Add new flashcard to the list
    const updatedFlashcards = [...existingFlashcards, flashcard];
    
    // Save to AsyncStorage
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFlashcards));
    
    console.log('Flashcard saved successfully:', flashcard.id);
  } catch (error) {
    console.error('Error saving flashcard:', error);
    throw error;
  }
};

/**
 * Get all saved flashcards
 * @returns Array of saved flashcards
 */
export const getFlashcards = async (): Promise<Flashcard[]> => {
  try {
    const flashcardsJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!flashcardsJson) {
      return [];
    }
    
    return JSON.parse(flashcardsJson) as Flashcard[];
  } catch (error) {
    console.error('Error getting flashcards:', error);
    return [];
  }
};

/**
 * Get a flashcard by ID
 * @param id The ID of the flashcard to get
 * @returns The flashcard if found, null otherwise
 */
export const getFlashcardById = async (id: string): Promise<Flashcard | null> => {
  try {
    const flashcards = await getFlashcards();
    const flashcard = flashcards.find(card => card.id === id);
    return flashcard || null;
  } catch (error) {
    console.error('Error getting flashcard by ID:', error);
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
    const flashcards = await getFlashcards();
    const updatedFlashcards = flashcards.filter(card => card.id !== id);
    
    // If lengths are the same, no flashcard was deleted
    if (flashcards.length === updatedFlashcards.length) {
      return false;
    }
    
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFlashcards));
    return true;
  } catch (error) {
    console.error('Error deleting flashcard:', error);
    return false;
  }
}; 