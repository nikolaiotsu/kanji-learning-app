import React, { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { useOnboarding } from './OnboardingContext';

/** Max time to wait for videos to be ready before allowing app to proceed (ms) */
export const MAX_ONBOARDING_VIDEO_PRELOAD_MS = 6000;

/**
 * After migrating from expo-video to expo-av, video players are no longer preloaded
 * in context. expo-av Video components load local assets near-instantly on mount.
 *
 * This provider now only handles:
 * 1. Detecting whether we're on an onboarding route / first-time user
 * 2. Firing onVideosReady immediately (local MP4s don't need preloading)
 */
export function OnboardingVideosProvider({
  children,
  onVideosReady,
}: {
  children: ReactNode;
  onVideosReady?: () => void;
}) {
  const pathname = usePathname();
  const { hasCompletedOnboarding } = useOnboarding();
  const isOnboardingRoute =
    typeof pathname === 'string' && pathname.includes('onboarding');
  const isFirstTimeUser = hasCompletedOnboarding === false;
  const hasNotifiedRef = useRef(false);

  useEffect(() => {
    if ((isOnboardingRoute || isFirstTimeUser) && onVideosReady && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      onVideosReady();
    }
  }, [isOnboardingRoute, isFirstTimeUser, onVideosReady]);

  return <>{children}</>;
}
