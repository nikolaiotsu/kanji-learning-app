import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const HIGHLIGHT_LONG_PRESS_TOOLTIP_DONT_SHOW_KEY = '@highlight_long_press_tooltip_dont_show';

/**
 * Returns true if the user has checked "Don't show again" when dismissing
 * the highlight button long-press tooltip. When true, the info icon should be hidden.
 */
export async function getHighlightButtonLongPressTooltipDontShowAgain(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(HIGHLIGHT_LONG_PRESS_TOOLTIP_DONT_SHOW_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error getting highlight long-press tooltip preference:', error);
    return false;
  }
}

/**
 * Persists the user's preference to not show the highlight button info icon again.
 */
export async function setHighlightButtonLongPressTooltipDontShowAgain(dontShow: boolean): Promise<void> {
  try {
    if (dontShow) {
      await AsyncStorage.setItem(HIGHLIGHT_LONG_PRESS_TOOLTIP_DONT_SHOW_KEY, 'true');
      logger.log('Highlight long-press tooltip: User opted to not show again');
    } else {
      await AsyncStorage.removeItem(HIGHLIGHT_LONG_PRESS_TOOLTIP_DONT_SHOW_KEY);
    }
  } catch (error) {
    logger.error('Error setting highlight long-press tooltip preference:', error);
  }
}
