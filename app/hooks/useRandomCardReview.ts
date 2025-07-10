import { useState, useEffect, useCallback, useRef } from 'react';
import { getFlashcards } from '../services/supabaseStorage';
import { Flashcard } from '../types/Flashcard';
import { useAuth } from '../context/AuthContext';
import { AppState } from 'react-native';

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
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  
  // Use refs to track the last data state to prevent unnecessary updates
  const lastFetchedCardsRef = useRef<string>("");
  
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

  // Fetch all flashcards and refresh the session
  const fetchAllFlashcards = useCallback(async (forceUpdate = false) => {
    if (isLoading) return; // Prevent concurrent fetches
    
    try {
      // Fetch without setting loading state first to avoid UI flashing
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
           * Avoid showing an intermediate random card on the initial load.
           * We only want to pick a new random card here **if** we are already
           * inside an active review session. When the component first mounts
           * `isInReviewMode` is false; the caller (RandomCardReviewer) will
           * subsequently invoke `startReviewWithCards`, which is the moment we
           * really want to select the first card to review. Skipping the random
           * selection here prevents the brief "flash" of a different card
           * before the session officially starts.
           */
          if (isInReviewMode) {
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
          console.log('📥 [Hook] In review mode - checking for removed cards');
          console.log('📥 [Hook] Current reviewSessionCards.length:', reviewSessionCards.length);
          console.log('📥 [Hook] Database cards.length:', cards.length);
          
          setReviewSessionCards(prevCards => {
            const updatedCards = prevCards.filter(card => 
              cards.some(c => c.id === card.id)
            );
            
            console.log('📥 [Hook] Updated reviewSessionCards.length:', updatedCards.length);
            
            // Only update if there's a change (cards were removed)
            // Important: Do NOT add cards back
            if (updatedCards.length !== prevCards.length) {
              console.log('📥 [Hook] Cards were removed from review session');
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
            console.log('📥 [Hook] Current card was deleted, selecting new one from', validReviewCards.length, 'cards');
            selectRandomCard(validReviewCards);
          } else if (cards.length > 0 && !currentCard) {
            // No current card but we have cards, select one
            console.log('📥 [Hook] No current card but we have cards, selecting one');
            selectRandomCard(cards);
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
        console.log('⏰ [Hook] Polling - fetching all flashcards (not in review mode)');
        fetchAllFlashcards();
      } else {
        console.log('⏰ [Hook] Polling - skipping fetch (in review mode)');
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [user, fetchAllFlashcards, isInReviewMode]);

  // Update refs when state changes
  useEffect(() => {
    console.log('📋 [Hook] Updating currentCardRef:', currentCard?.id || 'null');
    currentCardRef.current = currentCard;
  }, [currentCard]);

  useEffect(() => {
    console.log('📋 [Hook] Updating reviewSessionCardsRef, length:', reviewSessionCards.length);
    reviewSessionCardsRef.current = reviewSessionCards;
  }, [reviewSessionCards]);

  // Select a random card from the given array or from the session cards
  const selectRandomCard = (cards?: Flashcard[], excludeCurrent: boolean = false) => {
    const cardArray = cards || reviewSessionCards;
    
    console.log('🎯 [Hook] selectRandomCard called');
    console.log('🎯 [Hook] cards parameter length:', cards?.length || 'undefined');
    console.log('🎯 [Hook] reviewSessionCards.length:', reviewSessionCards.length);
    console.log('🎯 [Hook] cardArray.length:', cardArray.length);
    
    if (cardArray.length === 0) {
      console.error('🎯 [Hook] ERROR: cardArray is empty in selectRandomCard!');
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
    console.log('🎯 [Hook] Selected card:', newCurrentCard.id);
    setCurrentCard(newCurrentCard);
  };

  // Handle swipe left (keep card in review session)
  const handleSwipeLeft = () => {
    console.log('🔄 [Hook] handleSwipeLeft called');
    console.log('🔄 [Hook] isInReviewMode:', isInReviewMode);
    console.log('🔄 [Hook] reviewSessionCards.length:', reviewSessionCards.length);
    console.log('🔄 [Hook] reviewSessionCardsRef.current.length:', reviewSessionCardsRef.current.length);
    
    // Always ensure we're in review mode
    if (!isInReviewMode) {
      setIsInReviewMode(true);
    }
    
    // Use the ref to avoid relying on potentially stale state while React processes updates
    const sessionCards = reviewSessionCardsRef.current;
    if (sessionCards.length === 0) {
      console.error('🔄 [Hook] ERROR: No cards left in review session!');
      setIsInReviewMode(false);
      setCurrentCard(null);
      return;
    }
    
    // Exclude the current card to ensure a visible change
    selectRandomCard(sessionCards, true);
  };

  // Handle swipe right (dismiss card from review session)
  const handleSwipeRight = () => {
    console.log('👉 [Hook] handleSwipeRight called');
    console.log('👉 [Hook] isInReviewMode:', isInReviewMode);
    console.log('👉 [Hook] reviewSessionCards.length:', reviewSessionCards.length);
    console.log('👉 [Hook] reviewSessionCardsRef.current.length:', reviewSessionCardsRef.current.length);
    
    // Always ensure we're in review mode
    if (!isInReviewMode) {
      setIsInReviewMode(true);
    }
    
    const currentCardValue = currentCardRef.current;
    const reviewSessionCardsValue = reviewSessionCardsRef.current;
    
    if (!currentCardValue || reviewSessionCardsValue.length === 0) {
      console.log('👉 [Hook] No current card or empty session, returning');
      return;
    }
    
    // Remove current card and select next
    const currentCardId = currentCardValue.id;
    console.log('👉 [Hook] Removing card:', currentCardId);
    
    // Calculate remaining cards before removing the current one
    const remainingCards = reviewSessionCardsValue.filter(card => card.id !== currentCardId);
    console.log('👉 [Hook] Remaining cards:', remainingCards.length);
    
    // Remove the card from session
    setReviewSessionCards(remainingCards);
    
    // If there are no more cards, set current card to null and exit review mode
    if (remainingCards.length === 0) {
      console.log('👉 [Hook] No cards left, exiting review mode');
      setCurrentCard(null);
      setIsInReviewMode(false);
      setIsSessionFinished(true); // Mark session as finished
    } else {
      // Otherwise select a new random card
      const randomIndex = Math.floor(Math.random() * remainingCards.length);
      const nextCard = remainingCards[randomIndex];
      console.log('👉 [Hook] Selected next card:', nextCard.id);
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

  // Start a review session with specific cards (for deck filtering)
  const startReviewWithCards = useCallback((cards: Flashcard[]) => {
    console.log('🚀 [Hook] startReviewWithCards called with', cards.length, 'cards');
    console.log('🚀 [Hook] Current isInReviewMode:', isInReviewMode);
    console.log('🚀 [Hook] Current reviewSessionCards.length:', reviewSessionCards.length);
    
    // Set the review session cards to the provided cards
    setReviewSessionCards(cards);
    // Reset session finished status when starting a new session
    setIsSessionFinished(false);
    
    // Select a random card from the provided cards
    if (cards.length > 0) {
      const randomIndex = Math.floor(Math.random() * cards.length);
      console.log('🚀 [Hook] Selected initial card:', cards[randomIndex].id);
      setCurrentCard(cards[randomIndex]);
      // Start review mode when we have cards
      setIsInReviewMode(true);
    } else {
      console.log('🚀 [Hook] No cards provided, setting currentCard to null');
      setCurrentCard(null);
      // Exit review mode when we have no cards
      setIsInReviewMode(false);
    }
  }, []);

  return {
    allFlashcards,
    currentCard,
    reviewSessionCards,
    isInReviewMode,
    isSessionFinished,
    isLoading,
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