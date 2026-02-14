import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { useSegments, useRouter, useGlobalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { useNetworkState } from '../../services/networkManager';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';

import { logger } from '../../utils/logger';
// Protected routes (require authentication)
const PROTECTED_SEGMENTS = ['flashcards', 'saved-flashcards', '(screens)'];

// Auth routes (accessible without authentication)
const AUTH_SEGMENTS = ['login', 'signup', 'reset-password', 'onboarding'];

// Auth-only routes: when user is logged in, redirect these to home (onboarding is allowed for testing)
const AUTH_ONLY_REDIRECT_SEGMENTS = ['login', 'signup', 'reset-password'];

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, isOfflineMode, isGuest } = useAuth();
  const { hasCompletedOnboarding } = useOnboarding();
  const { isConnected } = useNetworkState();
  const segments = useSegments();
  const router = useRouter();
  const globalParams = useGlobalSearchParams<{ walkthrough?: string }>();

  // Track if loading has taken too long (show helpful message)
  const [showSlowLoadingMessage, setShowSlowLoadingMessage] = useState(false);

  // Current route segment (first part of the path)
  const currentSegment = segments[0];
  const hasWalkthroughParam = globalParams.walkthrough === 'true';
  const isFlashcardsWalkthrough = currentSegment === 'flashcards' && hasWalkthroughParam;
  const isHomeWalkthrough = (currentSegment === undefined || currentSegment === 'index') && hasWalkthroughParam;
  const isWalkthroughMode = isFlashcardsWalkthrough || isHomeWalkthrough;

  // Show message if loading takes more than 5 seconds
  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    
    if (isLoading) {
      timeout = setTimeout(() => {
        setShowSlowLoadingMessage(true);
      }, 5000);
    } else {
      setShowSlowLoadingMessage(false);
    }
    
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isLoading]);

  useEffect(() => {
    logger.log('🔐 [AuthGuard] useEffect triggered');
    logger.log('🔐 [AuthGuard] isLoading:', isLoading);
    logger.log('🔐 [AuthGuard] user:', !!user);
    logger.log('🔐 [AuthGuard] isOfflineMode:', isOfflineMode);
    logger.log('🔐 [AuthGuard] isConnected:', isConnected);
    logger.log('🔐 [AuthGuard] currentSegment:', currentSegment);
    logger.log('🔐 [AuthGuard] segments:', segments);
    
    if (isLoading) {
      logger.log('🔐 [AuthGuard] Still loading, returning...');
      return;
    }

    // User is authenticated but tries to access login/signup/reset-password → go home (onboarding allowed for beta testing)
    if (user && AUTH_ONLY_REDIRECT_SEGMENTS.includes(currentSegment)) {
      logger.log('🔐 [AuthGuard] User authenticated, redirecting from auth route to /');
      // Use replace only - dismissAll() causes "POP_TO_TOP was not handled" when login is the current screen (no stack to pop).
      router.replace('/');
      return;
    }

    // Wait for onboarding state to load before redirecting unauthenticated users
    if (!user && hasCompletedOnboarding === null) {
      logger.log('🔐 [AuthGuard] Onboarding state loading, skipping redirect');
      return;
    }

    // First-time user: not authenticated and has not completed onboarding → show onboarding
    const onboardingSegments = ['onboarding', 'onboarding-language', 'onboarding-why', 'onboarding-time', 'onboarding-faster', 'onboarding-relevant', 'onboarding-educational'];
    if (!user && hasCompletedOnboarding === false && !onboardingSegments.includes(currentSegment)) {
      logger.log('🔐 [AuthGuard] First-time user, redirecting to /onboarding');
      router.replace('/onboarding');
      return;
    }

    // User is not authenticated and not guest → protected routes require login (unless walkthrough mode)
    if (!user && !isGuest && PROTECTED_SEGMENTS.includes(currentSegment) && !isWalkthroughMode) {
      logger.log('🔐 [AuthGuard] User not authenticated, redirecting to /login');
      router.replace('/login');
      return;
    }

    // No segment (root), not authenticated, and not guest → login (onboarding already completed), unless walkthrough
    if (!user && !isGuest && (currentSegment === undefined || currentSegment === 'index') && !isHomeWalkthrough) {
      logger.log('🔐 [AuthGuard] No segment and no user, redirecting to /login');
      router.replace('/login');
      return;
    }

    logger.log('🔐 [AuthGuard] No navigation needed');
  }, [user, isLoading, isGuest, hasCompletedOnboarding, currentSegment, isWalkthroughMode, isOfflineMode]);

  // Show loading while auth or onboarding state is resolving (avoids flashing wrong screen)
  const resolvingFirstTime = !user && hasCompletedOnboarding === null;
  if (isLoading || resolvingFirstTime) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        {showSlowLoadingMessage && (
          <View style={styles.messageContainer}>
            <Text style={styles.messageTitle}>
              {isConnected === false ? '📶 No Internet Connection' : '⏳ Taking longer than expected...'}
            </Text>
            <Text style={styles.messageText}>
              {isConnected === false
                ? 'Please check your connection and try again. If you\'ve signed in before, your data will be available once connected.'
                : 'Having trouble connecting to our servers. Please check your internet connection.'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  messageContainer: {
    marginTop: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  messageTitle: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  messageText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// Add default export to satisfy Expo Router's requirement
export default AuthGuard; 