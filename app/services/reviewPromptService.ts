import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// Storage keys
const LIFETIME_FLASHCARD_COUNT_KEY = 'lifetime_flashcard_count';
const REVIEW_PROMPT_STATE_KEY = 'review_prompt_state';

// Constants
const INITIAL_PROMPT_THRESHOLD = 10; // Show after 10 flashcards
const REMIND_LATER_DAYS = 7; // Show again after 7 days
const NO_THANKS_THRESHOLD = 50; // Show again after 50 more cards

export interface ReviewPromptState {
  dismissed: boolean;
  remindLaterDate: string | null;
  noThanksAfterCount: number | null;
  hasReviewed: boolean;
  reviewedAt?: string | null; // Timestamp when user chose to rate
}

/**
 * Get the current lifetime flashcard count
 */
export const getLifetimeFlashcardCount = async (): Promise<number> => {
  try {
    const countStr = await AsyncStorage.getItem(LIFETIME_FLASHCARD_COUNT_KEY);
    return countStr ? parseInt(countStr, 10) : 0;
  } catch (error) {
    logger.error('Error getting lifetime flashcard count:', error);
    return 0;
  }
};

/**
 * Increment the lifetime flashcard count
 * Should be called every time a flashcard is saved
 */
export const incrementLifetimeCount = async (): Promise<number> => {
  try {
    const currentCount = await getLifetimeFlashcardCount();
    const newCount = currentCount + 1;
    await AsyncStorage.setItem(LIFETIME_FLASHCARD_COUNT_KEY, newCount.toString());
    logger.log('Lifetime flashcard count incremented to:', newCount);
    return newCount;
  } catch (error) {
    logger.error('Error incrementing lifetime flashcard count:', error);
    return 0;
  }
};

/**
 * Get the current review prompt state
 */
export const getReviewPromptState = async (): Promise<ReviewPromptState> => {
  try {
    const stateStr = await AsyncStorage.getItem(REVIEW_PROMPT_STATE_KEY);
    if (stateStr) {
      return JSON.parse(stateStr);
    }
    // Return default state
    return {
      dismissed: false,
      remindLaterDate: null,
      noThanksAfterCount: null,
      hasReviewed: false,
    };
  } catch (error) {
    logger.error('Error getting review prompt state:', error);
    return {
      dismissed: false,
      remindLaterDate: null,
      noThanksAfterCount: null,
      hasReviewed: false,
    };
  }
};

/**
 * Update the review prompt state
 */
export const updateReviewPromptState = async (state: ReviewPromptState): Promise<void> => {
  try {
    await AsyncStorage.setItem(REVIEW_PROMPT_STATE_KEY, JSON.stringify(state));
    logger.log('Review prompt state updated:', state);
  } catch (error) {
    logger.error('Error updating review prompt state:', error);
  }
};

/**
 * Determine if the review prompt should be shown
 * 
 * CRITICAL: Once hasReviewed is true, the prompt should NEVER show again.
 * This takes precedence over all other conditions.
 */
export const shouldShowReviewPrompt = async (): Promise<boolean> => {
  try {
    const lifetimeCount = await getLifetimeFlashcardCount();
    const state = await getReviewPromptState();

    // PRIORITY CHECK: Never show again if user has reviewed
    // This is checked first and overrides all other logic
    if (state.hasReviewed) {
      logger.log('Review prompt: User has already reviewed, will never show again');
      return false;
    }

    // If "Remind Later" was selected, check if 7 days have passed
    if (state.remindLaterDate) {
      const remindDate = new Date(state.remindLaterDate);
      const now = new Date();
      const daysPassed = (now.getTime() - remindDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysPassed >= REMIND_LATER_DAYS) {
        // Enough time has passed, can show again
        logger.log('Review prompt: 7 days passed since "Remind Later", can show again');
        return true;
      } else {
        // Not enough time has passed
        logger.log(`Review prompt: Only ${daysPassed.toFixed(1)} days passed, need ${REMIND_LATER_DAYS}`);
        return false;
      }
    }

    // If "No Thanks" was selected, check if 50 more cards have been saved
    if (state.noThanksAfterCount !== null) {
      const cardsSinceNoThanks = lifetimeCount - state.noThanksAfterCount;
      
      if (cardsSinceNoThanks >= NO_THANKS_THRESHOLD) {
        // User has saved 50 more cards, can show again
        logger.log('Review prompt: 50 more cards saved since "No Thanks", can show again');
        return true;
      } else {
        // Not enough cards saved yet
        logger.log(`Review prompt: Only ${cardsSinceNoThanks} cards since "No Thanks", need ${NO_THANKS_THRESHOLD}`);
        return false;
      }
    }

    // Initial trigger: show after 10 flashcards
    if (lifetimeCount >= INITIAL_PROMPT_THRESHOLD && !state.dismissed) {
      logger.log('Review prompt: Reached 10 flashcards, showing prompt');
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error checking if review prompt should show:', error);
    return false;
  }
};

/**
 * Record that the user chose to rate the app
 */
export const recordReviewAction = async (action: 'rate' | 'later' | 'no-thanks'): Promise<void> => {
  try {
    const state = await getReviewPromptState();
    const lifetimeCount = await getLifetimeFlashcardCount();

    switch (action) {
      case 'rate':
        // User chose to rate - mark as reviewed, never show again
        const now = new Date().toISOString();
        await updateReviewPromptState({
          ...state,
          hasReviewed: true,
          reviewedAt: now,
          dismissed: true,
          // Clear any pending reminders since they've reviewed
          remindLaterDate: null,
          noThanksAfterCount: null,
        });
        logger.log(`Review prompt: User chose to rate at ${now}, will not show again`);
        break;

      case 'later':
        // User chose "Maybe Later" - only set remind date if they haven't already reviewed
        // If hasReviewed is true, this action should be ignored (safety check)
        if (state.hasReviewed) {
          logger.log('Review prompt: User already reviewed, ignoring "Maybe Later" action');
          return;
        }
        
        const remindDate = new Date();
        remindDate.setDate(remindDate.getDate() + REMIND_LATER_DAYS);
        await updateReviewPromptState({
          ...state,
          remindLaterDate: remindDate.toISOString(),
          dismissed: true,
          // Clear noThanksAfterCount since they're interested
          noThanksAfterCount: null,
          // Explicitly preserve hasReviewed (should be false here due to check above)
          hasReviewed: state.hasReviewed,
        });
        logger.log('Review prompt: User chose "Maybe Later", will remind in 7 days');
        break;

      case 'no-thanks':
        // User chose "No Thanks" - only record if they haven't already reviewed
        // If hasReviewed is true, this action should be ignored (safety check)
        if (state.hasReviewed) {
          logger.log('Review prompt: User already reviewed, ignoring "No Thanks" action');
          return;
        }
        
        await updateReviewPromptState({
          ...state,
          noThanksAfterCount: lifetimeCount,
          dismissed: true,
          // Clear remindLaterDate since they chose no thanks
          remindLaterDate: null,
          // Explicitly preserve hasReviewed (should be false here due to check above)
          hasReviewed: state.hasReviewed,
        });
        logger.log('Review prompt: User chose "No Thanks", will show after 50 more cards');
        break;
    }
  } catch (error) {
    logger.error('Error recording review action:', error);
  }
};

/**
 * Reset the review prompt state (for debugging/testing purposes)
 */
export const resetReviewPromptState = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(REVIEW_PROMPT_STATE_KEY);
    logger.log('Review prompt state reset');
  } catch (error) {
    logger.error('Error resetting review prompt state:', error);
  }
};

/**
 * Reset the lifetime flashcard count (for debugging/testing purposes)
 */
export const resetLifetimeCount = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LIFETIME_FLASHCARD_COUNT_KEY);
    logger.log('Lifetime flashcard count reset');
  } catch (error) {
    logger.error('Error resetting lifetime flashcard count:', error);
  }
};

/**
 * Get detailed review status for debugging
 */
export const getReviewStatus = async (): Promise<{
  hasReviewed: boolean;
  reviewedAt: string | null;
  lifetimeCount: number;
  state: ReviewPromptState;
}> => {
  const state = await getReviewPromptState();
  const lifetimeCount = await getLifetimeFlashcardCount();
  
  return {
    hasReviewed: state.hasReviewed,
    reviewedAt: state.reviewedAt || null,
    lifetimeCount,
    state,
  };
};

