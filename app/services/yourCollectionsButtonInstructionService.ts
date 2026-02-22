import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const YOUR_COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY = '@your_collections_button_instructions_dont_show';

/**
 * Returns true if the user has checked "Don't show this again" when dismissing
 * the your collections button instruction modal. When true, the modal should never be shown.
 */
export async function getYourCollectionsButtonInstructionsDontShowAgain(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(YOUR_COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error getting your collections button instructions preference:', error);
    return false;
  }
}

/**
 * Persists the user's preference to not show the your collections button instruction modal again.
 */
export async function setYourCollectionsButtonInstructionsDontShowAgain(dontShow: boolean): Promise<void> {
  try {
    if (dontShow) {
      await AsyncStorage.setItem(YOUR_COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY, 'true');
      logger.log('Your collections button instructions: User opted to not show again');
    } else {
      await AsyncStorage.removeItem(YOUR_COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    }
  } catch (error) {
    logger.error('Error setting your collections button instructions preference:', error);
  }
}
