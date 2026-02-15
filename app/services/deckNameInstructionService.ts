import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const DECK_NAME_INSTRUCTIONS_DONT_SHOW_KEY = '@deck_name_instructions_dont_show';

/**
 * Returns true if the user has checked "Don't show again" when dismissing
 * the deck name instruction modal in Your Collections. When true, the modal should never be shown.
 */
export async function getDeckNameInstructionsDontShowAgain(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(DECK_NAME_INSTRUCTIONS_DONT_SHOW_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error getting deck name instructions preference:', error);
    return false;
  }
}

/**
 * Persists the user's preference to not show the deck name instruction modal again.
 */
export async function setDeckNameInstructionsDontShowAgain(dontShow: boolean): Promise<void> {
  try {
    if (dontShow) {
      await AsyncStorage.setItem(DECK_NAME_INSTRUCTIONS_DONT_SHOW_KEY, 'true');
      logger.log('Deck name instructions: User opted to not show again');
    } else {
      await AsyncStorage.removeItem(DECK_NAME_INSTRUCTIONS_DONT_SHOW_KEY);
    }
  } catch (error) {
    logger.error('Error setting deck name instructions preference:', error);
  }
}
