import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, PanResponder, Dimensions, Alert } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FlashcardItem from './FlashcardItem';
import { useRandomCardReview, LoadingState } from '../../hooks/useRandomCardReview';
import { getFlashcardsByDecks, getDecks, updateFlashcard, resetSRSProgress } from '../../services/supabaseStorage';
import { Flashcard } from '../../types/Flashcard';
import { COLORS } from '../../constants/colors';
import MultiDeckSelector from './MultiDeckSelector';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useSwipeCounter } from '../../context/SwipeCounterContext';
import { useNetworkState } from '../../services/networkManager';
import OfflineBanner from '../shared/OfflineBanner';
import { registerSyncCallback, unregisterSyncCallback } from '../../services/syncManager';
import { useFocusEffect } from 'expo-router';
import { filterDueCards, calculateNextReviewDate, getNewBoxOnCorrect, getNewBoxOnIncorrect } from '../../constants/leitner';

import { logger } from '../../utils/logger';
// Storage key generator for selected deck IDs (user-specific)
const getSelectedDeckIdsStorageKey = (userId: string) => `selectedDeckIds_${userId}`;
const LEGACY_SELECTED_DECK_IDS_STORAGE_KEY = 'selectedDeckIds'; // For migration

interface RandomCardReviewerProps {
  // Add onCardSwipe callback prop
  onCardSwipe?: () => void;
  // Add callback to notify when content is ready for display
  onContentReady?: (isReady: boolean) => void;
  // Ref for collections button (for walkthrough)
  collectionsButtonRef?: React.RefObject<View>;
  // Walkthrough state
  isWalkthroughActive?: boolean;
  currentWalkthroughStepId?: string;
}

const RandomCardReviewer: React.FC<RandomCardReviewerProps> = ({ onCardSwipe, onContentReady, collectionsButtonRef, isWalkthroughActive = false, currentWalkthroughStepId }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { incrementRightSwipe, incrementLeftSwipe, setDeckCardIds } = useSwipeCounter();
  const { isConnected } = useNetworkState();
  
  // State that needs to be set before session finishes
  const [delaySessionFinish, setDelaySessionFinish] = useState(false);
  const [isTransitionLoading, setIsTransitionLoading] = useState(false);
  
  // Callback to prepare for session finish - must be stable reference
  const handleSessionFinishing = useCallback(() => {
    // CRITICAL: This callback runs BEFORE isSessionFinished is set to true
    // Set delaySessionFinish=true immediately to prevent the finished view from flashing
    setDelaySessionFinish(true);
    setIsTransitionLoading(true);
  }, []);
  
  const {
    currentCard,
    isLoading,
    loadingState,
    error,
    reviewSessionCards,
    isInReviewMode,
    isSessionFinished,
    handleSwipeLeft,
    handleSwipeRight,
    resetReviewSession,
    startReviewWithCards,
    allFlashcards,
    selectRandomCard,
    setCurrentCard,
    removeCardFromSession,
    fetchAllFlashcards
  } = useRandomCardReview(handleSessionFinishing);

  // Internal spacing constants for card layout
  const HEADER_HEIGHT = 45;
  const HEADER_TO_CARD_SPACING = 16;
  const CARD_TO_CONTROLS_SPACING = 12;
  const CONTROLS_HEIGHT = 30; // Increased from 25 to accommodate longer localized text
  const CONTAINER_PADDING_TOP = 10;
  const CONTAINER_PADDING_BOTTOM = 10;
  
  // Calculate total spacing overhead
  const TOTAL_SPACING_OVERHEAD = CONTAINER_PADDING_TOP + HEADER_HEIGHT + HEADER_TO_CARD_SPACING + 
                                  CARD_TO_CONTROLS_SPACING + CONTROLS_HEIGHT + CONTAINER_PADDING_BOTTOM;
  
  // Calculate available space from parent (KanjiScanner provides maxHeight constraint)
  // Parent calculation: SCREEN_HEIGHT - ESTIMATED_TOP_SECTION - REVIEWER_TOP_OFFSET - BUTTON_ROW_HEIGHT - BOTTOM_CLEARANCE
  const { height: SCREEN_HEIGHT } = Dimensions.get('window');
  const ESTIMATED_TOP_SECTION = insets.top + 55;
  const REVIEWER_TOP_OFFSET = 50;
  const BUTTON_HEIGHT = 65;
  const BUTTON_BOTTOM_POSITION = 25;
  const BUTTON_ROW_HEIGHT = BUTTON_HEIGHT + BUTTON_BOTTOM_POSITION + insets.bottom;
  const BOTTOM_CLEARANCE = 50;
  
  // Calculate the actual available height that parent provides
  const AVAILABLE_HEIGHT = SCREEN_HEIGHT - ESTIMATED_TOP_SECTION - REVIEWER_TOP_OFFSET - BUTTON_ROW_HEIGHT - BOTTOM_CLEARANCE;
  
  // Calculate card height by subtracting spacing overhead
  const CALCULATED_CARD_HEIGHT = AVAILABLE_HEIGHT - TOTAL_SPACING_OVERHEAD;
  const CARD_STAGE_HEIGHT = Math.max(200, CALCULATED_CARD_HEIGHT); // Minimum 200px for readability

  // Deck selection state (moved from hook to component)
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [deckIdsLoaded, setDeckIdsLoaded] = useState(false);
  const [filteredCards, setFilteredCards] = useState<Flashcard[]>([]);
  
  // Simplified loading state management for smooth UX
  const [isInitializing, setIsInitializing] = useState(true);
  const [isCardTransitioning, setIsCardTransitioning] = useState(false);
  
  // Prevent multiple initialization calls with refs
  const initializationInProgressRef = useRef(false);
  const lastFilteredCardsHashRef = useRef<string>('');
  
  // Track last content ready state to prevent unnecessary callbacks
  const lastContentReadyRef = useRef<boolean | null>(null);
  const onContentReadyRef = useRef(onContentReady);
  
  // Keep ref updated when callback changes
  useEffect(() => {
    onContentReadyRef.current = onContentReady;
  }, [onContentReady]);
  
  // Track the currently displayed card ID in a ref for swipe tracking
  useEffect(() => {
    if (currentCard?.id) {
      currentDisplayedCardIdRef.current = currentCard.id;
    } else {
      // Clear the ref when there's no current card
      currentDisplayedCardIdRef.current = null;
    }
  }, [currentCard]);
  
  // Fade animation for smooth transitions
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Cancellation-based approach for deck selection operations
  const currentDeckSelectionRef = useRef<number>(0);
  const deckSelectionCancelledRef = useRef(false);

  // Local state for remaining cards count to prevent flickering
  const [remainingCount, setRemainingCount] = useState(reviewSessionCards.length);
  // Track if we're processing an action to prevent double-clicks
  const [isProcessing, setIsProcessing] = useState(false);
  // State for showing the deck selector modal
  const [showDeckSelector, setShowDeckSelector] = useState(false);
  // State to track if image is expanded (to hide controls)
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  // Track the last card ID to prevent duplicate transitions
  const [lastCardId, setLastCardId] = useState<string | null>(null);
  // Track current displayed card ID for swipe tracking
  const currentDisplayedCardIdRef = useRef<string | null>(null);
  // Review Mode state - false = Browse Mode (default), true = Review Mode
  const [isReviewModeActive, setIsReviewModeActive] = useState(false);
  const isReviewModeActiveRef = useRef(isReviewModeActive);
  
  // Display state for button appearance - updates immediately on press to prevent flashing
  const [buttonDisplayActive, setButtonDisplayActive] = useState(false);
  
  // SRS state for tracking review progress
  const [reviewedCount, setReviewedCount] = useState(0); // Cards reviewed in current session (right swipes)
  const [dueCardsCount, setDueCardsCount] = useState(0); // Cards due for review today
  const [totalDeckCards, setTotalDeckCards] = useState(0); // Total cards in selected decks
  const [uniqueRightSwipedIds, setUniqueRightSwipedIds] = useState<Set<string>>(new Set()); // Track unique cards swiped right
  const [isResettingSRS, setIsResettingSRS] = useState(false); // Track if reset is in progress
  
  // Animated value for transition loading overlay
  const transitionLoadingOpacity = useRef(new Animated.Value(0)).current;
  
  // Refs to track and cleanup timeouts
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animated value for SRS counter fade-in
  const srsCounterOpacity = useRef(new Animated.Value(0)).current;
  const [shouldShowCounter, setShouldShowCounter] = useState(false); // Control counter visibility for smooth fade-out
  const isFadingOutRef = useRef(false); // Track if we're currently fading out to prevent conflicts
  
  // Animate counter in/out when Review Mode changes (for manual toggle)
  useEffect(() => {
    // Skip if we're already handling a fade-out from session finish
    if (isFadingOutRef.current && !isReviewModeActive) {
      return;
    }
    
    if (isReviewModeActive) {
      // Show counter and fade in when entering Review Mode
      isFadingOutRef.current = false;
      setShouldShowCounter(true);
      Animated.timing(srsCounterOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (!isFadingOutRef.current) {
      // Fade out when exiting Review Mode (manual toggle)
      Animated.timing(srsCounterOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Hide counter after fade-out animation completes
        setShouldShowCounter(false);
        isFadingOutRef.current = false;
      });
    }
  }, [isReviewModeActive, srsCounterOpacity]);
  
  // Keep ref in sync with state
  useEffect(() => {
    isReviewModeActiveRef.current = isReviewModeActive;
  }, [isReviewModeActive]);
  
  // Sync button display state with actual state (but allow immediate updates on press)
  useEffect(() => {
    if (!isTransitionLoading) {
      setButtonDisplayActive(isReviewModeActive);
    }
  }, [isReviewModeActive, isTransitionLoading]);
  
  
  // Track previous isReviewModeActive to detect actual mode changes vs card changes
  const prevIsReviewModeActiveRef = useRef<boolean | null>(null);
  
  // Animation values - Initialize with proper starting values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Define swipe threshold
  const SWIPE_THRESHOLD = 120;

  // SRS Update Handler - Updates box and nextReviewDate for cards in Review Mode
  const handleSRSUpdate = async (card: Flashcard, isCorrect: boolean) => {
    // Only update SRS data in Review Mode
    if (!isReviewModeActiveRef.current) {
      logger.log('🎯 [SRS] Skipping update - Browse Mode is consequence-free');
      return;
    }

    try {
      const currentBox = card.box ?? 1;
      const newBox = isCorrect 
        ? getNewBoxOnCorrect(currentBox)
        : getNewBoxOnIncorrect();
      
      const newNextReviewDate = calculateNextReviewDate(newBox);
      
      logger.log('🎯 [SRS] Updating card:', card.id, 'Box:', currentBox, '->', newBox, 'Next review:', newNextReviewDate.toISOString().split('T')[0]);
      
      // Update database immediately
      await updateFlashcard({
        ...card,
        box: newBox,
        nextReviewDate: newNextReviewDate,
      });
      
      logger.log('✅ [SRS] Card updated successfully');
    } catch (error) {
      logger.error('❌ [SRS] Error updating card:', error);
    }
  };

  // Reset SRS Progress - Resets all cards in selected decks to box 1 and today's date (for testing)
  const handleResetSRSProgress = async () => {
    if (isResettingSRS || selectedDeckIds.length === 0) {
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      'Reset SRS Progress',
      'This will reset all cards in selected decks to box 1 with today\'s review date. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsResettingSRS(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              
              logger.log('🔄 [SRS Reset] Resetting SRS progress for decks:', selectedDeckIds);
              
              const resetCount = await resetSRSProgress(selectedDeckIds);
              
              if (resetCount >= 0) {
                logger.log(`✅ [SRS Reset] Successfully reset ${resetCount} cards`);
                
                // Refresh the flashcards to reflect the reset
                await fetchAllFlashcards(true);
                
                // Reset counters
                setReviewedCount(0);
                setUniqueRightSwipedIds(new Set());
                
                Alert.alert('Success', `Reset ${resetCount} cards to box 1`);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                logger.error('❌ [SRS Reset] Failed to reset cards');
                Alert.alert('Error', 'Failed to reset cards. Please try again.');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              }
            } catch (error) {
              logger.error('❌ [SRS Reset] Error:', error);
              Alert.alert('Error', 'An error occurred while resetting cards.');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              setIsResettingSRS(false);
            }
          },
        },
      ]
    );
  };

  // Loading animation component - clean spinner without text
  const LoadingCard = () => (
    <View style={styles.cardContainer}>
      <View style={styles.loadingCardContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    </View>
  );

  // Load selected deck IDs from AsyncStorage on initialization (user-specific)
  useEffect(() => {
    const loadSelectedDeckIds = async () => {
      if (!user?.id) {
        logger.log('👤 [Component] No user, skipping deck selection load');
        setDeckIdsLoaded(true);
        return;
      }

      try {
        const userStorageKey = getSelectedDeckIdsStorageKey(user.id);
        logger.log('👤 [Component] Loading deck selection for user:', user.id);
        
        // Try to load user-specific deck selection
        let storedDeckIds = await AsyncStorage.getItem(userStorageKey);
        
        // Migration: If no user-specific data, check for legacy global key
        if (!storedDeckIds) {
          logger.log('👤 [Component] No user-specific deck selection, checking legacy key');
          const legacyDeckIds = await AsyncStorage.getItem(LEGACY_SELECTED_DECK_IDS_STORAGE_KEY);
          
          if (legacyDeckIds) {
            logger.log('👤 [Component] Migrating legacy deck selection to user-specific key');
            // Migrate to user-specific key
            await AsyncStorage.setItem(userStorageKey, legacyDeckIds);
            // Clear the legacy key
            await AsyncStorage.removeItem(LEGACY_SELECTED_DECK_IDS_STORAGE_KEY);
            storedDeckIds = legacyDeckIds;
          }
        }
        
        if (storedDeckIds) {
          const deckIds = JSON.parse(storedDeckIds);
          logger.log('👤 [Component] Loaded deck selection:', deckIds.length, 'decks');
          setSelectedDeckIds(deckIds);
        } else {
          logger.log('👤 [Component] No deck selection found, using all decks');
          setSelectedDeckIds([]);
        }
      } catch (error) {
        logger.error('Error loading selected deck IDs from AsyncStorage:', error);
        setSelectedDeckIds([]);
      } finally {
        setDeckIdsLoaded(true);
      }
    };

    loadSelectedDeckIds();
  }, [user?.id]);

  // Filter cards based on selected decks with proper loading states and operation tracking
  // Includes smart validation: auto-clears invalid deck selections that result in 0 cards
  useEffect(() => {
    const filterCards = async () => {
      if (!deckIdsLoaded) return;
      
      // Start fade-out animation for deck changes after initial load
      if (!isInitializing) {
        setIsCardTransitioning(true);
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
      
      // Get the current operation ID to ensure we're processing the latest request
      const currentOpId = currentDeckSelectionRef.current;
      logger.log('🔍 [Component] Filtering cards for operation:', currentOpId, 'selectedDecks:', selectedDeckIds.length);
      
      if (selectedDeckIds.length > 0) {
        // COLD START PROTECTION: On initial load, wait briefly for cache to initialize
        // This prevents the race condition where deck IDs load before cache is populated
        if (isInitializing && allFlashcards.length === 0 && loadingState === LoadingState.CONTENT_READY) {
          logger.log('🔄 [Component] Cold start detected, waiting for cache initialization...');
          // Give cache a brief moment to populate (100ms should be enough)
          await new Promise(resolve => setTimeout(resolve, 100));
          // Continue regardless - if still empty, user might genuinely have 0 cards
        }
        
        // Fetch cards for selected decks
        try {
          const cards = await getFlashcardsByDecks(selectedDeckIds);
          
          // Check if this operation is still current
          if (currentDeckSelectionRef.current === currentOpId) {
            logger.log('✅ [Component] Filtered cards ready for operation:', currentOpId, 'cards:', cards.length);
            
            // OFFLINE PROTECTION: If we got 0 cards and we're offline,
            // preserve existing filteredCards to avoid clearing the display
            if (cards.length === 0 && !isConnected && filteredCards.length > 0) {
              logger.log('📶 [Offline] Preserving existing cards, cache returned empty');
              // Don't update filteredCards, keep showing what we have
              return;
            }
            
            // If we selected specific decks but got no cards, auto-select first populated deck
            if (selectedDeckIds.length > 0 && cards.length === 0) {
              await ensureSelection();
              return;
            }

            // Preserve user's selection even if it yields 0 cards (empty state handled elsewhere)
            setFilteredCards(cards);
          } else {
            logger.log('🚫 [Component] Filtering cancelled - operation changed from', currentOpId, 'to', currentDeckSelectionRef.current);
          }
        } catch (error) {
          logger.error('Error fetching cards for selected decks:', error);
          if (currentDeckSelectionRef.current === currentOpId) {
            // OFFLINE PROTECTION: Don't clear cards on error if offline and we have existing cards
            if (!isConnected && filteredCards.length > 0) {
              logger.log('📶 [Offline] Preserving existing cards after fetch error');
              return;
            }
            setFilteredCards(allFlashcards);
          }
        }
      } else {
        // Use all cards if no specific decks selected
        if (currentDeckSelectionRef.current === currentOpId) {
          logger.log('✅ [Component] Using all cards for operation:', currentOpId, 'cards:', allFlashcards.length);
          setFilteredCards(allFlashcards);
        }
      }
    };

    filterCards();
  }, [selectedDeckIds, allFlashcards, deckIdsLoaded, user?.id, isConnected]);

  // Create stable card IDs string that only changes when actual IDs change
  const cardIdsString = useMemo(() => {
    // Handle edge case: empty or undefined
    if (!filteredCards || filteredCards.length === 0) {
      return '';
    }
    
    // Create sorted, deduplicated array of IDs
    const uniqueIds = Array.from(new Set(filteredCards.map(card => card.id)));
    return uniqueIds.sort().join(',');
  }, [filteredCards]);

  // Track previous value to prevent unnecessary updates
  const prevCardIdsStringRef = useRef<string>('');

  // Only update context when card IDs actually change
  useEffect(() => {
    if (cardIdsString !== prevCardIdsStringRef.current) {
      prevCardIdsStringRef.current = cardIdsString;
      
      // Extract card IDs from filteredCards (handles empty case)
      const cardIds = filteredCards?.map(card => card.id) || [];
      setDeckCardIds(cardIds);
    }
  }, [cardIdsString, filteredCards, setDeckCardIds]);

  // Update selected deck IDs (user-specific)
  const updateSelectedDeckIds = async (deckIds: string[]) => {
    if (!user?.id) {
      logger.warn('Cannot save deck selection: No user logged in');
      return;
    }

    try {
      setSelectedDeckIds(deckIds);
      const userStorageKey = getSelectedDeckIdsStorageKey(user.id);
      await AsyncStorage.setItem(userStorageKey, JSON.stringify(deckIds));
      logger.log('👤 [Component] Saved deck selection for user:', user.id, '- Decks:', deckIds.length);
    } catch (error) {
      logger.error('Error saving selected deck IDs to AsyncStorage:', error);
    }
  };

  // Minimal helper: ensure we have a valid, populated selection when needed
  const ensureSelection = useCallback(async () => {
    try {
      const decks = await getDecks();
      const firstWithCards = decks.find(d => allFlashcards.some(c => c.deckId === d.id));
      if (firstWithCards) {
        await updateSelectedDeckIds([firstWithCards.id]);
      }
    } catch (e) {
      // Best-effort only; ignore failures
    }
  }, [allFlashcards, updateSelectedDeckIds]);

  // Update remaining count when reviewSessionCards changes
  useEffect(() => {
    // Only update if there's an actual change to prevent unnecessary renders
    if (remainingCount !== reviewSessionCards.length) {
      setRemainingCount(reviewSessionCards.length);
    }
    
    // When we have no remaining cards but currentCard isn't null, we need to force it
    if (reviewSessionCards.length === 0 && currentCard !== null) {
      setCurrentCard(null);
    }
  }, [reviewSessionCards.length, currentCard, setCurrentCard, remainingCount]);

  // Register sync callback for when network comes back online
  useEffect(() => {
    const syncCallback = async () => {
      logger.log('🔄 [RandomCardReviewer] Sync triggered, refreshing cards');
      
      // Re-fetch cards for selected decks
      if (selectedDeckIds.length > 0) {
        try {
          const cards = await getFlashcardsByDecks(selectedDeckIds);
          setFilteredCards(cards);
        } catch (error) {
          logger.error('Error syncing cards:', error);
        }
      }
    };
    
    registerSyncCallback(syncCallback);
    
    return () => {
      unregisterSyncCallback(syncCallback);
    };
  }, [selectedDeckIds]);

  // Simplified card transition handling
  useEffect(() => {
    if (currentCard && 
        currentCard.id !== lastCardId && 
        !isProcessing && 
        !isInitializing) {
      
      logger.log('✅ [Component] Starting smooth card transition for:', currentCard.id);
      
      // Reset position and rotation
      slideAnim.setValue(0);
      rotateAnim.setValue(0);
      
      // Start with card invisible, then fade in
      opacityAnim.setValue(0);
      
      // Simple smooth fade-in animation
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setIsCardTransitioning(false);
        logger.log('✅ [Component] Card transition complete');
      });
      
      setLastCardId(currentCard.id);
    } else if (!currentCard && !isInitializing) {
      // Handle case when no card is selected (not during initialization)
      opacityAnim.setValue(0);
      setLastCardId(null);
      setIsCardTransitioning(false);
    }
  }, [currentCard, lastCardId, isProcessing, isInitializing]);

  // Reset card visibility when transitioning to prevent flashes
  useEffect(() => {
    if (isCardTransitioning) {
      opacityAnim.setValue(0);
      setLastCardId(null);
    }
  }, [isCardTransitioning]);

  // Initialize card opacity to 0 when component first mounts
  useLayoutEffect(() => {
    opacityAnim.setValue(0);
    transitionLoadingOpacity.setValue(0);
  }, []);
  
  // Reset transition loading opacity when loading completes
  useEffect(() => {
    if (!isTransitionLoading) {
      transitionLoadingOpacity.setValue(0);
    }
  }, [isTransitionLoading]);

  // Reset initialization state when component unmounts or remounts
  useEffect(() => {
    return () => {
      // Clean up refs on unmount to prevent stale state
      initializationInProgressRef.current = false;
      lastFilteredCardsHashRef.current = '';
      currentDeckSelectionRef.current = 0;
      deckSelectionCancelledRef.current = false;
      setIsInitializing(true);
      
      // Clean up any pending timeouts
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, []);

  // Notify parent when content is ready for display
  useEffect(() => {
    // Content is ready if we're not initializing, not transitioning, and have finished loading
    // OR if we're offline with cached cards (don't require CONTENT_READY state when offline with data)
    const isContentReady = (!isInitializing && 
                            !isCardTransitioning && 
                            loadingState === LoadingState.CONTENT_READY &&
                            !isLoading) ||
                           (!isConnected && filteredCards.length > 0 && !isInitializing && !isCardTransitioning);
    
    // Only call onContentReady if the state actually changed
    if (lastContentReadyRef.current !== isContentReady && onContentReadyRef.current) {
      lastContentReadyRef.current = isContentReady;
      onContentReadyRef.current(isContentReady);
    }
  }, [isInitializing, isCardTransitioning, loadingState, isLoading, isConnected, filteredCards.length]);

  // Ensure onContentReady is called when the screen comes into focus
  // This fixes the issue where the logo doesn't reappear after navigating back from saved-flashcards
  useFocusEffect(
    useCallback(() => {
      logger.log('🎯 [RandomCardReviewer] Screen focused, checking if content is ready');
      
      // Same logic as the useEffect above, but triggered when screen comes into focus
      const isContentReady = (!isInitializing && 
                              !isCardTransitioning && 
                              loadingState === LoadingState.CONTENT_READY &&
                              !isLoading) ||
                             (!isConnected && filteredCards.length > 0 && !isInitializing && !isCardTransitioning);
      
      logger.log('🎯 [RandomCardReviewer] Content ready status on focus:', isContentReady, {
        isInitializing,
        isCardTransitioning,
        loadingState,
        isLoading,
        isConnected,
        filteredCardsLength: filteredCards.length
      });
      
      // Minimal recovery: if selection is empty but cards exist (e.g., first card added), select first populated deck
      if (selectedDeckIds.length === 0 && allFlashcards.length > 0) {
        ensureSelection();
      }

      // Only call onContentReady if the state actually changed
      if (lastContentReadyRef.current !== isContentReady && onContentReadyRef.current) {
        lastContentReadyRef.current = isContentReady;
        onContentReadyRef.current(isContentReady);
      }
      
      return () => {
        // Cleanup if needed
      };
    }, [isInitializing, isCardTransitioning, loadingState, isLoading, isConnected, filteredCards.length, selectedDeckIds.length, allFlashcards.length, ensureSelection])
  );

  // Configure PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false, // Let scroll events pass through initially
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal movements that are significant
        // This prevents conflict with vertical scrolling
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy * 3);
      },
      onPanResponderGrant: () => {
        // When touch starts
        if (isProcessing) return;
      },
      onPanResponderMove: (_, gestureState) => {
        // Update position as user drags
        slideAnim.setValue(gestureState.dx);
        // Add slight rotation based on the drag distance
        rotateAnim.setValue(gestureState.dx / 20);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isProcessing) {
          return;
        }
        
        // Determine if the user swiped far enough to trigger an action
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swiped right - dismiss card
          completeSwipe('right');
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swiped left - keep card
          completeSwipe('left');
        } else {
          // Not swiped far enough, reset position
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 40,
            friction: 5,
            useNativeDriver: true
          }).start();
          Animated.spring(rotateAnim, {
            toValue: 0,
            tension: 40,
            friction: 5,
            useNativeDriver: true
          }).start();
        }
      }
    })
  ).current;

  // Animate card swipe
  const completeSwipe = (direction: 'left' | 'right') => {
    if (isProcessing) {
      return;
    }
    setIsProcessing(true);
    
    // Capture the current card ID from the ref (which is updated immediately when card changes)
    const cardIdToTrack = currentDisplayedCardIdRef.current;
    
    // Capture the current card for SRS updates
    const cardToUpdate = currentCard;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Increment swipe counters only in Review Mode
    if (isReviewModeActiveRef.current) {
      if (direction === 'left') {
        incrementLeftSwipe();
      } else {
        // Pass the current card ID to track unique right swipes
        if (cardIdToTrack) {
          incrementRightSwipe(cardIdToTrack);
          
          // Track unique right swipes and update reviewed count
          setUniqueRightSwipedIds((prevSet) => {
            const newSet = new Set(prevSet);
            newSet.add(cardIdToTrack);
            // Update reviewed count immediately
            setReviewedCount(newSet.size);
            return newSet;
          });
        }
      }
      
      // Handle SRS updates in Review Mode
      if (cardToUpdate) {
        const isCorrect = direction === 'right'; // Right = remembered, Left = forgot
        handleSRSUpdate(cardToUpdate, isCorrect);
      }
    }
    
    // Trigger the light animation if a callback was provided
    if (onCardSwipe) {
      onCardSwipe();
    }
    
    const targetValue = direction === 'left' ? -400 : 400;
    
    // First animate the card out
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: targetValue,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      // Card is now hidden via opacity animation
      
      // Reset position and rotation for next card
      slideAnim.setValue(0);
      rotateAnim.setValue(0);

      // Reset lastCardId so that even if the same card is kept (left swipe with only one card),
      // the transition effect will treat it as a new card and fade it back in.
      setLastCardId(null);
      
      // Reset image expanded state for the new card
      // (new FlashcardItem will start with showImage: false)
      setIsImageExpanded(false);
      
      // Execute the callback based on direction
      if (direction === 'left') {
        handleSwipeLeft();
      } else {
        handleSwipeRight();
      }
      
      // Processing will be set to false by the card transition useEffect
      // This prevents the jittery behavior by letting the natural transition handle the fade-in
      setTimeout(() => {
        setIsProcessing(false);
      }, 50);
    });
  };

  // Manual button handler to restart review without double initialization
  const onReviewAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reset delay states when starting a new session
    setDelaySessionFinish(false);
    setIsTransitionLoading(false);
    // Restart review session using currently filtered cards to avoid duplicate random selections
    startReviewWithCards(filteredCards);
  };

  const onKeepCard = () => {
    completeSwipe('left');
  };

  const onDismissCard = () => {
    completeSwipe('right');
  };

  // Consolidated initialization and deck change handling with proper loading coordination
  useEffect(() => {
    if (!deckIdsLoaded) return;
    
    const initializeReviewSession = async () => {
      // Wait for hook to reach a stable state, but allow CONTENT_READY to proceed immediately
      if (loadingState === LoadingState.SKELETON_LOADING && allFlashcards.length === 0) {
        logger.log('🔄 [Component] Waiting for hook to load initial data...');
        return;
      }
      
      if (loadingState === LoadingState.ERROR) {
        logger.log('🔄 [Component] Waiting for error state to resolve...');
        return;
      }
      
      // CRITICAL FIX: Don't initialize with 0 cards if we're still loading
      // Only proceed if hook is truly ready with CONTENT_READY state
      if (filteredCards.length === 0 && loadingState !== LoadingState.CONTENT_READY) {
        logger.log('🔄 [Component] Waiting for cards to load (filtered: 0, loadingState:', loadingState, ')');
        return;
      }
      
      // If hook is ready but we have no flashcards at all, mark initialization as complete
      if (loadingState === LoadingState.CONTENT_READY && allFlashcards.length === 0 && filteredCards.length === 0 && isInitializing) {
        logger.log('🔄 [Component] Hook ready with 0 cards, completing initialization');
        setIsInitializing(false);
        lastFilteredCardsHashRef.current = '';
        return;
      }
      
      // Prevent multiple initialization calls for the same cards
      const cardsHash = filteredCards.map(card => card.id).sort().join(',');
      // CRITICAL FIX: Don't treat empty hash as a "duplicate" - it means we're waiting for cards to load
      // Only skip if we actually have cards and they're the same as before
      const isEmptyHash = cardsHash === '';
      if (initializationInProgressRef.current || (!isEmptyHash && cardsHash === lastFilteredCardsHashRef.current)) {
        logger.log('🔄 [Component] Skipping duplicate initialization - inProgress:', initializationInProgressRef.current, 'sameCards:', cardsHash === lastFilteredCardsHashRef.current, 'Op:', currentDeckSelectionRef.current);
        return;
      }
      
      if (filteredCards.length > 0) {
        logger.log('🔄 [Component] Starting review session with', filteredCards.length, 'cards for operation:', currentDeckSelectionRef.current);
        
        // Mark initialization as in progress
        initializationInProgressRef.current = true;
        lastFilteredCardsHashRef.current = cardsHash;
        
        // Capture the current operation ID to ensure we're still processing the right request
        const initOpId = currentDeckSelectionRef.current;
        
        // Start review session atomically
        startReviewWithCards(filteredCards);
        
        // Wait for next tick to ensure hook state is fully updated
        setTimeout(() => {
          // Check if this initialization was cancelled by a new deck selection
          if (deckSelectionCancelledRef.current || currentDeckSelectionRef.current !== initOpId) {
            logger.log('🚫 [Component] Initialization cancelled - operation changed from', initOpId, 'to', currentDeckSelectionRef.current);
            initializationInProgressRef.current = false;
            return;
          }
          
          // Start fade-in animation
          setIsInitializing(false);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
          
          initializationInProgressRef.current = false;
          logger.log('🔄 [Component] Smooth initialization complete (Op:', initOpId, ')');
        }, 10);
      } else {
        // Handle case where no cards are available
        logger.log('🔄 [Component] No cards available after filtering');
        setIsInitializing(false);
        lastFilteredCardsHashRef.current = '';
      }
    };
    
    initializeReviewSession();
  }, [filteredCards, deckIdsLoaded, startReviewWithCards, loadingState, allFlashcards.length, isInitializing]);

  // Reset delay states when session finishes in browse mode (no animation needed)
  useEffect(() => {
    if (isSessionFinished && !isReviewModeActive) {
      // In browse mode, we want to show the finished view immediately
      // Reset any delay states that might be stuck from a previous review session
      setDelaySessionFinish(false);
      setIsTransitionLoading(false);
    }
  }, [isSessionFinished, isReviewModeActive]);
  
  // Automatically disable review mode when session finishes (with fade-out delay)
  useEffect(() => {
    if (isSessionFinished && isReviewModeActive && !isFadingOutRef.current) {
      logger.log('🔄 [Component] Session finished, starting fade-out animation');
      isFadingOutRef.current = true;
      // NOTE: delaySessionFinish and isTransitionLoading are already set by onSessionFinishing callback
      // This prevents the flicker by ensuring they're set BEFORE isSessionFinished becomes true
      
      // Smoothly fade in loading overlay
      Animated.timing(transitionLoadingOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      // Wait a moment for the card animation to complete before fading counter
      setTimeout(() => {
        // Start fade-out animation
        Animated.timing(srsCounterOpacity, {
          toValue: 0,
          duration: 250, // Smooth fade duration
          useNativeDriver: true,
          easing: Animated.ease, // Use ease for smoother animation
        }).start(() => {
          // After fade-out completes, hide counter
          setShouldShowCounter(false);
          // Don't disable review mode - keep it active so session finished view shows correctly
          // The user can manually toggle it off if they want to browse
          setDelaySessionFinish(false); // Allow "session finished" view to show
          
          // Smoothly fade out loading overlay
          Animated.timing(transitionLoadingOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setIsTransitionLoading(false); // Hide loading
          });
          
          isFadingOutRef.current = false;
          logger.log('🔄 [Component] Fade-out complete, showing session finished view');
        });
      }, 100); // Small delay to let card finish animating
    }
  }, [isSessionFinished, isReviewModeActive, srsCounterOpacity, transitionLoadingOpacity]);

  // Filter cards and update counts when Review Mode is toggled
  // CRITICAL FIX: Only call startReviewWithCards when isReviewModeActive ACTUALLY changes
  // (not when filteredCards changes - that's handled by initializeReviewSession)
  useEffect(() => {
    if (!filteredCards || filteredCards.length === 0) {
      setTotalDeckCards(0);
      setDueCardsCount(0);
      prevIsReviewModeActiveRef.current = isReviewModeActive;
      return;
    }

    // Always track total cards in selected decks
    setTotalDeckCards(filteredCards.length);
    
    // Calculate due cards count (always needed for display)
    const dueCards = filterDueCards(filteredCards);
    if (isReviewModeActive) {
      setDueCardsCount(dueCards.length);
    } else {
      setDueCardsCount(filteredCards.length); // In browse mode, all cards are "available"
    }
    
    // CRITICAL: Only call startReviewWithCards if isReviewModeActive actually changed
    // This prevents the duplicate card selection that causes the flash
    const modeActuallyChanged = prevIsReviewModeActiveRef.current !== null && 
                                 prevIsReviewModeActiveRef.current !== isReviewModeActive;
    
    // CRITICAL: Don't change cards during transition loading to prevent flashing
    // Wait until loading overlay is fully visible before changing cards
    if (modeActuallyChanged && !isTransitionLoading) {
      logger.log('📚 [Review Mode] Mode changed to:', isReviewModeActive ? 'Review' : 'Browse');
      
      if (isReviewModeActive) {
        // Entering Review Mode: Filter to due cards only
        if (dueCards.length > 0) {
          startReviewWithCards(dueCards);
        } else {
          startReviewWithCards([]);
        }
      } else {
        // Entering Browse Mode: Show all cards
        startReviewWithCards(filteredCards);
      }
      
      // Reset reviewed count when mode changes
      setReviewedCount(0);
      setUniqueRightSwipedIds(new Set());
    }
    
    // Update the ref for next comparison
    prevIsReviewModeActiveRef.current = isReviewModeActive;
  }, [isReviewModeActive, filteredCards, startReviewWithCards, isTransitionLoading]);

  // Handle deck selection with cancellation-based approach for rapid selections
  const handleDeckSelection = useCallback(async (deckIds: string[]) => {
    // Only do a full reset if the selection actually changed
    if (JSON.stringify(deckIds.sort()) !== JSON.stringify(selectedDeckIds.sort())) {
      // Cancel any previous deck selection operation
      deckSelectionCancelledRef.current = true;
      
      // Create new operation ID
      const operationId = ++currentDeckSelectionRef.current;
      deckSelectionCancelledRef.current = false;
      
      logger.log('🎯 [Component] Deck selection changed, starting transition (Op:', operationId, ')');
      
      // Reset initialization state to allow fresh loading
      initializationInProgressRef.current = false;
      lastFilteredCardsHashRef.current = '';
      
      // Start transition for deck change
      setIsCardTransitioning(true);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      // Hide current card immediately
      setCurrentCard(null);
      
      try {
        // Update deck selection and handle filtering inline to prevent race conditions
        setSelectedDeckIds(deckIds);
        
        // Save to user-specific storage key
        if (user?.id) {
          const userStorageKey = getSelectedDeckIdsStorageKey(user.id);
          await AsyncStorage.setItem(userStorageKey, JSON.stringify(deckIds));
        }
        
        // Immediately filter cards for this operation to prevent race conditions
        let newFilteredCards: Flashcard[];
        if (deckIds.length > 0) {
          try {
            newFilteredCards = await getFlashcardsByDecks(deckIds);
            logger.log('✅ [Component] Inline filtered cards for operation:', operationId, 'cards:', newFilteredCards.length);
          } catch (error) {
            logger.error('Error fetching cards for selected decks:', error);
            newFilteredCards = allFlashcards;
          }
        } else {
          newFilteredCards = allFlashcards;
        }
        
        // Check if this operation was cancelled while we were updating
        if (currentDeckSelectionRef.current !== operationId) {
          logger.log('🚫 [Component] Deck selection cancelled (Op:', operationId, ', Current:', currentDeckSelectionRef.current, ')');
          return;
        }
        
        // Set filtered cards and trigger initialization
        setFilteredCards(newFilteredCards);
        
        logger.log('🎯 [Component] Deck selection update complete (Op:', operationId, ')');
      } catch (error) {
        logger.error('🚫 [Component] Deck selection error (Op:', operationId, '):', error);
      }
    }
    
    setShowDeckSelector(false);
  }, [selectedDeckIds, allFlashcards, setCurrentCard, user?.id]);

  // Memoize the MultiDeckSelector to prevent unnecessary re-renders
  const deckSelector = useMemo(() => (
    <MultiDeckSelector 
      visible={showDeckSelector}
      onClose={() => setShowDeckSelector(false)}
      onSelectDecks={handleDeckSelection}
      initialSelectedDeckIds={selectedDeckIds}
    />
  ), [showDeckSelector, selectedDeckIds, handleDeckSelection]);

  // Interpolate overlay opacities based on swipe distance
  const rightSwipeOpacity = slideAnim.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 0.7],
    extrapolate: 'clamp',
  });

  const leftSwipeOpacity = slideAnim.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [0.7, 0],
    extrapolate: 'clamp',
  });

  // Create dynamic styles based on calculated dimensions
  const styles = useMemo(() => createStyles(
    CONTAINER_PADDING_TOP,
    CONTAINER_PADDING_BOTTOM,
    HEADER_HEIGHT,
    HEADER_TO_CARD_SPACING,
    CARD_STAGE_HEIGHT,
    CARD_TO_CONTROLS_SPACING,
    CONTROLS_HEIGHT
  ), [CONTAINER_PADDING_TOP, CONTAINER_PADDING_BOTTOM, HEADER_HEIGHT, 
      HEADER_TO_CARD_SPACING, CARD_STAGE_HEIGHT, CARD_TO_CONTROLS_SPACING, CONTROLS_HEIGHT]);

  // Industry standard: Only show hook loading for initial data fetch
  if (loadingState === LoadingState.SKELETON_LOADING && isInitializing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View 
            ref={collectionsButtonRef} 
            collapsable={false}
            style={
              isWalkthroughActive && currentWalkthroughStepId === 'collections' 
                ? styles.highlightedCollectionsButtonWrapper 
                : undefined
            }
            pointerEvents={isWalkthroughActive && currentWalkthroughStepId !== 'collections' ? 'none' : 'auto'}
          >
          <TouchableOpacity 
            style={[
              styles.deckButton,
              isWalkthroughActive && currentWalkthroughStepId === 'collections' && { backgroundColor: 'transparent' }
            ]} 
            disabled={isWalkthroughActive && currentWalkthroughStepId !== 'collections'}
          >
              <Ionicons 
                name="albums-outline" 
                size={20} 
                color={COLORS.primary} // Stay blue throughout walkthrough
                style={{ zIndex: 1001 }} // Ensure icon is above yellow background
              />
              <Text 
                style={[
                  styles.deckButtonText,
                  isWalkthroughActive && currentWalkthroughStepId !== 'collections' && styles.deckButtonDisabled
                ]}
              >
                {t('review.collections')}
              </Text>
          </TouchableOpacity>
          </View>
          
          {/* Review Mode Toggle */}
          <TouchableOpacity
            style={[
              styles.reviewModeButton,
              buttonDisplayActive && styles.reviewModeButtonActive,
              styles.deckButtonDisabled
            ]}
            disabled={true}
          >
            <Ionicons 
              name={buttonDisplayActive ? "school" : "school-outline"} 
              size={18} 
              color={buttonDisplayActive ? COLORS.text : COLORS.primary}
            />
            <Text 
              style={[
                styles.reviewModeButtonText,
                buttonDisplayActive && styles.reviewModeButtonTextActive
              ]}
            >
              {t('review.reviewMode')}
            </Text>
          </TouchableOpacity>
          
          {/* Offline Indicator */}
          <OfflineBanner visible={!isConnected} />
        </View>
        <LoadingCard />
        <View style={styles.controlsContainer}>
          <Text style={[styles.countText, { opacity: 0.5 }]}>•••</Text>
        </View>
      </View>
    );
  }

  // Fallback loading spinner for other loading states
  if (isLoading && loadingState !== LoadingState.CONTENT_READY) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={resetReviewSession}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!currentCard && !isInitializing) {
    // No flashcards at all - Show getting started guide
    if (reviewSessionCards.length === 0 && filteredCards.length === 0) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <View 
              ref={collectionsButtonRef} 
              collapsable={false}
              style={
                isWalkthroughActive && currentWalkthroughStepId === 'collections' 
                  ? styles.highlightedCollectionsButtonWrapper 
                  : undefined
              }
              pointerEvents={isWalkthroughActive && currentWalkthroughStepId !== 'collections' ? 'none' : 'auto'}
            >
            <TouchableOpacity 
                style={[
                  styles.deckButton,
                  isWalkthroughActive && currentWalkthroughStepId === 'collections' && { backgroundColor: 'transparent' }
                ]} 
              onPress={() => setShowDeckSelector(true)}
                disabled={isWalkthroughActive && currentWalkthroughStepId !== 'collections'}
            >
                <Ionicons 
                  name="albums-outline" 
                  size={20} 
                  color={COLORS.primary} // Stay blue throughout walkthrough
                  style={{ zIndex: 1001 }} // Ensure icon is above yellow background
                />
                <Text 
                  style={[
                    styles.deckButtonText,
                    isWalkthroughActive && currentWalkthroughStepId !== 'collections' && styles.deckButtonDisabled
                  ]}
                >
                  {t('review.collections')}
                </Text>
            </TouchableOpacity>
            </View>
            
            {/* Review Mode Toggle */}
            <TouchableOpacity
              style={[
                styles.reviewModeButton,
                buttonDisplayActive && styles.reviewModeButtonActive,
              ]}
              onPress={() => {
                // Prevent rapid button presses from causing overlapping transitions
                if (isTransitionLoading || isCardTransitioning || isInitializing) {
                  return;
                }
                
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                
                // Update button appearance immediately to prevent flashing
                setButtonDisplayActive(!buttonDisplayActive);
                
                // Clear any existing timeouts
                if (transitionTimeoutRef.current) {
                  clearTimeout(transitionTimeoutRef.current);
                }
                if (loadingTimeoutRef.current) {
                  clearTimeout(loadingTimeoutRef.current);
                }
                
                setIsTransitionLoading(true);
                
                // Smoothly fade in loading overlay - wait for it to complete before changing mode
                Animated.timing(transitionLoadingOpacity, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }).start(() => {
                  // Only change mode after loading overlay is fully visible to prevent card flashing
                  setIsReviewModeActive(!isReviewModeActive);
                  
                  // Hide loading after cards are ready with smooth fade out
                  loadingTimeoutRef.current = setTimeout(() => {
                    Animated.timing(transitionLoadingOpacity, {
                      toValue: 0,
                      duration: 200,
                      useNativeDriver: true,
                    }).start(() => {
                      setIsTransitionLoading(false);
                      loadingTimeoutRef.current = null;
                    });
                  }, 200);
                });
              }}
            >
              <Ionicons 
                name={buttonDisplayActive ? "school" : "school-outline"} 
                size={18} 
                color={buttonDisplayActive ? COLORS.text : COLORS.primary}
              />
              <Text 
                style={[
                  styles.reviewModeButtonText,
                  buttonDisplayActive && styles.reviewModeButtonTextActive
                ]}
              >
                {t('review.reviewMode')}
              </Text>
            </TouchableOpacity>
            
            {/* Offline Indicator */}
            <OfflineBanner visible={!isConnected} />
          </View>
          <View style={styles.cardStage}>
            <View style={styles.noCardsContainer}>
              {(() => {
                const titleKey = 'review.noCardsInSelectionTitle';
                const subKey = 'review.noCardsInSelectionSubtitle';
                const titleT = t(titleKey);
                const subT = t(subKey);
                const resolvedTitle = titleT === titleKey ? 'No cards to review' : titleT;
                const resolvedSub = subT === subKey ? 'The selected collection(s) contain no cards. Choose a different collection or add cards.' : subT;
                return (
                  <>
                    <Text style={styles.gettingStartedTitle}>{resolvedTitle}</Text>
                    <Text style={styles.gettingStartedSubtitle}>{resolvedSub}</Text>
                  </>
                );
              })()}
              
              <View style={styles.guideItemsContainer}>
                <View style={styles.guideItem}>
                  <Ionicons name="add" size={24} color={COLORS.primary} />
                  <Text style={styles.guideItemText}>{t('review.gettingStarted.addCard')}</Text>
                </View>
                
                <View style={styles.guideItem}>
                  <MaterialCommunityIcons name="cards" size={24} color={COLORS.primary} />
                  <Text style={styles.guideItemText}>{t('review.gettingStarted.viewCards')}</Text>
                </View>
                
                <View style={styles.guideItem}>
                  <Ionicons name="images" size={24} color={COLORS.primary} />
                  <Text style={styles.guideItemText}>{t('review.gettingStarted.uploadImage')}</Text>
                </View>
                
                <View style={styles.guideItem}>
                  <Ionicons name="camera" size={24} color={COLORS.primary} />
                  <Text style={styles.guideItemText}>{t('review.gettingStarted.takePhoto')}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.controlsContainer}>
            <Text style={styles.countText}>{t('review.remaining', { count: 0 })}</Text>
          </View>
          {deckSelector}
        </View>
      );
    }
    // Session finished – show "Review again" option or "No cards due" in Review Mode
    // But delay showing this view if counter is still fading out or if loading transition
    const shouldShowFinishedView = isSessionFinished && !delaySessionFinish && !isTransitionLoading;
    if (shouldShowFinishedView) {
      // Check if this is Review Mode with no cards due vs. completed review session
      const isEmptyReviewMode = isReviewModeActive && dueCardsCount === 0;
      
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <View 
              ref={collectionsButtonRef} 
              collapsable={false}
              style={
                isWalkthroughActive && currentWalkthroughStepId === 'collections' 
                  ? styles.highlightedCollectionsButtonWrapper 
                  : undefined
              }
              pointerEvents={isWalkthroughActive && currentWalkthroughStepId !== 'collections' ? 'none' : 'auto'}
            >
            <TouchableOpacity 
                style={[
                  styles.deckButton,
                  isWalkthroughActive && currentWalkthroughStepId === 'collections' && { backgroundColor: 'transparent' }
                ]} 
              onPress={() => setShowDeckSelector(true)}
                disabled={isWalkthroughActive && currentWalkthroughStepId !== 'collections'}
            >
                <Ionicons 
                  name="albums-outline" 
                  size={20} 
                  color={COLORS.primary} // Stay blue throughout walkthrough
                  style={{ zIndex: 1001 }} // Ensure icon is above yellow background
                />
                <Text 
                  style={[
                    styles.deckButtonText,
                    isWalkthroughActive && currentWalkthroughStepId !== 'collections' && styles.deckButtonDisabled
                  ]}
                >
                  {t('review.collections')}
                </Text>
            </TouchableOpacity>
            </View>
            
            {/* Review Mode Toggle */}
            <TouchableOpacity
              style={[
                styles.reviewModeButton,
                buttonDisplayActive && styles.reviewModeButtonActive,
              ]}
              onPress={() => {
                // Prevent rapid button presses from causing overlapping transitions
                if (isTransitionLoading || isCardTransitioning || isInitializing) {
                  return;
                }
                
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                
                // Update button appearance immediately to prevent flashing
                setButtonDisplayActive(!buttonDisplayActive);
                
                // Clear any existing timeouts
                if (transitionTimeoutRef.current) {
                  clearTimeout(transitionTimeoutRef.current);
                }
                if (loadingTimeoutRef.current) {
                  clearTimeout(loadingTimeoutRef.current);
                }
                
                setIsTransitionLoading(true);
                
                // Smoothly fade in loading overlay - wait for it to complete before changing mode
                Animated.timing(transitionLoadingOpacity, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }).start(() => {
                  // Only change mode after loading overlay is fully visible to prevent card flashing
                  setIsReviewModeActive(!isReviewModeActive);
                  
                  // Hide loading after cards are ready with smooth fade out
                  loadingTimeoutRef.current = setTimeout(() => {
                    Animated.timing(transitionLoadingOpacity, {
                      toValue: 0,
                      duration: 200,
                      useNativeDriver: true,
                    }).start(() => {
                      setIsTransitionLoading(false);
                      loadingTimeoutRef.current = null;
                    });
                  }, 200);
                });
              }}
            >
              <Ionicons 
                name={buttonDisplayActive ? "school" : "school-outline"} 
                size={18} 
                color={buttonDisplayActive ? COLORS.text : COLORS.primary}
              />
              <Text 
                style={[
                  styles.reviewModeButtonText,
                  buttonDisplayActive && styles.reviewModeButtonTextActive
                ]}
              >
                {t('review.reviewMode')}
              </Text>
            </TouchableOpacity>
            
            {/* Offline Indicator */}
            <OfflineBanner visible={!isConnected} />
          </View>
          <View style={styles.cardStage}>
            <View style={styles.noCardsContainer}>
              <Text style={styles.noCardsText}>
                {isEmptyReviewMode ? t('review.noCardsDue') : t('review.finishedReview')}
              </Text>
              {!isEmptyReviewMode && (
                <TouchableOpacity 
                  style={styles.reviewAgainButton} 
                  onPress={onReviewAgain}
                >
                  <Text style={styles.reviewAgainText}>{t('review.reviewAgain')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.controlsContainer}>
            <Text style={styles.countText}>
              {t('review.remaining', { count: 0 })}
            </Text>
          </View>
          {deckSelector}
        </View>
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View 
          ref={collectionsButtonRef} 
          collapsable={false}
          style={
            isWalkthroughActive && currentWalkthroughStepId === 'collections' 
              ? styles.highlightedCollectionsButtonWrapper 
              : undefined
          }
          pointerEvents={isWalkthroughActive && currentWalkthroughStepId !== 'collections' ? 'none' : 'auto'}
        >
        <TouchableOpacity 
            style={[
              styles.deckButton,
                  isWalkthroughActive && currentWalkthroughStepId === 'collections' && { backgroundColor: 'transparent' },
                  // Keep full opacity during walkthrough; only dim when not in walkthrough and disabled
                  (!isWalkthroughActive && (isCardTransitioning || isInitializing)) && styles.deckButtonDisabled
            ]} 
          onPress={() => {
              if (!isWalkthroughActive || currentWalkthroughStepId === 'collections') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowDeckSelector(true);
              }
          }}
            disabled={isCardTransitioning || isInitializing || (isWalkthroughActive && currentWalkthroughStepId !== 'collections')}
        >
            <Ionicons 
              name="albums-outline" 
              size={20} 
                  color={COLORS.primary} // Stay blue throughout walkthrough
              style={{ zIndex: 1001 }} // Ensure icon is above yellow background
            />
            <Text 
              style={[
                styles.deckButtonText,
                isWalkthroughActive && currentWalkthroughStepId !== 'collections' && styles.deckButtonDisabled
              ]}
            >
              {t('review.collections')}
            </Text>
        </TouchableOpacity>
        </View>
        
        {/* Review Mode Toggle */}
        <TouchableOpacity
          style={[
            styles.reviewModeButton,
            buttonDisplayActive && styles.reviewModeButtonActive,
            (!isWalkthroughActive && (isCardTransitioning || isInitializing)) && styles.deckButtonDisabled,
            isResettingSRS && { opacity: 0.6 }
          ]}
          onPress={() => {
            // Prevent rapid button presses from causing overlapping transitions
            if (isTransitionLoading || isCardTransitioning || isInitializing) {
              return;
            }
            
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            
            // Update button appearance immediately to prevent flashing
            setButtonDisplayActive(!buttonDisplayActive);
            
            // Clear any existing timeouts
            if (transitionTimeoutRef.current) {
              clearTimeout(transitionTimeoutRef.current);
            }
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
            }
            
            setIsTransitionLoading(true);
            
            // Smoothly fade in loading overlay - wait for it to complete before changing mode
            Animated.timing(transitionLoadingOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              // Only change mode after loading overlay is fully visible to prevent card flashing
              setIsReviewModeActive(!isReviewModeActive);
              
              // Hide loading after cards are ready with smooth fade out
              loadingTimeoutRef.current = setTimeout(() => {
                Animated.timing(transitionLoadingOpacity, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }).start(() => {
                  setIsTransitionLoading(false);
                  loadingTimeoutRef.current = null;
                });
              }, 200);
            });
          }}
          onLongPress={handleResetSRSProgress}
          disabled={isCardTransitioning || isInitializing || isResettingSRS}
        >
          <Ionicons 
            name={buttonDisplayActive ? "school" : "school-outline"} 
            size={18} 
            color={buttonDisplayActive ? COLORS.text : COLORS.primary}
          />
          <Text 
            style={[
              styles.reviewModeButtonText,
              buttonDisplayActive && styles.reviewModeButtonTextActive
            ]}
          >
            {t('review.reviewMode')}
          </Text>
        </TouchableOpacity>
        
        {/* SRS Counter - Only visible in Review Mode, positioned right after Review button */}
        {shouldShowCounter && (
          <Animated.View style={{ opacity: srsCounterOpacity, marginLeft: 8 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                padding: 0,
                borderRadius: 8,
                minWidth: 90,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* Left side: Green background with X/Y */}
              <View
                style={{
                  backgroundColor: 'rgba(52, 199, 89, 0.5)', // 50% transparent green
                  paddingVertical: 10,
                  paddingLeft: 8,
                  paddingRight: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderTopLeftRadius: 8,
                  borderBottomLeftRadius: 8,
                }}
              >
                <Text
                  allowFontScaling={false}
                  suppressHighlighting={true}
                  style={{
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: '900',
                    opacity: 0.7,
                  }}
                >
                  {reviewedCount}/{dueCardsCount}
                </Text>
              </View>
              {/* Right side: Purple background with Z */}
              <View
                style={{
                  backgroundColor: 'rgba(138, 43, 226, 0.5)', // 50% transparent purple
                  paddingVertical: 10,
                  paddingLeft: 6,
                  paddingRight: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderTopRightRadius: 8,
                  borderBottomRightRadius: 8,
                }}
              >
                <Text
                  allowFontScaling={false}
                  suppressHighlighting={true}
                  style={{
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: '900',
                    opacity: 0.7,
                  }}
                >
                  {totalDeckCards}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
        
        {/* Offline Indicator - compact square next to Collections button */}
        <OfflineBanner visible={!isConnected} />
      </View>
      
      <View style={styles.cardStage}>
        {/* Show loading during transitions or mode changes, otherwise show card if available */}
        {isCardTransitioning ? (
          <LoadingCard />
        ) : currentCard ? (
          <Animated.View 
            style={[
              styles.cardContainer, 
              { 
                transform: [
                  { translateX: slideAnim },
                  { rotate: rotateAnim.interpolate({
                    inputRange: [-300, 0, 300],
                    outputRange: ['-10deg', '0deg', '10deg']
                  }) }
                ],
                opacity: isInitializing ? fadeAnim : opacityAnim
              }
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.cardWithOverlayWrapper}>
              <FlashcardItem 
                key={currentCard.id}
                flashcard={currentCard} 
                disableTouchHandling={false}
                cardHeight={CARD_STAGE_HEIGHT}
                onImageToggle={(showImage) => {
                  setIsImageExpanded(showImage);
                }}
                isReviewModeActive={isReviewModeActive}
              />
              {/* Right swipe overlay - Green with checkmark - Only show in Review Mode */}
              {isReviewModeActive && (
                <Animated.View 
                  style={[
                    styles.swipeOverlay,
                    styles.swipeOverlayRight,
                    { opacity: rightSwipeOpacity }
                  ]}
                  pointerEvents="none"
                >
                  <Ionicons name="checkmark-circle" size={80} color={COLORS.text} />
                </Animated.View>
              )}
              {/* Left swipe overlay - Orange with loop/replay - Only show in Review Mode */}
              {isReviewModeActive && (
                <Animated.View 
                  style={[
                    styles.swipeOverlay,
                    styles.swipeOverlayLeft,
                    { opacity: leftSwipeOpacity }
                  ]}
                  pointerEvents="none"
                >
                  <Ionicons name="refresh" size={80} color={COLORS.text} />
                </Animated.View>
              )}
              {/* Transition loading overlay - smooth fade in/out without layout shift */}
              {isTransitionLoading && (
                <Animated.View 
                  style={[
                    styles.transitionLoadingOverlay,
                    { opacity: transitionLoadingOpacity }
                  ]}
                  pointerEvents="none"
                >
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </Animated.View>
              )}
            </View>
          </Animated.View>
        ) : isInitializing ? (
          <LoadingCard />
        ) : null}
      </View>

      {!isImageExpanded && (
        <View style={styles.controlsContainer}>
          <Text style={styles.countText}>
            {!isInitializing && !isCardTransitioning 
              ? t('review.remaining', { count: remainingCount })
              : '•••'}
          </Text>
        </View>
      )}
      
      {deckSelector}
    </View>
  );
};

// Create styles dynamically based on calculated dimensions
const createStyles = (
  containerPaddingTop: number,
  containerPaddingBottom: number,
  headerHeight: number,
  headerToCardSpacing: number,
  cardStageHeight: number,
  cardToControlsSpacing: number,
  controlsHeight: number
) => StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 0,
    paddingTop: containerPaddingTop,
    paddingHorizontal: 0,
    paddingBottom: containerPaddingBottom,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    // Fill all available space provided by parent's maxHeight constraint
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    width: '100%',
    height: headerHeight,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginBottom: headerToCardSpacing, // 16pt spacing between header and card
  },
  deckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 1001, // Ensure button content is above wrapper background
    position: 'relative', // Create stacking context for icon and text
    elevation: 13, // Android elevation to ensure it's above wrapper
  },
  deckButtonDisabled: {
    opacity: 0.5,
  },
  deckButtonText: {
    color: COLORS.primary,
    marginLeft: 4,
    fontWeight: '500',
    zIndex: 1001, // Ensure text is above the yellow background
  },
  reviewModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginLeft: 8, // Space between Collections button and Review Mode button
    zIndex: 1001,
    position: 'relative',
    elevation: 13,
  },
  reviewModeButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  reviewModeButtonText: {
    color: COLORS.primary,
    marginLeft: 4,
    fontWeight: '500',
    zIndex: 1001,
  },
  reviewModeButtonTextActive: {
    color: COLORS.text,
  },
  highlightedCollectionsButtonWrapper: {
    borderRadius: 11, // Slightly larger to accommodate padding
    padding: 3,
    backgroundColor: '#FFFF00', // Bright yellow background like other buttons
    shadowColor: '#FFFF00',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 1000, // Ensure it's above other elements
    overflow: 'visible', // Ensure children are visible
    position: 'relative', // Create stacking context for children
  },
  cardStage: {
    width: '100%',
    minHeight: cardStageHeight, // Minimum height for readability
    flex: 1, // Expand to fill available space
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    marginBottom: cardToControlsSpacing, // Proper spacing between card and controls
  },
  cardContainer: {
    width: '100%',
    flex: 1, // Expand to fill available space
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cardWithOverlayWrapper: {
    width: '100%',
    position: 'relative',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: controlsHeight,
    paddingTop: 0, // Spacing handled by cardStage marginBottom (12pt)
    paddingHorizontal: 16, // Add horizontal padding to prevent edge overflow
  },
  countText: {
    color: '#b3b3b3',
    fontSize: 12,
    textAlign: 'center',
    flexShrink: 1, // Allow text to shrink if needed
    flexWrap: 'wrap', // Allow text to wrap on smaller screens
  },
  loadingCardContainer: {
    width: '100%',
    minHeight: cardStageHeight, // Minimum height for readability
    flex: 1, // Expand to fill available space
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  errorText: {
    color: COLORS.danger,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  noCardsContainer: {
    width: '100%',
    minHeight: cardStageHeight, // Minimum height for readability
    flex: 1, // Expand to fill available space
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 15,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  noCardsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  guidanceText: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  reviewAgainButton: {
    backgroundColor: COLORS.mediumSurface,
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 8,
    marginTop: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  reviewAgainText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  gettingStartedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  gettingStartedSubtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    textAlign: 'center',
    marginBottom: 24,
  },
  guideItemsContainer: {
    width: '100%',
    paddingHorizontal: 10,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  guideItemText: {
    fontSize: 15,
    color: COLORS.text,
    marginLeft: 16,
    flex: 1,
  },
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    zIndex: 100, // Above the FlashcardItem
    elevation: 100, // For Android
  },
  swipeOverlayRight: {
    backgroundColor: COLORS.success,
  },
  swipeOverlayLeft: {
    backgroundColor: COLORS.secondary,
  },
  transitionLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 15,
    zIndex: 200, // Above the card content but below swipe overlays
    elevation: 200, // For Android
  },
});

export default RandomCardReviewer; 