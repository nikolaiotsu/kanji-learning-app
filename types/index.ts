export interface CapturedImage {
  uri: string;
  width: number;
  height: number;
}

export interface TextAnnotation {
  description: string;
  // other fields if needed
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionApiResponse {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

// Subscription types
export type SubscriptionPlan = 'FREE' | 'PREMIUM';

export interface SubscriptionPlanConfig {
  ocrScansPerDay: number;
  flashcardsPerDay: number;
  showAds: boolean;
  features: string[];
  price?: string;
  productId?: string;
}

export interface SubscriptionState {
  plan: SubscriptionPlan;
  isActive: boolean;
  expiryDate?: Date;
  purchaseDate?: Date;
  receipt?: string;
}

export interface SubscriptionContextType {
  subscription: SubscriptionState;
  isLoading: boolean;
  error: string | null;
  purchaseSubscription: (productId: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  checkSubscriptionStatus: () => Promise<void>;
  getMaxOCRScans: () => number;
  getMaxFlashcards: () => number;
  canShowAds: () => boolean;
  hasPremiumFeature: (feature: string) => boolean;
  setTestingSubscriptionPlan: (plan: SubscriptionPlan) => Promise<void>;
} 