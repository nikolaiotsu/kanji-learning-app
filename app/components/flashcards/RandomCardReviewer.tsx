import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
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

  // Simple handlers for button clicks
  const onReviewAgain = () => {
    resetReviewSession();
  };

  const onKeepCard = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      // Just select a random card without animation
      handleSwipeLeft();
    } finally {
      // Immediately reset processing state for better responsiveness
      setIsProcessing(false);
    }
  };

  const onDismissCard = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      if (currentCard) {
        const cardId = currentCard.id;
        const isLastCard = reviewSessionCards.length <= 1;
        
        // Remove the card from session
        removeCardFromSession(cardId);
        
        if (isLastCard) {
          // This was the last card, complete the review
          setCurrentCard(null);
          setRemainingCount(0);
        } else {
          // Get remaining cards after removal
          const remainingCards = reviewSessionCards.filter(card => card.id !== cardId);
          // Select a new random card
          selectRandomCard(remainingCards);
          // Update remaining count
          setRemainingCount(remainingCards.length);
        }
      }
    } finally {
      // Immediately reset processing state for better responsiveness
      setIsProcessing(false);
    }
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
        <View style={styles.cardContainer}>
          <FlashcardItem flashcard={currentCard} />
        </View>
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          style={[styles.controlButton, styles.leftButton]} 
          onPress={onKeepCard}
          disabled={isProcessing}
        >
          <MaterialIcons name="refresh" size={24} color="white" />
        </TouchableOpacity>
        
        <Text style={styles.countText}>
          {remainingCount} cards remaining
        </Text>
        
        <TouchableOpacity 
          style={[styles.controlButton, styles.rightButton]} 
          onPress={onDismissCard}
          disabled={isProcessing}
        >
          <Ionicons name="checkmark-done" size={24} color="white" />
        </TouchableOpacity>
      </View>
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
    marginBottom: 20,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
    paddingHorizontal: 20,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftButton: {
    backgroundColor: COLORS.primary,
  },
  rightButton: {
    backgroundColor: COLORS.secondary,
  },
  countText: {
    color: 'white',
    fontSize: 14,
  },
  loadingText: {
    color: 'white',
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
    borderRadius: 5,
    marginTop: 10,
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
  },
  noCardsText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  hintText: {
    color: COLORS.pastelYellow,
    textAlign: 'center',
  },
  completeText: {
    color: COLORS.pastelGreen,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  resetButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  resetText: {
    color: 'white',
    fontWeight: 'bold',
  },
  reviewAgainButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    marginTop: 15,
  },
  reviewAgainText: {
    color: 'white',
    fontWeight: 'bold',
  },
  guidanceText: {
    color: COLORS.pastelYellow,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
  },
});

export default RandomCardReviewer; 