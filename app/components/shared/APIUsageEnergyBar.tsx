import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { apiLogger, APIUsageUpdateEvent } from '../../services/apiUsageLogger';
import { getCurrentSubscriptionPlan } from '../../services/receiptValidationService';
import { logger } from '../../utils/logger';
import { COLORS } from '../../constants/colors';

interface APIUsageEnergyBarProps {
  style?: any;
}

const MAX_BARS = 5; // Free users get 5 API calls per day

export default function APIUsageEnergyBar({ style }: APIUsageEnergyBarProps) {
  const [remainingBars, setRemainingBars] = useState<number | null>(null); // null = not yet loaded (first mount only)
  const [isFreeUser, setIsFreeUser] = useState<boolean>(true); // Default to true to show immediately
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false); // Track if we've ever loaded data

  const fetchUsage = useCallback(async (isInitialLoad: boolean = false) => {
    try {
      // Check if user is free
      const subscriptionPlan = await getCurrentSubscriptionPlan();
      const free = subscriptionPlan === 'FREE';
      setIsFreeUser(free);
      
      // Cache subscription plan for faster rate limit calculations
      apiLogger.setCachedSubscriptionPlan(subscriptionPlan);
      
      if (!free) {
        // Premium users don't see the energy bar
        return;
      }

      // Get daily usage
      const usage = await apiLogger.getDailyUsage();
      
      // Calculate API calls used (translate + wordscope)
      const apiCallsUsed = (usage?.translate_api_calls || 0) + (usage?.wordscope_api_calls || 0);
      
      // Calculate remaining bars
      const remaining = Math.max(0, MAX_BARS - apiCallsUsed);
      
      // Update state and only log on initial load or when value actually changes
      setRemainingBars(prevRemaining => {
        if (isInitialLoad || prevRemaining !== remaining) {
          logger.log(`[APIUsageEnergyBar] Usage: ${apiCallsUsed}/${MAX_BARS}, Remaining bars: ${remaining}`);
        }
        return remaining;
      });
      
      // Mark that we've loaded data at least once (outside state update to avoid stale closure)
      setHasLoadedOnce(true);
    } catch (error) {
      logger.error('[APIUsageEnergyBar] Error fetching usage:', error);
      // Default to showing all bars on error
      setRemainingBars(MAX_BARS);
    }
  }, []);

  // Initialize on mount - check cache first for immediate display
  useEffect(() => {
    // Check if we have a cached value for immediate display
    const cachedRemaining = apiLogger.getCachedRemainingApiCalls();
    if (cachedRemaining !== null) {
      logger.log(`[APIUsageEnergyBar] Using cached remaining API calls: ${cachedRemaining}`);
      setRemainingBars(cachedRemaining);
      setHasLoadedOnce(true);
    }
    
    // Still fetch to ensure we have the latest data
    fetchUsage(true);
  }, [fetchUsage]);

  // Subscribe to API usage events for immediate updates
  useEffect(() => {
    const unsubscribe = apiLogger.subscribeToUsageUpdates((event: APIUsageUpdateEvent) => {
      // Only update for translate and wordscope operations (the ones that count against free limit)
      if (event.operationType === 'translate_api' || event.operationType === 'wordscope_api') {
        logger.log(`[APIUsageEnergyBar] API usage event received: ${event.operationType}, remaining: ${event.remainingApiCalls}`);
        
        // Update immediately with the data from the event (no fetch needed!)
        setRemainingBars(event.remainingApiCalls);
        setHasLoadedOnce(true);
        
        // Optionally verify in background (non-blocking)
        // fetchUsage(false);
      }
    });

    return unsubscribe;
  }, []);

  // Refresh when screen comes into focus (user navigates back to screen)
  // Use cached value if available for immediate display, then verify in background
  useFocusEffect(
    useCallback(() => {
      // Check cache first for immediate display
      const cachedRemaining = apiLogger.getCachedRemainingApiCalls();
      if (cachedRemaining !== null && remainingBars === null) {
        logger.log(`[APIUsageEnergyBar] Using cached value on focus: ${cachedRemaining}`);
        setRemainingBars(cachedRemaining);
        setHasLoadedOnce(true);
      }
      
      // Verify in background (non-blocking)
      fetchUsage(false);
    }, [fetchUsage, remainingBars])
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

  // Don't render if not a free user (premium users don't see the energy bar)
  if (!isFreeUser) {
    return null;
  }

  // Always render the component to maintain stable layout
  // On first mount (remainingBars === null), show all bars as inactive (grey) as loading state
  // After first load, always show the current value (even while refetching) to prevent flashing
  // This ensures smooth transitions when navigating back - shows last known value immediately
  const isLoading = remainingBars === null && !hasLoadedOnce;
  const activeBars = isLoading ? 0 : (remainingBars ?? 0);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.barContainer}>
        {Array.from({ length: MAX_BARS }).map((_, index) => {
          const isActive = index < activeBars;
          return (
            <View
              key={index}
              style={[
                styles.bar,
                isActive ? styles.barActive : styles.barInactive
              ]}
            >
              {isActive && (
                <>
                  {/* Main green gradient background */}
                  <LinearGradient
                    colors={['rgba(34, 197, 94, 0.5)', 'rgba(22, 163, 74, 0.6)']} // Lighter green to darker green
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
  bar: {
    flex: 1,
    height: 10,
    borderRadius: 2,
    minWidth: 10,
    maxWidth: 16,
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
});
