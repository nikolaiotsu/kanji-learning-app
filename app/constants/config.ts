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
    showAds: true,
    features: ['basic_scanning', 'flashcards', 'basic_ocr']
  },
  PREMIUM: {
    ocrScansPerDay: 3000, // 3000 OCR scans per day for premium users
    flashcardsPerDay: 999999, // Essentially unlimited flashcards for premium users
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
    price: '$4.99/month',
    productId: 'kanji_premium_monthly' // This should match your App Store product ID
  }
};

// Product IDs for App Store/Play Store
export const PRODUCT_IDS = {
  PREMIUM_MONTHLY: 'kanji_premium_monthly',
  PREMIUM_YEARLY: 'kanji_premium_yearly', // Optional: add yearly plan later
};

// Add this default export to satisfy Expo Router
export default { APP_CONFIG }; 