import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const CUSTOM_CARD_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY = '@custom_card_button_instructions_dont_show';

/**
 * Returns true if the user has checked "Don't show this again" when dismissing
 * the custom card button instruction modal. When true, the modal should never be shown.
 */
export async function getCustomCardButtonInstructionsDontShowAgain(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(CUSTOM_CARD_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error getting custom card button instructions preference:', error);
    return false;
  }
}

/**
 * Persists the user's preference to not show the custom card button instruction modal again.
 */
export async function setCustomCardButtonInstructionsDontShowAgain(dontShow: boolean): Promise<void> {
  try {
    if (dontShow) {
      await AsyncStorage.setItem(CUSTOM_CARD_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY, 'true');
      logger.log('Custom card button instructions: User opted to not show again');
    } else {
      await AsyncStorage.removeItem(CUSTOM_CARD_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    }
  } catch (error) {
    logger.error('Error setting custom card button instructions preference:', error);
  }
}
