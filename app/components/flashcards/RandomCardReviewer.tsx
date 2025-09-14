import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, PanResponder } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FlashcardItem from './FlashcardItem';
import { useRandomCardReview } from '../../hooks/useRandomCardReview';
import { getFlashcardsByDecks } from '../../services/supabaseStorage';
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
  const [filteredCards, setFilteredCards] = useState(allFlashcards);
  
  // Add initialization state to prevent flickering during startup
  const [isInitialized, setIsInitialized] = useState(false);

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
  
  // Animation values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current; // Start with 0 opacity
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Define swipe threshold
  const SWIPE_THRESHOLD = 120;

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

  // Filter cards based on selected decks
  useEffect(() => {
    const filterCards = async () => {
      if (!deckIdsLoaded) return;
      
      if (selectedDeckIds.length > 0) {
        // Fetch cards for selected decks
        try {
          const cards = await getFlashcardsByDecks(selectedDeckIds);
          setFilteredCards(cards);
        } catch (error) {
          console.error('Error fetching cards for selected decks:', error);
          setFilteredCards(allFlashcards);
        }
      } else {
        // Use all cards if no specific decks selected
        setFilteredCards(allFlashcards);
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

  // Handle smooth card transitions when card changes
  useEffect(() => {
    if (currentCard && currentCard.id !== lastCardId && !isProcessing && isInitialized) {
      // Reset position and rotation
      slideAnim.setValue(0);
      rotateAnim.setValue(0);
      
      // Smooth fade-in animation for new card
      opacityAnim.setValue(0);
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: lastCardId === null ? 400 : 300, // Slightly longer for initial load
        useNativeDriver: true,
      }).start();
      
      setLastCardId(currentCard.id);
    } else if (!currentCard && isInitialized) {
      // Handle case when no card is selected (only after initialization)
      opacityAnim.setValue(0);
      setLastCardId(null);
    } else if (currentCard && !isInitialized) {
      // For initial load, set opacity to 1 immediately to prevent flash
      opacityAnim.setValue(1);
      setLastCardId(currentCard.id);
    }
  }, [currentCard, lastCardId, isProcessing, isInitialized]);

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

  // Start review session with filtered cards whenever they change
  useEffect(() => {
    if (filteredCards.length > 0 && deckIdsLoaded) {
      startReviewWithCards(filteredCards);
      // Mark as initialized once we've started the review session
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [filteredCards, deckIdsLoaded, startReviewWithCards, isInitialized]);

  // Handle deck selection
  const handleDeckSelection = useCallback(async (deckIds: string[]) => {
    // Only do a full reset if the selection actually changed
    if (JSON.stringify(deckIds.sort()) !== JSON.stringify(selectedDeckIds.sort())) {
      // Reset initialization state to show loading during deck change
      setIsInitialized(false);
      
      // Clear current card immediately to avoid on-screen flicker while new deck loads
      setCurrentCard(null);

      // Update selected deck IDs – this triggers filtering and a fresh review session
      await updateSelectedDeckIds(deckIds);
    }
    
    setShowDeckSelector(false);
  }, [selectedDeckIds, updateSelectedDeckIds, setCurrentCard]);

  // Memoize the MultiDeckSelector to prevent unnecessary re-renders
  const deckSelector = useMemo(() => (
    <MultiDeckSelector 
      visible={showDeckSelector}
      onClose={() => setShowDeckSelector(false)}
      onSelectDecks={handleDeckSelection}
      initialSelectedDeckIds={selectedDeckIds}
    />
  ), [showDeckSelector, selectedDeckIds, handleDeckSelection]);

  // Unified loading / preparing state: show only the spinner (no text)
  // Only show loading spinner if we're actually loading or not yet initialized
  if (
    isLoading ||
    (!isInitialized && !isSessionFinished)
  ) {
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

  if (!currentCard) {
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
          <Text style={styles.noCardsText}>{t('review.nothingToReview')}</Text>
          <Text style={styles.guidanceText}>{t('review.scanText')}</Text>
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
          <Text style={styles.noCardsText}>{t('review.finishedReview')}</Text>
          <TouchableOpacity 
            style={styles.reviewAgainButton} 
            onPress={onReviewAgain}
          >
            <Text style={styles.reviewAgainText}>{t('review.reviewAgain')}</Text>
          </TouchableOpacity>
          {deckSelector}
        </View>
      );
    }

    // Fallback (should rarely hit) – show spinner
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
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
        >
          <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
          <Text style={styles.deckButtonText}>{t('review.collections')}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardStage}>
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
      </View>

      {!isImageExpanded && (
        <View style={styles.controlsContainer}>
          <Text style={styles.countText}>
            {t('review.remaining', { count: remainingCount })}
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
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
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