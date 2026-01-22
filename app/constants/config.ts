import { SubscriptionPlanConfig } from '../../types';

export const APP_CONFIG = {
  name: 'Kanji Learning App',
  version: '1.0.0',
  apiEndpoints: {
    visionApi: 'https://vision.googleapis.com/v1/images:annotate',
  },
};

// Subscription plan configurations
// API limits:
// - Unified limit (apiCallsPerDay/apiCallsPerMonth): Only applies to translate and wordscope API calls
// - OCR/Vision limit (ocrScansPerDay): Separate limit for OCR scans and vision API calls
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
  FREE: {
    ocrScansPerDay: 200, // Separate limit for OCR scans and vision API calls
    flashcardsPerDay: 200, // 200 flashcards per day for free users
    maxDecks: 2, // Free users can create up to 2 decks
    showAds: true,
    features: ['basic_scanning', 'flashcards', 'basic_ocr'],
    // Legacy separate limits (deprecated - kept for backward compatibility)
    translateApiCallsPerDay: 5,
    wordscopeApiCallsPerDay: 5,
    // Unified API limit: 5 API calls per 24 hours (translate + wordscope only, NOT OCR/vision)
    apiCallsPerDay: 5
  },
  PREMIUM: {
    ocrScansPerDay: 5000, // Separate limit for OCR scans and vision API calls (essentially unlimited)
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
    // Legacy separate limits (deprecated - kept for backward compatibility)
    translateApiCallsPerDay: 120,
    wordscopeApiCallsPerDay: 120,
    // Unified API limits: 120 API calls per day, 1200 per month (translate + wordscope only, NOT OCR/vision)
    apiCallsPerDay: 120,
    apiCallsPerMonth: 1200
  }
};

// Product IDs for App Store/Play Store - must match App Store Connect exactly
export const PRODUCT_IDS = {
  PREMIUM_MONTHLY: 'worddex_premium_monthly',
  PREMIUM_YEARLY: 'worddex_premium_yearly',
};

// Product details for display in the app
export const PRODUCT_DETAILS = {
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