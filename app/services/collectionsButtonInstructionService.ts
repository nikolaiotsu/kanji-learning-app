import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY = '@collections_button_instructions_dont_show';

/**
 * Returns true if the user has checked "Don't show this again" when dismissing
 * the collections button instruction modal. When true, the modal should never be shown.
 */
export async function getCollectionsButtonInstructionsDontShowAgain(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error getting collections button instructions preference:', error);
    return false;
  }
}

/**
 * Persists the user's preference to not show the collections button instruction modal again.
 */
export async function setCollectionsButtonInstructionsDontShowAgain(dontShow: boolean): Promise<void> {
  try {
    if (dontShow) {
      await AsyncStorage.setItem(COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY, 'true');
      logger.log('Collections button instructions: User opted to not show again');
    } else {
      await AsyncStorage.removeItem(COLLECTIONS_BUTTON_INSTRUCTIONS_DONT_SHOW_KEY);
    }
  } catch (error) {
    logger.error('Error setting collections button instructions preference:', error);
  }
}
