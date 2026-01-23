import { supabase } from './supabaseClient';
import Constants from 'expo-constants';
import { SUBSCRIPTION_PLANS } from '../constants/config';
import { SubscriptionPlan } from '../../types';

import { logger } from '../utils/logger';

// Event listener type for API usage updates
// Now includes the updated remaining API calls count for immediate UI updates
export interface APIUsageUpdateEvent {
  operationType: string;
  remainingApiCalls: number;
  apiCallsUsedToday: number;
  dailyLimit: number;
}
type APIUsageListener = (event: APIUsageUpdateEvent) => void;

// Types for logging
export interface APIUsageLogEntry {
  operationType: 'claude_api' | 'vision_api' | 'flashcard_create' | 'ocr_scan' | 'translate_api' | 'wordscope_api';
  endpoint?: string;
  requestSize?: number;
  responseSize?: number;
  processingTimeMs?: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface APIUsageMetrics {
  startTime: number;
  endpoint?: string;
  requestData?: any;
}

class APIUsageLogger {
  private static instance: APIUsageLogger;
  private isEnabled: boolean = true;
  private appVersion: string;
  private usageListeners: Set<APIUsageListener> = new Set();
  // Cache for current remaining API calls to provide immediate updates
  private cachedRemainingApiCalls: number | null = null;
  private cachedSubscriptionPlan: SubscriptionPlan | null = null;

  private constructor() {
    // Get app version from expo config
    this.appVersion = Constants.expoConfig?.version || '1.0.0';
    
    // Disable logging in development if needed (optional)
    // this.isEnabled = !__DEV__;
  }

  public static getInstance(): APIUsageLogger {
    if (!APIUsageLogger.instance) {
      APIUsageLogger.instance = new APIUsageLogger();
    }
    return APIUsageLogger.instance;
  }

  /**
   * Start tracking an API operation
   * Returns metrics object to pass to logAPIUsage
   */
  public startAPICall(endpoint?: string, requestData?: any): APIUsageMetrics {
    return {
      startTime: Date.now(),
      endpoint,
      requestData
    };
  }

  /**
   * Log API usage to database
   * @param entry - The usage log entry
   * @param metrics - Optional metrics from startAPICall
   */
  public async logAPIUsage(entry: APIUsageLogEntry, metrics?: APIUsageMetrics): Promise<void> {
    if (!this.isEnabled) {
      logger.log('[APILogger] Logging disabled, skipping log entry');
      return;
    }

    try {
      // Calculate processing time if metrics provided
      const processingTimeMs = metrics ? Date.now() - metrics.startTime : entry.processingTimeMs;
      
      // Prepare log entry
      const logEntry = {
        operation_type: entry.operationType,
        endpoint: entry.endpoint || metrics?.endpoint,
        request_size: entry.requestSize || this.calculateRequestSize(metrics?.requestData),
        response_size: entry.responseSize,
        processing_time_ms: processingTimeMs,
        success: entry.success,
        error_message: entry.errorMessage,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        app_version: this.appVersion,
        created_at: new Date().toISOString()
      };

      // Insert into database (async, don't wait)
      this.insertLogEntry(logEntry);

      // Update daily usage counters
      if (entry.success) {
        // Don't await - fire and forget, but log if it fails
        this.updateDailyUsage(entry.operationType, entry.metadata?.tokens || 0).catch((error) => {
          logger.error('[APILogger] updateDailyUsage promise rejected:', error);
        });
      }

      // Console log for development
      if (__DEV__) {
        logger.log(`[APILogger] ${entry.operationType}: ${entry.success ? 'SUCCESS' : 'FAILED'}`, {
          endpoint: logEntry.endpoint,
          processingTime: `${processingTimeMs}ms`,
          requestSize: logEntry.request_size,
          responseSize: logEntry.response_size
        });
      }

    } catch (error) {
      logger.error('[APILogger] Failed to log API usage:', error);
      // Don't throw - logging should never break the app
    }
  }

  /**
   * Log a successful API call
   */
  public async logSuccess(
    operationType: APIUsageLogEntry['operationType'],
    metrics: APIUsageMetrics,
    responseSize?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logAPIUsage({
      operationType,
      success: true,
      responseSize,
      metadata
    }, metrics);
  }

  /**
   * Log a failed API call
   */
  public async logError(
    operationType: APIUsageLogEntry['operationType'],
    metrics: APIUsageMetrics,
    error: Error | string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    
    await this.logAPIUsage({
      operationType,
      success: false,
      errorMessage,
      metadata
    }, metrics);
  }

  /**
   * Get user's daily usage statistics
   */
  public async getDailyUsage(date?: string): Promise<any> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('user_daily_usage')
        .select('*')
        .eq('usage_date', targetDate)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('[APILogger] Error fetching daily usage:', error);
        return null;
      }

      return data || {
        claude_api_calls: 0,
        vision_api_calls: 0,
        flashcards_created: 0,
        ocr_scans_performed: 0,
        total_claude_tokens: 0,
        total_vision_requests: 0,
        translate_api_calls: 0,
        wordscope_api_calls: 0
      };
    } catch (error) {
      logger.error('[APILogger] Error getting daily usage:', error);
      return null;
    }
  }

  /**
   * Get recent API usage logs for debugging
   */
  public async getRecentLogs(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('[APILogger] Error fetching logs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('[APILogger] Error getting recent logs:', error);
      return [];
    }
  }

  /**
   * Get user's monthly usage statistics (sum of all days in current month)
   * Only counts translate and wordscope API calls for the unified limit
   */
  public async getMonthlyUsage(): Promise<{
    totalApiCalls: number;
    flashcardsCreated: number;
  }> {
    try {
      // Get first and last day of current month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('user_daily_usage')
        .select('translate_api_calls, wordscope_api_calls, flashcards_created')
        .gte('usage_date', firstDayOfMonth)
        .lte('usage_date', lastDayOfMonth);

      if (error) {
        logger.error('[APILogger] Error fetching monthly usage:', error);
        return { totalApiCalls: 0, flashcardsCreated: 0 };
      }

      // Sum up only translate and wordscope API calls across the month
      let totalApiCalls = 0;
      let flashcardsCreated = 0;
      
      for (const day of (data || [])) {
        // Only count translate and wordscope calls for the unified API limit
        totalApiCalls += (day.translate_api_calls || 0) + 
                         (day.wordscope_api_calls || 0);
        flashcardsCreated += (day.flashcards_created || 0);
      }

      return { totalApiCalls, flashcardsCreated };
    } catch (error) {
      logger.error('[APILogger] Error getting monthly usage:', error);
      return { totalApiCalls: 0, flashcardsCreated: 0 };
    }
  }

  /**
   * Set the cached subscription plan for faster rate limit calculations
   */
  public setCachedSubscriptionPlan(plan: SubscriptionPlan): void {
    this.cachedSubscriptionPlan = plan;
  }

  /**
   * Get cached remaining API calls (for immediate UI updates before fetch)
   */
  public getCachedRemainingApiCalls(): number | null {
    return this.cachedRemainingApiCalls;
  }

  /**
   * Check if user is approaching rate limits
   * Uses UNIFIED API limits - only translate and wordscope calls count against the limit
   * OCR and vision calls are NOT counted against the unified limit
   * @param subscriptionPlan - The user's subscription plan ('FREE' or 'PREMIUM')
   */
  public async checkRateLimitStatus(subscriptionPlan: SubscriptionPlan = 'FREE'): Promise<{
    claudeCallsRemaining: number;
    visionCallsRemaining: number;
    flashcardsRemaining: number;
    ocrScansRemaining: number;
    translateCallsRemaining: number;
    wordscopeCallsRemaining: number;
    // New unified limit fields
    apiCallsRemaining: number;
    apiCallsUsedToday: number;
    apiCallsUsedThisMonth: number;
    dailyLimit: number;
    monthlyLimit: number | null;
  }> {
    try {
      const usage = await this.getDailyUsage();
      const planConfig = SUBSCRIPTION_PLANS[subscriptionPlan];
      
      // Calculate API calls used today - ONLY translate and wordscope count against unified limit
      const apiCallsUsedToday = (usage?.translate_api_calls || 0) + 
                                 (usage?.wordscope_api_calls || 0);
      
      // Log subscription plan and limits for debugging
      logger.log(`[APILogger] checkRateLimitStatus - plan: ${subscriptionPlan}, dailyLimit: ${planConfig.apiCallsPerDay}, monthlyLimit: ${planConfig.apiCallsPerMonth ?? 'N/A'}`);
      logger.log(`[APILogger] Today's usage - translate: ${usage?.translate_api_calls || 0}, wordscope: ${usage?.wordscope_api_calls || 0}, total: ${apiCallsUsedToday}`);
      
      // Get unified daily limit
      const dailyLimit = planConfig.apiCallsPerDay;
      const monthlyLimit = planConfig.apiCallsPerMonth ?? null;
      
      // Calculate daily remaining
      let apiCallsRemaining = Math.max(0, dailyLimit - apiCallsUsedToday);
      
      // For premium users with monthly limits, also check monthly usage
      let apiCallsUsedThisMonth = apiCallsUsedToday; // Default to today's usage
      if (monthlyLimit !== null && subscriptionPlan === 'PREMIUM') {
        const monthlyUsage = await this.getMonthlyUsage();
        apiCallsUsedThisMonth = monthlyUsage.totalApiCalls;
        
        // Take the minimum of daily and monthly remaining
        const monthlyRemaining = Math.max(0, monthlyLimit - apiCallsUsedThisMonth);
        apiCallsRemaining = Math.min(apiCallsRemaining, monthlyRemaining);
        
        logger.log(`[APILogger] Premium monthly usage: ${apiCallsUsedThisMonth}/${monthlyLimit}, remaining: ${monthlyRemaining}`);
      }
      
      logger.log(`[APILogger] Final apiCallsRemaining: ${apiCallsRemaining}`);
      
      // Update cache with fresh data
      this.cachedRemainingApiCalls = apiCallsRemaining;
      this.cachedSubscriptionPlan = subscriptionPlan;
      
      // Flashcard limit (unlimited for premium is represented as -1)
      const flashcardLimit = planConfig.flashcardsPerDay;
      const isUnlimitedFlashcards = flashcardLimit === -1;
      const flashcardsRemaining = isUnlimitedFlashcards 
        ? Number.MAX_SAFE_INTEGER 
        : Math.max(0, flashcardLimit - (usage?.flashcards_created || 0));

      // For backward compatibility, translate/wordscope use unified limit
      // OCR/vision are not limited by the unified API limit (they have separate limits if needed)
      return {
        claudeCallsRemaining: Number.MAX_SAFE_INTEGER, // OCR/claude not limited by unified limit
        visionCallsRemaining: Number.MAX_SAFE_INTEGER, // Vision not limited by unified limit
        flashcardsRemaining: flashcardsRemaining,
        ocrScansRemaining: Number.MAX_SAFE_INTEGER, // OCR not limited by unified limit
        translateCallsRemaining: apiCallsRemaining, // Uses unified limit
        wordscopeCallsRemaining: apiCallsRemaining, // Uses unified limit
        // New unified limit fields
        apiCallsRemaining,
        apiCallsUsedToday,
        apiCallsUsedThisMonth,
        dailyLimit,
        monthlyLimit
      };
    } catch (error) {
      logger.error('[APILogger] Error checking rate limits:', error);
      return {
        claudeCallsRemaining: 0,
        visionCallsRemaining: 0,
        flashcardsRemaining: 0,
        ocrScansRemaining: 0,
        translateCallsRemaining: 0,
        wordscopeCallsRemaining: 0,
        apiCallsRemaining: 0,
        apiCallsUsedToday: 0,
        apiCallsUsedThisMonth: 0,
        dailyLimit: 0,
        monthlyLimit: null
      };
    }
  }

  // Private helper methods
  private async insertLogEntry(logEntry: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_usage_logs')
        .insert(logEntry);

      if (error) {
        logger.error('[APILogger] Database insert error:', error);
      }
    } catch (error) {
      logger.error('[APILogger] Failed to insert log entry:', error);
    }
  }

  private async updateDailyUsage(operationType: string, tokens: number = 0): Promise<void> {
    try {
      logger.log(`[APILogger] Updating daily usage for operationType: ${operationType}, tokens: ${tokens}`);
      const { data, error } = await supabase
        .rpc('update_daily_usage', {
          p_operation_type: operationType,
          p_tokens: tokens
        });

      if (error) {
        logger.error('[APILogger] Daily usage update error:', error);
        logger.error('[APILogger] Error code:', error.code);
        logger.error('[APILogger] Error message:', error.message);
        logger.error('[APILogger] Error details:', error.details);
        logger.error('[APILogger] Operation type that failed:', operationType);
        logger.error('[APILogger] If you see this error, the migration may not have been applied to Supabase');
      } else {
        logger.log(`[APILogger] Successfully updated daily usage for ${operationType}`);
        
        // Get updated rate limit status to provide immediate data to listeners
        // Use cached subscription plan if available, otherwise default to FREE
        const subscriptionPlan = this.cachedSubscriptionPlan || 'FREE';
        const rateLimitStatus = await this.checkRateLimitStatus(subscriptionPlan);
        
        // Update cache with fresh data
        this.cachedRemainingApiCalls = rateLimitStatus.apiCallsRemaining;
        
        // Emit event with updated data for immediate UI updates
        this.emitUsageUpdate({
          operationType,
          remainingApiCalls: rateLimitStatus.apiCallsRemaining,
          apiCallsUsedToday: rateLimitStatus.apiCallsUsedToday,
          dailyLimit: rateLimitStatus.dailyLimit
        });
      }
    } catch (error) {
      logger.error('[APILogger] Failed to update daily usage:', error);
      logger.error('[APILogger] Operation type that failed:', operationType);
      if (error instanceof Error) {
        logger.error('[APILogger] Error stack:', error.stack);
      }
    }
  }

  private calculateRequestSize(data: any): number {
    if (!data) return 0;
    
    try {
      if (typeof data === 'string') {
        return data.length;
      }
      
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  /**
   * Enable or disable logging
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.log(`[APILogger] Logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Subscribe to API usage updates
   * @param listener - Callback to be called when API usage is updated
   * @returns Unsubscribe function
   */
  public subscribeToUsageUpdates(listener: APIUsageListener): () => void {
    this.usageListeners.add(listener);
    return () => {
      this.usageListeners.delete(listener);
    };
  }

  /**
   * Emit usage update event to all listeners with updated data
   */
  private emitUsageUpdate(event: APIUsageUpdateEvent): void {
    this.usageListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error('[APILogger] Error in usage listener:', error);
      }
    });
  }
}

// Export singleton instance
export const apiLogger = APIUsageLogger.getInstance();

// Convenience functions for common operations
export const logClaudeAPI = async (
  metrics: APIUsageMetrics,
  success: boolean,
  responseText?: string,
  error?: Error,
  metadata?: Record<string, any>,
  inputTokens?: number,
  outputTokens?: number
) => {
  logger.log(`📊 [APILogger] logClaudeAPI called - success: ${success}, operationType: ${metadata?.operationType}`);
  
  // Determine operation type from metadata
  // If metadata has operationType 'wordscope_combined', use 'wordscope_api'
  // If metadata has operationType 'translation' or 'translate', use 'translate_api'
  // Otherwise default to claude_api for backward compatibility
  let operationType: APIUsageLogEntry['operationType'] = 'claude_api';
  
  if (metadata?.operationType === 'wordscope_combined') {
    operationType = 'wordscope_api';
    logger.log('[APILogger] Detected wordscope_combined, using wordscope_api operation type');
  } else if (metadata?.operationType === 'translation' || metadata?.operationType === 'translate') {
    operationType = 'translate_api';
    logger.log(`[APILogger] Detected ${metadata?.operationType}, using translate_api operation type`);
  } else {
    logger.log(`[APILogger] Using default claude_api operation type (metadata.operationType: ${metadata?.operationType})`);
  }
  
  if (success) {
    const totalTokens = (inputTokens || 0) + (outputTokens || 0);
    
    // Log token usage in development mode
    if (__DEV__ && (inputTokens !== undefined || outputTokens !== undefined)) {
      const model = metadata?.model || 'unknown';
      logger.log(`[Token Usage] ${operationType} (${model}) - Input: ${inputTokens || 0}, Output: ${outputTokens || 0}, Total: ${totalTokens}`);
    }
    
    await apiLogger.logSuccess(operationType, metrics, responseText?.length, {
      ...metadata,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      tokens: totalTokens, // Total tokens for backward compatibility
      // Fallback to estimate if actual tokens not provided
      estimatedTokens: inputTokens === undefined && outputTokens === undefined 
        ? (responseText ? Math.ceil(responseText.length / 4) : 0)
        : undefined
    });
  } else {
    await apiLogger.logError(operationType, metrics, error || 'Unknown error', metadata);
  }
};

export const logVisionAPI = async (
  metrics: APIUsageMetrics,
  success: boolean,
  responseData?: any,
  error?: Error,
  metadata?: Record<string, any>
) => {
  if (success) {
    await apiLogger.logSuccess('vision_api', metrics, JSON.stringify(responseData || {}).length, metadata);
  } else {
    await apiLogger.logError('vision_api', metrics, error || 'Unknown error', metadata);
  }
};

export const logFlashcardCreation = async (success: boolean, metadata?: Record<string, any>) => {
  const metrics = apiLogger.startAPICall('flashcard_create');
  
  if (success) {
    await apiLogger.logSuccess('flashcard_create', metrics, undefined, metadata);
  } else {
    await apiLogger.logError('flashcard_create', metrics, 'Flashcard creation failed', metadata);
  }
};

export const logOCRScan = async (success: boolean, metadata?: Record<string, any>) => {
  const metrics = apiLogger.startAPICall('ocr_scan');
  
  if (success) {
    await apiLogger.logSuccess('ocr_scan', metrics, undefined, metadata);
  } else {
    await apiLogger.logError('ocr_scan', metrics, 'OCR scan failed', metadata);
  }
};
