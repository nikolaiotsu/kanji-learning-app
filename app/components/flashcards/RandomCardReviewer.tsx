import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, PanResponder, Dimensions, Alert, Easing, Modal } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FlashcardItem from './FlashcardItem';
import { useRandomCardReview, LoadingState } from '../../hooks/useRandomCardReview';
import { getDecks, updateFlashcard, resetSRSProgress, refreshDecksFromServer } from '../../services/supabaseStorage';
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
import { getLocalDateString } from '../../utils/dateUtils';

// Create AnimatedTouchableOpacity to support animated border colors without re-renders
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// Storage key generator for selected deck IDs (user-specific)
const getSelectedDeckIdsStorageKey = (userId: string) => `selectedDeckIds_${userId}`;
const LEGACY_SELECTED_DECK_IDS_STORAGE_KEY = 'selectedDeckIds'; // For migration

// Storage key generator for daily review stats (user-specific)
const getDailyReviewStatsStorageKey = (userId: string) => `dailyReviewStats_${userId}`;

// Interface for daily review stats stored in AsyncStorage
interface DailyReviewStats {
  date: string; // YYYY-MM-DD format
  reviewedCardIds: string[]; // IDs of cards reviewed today (unique)
}

interface RandomCardReviewerProps {
  // Add onCardSwipe callback prop
  onCardSwipe?: () => void;
  // Add callback to notify when content is ready for display
  onContentReady?: (isReady: boolean) => void;
  // Ref for collections button (for walkthrough)
  collectionsButtonRef?: React.RefObject<View>;
  // Ref for review button (for walkthrough)
  reviewButtonRef?: React.RefObject<View>;
  // Walkthrough state
  isWalkthroughActive?: boolean;
  currentWalkthroughStepId?: string;
}

const RandomCardReviewer: React.FC<RandomCardReviewerProps> = ({ onCardSwipe, onContentReady, collectionsButtonRef, reviewButtonRef, isWalkthroughActive = false, currentWalkthroughStepId }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { incrementRightSwipe, incrementLeftSwipe, streakCount, setDeckCardIds, resetSwipeCounts } = useSwipeCounter();
  const { isConnected } = useNetworkState();
  
  // State that needs to be set before session finishes
  const [delaySessionFinish, setDelaySessionFinish] = useState(false);
  const [isTransitionLoading, setIsTransitionLoading] = useState(false);
  const [showStreakCongratsOverlay, setShowStreakCongratsOverlay] = useState(false);
  
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
    fetchAllFlashcards,
    dataVersion, // Used to detect when fresh data arrives from background fetch
    currentCardRef,           // Use refs for reliable card lookups
    reviewSessionCardsRef,    // Use refs for reliable card lookups
  } = useRandomCardReview(handleSessionFinishing);

  // Internal spacing constants for card layout
  const HEADER_HEIGHT = 45;
  const HEADER_TO_CARD_SPACING = 16;
  const CARD_TO_CONTROLS_SPACING = 12;
  const CONTROLS_HEIGHT = 36; // Increased to ensure vertical stability
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
  
  // INDUSTRY STANDARD: Derived state using useMemo
  // This eliminates race conditions by computing filteredCards synchronously
  // whenever selectedDeckIds or allFlashcards changes
  const filteredCards = useMemo(() => {
    // GATE A: Don't filter until deck IDs are loaded from storage
    if (!deckIdsLoaded) {
      logger.log('🔍 [useMemo] Waiting for deckIds to load...');
      return [];
    }
    // Allow filtering immediately even before CONTENT_READY so UI stays responsive
    // If no decks selected, return empty array to show "no cards to review" screen
    if (selectedDeckIds.length === 0) {
      logger.log('🔍 [useMemo] No decks selected, returning empty array to show "no cards" screen');
      return [];
    }
    // Filter cards by selected deck IDs
    const filtered = allFlashcards.filter(card => selectedDeckIds.includes(card.deckId));
    logger.log('🔍 [useMemo] Filtered', allFlashcards.length, 'cards by', selectedDeckIds.length, 'decks →', filtered.length, 'cards');
    return filtered;
  }, [selectedDeckIds, allFlashcards, deckIdsLoaded]);

  // Simplified loading state management for smooth UX
  const [isInitializing, setIsInitializing] = useState(true);
  const [isCardTransitioning, setIsCardTransitioning] = useState(false);
  
  // Prevent multiple initialization calls with refs
  const initializationInProgressRef = useRef(false);
  const lastFilteredCardsHashRef = useRef<string>('');
  const delayedCompletionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
  // SRS Mode state - false = Browse Mode (default), true = SRS Mode
  const [isSrsModeActive, setIsSrsModeActive] = useState(false);
  const isSrsModeActiveRef = useRef(isSrsModeActive);
  
  // Check if there are cards due for review in the selected decks
  // Uses allFlashcards directly to avoid false negatives during cache refetch
  // Also checks reviewSessionCards as fallback when cache is stale (e.g., after exiting review mode)
  // Recalculates when allFlashcards, selectedDeckIds, deckIdsLoaded, reviewSessionCards, or isSrsModeActive changes
  // Note: isSrsModeActive is included to force recalculation when toggling modes
  const hasCardsDueForReview = useMemo(() => {
    // Don't check until deck IDs are loaded
    if (!deckIdsLoaded) return false;
    
    // If no decks selected, no cards due
    if (selectedDeckIds.length === 0) return false;
    
    // Filter cards by selected deck IDs directly from allFlashcards
    // This is more reliable than using filteredCards which might be temporarily empty during cache refetch
    let cardsInSelectedDecks = allFlashcards.filter(card => selectedDeckIds.includes(card.deckId));
    
    // If allFlashcards doesn't have cards from selected decks (cache might be stale),
    // also check reviewSessionCards as a fallback - these cards were in the session and should still be due
    if (cardsInSelectedDecks.length === 0 && reviewSessionCards.length > 0) {
      const sessionCardsInSelectedDecks = reviewSessionCards.filter(card => selectedDeckIds.includes(card.deckId));
      if (sessionCardsInSelectedDecks.length > 0) {
        logger.log('🌈 [Rainbow Border] Using reviewSessionCards as fallback - allFlashcards empty, sessionCards:', sessionCardsInSelectedDecks.length);
        cardsInSelectedDecks = sessionCardsInSelectedDecks;
      }
    }
    
    if (cardsInSelectedDecks.length === 0) return false;
    
    // Check if any of these cards are due for review
    const dueCards = filterDueCards(cardsInSelectedDecks);
    const result = dueCards.length > 0;
    logger.log('🌈 [Rainbow Border] hasCardsDueForReview recalculated:', result, 'due cards:', dueCards.length, 'total in decks:', cardsInSelectedDecks.length, 'isSrsModeActive:', isSrsModeActive, 'source:', cardsInSelectedDecks.length > 0 && allFlashcards.filter(card => selectedDeckIds.includes(card.deckId)).length === 0 ? 'reviewSessionCards' : 'allFlashcards');
    return result;
  }, [allFlashcards, selectedDeckIds, deckIdsLoaded, reviewSessionCards, isSrsModeActive]);
  
  // Display state for button appearance - updates immediately on press to prevent flashing
  const [buttonDisplayActive, setButtonDisplayActive] = useState(false);
  
  // SRS state for tracking review progress
  const [dueCardsCount, setDueCardsCount] = useState(0); // Cards due for review today (locked when session starts)
  const [sessionStartDueCount, setSessionStartDueCount] = useState(0); // Initial due cards count when session started (NEVER changes during session)
  const [totalDeckCards, setTotalDeckCards] = useState(0); // Total cards in selected decks (STABLE COUNTER)
  const totalDeckCardsRef = useRef(0); // Ref to store stable count, unaffected by data changes
  const [dailyReviewedCardIds, setDailyReviewedCardIds] = useState<Set<string>>(new Set()); // Track unique cards reviewed today (persisted)
  const [dailyStatsLoaded, setDailyStatsLoaded] = useState(false); // Track if daily stats are loaded from storage
  const [sessionSwipedCardIds, setSessionSwipedCardIds] = useState<Set<string>>(new Set()); // Track cards swiped right in current review session
  const [isResettingSRS, setIsResettingSRS] = useState(false); // Track if reset is in progress
  
  // Derive reviewedCount from dailyReviewedCardIds filtered by current deck selection
  // This makes the counter deck-aware: only shows cards reviewed from selected decks
  const reviewedCount = useMemo(() => {
    if (dailyReviewedCardIds.size === 0 || filteredCards.length === 0) return 0;
    const filteredCardIds = new Set(filteredCards.map(c => c.id));
    return Array.from(dailyReviewedCardIds).filter(id => filteredCardIds.has(id)).length;
  }, [dailyReviewedCardIds, filteredCards]);
  
  // Animated value for transition loading overlay
  const transitionLoadingOpacity = useRef(new Animated.Value(0)).current;
  
  // Refs to track and cleanup timeouts
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animated value for SRS counter fade-in
  const srsCounterOpacity = useRef(new Animated.Value(0)).current;
  const [shouldShowCounter, setShouldShowCounter] = useState(false); // Control counter visibility for smooth fade-out
  const [isFadingOut, setIsFadingOut] = useState(false); // Track if we're currently fading out - use STATE so useMemo re-renders
  const noCardsMessageOpacity = useRef(new Animated.Value(0)).current; // Animation for no cards message
  // Store session counter values during fade-out to prevent value changes
  const [fadeOutSwipedCount, setFadeOutSwipedCount] = useState<number | null>(null);
  const [fadeOutDueCount, setFadeOutDueCount] = useState<number | null>(null);
  const [fadeOutTotalDeckCards, setFadeOutTotalDeckCards] = useState<number | null>(null);

  // Rainbow border animation for review button - uses interpolate instead of setState to prevent re-renders
  const reviewButtonRainbowAnim = useRef(new Animated.Value(0)).current;
  const rainbowAnimationLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  
  // Completion pulse animation - single rainbow cycle when review finishes
  // Value goes from 0 to 2: 0-1 = rainbow cycle, 1-2 = fade out
  const completionPulseAnim = useRef(new Animated.Value(0)).current;
  const wasSessionFinishedRef = useRef(false);
  const [showCompletionPulse, setShowCompletionPulse] = useState(false);

  // Floating animation for streak congrats modal (fire + number)
  const streakCongratsFloatAnim = useRef(new Animated.Value(0)).current;
  const streakCongratsFloatLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const streakCongratsFloatTranslateY = streakCongratsFloatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  // Create interpolated color value directly - no setState means no re-renders during animation
  const reviewButtonRainbowColor = reviewButtonRainbowAnim.interpolate({
    inputRange: [0, 0.166, 0.333, 0.5, 0.666, 0.833, 1],
    outputRange: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#FF0000'],
  });
  
  // Completion pulse rainbow color - cycles through colors once, then fades out slowly
  // Phase 1 (0-1): Full rainbow cycle with full opacity
  // Phase 2 (1-2): Fade out by interpolating to transparent/default color
  const completionPulseColor = completionPulseAnim.interpolate({
    inputRange: [0, 0.166, 0.333, 0.5, 0.666, 0.833, 1, 1.2, 1.4, 1.6, 1.8, 2],
    outputRange: [
      'rgba(255, 0, 0, 1)',           // Red - full opacity
      'rgba(255, 127, 0, 1)',         // Orange - full opacity
      'rgba(255, 255, 0, 1)',         // Yellow - full opacity
      'rgba(0, 255, 0, 1)',          // Green - full opacity
      'rgba(0, 0, 255, 1)',           // Blue - full opacity
      'rgba(148, 0, 211, 1)',         // Violet - full opacity
      'rgba(255, 0, 0, 1)',           // Back to red - full opacity (end of cycle)
      'rgba(255, 0, 0, 0.7)',        // Start fade: red at 70% opacity
      'rgba(255, 0, 0, 0.4)',        // Continue fade: red at 40% opacity
      'rgba(59, 130, 246, 0.2)',     // Transition to default blue at 20% opacity
      'rgba(59, 130, 246, 0.05)',   // Almost transparent
      'rgba(59, 130, 246, 0)',      // Fully transparent (default border color)
    ],
  });

  // Helper: Determine if rainbow border should be shown on review button
  // Shows rainbow border when cards are due, not in SRS mode, and session is not finished
  const shouldShowRainbowBorder = useMemo(() => {
    return hasCardsDueForReview && !isSrsModeActive && !isSessionFinished;
  }, [hasCardsDueForReview, isSrsModeActive, isSessionFinished]);

  // Reusable rainbow border style object - prevents duplication across 4 button instances
  const rainbowBorderStyle = useMemo(() => {
    return shouldShowRainbowBorder 
      ? { borderColor: reviewButtonRainbowColor, borderWidth: 2 }
      : undefined;
  }, [shouldShowRainbowBorder, reviewButtonRainbowColor]);
  
  // Completion pulse style - applied when session finishes for dopamine boost
  // Uses animated opacity to smoothly fade in/out the rainbow border
  // Border width stays constant - no size change, just color animation
  const completionPulseStyle = useMemo(() => {
    return {
      borderColor: completionPulseColor,
      borderWidth: 1, // Match the default border width to prevent layout shifts
    };
  }, [completionPulseColor]);

  // Separate effect to update total cards in selected decks - STABLE COUNTER
  // This counter updates when deck selection changes OR when cards are added to selected decks
  // CRITICAL: Don't update during fade-out or active review sessions to prevent flicker
  const prevSelectedDeckIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (!deckIdsLoaded) {
      totalDeckCardsRef.current = 0;
      setTotalDeckCards(0);
      return;
    }

    // Calculate current total cards in selected decks
    let totalCards = 0;
    if (selectedDeckIds.length === 0) {
      // No decks selected - show 0 cards (will display "no cards to review" screen)
      totalCards = 0;
    } else {
      totalCards = allFlashcards.filter(card => selectedDeckIds.includes(card.deckId)).length;
    }

    // Check if deck selection changed
    const deckSelectionChanged = JSON.stringify(prevSelectedDeckIdsRef.current.sort()) !== JSON.stringify(selectedDeckIds.sort());
    
    // CRITICAL: During active review sessions, only update if deck selection changed
    // This prevents the counter from flickering to 0 when background fetches temporarily
    // return empty or stale data during card swipes
    const isActiveReviewSession = isInReviewMode && reviewSessionCards.length > 0;
    const countChanged = totalCards !== totalDeckCardsRef.current;
    
    // Update if:
    // 1. Deck selection changed (always update), OR
    // 2. Count changed AND we're not in an active review session (to prevent flicker during swipes)
    if (deckSelectionChanged || (countChanged && !isActiveReviewSession)) {
      // Store in ref (always update ref to keep it current)
      totalDeckCardsRef.current = totalCards;
      prevSelectedDeckIdsRef.current = [...selectedDeckIds];
      
      // CRITICAL: Don't update state during fade-out to prevent flicker
      // The ref is updated so when fade-out completes, we'll have the correct value
      if (!isFadingOut) {
        setTotalDeckCards(totalCards);
        logger.log('🃏 [Counter] Total cards in selected decks updated:', totalCards, 'for decks:', selectedDeckIds.length, deckSelectionChanged ? '(deck selection changed)' : '(card count changed)');
      } else {
        logger.log('🃏 [Counter] Total cards recalculated during fade-out, ref updated but state preserved:', totalCards, 'current state:', totalDeckCards);
      }
    } else if (countChanged && isActiveReviewSession) {
      logger.log('🃏 [Counter] Skipping update during active review session to prevent flicker. Current count:', totalDeckCardsRef.current, 'Calculated:', totalCards);
    }
  }, [selectedDeckIds, deckIdsLoaded, allFlashcards, isFadingOut, isInReviewMode, reviewSessionCards.length]); // Runs on data changes, updates counter when deck selection or card count changes

  // Memoize counter display value to prevent flicker during mode transitions
  // Priority: fade-out values (frozen) > session values > browse values
  // Using state for isFadingOut ensures this recalculates on mode change
  const counterDisplayValue = useMemo(() => {
    if (isFadingOut && fadeOutSwipedCount !== null && fadeOutDueCount !== null) {
      return `${fadeOutSwipedCount}/${fadeOutDueCount}`;
    }
    if (isSrsModeActive) {
      return `${sessionSwipedCardIds.size}/${sessionStartDueCount || dueCardsCount}`;
    }
    return `${reviewedCount}/${dueCardsCount}`;
  }, [
    isSrsModeActive, 
    sessionSwipedCardIds.size, 
    sessionStartDueCount, 
    dueCardsCount, 
    reviewedCount, 
    isFadingOut,
    fadeOutSwipedCount, 
    fadeOutDueCount
  ]);
  
  // Animate counter in/out when SRS Mode changes (for manual toggle)
  useEffect(() => {
    if (isSrsModeActive) {
      // Show counter and fade in when entering SRS Mode
      setIsFadingOut(false);
      setFadeOutSwipedCount(null);
      setFadeOutDueCount(null);
      setFadeOutTotalDeckCards(null);
      setShouldShowCounter(true);
      Animated.timing(srsCounterOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Fade out when exiting SRS Mode
      // Only fade out if counter is currently visible
      if (shouldShowCounter) {
        // Note: Values should already be captured by the button handler
        // This is a fallback if they weren't captured
        if (fadeOutSwipedCount === null) {
          setFadeOutSwipedCount(sessionSwipedCardIds.size);
          setFadeOutDueCount(sessionStartDueCount || dueCardsCount);
          setFadeOutTotalDeckCards(totalDeckCards);
        }
        
        // Ensure fade-out state is set
        if (!isFadingOut) {
          setIsFadingOut(true);
        }
        
        // Start fade-out animation
        Animated.timing(srsCounterOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          // Hide counter after fade-out animation completes
          setShouldShowCounter(false);
          setIsFadingOut(false);
          setFadeOutSwipedCount(null);
          setFadeOutDueCount(null);
          setFadeOutTotalDeckCards(null);
        });
      }
    }
  }, [isSrsModeActive, srsCounterOpacity, shouldShowCounter]);
  
  // Keep ref in sync with state
  useEffect(() => {
    isSrsModeActiveRef.current = isSrsModeActive;
  }, [isSrsModeActive]);
  
  // Sync button display state with actual state (but allow immediate updates on press)
  useEffect(() => {
    if (!isTransitionLoading) {
      setButtonDisplayActive(isSrsModeActive);
    }
  }, [isSrsModeActive, isTransitionLoading]);
  
  
  // Track previous isSrsModeActive to detect actual mode changes vs card changes
  const prevIsReviewModeActiveRef = useRef<boolean | null>(null);
  // Track if we're waiting for data after entering SRS mode with empty cards
  const waitingForDataRef = useRef<boolean>(false);
  
  // Animation values - Initialize with proper starting values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Define swipe threshold
  const SWIPE_THRESHOLD = 120;

  // Rainbow border animation effect for review button
  // Stops when review mode (SRS mode) is active OR when session is finished
  // Uses Animated.interpolate instead of setState to prevent re-render cascades
  useEffect(() => {
    logger.log('🌈 [Rainbow Animation] Effect triggered:', { shouldShowRainbowBorder, hasCardsDueForReview, isSrsModeActive, isSessionFinished });
    
    // Stop any existing animation first
    if (rainbowAnimationLoopRef.current) {
      rainbowAnimationLoopRef.current.stop();
      rainbowAnimationLoopRef.current = null;
    }
    reviewButtonRainbowAnim.stopAnimation();
    reviewButtonRainbowAnim.setValue(0);
    
    if (shouldShowRainbowBorder) {
      logger.log('🌈 [Rainbow Animation] Starting animation loop');
      // Start rainbow animation only when cards are due AND not in review mode AND session is not finished
      const loop = Animated.loop(
        Animated.timing(reviewButtonRainbowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: false, // Required for color interpolation
        })
      );
      rainbowAnimationLoopRef.current = loop;
      loop.start();
      
      return () => {
        logger.log('🌈 [Rainbow Animation] Cleaning up animation');
        if (rainbowAnimationLoopRef.current) {
          rainbowAnimationLoopRef.current.stop();
          rainbowAnimationLoopRef.current = null;
        }
        reviewButtonRainbowAnim.stopAnimation();
        reviewButtonRainbowAnim.setValue(0);
      };
    } else {
      logger.log('🌈 [Rainbow Animation] Not starting - shouldShowRainbowBorder:', shouldShowRainbowBorder);
    }
  }, [shouldShowRainbowBorder, reviewButtonRainbowAnim]);

  // Floating animation for streak congrats modal (fire + number) - gentle up/down loop
  useEffect(() => {
    if (!showStreakCongratsOverlay) {
      if (streakCongratsFloatLoopRef.current) {
        streakCongratsFloatLoopRef.current.stop();
        streakCongratsFloatLoopRef.current = null;
      }
      streakCongratsFloatAnim.setValue(0);
      return;
    }
    streakCongratsFloatAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(streakCongratsFloatAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(streakCongratsFloatAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    streakCongratsFloatLoopRef.current = loop;
    loop.start();
    return () => {
      if (streakCongratsFloatLoopRef.current) {
        streakCongratsFloatLoopRef.current.stop();
        streakCongratsFloatLoopRef.current = null;
      }
      streakCongratsFloatAnim.setValue(0);
    };
  }, [showStreakCongratsOverlay, streakCongratsFloatAnim]);

  // Completion pulse animation - triggers a single rainbow pulse when review session finishes
  // This provides positive feedback/dopamine boost when user completes their review
  // ONLY triggers in SRS mode (review mode), not in browse mode
  useEffect(() => {
    // Detect transition from not-finished to finished
    const justFinished = isSessionFinished && !wasSessionFinishedRef.current;
    wasSessionFinishedRef.current = isSessionFinished;
    
    // Only trigger pulse if we're in SRS mode (review mode), not browse mode
    // Check isSrsModeActive to ensure we only celebrate actual review completions
    if (justFinished && isSrsModeActive) {
      logger.log('🎉 [Completion Pulse] Review session just finished in SRS mode, triggering celebration pulse!');
      
      // Show the pulse style
      setShowCompletionPulse(true);
      
      // Reset animation value
      completionPulseAnim.setValue(0);
      
      // Trigger haptic feedback for extra satisfaction
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Animate: cycle through rainbow colors once, then fade out slowly
      Animated.sequence([
        // Phase 1: Rainbow cycle (0 to 1)
        Animated.timing(completionPulseAnim, {
          toValue: 1,
          duration: 1000, // One full rainbow cycle
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        // Phase 2: Slow fade-out (1 to 2)
        Animated.timing(completionPulseAnim, {
          toValue: 2,
          duration: 1200, // Slow, smooth fade-out
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
      ]).start(() => {
        // Reset visibility only; keep `completionPulseAnim` at mount value until next run
        setShowCompletionPulse(false);
        logger.log('🎉 [Completion Pulse] Animation complete');
      });
    } else if (justFinished && !isSrsModeActive) {
      logger.log('🎉 [Completion Pulse] Session finished in browse mode, skipping pulse animation');
      setShowCompletionPulse(false);
    } else if (!isSessionFinished) {
      // Reset when session is not finished
      setShowCompletionPulse(false);
    }
  }, [isSessionFinished, isSrsModeActive, completionPulseAnim]);

  // SRS Update Handler - Updates box and nextReviewDate for cards in SRS Mode
  const handleSRSUpdate = async (card: Flashcard, isCorrect: boolean) => {
    // Only update SRS data in SRS Mode
    if (!isSrsModeActiveRef.current) {
      logger.log('🎯 [SRS] Skipping update - Browse Mode is consequence-free');
      return;
    }

    try {
      const currentBox = card.box ?? 1;
      const newBox = isCorrect 
        ? getNewBoxOnCorrect(currentBox)
        : getNewBoxOnIncorrect(currentBox);
      
      const newNextReviewDate = calculateNextReviewDate(newBox);
      
      logger.log('🎯 [SRS] Updating card:', card.id, 'Box:', currentBox, '->', newBox, 'Next review:', newNextReviewDate.toISOString().split('T')[0]);
      logger.log('🎯 [SRS] Card details - ID:', card.id.substring(0, 8), 'Current box:', currentBox, 'Is correct:', isCorrect, 'New box:', newBox, 'New review date:', newNextReviewDate.toISOString().split('T')[0]);
      
      // Update database immediately
      const updateResult = await updateFlashcard({
        ...card,
        box: newBox,
        nextReviewDate: newNextReviewDate,
      });
      
      if (updateResult) {
        logger.log('✅ [SRS] Card updated successfully in database');
      } else {
        logger.error('❌ [SRS] Card update returned false');
      }
    } catch (error) {
      logger.error('❌ [SRS] Error updating card:', error);
    }
  };

  // Reset Daily Review Stats - For testing the daily count reset (long press)
  const handleResetDailyStats = async () => {
    if (!user?.id) return;

    try {
      const storageKey = getDailyReviewStatsStorageKey(user.id);
      const today = getLocalDateString();

      // Reset daily stats
      const newStats: DailyReviewStats = { date: today, reviewedCardIds: [] };
      await AsyncStorage.setItem(storageKey, JSON.stringify(newStats));

      setDailyReviewedCardIds(new Set());

      logger.log('🧪 [Test] Daily review stats reset for testing');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      logger.error('Error resetting daily stats:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Reset SRS Progress - Resets all cards in selected decks to box 1 and today's date (for testing)
  const handleResetSRSProgress = async () => {
    if (isResettingSRS || selectedDeckIds.length === 0) {
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      t('review.srsReset.title'),
      t('review.srsReset.message'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.reset'),
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
                
                // Reset daily stats and session swiped cards
                setDailyReviewedCardIds(new Set());
                setSessionSwipedCardIds(new Set());

                // Reset session start due count so next SRS session recalculates
                setSessionStartDueCount(0);

                // NOTE: totalDeckCards ref is preserved - it only changes on deck selection
                // Streak counter is intentionally NOT reset here: the user may have earned
                // a streak in other decks and only wanted to fix a mistaken swipe in this deck.

                Alert.alert(t('common.success'), t('review.srsReset.success', { count: resetCount }));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                logger.error('❌ [SRS Reset] Failed to reset cards');
                Alert.alert(t('common.error'), t('review.srsReset.error'));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              }
            } catch (error) {
              logger.error('❌ [SRS Reset] Error:', error);
              Alert.alert(t('common.error'), t('review.srsReset.errorGeneric'));
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
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  // Load selected deck IDs from AsyncStorage on initialization (user-specific)
  // CRITICAL: Also validates that stored deck IDs still exist in the database
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
          
          // CRITICAL FIX: Validate that stored deck IDs actually exist
          // This prevents issues where stored IDs reference deleted decks
          try {
            const existingDecks = await getDecks();
            const existingDeckIds = new Set(existingDecks.map(d => d.id));
            const validDeckIds = deckIds.filter((id: string) => existingDeckIds.has(id));
            
            if (validDeckIds.length !== deckIds.length) {
              logger.log('👤 [Component] Pruned invalid deck IDs:', deckIds.length - validDeckIds.length, 'removed');
              
              // If all stored IDs were invalid, select the first available deck
              if (validDeckIds.length === 0 && existingDecks.length > 0) {
                logger.log('👤 [Component] All stored IDs invalid, selecting first deck');
                validDeckIds.push(existingDecks[0].id);
              }
              
              // Update storage with valid IDs
              await AsyncStorage.setItem(userStorageKey, JSON.stringify(validDeckIds));
            }
            
            setSelectedDeckIds(validDeckIds);
          } catch (validationError) {
            // If validation fails, use stored IDs as-is (offline scenario)
            logger.log('👤 [Component] Deck validation failed, using stored IDs:', validationError);
            setSelectedDeckIds(deckIds);
          }
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

  // Load daily review stats from AsyncStorage on initialization (user-specific)
  // Resets stats if it's a new day (midnight reset)
  useEffect(() => {
    const loadDailyReviewStats = async () => {
      if (!user?.id) {
        logger.log('📊 [DailyStats] No user, skipping daily stats load');
        setDailyStatsLoaded(true);
        return;
      }

      try {
        const storageKey = getDailyReviewStatsStorageKey(user.id);
        const storedStats = await AsyncStorage.getItem(storageKey);
        const today = getLocalDateString();
        
        if (storedStats) {
          const stats: DailyReviewStats = JSON.parse(storedStats);
          
          if (stats.date === today) {
            // Same day - restore the stats
            const reviewedIds = new Set(stats.reviewedCardIds);
            setDailyReviewedCardIds(reviewedIds);
            logger.log('📊 [DailyStats] Loaded daily stats for today:', reviewedIds.size, 'cards reviewed');
          } else {
            // New day - reset stats
            logger.log('📊 [DailyStats] New day detected, resetting daily stats (old:', stats.date, 'new:', today, ')');
            const newStats: DailyReviewStats = { date: today, reviewedCardIds: [] };
            await AsyncStorage.setItem(storageKey, JSON.stringify(newStats));
            setDailyReviewedCardIds(new Set());
          }
        } else {
          // No stats found - initialize for today
          logger.log('📊 [DailyStats] No daily stats found, initializing for today');
          const newStats: DailyReviewStats = { date: today, reviewedCardIds: [] };
          await AsyncStorage.setItem(storageKey, JSON.stringify(newStats));
          setDailyReviewedCardIds(new Set());
        }
      } catch (error) {
        logger.error('Error loading daily review stats from AsyncStorage:', error);
        setDailyReviewedCardIds(new Set());
      } finally {
        setDailyStatsLoaded(true);
      }
    };

    loadDailyReviewStats();
  }, [user?.id]);

  // Helper function to persist daily review stats
  const persistDailyReviewStats = useCallback(async (cardId: string) => {
    if (!user?.id) return;
    
    try {
      const storageKey = getDailyReviewStatsStorageKey(user.id);
      const today = getLocalDateString();
      
      // Update state first for immediate UI feedback
      setDailyReviewedCardIds((prevSet) => {
        const newSet = new Set(prevSet);
        if (!newSet.has(cardId)) {
          newSet.add(cardId);
          
          // Persist to storage asynchronously
          const statsToSave: DailyReviewStats = {
            date: today,
            reviewedCardIds: Array.from(newSet)
          };
          AsyncStorage.setItem(storageKey, JSON.stringify(statsToSave))
            .then(() => logger.log('📊 [DailyStats] Persisted daily stats:', newSet.size, 'cards'))
            .catch((err) => logger.error('📊 [DailyStats] Error persisting stats:', err));
        }
        return newSet;
      });
    } catch (error) {
      logger.error('Error persisting daily review stats:', error);
    }
  }, [user?.id]);

  // NOTE: Filtering is now handled synchronously by useMemo (filteredCards above)
  // This eliminates the race condition where async filtering completed after
  // other effects had already consumed stale filteredCards

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

  // Removed ensureSelection - users can now have no decks selected

  // Update remaining count when reviewSessionCards changes
  // Both browse and review modes track session progress via reviewSessionCards
  // (browse = all filtered cards, review = only due cards)
  useEffect(() => {
    // Always use reviewSessionCards.length for the remaining count
    // This ensures the count decrements as the user swipes through cards
    const correctRemainingCount = reviewSessionCards.length;

    // Only update if there's an actual change to prevent unnecessary renders
    if (remainingCount !== correctRemainingCount) {
      setRemainingCount(correctRemainingCount);
    }

    // When we have no remaining cards but currentCard isn't null, we need to force it
    if (reviewSessionCards.length === 0 && currentCard !== null) {
      setCurrentCard(null);
    }
  }, [reviewSessionCards.length, currentCard, setCurrentCard, remainingCount]);

  // Register sync callback for when network comes back online
  // NOTE: filteredCards is now derived via useMemo, so syncing just needs to
  // trigger a refresh of allFlashcards (which happens in the hook via syncManager)
  useEffect(() => {
    const syncCallback = async () => {
      logger.log('🔄 [RandomCardReviewer] Sync triggered, refreshing all flashcards');
      // Trigger a refresh of all flashcards - filteredCards will update automatically via useMemo
      await fetchAllFlashcards(true);
    };
    
    registerSyncCallback(syncCallback);
    
    return () => {
      unregisterSyncCallback(syncCallback);
    };
  }, [fetchAllFlashcards]);

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
  // NOTE: Don't reset lastCardId here as it triggers unnecessary re-renders
  useEffect(() => {
    if (isCardTransitioning) {
      opacityAnim.setValue(0);
      // Removed setLastCardId(null) - this was causing race conditions
      // The lastCardId should only be updated when we actually display a new card
    }
  }, [isCardTransitioning]);

  // Initialize card opacity to 0 when component first mounts
  useLayoutEffect(() => {
    opacityAnim.setValue(0);
    transitionLoadingOpacity.setValue(0);
  }, []);

  // Ensure opacity starts at 0 when transitioning to prevent flash
  useEffect(() => {
    if (isCardTransitioning || isInitializing) {
      opacityAnim.setValue(0);
    }
  }, [isCardTransitioning, isInitializing, opacityAnim]);
  
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
      setIsInitializing(true);
      
      // Clean up any pending timeouts
      if (delayedCompletionTimeoutRef.current) {
        clearTimeout(delayedCompletionTimeoutRef.current);
        delayedCompletionTimeoutRef.current = null;
      }
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
        filteredCardsLength: filteredCards.length,
        deckIdsLoaded,
        selectedDeckIdsLength: selectedDeckIds.length
      });
      
      // Removed automatic deck selection - users can now have no decks selected
      // This allows them to see the "no cards to review" screen when they explicitly deselect all decks

      // Only call onContentReady if the state actually changed
      if (lastContentReadyRef.current !== isContentReady && onContentReadyRef.current) {
        lastContentReadyRef.current = isContentReady;
        onContentReadyRef.current(isContentReady);
      }
      
      return () => {
        // Cleanup if needed
      };
    }, [isInitializing, isCardTransitioning, loadingState, isLoading, isConnected, filteredCards.length, selectedDeckIds.length, allFlashcards.length, deckIdsLoaded])
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
    // Use ref-based lookup to avoid timing issues with state updates
    // Refs are updated immediately in startReviewWithCards, while state may be stale
    let cardToUpdate = currentCardRef.current;
    if (!cardToUpdate && cardIdToTrack && reviewSessionCardsRef.current.length > 0) {
      cardToUpdate = reviewSessionCardsRef.current.find(card => card.id === cardIdToTrack) || null;
      if (cardToUpdate) {
        logger.log('🔍 [SRS] Found card from reviewSessionCardsRef:', cardToUpdate.id.substring(0, 8));
      }
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Increment swipe counters only in SRS Mode
    if (isSrsModeActiveRef.current) {
      if (direction === 'left') {
        logger.log('🔄 [SRS] Card swiped LEFT - incrementing left counter, will decrease box by 1');
        incrementLeftSwipe();
      } else if (direction === 'right') {
        // Pass the current card ID to track unique right swipes
        if (cardIdToTrack) {
          logger.log('👉 [SRS] Card swiped RIGHT - incrementing right counter, will increase box by 1');
          incrementRightSwipe(cardIdToTrack).then((newRightCount) => {
            if (newRightCount === 3) {
              setShowStreakCongratsOverlay(true);
            }
          });

          // Persist daily review stats (survives app restarts, resets at midnight)
          persistDailyReviewStats(cardIdToTrack);

          // Track card swiped right in current session to prevent it from coming back
          setSessionSwipedCardIds((prevSet) => {
            const newSet = new Set(prevSet);
            newSet.add(cardIdToTrack);
            logger.log('🎯 [SRS] Card swiped right, added to sessionSwipedCardIds:', cardIdToTrack, 'Total in session:', newSet.size);
            return newSet;
          });
        }
      }
      
      // Handle SRS updates in SRS Mode
      if (cardToUpdate) {
        const isCorrect = direction === 'right'; // Right = remembered, Left = forgot
        logger.log('🎯 [SRS] Calling handleSRSUpdate for card:', cardToUpdate.id.substring(0, 8), 'isCorrect:', isCorrect, 'direction:', direction, 'SRS mode active:', isSrsModeActiveRef.current);
        handleSRSUpdate(cardToUpdate, isCorrect);
      } else {
        logger.warn('⚠️ [SRS] cardToUpdate is null/undefined, cannot update SRS data');
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

  // Manual button handler to refresh deck in browse mode (not restart review mode)
  const onRefreshDeck = () => {
    logger.log('🔄 [onRefreshDeck] Refresh deck button pressed', {
      filteredCardsLength: filteredCards.length,
      isSessionFinished,
      isInitializing,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reset delay states when refreshing
    setDelaySessionFinish(false);
    setIsTransitionLoading(false);
    // Reset session swiped cards when starting fresh session
    setSessionSwipedCardIds(new Set());
    // CRITICAL: Reset session finished state to allow new session to start
    // This must happen BEFORE calling startReviewWithCards to avoid Gate 2 blocking initialization
    resetReviewSession();
    // CRITICAL: Reset isInitializing to allow the initialization effect to run again
    // This ensures that even if filteredCards is empty, the effect will run when cards become available
    setIsInitializing(true);
    // Clear the last cards hash to force re-initialization
    lastFilteredCardsHashRef.current = '';
    logger.log('🔄 [onRefreshDeck] After resetReviewSession, calling startReviewWithCards', {
      filteredCardsLength: filteredCards.length,
    });
    // Stay in browse mode - don't enable review mode
    // Start browse session with all filtered cards (not review mode)
    // If filteredCards is empty, startReviewWithCards will clear the session but won't reset isSessionFinished
    // The initialization effect will then pick up cards when they become available
    startReviewWithCards(filteredCards, false);
  };

  const onKeepCard = () => {
    completeSwipe('left');
  };

  const onDismissCard = () => {
    completeSwipe('right');
  };

  // Consolidated initialization and deck change handling with proper loading coordination
  // CRITICAL: This effect manages the transition from loading state to ready state
  useEffect(() => {
    // GATE 1: Deck IDs must be loaded from AsyncStorage first
    if (!deckIdsLoaded) {
      logger.log('🔄 [Component] Gate 1: Waiting for deck IDs to load from storage...');
      return;
    }
    
    const initializeReviewSession = async () => {
      // GATE 2: Don't restart session if we're showing the session finished view
      if (isSessionFinished) {
        logger.log('🔄 [Component] Gate 2: Session finished, skipping initialization');
        return;
      }
      
      // GATE 3: Wait for hook to reach CONTENT_READY state
      // This ensures the initial data fetch has completed
      if (loadingState !== LoadingState.CONTENT_READY) {
        logger.log('🔄 [Component] Gate 3: Waiting for hook to reach CONTENT_READY (current:', loadingState, ')');
        return;
      }
      
      // GATE 4: Handle the "no cards exist" case gracefully
      // If hook is ready with 0 total cards, mark initialization complete
      if (allFlashcards.length === 0 && filteredCards.length === 0) {
        if (isInitializing) {
          logger.log('🔄 [Component] Gate 4: No cards exist, completing initialization with empty state');
          setIsInitializing(false);
          lastFilteredCardsHashRef.current = '';
        }
        return;
      }
      
      // NOTE: Gate 5 (async filtering wait) is no longer needed since filtering 
      // is now synchronous via useMemo and waits for CONTENT_READY.
      // If filteredCards is empty but allFlashcards has data, it means the user
      // selected decks that have no cards - this is a valid state, not a loading state.
      
      // GATE 6: Prevent mid-session re-initialization in review mode
      // Skip re-initialization if we're actively in a review session with cards remaining
      // Allow initialization on first load (isInitializing === true) even if reviewSessionCards has items
      if (isSrsModeActive && reviewSessionCards.length > 0 && !isInitializing) {
        logger.log('🔄 [Component] Gate 6: Active review session in progress, skipping re-initialization (sessionCards:', reviewSessionCards.length, ')');
        return;
      }
      
      // GATE 7: Prevent duplicate initialization for the same cards
      const cardsHash = filteredCards.map(card => card.id).sort().join(',');
      if (initializationInProgressRef.current) {
        logger.log('🔄 [Component] Gate 7: Initialization already in progress');
        return;
      }
      
      // Skip if we have the exact same cards (prevents redundant initializations)
      if (cardsHash && cardsHash === lastFilteredCardsHashRef.current && !isInitializing) {
        logger.log('🔄 [Component] Gate 7: Same cards, no re-initialization needed');
        return;
      }
      
      // === ALL GATES PASSED - PROCEED WITH INITIALIZATION ===
      
      // Clear any pending delayed completion since we're starting a real initialization
      if (delayedCompletionTimeoutRef.current) {
        clearTimeout(delayedCompletionTimeoutRef.current);
        delayedCompletionTimeoutRef.current = null;
      }
      
      if (filteredCards.length > 0) {
        // Filter to due cards only in SRS mode, and exclude cards already swiped in this session
        logger.log('🔍 [Component] Before filterDueCards - Total filtered cards:', filteredCards.length, 'SRS mode:', isSrsModeActive);
        if (isSrsModeActive && filteredCards.length > 0) {
          // Log sample cards before filtering
          filteredCards.slice(0, 3).forEach(card => {
            const reviewDate = card.nextReviewDate ? new Date(card.nextReviewDate).toISOString().split('T')[0] : 'N/A';
            logger.log(`🔍 [Component] Sample card before filter - ID: ${card.id.substring(0, 8)}..., Box: ${card.box ?? 1}, Next review: ${reviewDate}`);
          });
        }
        
        let cardsToReview = isSrsModeActive ? filterDueCards(filteredCards) : filteredCards;
        
        logger.log('🔍 [Component] After filterDueCards - Due cards:', cardsToReview.length, 'SRS mode:', isSrsModeActive);
        
        // Exclude cards that were already swiped right in the current session
        if (sessionSwipedCardIds.size > 0) {
          const beforeSessionFilter = cardsToReview.length;
          cardsToReview = cardsToReview.filter(card => !sessionSwipedCardIds.has(card.id));
          logger.log(`🔍 [Component] After session filter - Removed ${beforeSessionFilter - cardsToReview.length} already-swiped cards, remaining: ${cardsToReview.length}`);
        }
        
        logger.log('🚀 [Component] Starting review session with', cardsToReview.length, 'cards (from', filteredCards.length, 'filtered, SRS mode:', isSrsModeActive, '), dataVersion:', dataVersion);
        
        // Mark initialization as in progress
        initializationInProgressRef.current = true;
        lastFilteredCardsHashRef.current = cardsHash;
        
        // Start session atomically - respect current review mode state
        startReviewWithCards(cardsToReview, isSrsModeActive);
        
        // Wait for next tick to ensure hook state is fully updated
        setTimeout(() => {
          // Start fade-in animation
          setIsInitializing(false);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
          
          initializationInProgressRef.current = false;
          logger.log('✅ [Component] Initialization complete');
        }, 10);
      } else {
        // No filtered cards but we passed all gates
        // Wait a moment before completing - data might still be loading after refresh
        // This prevents the "No cards in selection" flicker during refresh
        if (!delayedCompletionTimeoutRef.current) {
          logger.log('🔄 [Component] No filtered cards available, scheduling delayed completion');
          delayedCompletionTimeoutRef.current = setTimeout(() => {
            delayedCompletionTimeoutRef.current = null;
            setIsInitializing(false);
            lastFilteredCardsHashRef.current = '';
            logger.log('🔄 [Component] Delayed initialization complete (no filtered cards)');
          }, 300);
        }
      }
    };
    
    initializeReviewSession();
  }, [filteredCards, deckIdsLoaded, startReviewWithCards, loadingState, allFlashcards.length, isInitializing, selectedDeckIds.length, isSessionFinished, isSrsModeActive, dataVersion]);

  // Reset delay states when session finishes in browse mode (no animation needed)
  useEffect(() => {
    if (isSessionFinished && !isSrsModeActive) {
      // In browse mode, we want to show the finished view immediately
      // Reset any delay states that might be stuck from a previous review session
      logger.log('🔄 [BROWSE MODE] Session finished in browse mode, showing finished view immediately', {
        isSessionFinished,
        isSrsModeActive,
        sessionSwipedCardIds: sessionSwipedCardIds.size,
      });
      setDelaySessionFinish(false);
      setIsTransitionLoading(false);
    }
  }, [isSessionFinished, isSrsModeActive, sessionSwipedCardIds.size]);
  
  // Automatically disable review mode when session finishes (with fade-out delay)
  useEffect(() => {
    if (isSessionFinished && isSrsModeActive && !isFadingOut) {
      logger.log('🔄 [Component] Session finished, starting fade-out animation', {
        isSessionFinished,
        isSrsModeActive,
        delaySessionFinish,
        isTransitionLoading,
        sessionSwipedCardIds: sessionSwipedCardIds.size,
      });
      
      // Capture counter values IMMEDIATELY before any animation
      setFadeOutSwipedCount(sessionSwipedCardIds.size);
      setFadeOutDueCount(sessionStartDueCount || dueCardsCount);
      setFadeOutTotalDeckCards(totalDeckCards);
      setIsFadingOut(true);
      
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
        logger.log('🔄 [FADE DEBUG] After 100ms delay, starting counter fade-out');
        // Change button color at the same time as counter fades out
        setButtonDisplayActive(false);
        
        // Start fade-out animation
        Animated.timing(srsCounterOpacity, {
          toValue: 0,
          duration: 250, // Smooth fade duration
          useNativeDriver: true,
          easing: Easing.out(Easing.quad), // Use ease for smoother animation
        }).start(() => {
          logger.log('🔄 [FADE DEBUG] Counter fade-out complete, setting delaySessionFinish=false');
          // After fade-out completes, hide counter
          setShouldShowCounter(false);
          // Exit review mode to return to browse mode when all cards are finished
          setIsSrsModeActive(false);
          setDelaySessionFinish(false); // Allow "session finished" view to show
          
          // Smoothly fade out loading overlay
          Animated.timing(transitionLoadingOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            logger.log('🔄 [FADE DEBUG] Loading overlay fade complete, setting isTransitionLoading=false');
            setIsTransitionLoading(false); // Hide loading
          });
          
          setIsFadingOut(false);
          setFadeOutSwipedCount(null);
          setFadeOutDueCount(null);
          setFadeOutTotalDeckCards(null);
          // Sync totalDeckCards from ref after fade-out completes (in case it changed during fade-out)
          if (totalDeckCards !== totalDeckCardsRef.current) {
            setTotalDeckCards(totalDeckCardsRef.current);
            logger.log('🃏 [Counter] Synced totalDeckCards from ref after fade-out:', totalDeckCardsRef.current);
          }
          logger.log('🔄 [Component] Fade-out complete, exiting to browse mode');
        });
      }, 100); // Small delay to let card finish animating
    }
  }, [isSessionFinished, isSrsModeActive, isFadingOut, srsCounterOpacity, transitionLoadingOpacity, delaySessionFinish, isTransitionLoading, sessionSwipedCardIds.size]);

  // Animate no cards message fade-in smoothly when there are no cards due
  useEffect(() => {
    const shouldShowNoCardsDue = isSrsModeActive && dueCardsCount === 0 && !currentCard && !isInitializing && !isTransitionLoading && !isSessionFinished;
    // Match the render condition - don't require !isTransitionLoading
    const shouldShowFinishedView = isSessionFinished && !delaySessionFinish;
    
    if (shouldShowNoCardsDue || shouldShowFinishedView) {
      // Fade in the message
      Animated.timing(noCardsMessageOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }).start();
    } else {
      // Reset opacity when hiding
      noCardsMessageOpacity.setValue(0);
    }
  }, [isSrsModeActive, dueCardsCount, currentCard, isInitializing, isTransitionLoading, isSessionFinished, delaySessionFinish, noCardsMessageOpacity]);

  // Filter cards and update counts when SRS Mode is toggled
  // CRITICAL FIX: Only call startReviewWithCards when isSrsModeActive ACTUALLY changes
  // (not when filteredCards changes - that's handled by initializeReviewSession)
  useEffect(() => {
    // CRITICAL: Check if mode actually changed BEFORE any early returns
    // This ensures sessionSwipedCardIds is reset even when filteredCards is empty
    const modeActuallyChanged = prevIsReviewModeActiveRef.current !== null && 
                                 prevIsReviewModeActiveRef.current !== isSrsModeActive;
    
    // Always reset sessionSwipedCardIds when mode changes, regardless of filtered cards state
    // This prevents stale swipe counts from persisting across sessions
    if (modeActuallyChanged && !isSessionFinished) {
      logger.log('📚 [SRS Mode] Mode changed to:', isSrsModeActive ? 'Review' : 'Browse', '(resetting session swipes)');
      setSessionSwipedCardIds(new Set());
    }
    
    if (!filteredCards || filteredCards.length === 0) {
      // Determine if we're entering SRS mode with no cards
      const isEnteringSrsModeWithNoCards = modeActuallyChanged && isSrsModeActive;
      
      if (isEnteringSrsModeWithNoCards && !waitingForDataRef.current) {
        // CRITICAL: First time entering SRS mode with empty filteredCards - likely a timing issue
        // where cache was just invalidated. Set flag and trigger data refresh.
        logger.log('📊 [SRS Mode] Entering SRS with empty filteredCards - waiting for data refresh');
        waitingForDataRef.current = true;
        
        // Trigger a data refresh to get fresh cards
        fetchAllFlashcards(true).catch(error => {
          logger.error('❌ [SRS Mode] Error refreshing flashcards:', error);
        });
        
        // Update ref to prevent infinite loop - modeActuallyChanged will be false on next render
        // but waitingForDataRef will ensure we initialize session when cards arrive
        prevIsReviewModeActiveRef.current = isSrsModeActive;
        return;
      }
      
      // If we're waiting for data but still have no cards, just return (don't re-fetch)
      if (waitingForDataRef.current && isSrsModeActive) {
        return;
      }
      
      // Only reset dueCardsCount if not in SRS mode or session hasn't started
      if (!isSrsModeActive || sessionStartDueCount === 0) {
        setDueCardsCount(0);
        setSessionStartDueCount(0);
      }
      // Clear waiting flag if we're leaving SRS mode
      if (!isSrsModeActive) {
        waitingForDataRef.current = false;
      }
      prevIsReviewModeActiveRef.current = isSrsModeActive;
      return;
    }

    // NOTE: totalDeckCards is now managed by separate stable counter useEffect
    
    // Calculate due cards (always needed for session start)
    const dueCards = filterDueCards(filteredCards);
    
    // NOTE: We removed the isTransitionLoading check here because it was causing a circular dependency:
    // - isTransitionLoading is set to true when button is pressed
    // - This effect needs to run to set up the session, but was blocked by isTransitionLoading
    // - isTransitionLoading never gets set to false because cards never change
    // CRITICAL: Don't restart session if session is finished - keep showing finished view
    // Also handle case where we were waiting for data and cards just became available
    const shouldInitializeSession = (modeActuallyChanged || waitingForDataRef.current) && !isSessionFinished;
    
    if (shouldInitializeSession) {
      if (isSrsModeActive) {
        // Entering SRS Mode: Start fresh SRS session with due cards and enableReviewMode=true
        // CRITICAL: Lock the due cards count when session starts - this is the denominator
        // This count should NOT change during the session, even as cards are swiped
        const initialDueCount = dueCards.length;
        setDueCardsCount(initialDueCount);
        setSessionStartDueCount(initialDueCount);
        logger.log('📊 [SRS Mode] Starting review session with', initialDueCount, 'due cards (locked denominator)', waitingForDataRef.current ? '(data just arrived)' : '');
        
        // Clear waiting flag now that we have data
        waitingForDataRef.current = false;
        
        // Don't call resetReviewSession() - it causes race conditions
        // Just start fresh with due cards
        if (dueCards.length > 0) {
          startReviewWithCards(dueCards, true); // true = enable review mode for SRS
        } else {
          startReviewWithCards([], true);
        }
        
        // Also refresh data in background to ensure we have latest SRS data
        fetchAllFlashcards(true).catch(error => {
          logger.error('❌ [SRS Mode] Error refreshing flashcards:', error);
        });
      } else {
        // Entering Browse Mode: Show all cards (but don't enable review mode)
        // Reset the session start count since we're leaving SRS mode
        // CRITICAL FIX: Don't update dueCardsCount if we're fading out - keep it at 0
        if (!isFadingOut) {
          setDueCardsCount(filteredCards.length);
        }
        setSessionStartDueCount(0);
        waitingForDataRef.current = false; // Clear waiting flag when leaving SRS mode
        startReviewWithCards(filteredCards, false);
      }
      
      // NOTE: Daily reviewedCount is NOT reset when toggling mode
      // It persists throughout the day as expected in Leitner SRS
    } else if (!isSrsModeActive && !isFadingOut) {
      // In browse mode, update dueCardsCount freely (it shows total available cards)
      // CRITICAL FIX: Don't update during fade-out to prevent counter from changing
      setDueCardsCount(filteredCards.length);
    }
    // In SRS mode but no mode change: DO NOT update dueCardsCount - it's locked!
    
    // Update the ref for next comparison
    prevIsReviewModeActiveRef.current = isSrsModeActive;
  }, [isSrsModeActive, filteredCards, startReviewWithCards, resetReviewSession, isSessionFinished, sessionStartDueCount]);

  // SIMPLIFIED: Handle deck selection
  // Filtering is now automatic via useMemo - no async operations needed
  const handleDeckSelection = useCallback(async (deckIds: string[]) => {
    // Only do a full reset if the selection actually changed
    const currentSorted = [...selectedDeckIds].sort().join(',');
    const newSorted = [...deckIds].sort().join(',');
    
    if (newSorted !== currentSorted) {
      logger.log('🎯 [Component] Deck selection changed:', deckIds.length, 'decks');
      
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
      
      // Update deck selection - filteredCards will update automatically via useMemo
      setSelectedDeckIds(deckIds);
      
      // If no decks selected, immediately clear the review session to show "no cards" screen
      if (deckIds.length === 0) {
        logger.log('🎯 [Component] No decks selected, clearing review session');
        resetReviewSession();
      }
      
      // Save to user-specific storage key
      if (user?.id) {
        try {
          const userStorageKey = getSelectedDeckIdsStorageKey(user.id);
          await AsyncStorage.setItem(userStorageKey, JSON.stringify(deckIds));
          logger.log('✅ [Component] Deck selection saved:', deckIds.length, 'decks');
        } catch (error) {
          logger.error('Error saving deck selection:', error);
        }
      }
    }
    
    setShowDeckSelector(false);
  }, [selectedDeckIds, setCurrentCard, user?.id, fadeAnim, resetReviewSession]);

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
          
          {/* SRS Mode Toggle */}
          <AnimatedTouchableOpacity
            style={[
              styles.reviewModeButton,
              buttonDisplayActive && styles.reviewModeButtonActive,
              styles.deckButtonDisabled,
              rainbowBorderStyle,
              showCompletionPulse && completionPulseStyle
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
          </AnimatedTouchableOpacity>
          
          {/* Offline Indicator */}
          <OfflineBanner visible={!isConnected} />
        </View>
        <View style={styles.cardStage}>
          <LoadingCard />
        </View>
        <View style={styles.controlsContainer}>
          <Text 
            style={[styles.countText, { opacity: 0.5 }]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.7}
          >
            •••
          </Text>
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
    logger.log('🎯 [RENDER DEBUG] No currentCard check:', {
      currentCard: 'null',
      isInitializing,
      isSessionFinished,
      reviewSessionCardsLength: reviewSessionCards.length,
      filteredCardsLength: filteredCards.length,
      sessionSwipedCardIds: sessionSwipedCardIds.size,
      delaySessionFinish,
      isTransitionLoading,
    });
    
    // No flashcards at all - Show getting started guide
    // CRITICAL: Don't show this if session is finished - let the finished view handle it
    if (reviewSessionCards.length === 0 && filteredCards.length === 0 && !isSessionFinished) {
      logger.log('🎯 [RENDER DEBUG] Showing "No cards in selection" guide (NOT session finished)');
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
            
            {/* SRS Mode Toggle */}
            <AnimatedTouchableOpacity
              style={[
                styles.reviewModeButton,
                buttonDisplayActive && styles.reviewModeButtonActive,
                (reviewSessionCards.length === 0 && filteredCards.length === 0) && styles.reviewModeButtonDisabled,
                rainbowBorderStyle,
                showCompletionPulse && completionPulseStyle
              ]}
              disabled={reviewSessionCards.length === 0 && filteredCards.length === 0}
              onPress={() => {
                // Prevent rapid button presses from causing overlapping transitions
                if (isTransitionLoading || isCardTransitioning || isInitializing) {
                  return;
                }
                
                // Prevent action when no cards available
                if (reviewSessionCards.length === 0 && filteredCards.length === 0) {
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
                  const newSrsMode = !isSrsModeActive;
                  logger.log('🎓 [Review Button] Toggling SRS mode:', isSrsModeActive, '->', newSrsMode);
                  
                  // CRITICAL: Capture counter values BEFORE state change to prevent flicker
                  if (isSrsModeActive && !newSrsMode) {
                    setFadeOutSwipedCount(sessionSwipedCardIds.size);
                    setFadeOutDueCount(sessionStartDueCount || dueCardsCount);
                    setFadeOutTotalDeckCards(totalDeckCards);
                    setIsFadingOut(true);
                  }
                  
                  // Update ref immediately (don't wait for useEffect) to ensure swipes use new value
                  isSrsModeActiveRef.current = newSrsMode;
                  
                  setIsSrsModeActive(newSrsMode);
                  
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
                color={(reviewSessionCards.length === 0 && filteredCards.length === 0) 
                  ? COLORS.lightGray 
                  : (buttonDisplayActive ? COLORS.text : COLORS.primary)}
              />
              <Text 
                style={[
                  styles.reviewModeButtonText,
                  buttonDisplayActive && styles.reviewModeButtonTextActive,
                  (reviewSessionCards.length === 0 && filteredCards.length === 0) && styles.reviewModeButtonTextDisabled,
                ]}
              >
                {t('review.reviewMode')}
              </Text>
            </AnimatedTouchableOpacity>
            
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
                const resolvedTitle = titleT === titleKey ? t('review.noCardsInSelectionTitle') : titleT;
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
            <Text 
              style={styles.countText}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.7}
            >
              {t('review.remaining', { count: 0 })}
            </Text>
          </View>
          {deckSelector}
        </View>
      );
    }
    // Show message when in SRS mode with 0 due cards (even if session hasn't finished)
   // This handles the case when user presses review button but there are no cards due
   const shouldShowNoCardsDue = isSrsModeActive && dueCardsCount === 0 && !currentCard && !isInitializing && !isTransitionLoading && !isSessionFinished;
   
   // Session finished – show "Review again" option or "No cards due" in SRS Mode
   // Only delay showing this view if counter is still fading out (delaySessionFinish)
   // The loading overlay (isTransitionLoading) will handle the visual transition separately
   const shouldShowFinishedView = isSessionFinished && !delaySessionFinish;
   
   // DEBUG: Log the state of all relevant variables
   logger.log('🎯 [RENDER DEBUG] View decision state:', {
     shouldShowNoCardsDue,
     shouldShowFinishedView,
     isSessionFinished,
     delaySessionFinish,
     isTransitionLoading,
     isSrsModeActive,
     dueCardsCount,
     sessionSwipedCardIds: sessionSwipedCardIds.size,
     hasCurrentCard: !!currentCard,
     isInitializing,
   });
   
   if (shouldShowNoCardsDue || shouldShowFinishedView) {
     // Check if this is SRS Mode with no cards due vs. completed review session
     // CRITICAL: If session is finished OR cards were swiped, always show "finished review" screen
     // Only show "no cards due" if:
     // 1. Session is NOT finished (isSessionFinished handles race conditions during animations)
     // 2. We're in SRS mode
     // 3. Have 0 due cards
     // 4. AND no cards were swiped in this session
     const isEmptyReviewMode = !isSessionFinished && isSrsModeActive && dueCardsCount === 0 && sessionSwipedCardIds.size === 0;
     
     logger.log('🎯 [RENDER DEBUG] Showing NoCardsDue/FinishedView:', {
       isEmptyReviewMode,
       willShowNoCardsToReview: isEmptyReviewMode,
       willShowFinishedReview: !isEmptyReviewMode,
     });
      
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
            
            {/* SRS Mode Toggle */}
            <AnimatedTouchableOpacity
              style={[
                styles.reviewModeButton,
                buttonDisplayActive && styles.reviewModeButtonActive,
                isSessionFinished && styles.reviewModeButtonDisabled,
                rainbowBorderStyle,
                showCompletionPulse && completionPulseStyle
              ]}
              disabled={isSessionFinished}
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
                  const newSrsMode = !isSrsModeActive;
                  logger.log('🎓 [Review Button] Toggling SRS mode:', isSrsModeActive, '->', newSrsMode);
                  
                  // CRITICAL: Capture counter values BEFORE state change to prevent flicker
                  if (isSrsModeActive && !newSrsMode) {
                    setFadeOutSwipedCount(sessionSwipedCardIds.size);
                    setFadeOutDueCount(sessionStartDueCount || dueCardsCount);
                    setFadeOutTotalDeckCards(totalDeckCards);
                    setIsFadingOut(true);
                  }
                  
                  // Update ref immediately (don't wait for useEffect) to ensure swipes use new value
                  isSrsModeActiveRef.current = newSrsMode;
                  
                  setIsSrsModeActive(newSrsMode);
                  
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
                color={isSessionFinished 
                  ? COLORS.lightGray 
                  : (buttonDisplayActive ? COLORS.text : COLORS.primary)}
              />
              <Text 
                style={[
                  styles.reviewModeButtonText,
                  buttonDisplayActive && styles.reviewModeButtonTextActive,
                  isSessionFinished && styles.reviewModeButtonTextDisabled,
                ]}
              >
                {t('review.reviewMode')}
              </Text>
            </AnimatedTouchableOpacity>
            
            {/* SRS Counter - Keep visible when showing no cards message */}
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
                  onLongPress={() => {
                    const currentDate = getLocalDateString();
                    Alert.alert(
                      t('debug.dailyStatsTitle'),
                      t('debug.dailyStatsMessage', {
                        date: currentDate,
                        reviewedCount,
                        sessionSwiped: sessionSwipedCardIds.size,
                        dueCount: sessionStartDueCount || dueCardsCount,
                        totalCards: totalDeckCards,
                        srsMode: isSrsModeActive ? 'Active' : 'Inactive'
                      }),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('debug.resetCount'),
                          style: 'destructive',
                          onPress: handleResetDailyStats
                        }
                      ]
                    );
                  }}
                >
                  {/* Left side: Green background with X/Y */}
                  <View
                    style={{
                      backgroundColor: 'rgba(52, 199, 89, 0.5)',
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
                      {isSrsModeActive ? sessionSwipedCardIds.size : reviewedCount}/{isSrsModeActive ? (sessionStartDueCount || dueCardsCount) : dueCardsCount}
                    </Text>
                  </View>
                  {/* Right side: Purple background with Z */}
                  <View
                    style={{
                      backgroundColor: 'rgba(138, 43, 226, 0.5)',
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
                      {isFadingOut && fadeOutTotalDeckCards !== null ? fadeOutTotalDeckCards : totalDeckCards}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
            
            {/* Offline Indicator */}
            <OfflineBanner visible={!isConnected} />
          </View>
          <View style={styles.cardStage}>
            <Animated.View style={[styles.noCardsContainer, { opacity: noCardsMessageOpacity }]}>
              <Text style={styles.noCardsText}>
                {isEmptyReviewMode ? t('review.noCardsDue') : t('review.finishedReview')}
              </Text>
              {!isEmptyReviewMode && (
                <TouchableOpacity 
                  style={styles.reviewAgainButton} 
                  onPress={onRefreshDeck}
                >
                  <Text style={styles.reviewAgainText}>{t('review.reviewAgain')}</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
          <View style={styles.controlsContainer}>
            <Text 
              style={styles.countText}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.7}
            >
              {t('review.remaining', { count: 0 })}
            </Text>
          </View>
          {deckSelector}
        </View>
      );
    }
  }

  return (
    <>
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
                  color="rgba(59, 130, 246, 0.5)" // More transparent blue
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
        
        {/* SRS Mode Toggle */}
        <View
          ref={reviewButtonRef}
          collapsable={false}
          style={
            isWalkthroughActive && currentWalkthroughStepId === 'review-button'
              ? styles.highlightedReviewButtonWrapper
              : undefined
          }
          pointerEvents={isWalkthroughActive && currentWalkthroughStepId !== 'review-button' ? 'none' : 'auto'}
        >
        <AnimatedTouchableOpacity
          style={[
            styles.reviewModeButton,
            buttonDisplayActive && styles.reviewModeButtonActive,
            isWalkthroughActive && currentWalkthroughStepId === 'review-button' && { backgroundColor: 'transparent' },
            (!isWalkthroughActive && (isCardTransitioning || isInitializing)) && styles.deckButtonDisabled,
            isResettingSRS && { opacity: 0.6 },
            rainbowBorderStyle,
            showCompletionPulse && completionPulseStyle
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
              const newSrsMode = !isSrsModeActive;
              logger.log('🎓 [Review Button] Toggling SRS mode:', isSrsModeActive, '->', newSrsMode);
              
              // CRITICAL: Capture counter values BEFORE state change to prevent flicker
              if (isSrsModeActive && !newSrsMode) {
                setFadeOutSwipedCount(sessionSwipedCardIds.size);
                setFadeOutDueCount(sessionStartDueCount || dueCardsCount);
                setFadeOutTotalDeckCards(totalDeckCards);
                setIsFadingOut(true);
              }
              
              // Update ref immediately (don't wait for useEffect) to ensure swipes use new value
              isSrsModeActiveRef.current = newSrsMode;
              
              setIsSrsModeActive(newSrsMode);
              
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
          disabled={isCardTransitioning || isInitializing || isResettingSRS || (isWalkthroughActive && currentWalkthroughStepId !== 'review-button')}
        >
          <Ionicons 
            name={buttonDisplayActive ? "school" : "school-outline"} 
            size={18} 
            color={buttonDisplayActive ? COLORS.text : 'rgba(59, 130, 246, 0.5)'} // More transparent blue when inactive
          />
          <Text 
            style={[
              styles.reviewModeButtonText,
              buttonDisplayActive && styles.reviewModeButtonTextActive
            ]}
          >
            {t('review.reviewMode')}
          </Text>
        </AnimatedTouchableOpacity>
        </View>
        
        {/* SRS Counter - Only visible in SRS Mode, positioned right after Review button */}
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
              onLongPress={() => {
                // Test feature: Long press counter to show debug info and reset daily stats
                const currentDate = getLocalDateString();
                Alert.alert(
                  t('debug.dailyStatsTitle'),
                  t('debug.dailyStatsMessage', {
                    date: currentDate,
                    reviewedCount,
                    sessionSwiped: sessionSwipedCardIds.size,
                    dueCount: sessionStartDueCount || dueCardsCount,
                    totalCards: totalDeckCards,
                    srsMode: isSrsModeActive ? 'Active' : 'Inactive'
                  }),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('debug.resetCount'),
                      style: 'destructive',
                      onPress: handleResetDailyStats
                    }
                  ]
                );
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
                  {counterDisplayValue}
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
                  {isFadingOut && fadeOutTotalDeckCards !== null ? fadeOutTotalDeckCards : totalDeckCards}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
        
        {/* Offline Indicator - compact square next to Collections button */}
        <OfflineBanner visible={!isConnected} />
      </View>
      
      <View style={styles.cardStage}>
        {/* Always render the card container to prevent layout shifts */}
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
              opacity: opacityAnim
            }
          ]}
          {...panResponder.panHandlers}
        >
          {/* Show loading card when transitioning or initializing */}
          {(isCardTransitioning || isInitializing || !currentCard) ? (
            <LoadingCard />
          ) : (
            <View style={styles.cardWithOverlayWrapper}>
              <FlashcardItem
                key={currentCard.id}
                flashcard={currentCard}
                disableTouchHandling={false}
                cardHeight={CARD_STAGE_HEIGHT}
                onImageToggle={(showImage) => {
                  setIsImageExpanded(showImage);
                }}
                isSrsModeActive={isSrsModeActive}
              />
              {/* Right swipe overlay - Green with checkmark - Only show in SRS Mode */}
              {isSrsModeActive && (
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
              {/* Left swipe overlay - Orange with loop/replay - Only show in SRS Mode */}
              {isSrsModeActive && (
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
            </View>
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
        </Animated.View>
      </View>

      <View style={[
        styles.controlsContainer,
        isImageExpanded && styles.controlsContainerExpanded
      ]}>
        <Text 
          style={styles.countText}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.7}
        >
          {!isInitializing && !isCardTransitioning 
            ? t('review.remaining', { count: remainingCount })
            : '•••'}
        </Text>
      </View>
      
      {deckSelector}
    </View>

    {/* Streak congratulations overlay - shown when user reaches 3 right swipes in a review session */}
    <Modal
      visible={showStreakCongratsOverlay}
      transparent
      animationType="fade"
      onRequestClose={() => setShowStreakCongratsOverlay(false)}
    >
      <TouchableOpacity
        style={styles.streakCongratsOverlay}
        activeOpacity={1}
        onPress={() => setShowStreakCongratsOverlay(false)}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.streakCongratsCard}>
            <Text style={styles.streakCongratsTitle}>{t('review.streak.congratsTitle')}</Text>
            <Text style={styles.streakCongratsBody}>
              {t('review.streak.congratsBody')}
            </Text>
            <Animated.View style={[styles.streakCongratsFireRow, { transform: [{ translateY: streakCongratsFloatTranslateY }] }]}>
              <Ionicons name="flame" size={48} color="#F59E0B" style={styles.streakCongratsFireIcon} />
              <Text style={styles.streakCongratsFireNumber}>{streakCount}</Text>
            </Animated.View>
            <TouchableOpacity
              style={styles.streakCongratsButton}
              onPress={() => setShowStreakCongratsOverlay(false)}
            >
              <Text style={styles.streakCongratsButtonText}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </>
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
    borderRadius: 16,
    overflow: 'hidden',
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
    color: 'rgba(59, 130, 246, 0.5)', // More transparent blue
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
    marginLeft: 8, // Space between Collections button and SRS Mode button
    zIndex: 1001,
    position: 'relative',
    elevation: 13,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)', // Default blue when no cards due
  },
  reviewModeButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  reviewModeButtonDisabled: {
    opacity: 0.5,
  },
  reviewModeButtonText: {
    color: 'rgba(59, 130, 246, 0.5)', // More transparent blue
    marginLeft: 4,
    fontWeight: '500',
    zIndex: 1001,
  },
  reviewModeButtonTextActive: {
    color: COLORS.text,
  },
  reviewModeButtonTextDisabled: {
    color: COLORS.lightGray,
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
  highlightedReviewButtonWrapper: {
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
    maxHeight: cardStageHeight,
    flex: 1, // Expand to fill available space
    position: 'relative',
    justifyContent: 'center',
    marginBottom: cardToControlsSpacing, // Proper spacing between card and controls
    overflow: 'hidden',
  },
  cardContainer: {
    flex: 1, // Expand to fill available space
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 15,
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
  controlsContainerExpanded: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 12,
    // Keep full width so the text does not wrap unexpectedly
    width: '100%',
  },
  countText: {
    color: '#b3b3b3',
    fontSize: 12,
    textAlign: 'center',
    width: '100%',
    // Fixed height relative to CONTROLS_HEIGHT to prevent vertical jumping
    height: 16,
    lineHeight: 16,
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
  streakCongratsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  streakCongratsCard: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 16,
    padding: 24,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  streakCongratsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  streakCongratsBody: {
    fontSize: 16,
    color: COLORS.lightGray,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 16,
  },
  streakCongratsFireRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  streakCongratsFireIcon: {
    marginTop: 0,
  },
  streakCongratsFireNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.text,
  },
  streakCongratsButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  streakCongratsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RandomCardReviewer; 

