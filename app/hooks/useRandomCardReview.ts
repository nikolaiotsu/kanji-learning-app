import { useState, useEffect, useCallback, useRef } from 'react';
import { getFlashcards } from '../services/supabaseStorage';
import { Flashcard } from '../types/Flashcard';
import { useAuth } from '../context/AuthContext';
import { AppState } from 'react-native';

import { logger } from '../utils/logger';
// Enhanced loading states for better UX
export enum LoadingState {
  IDLE = 'idle',
  SKELETON_LOADING = 'skeleton_loading', 
  CONTENT_READY = 'content_ready',
  ERROR = 'error'
}

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
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  
  // Use refs to track the last data state to prevent unnecessary updates
  const lastFetchedCardsRef = useRef<string>("");
  const isInitialLoadRef = useRef<boolean>(true); // Track if this is the first load
  
  // Add refs to track current state values (keeping minimal refs from old implementation)
  const currentCardRef = useRef<Flashcard | null>(null);
  const reviewSessionCardsRef = useRef<Flashcard[]>([]);
  
  const { user } = useAuth();

  // Helper function to check if two arrays of flashcards are equal by serializing and comparing
  const areFlashcardsEqual = (cards1: Flashcard[], cards2: Flashcard[]): boolean => {
    // Sort both arrays by ID for consistent comparison
    const sortedCards1 = [...cards1].sort((a, b) => a.id.localeCompare(b.id));
    const sortedCards2 = [...cards2].sort((a, b) => a.id.localeCompare(b.id));
    
    // Compare JSON strings of the sorted arrays
    return JSON.stringify(sortedCards1) === JSON.stringify(sortedCards2);
  };

  // Fetch all flashcards with enhanced loading states
  const fetchAllFlashcards = useCallback(async (forceUpdate = false) => {
    if (isLoading) return; // Prevent concurrent fetches
    
    try {
      // Set skeleton loading state for initial loads or force updates
      if (isInitialLoadRef.current || forceUpdate) {
        setLoadingState(LoadingState.SKELETON_LOADING);
      }
      
      // Fetch without setting old loading state first to avoid UI flashing
      const cards = await getFlashcards();
      
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
          setReviewSessionCards(cards);

          /*
           * CRITICAL: Do not select a card here during initial load!
           * This prevents the flicker issue. Card selection should only happen
           * when explicitly starting a review session via startReviewWithCards.
           */
          if (isInReviewMode && !isInitialLoadRef.current) {
            // Only select a card if we're already in an active review session
            // and this isn't the initial load
            if (cards.length > 0) {
              const randomIndex = Math.floor(Math.random() * cards.length);
              setCurrentCard(cards[randomIndex]);
            } else {
              setCurrentCard(null);
            }
          } else {
            // Ensure we start with a clean state until the session begins
            setCurrentCard(null);
          }
        } else {
          // If we're in review mode, just remove cards that no longer exist
          // BUT DO NOT ADD CARDS BACK TO THE REVIEW SESSION
          logger.log('📥 [Hook] In review mode - checking for removed cards');
          logger.log('📥 [Hook] Current reviewSessionCards.length:', reviewSessionCards.length);
          logger.log('📥 [Hook] Database cards.length:', cards.length);
          
          setReviewSessionCards(prevCards => {
            const updatedCards = prevCards.filter(card => 
              cards.some(c => c.id === card.id)
            );
            
            logger.log('📥 [Hook] Updated reviewSessionCards.length:', updatedCards.length);
            
            // Only update if there's a change (cards were removed)
            // Important: Do NOT add cards back
            if (updatedCards.length !== prevCards.length) {
              logger.log('📥 [Hook] Cards were removed from review session');
              return updatedCards;
            }
            return prevCards;
          });
          
          // Update current card if needed
          if (currentCard && !cards.some(c => c.id === currentCard.id)) {
            // Current card was deleted, select a new one
            const validReviewCards = reviewSessionCards.filter(card => 
              cards.some(c => c.id === card.id)
            );
            logger.log('📥 [Hook] Current card was deleted, selecting new one from', validReviewCards.length, 'cards');
            selectRandomCard(validReviewCards);
          } else if (cards.length > 0 && !currentCard) {
            // No current card but we have cards, select one
            logger.log('📥 [Hook] No current card but we have cards, selecting one');
            selectRandomCard(cards);
          }
        }
        
        setIsLoading(false);
        
        // Mark initial load as complete
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
        }
        
        // Set content ready state only after all data is loaded
        setLoadingState(LoadingState.CONTENT_READY);
      }
    } catch (err) {
      logger.error('Error fetching flashcards:', err);
      setError('Failed to load flashcards. Please try again.');
      setIsLoading(false);
      setLoadingState(LoadingState.ERROR);
    }
  }, [isInReviewMode, currentCard, reviewSessionCards]);

  // Initial load and when user changes
  useEffect(() => {
    if (user) {
      fetchAllFlashcards();
    }
  }, [user, fetchAllFlashcards]);

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
    if (!user) return;
    
    // Refresh every 30 seconds instead of 5 seconds to reduce database calls
    const interval = setInterval(() => {
      // Only automatically refresh if not in review mode
      if (!isInReviewMode) {
        logger.log('⏰ [Hook] Polling - fetching all flashcards (not in review mode)');
        fetchAllFlashcards();
      } else {
        logger.log('⏰ [Hook] Polling - skipping fetch (in review mode)');
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [user, fetchAllFlashcards, isInReviewMode]);

  // Update refs when state changes
  useEffect(() => {
    logger.log('📋 [Hook] Updating currentCardRef:', currentCard?.id || 'null');
    currentCardRef.current = currentCard;
  }, [currentCard]);

  useEffect(() => {
    logger.log('📋 [Hook] Updating reviewSessionCardsRef, length:', reviewSessionCards.length);
    reviewSessionCardsRef.current = reviewSessionCards;
  }, [reviewSessionCards]);

  // Select a random card from the given array or from the session cards
  const selectRandomCard = (cards?: Flashcard[], excludeCurrent: boolean = false) => {
    const cardArray = cards || reviewSessionCards;
    
    logger.log('🎯 [Hook] selectRandomCard called');
    logger.log('🎯 [Hook] cards parameter length:', cards?.length || 'undefined');
    logger.log('🎯 [Hook] reviewSessionCards.length:', reviewSessionCards.length);
    logger.log('🎯 [Hook] cardArray.length:', cardArray.length);
    
    if (cardArray.length === 0) {
      logger.error('🎯 [Hook] ERROR: cardArray is empty in selectRandomCard!');
      setCurrentCard(null);
      return;
    }
    // If requested, exclude the current card from selection when possible
    let selectable = cardArray;
    if (excludeCurrent && currentCardRef.current) {
      selectable = cardArray.filter(card => card.id !== currentCardRef.current!.id);
      if (selectable.length === 0) {
        // Only the current card available; fallback to all cards
        selectable = cardArray;
      }
    }
    // Select a random card for currentCard
    const randomIndex = Math.floor(Math.random() * selectable.length);
    const newCurrentCard = selectable[randomIndex];
    logger.log('🎯 [Hook] Selected card:', newCurrentCard.id);
    setCurrentCard(newCurrentCard);
  };

  // Handle swipe left (keep card in review session)
  const handleSwipeLeft = () => {
    logger.log('🔄 [Hook] handleSwipeLeft called');
    logger.log('🔄 [Hook] isInReviewMode:', isInReviewMode);
    logger.log('🔄 [Hook] reviewSessionCards.length:', reviewSessionCards.length);
    logger.log('🔄 [Hook] reviewSessionCardsRef.current.length:', reviewSessionCardsRef.current.length);
    
    // Always ensure we're in review mode
    if (!isInReviewMode) {
      setIsInReviewMode(true);
    }
    
    // Use the ref to avoid relying on potentially stale state while React processes updates
    const sessionCards = reviewSessionCardsRef.current;
    if (sessionCards.length === 0) {
      logger.error('🔄 [Hook] ERROR: No cards left in review session!');
      setIsInReviewMode(false);
      setCurrentCard(null);
      return;
    }
    
    // Exclude the current card to ensure a visible change
    selectRandomCard(sessionCards, true);
  };

  // Handle swipe right (dismiss card from review session)
  const handleSwipeRight = () => {
    logger.log('👉 [Hook] handleSwipeRight called');
    logger.log('👉 [Hook] isInReviewMode:', isInReviewMode);
    logger.log('👉 [Hook] reviewSessionCards.length:', reviewSessionCards.length);
    logger.log('👉 [Hook] reviewSessionCardsRef.current.length:', reviewSessionCardsRef.current.length);
    
    // Always ensure we're in review mode
    if (!isInReviewMode) {
      setIsInReviewMode(true);
    }
    
    const currentCardValue = currentCardRef.current;
    const reviewSessionCardsValue = reviewSessionCardsRef.current;
    
    if (!currentCardValue || reviewSessionCardsValue.length === 0) {
      logger.log('👉 [Hook] No current card or empty session, returning');
      return;
    }
    
    // Remove current card and select next
    const currentCardId = currentCardValue.id;
    logger.log('👉 [Hook] Removing card:', currentCardId);
    
    // Calculate remaining cards before removing the current one
    const remainingCards = reviewSessionCardsValue.filter(card => card.id !== currentCardId);
    logger.log('👉 [Hook] Remaining cards:', remainingCards.length);
    
    // Remove the card from session
    setReviewSessionCards(remainingCards);
    
    // If there are no more cards, set current card to null and exit review mode
    if (remainingCards.length === 0) {
      logger.log('👉 [Hook] No cards left, exiting review mode');
      setCurrentCard(null);
      setIsInReviewMode(false);
      setIsSessionFinished(true); // Mark session as finished
    } else {
      // Otherwise select a new random card
      const randomIndex = Math.floor(Math.random() * remainingCards.length);
      const nextCard = remainingCards[randomIndex];
      logger.log('👉 [Hook] Selected next card:', nextCard.id);
      setCurrentCard(nextCard);
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
    // Clear session finished flag
    setIsSessionFinished(false);
    
    // Clear the current cache to force a refresh
    lastFetchedCardsRef.current = "";
    
    // Reset the current card to force UI update
    setCurrentCard(null);
    
    // Ensure review session cards are cleared before refetching
    setReviewSessionCards([]);
    
    // Fetch all cards with the force update flag
    fetchAllFlashcards(true);
  };

  // Start a review session with specific cards (for deck filtering) - ATOMIC OPERATION
  const startReviewWithCards = useCallback((cards: Flashcard[]) => {
    logger.log('🚀 [Hook] startReviewWithCards called with', cards.length, 'cards');
    logger.log('🚀 [Hook] Current isInReviewMode:', isInReviewMode);
    logger.log('🚀 [Hook] Current reviewSessionCards.length:', reviewSessionCards.length);
    
    // ATOMIC INITIALIZATION: Set all states together to prevent flicker
    if (cards.length > 0) {
      // Select the card BEFORE setting any state to ensure atomicity
      const randomIndex = Math.floor(Math.random() * cards.length);
      const selectedCard = cards[randomIndex];
      
      logger.log('🚀 [Hook] Selected initial card:', selectedCard.id);
      
      // Set all states atomically to prevent intermediate renders
      setReviewSessionCards(cards);
      setCurrentCard(selectedCard);
      setIsInReviewMode(true);
      setIsSessionFinished(false);
      setLoadingState(LoadingState.CONTENT_READY);
      
      logger.log('🚀 [Hook] Review session started successfully');
    } else {
      logger.log('🚀 [Hook] No cards provided, clearing session');
      setReviewSessionCards([]);
      setCurrentCard(null);
      setIsInReviewMode(false);
      setIsSessionFinished(false);
      setLoadingState(LoadingState.CONTENT_READY);
    }
  }, []);

  return {
    allFlashcards,
    currentCard,
    reviewSessionCards,
    isInReviewMode,
    isSessionFinished,
    isLoading,
    loadingState,
    error,
    handleSwipeLeft,
    handleSwipeRight,
    resetReviewSession,
    startReviewWithCards,
    selectRandomCard,
    fetchAllFlashcards,
    setCurrentCard,
    removeCardFromSession
  };
};

// Add default export to satisfy Expo Router's requirement
export default useRandomCardReview; 