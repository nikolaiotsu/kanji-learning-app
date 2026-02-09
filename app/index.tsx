import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import KanjiScanner from './components/camera/KanjiScanner';
import PokedexLayout from './components/shared/PokedexLayout';
import SignInPrompt, { getSignInPromptDismissed } from './components/auth/SignInPrompt';
import { Asset } from 'expo-asset';
import { useAuth } from './context/AuthContext';
import { useTransitionLoading } from './context/TransitionLoadingContext';
import { useSignInPromptTrigger } from './context/SignInPromptTriggerContext';
import { useBadge } from './context/BadgeContext';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';

import { logger } from './utils/logger';

const POST_ONBOARDING_LOADING_MS = 1800;
const LOADING_FADE_DURATION_MS = 350;

const WALKTHROUGH_COMPLETED_KEY = '@walkthrough_completed';
// 1. Import the logo image
const worddexLogo = require('../assets/images/worddexlogo.png'); // Adjusted path

export default function App() {
  const { user, isGuest, setGuestMode } = useAuth();
  const { setShowTransitionLoading } = useTransitionLoading();
  const { registerTrigger } = useSignInPromptTrigger();
  const { pendingBadge } = useBadge();
  const params = useLocalSearchParams<{ walkthrough?: string }>();
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(0);
  const [logoVisible, setLogoVisible] = useState(true);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [canStartWalkthrough, setCanStartWalkthrough] = useState(() => params.walkthrough !== 'true');

  // Allow badge modal dismiss to trigger sign-in prompt (e.g. after first card badge)
  const showSignInPromptIfNeeded = useCallback(async () => {
    if (user) return;
    const dismissed = await getSignInPromptDismissed();
    if (!dismissed) setShowSignInPrompt(true);
  }, [user]);
  useEffect(() => {
    registerTrigger(showSignInPromptIfNeeded);
    return () => registerTrigger(null);
  }, [registerTrigger, showSignInPromptIfNeeded]);

  const handleWalkthroughComplete = useCallback(() => {
    // Do NOT show the sign-in prompt here. It will show when the user dismisses the
    // badge celebration modal (if they earned one) so the badge is seen first.
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      // Show sign-in prompt for guests who completed walkthrough but haven't dismissed prompt.
      // Skip if there's a pending badge so the user sees the badge modal first; the prompt
      // will show when they dismiss the badge modal.
      if (user || pendingBadge) return;
      let mounted = true;
      (async () => {
        const [dismissed, completed] = await Promise.all([
          getSignInPromptDismissed(),
          AsyncStorage.getItem(WALKTHROUGH_COMPLETED_KEY),
        ]);
        if (mounted && completed === 'true' && !dismissed) {
          setShowSignInPrompt(true);
        }
      })();
      return () => { mounted = false; };
    }, [user, pendingBadge])
  );

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
        style={styles.container}
        onLayout={(event) => {
          // const { x, y, width, height } = event.nativeEvent.layout;
          // logger.log(`[AppIndexRootView] onLayout: x:${x}, y:${y}, width:${width}, height:${height}`);
        }}
      >
        <OnboardingProgressBar />
        <KanjiScanner
          onCardSwipe={handleCardSwipe}
          onContentReady={handleContentReady}
          onWalkthroughComplete={handleWalkthroughComplete}
          canStartWalkthrough={canStartWalkthrough}
          blockTouchesBeforeWalkthrough={params.walkthrough === 'true' && canStartWalkthrough}
          isSignInPromptVisible={showSignInPrompt}
        />
      </View>
      <SignInPrompt
        visible={showSignInPrompt}
        onDismiss={() => setShowSignInPrompt(false)}
        onContinueAsGuest={handleContinueAsGuest}
      />
    </PokedexLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Remove all shading effects
  },
});
