import './i18n'; // Import i18n configuration FIRST
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './context/AuthContext';
import SettingsProvider from './context/SettingsContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { OCRCounterProvider } from './context/OCRCounterContext';
import { FlashcardCounterProvider } from './context/FlashcardCounterContext';
import { SwipeCounterProvider } from './context/SwipeCounterContext';
import AuthGuard from './components/auth/AuthGuard';
import { StyleSheet, View, Text, ActivityIndicator, LogBox } from 'react-native';
import { COLORS } from './constants/colors';
import TexturedBackground from './components/shared/TexturedBackground';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, useCallback } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTranslation } from 'react-i18next';
import { initializeSyncManager } from './services/syncManager';
import * as SplashScreen from 'expo-splash-screen';

import { logger } from './utils/logger';

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

export default function RootLayout() {
  const [isAppReady, setIsAppReady] = useState(false);
  const { i18n } = useTranslation();

  // Initialize WebBrowser to handle OAuth redirects
  useEffect(() => {
    // This enables redirect handling for Google and Apple auth
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  // Lock orientation to portrait on app start
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

  // Ensure i18n is ready before rendering the app
  useEffect(() => {
    const checkI18nReady = () => {
      if (i18n.isInitialized) {
        logger.log('[RootLayout] i18n is ready, language:', i18n.language);
        setIsAppReady(true);
      } else {
        logger.log('[RootLayout] i18n not ready, waiting...');
        // Retry after a short delay
        setTimeout(checkI18nReady, 100);
      }
    };
    
    checkI18nReady();
  }, [i18n]);

  // Initialize sync manager for offline support
  useEffect(() => {
    const unsubscribe = initializeSyncManager();
    
    return () => {
      unsubscribe();
    };
  }, []);

  // Hide splash screen once the app is ready and layout is complete
  const onLayoutRootView = useCallback(async () => {
    if (isAppReady) {
      // Add a small delay to ensure layout is stable before hiding splash
      await new Promise(resolve => setTimeout(resolve, 50));
      await SplashScreen.hideAsync();
    }
  }, [isAppReady]);

  // Keep SafeAreaProvider and GestureHandlerRootView always mounted
  // to prevent layout shifts when safe area insets are calculated
  return (
    <GestureHandlerRootView style={styles.gestureContainer}>
      <SafeAreaProvider>
        <TexturedBackground variant="default" style={styles.container}>
          {!isAppReady ? (
            // Loading state - keep same background and structure
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : (
            <View style={styles.container} onLayout={onLayoutRootView}>
              <AuthProvider>
                <SettingsProvider>
                  <SubscriptionProvider>
                    <OCRCounterProvider>
                      <FlashcardCounterProvider>
                        <SwipeCounterProvider>
                          <AuthGuard>
                            <Stack
                              screenOptions={{
                                headerShown: true,
                                headerStyle: {
                                  backgroundColor: 'transparent',
                                },
                                headerTintColor: COLORS.text,
                                headerTitleStyle: {
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
                                  gestureEnabled: true
                                }} 
                              />
                              <Stack.Screen name="login" options={{ title: 'Login', headerShown: false }} />
                              <Stack.Screen name="signup" options={{ title: 'Sign Up', headerShown: false }} />
                              <Stack.Screen name="reset-password" options={{ title: 'Reset Password' }} />
                            </Stack>
                          </AuthGuard>
                        </SwipeCounterProvider>
                      </FlashcardCounterProvider>
                    </OCRCounterProvider>
                  </SubscriptionProvider>
                </SettingsProvider>
              </AuthProvider>
            </View>
          )}
        </TexturedBackground>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // No background color - let TexturedBackground show through
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});
