import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const BADGES_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY = '@badges_button_instructions_dont_show';

/**
 * Returns true if the user has checked "Don't show again" when dismissing
 * the badges button instruction modal. When true, the modal should never be shown.
 */
export async function getBadgesButtonInstructionsDontShowAgain(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BADGES_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error getting badges button instructions preference:', error);
    return false;
  }
}

/**
 * Persists the user's preference to not show the badges button instruction modal again.
 */
export async function setBadgesButtonInstructionsDontShowAgain(dontShow: boolean): Promise<void> {
  try {
    if (dontShow) {
      await AsyncStorage.setItem(BADGES_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY, 'true');
      logger.log('Badges button instructions: User opted to not show again');
    } else {
      await AsyncStorage.removeItem(BADGES_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    }
  } catch (error) {
    logger.error('Error setting badges button instructions preference:', error);
  }
}
