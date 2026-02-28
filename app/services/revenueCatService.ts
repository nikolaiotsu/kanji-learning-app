/**
 * RevenueCat SDK service for subscription and purchase management.
 * Handles configuration, entitlement checking, purchases, and restore.
 * Gracefully no-ops in Expo Go (StoreClient) where native IAP is unavailable.
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { logger } from '../utils/logger';

/** Entitlement identifier for WordDex Premium - must match RevenueCat Dashboard */
export const ENTITLEMENT_ID = 'WordDex_Premium';

/** Whether RevenueCat native module is available (false in Expo Go) */
const isRevenueCatAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let isConfigured = false;

/**
 * Get the RevenueCat API key for the current platform.
 * Supports shared key or platform-specific keys from env.
 */
function getApiKey(): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  const sharedKey = extra?.EXPO_PUBLIC_REVENUECAT_API_KEY;
  if (sharedKey) return sharedKey;
  const iosKey = extra?.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
  const androidKey = extra?.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  if (Platform.OS === 'ios' && iosKey) return iosKey;
  if (Platform.OS === 'android' && androidKey) return androidKey;
  return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? null;
}

/**
 * Configure the RevenueCat SDK. Call once at app startup.
 * No-ops in Expo Go or when API key is missing.
 * @param appUserID - Optional. Use Supabase user.id for signed-in users; omit for anonymous.
 */
export async function configurePurchases(appUserID?: string | null): Promise<void> {
  if (!isRevenueCatAvailable) {
    logger.log('[RevenueCat] Skipping configure - Expo Go / StoreClient');
    return;
  }
  if (isConfigured) {
    logger.log('[RevenueCat] Already configured, skipping');
    return;
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('[RevenueCat] No API key found, skipping configure');
    return;
  }
  try {
    Purchases.configure({
      apiKey,
      appUserID: appUserID ?? undefined,
    });
    isConfigured = true;
    logger.log('[RevenueCat] Configured successfully', { hasAppUserID: !!appUserID });
  } catch (error) {
    logger.error('[RevenueCat] Configure failed:', error);
    throw error;
  }
}

/**
 * Log in the current user to RevenueCat (e.g. after Supabase sign-in).
 * Links purchases to this user across devices.
 */
export async function logInRevenueCat(appUserID: string): Promise<CustomerInfo | null> {
  if (!isRevenueCatAvailable) return null;
  if (!isConfigured) {
    logger.warn('[RevenueCat] Cannot logIn - not configured');
    return null;
  }
  try {
    const result = await Purchases.logIn(appUserID);
    logger.log('[RevenueCat] Logged in successfully', { created: result.created });
    return result.customerInfo;
  } catch (error) {
    logger.error('[RevenueCat] LogIn failed:', error);
    return null;
  }
}

/**
 * Log out from RevenueCat (e.g. on sign-out). Resets to anonymous user.
 * No-ops gracefully when current user is already anonymous (e.g. guest mode).
 */
export async function logOutRevenueCat(): Promise<CustomerInfo | null> {
  if (!isRevenueCatAvailable) return null;
  if (!isConfigured) return null;
  try {
    const customerInfo = await Purchases.logOut();
    logger.log('[RevenueCat] Logged out successfully');
    return customerInfo;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Expected when user was never logged in (guest mode) - RevenueCat is already anonymous
    if (message.includes('anonymous')) {
      logger.log('[RevenueCat] Skipping logOut - user already anonymous');
      return null;
    }
    logger.error('[RevenueCat] LogOut failed:', error);
    return null;
  }
}

/**
 * Check if RevenueCat is configured and available.
 */
export function isRevenueCatConfigured(): boolean {
  return isRevenueCatAvailable && isConfigured;
}

/**
 * Get the latest customer info from RevenueCat.
 * Returns null in Expo Go, on error, or when not configured.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isRevenueCatAvailable || !isConfigured) return null;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    logger.error('[RevenueCat] getCustomerInfo failed:', error);
    return null;
  }
}

/**
 * Check if the user has an active entitlement.
 * @param identifier - Entitlement identifier (default: WordDex Premium)
 */
export function hasEntitlement(
  customerInfo: CustomerInfo | null,
  identifier: string = ENTITLEMENT_ID
): boolean {
  if (!customerInfo) return false;
  const entitlement = customerInfo.entitlements.active[identifier];
  return entitlement != null && entitlement.isActive === true;
}

/**
 * Convenience: check entitlement from current customer info.
 */
export async function checkEntitlement(
  identifier: string = ENTITLEMENT_ID
): Promise<boolean> {
  const customerInfo = await getCustomerInfo();
  return hasEntitlement(customerInfo, identifier);
}

/**
 * Get the current offerings (products/packages) from RevenueCat.
 */
export async function getOfferings(): Promise<{
  current: PurchasesOffering | null;
  all: Record<string, PurchasesOffering>;
} | null> {
  if (!isRevenueCatAvailable || !isConfigured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return {
      current: offerings.current,
      all: offerings.all,
    };
  } catch (error) {
    logger.error('[RevenueCat] getOfferings failed:', error);
    return null;
  }
}

/**
 * Find a package by product identifier (e.g. worddex_premium_monthly).
 */
export function findPackageByProductId(
  offering: PurchasesOffering | null,
  productId: string
): PurchasesPackage | null {
  if (!offering) return null;
  const pkg = offering.availablePackages.find(
    (p) => p.product.identifier === productId
  );
  return pkg ?? null;
}

/**
 * Purchase a package. Use getOfferings + findPackageByProductId to get the package.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
  if (!isRevenueCatAvailable || !isConfigured) {
    return { success: false, error: 'Purchases not available' };
  }
  try {
    const result = await Purchases.purchasePackage(pkg);
    return {
      success: true,
      customerInfo: result.customerInfo,
    };
  } catch (error: unknown) {
    const err = error as { userCancelled?: boolean; code?: string; message?: string };
    if (err?.userCancelled) {
      return { success: false, error: 'Purchase was cancelled' };
    }
    const code = err?.code ?? '';
    const message = err?.message ?? String(error);
    logger.error('[RevenueCat] purchasePackage failed:', { code, message });
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { success: false, error: 'Purchase was cancelled' };
    }
    return { success: false, error: message || 'Purchase failed' };
  }
}

/**
 * Purchase by product ID. Fetches offerings and finds the matching package.
 */
export async function purchaseByProductId(
  productId: string
): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
  const offeringsData = await getOfferings();
  const pkg = findPackageByProductId(offeringsData?.current ?? null, productId);
  if (!pkg) {
    return { success: false, error: `Product ${productId} not found in offerings` };
  }
  return purchasePackage(pkg);
}

/**
 * Restore previous purchases.
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}> {
  if (!isRevenueCatAvailable || !isConfigured) {
    return { success: false, error: 'Purchases not available' };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { success: true, customerInfo };
  } catch (error: unknown) {
    const err = error as { message?: string };
    const message = err?.message ?? String(error);
    logger.error('[RevenueCat] restorePurchases failed:', message);
    return { success: false, error: message || 'Restore failed' };
  }
}

/**
 * Add a listener for customer info updates (e.g. after purchase/restore).
 * Returns an unsubscribe function.
 */
export function addCustomerInfoUpdateListener(
  listener: (customerInfo: CustomerInfo) => void
): () => void {
  if (!isRevenueCatAvailable || !isConfigured) return () => {};
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(listener);
    } catch {
      // ignore
    }
  };
}
