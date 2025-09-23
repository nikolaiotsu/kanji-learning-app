import { supabase } from './supabaseClient';
import { Flashcard } from '../types/Flashcard';
import { Deck } from '../types/Deck';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import { logFlashcardCreation } from './apiUsageLogger';

// Simple UUID generator that doesn't rely on crypto.getRandomValues()
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
 * @returns Array of decks
 */
export const getDecks = async (createDefaultIfEmpty: boolean = false): Promise<Deck[]> => {
  try {
    // Try ordering by order_index first (new schema). If the column does not exist yet, fall back to created_at.
    let query = supabase
      .from('decks')
      .select('*');

    // Attempt to order by order_index – if this fails (e.g., column missing) we will catch and retry.
    let { data: decks, error } = await query.order('order_index', { ascending: true, nullsFirst: false });

    if (error) {
      console.warn('order_index column missing or other error – falling back to created_at ordering:', error.message);
      ({ data: decks, error } = await supabase
        .from('decks')
        .select('*')
        .order('created_at', { ascending: false }));
      if (error) {
        console.error('Error fetching decks:', error.message);
        return [];
      }
    }
    
    // Create a default deck if requested and no decks exist
    if (createDefaultIfEmpty && (!decks || decks.length === 0)) {
      console.log('No decks found, creating default deck');
      const defaultDeck = await createDeck('Collection 1');
      return [defaultDeck];
    }
    
    // Ensure we have an array to map over
    const deckList = decks || [];

    // Transform from database format to app format, including orderIndex if present
    return deckList.map((deck: any) => ({
      id: deck.id,
      name: deck.name,
      createdAt: new Date(deck.created_at).getTime(),
      updatedAt: new Date(deck.updated_at).getTime(),
      orderIndex: deck.order_index ?? undefined,
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
 * Upload an image to Supabase Storage and return the URL
 * @param imageUri Local URI of the image to upload
 * @returns URL of the uploaded image
 */
export const uploadImageToStorage = async (imageUri: string): Promise<string | null> => {
  try {
    console.log('Uploading image to storage:', imageUri);
    
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
      console.error('Error uploading image:', error.message);
      return null;
    }
    
    // Get public URL for the uploaded image
    const { data: { publicUrl } } = supabase
      .storage
      .from('flashcards')
      .getPublicUrl(filePath);
    
    console.log('Image uploaded successfully, URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
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
      console.error('Error deleting image:', error.message);
      return false;
    }
    
    console.log('Image deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting image:', error);
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
      console.error('Error saving flashcard:', error.message);
      throw error;
    }
    
    console.log('Flashcard saved successfully to deck:', deckId);
    
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
    console.error('Error saving flashcard:', error);
    
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
    return transformFlashcards(flashcards);
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
    return transformFlashcards(flashcards);
  } catch (error) {
    console.error('Error getting flashcards by deck:', error);
    return [];
  }
};

/**
 * Get flashcards by multiple deck IDs
 * @param deckIds Array of deck IDs to get flashcards for
 * @returns Array of flashcards in the specified decks
 */
export const getFlashcardsByDecks = async (deckIds: string[]): Promise<Flashcard[]> => {
  if (!deckIds || deckIds.length === 0) {
    return [];
  }

  try {
    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*')
      .in('deck_id', deckIds)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching flashcards by decks:', error.message);
      return [];
    }
    
    // Transform from database format to app format
    return transformFlashcards(flashcards);
  } catch (error) {
    console.error('Error getting flashcards by decks:', error);
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
    return transformFlashcard(data);
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
      console.error('Error updating deck order:', error.message);
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
    console.error('Error updating deck order:', error);
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
      console.error('Error moving flashcard to deck:', error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error moving flashcard to deck:', error);
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
      console.error('Error updating flashcard:', error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating flashcard:', error);
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