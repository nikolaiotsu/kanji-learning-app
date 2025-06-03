import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native';
import { signInWithGoogle, signInWithApple, signUpWithGoogle } from '../services/authService';
import { COLORS } from '../constants/colors';
import { AntDesign, FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';

interface SocialAuthProps {
  mode: 'login' | 'signup';
}

const SocialAuth = ({ mode }: SocialAuthProps) => {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setIsGoogleLoading(true);
    try {
      if (mode === 'signup') {
        console.log('Starting Google OAuth sign-up flow');
        await signUpWithGoogle();
        console.log('Google sign-up flow initiated');
      } else {
        console.log('Starting Google OAuth sign-in flow');
        await signInWithGoogle();
        console.log('Google sign-in flow initiated');
      }
      // The actual auth completion will be handled by the deep linking and AuthContext
    } catch (error: any) {
      console.error(`Google ${mode} error:`, error);
      
      // Show appropriate error message
      const action = mode === 'signup' ? 'Sign Up' : 'Sign In';
      Alert.alert(`Google ${action} Failed`, error.message || 'Please try again');
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
      console.log('Starting Apple OAuth flow');
      await signInWithApple();
      console.log('Apple auth flow initiated');
      // The actual auth completion will be handled by the deep linking and AuthContext
    } catch (error: any) {
      console.error('Apple sign-in error:', error);
      Alert.alert('Apple Sign In Failed', error.message || 'Please try again');
    } finally {
      // Don't set loading to false immediately as the browser will open
      // It will be reset when the component unmounts or when returning to the app
      setTimeout(() => {
        setIsAppleLoading(false);
      }, 5000);
    }
  };
  
  return (
    <View style={styles.container}>
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
});

export default SocialAuth; 