import { supabase } from './supabaseClient';
import { Flashcard } from '../types/Flashcard';
import { Deck } from '../types/Deck';

// Simple UUID generator that doesn't rely on crypto.getRandomValues()
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Get all decks for the current user
 * @returns Array of decks
 */
export const getDecks = async (createDefaultIfEmpty: boolean = false): Promise<Deck[]> => {
  try {
    const { data: decks, error } = await supabase
      .from('decks')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching decks:', error.message);
      return [];
    }
    
    // Create a default deck if requested and no decks exist
    if (createDefaultIfEmpty && (!decks || decks.length === 0)) {
      console.log('No decks found, creating default deck');
      const defaultDeck = await createDeck('Deck 1');
      return [defaultDeck];
    }
    
    // Transform from database format to app format
    return decks.map((deck: any) => ({
      id: deck.id,
      name: deck.name,
      createdAt: new Date(deck.created_at).getTime(),
      updatedAt: new Date(deck.updated_at).getTime(),
    }));
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
    // Let Supabase generate the UUID on the server when possible
    // Only generate locally if needed for specific use cases
    const newDeck = {
      name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('decks')
      .insert(newDeck)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating deck:', error.message);
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
    console.error('Error creating deck:', error);
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
    console.error('Error initializing decks:', error);
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
      created_at: new Date().toISOString(),
      deck_id: deckId,
    };
    
    const { error } = await supabase
      .from('flashcards')
      .insert(newFlashcard);
    
    if (error) {
      console.error('Error saving flashcard:', error.message);
      throw error;
    }
    
    console.log('Flashcard saved successfully to deck:', deckId);
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
    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching flashcards:', error.message);
      return [];
    }
    
    // Transform from database format to app format
    return flashcards.map((card: any) => ({
      id: card.id,
      originalText: card.original_text,
      furiganaText: card.furigana_text,
      translatedText: card.translated_text,
      createdAt: new Date(card.created_at).getTime(),
      deckId: card.deck_id,
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
    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching flashcards by deck:', error.message);
      return [];
    }
    
    // Transform from database format to app format
    return flashcards.map((card: any) => ({
      id: card.id,
      originalText: card.original_text,
      furiganaText: card.furigana_text,
      translatedText: card.translated_text,
      createdAt: new Date(card.created_at).getTime(),
      deckId: card.deck_id,
    }));
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
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching flashcard by ID:', error.message);
      return null;
    }
    
    // Transform from database format to app format
    return {
      id: data.id,
      originalText: data.original_text,
      furiganaText: data.furigana_text,
      translatedText: data.translated_text,
      createdAt: new Date(data.created_at).getTime(),
      deckId: data.deck_id,
    };
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
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting flashcard:', error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting flashcard:', error);
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
        console.error('Error deleting flashcards in deck:', flashcardsError.message);
        return false;
      }
    }
    
    // Delete the deck
    const { error: deckError } = await supabase
      .from('decks')
      .delete()
      .eq('id', deckId);
    
    if (deckError) {
      console.error('Error deleting deck:', deckError.message);
      return false;
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
    const { data, error } = await supabase
      .from('decks')
      .update({ 
        name: newName,
        updated_at: new Date().toISOString()
      })
      .eq('id', deckId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating deck name:', error.message);
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
    console.error('Error updating deck name:', error);
    return null;
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
  getFlashcardById,
  deleteFlashcard,
  deleteDeck,
  updateDeckName
}; 