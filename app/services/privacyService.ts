import { logger } from '../utils/logger';

/**
 * Privacy Service
 * Handles data anonymization, pseudonymization, and privacy controls
 */

// Configuration for privacy settings
const PRIVACY_CONFIG = {
  // Enable content anonymization (set to false for debugging)
  ANONYMIZE_CONTENT: true,
  
  // Salt for content hashing (should be stored securely in production)
  CONTENT_SALT: process.env.CONTENT_SALT || 'kanji-app-privacy-salt-2024',
  
  // Data retention periods (in days)
  RETENTION_PERIODS: {
    FLASHCARDS: 0,   // NEVER auto-delete user flashcards
    API_LOGS: 90,    // 3 months
    IMAGES: 0,       // NEVER auto-delete user images (only orphaned ones)
  },
  
  // Enable automatic data cleanup
  AUTO_CLEANUP_ENABLED: true,
};

/**
 * Simple hash function for content anonymization
 * Note: Not cryptographically secure, but sufficient for privacy-safe IDs
 */
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

/**
 * Anonymize text content by creating a hash-based identifier
 * This allows for deduplication while protecting privacy
 */
export const anonymizeContent = (content: string): string => {
  if (!PRIVACY_CONFIG.ANONYMIZE_CONTENT || !content) {
    return content;
  }
  
  try {
    // Create a deterministic hash that can be used for deduplication
    const hash = simpleHash(content + PRIVACY_CONFIG.CONTENT_SALT);
    return `anon_${hash.substring(0, 16)}`;
  } catch (error) {
    logger.error('Error anonymizing content:', error);
    return content; // Fallback to original content
  }
};

/**
 * Create a pseudonym for user content that maintains uniqueness
 * but doesn't reveal the original content
 */
export const pseudonymizeContent = (content: string, userId: string): string => {
  if (!PRIVACY_CONFIG.ANONYMIZE_CONTENT || !content) {
    return content;
  }
  
  try {
    // Combine content with user ID for user-specific pseudonymization
    const combined = `${content}_${userId}`;
    const hash = simpleHash(combined + PRIVACY_CONFIG.CONTENT_SALT);
    return `pseudo_${hash.substring(0, 20)}`;
  } catch (error) {
    logger.error('Error pseudonymizing content:', error);
    return content;
  }
};

/**
 * Generate a privacy-safe image identifier
 * Replaces predictable UUIDs with privacy-safe identifiers
 */
export const generatePrivacySafeImageId = (userId: string, timestamp?: number): string => {
  try {
    const time = timestamp || Date.now();
    const random = Math.random().toString(36).substring(2);
    const combined = `${userId}_${time}_${random}`;
    const hash = simpleHash(combined + PRIVACY_CONFIG.CONTENT_SALT);
    return `img_${hash}_${time.toString(36)}`;
  } catch (error) {
    logger.error('Error generating privacy-safe image ID:', error);
    // Fallback to UUID if hashing fails
    return `img_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
};

/**
 * Check if content should be anonymized based on sensitivity
 */
export const shouldAnonymizeContent = (content: string): boolean => {
  if (!PRIVACY_CONFIG.ANONYMIZE_CONTENT) return false;
  
  // Define patterns that indicate sensitive content
  const sensitivePatterns = [
    /[0-9]{4,}/, // Numbers that could be personal identifiers
    /@[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email patterns
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // Email patterns
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN patterns
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card patterns
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(content));
};

/**
 * Sanitize content for logging (remove sensitive information)
 */
export const sanitizeForLogging = (content: string): string => {
  if (!content) return content;
  
  try {
    // Replace sensitive patterns with placeholders
    let sanitized = content
      .replace(/[0-9]{4,}/g, '[NUMBERS]')
      .replace(/@[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]');
    
    // Truncate very long content
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100) + '...';
    }
    
    return sanitized;
  } catch (error) {
    logger.error('Error sanitizing content for logging:', error);
    return '[CONTENT_ERROR]';
  }
};

/**
 * Get data retention configuration
 */
export const getRetentionConfig = () => PRIVACY_CONFIG.RETENTION_PERIODS;

/**
 * Check if auto cleanup is enabled
 */
export const isAutoCleanupEnabled = (): boolean => PRIVACY_CONFIG.AUTO_CLEANUP_ENABLED;

/**
 * Generate a privacy-safe user identifier for analytics
 * This allows tracking usage patterns without identifying individuals
 */
export const generateAnalyticsUserId = (userId: string): string => {
  try {
    const hash = simpleHash(userId + PRIVACY_CONFIG.CONTENT_SALT);
    return `analytics_${hash.substring(0, 16)}`;
  } catch (error) {
    logger.error('Error generating analytics user ID:', error);
    return `analytics_${Date.now()}`;
  }
};

/**
 * Validate privacy settings
 */
export const validatePrivacySettings = (): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!PRIVACY_CONFIG.CONTENT_SALT || PRIVACY_CONFIG.CONTENT_SALT.length < 16) {
    errors.push('Content salt must be at least 16 characters long');
  }
  
  if (PRIVACY_CONFIG.CONTENT_SALT === 'kanji-app-privacy-salt-2024') {
    errors.push('Default content salt detected - change in production');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export default {
  anonymizeContent,
  pseudonymizeContent,
  generatePrivacySafeImageId,
  shouldAnonymizeContent,
  sanitizeForLogging,
  getRetentionConfig,
  isAutoCleanupEnabled,
  generateAnalyticsUserId,
  validatePrivacySettings,
};
