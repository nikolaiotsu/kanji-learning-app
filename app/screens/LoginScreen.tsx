import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import SocialAuth from '../components/SocialAuth';
import { supabase } from '../services/supabaseClient';
import { COLORS } from '../constants/colors';
import PokedexLayout from '../components/shared/PokedexLayout';

// Import the logo image
const worddexLogo = require('../../assets/images/worddexlogo.png');

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    console.log('🔐 [LoginScreen] Starting email login process...');
    console.log('🔐 [LoginScreen] Email:', email);
    console.log('🔐 [LoginScreen] Password length:', password.length);
    
    if (!email || !password) {
      console.log('❌ [LoginScreen] Missing credentials');
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    
    setLoading(true);
    try {
      console.log('🔐 [LoginScreen] Calling signIn function...');
      await signIn(email, password);
      console.log('✅ [LoginScreen] signIn completed successfully');
      console.log('🔐 [LoginScreen] Authentication successful, letting AuthGuard handle navigation...');
    } catch (error: any) {
      console.error('❌ [LoginScreen] Login error:', error);
      console.error('❌ [LoginScreen] Error message:', error.message);
      console.error('❌ [LoginScreen] Error details:', JSON.stringify(error));
      if (error.message && error.message.includes('Email not confirmed')) {
        Alert.alert(
          'Email Not Verified',
          'Please check your inbox and click the verification link to activate your account. Need a new link?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Resend Link', 
              onPress: () => resendVerificationEmail(email)
            }
          ]
        );
      } else {
        Alert.alert('Login Failed', error.message || 'Failed to login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resendVerificationEmail = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
      
      if (error) throw error;
      
      Alert.alert(
        'Verification Email Sent',
        'We\'ve sent a new verification link to your email address. Please check your inbox.'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend verification email.');
    }
  };

  const navigateToSignUp = () => {
    router.push('/signup');
  };

  const navigateToResetPassword = () => {
    router.push('/reset-password');
  };

  return (
    <PokedexLayout 
      logoSource={worddexLogo}
      logoStyle={{ 
        width: 80,
        height: 65,
        right: 10,
        top: 0
      }}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Hello Collector.</Text>
        
        <View style={styles.newUserContainer}>
          <Text style={styles.newUserText}>New to the app?</Text>
          <TouchableOpacity 
            style={styles.signUpButton} 
            onPress={navigateToSignUp}
          >
            <Text style={styles.signUpButtonText}>Create Account</Text>
          </TouchableOpacity>
        </View>
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#A0A0A0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#A0A0A0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        
        <TouchableOpacity 
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </TouchableOpacity>
        
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>
        
        <SocialAuth mode="login" />
        
        <View style={styles.links}>
          <TouchableOpacity onPress={navigateToResetPassword}>
            <Text style={styles.link}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </PokedexLayout>
  );
};

const styles = StyleSheet.create({
  form: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: COLORS.text,
  },
  newUserContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    backgroundColor: COLORS.darkSurface,
    padding: 15,
    borderRadius: 8,
  },
  newUserText: {
    fontSize: 16,
    marginRight: 10,
    color: COLORS.text,
  },
  signUpButton: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  signUpButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: COLORS.darkSurface,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  links: {
    marginTop: 20,
    alignItems: 'center',
  },
  link: {
    color: COLORS.lightGray,
    fontSize: 14,
    marginVertical: 5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.darkGray,
  },
  dividerText: {
    marginHorizontal: 10,
    color: COLORS.text,
  },
});

export default LoginScreen; 