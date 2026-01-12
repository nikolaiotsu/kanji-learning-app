/**
 * Leitner Spaced Repetition System Configuration
 * Defines box intervals and helper functions for calculating review dates
 */

import { Flashcard } from '../types/Flashcard';
import { logger } from '../utils/logger';

/**
 * Box interval mapping (days until next review)
 * Box 1 → 1 day (daily)
 * Box 2 → 2 days
 * Box 3 → 4 days
 * Box 4 → 7 days (weekly)
 * Box 5 → 14 days (bi-weekly)
 */
export const BOX_INTERVALS: Record<number, number> = {
  1: 1,   // 1 day (daily)
  2: 2,   // 2 days
  3: 4,   // 4 days
  4: 7,   // 7 days (weekly)
  5: 14,  // 14 days (bi-weekly)
};

/**
 * Calculate the next review date based on the box number
 * @param box The Leitner box number (1-5)
 * @returns Date object representing the next review date
 * @example
 * calculateNextReviewDate(2) // Returns today + 3 days
 */
export const calculateNextReviewDate = (box: number): Date => {
  // Default to box 1 (1 day) if invalid box number
  const days = BOX_INTERVALS[box] ?? 1;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

/**
 * Get the interval in days for a given box number
 * @param box The Leitner box number (1-5)
 * @returns Number of days until next review
 */
export const getBoxInterval = (box: number): number => {
  return BOX_INTERVALS[box] ?? 1;
};

/**
 * Check if a flashcard is due for review
 * @param card The flashcard to check
 * @returns True if the card is due for review (nextReviewDate <= today)
 */
export const isDueForReview = (card: Flashcard): boolean => {
  // Handle cards without nextReviewDate (backward compatibility)
  if (!card.nextReviewDate) {
    return true; // Show cards without review dates
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const reviewDate = new Date(card.nextReviewDate);
  reviewDate.setHours(0, 0, 0, 0);
  
  return reviewDate <= today;
};

/**
 * Filter flashcards to only those due for review today
 * Sorts by nextReviewDate ascending (oldest/most overdue first)
 * @param cards Array of flashcards to filter
 * @returns Filtered and sorted array of due cards
 */
export const filterDueCards = (cards: Flashcard[]): Flashcard[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dueCards: Flashcard[] = [];
  const notDueCards: Flashcard[] = [];
  
  for (const card of cards) {
    if (isDueForReview(card)) {
      dueCards.push(card);
    } else {
      notDueCards.push(card);
    }
  }
  
  // Log filtering results for debugging
  if (cards.length > 0) {
    logger.log(`🔍 [filterDueCards] Filtered ${cards.length} cards: ${dueCards.length} due, ${notDueCards.length} not due`);
    
    // Log sample of not-due cards for debugging
    if (notDueCards.length > 0 && notDueCards.length <= 5) {
      notDueCards.forEach(card => {
        const reviewDate = card.nextReviewDate ? new Date(card.nextReviewDate).toISOString().split('T')[0] : 'N/A';
        logger.log(`🔍 [filterDueCards] Not due - Card ID: ${card.id.substring(0, 8)}..., Box: ${card.box ?? 1}, Next review: ${reviewDate}, Today: ${today.toISOString().split('T')[0]}`);
      });
    }
  }
  
  return dueCards.sort((a, b) => {
    // Handle cards without dates (backward compatibility)
    if (!a.nextReviewDate) return -1;
    if (!b.nextReviewDate) return 1;
    
    return new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime();
  });
};

/**
 * Calculate the new box number when a card is answered correctly
 * @param currentBox The current box number (1-5)
 * @returns The new box number (max 5)
 */
export const getNewBoxOnCorrect = (currentBox: number): number => {
  return Math.min(currentBox + 1, 5);
};

/**
 * Calculate the new box number when a card is answered incorrectly
 * Lenient variant: drops to previous box (minimum Box 1)
 * @param currentBox The current box number (1-5)
 * @returns The new box number (previous box, minimum 1)
 */
export const getNewBoxOnIncorrect = (currentBox: number): number => {
  // Lenient variant: drop to previous box (minimum Box 1)
  return Math.max(currentBox - 1, 1);
};

