import { apiLogger } from '../services/apiUsageLogger';
import { getCurrentSubscriptionPlan } from '../services/receiptValidationService';
import { SubscriptionPlan } from '../../types';
import { logger } from './logger';

/**
 * Check if user has energy bars remaining (API calls available)
 * @param subscriptionPlan - Optional subscription plan. If not provided, will be fetched.
 * @returns true if user has at least 1 API call remaining, false otherwise
 */
export async function hasEnergyBarsRemaining(
  subscriptionPlan?: SubscriptionPlan
): Promise<boolean> {
  try {
    // Get subscription plan if not provided
    let effectivePlan = subscriptionPlan;
    if (!effectivePlan) {
      effectivePlan = await getCurrentSubscriptionPlan();
    }

    // Check rate limit status
    const rateLimitStatus = await apiLogger.checkRateLimitStatus(effectivePlan);
    
    // User has energy if they have at least 1 API call remaining
    const hasEnergy = rateLimitStatus.apiCallsRemaining > 0;
    
    logger.log(`[walkthroughEnergyCheck] Energy check - Plan: ${effectivePlan}, Remaining: ${rateLimitStatus.apiCallsRemaining}, Has Energy: ${hasEnergy}`);
    
    return hasEnergy;
  } catch (error) {
    logger.error('[walkthroughEnergyCheck] Error checking energy bars:', error);
    // On error, default to false (no energy) to be safe
    return false;
  }
}
