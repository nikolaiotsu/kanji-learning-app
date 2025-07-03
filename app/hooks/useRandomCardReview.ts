import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFlashcards, getFlashcardsByDecks } from '../services/supabaseStorage';
import { Flashcard } from '../types/Flashcard';
import { useAuth } from '../context/AuthContext';
import { AppState } from 'react-native';

// Storage key for selected deck IDs
const SELECTED_DECK_IDS_STORAGE_KEY = 'selectedDeckIds';

/**
 * Custom hook for managing random flashcard review
 * @returns Object containing various state and handlers for random card review
 */
export const useRandomCardReview = () => {
  const [allFlashcards, setAllFlashcards] = useState<Flashcard[]>([]);
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [reviewSessionCards, setReviewSessionCards] = useState<Flashcard[]>([]);
  const [isInReviewMode, setIsInReviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [deckIdsLoaded, setDeckIdsLoaded] = useState(false);
  
  // Use refs to track the last data state to prevent unnecessary updates
  const lastFetchedCardsRef = useRef<string>("");
  
  // Add refs to track current state values
  const currentCardRef = useRef<Flashcard | null>(null);
  const reviewSessionCardsRef = useRef<Flashcard[]>([]);
  const selectedDeckIdsRef = useRef<string[]>([]);
  
  const { user } = useAuth();

  // Load selected deck IDs from AsyncStorage on initialization
  useEffect(() => {
    const loadSelectedDeckIds = async () => {
      try {
        const storedDeckIds = await AsyncStorage.getItem(SELECTED_DECK_IDS_STORAGE_KEY);
        if (storedDeckIds) {
          const deckIds = JSON.parse(storedDeckIds);
          setSelectedDeckIds(deckIds);
        }
      } catch (error) {
        console.error('Error loading selected deck IDs from AsyncStorage:', error);
      } finally {
        setDeckIdsLoaded(true);
      }
    };

    loadSelectedDeckIds();
  }, []);

  // Helper function to check if two arrays of flashcards are equal by serializing and comparing
  const areFlashcardsEqual = (cards1: Flashcard[], cards2: Flashcard[]): boolean => {
    // Sort both arrays by ID for consistent comparison
    const sortedCards1 = [...cards1].sort((a, b) => a.id.localeCompare(b.id));
    const sortedCards2 = [...cards2].sort((a, b) => a.id.localeCompare(b.id));
    
    // Compare JSON strings of the sorted arrays
    return JSON.stringify(sortedCards1) === JSON.stringify(sortedCards2);
  };

  // Fetch all flashcards and refresh the session
  const fetchAllFlashcards = useCallback(async (forceUpdate = false) => {
    if (isLoading) return; // Prevent concurrent fetches
    
    try {
      // Fetch without setting loading state first to avoid UI flashing
      let cards;
      
      // If deck IDs are selected, filter by those decks
      if (selectedDeckIdsRef.current.length > 0) {
        cards = await getFlashcardsByDecks(selectedDeckIdsRef.current);
      } else {
        cards = await getFlashcards();
      }
      
      // Create a hash of the fetched cards to detect changes
      const cardsHash = JSON.stringify([...cards].sort((a, b) => a.id.localeCompare(b.id)));
      
      // Only update if there are actual changes or if forceUpdate is true
      if (forceUpdate || cardsHash !== lastFetchedCardsRef.current) {
        // Update the hash reference
        lastFetchedCardsRef.current = cardsHash;
        
        setIsLoading(true);
        setError(null);
        
        // Update all flashcards state
        setAllFlashcards(cards);
        
        // Update review session cards
        if (!isInReviewMode || forceUpdate) {
          // Only initialize cards if not in review mode or we're forcing update
          setReviewSessionCards(cards);
          
          // Only select a random card if we're not already in review mode or the current card is null
          if ((cards.length > 0) && (!currentCard || forceUpdate)) {
            const randomIndex = Math.floor(Math.random() * cards.length);
            setCurrentCard(cards[randomIndex]);
          } else if (cards.length === 0) {
            setCurrentCard(null);
          }
        } else {
          // If we're in review mode, just remove cards that no longer exist
          // BUT DO NOT ADD CARDS BACK TO THE REVIEW SESSION
          setReviewSessionCards(prevCards => {
            const updatedCards = prevCards.filter(card => 
              cards.some((c: Flashcard) => c.id === card.id)
            );
            
            // Only update if there's a change (cards were removed)
            // Important: Do NOT add cards back
            if (updatedCards.length !== prevCards.length) {
              return updatedCards;
            }
            return prevCards;
          });
          
          // Update current card if needed
          if (currentCard && !cards.some((c: Flashcard) => c.id === currentCard.id)) {
            // Current card was deleted, select a new one
            const validReviewCards = reviewSessionCards.filter(card => 
              cards.some((c: Flashcard) => c.id === card.id)
            );
            if (validReviewCards.length > 0) {
              selectRandomCard(validReviewCards);
            } else {
              setCurrentCard(null);
            }
          }
        }
        
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error fetching flashcards:', err);
      setError('Failed to load flashcards. Please try again.');
      setIsLoading(false);
    }
  }, [isInReviewMode, currentCard, reviewSessionCards]);

  // Initial load and when user changes
  useEffect(() => {
    if (user && deckIdsLoaded) {
      fetchAllFlashcards();
    }
  }, [user, deckIdsLoaded, fetchAllFlashcards]);

  // Refresh data when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        fetchAllFlashcards();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchAllFlashcards]);

  // Set a polling interval to periodically refresh data
  useEffect(() => {
    if (!user || !deckIdsLoaded) return;
    
    // Only refresh every 60 seconds and only when not in review mode
    // This prevents constant re-rendering and card flashing
    const interval = setInterval(() => {
      if (!isInReviewMode) {
        fetchAllFlashcards();
      }
    }, 60000); // Increased to 60 seconds to reduce unnecessary updates
    
    return () => clearInterval(interval);
  }, [user, deckIdsLoaded, fetchAllFlashcards, isInReviewMode]);

  // Update refs when state changes
  useEffect(() => {
    currentCardRef.current = currentCard;
  }, [currentCard]);

  useEffect(() => {
    reviewSessionCardsRef.current = reviewSessionCards;
  }, [reviewSessionCards]);

  useEffect(() => {
    selectedDeckIdsRef.current = selectedDeckIds;
    // Only force refresh if the selected decks changed and we're not in the middle of a review
    // This prevents unnecessary flashing of cards
    if (!isInReviewMode && selectedDeckIds.length > 0) {
      // Use a non-forced update to reduce chances of flashing cards
      fetchAllFlashcards(false);
    }
  }, [selectedDeckIds, isInReviewMode, fetchAllFlashcards]);

  // Select a random card from the given array or from the session cards
  const selectRandomCard = (cards?: Flashcard[]) => {
    const cardArray = cards || reviewSessionCards;
    
    if (cardArray.length === 0) {
      setCurrentCard(null);
      return;
    }
    // Select a random card for currentCard
    const randomIndex = Math.floor(Math.random() * cardArray.length);
    const newCurrentCard = cardArray[randomIndex];
    setCurrentCard(newCurrentCard);
  };

  // Handle swipe left (keep card in review session)
  const handleSwipeLeft = () => {
    if (!isInReviewMode) {
      setIsInReviewMode(true);
    }
    selectRandomCard(reviewSessionCardsRef.current);
  };

  // Handle swipe right (dismiss card from review session)
  const handleSwipeRight = () => {
    if (!isInReviewMode) {
      setIsInReviewMode(true);
    }
    
    const currentCardValue = currentCardRef.current;
    const reviewSessionCardsValue = reviewSessionCardsRef.current;
    
    if (!currentCardValue || reviewSessionCardsValue.length === 0) {
      return;
    }
    
    // Remove current card and select next
    const currentCardId = currentCardValue.id;
    
    // Calculate remaining cards before removing the current one
    const remainingCards = reviewSessionCardsValue.filter(card => card.id !== currentCardId);
    
    // Remove the card from session
    setReviewSessionCards(remainingCards);
    
    // If there are no more cards, set current card to null
    if (remainingCards.length === 0) {
      setCurrentCard(null);
    } else {
      // Otherwise select a new random card
      const randomIndex = Math.floor(Math.random() * remainingCards.length);
      setCurrentCard(remainingCards[randomIndex]);
    }
  };

  // Remove a card from the review session
  const removeCardFromSession = (cardId: string) => {
    setReviewSessionCards(prevCards => prevCards.filter(card => card.id !== cardId));
  };

  // Reset the review session
  const resetReviewSession = () => {
    // Force a reset of review mode
    setIsInReviewMode(false);
    
    // Clear the current cache to force a refresh
    lastFetchedCardsRef.current = "";
    
    // Reset the current card to force UI update
    setCurrentCard(null);
    
    // Ensure review session cards are cleared before refetching
    setReviewSessionCards([]);
    
    // Fetch all cards with the force update flag
    fetchAllFlashcards(true);
  };

  // Update selected deck IDs
  const updateSelectedDeckIds = async (deckIds: string[]) => {
    try {
      setSelectedDeckIds(deckIds);
      await AsyncStorage.setItem(SELECTED_DECK_IDS_STORAGE_KEY, JSON.stringify(deckIds));
    } catch (error) {
      console.error('Error saving selected deck IDs to AsyncStorage:', error);
    }
  };

  return {
    allFlashcards,
    currentCard,
    reviewSessionCards,
    isInReviewMode,
    isLoading,
    error,
    selectedDeckIds,
    handleSwipeLeft,
    handleSwipeRight,
    resetReviewSession,
    selectRandomCard,
    fetchAllFlashcards,
    setCurrentCard,
    removeCardFromSession,
    updateSelectedDeckIds
  };
};

// Add default export to satisfy Expo Router's requirement
export default useRandomCardReview; 