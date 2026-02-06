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
import LoadingVideoScreen from './components/LoadingVideoScreen';
import { LoadingVideoProvider } from './context/LoadingVideoContext';
import { OnboardingVideosProvider } from './context/OnboardingVideosContext';
import { StyleSheet, View, LogBox, Animated } from 'react-native';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import TexturedBackground from './components/shared/TexturedBackground';
import HeaderTexturedBackground from './components/shared/HeaderTexturedBackground';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, useCallback, useRef } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { useOnboarding } from './context/OnboardingContext';
import { initializeSyncManager } from './services/syncManager';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';

import { logger } from './utils/logger';

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
function RootLayoutContent() {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isLoadingVisible, setIsLoadingVisible] = useState(true);
  const [hasContentMounted, setHasContentMounted] = useState(false);
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const fadeInOpacity = useRef(new Animated.Value(0)).current;
  const loadingStartTimeRef = useRef(Date.now());
  const { i18n } = useTranslation();

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
  const { user, isLoading: authLoading } = useAuth();
  const { hasCompletedOnboarding } = useOnboarding();

  // Auth/onboarding ready = we can safely reveal the app (AuthGuard won't show its own spinner)
  const isAuthReady = !authLoading && (user != null || hasCompletedOnboarding != null);

  // Ensure i18n is ready before rendering the app
  useEffect(() => {
    const checkI18nReady = () => {
      if (i18n.isInitialized) {
        logger.log('[RootLayout] i18n is ready, language:', i18n.language);
        setIsAppReady(true);
      } else {
        setTimeout(checkI18nReady, 100);
      }
    };
    checkI18nReady();
  }, [i18n]);

  // When content is ready, fonts loaded, and we've shown the loading screen for at least MIN_LOADING_DISPLAY_MS, fade out
  useEffect(() => {
    if (!hasContentMounted || !isAppReady || !isAuthReady || !fontsLoaded) return;

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
  }, [hasContentMounted, isAppReady, isAuthReady, fontsLoaded, loadingOpacity]);

  const onContentLayout = useCallback(() => {
    if (!hasContentMounted) setHasContentMounted(true);
  }, [hasContentMounted]);

  return (
    <TexturedBackground variant="default" style={styles.container}>
      {isAppReady && fontsLoaded && (
        <View style={styles.container} onLayout={onContentLayout}>
          <OnboardingVideosProvider>
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
                                  presentation: 'modal'
                                }}
                              />
                              <Stack.Screen
                                name="saved-flashcards"
                                options={{
                                  headerShown: false,
                                  gestureEnabled: true,
                                  presentation: 'modal'
                                }}
                              />
                              <Stack.Screen 
                                name="settings" 
                                options={{ 
                                  title: 'Settings',
                                  presentation: 'modal',
                                  gestureEnabled: true,
                                  headerStyle: {
                                    backgroundColor: COLORS.background,
                                  },
                                  headerTintColor: '#FFFFFF',
                                  headerTitleStyle: {
                                    fontFamily: FONTS.sansBold,
                                    fontWeight: 'bold',
                                  },
                                }} 
                              />
                              <Stack.Screen
                                name="badges"
                                options={{
                                  title: 'Your Badges',
                                  gestureEnabled: true,
                                  presentation: 'modal',
                                  headerBackVisible: false,
                                  headerBackground: () => <HeaderTexturedBackground />,
                                  headerTintColor: '#FFFFFF',
                                  headerTitleStyle: {
                                    fontFamily: FONTS.sansBold,
                                    fontWeight: 'bold',
                                  },
                                }}
                              />
                              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-language" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-why" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-faster" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-relevant" options={{ headerShown: false }} />
                              <Stack.Screen name="onboarding-educational" options={{ headerShown: false }} />
                              <Stack.Screen name="login" options={{ title: 'Login', headerShown: false }} />
                              <Stack.Screen name="signup" options={{ title: 'Sign Up', headerShown: false }} />
                              <Stack.Screen name="reset-password" options={{ title: 'Reset Password' }} />
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
      {isLoadingVisible && (
        <Animated.View
          style={[styles.loadingOverlay, { opacity: loadingOpacity }]}
          pointerEvents={hasContentMounted ? 'none' : 'auto'}
        >
          {/* Fade in the video content only - overlay background stays solid */}
          <Animated.View style={{ opacity: fadeInOpacity }}>
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

  // Hide native splash immediately — React has already committed; our loading overlay is in the tree
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={styles.gestureContainer}>
      <SafeAreaProvider>
        <LoadingVideoProvider>
          <AuthProvider>
            <OnboardingProvider>
              <RootLayoutContent />
            </OnboardingProvider>
          </AuthProvider>
        </LoadingVideoProvider>
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
