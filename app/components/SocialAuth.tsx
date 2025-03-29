import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { supabase } from '../services/supabaseClient';

interface SocialAuthProps {
  mode: 'login' | 'signup';
}

const SocialAuth = ({ mode }: SocialAuthProps) => {
  const handleGoogleSignIn = async () => {
    try {
      // This will trigger the Google OAuth flow
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'kanjiapp://login', // Make sure this matches your app's scheme
        }
      });
      
      if (error) throw error;
    } catch (error: any) {
      Alert.alert('Google Sign In Failed', error.message || 'Please try again');
    }
  };
  
  const handleAppleSignIn = async () => {
    try {
      // This will trigger the Apple OAuth flow
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: 'kanjiapp://login', // Make sure this matches your app's scheme
        }
      });
      
      if (error) throw error;
    } catch (error: any) {
      Alert.alert('Apple Sign In Failed', error.message || 'Please try again');
    }
  };
  
  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.button, styles.googleButton]}
        onPress={handleGoogleSignIn}
      >
        <Text style={styles.googleButtonText}>
          {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.button, styles.appleButton]}
        onPress={handleAppleSignIn}
      >
        <Text style={styles.appleButtonText}>
          {mode === 'login' ? 'Continue with Apple' : 'Sign up with Apple'}
        </Text>
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
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  googleButtonText: {
    color: '#444',
    fontWeight: '500',
    fontSize: 16,
  },
  appleButton: {
    backgroundColor: '#000',
  },
  appleButtonText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 16,
  },
});

export default SocialAuth; 