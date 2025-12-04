import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { useSegments, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useNetworkState } from '../../services/networkManager';
import { COLORS } from '../../constants/colors';

import { logger } from '../../utils/logger';
// Protected routes (require authentication)
const PROTECTED_SEGMENTS = ['flashcards', 'saved-flashcards', '(screens)'];

// Auth routes (accessible only when not authenticated)
const AUTH_SEGMENTS = ['login', 'signup', 'reset-password'];

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, isOfflineMode } = useAuth();
  const { isConnected } = useNetworkState();
  const segments = useSegments();
  const router = useRouter();
  
  // Track if loading has taken too long (show helpful message)
  const [showSlowLoadingMessage, setShowSlowLoadingMessage] = useState(false);

  // Current route segment (first part of the path)
  const currentSegment = segments[0];

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

    // User is authenticated but tries to access auth routes (login, signup)
    if (user && AUTH_SEGMENTS.includes(currentSegment)) {
      logger.log('🔐 [AuthGuard] User authenticated, redirecting from auth route to /');
      router.replace('/');
      return;
    }

    // User is not authenticated but tries to access protected routes
    if (!user && PROTECTED_SEGMENTS.includes(currentSegment)) {
      logger.log('🔐 [AuthGuard] User not authenticated, redirecting to /login');
      router.replace('/login');
      return;
    }

    // If no segment is specified and user is not authenticated
    if (!user && !currentSegment) {
      logger.log('🔐 [AuthGuard] No segment and no user, redirecting to /login');
      router.replace('/login');
      return;
    }
    
    logger.log('🔐 [AuthGuard] No navigation needed');
  }, [user, isLoading, currentSegment, isOfflineMode]);

  // Show loading screen while checking authentication
  if (isLoading) {
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
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// Add default export to satisfy Expo Router's requirement
export default AuthGuard; 