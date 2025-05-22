import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, PanResponder } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import FlashcardItem from './FlashcardItem';
import { useRandomCardReview } from '../../hooks/useRandomCardReview';
import { COLORS } from '../../constants/colors';
import MultiDeckSelector from './MultiDeckSelector';

interface RandomCardReviewerProps {
  // Add onCardSwipe callback prop
  onCardSwipe?: () => void;
}

const RandomCardReviewer: React.FC<RandomCardReviewerProps> = ({ onCardSwipe }) => {
  const {
    currentCard,
    isLoading,
    error,
    reviewSessionCards,
    handleSwipeLeft,
    handleSwipeRight,
    resetReviewSession,
    allFlashcards,
    selectRandomCard,
    setCurrentCard,
    removeCardFromSession,
    selectedDeckIds,
    updateSelectedDeckIds
  } = useRandomCardReview();

  // Local state for remaining cards count to prevent flickering
  const [remainingCount, setRemainingCount] = useState(reviewSessionCards.length);
  // Track if we're processing an action to prevent double-clicks
  const [isProcessing, setIsProcessing] = useState(false);
  // State for showing the deck selector modal
  const [showDeckSelector, setShowDeckSelector] = useState(false);
  // State to track if image is expanded (to hide controls)
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  
  // Animation values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Define swipe threshold
  const SWIPE_THRESHOLD = 120;

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

  // Reset animations when card changes
  useEffect(() => {
    slideAnim.setValue(0);
    opacityAnim.setValue(1);
    rotateAnim.setValue(0);
  }, [currentCard]);

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
    
    // Store current card for reference after animation
    const currentCardBeforeSwipe = currentCard;
    
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
      // Reset animations immediately to prepare for next card
      slideAnim.setValue(0);
      opacityAnim.setValue(0);
      rotateAnim.setValue(0);
      
      // Execute the callback based on direction
      if (direction === 'left') {
        handleSwipeLeft();
      } else {
        handleSwipeRight();
      }
      
      // Small timeout to ensure state has updated before continuing animation
      setTimeout(() => {
        // Fade in the new card
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          setIsProcessing(false);
        });
      }, 50); // Small delay to ensure state updates have processed
    });
  };

  // Manual button handlers (as fallback)
  const onReviewAgain = () => {
    resetReviewSession();
  };

  const onKeepCard = () => {
    completeSwipe('left');
  };

  const onDismissCard = () => {
    completeSwipe('right');
  };

  // Handle deck selection
  const handleDeckSelection = useCallback((deckIds: string[]) => {
    // Only do a full reset if the selection actually changed
    if (JSON.stringify(deckIds.sort()) !== JSON.stringify(selectedDeckIds.sort())) {
      // When changing decks, we want to reset the review session
      // This ensures we get a clean start with the newly selected decks
      updateSelectedDeckIds(deckIds);
      
      // Wait for the deck selection modal to close before resetting
      setTimeout(() => {
        resetReviewSession();
      }, 100);
    }
    
    setShowDeckSelector(false);
  }, [selectedDeckIds, updateSelectedDeckIds, resetReviewSession]);

  // Memoize the MultiDeckSelector to prevent unnecessary re-renders
  const deckSelector = useMemo(() => (
    <MultiDeckSelector 
      visible={showDeckSelector}
      onClose={() => setShowDeckSelector(false)}
      onSelectDecks={handleDeckSelection}
      initialSelectedDeckIds={selectedDeckIds}
    />
  ), [showDeckSelector, selectedDeckIds, handleDeckSelection]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading flashcards...</Text>
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
    // Check if there are no cards at all in allFlashcards
    if (reviewSessionCards.length === 0 && allFlashcards.length === 0) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.deckButton} 
              onPress={() => setShowDeckSelector(true)}
            >
              <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
              <Text style={styles.deckButtonText}>Select Collections</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.noCardsText}>Nothing to review</Text>
          <Text style={styles.guidanceText}>Go scan some text to add to your collection!</Text>
          {deckSelector}
        </View>
      );
    }
    
    // If we have cards but finished reviewing them, or if we want to start a fresh review
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.deckButton} 
            onPress={() => setShowDeckSelector(true)}
          >
            <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
            <Text style={styles.deckButtonText}>Select Collections</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.noCardsText}>You've finished your review!</Text>
        <TouchableOpacity 
          style={styles.reviewAgainButton} 
          onPress={onReviewAgain}
        >
          <Text style={styles.reviewAgainText}>Review Again</Text>
        </TouchableOpacity>
        {deckSelector}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.deckButton} 
          onPress={() => setShowDeckSelector(true)}
        >
          <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
          <Text style={styles.deckButtonText}>Collections</Text>
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
            {remainingCount} remaining (swipe ← to review, → to dismiss)
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
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 5,
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
    minHeight: 450,
    maxHeight: 600,
    flexShrink: 1,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 5,
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
    height: 320,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
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