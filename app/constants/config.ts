import { SubscriptionPlanConfig } from '../../types';

export const APP_CONFIG = {
  name: 'Kanji Learning App',
  version: '1.0.0',
  apiEndpoints: {
    visionApi: 'https://vision.googleapis.com/v1/images:annotate',
  },
};

// Subscription plan configurations
// API limits are UNIFIED - all API call types (translate, wordscope, OCR, etc.) count against the same limit
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
  FREE: {
    ocrScansPerDay: 30, // Legacy field - use apiCallsPerDay instead
    flashcardsPerDay: 5, // 5 flashcards per day for free users
    maxDecks: 3, // Free users can create up to 3 decks
    showAds: true,
    features: ['basic_scanning', 'flashcards', 'basic_ocr'],
    // Legacy separate limits (deprecated)
    translateApiCallsPerDay: 4,
    wordscopeApiCallsPerDay: 4,
    // Unified API limit: 4 API calls of any type per 24 hours
    apiCallsPerDay: 4
  },
  PREMIUM: {
    ocrScansPerDay: 300, // Legacy field - use apiCallsPerDay instead
    flashcardsPerDay: -1, // -1 represents unlimited flashcards for premium users
    maxDecks: 150, // Essentially unlimited decks for premium users
    showAds: false,
    features: [
      'basic_scanning', 
      'flashcards', 
      'basic_ocr', 
      'extended_ocr', 
      'unlimited_flashcards',
      'advanced_features',
      'ad_free_experience',
      'priority_support'
    ],
    // Legacy separate limits (deprecated)
    translateApiCallsPerDay: 1000,
    wordscopeApiCallsPerDay: 1000,
    // Unified API limits: 1000 per month (energy bar shows 10 bars × 100 calls); daily set high so monthly is the cap
    apiCallsPerDay: 1000,
    apiCallsPerMonth: 1000
  }
};

// Product IDs for App Store/Play Store - must match RevenueCat dashboard and App Store Connect
export const PRODUCT_IDS = {
  PREMIUM_WEEKLY: 'worddex_premium_weekly',
  PREMIUM_MONTHLY: 'worddex_premium_monthly',
  PREMIUM_YEARLY: 'worddex_premium_yearly',
};

// Product details for display in the app
export const PRODUCT_DETAILS = {
  [PRODUCT_IDS.PREMIUM_WEEKLY]: {
    displayName: 'Premium Weekly',
    duration: 'week',
    priceUSD: '$1.99',
    priceJPY: '¥298',
    savings: null,
  },
  [PRODUCT_IDS.PREMIUM_MONTHLY]: {
    displayName: 'Premium Monthly',
    duration: 'month',
    priceUSD: '$3.99',
    priceJPY: '¥598',
    savings: null,
  },
  [PRODUCT_IDS.PREMIUM_YEARLY]: {
    displayName: 'Premium Yearly',
    duration: 'year',
    priceUSD: '$39.99',
    priceJPY: '¥5,980',
    savings: '17% off',
  },
};

// Add this default export to satisfy Expo Router
export default { APP_CONFIG }; 