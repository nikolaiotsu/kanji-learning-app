/**
 * Conditional logger utility
 * Best practice: Only verbose logs in development, critical errors always logged
 */

const isDevelopment = __DEV__;

export const logger = {
  /**
   * Debug logs - only in development
   * Use for: verbose debugging, state changes, function calls
   */
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  /**
   * Errors - always logged (critical for debugging production issues)
   * Use for: caught exceptions, API failures, critical errors
   */
  error: (...args: any[]) => {
    console.error(...args);
    // In production, this could be sent to error tracking service (Sentry, etc.)
  },
  
  /**
   * Warnings - always logged (important issues that aren't errors)
   * Use for: deprecated functions, fallback behavior, validation issues
   */
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  
  /**
   * Debug - only in development
   * Use for: detailed debugging info
   */
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
  
  /**
   * Info - only in development
   * Use for: informational messages, successful operations
   */
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
};

