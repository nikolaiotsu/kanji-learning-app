import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, PanResponder } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import FlashcardItem from './FlashcardItem';
import { useRandomCardReview } from '../../hooks/useRandomCardReview';
import { COLORS } from '../../constants/colors';

interface RandomCardReviewerProps {
  // No props needed
}

const RandomCardReviewer: React.FC<RandomCardReviewerProps> = () => {
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
    removeCardFromSession
  } = useRandomCardReview();

  // Local state for remaining cards count to prevent flickering
  const [remainingCount, setRemainingCount] = useState(reviewSessionCards.length);
  // Track if we're processing an action to prevent double-clicks
  const [isProcessing, setIsProcessing] = useState(false);
  
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
          <Text style={styles.noCardsText}>Nothing to review</Text>
          <Text style={styles.guidanceText}>Go scan some text to make new flashcards!</Text>
        </View>
      );
    }
    
    // If we have cards but finished reviewing them, or if we want to start a fresh review
    return (
      <View style={styles.container}>
        <Text style={styles.noCardsText}>You've finished your review!</Text>
        <TouchableOpacity 
          style={styles.reviewAgainButton} 
          onPress={onReviewAgain}
        >
          <Text style={styles.reviewAgainText}>Review Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          />
        </Animated.View>
      </View>

      <View style={styles.controlsContainer}>
        <Text style={styles.swipeInstructionText}>
          Swipe left to review again, right to dismiss
        </Text>
        <Text style={styles.countText}>
          {remainingCount} cards remaining
        </Text>
      </View>
      
      {/* Optional buttons removed as swipe gestures are sufficient */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5, // Add elevation for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  cardStage: {
    width: '100%',
    height: 300, // Fixed height for consistent card rendering
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
  },
  swipeInstructionText: {
    color: COLORS.lightGray,
    fontSize: 14,
    marginBottom: 5,
  },
  countText: {
    color: COLORS.lightGray,
    fontSize: 14,
    marginTop: 5,
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
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  reviewAgainText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default RandomCardReviewer; 