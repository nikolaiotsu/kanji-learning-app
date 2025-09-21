import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, PanResponder } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FlashcardItem from './FlashcardItem';
import { useRandomCardReview, LoadingState } from '../../hooks/useRandomCardReview';
import { getFlashcardsByDecks } from '../../services/supabaseStorage';
import { Flashcard } from '../../types/Flashcard';
import { COLORS } from '../../constants/colors';
import MultiDeckSelector from './MultiDeckSelector';
import * as Haptics from 'expo-haptics';

// Storage key for selected deck IDs
const SELECTED_DECK_IDS_STORAGE_KEY = 'selectedDeckIds';

interface RandomCardReviewerProps {
  // Add onCardSwipe callback prop
  onCardSwipe?: () => void;
}

const RandomCardReviewer: React.FC<RandomCardReviewerProps> = ({ onCardSwipe }) => {
  const { t } = useTranslation();
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

  // Deck selection state (moved from hook to component)
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [deckIdsLoaded, setDeckIdsLoaded] = useState(false);
  const [filteredCards, setFilteredCards] = useState<Flashcard[]>([]);
  
  // Consolidated loading state management to prevent flickering
  const [componentLoadingState, setComponentLoadingState] = useState<'initializing' | 'loading_deck_change' | 'ready'>('initializing');
  const [isCardTransitioning, setIsCardTransitioning] = useState(false);
  const [isCardVisible, setIsCardVisible] = useState(false);
  
  // Prevent multiple initialization calls with refs
  const initializationInProgressRef = useRef(false);
  const lastFilteredCardsHashRef = useRef<string>('');
  
  // Bulletproof loading coordination - prevent any card visibility until fully ready
  const [isContentFullyReady, setIsContentFullyReady] = useState(false);
  
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

  // Filter cards based on selected decks with proper loading states and operation tracking
  useEffect(() => {
    const filterCards = async () => {
      if (!deckIdsLoaded) return;
      
      // Only set loading state for deck changes after initial load
      if (componentLoadingState === 'ready') {
        setComponentLoadingState('loading_deck_change');
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
            setFilteredCards(cards);
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
  }, [selectedDeckIds, allFlashcards, deckIdsLoaded]);

  // Update selected deck IDs
  const updateSelectedDeckIds = async (deckIds: string[]) => {
    try {
      setSelectedDeckIds(deckIds);
      await AsyncStorage.setItem(SELECTED_DECK_IDS_STORAGE_KEY, JSON.stringify(deckIds));
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

  // Bulletproof card transition handling with strict loading coordination
  useEffect(() => {
    if (currentCard && 
        currentCard.id !== lastCardId && 
        !isProcessing && 
        componentLoadingState === 'ready' && 
        isContentFullyReady) {
      
      console.log('🎬 [Component] Starting bulletproof card transition for:', currentCard.id);
      setIsCardTransitioning(true);
      
      // Reset position and rotation
      slideAnim.setValue(0);
      rotateAnim.setValue(0);
      
      // Start with card invisible, then fade in
      opacityAnim.setValue(0);
      setIsCardVisible(true);
      
      // Use double-RAF for bulletproof timing
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 400, // Smooth appearance
            useNativeDriver: true,
          }).start(() => {
            setIsCardTransitioning(false);
            console.log('🎬 [Component] Bulletproof card transition complete');
          });
        });
      });
      
      setLastCardId(currentCard.id);
    } else if (!currentCard && componentLoadingState === 'ready') {
      // Handle case when no card is selected
      setIsCardVisible(false);
      opacityAnim.setValue(0);
      setLastCardId(null);
      setIsCardTransitioning(false);
    } else if (currentCard && (componentLoadingState !== 'ready' || !isContentFullyReady)) {
      // Card exists but component isn't fully ready - keep it invisible
      console.log('🚫 [Component] Keeping card invisible - not fully ready');
      setIsCardVisible(false);
      opacityAnim.setValue(0);
    }
  }, [currentCard, lastCardId, isProcessing, componentLoadingState, isContentFullyReady]);

  // Reset card visibility when component loading state changes to prevent flashes
  useEffect(() => {
    if (componentLoadingState === 'loading_deck_change') {
      setIsCardVisible(false);
      setIsContentFullyReady(false);
      opacityAnim.setValue(0);
      setLastCardId(null);
    }
  }, [componentLoadingState]);

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
      setIsContentFullyReady(false);
    };
  }, []);

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
      // Hide the card completely during the transition
      setIsCardVisible(false);
      
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
      // Wait for hook to finish initial loading before component initialization
      if (loadingState === LoadingState.SKELETON_LOADING) {
        console.log('🔄 [Component] Waiting for hook to finish loading...');
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
          
          // Set component as ready
          setComponentLoadingState('ready');
          
          // Small additional delay to ensure all state is synchronized
          setTimeout(() => {
            // Triple-check operation ID before final completion
            if (!deckSelectionCancelledRef.current && currentDeckSelectionRef.current === initOpId) {
              setIsContentFullyReady(true);
              initializationInProgressRef.current = false;
              console.log('🔄 [Component] Bulletproof initialization complete (Op:', initOpId, ')');
            } else {
              console.log('🚫 [Component] Final initialization cancelled - operation changed from', initOpId, 'to', currentDeckSelectionRef.current);
              initializationInProgressRef.current = false;
            }
          }, 50);
        }, 10);
      } else {
        // Handle case where no cards are available
        console.log('🔄 [Component] No cards available after filtering');
        setComponentLoadingState('ready');
        lastFilteredCardsHashRef.current = '';
      }
    };
    
    initializeReviewSession();
  }, [filteredCards, deckIdsLoaded, startReviewWithCards, componentLoadingState, loadingState]);

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
      
      // Start loading state for deck change
      setComponentLoadingState('loading_deck_change');
      
      // Hide current card immediately and show loading
      setCurrentCard(null);
      setIsCardVisible(false);
      setIsContentFullyReady(false);
      
      try {
        // Update deck selection and handle filtering inline to prevent race conditions
        setSelectedDeckIds(deckIds);
        await AsyncStorage.setItem(SELECTED_DECK_IDS_STORAGE_KEY, JSON.stringify(deckIds));
        
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
  }, [selectedDeckIds, allFlashcards, setCurrentCard]);

  // Memoize the MultiDeckSelector to prevent unnecessary re-renders
  const deckSelector = useMemo(() => (
    <MultiDeckSelector 
      visible={showDeckSelector}
      onClose={() => setShowDeckSelector(false)}
      onSelectDecks={handleDeckSelection}
      initialSelectedDeckIds={selectedDeckIds}
    />
  ), [showDeckSelector, selectedDeckIds, handleDeckSelection]);

  // Industry standard: Only show hook loading for initial data fetch
  if (loadingState === LoadingState.SKELETON_LOADING && componentLoadingState === 'initializing') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.deckButton} 
            disabled={true}
          >
            <Ionicons name="albums-outline" size={20} color={COLORS.lightGray} />
            <Text style={[styles.deckButtonText, { color: COLORS.lightGray }]}>{t('review.collections')}</Text>
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

  if (!currentCard && componentLoadingState === 'ready') {
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
          disabled={isCardTransitioning || componentLoadingState !== 'ready'}
        >
          <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
          <Text style={styles.deckButtonText}>{t('review.collections')}</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.cardStage}>
        {/* Show loading animation only during deck changes (not initial load) */}
        {componentLoadingState === 'loading_deck_change' ? (
          <LoadingCard />
        ) : currentCard && isCardVisible ? (
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
            <FlashcardItem 
              key={currentCard.id}
              flashcard={currentCard} 
              disableTouchHandling={false}
              onImageToggle={(showImage) => {
                setIsImageExpanded(showImage);
              }} 
            />
          </Animated.View>
        ) : null}
      </View>

      {!isImageExpanded && (
        <View style={styles.controlsContainer}>
          <Text style={styles.countText}>
            {componentLoadingState === 'ready' ? t('review.remaining', { count: remainingCount }) : '•••'}
          </Text>
        </View>
      )}
      
      {deckSelector}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 0, // Removed border radius to reach screen edges
    paddingTop: 60, // add top padding to accommodate absolute header
    paddingHorizontal: 0, // horizontal padding unchanged
    paddingBottom: 15,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minHeight: 500, // Increased minimum height for larger cards
    maxHeight: 700, // Increased maximum height for larger cards
    flexShrink: 1,
  },
  header: {
    position: 'absolute',
    top: 15, // match container's original top padding
    left: 0,
    right: 0,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 15,
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
    height: 380, // Increased height for larger cards
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15, // Adjusted padding for better card display
  },
  cardContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 5,
  },
  countText: {
    color: '#b3b3b3',
    fontSize: 12,
  },
  loadingCardContainer: {
    width: '100%',
    height: 380,
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
    height: 380,
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