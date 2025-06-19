import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SubscriptionContextType, SubscriptionState, SubscriptionPlan } from '../../types';
import { SUBSCRIPTION_PLANS, PRODUCT_IDS } from '../constants/config';

// Storage key for subscription data
const SUBSCRIPTION_STORAGE_KEY = 'user_subscription_data';

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<SubscriptionState>({
    plan: 'FREE',
    isActive: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false); // Start with false to avoid blocking
  const [error, setError] = useState<string | null>(null);
  
  // Initialize subscription data without IAP for now
  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    try {
      const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
      if (storedData) {
        const data: SubscriptionState = JSON.parse(storedData);
        
        // Check if subscription is still valid
        if (data.expiryDate && new Date(data.expiryDate) > new Date()) {
          setSubscription({
            ...data,
            expiryDate: new Date(data.expiryDate),
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
          });
        } else {
          // Subscription expired, reset to free
          await resetToFreeSubscription();
        }
      }
    } catch (error) {
      console.error('Error loading subscription data:', error);
      await resetToFreeSubscription();
    }
  };

  const purchaseSubscription = async (productId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // In development mode, simulate a successful purchase for testing
      console.log('Development/Expo Go mode: Simulating premium purchase');
      const newSubscription: SubscriptionState = {
        plan: 'PREMIUM',
        isActive: true,
        purchaseDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        receipt: 'dev_receipt_' + Date.now(),
      };
      
      await saveSubscriptionData(newSubscription);
      setSubscription(newSubscription);
      return true;
      
    } catch (error: any) {
      console.error('Purchase failed:', error);
      setError(`Purchase failed: ${error.message || 'Unknown error'}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Check if we have any stored premium subscription
      console.log('Development/Expo Go mode: Checking for stored premium subscription');
      const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
      if (storedData) {
        const data: SubscriptionState = JSON.parse(storedData);
        if (data.plan === 'PREMIUM' && data.expiryDate && new Date(data.expiryDate) > new Date()) {
          console.log('Restored premium subscription from storage');
          setSubscription({
            ...data,
            expiryDate: new Date(data.expiryDate),
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
          });
          return true;
        }
      }
      
      console.log('No premium subscription found to restore');
      return false;
      
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      setError('Failed to restore purchases');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const checkSubscriptionStatus = async (): Promise<void> => {
    // Check the expiry date
    if (subscription.expiryDate && new Date(subscription.expiryDate) <= new Date()) {
      await resetToFreeSubscription();
    }
  };

  const saveSubscriptionData = async (subscriptionData: SubscriptionState) => {
    try {
      await AsyncStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscriptionData));
    } catch (error) {
      console.error('Error saving subscription data:', error);
    }
  };

  const resetToFreeSubscription = async () => {
    const freeSubscription: SubscriptionState = {
      plan: 'FREE',
      isActive: false,
    };
    
    setSubscription(freeSubscription);
    await saveSubscriptionData(freeSubscription);
  };

  // Helper functions
  const getMaxOCRScans = (): number => {
    return SUBSCRIPTION_PLANS[subscription.plan].ocrScansPerDay;
  };

  const canShowAds = (): boolean => {
    return SUBSCRIPTION_PLANS[subscription.plan].showAds;
  };

  const hasPremiumFeature = (feature: string): boolean => {
    return SUBSCRIPTION_PLANS[subscription.plan].features.includes(feature);
  };

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isLoading,
        error,
        purchaseSubscription,
        restorePurchases,
        checkSubscriptionStatus,
        getMaxOCRScans,
        canShowAds,
        hasPremiumFeature,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

// Custom hook to use the subscription context
export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}; 