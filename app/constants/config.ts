import { SubscriptionPlanConfig } from '../../types';

export const APP_CONFIG = {
  name: 'Kanji Learning App',
  version: '1.0.0',
  apiEndpoints: {
    visionApi: 'https://vision.googleapis.com/v1/images:annotate',
  },
};

// Subscription plan configurations
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
  FREE: {
    ocrScansPerDay: 500, // High limit for abuse protection, hidden from users
    flashcardsPerDay: 3, // New limit: 3 flashcards per 24 hours
    maxDecks: 2, // Free users can create up to 2 decks
    showAds: true,
    features: ['basic_scanning', 'flashcards', 'basic_ocr']
  },
  PREMIUM: {
    ocrScansPerDay: 3000, // 3000 OCR scans per day for premium users
    flashcardsPerDay: 999999, // Essentially unlimited flashcards for premium users
    maxDecks: 999999, // Essentially unlimited decks for premium users
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
    ]
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