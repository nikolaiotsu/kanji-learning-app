import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import SocialAuth from '../components/SocialAuth';
import PokedexLayout from '../components/shared/PokedexLayout';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';

import { logger } from '../utils/logger';
const SignupScreen = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSignup = async () => {
    // Validate inputs
    if (!email || !password || !confirmPassword) {
      Alert.alert(t('common.error'), t('auth.signup.fillAllFields'));
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.signup.passwordsMismatch'));
      return;
    }
    
    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.signup.passwordTooShort'));
      return;
    }
    
    setLoading(true);
    try {
      logger.log('🔐 [SignupScreen] Starting signup for:', email);
      const result = await signUp(email, password);
      logger.log('🔐 [SignupScreen] Signup result:', {
        user: !!result?.user,
        session: !!result?.session
      });
      
      if (result?.session) {
        logger.log('✅ [SignupScreen] User signed up and logged in');
        Alert.alert(
          'Welcome to WordDex!',
          'Your account has been created successfully. You are now logged in and ready to start learning!',
          [
            { 
              text: t('common.ok')
            }
          ]
        );
      }
    } catch (error: any) {
      logger.error('❌ [SignupScreen] Signup error:', error);
      
      // Handle specific signup errors
      if (error.message && error.message.includes('User already registered')) {
        Alert.alert(
          t('auth.signup.accountExists'), 
          t('auth.signup.accountExistsMessage'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('auth.signup.goToLogin'), onPress: () => router.replace('/login') }
          ]
        );
      } else if (error.message && error.message.includes('already registered')) {
        Alert.alert(
          'Account Already Exists', 
          'This email is already registered. Please sign in instead.',
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('auth.signup.goToLogin'), onPress: () => router.replace('/login') }
          ]
        );
      } else {
        Alert.alert(
          t('auth.signup.registrationFailed'), 
          error.message || 'Failed to create account. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const navigateToLogin = () => {
    router.push('/login');
  };

  return (
    <PokedexLayout>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.form}>
          <Text style={styles.title}>{t('auth.signup.title')}</Text>
          
          <Text style={styles.subtitle}>
            {t('auth.signup.subtitle')}
          </Text>
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.signup.signupWith')}</Text>
            <View style={styles.dividerLine} />
          </View>
          
          {/* Social authentication options */}
          <SocialAuth mode="signup" />
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.signup.orWithEmail')}</Text>
            <View style={styles.dividerLine} />
          </View>
          
          <TextInput
            style={styles.input}
            placeholder={t('auth.login.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          
          <TextInput
            style={styles.input}
            placeholder={t('auth.login.passwordPlaceholder')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          
          <TextInput
            style={styles.input}
            placeholder={t('auth.signup.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <Text style={styles.passwordHint}>
            {t('auth.signup.passwordHint')}
          </Text>
          
          <TouchableOpacity 
            style={styles.button}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('auth.signup.createAccountButton')}</Text>
            )}
          </TouchableOpacity>
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('common.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity 
            style={styles.loginButton}
            onPress={navigateToLogin}
          >
            <Text style={styles.loginButtonText}>{t('auth.signup.loginExisting')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </PokedexLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  form: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontFamily: FONTS.sans,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
    fontSize: 16,
  },
  input: {
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  passwordHint: {
    fontFamily: FONTS.sans,
    color: '#666',
    fontSize: 12,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    fontFamily: FONTS.sans,
    marginHorizontal: 10,
    color: '#666',
  },
  loginButton: {
    borderWidth: 1,
    borderColor: '#007BFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  loginButtonText: {
    fontFamily: FONTS.sansMedium,
    color: '#007BFF',
    fontSize: 16,
    fontWeight: '500',
  },
  links: {
    marginTop: 20,
    alignItems: 'center',
  },
  link: {
    fontFamily: FONTS.sans,
    color: '#007BFF',
    fontSize: 14,
    marginVertical: 5,
  },
});

export default SignupScreen; 