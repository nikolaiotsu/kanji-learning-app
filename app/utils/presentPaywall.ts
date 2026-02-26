/**
 * RevenueCat Paywall presentation helpers.
 * Handles presentPaywallIfNeeded with proper error handling and Expo Go fallback.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { ENTITLEMENT_ID } from '../services/revenueCatService';
import { logger } from './logger';

const isRevenueCatUIAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export interface PresentPaywallResult {
  purchased: boolean;
  /** True if paywall was never shown (user already had entitlement) */
  notPresented: boolean;
}

/**
 * Present RevenueCat Paywall if the user does not have the required entitlement.
 * Returns whether the user completed a purchase/restore.
 * No-ops in Expo Go (returns purchased: false, notPresented: true).
 */
export async function presentPaywallIfNeeded(
  requiredEntitlementIdentifier: string = ENTITLEMENT_ID
): Promise<PresentPaywallResult> {
  if (!isRevenueCatUIAvailable) {
    logger.log('[PresentPaywall] RevenueCat UI not available (Expo Go)');
    return { purchased: false, notPresented: true };
  }
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier,
      displayCloseButton: true,
    });
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
        return { purchased: true, notPresented: false };
      case PAYWALL_RESULT.NOT_PRESENTED:
        return { purchased: false, notPresented: true };
      case PAYWALL_RESULT.CANCELLED:
      case PAYWALL_RESULT.ERROR:
      default:
        return { purchased: false, notPresented: false };
    }
  } catch (error) {
    logger.error('[PresentPaywall] presentPaywallIfNeeded error:', error);
    return { purchased: false, notPresented: false };
  }
}

/**
 * Present RevenueCat Paywall unconditionally (e.g. from Settings "Upgrade").
 */
export async function presentPaywall(): Promise<PresentPaywallResult> {
  if (!isRevenueCatUIAvailable) {
    logger.log('[PresentPaywall] RevenueCat UI not available (Expo Go)');
    return { purchased: false, notPresented: true };
  }
  try {
    const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
        return { purchased: true, notPresented: false };
      case PAYWALL_RESULT.NOT_PRESENTED:
        return { purchased: false, notPresented: true };
      case PAYWALL_RESULT.CANCELLED:
      case PAYWALL_RESULT.ERROR:
      default:
        return { purchased: false, notPresented: false };
    }
  } catch (error) {
    logger.error('[PresentPaywall] presentPaywall error:', error);
    return { purchased: false, notPresented: false };
  }
}
