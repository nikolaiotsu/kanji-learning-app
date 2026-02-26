import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { CustomerInfo } from 'react-native-purchases';
import {
  getCustomerInfo,
  hasEntitlement,
  purchaseByProductId,
  restorePurchases as revenueCatRestore,
  addCustomerInfoUpdateListener,
  ENTITLEMENT_ID,
  isRevenueCatConfigured,
} from '../services/revenueCatService';
import {
  setTestingSubscriptionOverride,
  clearTestingSubscriptionOverride,
} from '../services/receiptValidationService';
import { SubscriptionContextType, SubscriptionState, SubscriptionPlan, IAPProduct } from '../../types';
import { SUBSCRIPTION_PLANS } from '../constants/config';
import { useAuth } from './AuthContext';
import { getOfferings } from '../services/revenueCatService';
import { logger } from '../utils/logger';

const SUBSCRIPTION_STORAGE_KEY = 'user_subscription_data';
const isDevelopment = __DEV__ || Constants.appOwnership === 'expo';

function mapCustomerInfoToSubscriptionState(hasPremium: boolean): SubscriptionState {
  return {
    plan: hasPremium ? 'PREMIUM' : 'FREE',
    isActive: hasPremium,
  };
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isGuest } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionState>({
    plan: 'FREE',
    isActive: false,
  });
  const [isSubscriptionReady, setIsSubscriptionReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableProducts, setAvailableProducts] = useState<IAPProduct[]>([]);

  const applySubscriptionFromCustomerInfo = useCallback(
    (customerInfo: CustomerInfo | null) => {
      const hasPremium = hasEntitlement(customerInfo, ENTITLEMENT_ID);
      const newState = mapCustomerInfoToSubscriptionState(hasPremium);
      setSubscription(newState);
    },
    []
  );

  // When guest, always show FREE (no premium)
  useEffect(() => {
    if (isGuest) {
      setSubscription({ plan: 'FREE', isActive: false });
      setIsSubscriptionReady(true);
    }
  }, [isGuest]);

  // Load subscription from RevenueCat (or dev override)
  useEffect(() => {
    if (isGuest) return;

    let unsubscribe: (() => void) | null = null;

    const loadSubscription = async () => {
      try {
        // Development: check testing override first
        if (isDevelopment) {
          const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
          if (storedData) {
            const data: SubscriptionState = JSON.parse(storedData);
            if (data.plan === 'PREMIUM' && data.expiryDate && new Date(data.expiryDate) > new Date()) {
              setSubscription({
                ...data,
                expiryDate: new Date(data.expiryDate),
                purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
              });
              setIsSubscriptionReady(true);
              return;
            }
          }
        }

        if (!isRevenueCatConfigured()) {
          logger.log('[Subscription] RevenueCat not configured (Expo Go?), defaulting to FREE');
          setSubscription({ plan: 'FREE', isActive: false });
          setIsSubscriptionReady(true);
          return;
        }

        const customerInfo = await getCustomerInfo();
        applySubscriptionFromCustomerInfo(customerInfo);

        // Fetch offerings to populate availableProducts
        const offeringsData = await getOfferings();
        if (offeringsData?.current?.availablePackages) {
          const products: IAPProduct[] = offeringsData.current.availablePackages.map((pkg) => ({
            productId: pkg.product.identifier,
            price: String(pkg.product.price),
            localizedPrice: pkg.product.priceString,
            title: pkg.product.title,
            description: pkg.product.description ?? '',
            type: 'subscription',
          }));
          setAvailableProducts(products);
        }

        setIsSubscriptionReady(true);
      } catch (err) {
        logger.error('[Subscription] Error loading subscription:', err);
        setSubscription({ plan: 'FREE', isActive: false });
        setIsSubscriptionReady(true);
      }
    };

    loadSubscription();

    // Subscribe to customer info updates (purchase, restore, renewal)
    if (isRevenueCatConfigured()) {
      unsubscribe = addCustomerInfoUpdateListener((info) => {
        applySubscriptionFromCustomerInfo(info);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isGuest, applySubscriptionFromCustomerInfo]);

  const purchaseSubscription = async (productId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      if (isDevelopment) {
        logger.log('[Subscription] Dev mode: simulating premium purchase');
        const newState: SubscriptionState = {
          plan: 'PREMIUM',
          isActive: true,
          purchaseDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          receipt: 'dev_receipt_' + Date.now(),
        };
        setSubscription(newState);
        await AsyncStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(newState));
        return true;
      }

      if (!isRevenueCatConfigured()) {
        setError('Purchases not available');
        return false;
      }

      const result = await purchaseByProductId(productId);
      if (result.success && result.customerInfo) {
        applySubscriptionFromCustomerInfo(result.customerInfo);
        return true;
      }
      setError(result.error ?? 'Purchase failed');
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Subscription] Purchase failed:', err);
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      if (isDevelopment) {
        const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
        if (storedData) {
          const data: SubscriptionState = JSON.parse(storedData);
          if (data.plan === 'PREMIUM' && data.expiryDate && new Date(data.expiryDate) > new Date()) {
            setSubscription({
              ...data,
              expiryDate: new Date(data.expiryDate),
              purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            });
            return true;
          }
        }
        return false;
      }

      if (!isRevenueCatConfigured()) {
        setError('Purchases not available');
        return false;
      }

      const result = await revenueCatRestore();
      if (result.success && result.customerInfo) {
        applySubscriptionFromCustomerInfo(result.customerInfo);
        return true;
      }
      setError(result.error ?? 'Restore failed');
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Subscription] Restore failed:', err);
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const checkSubscriptionStatus = async (): Promise<void> => {
    if (isGuest) return;
    if (isDevelopment) {
      const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
      if (storedData) {
        const data: SubscriptionState = JSON.parse(storedData);
        if (data.expiryDate && new Date(data.expiryDate) <= new Date()) {
          setSubscription({ plan: 'FREE', isActive: false });
          await AsyncStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
        }
      }
      return;
    }
    if (!isRevenueCatConfigured()) return;
    const customerInfo = await getCustomerInfo();
    applySubscriptionFromCustomerInfo(customerInfo);
  };

  const setTestingSubscriptionPlan = async (plan: SubscriptionPlan) => {
    const expiryDate =
      plan === 'PREMIUM' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined;
    const testingState: SubscriptionState = {
      plan,
      isActive: plan === 'PREMIUM',
      purchaseDate: plan === 'PREMIUM' ? new Date() : undefined,
      expiryDate,
      receipt: plan === 'PREMIUM' ? 'testing_receipt_' + Date.now() : undefined,
    };
    setSubscription(testingState);
    await AsyncStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(testingState));
    if (plan === 'PREMIUM') {
      await setTestingSubscriptionOverride(plan, expiryDate);
    } else {
      await clearTestingSubscriptionOverride();
    }
    logger.log('[Subscription] Testing plan set to:', plan);
  };

  const getMaxOCRScans = (): number =>
    SUBSCRIPTION_PLANS[subscription.plan].ocrScansPerDay;
  const getMaxFlashcards = (): number => {
    const limit = SUBSCRIPTION_PLANS[subscription.plan].flashcardsPerDay;
    return limit === -1 ? Number.MAX_SAFE_INTEGER : limit;
  };
  const getMaxDecks = (): number => SUBSCRIPTION_PLANS[subscription.plan].maxDecks;
  const canShowAds = (): boolean => SUBSCRIPTION_PLANS[subscription.plan].showAds;
  const hasPremiumFeature = (feature: string): boolean =>
    SUBSCRIPTION_PLANS[subscription.plan].features.includes(feature);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isSubscriptionReady,
        isLoading,
        error,
        availableProducts,
        purchaseSubscription,
        restorePurchases,
        checkSubscriptionStatus,
        getMaxOCRScans,
        getMaxFlashcards,
        getMaxDecks,
        canShowAds,
        hasPremiumFeature,
        setTestingSubscriptionPlan,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
