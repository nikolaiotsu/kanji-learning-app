import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const ONBOARDING_COMPLETED_KEY = '@worddex_onboarding_completed';

type OnboardingContextValue = {
  /** null = still loading from storage */
  hasCompletedOnboarding: boolean | null;
  setHasCompletedOnboarding: (value: boolean) => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasCompletedOnboarding, setHasCompletedOnboardingState] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
        if (!cancelled) {
          setHasCompletedOnboardingState(value === 'true');
        }
      } catch (error) {
        logger.error('[OnboardingContext] Failed to load onboarding status:', error);
        if (!cancelled) setHasCompletedOnboardingState(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setHasCompletedOnboarding = useCallback(async (value: boolean) => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, value ? 'true' : 'false');
      setHasCompletedOnboardingState(value);
    } catch (error) {
      logger.error('[OnboardingContext] Failed to save onboarding status:', error);
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ hasCompletedOnboarding, setHasCompletedOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
