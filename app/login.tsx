import React, { useEffect, useState } from 'react';
import LoginScreen from './screens/LoginScreen';
import { supabase } from './services/supabaseClient';
import { router, useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import { useAuth } from './context/AuthContext';

import { logger } from './utils/logger';
const Login = () => {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false);
  
  // Handle OAuth callback parameters
  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check if we have OAuth parameters in the URL
      const hasOAuthParams = params.access_token || params.refresh_token || params.code || params.provider;
      
      logger.log('🔗 Login screen params:', JSON.stringify(params));
      logger.log('🔗 Has OAuth params:', hasOAuthParams);
      
      if (hasOAuthParams) {
        setIsProcessingOAuth(true);
        logger.log('🔗 OAuth callback detected with params:', JSON.stringify(params));
        
        try {
          // If we have access_token directly, set the session
          if (params.access_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token: params.access_token as string,
              refresh_token: (params.refresh_token as string) || '',
            });
            
            if (error) {
              logger.error('🔗 Error setting session from params:', error.message);
            } else if (data.session) {
              logger.log('🔗 Session established from params:', data.session.user?.email);
            }
          }
        } catch (error) {
          logger.error('🔗 Error handling OAuth callback:', error);
        } finally {
          setIsProcessingOAuth(false);
        }
      }
    };
    
    handleOAuthCallback();
  }, [params]);
  
  // Log user state changes, let AuthGuard handle navigation
  useEffect(() => {
    logger.log('🔐 [login.tsx] User state changed, user exists:', !!user);
    if (user) {
      logger.log('✅ [login.tsx] User authenticated, AuthGuard will handle navigation');
      logger.log('🔐 [login.tsx] User email:', user.email);
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
    fontFamily: FONTS.sans,
    marginTop: 20,
    fontSize: 16,
    color: COLORS.text,
  },
});

export default Login; 