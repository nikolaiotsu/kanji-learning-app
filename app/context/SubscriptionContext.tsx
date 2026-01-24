import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as InAppPurchases from 'expo-in-app-purchases';
import Constants from 'expo-constants';
import { SubscriptionContextType, SubscriptionState, SubscriptionPlan, IAPProduct, IAPPurchaseResult } from '../../types';
import { SUBSCRIPTION_PLANS, PRODUCT_IDS } from '../constants/config';
import { 
  validateReceipt, 
  fetchSubscriptionStatus, 
  isSubscriptionValid,
  getSubscriptionPlan,
  setTestingSubscriptionOverride,
  clearTestingSubscriptionOverride
} from '../services/receiptValidationService';

import { logger } from '../utils/logger';
// Storage key for subscription data
const SUBSCRIPTION_STORAGE_KEY = 'user_subscription_data';

// Determine if we're in development mode
const isDevelopment = __DEV__ || Constants.appOwnership === 'expo';

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<SubscriptionState>({
    plan: 'FREE',
    isActive: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableProducts, setAvailableProducts] = useState<IAPProduct[]>([]);
  
  // Initialize IAP and subscription data
  useEffect(() => {
    initializeIAP();
    loadSubscriptionData();
    
    return () => {
      // Cleanup: disconnect IAP when component unmounts
      if (!isDevelopment) {
        InAppPurchases.disconnectAsync().catch((err) => 
          logger.error('Error disconnecting IAP:', err)
        );
      }
    };
  }, []);
  
  // Initialize In-App Purchases
  const initializeIAP = async () => {
    if (isDevelopment) {
      logger.log('Development mode: Skipping real IAP initialization');
      return;
    }
    
    try {
      logger.log('Initializing In-App Purchases...');
      await InAppPurchases.connectAsync();
      logger.log('IAP connected successfully');
      
      // Set up purchase listener
      InAppPurchases.setPurchaseListener(handlePurchaseUpdate);
      
      // Fetch available products
      await fetchProducts();
    } catch (error) {
      logger.error('Failed to initialize IAP:', error);
      setError('Failed to connect to the App Store');
    }
  };
  
  // Fetch products from the App Store
  const fetchProducts = async () => {
    try {
      const productIds = [PRODUCT_IDS.PREMIUM_MONTHLY, PRODUCT_IDS.PREMIUM_YEARLY];
      logger.log('Fetching products:', productIds);
      
      const { responseCode, results } = await InAppPurchases.getProductsAsync(productIds);
      
      if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {
        const products: IAPProduct[] = results.map((product: any) => ({
          productId: product.productId,
          price: product.price,
          localizedPrice: product.localizedPrice || product.price,
          title: product.title,
          description: product.description,
          type: product.type || 'subscription',
        }));
        
        setAvailableProducts(products);
        logger.log('Products fetched successfully:', products);
      } else {
        logger.error('Failed to fetch products, response code:', responseCode);
      }
    } catch (error) {
      logger.error('Error fetching products:', error);
    }
  };
  
  // Handle purchase updates from the App Store
  const handlePurchaseUpdate = (result: IAPPurchaseResult) => {
    const { responseCode, results, errorCode } = result;
    
    logger.log('Purchase update received:', { responseCode, errorCode });
    
    if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {
      results.forEach(async (purchase) => {
        if (!purchase.acknowledged) {
          logger.log('Processing new purchase:', purchase.productId);
          
          // Validate receipt with server
          if (purchase.transactionReceipt) {
            logger.log('Validating receipt with server...');
            const validationResult = await validateReceipt(
              purchase.transactionReceipt,
              purchase.productId
            );
            
            if (validationResult.success && validationResult.subscription) {
              const serverSub = validationResult.subscription;
              
              // Update local subscription state with server-validated data
              const newSubscription: SubscriptionState = {
                plan: 'PREMIUM',
                isActive: serverSub.isActive,
                purchaseDate: new Date(serverSub.purchaseDate),
                expiryDate: new Date(serverSub.expiresDate),
                receipt: purchase.transactionReceipt,
              };
              
              await saveSubscriptionData(newSubscription);
              setSubscription(newSubscription);
              logger.log('Receipt validated and subscription updated');
            } else {
              logger.error('Receipt validation failed:', validationResult.error);
              setError(`Validation failed: ${validationResult.error}`);
              
              // Still grant temporary access while we investigate
              const tempSubscription: SubscriptionState = {
                plan: 'PREMIUM',
                isActive: true,
                purchaseDate: new Date(purchase.purchaseTime),
                expiryDate: new Date(purchase.purchaseTime + 30 * 24 * 60 * 60 * 1000),
                receipt: purchase.transactionReceipt,
              };
              
              await saveSubscriptionData(tempSubscription);
              setSubscription(tempSubscription);
            }
          } else {
            logger.error('No transaction receipt available');
          }
          
          // Acknowledge the purchase (important!)
          await InAppPurchases.finishTransactionAsync(purchase, true);
          logger.log('Purchase acknowledged successfully');
        }
      });
    } else if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
      logger.log('User canceled the purchase');
      setError('Purchase was canceled');
    } else if (errorCode) {
      logger.error('Purchase error:', errorCode);
      setError(`Purchase failed: ${errorCode}`);
    }
  };

  const loadSubscriptionData = async () => {
    try {
      // In production, load from server
      if (!isDevelopment) {
        logger.log('Loading subscription from server...');
        const dbSubscription = await fetchSubscriptionStatus();
        
        if (dbSubscription && isSubscriptionValid(dbSubscription)) {
          const subscriptionState: SubscriptionState = {
            plan: 'PREMIUM',
            isActive: true,
            purchaseDate: new Date(dbSubscription.purchase_date),
            expiryDate: new Date(dbSubscription.expires_date),
            receipt: dbSubscription.receipt_data,
          };
          
          setSubscription(subscriptionState);
          await saveSubscriptionData(subscriptionState);
          logger.log('Loaded active subscription from server');
          return;
        } else {
          logger.log('No active subscription found on server');
          await resetToFreeSubscription();
          return;
        }
      }
      
      // Development mode: load from local storage
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
      logger.error('Error loading subscription data:', error);
      await resetToFreeSubscription();
    }
  };

  const purchaseSubscription = async (productId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Development mode: Simulate purchase
      if (isDevelopment) {
        logger.log('Development mode: Simulating premium purchase');
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
      }
      
      // Production mode: Real IAP purchase
      logger.log('Initiating real IAP purchase for:', productId);
      
      // Purchase the item
      await InAppPurchases.purchaseItemAsync(productId);
      
      // The purchase result will be handled by the purchase listener
      // Return true to indicate the purchase was initiated successfully
      return true;
      
    } catch (error: any) {
      logger.error('Purchase failed:', error);
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
      
      // Development mode: Check local storage
      if (isDevelopment) {
        logger.log('Development mode: Checking for stored premium subscription');
        const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
        if (storedData) {
          const data: SubscriptionState = JSON.parse(storedData);
          if (data.plan === 'PREMIUM' && data.expiryDate && new Date(data.expiryDate) > new Date()) {
            logger.log('Restored premium subscription from storage');
            setSubscription({
              ...data,
              expiryDate: new Date(data.expiryDate),
              purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            });
            return true;
          }
        }
        
        logger.log('No premium subscription found to restore');
        return false;
      }
      
      // Production mode: Restore from App Store
      logger.log('Restoring purchases from App Store...');
      
      const { responseCode, results } = await InAppPurchases.getPurchaseHistoryAsync();
      
      if (responseCode === InAppPurchases.IAPResponseCode.OK && results && results.length > 0) {
        logger.log('Found purchase history:', results);
        
        // Find the most recent premium subscription
        const premiumPurchase = results.find(
          (purchase: any) => 
            purchase.productId === PRODUCT_IDS.PREMIUM_MONTHLY || 
            purchase.productId === PRODUCT_IDS.PREMIUM_YEARLY
        );
        
        if (premiumPurchase) {
          // Calculate expiry based on product type
          const duration = premiumPurchase.productId === PRODUCT_IDS.PREMIUM_YEARLY 
            ? 365 * 24 * 60 * 60 * 1000 // 1 year
            : 30 * 24 * 60 * 60 * 1000; // 30 days
          
          const expiryDate = new Date((premiumPurchase as any).purchaseTime + duration);
          
          // Check if subscription is still valid
          if (expiryDate > new Date()) {
            const restoredSubscription: SubscriptionState = {
              plan: 'PREMIUM',
              isActive: true,
              purchaseDate: new Date((premiumPurchase as any).purchaseTime),
              expiryDate: expiryDate,
              receipt: (premiumPurchase as any).transactionReceipt,
            };
            
            await saveSubscriptionData(restoredSubscription);
            setSubscription(restoredSubscription);
            logger.log('Successfully restored premium subscription');
            return true;
          } else {
            logger.log('Found premium purchase but it has expired');
          }
        }
      }
      
      logger.log('No premium subscription found to restore');
      return false;
      
    } catch (error) {
      logger.error('Failed to restore purchases:', error);
      setError('Failed to restore purchases');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const checkSubscriptionStatus = async (): Promise<void> => {
    // In production, re-validate with server
    if (!isDevelopment) {
      logger.log('Checking subscription status with server...');
      const dbSubscription = await fetchSubscriptionStatus();
      
      if (dbSubscription && isSubscriptionValid(dbSubscription)) {
        const subscriptionState: SubscriptionState = {
          plan: 'PREMIUM',
          isActive: true,
          purchaseDate: new Date(dbSubscription.purchase_date),
          expiryDate: new Date(dbSubscription.expires_date),
          receipt: dbSubscription.receipt_data,
        };
        
        setSubscription(subscriptionState);
        await saveSubscriptionData(subscriptionState);
      } else {
        logger.log('Subscription no longer valid, resetting to free');
        await resetToFreeSubscription();
      }
      return;
    }
    
    // Development mode: check local expiry date
    if (subscription.expiryDate && new Date(subscription.expiryDate) <= new Date()) {
      await resetToFreeSubscription();
    }
  };

  const saveSubscriptionData = async (subscriptionData: SubscriptionState) => {
    try {
      await AsyncStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscriptionData));
    } catch (error) {
      logger.error('Error saving subscription data:', error);
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

  // Testing function to manually switch subscription plans
  // This works in both development AND preview/TestFlight builds
  const setTestingSubscriptionPlan = async (plan: SubscriptionPlan) => {
    const expiryDate = plan === 'PREMIUM' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined; // 30 days from now
    
    const testingSubscription: SubscriptionState = {
      plan: plan,
      isActive: plan === 'PREMIUM',
      purchaseDate: plan === 'PREMIUM' ? new Date() : undefined,
      expiryDate: expiryDate,
      receipt: plan === 'PREMIUM' ? 'testing_receipt_' + Date.now() : undefined,
    };
    
    // Update local context state
    setSubscription(testingSubscription);
    await saveSubscriptionData(testingSubscription);
    
    // IMPORTANT: Also set the testing override for preview/production builds
    // This ensures getCurrentSubscriptionPlan() returns the correct plan even in builds where __DEV__ is false
    if (plan === 'PREMIUM') {
      await setTestingSubscriptionOverride(plan, expiryDate);
    } else {
      // When switching to FREE, clear the testing override
      await clearTestingSubscriptionOverride();
    }
    
    logger.log('Testing subscription plan set to:', plan);
  };

  // Helper functions
  const getMaxOCRScans = (): number => {
    return SUBSCRIPTION_PLANS[subscription.plan].ocrScansPerDay;
  };

  const getMaxFlashcards = (): number => {
    const limit = SUBSCRIPTION_PLANS[subscription.plan].flashcardsPerDay;
    // -1 represents unlimited for premium users
    return limit === -1 ? Number.MAX_SAFE_INTEGER : limit;
  };

  const getMaxDecks = (): number => {
    return SUBSCRIPTION_PLANS[subscription.plan].maxDecks;
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

// Custom hook to use the subscription context
export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}; 