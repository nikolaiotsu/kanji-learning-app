import './i18n'; // Import i18n configuration FIRST
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './context/AuthContext';
import SettingsProvider from './context/SettingsContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { OCRCounterProvider } from './context/OCRCounterContext';
import { FlashcardCounterProvider } from './context/FlashcardCounterContext';
import AuthGuard from './components/auth/AuthGuard';
import { StyleSheet, View, Text, ActivityIndicator, LogBox } from 'react-native';
import { COLORS } from './constants/colors';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTranslation } from 'react-i18next';
import { initializeSyncManager } from './services/syncManager';

import { logger } from './utils/logger';

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
  const [isI18nReady, setIsI18nReady] = useState(false);
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
        setIsI18nReady(true);
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

  // Show loading screen while i18n is initializing
  if (!isI18nReady) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <SubscriptionProvider>
              <OCRCounterProvider>
                <FlashcardCounterProvider>
                  <AuthGuard>
                <Stack 
                  screenOptions={{
                    headerShown: true,
                    headerStyle: {
                      backgroundColor: COLORS.background,
                    },
                    headerTintColor: COLORS.text,
                    headerTitleStyle: {
                      fontWeight: 'bold',
                    },
                    headerBackTitle: 'Back',
                    contentStyle: {
                      backgroundColor: COLORS.background,
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
                      title: 'Make a Flashcard',
                      gestureEnabled: false,
                    }} 
                  />
                  <Stack.Screen 
                    name="saved-flashcards" 
                    options={{ 
                      headerShown: false,
                      gestureEnabled: false,
                    }} 
                  />
                  <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                  <Stack.Screen name="login" options={{ title: 'Login', headerShown: false }} />
                  <Stack.Screen name="signup" options={{ title: 'Sign Up', headerShown: false }} />
                  <Stack.Screen name="reset-password" options={{ title: 'Reset Password' }} />
                </Stack>
                  </AuthGuard>
                </FlashcardCounterProvider>
              </OCRCounterProvider>
            </SubscriptionProvider>
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});
