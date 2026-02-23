import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import KanjiScanner from './components/camera/KanjiScanner';
import PokedexLayout from './components/shared/PokedexLayout';
import SignInPrompt, { getSignInPromptDismissed } from './components/auth/SignInPrompt';
import { Asset } from 'expo-asset';
import { useAuth } from './context/AuthContext';
import { useTransitionLoading } from './context/TransitionLoadingContext';
import { useBadge } from './context/BadgeContext';
import { useSignInPromptTrigger } from './context/SignInPromptTriggerContext';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';

import { logger } from './utils/logger';

const POST_ONBOARDING_LOADING_MS = 1800;
const LOADING_FADE_DURATION_MS = 350;

// 1. Import the logo image
const worddexLogo = require('../assets/images/worddexlogo.png'); // Adjusted path

export default function App() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user, isGuest, setGuestMode, isLoading: isAuthLoading } = useAuth();
  const { setShowTransitionLoading } = useTransitionLoading();
  const { pendingBadge } = useBadge();
  const { registerTrigger } = useSignInPromptTrigger();
  const params = useLocalSearchParams<{ walkthrough?: string; continueWalkthrough?: string; walkthroughStepIndex?: string }>();
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(0);
  const [logoVisible, setLogoVisible] = useState(true);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [canStartWalkthrough, setCanStartWalkthrough] = useState(() => params.walkthrough !== 'true');
  const containerRef = useRef<View>(null);
  const containerYRef = useRef<number | null>(null);
  const [progressBarTop, setProgressBarTop] = useState(4);
  const [showFindTextSkip, setShowFindTextSkip] = useState(false);
  const walkthroughSkipRef = useRef<(() => void) | null>(null);

  const handleHeaderLayout = useCallback((headerY: number) => {
    const cy = containerYRef.current;
    if (cy != null) {
      setProgressBarTop(Math.max(0, headerY - cy - 8));
    }
  }, []);

  const handleWalkthroughActiveChange = useCallback(
    (active: boolean) => {
      navigation.setOptions({ gestureEnabled: !active });
    },
    [navigation]
  );

  const handleContainerLayout = useCallback(() => {
    containerRef.current?.measureInWindow((_x, y) => {
      containerYRef.current = y;
    });
  }, []);

  const handleWalkthroughComplete = useCallback(async (options?: { fromFinalStep?: boolean }) => {
    if (options?.fromFinalStep !== true) return;
    if (pendingBadge || user || isAuthLoading) return;
    // Sign-in prompt is shown only after walkthrough overlay has fully closed (onClosed from WalkthroughOverlay).
    try {
      const dismissed = await getSignInPromptDismissed();
      if (!dismissed) {
        setShowSignInPrompt(true);
      }
    } catch {
      setShowSignInPrompt(true);
    }
  }, [user, pendingBadge, isAuthLoading]);

  const handleContinueAsGuest = useCallback(() => {
    setGuestMode(true);
  }, [setGuestMode]);

  // Dismiss post-onboarding loading overlay, then allow walkthrough to start (after fade finishes)
  useEffect(() => {
    if (params.walkthrough !== 'true') return;
    setCanStartWalkthrough(false);
    const t1 = setTimeout(() => setShowTransitionLoading(false), POST_ONBOARDING_LOADING_MS);
    const t2 = setTimeout(
      () => setCanStartWalkthrough(true),
      POST_ONBOARDING_LOADING_MS + LOADING_FADE_DURATION_MS
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [params.walkthrough, setShowTransitionLoading]);

  // Register trigger so other screens (e.g. BadgeModalGate) can show the sign-in prompt.
  // Used when user skips walkthrough and makes their first flashcard - prompt shows after badge modal.
  useEffect(() => {
    registerTrigger(() => setShowSignInPrompt(true));
    return () => registerTrigger(null);
  }, [registerTrigger]);

  // Callback to trigger the light animation
  const handleCardSwipe = useCallback(() => {
    // Increment the counter to create a new trigger value
    // This ensures the animation starts immediately and cancels any running animation
    setTriggerLightAnimation(prev => prev + 1);
  }, []);

  // Callback for content readiness (used by KanjiScanner for other purposes)
  const handleContentReady = useCallback((isReady: boolean) => {
    logger.log('🖼️ [AppIndex] handleContentReady called with isReady:', isReady);
    // Logo visibility is no longer controlled by content readiness
    // It stays visible permanently after initial fade-in
  }, []);

  // Preload logo so it renders offline in development too
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const asset = Asset.fromModule(worddexLogo);
        if (!asset.downloaded) {
          await asset.downloadAsync();
        }
        if (isMounted) {
          setLogoUri(asset.localUri || asset.uri);
        }
      } catch {
        // Fallback to require-based source if preloading fails
        if (isMounted) setLogoUri(null);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Header is always visible - settings screen covers it with its own opaque background
  // This ensures instant visibility when navigating back (no delay)

  return (
    <View style={styles.root}>
      <PokedexLayout 
        logoSource={logoUri ? { uri: logoUri } : worddexLogo}
        logoVisible={logoVisible}
        showLights={true}
        logoStyle={{ 
          width: 80,
          height: 65,
          right: 20,
          top: 0
        }}
        triggerLightAnimation={triggerLightAnimation}
      >
        <View
          ref={containerRef}
          style={styles.container}
          onLayout={handleContainerLayout}
        >
          {/* Skip above progress bar: render first and position so bottom of Skip sits above top of bar */}
          {showFindTextSkip && (
            <TouchableOpacity
              style={[styles.findTextSkipButton, { top: Math.max(0, progressBarTop - 44) }]}
              onPress={() => walkthroughSkipRef.current?.()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.findTextSkipText}>{t('common.skip')}</Text>
            </TouchableOpacity>
          )}
          <OnboardingProgressBar topOffset={progressBarTop} />
          <KanjiScanner
            onCardSwipe={handleCardSwipe}
            onContentReady={handleContentReady}
            onWalkthroughComplete={handleWalkthroughComplete}
            canStartWalkthrough={canStartWalkthrough}
            startWalkthroughFromOnboarding={params.walkthrough === 'true'}
            blockTouchesBeforeWalkthrough={params.walkthrough === 'true' && canStartWalkthrough}
            isSignInPromptVisible={showSignInPrompt}
            continueWalkthrough={params.continueWalkthrough === 'true'}
            walkthroughStepIndex={params.walkthroughStepIndex}
            onHeaderLayout={handleHeaderLayout}
            onFindTextSkipVisibilityChange={setShowFindTextSkip}
            walkthroughSkipRef={walkthroughSkipRef}
            onWalkthroughActiveChange={handleWalkthroughActiveChange}
          />
        </View>
      </PokedexLayout>
      {/* SignInPrompt is rendered OUTSIDE PokedexLayout as an absolute overlay
          so it covers the full screen. Using a View overlay instead of a native
          <Modal> eliminates the iOS snapshot-flashing issue entirely. */}
      <SignInPrompt
        visible={showSignInPrompt}
        onDismiss={() => setShowSignInPrompt(false)}
        onContinueAsGuest={handleContinueAsGuest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    // Remove all shading effects
  },
  findTextSkipButton: {
    position: 'absolute',
    left: 16,
    zIndex: 1210,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  findTextSkipText: {
    fontFamily: FONTS.sansMedium,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
