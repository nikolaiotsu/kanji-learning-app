import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const REVIEW_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY = '@review_button_instructions_dont_show';

/**
 * Returns true if the user has checked "Don't show this again" when dismissing
 * the review button instruction modal. When true, the modal should never be shown.
 */
export async function getReviewButtonInstructionsDontShowAgain(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(REVIEW_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error getting review button instructions preference:', error);
    return false;
  }
}

/**
 * Persists the user's preference to not show the review button instruction modal again.
 */
export async function setReviewButtonInstructionsDontShowAgain(dontShow: boolean): Promise<void> {
  try {
    if (dontShow) {
      await AsyncStorage.setItem(REVIEW_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY, 'true');
      logger.log('Review button instructions: User opted to not show again');
    } else {
      await AsyncStorage.removeItem(REVIEW_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    }
  } catch (error) {
    logger.error('Error setting review button instructions preference:', error);
  }
}
