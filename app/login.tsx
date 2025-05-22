import React, { useEffect, useState } from 'react';
import LoginScreen from './screens/LoginScreen';
import { supabase } from './services/supabaseClient';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { COLORS } from './constants/colors';
import { useAuth } from './context/AuthContext';
import * as Linking from 'expo-linking';

const Login = () => {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false);
  const segments = useSegments();
  
  // Handle deep links and URL parameters for OAuth callbacks
  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check if we're in the middle of an OAuth callback
      const hasOAuthParams = params.access_token || params.refresh_token || params.code || params.provider;
      
      if (hasOAuthParams) {
        setIsProcessingOAuth(true);
        console.log('OAuth callback detected with params:', JSON.stringify(params));
        
        try {
          // Get the current URL to extract auth parameters
          const url = await Linking.getInitialURL();
          console.log('Initial URL:', url);
          
          if (url) {
            // The session will be automatically set by Supabase's internal handlers
            const { data, error } = await supabase.auth.getSession();
            console.log('Session after OAuth:', data?.session ? 'Available' : 'Not available');
            
            if (error) {
              console.error('Error getting session:', error.message);
            }
          }
        } catch (error) {
          console.error('Error handling OAuth callback:', error);
        } finally {
          setIsProcessingOAuth(false);
        }
      }
    };
    
    handleOAuthCallback();
  }, [params]);
  
  // If already authenticated, redirect to home
  useEffect(() => {
    if (user) {
      console.log('User authenticated, redirecting to home');
      router.replace('/(tabs)');
    }
  }, [user]);
  
  // Show loading indicator if processing OAuth callback
  if (isProcessingOAuth) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Completing sign in...</Text>
      </View>
    );
  }
  
  return <LoginScreen />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: COLORS.text,
  },
});

export default Login; 