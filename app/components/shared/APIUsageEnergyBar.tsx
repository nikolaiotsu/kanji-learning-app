import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { apiLogger, APIUsageUpdateEvent } from '../../services/apiUsageLogger';
import { getCurrentSubscriptionPlan } from '../../services/receiptValidationService';
import { useSubscription } from '../../context/SubscriptionContext';
import { logger } from '../../utils/logger';
import { COLORS } from '../../constants/colors';

interface APIUsageEnergyBarProps {
  style?: any;
}

const FREE_MAX_BARS = 3; // Free users get 3 API calls per day (3 segments)
const PREMIUM_MAX_BARS = 10; // Premium users get 10 bars, 10 API calls each
const PREMIUM_CALLS_PER_BAR = 10; // 100 / 10 = 10 (one bar per 10 calls)
const PREMIUM_DAILY_LIMIT = 100; // Premium users get 100 API calls per day

export default function APIUsageEnergyBar({ style }: APIUsageEnergyBarProps) {
  const { subscription } = useSubscription(); // Get subscription from context for real-time updates
  const [remainingBars, setRemainingBars] = useState<number | null>(null); // null = not yet loaded (first mount only)
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false); // Track if we've ever loaded data

  // Derive premium status from subscription context
  const isPremiumUser = subscription.plan === 'PREMIUM';

  const fetchUsage = useCallback(async (isInitialLoad: boolean = false) => {
    try {
      // Use subscription from context (real-time updates) but also get from service for consistency
      const subscriptionPlan = subscription.plan;
      
      // Cache subscription plan for faster rate limit calculations
      apiLogger.setCachedSubscriptionPlan(subscriptionPlan);

      // Get daily usage
      const usage = await apiLogger.getDailyUsage();
      
      // Calculate API calls used (translate + wordscope)
      const apiCallsUsed = (usage?.translate_api_calls || 0) + (usage?.wordscope_api_calls || 0);
      
      // Calculate remaining bars based on plan
      let remaining: number;
      let maxBars: number;
      let dailyLimit: number;
      
      if (isPremiumUser) {
        // Premium: 10 bars, each represents 10 API calls (100 total)
        dailyLimit = PREMIUM_DAILY_LIMIT;
        maxBars = PREMIUM_MAX_BARS;
        // Calculate remaining bars: ceil((100 - used) / 10)
        const remainingCalls = Math.max(0, dailyLimit - apiCallsUsed);
        remaining = Math.ceil(remainingCalls / PREMIUM_CALLS_PER_BAR);
      } else {
        // Free: 3 bars, each represents 1 API call (3 total)
        dailyLimit = FREE_MAX_BARS;
        maxBars = FREE_MAX_BARS;
        remaining = Math.max(0, maxBars - apiCallsUsed);
      }
      
      // Update state and only log on initial load or when value actually changes
      setRemainingBars(prevRemaining => {
        if (isInitialLoad || prevRemaining !== remaining) {
          logger.log(`[APIUsageEnergyBar] Plan: ${subscriptionPlan}, Usage: ${apiCallsUsed}/${dailyLimit}, Remaining bars: ${remaining}/${maxBars}`);
        }
        return remaining;
      });
      
      // Mark that we've loaded data at least once (outside state update to avoid stale closure)
      setHasLoadedOnce(true);
    } catch (error) {
      logger.error('[APIUsageEnergyBar] Error fetching usage:', error);
      // Default to showing all bars on error (use free as default)
      setRemainingBars(FREE_MAX_BARS);
    }
  }, [subscription.plan, isPremiumUser]); // Re-fetch when subscription plan changes

  // Initialize on mount - check cache first for immediate display
  useEffect(() => {
    const initializeFromCache = async () => {
      // Check if we have a cached value for immediate display
      const cachedRemaining = apiLogger.getCachedRemainingApiCalls();
      if (cachedRemaining !== null) {
        // Use subscription from context
        let remaining: number;
        if (isPremiumUser) {
          remaining = Math.ceil(cachedRemaining / PREMIUM_CALLS_PER_BAR);
        } else {
          remaining = cachedRemaining;
        }
        
        logger.log(`[APIUsageEnergyBar] Using cached remaining API calls: ${cachedRemaining}, bars: ${remaining}`);
        setRemainingBars(remaining);
        setHasLoadedOnce(true);
      }
    };
    
    initializeFromCache();
    
    // Still fetch to ensure we have the latest data
    fetchUsage(true);
  }, [fetchUsage, isPremiumUser]); // Re-initialize when subscription changes

  // Subscribe to API usage events for immediate updates
  useEffect(() => {
    const unsubscribe = apiLogger.subscribeToUsageUpdates((event: APIUsageUpdateEvent) => {
      // Only update for translate and wordscope operations (the ones that count against limit)
      if (event.operationType === 'translate_api' || event.operationType === 'wordscope_api') {
        logger.log(`[APIUsageEnergyBar] API usage event received: ${event.operationType}, remaining calls: ${event.remainingApiCalls}`);
        
        // Use subscription from context (no async call needed)
        // Calculate remaining bars based on plan
        let remaining: number;
        if (isPremiumUser) {
          // Premium: convert remaining API calls to bars (ceil(remaining / 12))
          remaining = Math.ceil(event.remainingApiCalls / PREMIUM_CALLS_PER_BAR);
        } else {
          // Free: remaining API calls = remaining bars
          remaining = event.remainingApiCalls;
        }
        
        // Update immediately with the calculated bars
        setRemainingBars(remaining);
        setHasLoadedOnce(true);
        
        // Optionally verify in background (non-blocking)
        // fetchUsage(false);
      }
    });

    return unsubscribe;
  }, [isPremiumUser]); // Re-subscribe when subscription changes

  // Refresh when screen comes into focus (user navigates back to screen)
  // Use cached value if available for immediate display, then verify in background
  useFocusEffect(
    useCallback(() => {
      const updateFromCache = () => {
        // Check cache first for immediate display
        const cachedRemaining = apiLogger.getCachedRemainingApiCalls();
        if (cachedRemaining !== null && remainingBars === null) {
          // Use subscription from context
          let remaining: number;
          if (isPremiumUser) {
            remaining = Math.ceil(cachedRemaining / PREMIUM_CALLS_PER_BAR);
          } else {
            remaining = cachedRemaining;
          }
          
          logger.log(`[APIUsageEnergyBar] Using cached value on focus: ${cachedRemaining}, bars: ${remaining}`);
          setRemainingBars(remaining);
          setHasLoadedOnce(true);
        }
      };
      
      updateFromCache();
      
      // Verify in background (non-blocking)
      fetchUsage(false);
    }, [fetchUsage, remainingBars, isPremiumUser]) // Include isPremiumUser in dependencies
  );

  // Refresh when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground, refresh usage
        fetchUsage(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchUsage]);

  // Watch for subscription plan changes and refresh immediately
  useEffect(() => {
    logger.log(`[APIUsageEnergyBar] Subscription plan changed to: ${subscription.plan}`);
    // Refresh usage when subscription changes (e.g., beta switch to premium)
    fetchUsage(false);
  }, [subscription.plan, fetchUsage]);

  // Always render the component to maintain stable layout
  // On first mount (remainingBars === null), show all bars as inactive (grey) as loading state
  // After first load, always show the current value (even while refetching) to prevent flashing
  // This ensures smooth transitions when navigating back - shows last known value immediately
  const isLoading = remainingBars === null && !hasLoadedOnce;
  const activeBars = isLoading ? 0 : (remainingBars ?? 0);
  
  // Determine number of bars and color scheme based on subscription
  const maxBars = isPremiumUser ? PREMIUM_MAX_BARS : FREE_MAX_BARS;
  const isGold = isPremiumUser;

  return (
    <View style={[styles.container, style]}>
      <View style={[
        styles.barContainer,
        isPremiumUser && styles.barContainerPremium
      ]}>
        {Array.from({ length: maxBars }).map((_, index) => {
          const isActive = index < activeBars;
          return (
            <View
              key={index}
              style={[
                styles.bar,
                ...(isPremiumUser ? [styles.barPremium] : []),
                isActive ? (isGold ? styles.barActiveGold : styles.barActive) : styles.barInactive
              ]}
            >
              {isActive && (
                <>
                  {/* Main gradient background - gold for premium, green for free */}
                  <LinearGradient
                    colors={isGold 
                      ? ['rgba(255, 193, 7, 0.5)', 'rgba(218, 165, 32, 0.6)'] // Gold gradient
                      : ['rgba(34, 197, 94, 0.5)', 'rgba(22, 163, 74, 0.6)'] // Green gradient
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* Glass highlight overlay (top shine) */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 0.6 }}
                    style={styles.glassOverlay}
                  />
                  {/* Inner glow border */}
                  <View style={styles.innerBorder} />
                </>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: COLORS.mediumSurface, // Grey background
    borderWidth: 1,
    borderColor: COLORS.border, // Grey border
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 100,
    maxWidth: 120,
  },
  barContainerPremium: {
    maxWidth: 200, // Wider container for 10 bars
    gap: 2, // Smaller gap for premium bars to fit better
    alignSelf: 'center', // Center the container itself
  },
  bar: {
    flex: 1,
    height: 12,
    borderRadius: 2,
    minWidth: 10,
    maxWidth: 36, // Allow bars to grow and fill the grey container (3 bars)
    overflow: 'visible',
    position: 'relative',
  },
  barPremium: {
    flex: 1, // Flex to fill container width
    minWidth: 14,
    maxWidth: 20,
    height: 12,
    overflow: 'visible',
    position: 'relative',
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  innerBorder: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1,
    pointerEvents: 'none',
  },
  barInactive: {
    backgroundColor: COLORS.disabledDark, // Dark grey when used
  },
  barActive: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderWidth: 1,
    shadowColor: 'rgba(34, 197, 94, 0.7)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  barActiveGold: {
    borderColor: 'rgba(255, 193, 7, 0.4)',
    borderWidth: 1,
    shadowColor: 'rgba(255, 193, 7, 0.7)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
});
