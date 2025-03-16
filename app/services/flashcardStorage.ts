import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flashcard } from '../types/Flashcard';
import { Deck } from '../types/Deck';

// Storage keys
const FLASHCARDS_STORAGE_KEY = 'kanji_app_flashcards';
const DECKS_STORAGE_KEY = 'kanji_app_decks';

// Default deck
const DEFAULT_DECK: Deck = {
  id: 'deck1',
  name: 'Deck 1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/**
 * Initialize decks if they don't exist
 */
export const initializeDecks = async (): Promise<void> => {
  try {
    const decks = await getDecks();
    if (decks.length === 0) {
      // Create default deck if no decks exist
      await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify([DEFAULT_DECK]));
    }
  } catch (error) {
    console.error('Error initializing decks:', error);
  }
};

/**
 * Get all decks
 * @returns Array of decks
 */
export const getDecks = async (): Promise<Deck[]> => {
  try {
    const decksJson = await AsyncStorage.getItem(DECKS_STORAGE_KEY);
    if (!decksJson) {
      return [];
    }
    
    return JSON.parse(decksJson) as Deck[];
  } catch (error) {
    console.error('Error getting decks:', error);
    return [];
  }
};

/**
 * Create a new deck
 * @param name The name of the deck
 * @returns The created deck
 */
export const createDeck = async (name: string): Promise<Deck> => {
  try {
    const decks = await getDecks();
    
    // Generate a unique ID for the deck
    const id = `deck${decks.length + 1}`;
    
    const newDeck: Deck = {
      id,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Add new deck to the list
    const updatedDecks = [...decks, newDeck];
    
    // Save to AsyncStorage
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(updatedDecks));
    
    return newDeck;
  } catch (error) {
    console.error('Error creating deck:', error);
    throw error;
  }
};

/**
 * Save a flashcard to storage
 * @param flashcard The flashcard to save
 * @param deckId The ID of the deck to save the flashcard to (defaults to 'deck1')
 */
export const saveFlashcard = async (flashcard: Flashcard, deckId: string = 'deck1'): Promise<void> => {
  try {
    // Ensure decks are initialized
    await initializeDecks();
    
    // Get existing flashcards
    const existingFlashcards = await getFlashcards();
    
    // Set the deckId on the flashcard
    const flashcardWithDeck: Flashcard = {
      ...flashcard,
      deckId,
    };
    
    // Add new flashcard to the list
    const updatedFlashcards = [...existingFlashcards, flashcardWithDeck];
    
    // Save to AsyncStorage
    await AsyncStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(updatedFlashcards));
    
    console.log('Flashcard saved successfully:', flashcard.id, 'to deck:', deckId);
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
    const flashcardsJson = await AsyncStorage.getItem(FLASHCARDS_STORAGE_KEY);
    if (!flashcardsJson) {
      return [];
    }
    
    const flashcards = JSON.parse(flashcardsJson) as Flashcard[];
    
    // Add deckId to any flashcards that don't have one (for backward compatibility)
    return flashcards.map(card => ({
      ...card,
      deckId: card.deckId || 'deck1',
    }));
  } catch (error) {
    console.error('Error getting flashcards:', error);
    return [];
  }
};

/**
 * Get flashcards by deck ID
 * @param deckId The ID of the deck to get flashcards for
 * @returns Array of flashcards in the specified deck
 */
export const getFlashcardsByDeck = async (deckId: string): Promise<Flashcard[]> => {
  try {
    const flashcards = await getFlashcards();
    return flashcards.filter(card => card.deckId === deckId);
  } catch (error) {
    console.error('Error getting flashcards by deck:', error);
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
    
    await AsyncStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(updatedFlashcards));
    return true;
  } catch (error) {
    console.error('Error deleting flashcard:', error);
    return false;
  }
};

/**
 * Delete a deck by ID and optionally its flashcards
 * @param deckId The ID of the deck to delete
 * @param deleteFlashcards Whether to delete the flashcards in the deck (default: true)
 * @returns True if deleted successfully, false otherwise
 */
export const deleteDeck = async (deckId: string, deleteFlashcards: boolean = true): Promise<boolean> => {
  try {
    // Get existing decks
    const decks = await getDecks();
    
    // Check if deck exists
    const deckIndex = decks.findIndex(deck => deck.id === deckId);
    if (deckIndex === -1) {
      return false;
    }
    
    // Remove deck from the list
    const updatedDecks = decks.filter(deck => deck.id !== deckId);
    
    // Save updated decks
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(updatedDecks));
    
    // Delete flashcards in the deck if requested
    if (deleteFlashcards) {
      const flashcards = await getFlashcards();
      const updatedFlashcards = flashcards.filter(card => card.deckId !== deckId);
      await AsyncStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(updatedFlashcards));
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting deck:', error);
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
    // Get existing decks
    const decks = await getDecks();
    
    // Find the deck to update
    const deckIndex = decks.findIndex(deck => deck.id === deckId);
    if (deckIndex === -1) {
      return null;
    }
    
    // Update the deck
    const updatedDeck: Deck = {
      ...decks[deckIndex],
      name: newName,
      updatedAt: Date.now(),
    };
    
    // Replace the deck in the list
    const updatedDecks = [...decks];
    updatedDecks[deckIndex] = updatedDeck;
    
    // Save updated decks
    await AsyncStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(updatedDecks));
    
    return updatedDeck;
  } catch (error) {
    console.error('Error updating deck name:', error);
    return null;
  }
}; 