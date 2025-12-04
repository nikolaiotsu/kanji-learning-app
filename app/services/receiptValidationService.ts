import { supabase } from './supabaseClient';
import { ValidateReceiptResponse, DBSubscription } from '../../types';
import { logger } from '../utils/logger';

const EDGE_FUNCTION_URL = 'validate-receipt';

/**
 * Validates a purchase receipt with Apple's servers via Supabase Edge Function
 * @param receiptData The base64-encoded receipt data from the purchase
 * @param productId The product ID that was purchased
 * @returns Validation response with subscription details
 */
export async function validateReceipt(
  receiptData: string,
  productId: string
): Promise<ValidateReceiptResponse> {
  try {
    logger.log('Validating receipt with server...', { productId });

    // Get the current session to authenticate the request
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      logger.error('No active session for receipt validation');
      return {
        success: false,
        error: 'Authentication required',
        details: 'Please sign in to validate your purchase',
      };
    }

    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke<ValidateReceiptResponse>(
      EDGE_FUNCTION_URL,
      {
        body: {
          receiptData,
          productId,
        },
      }
    );

    if (error) {
      logger.error('Receipt validation error:', error);
      return {
        success: false,
        error: 'Validation failed',
        details: error.message || 'Unknown error occurred',
      };
    }

    if (!data || !data.success) {
      logger.error('Receipt validation failed:', data);
      return {
        success: false,
        error: data?.error || 'Validation failed',
        details: data?.details || 'The receipt could not be validated',
      };
    }

    logger.log('Receipt validated successfully:', data.subscription);
    return data;
  } catch (error) {
    logger.error('Unexpected error validating receipt:', error);
    return {
      success: false,
      error: 'Validation error',
      details: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Fetches the current subscription status from the database
 * @returns The user's subscription record or null if none exists
 */
export async function fetchSubscriptionStatus(): Promise<DBSubscription | null> {
  try {
    logger.log('Fetching subscription status from database...');

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.error('No authenticated user for subscription fetch');
      return null;
    }

    // Query the subscriptions table
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // No subscription found is not an error, just means user is on free plan
      if (error.code === 'PGRST116') {
        logger.log('No subscription found for user');
        return null;
      }

      logger.error('Error fetching subscription:', error);
      return null;
    }

    logger.log('Subscription fetched:', {
      productId: data.product_id,
      isActive: data.is_active,
      expiresDate: data.expires_date,
    });

    return data as DBSubscription;
  } catch (error) {
    logger.error('Unexpected error fetching subscription:', error);
    return null;
  }
}

/**
 * Checks if a subscription is still valid based on expiry date
 * @param subscription The subscription to check
 * @returns True if the subscription is active and not expired
 */
export function isSubscriptionValid(subscription: DBSubscription | null): boolean {
  if (!subscription || !subscription.is_active) {
    return false;
  }

  const expiresDate = new Date(subscription.expires_date);
  const now = new Date();

  return expiresDate > now;
}

/**
 * Gets the subscription plan from a database subscription
 * @param subscription The subscription record
 * @returns 'PREMIUM' if valid, 'FREE' otherwise
 */
export function getSubscriptionPlan(subscription: DBSubscription | null): 'PREMIUM' | 'FREE' {
  return isSubscriptionValid(subscription) ? 'PREMIUM' : 'FREE';
}

