import { useState, useEffect, useCallback, useRef } from 'react';
import { getFlashcards } from '../services/supabaseStorage';
import { getLocalFlashcards } from '../services/localFlashcardStorage';
import { Flashcard } from '../types/Flashcard';
import { useAuth } from '../context/AuthContext';
import { AppState } from 'react-native';
import { useNetworkState, isNetworkError } from '../services/networkManager';
import { onDataSynced } from '../services/syncManager';

import { logger } from '../utils/logger';
// Enhanced loading states for better UX
export enum LoadingState {
  IDLE = 'idle',
  SKELETON_LOADING = 'skeleton_loading', 
  CONTENT_READY = 'content_ready',
  ERROR = 'error'
}

// Data version counter - increments each time fresh data is fetched
// This helps consumers detect when they should re-process data
let dataVersionCounter = 0;

/**
 * Custom hook for managing random flashcard review
 * @returns Object containing various state and handlers for random card review
 */
export const useRandomCardReview = (onSessionFinishing?: () => void) => {
  const [allFlashcards, setAllFlashcards] = useState<Flashcard[]>([]);
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [reviewSessionCards, setReviewSessionCards] = useState<Flashcard[]>([]);
  const [isInReviewMode, setIsInReviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  
  // Data version - increments when fresh data arrives, allowing consumers to detect updates
  const [dataVersion, setDataVersion] = useState(0);
  
  // Use refs to track the last data state to prevent unnecessary updates
  const lastFetchedCardsRef = useRef<string>("");
  const isInitialLoadRef = useRef<boolean>(true); // Track if this is the first load
  const isFetchingRef = useRef<boolean>(false); // Prevent concurrent fetches
  
  // Add refs to track current state values (keeping minimal refs from old implementation)
  const currentCardRef = useRef<Flashcard | null>(null);
  const reviewSessionCardsRef = useRef<Flashcard[]>([]);
  const allFlashcardsRef = useRef<Flashcard[]>([]);
  const onSessionFinishingRef = useRef<(() => void) | undefined>(onSessionFinishing);
  
  // Keep the callback ref up to date
  useEffect(() => {
    onSessionFinishingRef.current = onSessionFinishing;
  }, [onSessionFinishing]);
  
  const { user, isGuest } = useAuth();
  const { isConnected } = useNetworkState();

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
    // Prevent concurrent fetches using ref (more reliable than state)
    if (isFetchingRef.current) {
      logger.log('⏳ [Hook] Fetch already in progress, skipping');
      return;
    }
    
    isFetchingRef.current = true;
    
    try {
      // Set skeleton loading state for initial loads or force updates
      if (isInitialLoadRef.current || forceUpdate) {
        setLoadingState(LoadingState.SKELETON_LOADING);
      }
      
      // OFFLINE OPTIMIZATION: If offline and we have existing cards, skip fetch entirely
      if (!isConnected && allFlashcardsRef.current.length > 0 && !forceUpdate) {
        logger.log('📶 [Hook] Offline with existing cards, skipping fetch');
        setIsLoading(false);
        setLoadingState(LoadingState.CONTENT_READY);
        isFetchingRef.current = false;
        return;
      }
      
      // When no user (guest or pre-auth), use local storage so the reviewer shows empty/intro state
      const cards = user ? await getFlashcards() : await getLocalFlashcards();
      
      // OFFLINE PROTECTION: If we're offline and got 0 cards, but we already have cards,
      // don't clear them. Keep showing what we have.
      if (cards.length === 0 && !isConnected && allFlashcardsRef.current.length > 0) {
        logger.log('📶 [Hook] Offline with empty fetch result, preserving existing', allFlashcardsRef.current.length, 'cards');
        setIsLoading(false);
        setLoadingState(LoadingState.CONTENT_READY);
        isFetchingRef.current = false;
        return;
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
        
        // CRITICAL: Increment data version to signal consumers that fresh data arrived
        // This allows RandomCardReviewer to re-filter cards when background fetch completes
        dataVersionCounter++;
        setDataVersion(dataVersionCounter);
        logger.log('📊 [Hook] Data version incremented to:', dataVersionCounter, 'cards:', cards.length);
        
        /*
         * CRITICAL: Do NOT automatically set reviewSessionCards or currentCard during background fetches!
         * The component manages deck filtering and calls startReviewWithCards with the correct cards.
         * 
         * During an active review session (isInReviewMode && reviewSessionCards.length > 0),
         * we must NOT change currentCard - the session is "locked in".
         */
        if (isInReviewMode && reviewSessionCardsRef.current.length > 0) {
          // Active review session - do NOT touch currentCard
          logger.log('🔄 [Hook] Background fetch during active session - preserving currentCard');
        } else if (isInitialLoadRef.current) {
          // ONLY clear currentCard during initial load
          // Don't clear on subsequent background fetches - the card may have been
          // set by startReviewWithCards and we need to preserve it
          logger.log('🔄 [Hook] Initial load - clearing currentCard for clean state');
          setCurrentCard(null);
        }
        // If !isInReviewMode && !isInitialLoadRef.current, preserve existing currentCard
        // (it was set by startReviewWithCards)

        // CRITICAL: During an active review session, DO NOT interfere with session cards!
        // Background fetches may return incomplete/stale data due to cache timing.
        // The session is "locked in" when it starts - only the user's swipes should modify it.
        if (isInReviewMode && reviewSessionCardsRef.current.length > 0) {
          // Log but do NOT modify the session
          logger.log('📥 [Hook] In review mode with active session - preserving session state');
          logger.log('📥 [Hook] Current reviewSessionCardsRef.current.length:', reviewSessionCardsRef.current.length);
          logger.log('📥 [Hook] Fetched cards.length:', cards.length);
          logger.log('📥 [Hook] NOT modifying reviewSessionCards - session is locked');
          // Don't touch reviewSessionCards or currentCard - let the session play out
        }
        
        setIsLoading(false);
        
        // Mark initial load as complete
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
        }
        
        // Set content ready state only after all data is loaded
        setLoadingState(LoadingState.CONTENT_READY);
      } else {
        // No changes detected but we should still mark as ready
        setIsLoading(false);
        setLoadingState(LoadingState.CONTENT_READY);
      }
    } catch (err) {
      logger.error('Error fetching flashcards:', err);
      
      // CRITICAL: If this is a network error and we have existing cards, preserve them
      if (isNetworkError(err) && allFlashcardsRef.current.length > 0) {
        logger.log('📶 [Hook] Network error but we have', allFlashcardsRef.current.length, 'existing cards - preserving state');
        setIsLoading(false);
        setLoadingState(LoadingState.CONTENT_READY);
        // Don't set error state - user should see existing cards without error message
        isFetchingRef.current = false;
        return;
      }
      
      // Only set error if we don't have any cached data
      setError('Failed to load flashcards. Please try again.');
      setIsLoading(false);
      setLoadingState(LoadingState.ERROR);
    } finally {
      isFetchingRef.current = false;
    }
  }, [isInReviewMode, currentCard, reviewSessionCards, isConnected, user]);

  // Initial load on mount and when user changes (no user = fetch local for guest/intro state)
  useEffect(() => {
    fetchAllFlashcards();
  }, [user, fetchAllFlashcards]);

  // Refetch when sync completes (e.g. after guest→user migration) so cards load immediately
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onDataSynced(() => {
      logger.log('🔄 [Hook] Data synced, refetching flashcards');
      fetchAllFlashcards(true);
    });
    return unsubscribe;
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

  // Set a polling interval to periodically refresh data (skip for guest)
  // Pauses when app is backgrounded to save battery
  useEffect(() => {
    if (!user || isGuest) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) return; // Already running
      intervalId = setInterval(() => {
        // Only automatically refresh if not in review mode AND online
        if (!isInReviewMode && isConnected) {
          logger.log('⏰ [Hook] Polling - fetching all flashcards (not in review mode, online)');
          fetchAllFlashcards();
        } else if (!isConnected) {
          logger.log('⏰ [Hook] Polling - skipping fetch (offline)');
        } else {
          logger.log('⏰ [Hook] Polling - skipping fetch (in review mode)');
        }
      }, 30000);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Start polling immediately (app is in foreground when effect runs)
    startPolling();

    // Pause/resume based on app state
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        logger.log('⏰ [Hook] App active - resuming polling');
        startPolling();
      } else {
        logger.log('⏰ [Hook] App inactive/background - pausing polling');
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [user, isGuest, fetchAllFlashcards, isInReviewMode, isConnected]);

  // Update refs when state changes
  useEffect(() => {
    logger.log('📋 [Hook] Updating currentCardRef:', currentCard?.id || 'null');
    currentCardRef.current = currentCard;
  }, [currentCard]);

  useEffect(() => {
    logger.log('📋 [Hook] Updating reviewSessionCardsRef, length:', reviewSessionCards.length);
    reviewSessionCardsRef.current = reviewSessionCards;
  }, [reviewSessionCards]);

  useEffect(() => {
    allFlashcardsRef.current = allFlashcards;
  }, [allFlashcards]);

  // Select a random card from the given array or from the session cards
  const selectRandomCard = (cards?: Flashcard[], excludeCurrent: boolean = false) => {
    const cardArray = cards || reviewSessionCards;
    
    logger.log('🎯 [Hook] selectRandomCard called');
    logger.log('🎯 [Hook] cards parameter length:', cards?.length || 'undefined');
    logger.log('🎯 [Hook] reviewSessionCards.length:', reviewSessionCards.length);
    logger.log('🎯 [Hook] cardArray.length:', cardArray.length);
    
    if (cardArray.length === 0) {
      logger.error('🎯 [Hook] ERROR: cardArray is empty in selectRandomCard!');
      currentCardRef.current = null;
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
    // Update ref immediately to prevent race conditions
    currentCardRef.current = newCurrentCard;
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
    
    // CRITICAL: Update ref IMMEDIATELY before state to prevent race conditions
    // This ensures background fetches see the correct card count
    reviewSessionCardsRef.current = remainingCards;
    
    // Then update state for React re-renders
    setReviewSessionCards(remainingCards);
    
    // If there are no more cards, set current card to null
    if (remainingCards.length === 0) {
      logger.log('👉 [Hook] No cards left, exiting review mode');
      // Update ref immediately
      currentCardRef.current = null;
      setCurrentCard(null);
      const wasInReviewMode = isInReviewMode; // Capture state before changing it
      setIsInReviewMode(false);
      // CRITICAL: Only call onSessionFinishing callback if we were actually in review mode
      // In browse mode, we don't want to delay showing the refresh screen
      if (wasInReviewMode && onSessionFinishingRef.current) {
        onSessionFinishingRef.current();
      }
      setIsSessionFinished(true); // Mark session as finished
    } else {
      // Otherwise select a new random card
      const randomIndex = Math.floor(Math.random() * remainingCards.length);
      const nextCard = remainingCards[randomIndex];
      logger.log('👉 [Hook] Selected next card:', nextCard.id);
      // Update ref immediately
      currentCardRef.current = nextCard;
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
    
    // REMOVED: fetchAllFlashcards(true) - causes race conditions
    // Component should handle data fetching separately
  };

  // Start a review session with specific cards (for deck filtering) - ATOMIC OPERATION
  const startReviewWithCards = useCallback((cards: Flashcard[], enableReviewMode: boolean = true) => {
    logger.log('🚀 [Hook] startReviewWithCards called with', cards.length, 'cards', 'enableReviewMode:', enableReviewMode);
    logger.log('🚀 [Hook] Current isInReviewMode:', isInReviewMode);
    logger.log('🚀 [Hook] Current reviewSessionCards.length:', reviewSessionCards.length);
    
    // ATOMIC INITIALIZATION: Set all states together to prevent flicker
    if (cards.length > 0) {
      // Select the card BEFORE setting any state to ensure atomicity
      const randomIndex = Math.floor(Math.random() * cards.length);
      const selectedCard = cards[randomIndex];
      
      logger.log('🚀 [Hook] Selected initial card:', selectedCard.id);
      
      // Update refs IMMEDIATELY (before state) for handlers to use
      // This ensures swipe handlers can find cards even before React re-renders
      reviewSessionCardsRef.current = cards;
      currentCardRef.current = selectedCard;
      
      // Then update state for React re-renders
      setReviewSessionCards(cards);
      setCurrentCard(selectedCard);
      setIsInReviewMode(enableReviewMode); // Use the enableReviewMode parameter
      setIsSessionFinished(false);
      setLoadingState(LoadingState.CONTENT_READY);
      
      logger.log('🚀 [Hook] Session started successfully, review mode:', enableReviewMode);
    } else {
      logger.log('🚀 [Hook] No cards provided, clearing session');
      // Update refs immediately
      reviewSessionCardsRef.current = [];
      currentCardRef.current = null;
      // Then update state
      setReviewSessionCards([]);
      setCurrentCard(null);
      setIsInReviewMode(false);
      // CRITICAL: Don't reset isSessionFinished here - this causes flicker when refresh is pressed
      // Only reset isSessionFinished when actually starting a new session with cards (above)
      // setIsSessionFinished(false);
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
    dataVersion, // Increments when fresh data arrives - use this to trigger re-filtering
    handleSwipeLeft,
    handleSwipeRight,
    resetReviewSession,
    startReviewWithCards,
    selectRandomCard,
    fetchAllFlashcards,
    setCurrentCard,
    removeCardFromSession,
    currentCardRef,           // Export ref for reliable card lookups
    reviewSessionCardsRef,    // Export ref for reliable card lookups
  };
};

// Add default export to satisfy Expo Router's requirement
export default useRandomCardReview; 