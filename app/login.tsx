import React, { useEffect, useState } from 'react';
import LoginScreen from './screens/LoginScreen';
import { supabase } from './services/supabaseClient';
import { router, useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { COLORS } from './constants/colors';
import { useAuth } from './context/AuthContext';

const Login = () => {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false);
  
  // Handle OAuth callback parameters
  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check if we have OAuth parameters in the URL
      const hasOAuthParams = params.access_token || params.refresh_token || params.code || params.provider;
      
      console.log('🔗 Login screen params:', JSON.stringify(params));
      console.log('🔗 Has OAuth params:', hasOAuthParams);
      
      if (hasOAuthParams) {
        setIsProcessingOAuth(true);
        console.log('🔗 OAuth callback detected with params:', JSON.stringify(params));
        
        try {
          // If we have access_token directly, set the session
          if (params.access_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token: params.access_token as string,
              refresh_token: (params.refresh_token as string) || '',
            });
            
            if (error) {
              console.error('🔗 Error setting session from params:', error.message);
            } else if (data.session) {
              console.log('🔗 Session established from params:', data.session.user?.email);
            }
          }
        } catch (error) {
          console.error('🔗 Error handling OAuth callback:', error);
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
      console.log('✅ User authenticated, redirecting to home');
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