import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useSegments, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

// Protected routes (require authentication)
const PROTECTED_SEGMENTS = ['flashcards', 'saved-flashcards', '(screens)'];

// Auth routes (accessible only when not authenticated)
const AUTH_SEGMENTS = ['login', 'signup', 'reset-password'];

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Current route segment (first part of the path)
  const currentSegment = segments[0];

  useEffect(() => {
    if (isLoading) return;

    // User is authenticated but tries to access auth routes (login, signup)
    if (user && AUTH_SEGMENTS.includes(currentSegment)) {
      router.replace('/');
      return;
    }

    // User is not authenticated but tries to access protected routes
    if (!user && PROTECTED_SEGMENTS.includes(currentSegment)) {
      router.replace('/login');
      return;
    }

    // If no segment is specified and user is not authenticated
    if (!user && !currentSegment) {
      router.replace('/login');
      return;
    }
  }, [user, isLoading, currentSegment]);

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007BFF" />
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
  },
});

// Add default export to satisfy Expo Router's requirement
export default AuthGuard; 