import { supabase } from './supabaseClient';
import Constants from 'expo-constants';
import { SUBSCRIPTION_PLANS } from '../constants/config';
import { SubscriptionPlan } from '../../types';

import { logger } from '../utils/logger';
// Types for logging
export interface APIUsageLogEntry {
  operationType: 'claude_api' | 'vision_api' | 'flashcard_create' | 'ocr_scan';
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
        this.updateDailyUsage(entry.operationType, entry.metadata?.tokens || 0);
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
        total_vision_requests: 0
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
   * Check if user is approaching rate limits
   * @param subscriptionPlan - The user's subscription plan ('FREE' or 'PREMIUM')
   */
  public async checkRateLimitStatus(subscriptionPlan: SubscriptionPlan = 'FREE'): Promise<{
    claudeCallsRemaining: number;
    visionCallsRemaining: number;
    flashcardsRemaining: number;
    ocrScansRemaining: number;
  }> {
    try {
      const usage = await this.getDailyUsage();
      const planConfig = SUBSCRIPTION_PLANS[subscriptionPlan];
      
      // Total API calls limit (applies to both claude and vision API calls combined)
      const totalApiCallsLimit = planConfig.ocrScansPerDay;
      const totalApiCallsUsed = (usage?.claude_api_calls || 0) + (usage?.vision_api_calls || 0);
      const totalApiCallsRemaining = Math.max(0, totalApiCallsLimit - totalApiCallsUsed);
      
      // Flashcard limit (unlimited for premium is represented as -1)
      const flashcardLimit = planConfig.flashcardsPerDay;
      const isUnlimitedFlashcards = flashcardLimit === -1;
      const flashcardsRemaining = isUnlimitedFlashcards 
        ? Number.MAX_SAFE_INTEGER 
        : Math.max(0, flashcardLimit - (usage?.flashcards_created || 0));

      return {
        claudeCallsRemaining: totalApiCallsRemaining, // Combined limit for all API calls
        visionCallsRemaining: totalApiCallsRemaining, // Combined limit for all API calls
        flashcardsRemaining: flashcardsRemaining,
        ocrScansRemaining: totalApiCallsRemaining // OCR scans use the same API call limit
      };
    } catch (error) {
      logger.error('[APILogger] Error checking rate limits:', error);
      return {
        claudeCallsRemaining: 0,
        visionCallsRemaining: 0,
        flashcardsRemaining: 0,
        ocrScansRemaining: 0
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
      const { error } = await supabase
        .rpc('update_daily_usage', {
          p_operation_type: operationType,
          p_tokens: tokens
        });

      if (error) {
        logger.error('[APILogger] Daily usage update error:', error);
      }
    } catch (error) {
      logger.error('[APILogger] Failed to update daily usage:', error);
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
}

// Export singleton instance
export const apiLogger = APIUsageLogger.getInstance();

// Convenience functions for common operations
export const logClaudeAPI = async (
  metrics: APIUsageMetrics,
  success: boolean,
  responseText?: string,
  error?: Error,
  metadata?: Record<string, any>
) => {
  if (success) {
    await apiLogger.logSuccess('claude_api', metrics, responseText?.length, {
      ...metadata,
      tokens: responseText ? Math.ceil(responseText.length / 4) : 0 // Rough token estimate
    });
  } else {
    await apiLogger.logError('claude_api', metrics, error || 'Unknown error', metadata);
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
