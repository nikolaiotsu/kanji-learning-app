import './i18n'; // Import i18n configuration FIRST
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './context/AuthContext';
import SettingsProvider from './context/SettingsContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { OCRCounterProvider } from './context/OCRCounterContext';
import { FlashcardCounterProvider } from './context/FlashcardCounterContext';
import { BadgeProvider } from './context/BadgeContext';
import { SwipeCounterProvider } from './context/SwipeCounterContext';
import AuthGuard from './components/auth/AuthGuard';
import BadgeModalGate from './components/shared/BadgeModalGate';
import { OnboardingProvider } from './context/OnboardingContext';
import { OnboardingProgressProvider } from './context/OnboardingProgressContext';
import LoadingVideoScreen from './components/LoadingVideoScreen';
import { OnboardingVideosProvider } from './context/OnboardingVideosContext';
import { AppReadyProvider } from './context/AppReadyContext';
import { TransitionLoadingProvider, useTransitionLoading } from './context/TransitionLoadingContext';
import { SignInPromptTriggerProvider } from './context/SignInPromptTriggerContext';
import { StyleSheet, View, LogBox, Animated, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import TexturedBackground from './components/shared/TexturedBackground';
import HeaderTexturedBackground from './components/shared/HeaderTexturedBackground';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, useCallback, useRef } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTranslation } from 'react-i18next';
import { useContentPadding } from './hooks/useContentPadding';
import { useAuth } from './context/AuthContext';
import { useOnboarding } from './context/OnboardingContext';
import { initializeSyncManager } from './services/syncManager';
import { configurePurchases } from './services/revenueCatService';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';

import { logger } from './utils/logger';

// Use fullScreenModal on iPad (avoids centered sheet), modal on iPhone (keeps swipe-down to dismiss)
const modalPresentation = Platform.OS === 'ios' && Platform.isPad ? 'fullScreenModal' : 'modal';

// Duration for the fade-in when the loading video first appears (ms)
const LOADING_FADE_IN_DURATION = 350;
// Duration for the fade-out animation of the loading overlay (ms)
const LOADING_FADE_DURATION = 400;
// Delay after content mounts before starting fade (allows content to fully render)
const CONTENT_RENDER_DELAY = 100;
// Minimum time to show the loading animation for a premium intro feel (ms)
const MIN_LOADING_DISPLAY_MS = 2500;

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors - splash screen may already be hidden
});

// Suppress network error warnings in the console when offline
// These are expected and handled gracefully in our code
LogBox.ignoreLogs([
  'Network request failed',
  'Failed to fetch',
  'NetworkError',
  'Could not connect to the server',
]);

// Suppress console.error for network errors
const originalConsoleError = console.error;
console.error = (...args) => {
  const errorString = args.join(' ').toLowerCase();
  // Suppress network-related errors that we handle gracefully
  if (
    errorString.includes('network request failed') ||
    errorString.includes('failed to fetch') ||
    errorString.includes('networkerror')
  ) {
    // Silently ignore - these are expected when offline
    return;
  }
  // Log all other errors normally
  originalConsoleError(...args);
};

// Inner layout: waits for auth + onboarding so we never show AuthGuard's spinner.
// One loading screen (video) then one clean fade to the app.
const POST_ONBOARDING_LOADING_MS = 2500;

function RootLayoutContent() {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isLoadingVisible, setIsLoadingVisible] = useState(true);
  const [hasContentMounted, setHasContentMounted] = useState(false);
  const [showTransitionOverlay, setShowTransitionOverlay] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [onboardingVideosReady, setOnboardingVideosReady] = useState(false);
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const fadeInOpacity = useRef(new Animated.Value(0)).current;
  const transitionOpacity = useRef(new Animated.Value(0)).current;
  const loadingStartTimeRef = useRef(Date.now());
  const { i18n } = useTranslation();
  const { showTransitionLoading, setShowTransitionLoading } = useTransitionLoading();
  const { paddingHorizontal } = useContentPadding();

  // Hide native splash and only then show our loading overlay so the app icon
  // (with the memo/scanner graphic) never overlaps the loading video
  useEffect(() => {
    (async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Splash may already be hidden
      }
      setSplashHidden(true);
    })();
  }, []);

  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });


  // Fade in the loading overlay as soon as it's shown
  useEffect(() => {
    Animated.timing(fadeInOpacity, {
      toValue: 1,
      duration: LOADING_FADE_IN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [fadeInOpacity]);

  // When onboarding sets "transition loading", show overlay with video
  useEffect(() => {
    if (showTransitionLoading) {
      setShowTransitionOverlay(true);
      transitionOpacity.setValue(1);
    }
  }, [showTransitionLoading, transitionOpacity]);

  // Safety: when transition overlay is shown (e.g. Launch Onboarding), force dismiss after 6.5s
  // in case onVideosReady never fires (e.g. provider unmounts when navigating from modal).
  useEffect(() => {
    if (!showTransitionLoading) return;
    const safety = setTimeout(() => {
      setShowTransitionLoading(false);
    }, 6500);
    return () => clearTimeout(safety);
  }, [showTransitionLoading, setShowTransitionLoading]);

  // When transition loading is dismissed, fade out then hide
  useEffect(() => {
    if (!showTransitionLoading && showTransitionOverlay) {
      Animated.timing(transitionOpacity, {
        toValue: 0,
        duration: LOADING_FADE_DURATION,
        useNativeDriver: true,
      }).start(() => setShowTransitionOverlay(false));
    }
  }, [showTransitionLoading, showTransitionOverlay, transitionOpacity]);

  const { user, isLoading: authLoading } = useAuth();
  const { hasCompletedOnboarding } = useOnboarding();

  // Auth/onboarding ready = we can safely reveal the app (AuthGuard won't show its own spinner)
  const isAuthReady = !authLoading && (user != null || hasCompletedOnboarding != null);
  const isFirstTimeUser = hasCompletedOnboarding === false;

  // Ensure i18n is ready before rendering the app (with cleanup and max wait to avoid runaway polling)
  useEffect(() => {
    const POLL_INTERVAL_MS = 100;
    const MAX_WAIT_MS = 5000;
    const startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkI18nReady = () => {
      if (i18n.isInitialized) {
        logger.log('[RootLayout] i18n is ready, language:', i18n.language);
        setIsAppReady(true);
        return;
      }
      if (Date.now() - startTime >= MAX_WAIT_MS) {
        logger.warn('[RootLayout] i18n not ready after max wait, proceeding anyway');
        setIsAppReady(true);
        return;
      }
      timeoutId = setTimeout(checkI18nReady, POLL_INTERVAL_MS);
    };
    checkI18nReady();

    return () => {
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [i18n]);

  // When content is ready, fonts loaded, and we've shown the loading screen for at least MIN_LOADING_DISPLAY_MS, fade out.
  // For first-time users: also wait for onboarding videos to be preloaded so they appear instantly on the first screen.
  useEffect(() => {
    if (!hasContentMounted || !isAppReady || !isAuthReady || !fontsLoaded) return;
    if (isFirstTimeUser && !onboardingVideosReady) return;

    const elapsed = Date.now() - loadingStartTimeRef.current;
    const remaining = Math.max(0, MIN_LOADING_DISPLAY_MS - elapsed);

    const timer = setTimeout(() => {
      Animated.timing(loadingOpacity, {
        toValue: 0,
        duration: LOADING_FADE_DURATION,
        useNativeDriver: true,
      }).start(() => {
        setIsLoadingVisible(false);
      });
    }, CONTENT_RENDER_DELAY + remaining);

    return () => clearTimeout(timer);
  }, [hasContentMounted, isAppReady, isAuthReady, fontsLoaded, isFirstTimeUser, onboardingVideosReady, loadingOpacity]);

  const onContentLayout = useCallback(() => {
    if (!hasContentMounted) setHasContentMounted(true);
  }, [hasContentMounted]);

  return (
    <TexturedBackground variant="default" style={styles.container}>
      <AppReadyProvider isSplashVisible={isLoadingVisible}>
      {isAppReady && fontsLoaded && (
        <View style={styles.container} onLayout={onContentLayout}>
          <OnboardingVideosProvider onVideosReady={() => { setOnboardingVideosReady(true); setShowTransitionLoading(false); }}>
          <SettingsProvider>
                      <SubscriptionProvider>
                        <OCRCounterProvider>
                          <FlashcardCounterProvider>
                            <BadgeProvider>
                              <SwipeCounterProvider>
                              <AuthGuard>
                            <>
                            <Stack
                              screenOptions={{
                                headerShown: true,
                                headerStyle: {
                                  backgroundColor: 'transparent',
                                },
                                headerTintColor: COLORS.text,
                                headerTitleStyle: {
                                  fontFamily: FONTS.sansBold,
                                  fontWeight: 'bold',
                                },
                                headerBackTitle: 'Back',
                                contentStyle: {
                                  backgroundColor: 'transparent',
                                },
                                // Add border and shadow to make headers pop
                                headerShadowVisible: true,
                              }}
                            >
                              <Stack.Screen name="(screens)" options={{ headerShown: false }} />
                              <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
                              <Stack.Screen
                                name="flashcards"
                                options={{
                                  headerShown: false,
                                  gestureEnabled: true,
                                  presentation: modalPresentation
                                }}
                              />
                              <Stack.Screen
                                name="saved-flashcards"
                                options={{
                                  headerShown: false,
                                  gestureEnabled: true,
                                  presentation: modalPresentation
                                }}
                              />
                              <Stack.Screen 
                                name="settings" 
                                options={({ navigation }) => ({ 
                                  title: 'Settings',
                                  presentation: modalPresentation,
                                  gestureEnabled: true,
                                  headerLeft: modalPresentation === 'fullScreenModal' ? () => (
                                    <TouchableOpacity
                                      onPress={() => navigation.goBack()}
                                      style={{ marginLeft: 8, padding: 8 }}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                      <Ionicons name="close" size={28} color="#FFFFFF" />
                                    </TouchableOpacity>
                                  ) : undefined,
                                  headerStyle: {
                                    backgroundColor: COLORS.background,
                                  },
                                  headerTintColor: '#FFFFFF',
                                  headerTitleStyle: {
                                    fontFamily: FONTS.sansBold,
                                    fontWeight: 'bold',
                                  },
                                })} 
                              />
                              <Stack.Screen
                                name="badges"
                                options={({ navigation }) => ({
                                  title: 'Your Badges',
                                  gestureEnabled: true,
                                  presentation: modalPresentation,
                                  headerBackVisible: false,
                                  headerLeft: modalPresentation === 'fullScreenModal' ? () => (
                                    <TouchableOpacity
                                      onPress={() => navigation.goBack()}
                                      style={{ marginLeft: 8, padding: 8 }}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                      <Ionicons name="close" size={28} color="#FFFFFF" />
                                    </TouchableOpacity>
                                  ) : undefined,
                                  headerBackground: () => <HeaderTexturedBackground />,
                                  headerTintColor: '#FFFFFF',
                                  headerTitleStyle: {
                                    fontFamily: FONTS.sansBold,
                                    fontWeight: 'bold',
                                  },
                                })}
                              />
                              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-language" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-why" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-time" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-faster" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-relevant" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-educational" options={{ headerShown: false }} />
                              <Stack.Screen name="login" options={{ title: 'Login', headerShown: false }} />
                              <Stack.Screen name="signup" options={{ title: 'Sign Up', headerShown: false }} />
                            </Stack>
                            <BadgeModalGate />
                            </>
                          </AuthGuard>
                        </SwipeCounterProvider>
                            </BadgeProvider>
                      </FlashcardCounterProvider>
                    </OCRCounterProvider>
                  </SubscriptionProvider>
                </SettingsProvider>
                </OnboardingVideosProvider>
            </View>
          )}
      </AppReadyProvider>
      {splashHidden && (isLoadingVisible || showTransitionOverlay) && (
        <Animated.View
          style={[
            styles.loadingOverlay,
            { opacity: showTransitionOverlay ? transitionOpacity : loadingOpacity },
          ]}
          pointerEvents={hasContentMounted && !showTransitionOverlay ? 'none' : 'auto'}
        >
          <Animated.View style={[{ opacity: fadeInOpacity }, { paddingHorizontal }]}>
            <LoadingVideoScreen compact />
          </Animated.View>
        </Animated.View>
      )}
    </TexturedBackground>
  );
}

export default function RootLayout() {
  // Initialize WebBrowser to handle OAuth redirects
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  useEffect(() => {
    const lockOrientation = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch (error) {
        logger.warn('Failed to lock orientation:', error);
      }
    };
    lockOrientation();
  }, []);

  useEffect(() => {
    const unsubscribe = initializeSyncManager();
    return () => unsubscribe();
  }, []);

  // Initialize RevenueCat SDK early (before subscription-dependent UI)
  useEffect(() => {
    configurePurchases().catch((err) => {
      logger.warn('[RootLayout] RevenueCat configure failed:', err);
    });
  }, []);

  return (
    <GestureHandlerRootView style={styles.gestureContainer}>
      <SafeAreaProvider>
        <AuthProvider>
          <SignInPromptTriggerProvider>
            <OnboardingProvider>
              <OnboardingProgressProvider>
                <TransitionLoadingProvider>
                  <RootLayoutContent />
                </TransitionLoadingProvider>
              </OnboardingProgressProvider>
            </OnboardingProvider>
          </SignInPromptTriggerProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gestureContainer: {
    flex: 1,
  },
  // Loading overlay covers the entire screen and sits on top of content
  // Uses absolute positioning so content can render behind it
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1628', // Match splash screen color exactly
    zIndex: 100,
  },
});
