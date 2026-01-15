import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator, Platform, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { signInWithGoogle, signInWithApple, signUpWithGoogle } from '../services/authService';
import { COLORS } from '../constants/colors';
import { AntDesign, FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import appleAuth from '@invertase/react-native-apple-authentication';

import { logger } from '../utils/logger';
interface SocialAuthProps {
  mode: 'login' | 'signup';
}

const SocialAuth = ({ mode }: SocialAuthProps) => {
  const { t } = useTranslation();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isAppleSignInSupported, setIsAppleSignInSupported] = useState(false);
  const [isCheckingAppleSupport, setIsCheckingAppleSupport] = useState(true);
  
  // Animated values for smooth fade-in (both buttons fade in together)
  const googleButtonOpacity = useRef(new Animated.Value(0)).current;
  const appleButtonOpacity = useRef(new Animated.Value(0)).current;

  // Check Apple Sign In availability on component mount
  useEffect(() => {
    const checkAppleSignInSupport = async () => {
      if (Platform.OS === 'ios') {
        try {
          const isSupported = await appleAuth.isSupported;
          setIsAppleSignInSupported(isSupported);
          logger.log('🍎 Apple Sign In availability checked:', isSupported);
        } catch (error) {
          logger.warn('🍎 Could not check Apple Sign In support:', error);
          setIsAppleSignInSupported(false);
        }
      } else {
        // Apple Sign In via web OAuth is available on all platforms
        setIsAppleSignInSupported(true);
      }
      setIsCheckingAppleSupport(false);
    };

    checkAppleSignInSupport();
  }, []);

  // Animate both buttons in together when check is complete
  useEffect(() => {
    if (!isCheckingAppleSupport) {
      // Fade in both buttons simultaneously for professional look
      Animated.parallel([
        Animated.timing(googleButtonOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(appleButtonOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isCheckingAppleSupport]);

  const handleGoogleAuth = async () => {
    setIsGoogleLoading(true);
    try {
      if (mode === 'signup') {
        logger.log('Starting Google OAuth sign-up flow');
        await signUpWithGoogle();
        logger.log('Google sign-up flow initiated');
      } else {
        logger.log('Starting Google OAuth sign-in flow');
        await signInWithGoogle();
        logger.log('Google sign-in flow initiated');
      }
      // The actual auth completion will be handled by the deep linking and AuthContext
    } catch (error: any) {
      logger.error(`Google ${mode} error:`, error);
      
      // Show appropriate error message
      const actionKey = mode === 'signup' ? 'auth.social.googleSignUpFailed' : 'auth.social.googleSignInFailed';
      Alert.alert(t(actionKey), error.message || t('auth.social.pleaseTryAgain'));
    } finally {
      // Don't set loading to false immediately as the browser will open
      // It will be reset when the component unmounts or when returning to the app
      setTimeout(() => {
        setIsGoogleLoading(false);
      }, 5000);
    }
  };
  
  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      logger.log('🍎 Starting Apple Sign In flow from UI...');
      await signInWithApple();
      logger.log('🍎 Apple Sign In flow completed');
      // The actual auth completion will be handled by the AuthContext
    } catch (error: any) {
      logger.error('🍎 Apple Sign In UI error:', error);
      
      // Handle specific Apple Sign In errors
      if (error.message?.includes('cancelled')) {
        // User cancelled - don't show error alert
        logger.log('🍎 User cancelled Apple Sign In');
      } else if (error.message?.includes('not available')) {
        Alert.alert(
          t('auth.social.appleSignInUnavailable'), 
          t('auth.social.appleSignInUnavailableMessage')
        );
      } else {
        Alert.alert(t('auth.social.appleSignInFailed'), error.message || t('auth.social.pleaseTryAgain'));
      }
    } finally {
      // Reset loading state
      // For native Apple Sign In, this happens immediately
      // For web OAuth, we give it some time as browser opens
      const resetDelay = Platform.OS === 'ios' && isAppleSignInSupported ? 1000 : 5000;
      setTimeout(() => {
        setIsAppleLoading(false);
      }, resetDelay);
    }
  };
  
  return (
    <View style={styles.container}>
      {isCheckingAppleSupport ? (
        // Show placeholders for both buttons while checking - prevents layout shift
        <>
          <View style={[styles.button, styles.buttonPlaceholder]}>
            <ActivityIndicator color={COLORS.lightGray} size="small" />
          </View>
          <View style={[styles.button, styles.buttonPlaceholder]}>
            <ActivityIndicator color={COLORS.lightGray} size="small" />
          </View>
        </>
      ) : (
        // Fade in both buttons simultaneously for smooth, synchronized appearance
        <>
          <Animated.View style={{ opacity: googleButtonOpacity }}>
            <TouchableOpacity 
              style={[styles.button, styles.googleButton]}
              onPress={handleGoogleAuth}
              disabled={isGoogleLoading || isAppleLoading}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color="#4285F4" size="small" />
              ) : (
                <>
                  <AntDesign name="google" size={20} color="#4285F4" style={styles.buttonIcon} />
                  <Text style={styles.googleButtonText}>
                    {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
          
          {isAppleSignInSupported && (
            <Animated.View style={{ opacity: appleButtonOpacity }}>
              <TouchableOpacity 
                style={[styles.button, styles.appleButton]}
                onPress={handleAppleSignIn}
                disabled={isAppleLoading || isGoogleLoading}
              >
                {isAppleLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <AntDesign name="apple1" size={20} color="white" style={styles.buttonIcon} />
                    <Text style={styles.appleButtonText}>
                      {mode === 'login' ? 'Continue with Apple' : 'Sign up with Apple'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 10,
  },
  button: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginVertical: 8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 10,
  },
  googleButton: {
    backgroundColor: COLORS.darkSurface,
    borderWidth: 1,
    borderColor: COLORS.darkGray,
  },
  googleButtonText: {
    color: COLORS.text,
    fontWeight: '500',
    fontSize: 16,
  },
  appleButton: {
    backgroundColor: 'black',
    borderWidth: 1,
    borderColor: COLORS.darkGray,
  },
  appleButtonText: {
    color: COLORS.text,
    fontWeight: '500',
    fontSize: 16,
  },
  buttonPlaceholder: {
    backgroundColor: COLORS.darkSurface,
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    opacity: 0.5,
  },
});

export default SocialAuth; 