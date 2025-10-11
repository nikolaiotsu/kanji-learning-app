import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, PanResponder, Dimensions } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FlashcardItem from './FlashcardItem';
import { useRandomCardReview, LoadingState } from '../../hooks/useRandomCardReview';
import { getFlashcardsByDecks } from '../../services/supabaseStorage';
import { Flashcard } from '../../types/Flashcard';
import { COLORS } from '../../constants/colors';
import MultiDeckSelector from './MultiDeckSelector';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';

// Storage key generator for selected deck IDs (user-specific)
const getSelectedDeckIdsStorageKey = (userId: string) => `selectedDeckIds_${userId}`;
const LEGACY_SELECTED_DECK_IDS_STORAGE_KEY = 'selectedDeckIds'; // For migration

interface RandomCardReviewerProps {
  // Add onCardSwipe callback prop
  onCardSwipe?: () => void;
  // Add callback to notify when content is ready for display
  onContentReady?: (isReady: boolean) => void;
}

const RandomCardReviewer: React.FC<RandomCardReviewerProps> = ({ onCardSwipe, onContentReady }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
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
    removeCardFromSession
  } = useRandomCardReview();

  // Internal spacing constants for card layout
  const HEADER_HEIGHT = 45;
  const HEADER_TO_CARD_SPACING = 16;
  const CARD_TO_CONTROLS_SPACING = 12;
  const CONTROLS_HEIGHT = 25;
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
  
  // Animation values - Initialize with proper starting values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Define swipe threshold
  const SWIPE_THRESHOLD = 120;

  // Loading animation component - clean spinner without text
  const LoadingCard = () => (
    <View style={styles.cardStage}>
      <View style={styles.cardContainer}>
        <View style={styles.loadingCardContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    </View>
  );

  // Load selected deck IDs from AsyncStorage on initialization (user-specific)
  useEffect(() => {
    const loadSelectedDeckIds = async () => {
      if (!user?.id) {
        console.log('👤 [Component] No user, skipping deck selection load');
        setDeckIdsLoaded(true);
        return;
      }

      try {
        const userStorageKey = getSelectedDeckIdsStorageKey(user.id);
        console.log('👤 [Component] Loading deck selection for user:', user.id);
        
        // Try to load user-specific deck selection
        let storedDeckIds = await AsyncStorage.getItem(userStorageKey);
        
        // Migration: If no user-specific data, check for legacy global key
        if (!storedDeckIds) {
          console.log('👤 [Component] No user-specific deck selection, checking legacy key');
          const legacyDeckIds = await AsyncStorage.getItem(LEGACY_SELECTED_DECK_IDS_STORAGE_KEY);
          
          if (legacyDeckIds) {
            console.log('👤 [Component] Migrating legacy deck selection to user-specific key');
            // Migrate to user-specific key
            await AsyncStorage.setItem(userStorageKey, legacyDeckIds);
            // Clear the legacy key
            await AsyncStorage.removeItem(LEGACY_SELECTED_DECK_IDS_STORAGE_KEY);
            storedDeckIds = legacyDeckIds;
          }
        }
        
        if (storedDeckIds) {
          const deckIds = JSON.parse(storedDeckIds);
          console.log('👤 [Component] Loaded deck selection:', deckIds.length, 'decks');
          setSelectedDeckIds(deckIds);
        } else {
          console.log('👤 [Component] No deck selection found, using all decks');
          setSelectedDeckIds([]);
        }
      } catch (error) {
        console.error('Error loading selected deck IDs from AsyncStorage:', error);
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
      console.log('🔍 [Component] Filtering cards for operation:', currentOpId, 'selectedDecks:', selectedDeckIds.length);
      
      if (selectedDeckIds.length > 0) {
        // Fetch cards for selected decks
        try {
          const cards = await getFlashcardsByDecks(selectedDeckIds);
          
          // Check if this operation is still current
          if (currentDeckSelectionRef.current === currentOpId) {
            console.log('✅ [Component] Filtered cards ready for operation:', currentOpId, 'cards:', cards.length);
            
            // SMART VALIDATION: If selected decks result in 0 cards but we have cards in total,
            // the deck selection is invalid (decks don't exist or are empty for this user)
            if (cards.length === 0 && allFlashcards.length > 0) {
              console.warn('⚠️ [Component] Selected decks have 0 cards but user has', allFlashcards.length, 'total cards - clearing invalid deck selection');
              // Clear the invalid deck selection
              setSelectedDeckIds([]);
              // Clear from storage
              if (user?.id) {
                const userStorageKey = getSelectedDeckIdsStorageKey(user.id);
                await AsyncStorage.removeItem(userStorageKey).catch(err => 
                  console.error('Error clearing invalid deck selection:', err)
                );
              }
              // Use all cards instead
              setFilteredCards(allFlashcards);
            } else {
              setFilteredCards(cards);
            }
          } else {
            console.log('🚫 [Component] Filtering cancelled - operation changed from', currentOpId, 'to', currentDeckSelectionRef.current);
          }
        } catch (error) {
          console.error('Error fetching cards for selected decks:', error);
          if (currentDeckSelectionRef.current === currentOpId) {
            setFilteredCards(allFlashcards);
          }
        }
      } else {
        // Use all cards if no specific decks selected
        if (currentDeckSelectionRef.current === currentOpId) {
          console.log('✅ [Component] Using all cards for operation:', currentOpId, 'cards:', allFlashcards.length);
          setFilteredCards(allFlashcards);
        }
      }
    };

    filterCards();
  }, [selectedDeckIds, allFlashcards, deckIdsLoaded, user?.id]);

  // Update selected deck IDs (user-specific)
  const updateSelectedDeckIds = async (deckIds: string[]) => {
    if (!user?.id) {
      console.warn('Cannot save deck selection: No user logged in');
      return;
    }

    try {
      setSelectedDeckIds(deckIds);
      const userStorageKey = getSelectedDeckIdsStorageKey(user.id);
      await AsyncStorage.setItem(userStorageKey, JSON.stringify(deckIds));
      console.log('👤 [Component] Saved deck selection for user:', user.id, '- Decks:', deckIds.length);
    } catch (error) {
      console.error('Error saving selected deck IDs to AsyncStorage:', error);
    }
  };

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

  // Simplified card transition handling
  useEffect(() => {
    if (currentCard && 
        currentCard.id !== lastCardId && 
        !isProcessing && 
        !isInitializing) {
      
      console.log('✅ [Component] Starting smooth card transition for:', currentCard.id);
      
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
        console.log('✅ [Component] Card transition complete');
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
  }, []);

  // Reset initialization state when component unmounts or remounts
  useEffect(() => {
    return () => {
      // Clean up refs on unmount to prevent stale state
      initializationInProgressRef.current = false;
      lastFilteredCardsHashRef.current = '';
      currentDeckSelectionRef.current = 0;
      deckSelectionCancelledRef.current = false;
      setIsInitializing(true);
    };
  }, []);

  // Notify parent when content is ready for display
  useEffect(() => {
    const isContentReady = !isInitializing && 
                          !isCardTransitioning && 
                          loadingState === LoadingState.CONTENT_READY &&
                          !isLoading;
    
    if (onContentReady) {
      onContentReady(isContentReady);
    }
  }, [isInitializing, isCardTransitioning, loadingState, isLoading, onContentReady]);

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
        console.log('🔄 [Component] Waiting for hook to load initial data...');
        return;
      }
      
      if (loadingState === LoadingState.ERROR) {
        console.log('🔄 [Component] Waiting for error state to resolve...');
        return;
      }
      
      // Prevent multiple initialization calls for the same cards
      const cardsHash = filteredCards.map(card => card.id).sort().join(',');
      if (initializationInProgressRef.current || cardsHash === lastFilteredCardsHashRef.current) {
        console.log('🔄 [Component] Skipping duplicate initialization - inProgress:', initializationInProgressRef.current, 'sameCards:', cardsHash === lastFilteredCardsHashRef.current, 'Op:', currentDeckSelectionRef.current);
        return;
      }
      
      if (filteredCards.length > 0) {
        console.log('🔄 [Component] Starting review session with', filteredCards.length, 'cards for operation:', currentDeckSelectionRef.current);
        
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
            console.log('🚫 [Component] Initialization cancelled - operation changed from', initOpId, 'to', currentDeckSelectionRef.current);
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
          console.log('🔄 [Component] Smooth initialization complete (Op:', initOpId, ')');
        }, 10);
      } else {
        // Handle case where no cards are available
        console.log('🔄 [Component] No cards available after filtering');
        setIsInitializing(false);
        lastFilteredCardsHashRef.current = '';
      }
    };
    
    initializeReviewSession();
  }, [filteredCards, deckIdsLoaded, startReviewWithCards, loadingState]);

  // Handle deck selection with cancellation-based approach for rapid selections
  const handleDeckSelection = useCallback(async (deckIds: string[]) => {
    // Only do a full reset if the selection actually changed
    if (JSON.stringify(deckIds.sort()) !== JSON.stringify(selectedDeckIds.sort())) {
      // Cancel any previous deck selection operation
      deckSelectionCancelledRef.current = true;
      
      // Create new operation ID
      const operationId = ++currentDeckSelectionRef.current;
      deckSelectionCancelledRef.current = false;
      
      console.log('🎯 [Component] Deck selection changed, starting transition (Op:', operationId, ')');
      
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
            console.log('✅ [Component] Inline filtered cards for operation:', operationId, 'cards:', newFilteredCards.length);
          } catch (error) {
            console.error('Error fetching cards for selected decks:', error);
            newFilteredCards = allFlashcards;
          }
        } else {
          newFilteredCards = allFlashcards;
        }
        
        // Check if this operation was cancelled while we were updating
        if (currentDeckSelectionRef.current !== operationId) {
          console.log('🚫 [Component] Deck selection cancelled (Op:', operationId, ', Current:', currentDeckSelectionRef.current, ')');
          return;
        }
        
        // Set filtered cards and trigger initialization
        setFilteredCards(newFilteredCards);
        
        console.log('🎯 [Component] Deck selection update complete (Op:', operationId, ')');
      } catch (error) {
        console.error('🚫 [Component] Deck selection error (Op:', operationId, '):', error);
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
          <TouchableOpacity 
            style={styles.deckButton} 
            disabled={true}
          >
            <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
            <Text style={styles.deckButtonText}>{t('review.collections')}</Text>
          </TouchableOpacity>
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
    // No flashcards at all
    if (reviewSessionCards.length === 0 && filteredCards.length === 0) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.deckButton} 
              onPress={() => setShowDeckSelector(true)}
            >
              <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
              <Text style={styles.deckButtonText}>{t('review.collections')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardStage}>
            <View style={styles.noCardsContainer}>
              <Text style={styles.noCardsText}>{t('review.nothingToReview')}</Text>
              <Text style={styles.guidanceText}>{t('review.scanText')}</Text>
            </View>
          </View>
          <View style={styles.controlsContainer}>
            <Text style={styles.countText}>{t('review.remaining', { count: 0 })}</Text>
          </View>
          {deckSelector}
        </View>
      );
    }
    // Session finished – show "Review again" option
    if (isSessionFinished) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.deckButton} 
              onPress={() => setShowDeckSelector(true)}
            >
              <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
              <Text style={styles.deckButtonText}>{t('review.collections')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardStage}>
            <View style={styles.noCardsContainer}>
              <Text style={styles.noCardsText}>{t('review.finishedReview')}</Text>
              <TouchableOpacity 
                style={styles.reviewAgainButton} 
                onPress={onReviewAgain}
              >
                <Text style={styles.reviewAgainText}>{t('review.reviewAgain')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.controlsContainer}>
            <Text style={styles.countText}>{t('review.remaining', { count: 0 })}</Text>
          </View>
          {deckSelector}
        </View>
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.deckButton} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowDeckSelector(true);
          }}
          disabled={isCardTransitioning || isInitializing}
        >
          <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
          <Text style={styles.deckButtonText}>{t('review.collections')}</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.cardStage}>
        {/* Show loading during transitions, otherwise show card if available */}
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
            <FlashcardItem 
              key={currentCard.id}
              flashcard={currentCard} 
              disableTouchHandling={false}
              cardHeight={CARD_STAGE_HEIGHT}
              onImageToggle={(showImage) => {
                setIsImageExpanded(showImage);
              }} 
            />
          </Animated.View>
        ) : isInitializing ? (
          <LoadingCard />
        ) : null}
      </View>

      {!isImageExpanded && (
        <View style={styles.controlsContainer}>
          <Text style={styles.countText}>
            {!isInitializing && !isCardTransitioning ? t('review.remaining', { count: remainingCount }) : '•••'}
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
  },
  deckButtonText: {
    color: COLORS.primary,
    marginLeft: 4,
    fontWeight: '500',
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
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: controlsHeight,
    paddingTop: 0, // Spacing handled by cardStage marginBottom (12pt)
  },
  countText: {
    color: '#b3b3b3',
    fontSize: 12,
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
});

export default RandomCardReviewer; 