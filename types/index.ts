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
  maxDecks: number;
  showAds: boolean;
  features: string[];
  price?: string;
  productId?: string;
  translateApiCallsPerDay?: number; // Limit for translate API calls
  wordscopeApiCallsPerDay?: number; // Limit for wordscope API calls
}

export interface SubscriptionState {
  plan: SubscriptionPlan;
  isActive: boolean;
  expiryDate?: Date;
  purchaseDate?: Date;
  receipt?: string;
}

export interface IAPProduct {
  productId: string;
  price: string;
  localizedPrice: string;
  title: string;
  description: string;
  type: 'subscription' | 'consumable' | 'non-consumable';
}

export interface IAPPurchaseResult {
  responseCode: number;
  results?: Array<{
    productId: string;
    transactionReceipt?: string;
    acknowledged: boolean;
    purchaseTime: number;
    orderId?: string;
  }>;
  errorCode?: string;
}

export interface DBSubscription {
  id: string;
  user_id: string;
  product_id: string;
  original_transaction_id: string;
  purchase_date: string;
  expires_date: string;
  is_active: boolean;
  is_trial: boolean;
  auto_renew_status: boolean;
  receipt_data?: string;
  environment: 'sandbox' | 'production';
  last_validated_at: string;
  created_at: string;
  updated_at: string;
}

export interface ValidateReceiptResponse {
  success: boolean;
  subscription?: {
    productId: string;
    originalTransactionId: string;
    purchaseDate: string;
    expiresDate: string;
    isActive: boolean;
    isTrial: boolean;
    autoRenewStatus: boolean;
    environment: 'sandbox' | 'production';
  };
  error?: string;
  details?: string;
}

export interface SubscriptionContextType {
  subscription: SubscriptionState;
  isLoading: boolean;
  error: string | null;
  availableProducts: IAPProduct[];
  purchaseSubscription: (productId: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  checkSubscriptionStatus: () => Promise<void>;
  getMaxOCRScans: () => number;
  getMaxFlashcards: () => number;
  getMaxDecks: () => number;
  canShowAds: () => boolean;
  hasPremiumFeature: (feature: string) => boolean;
  setTestingSubscriptionPlan: (plan: SubscriptionPlan) => Promise<void>;
} 