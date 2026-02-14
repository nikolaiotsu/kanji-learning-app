import React, { useState, useRef } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import { router } from 'expo-router';
import SocialAuth from '../components/SocialAuth';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import PokedexLayout from '../components/shared/PokedexLayout';

import { logger } from '../utils/logger';
import { isValidEmailFormat } from '../utils/validation';

const worddexLogo = require('../../assets/images/worddexlogo.png');

const LoginScreen = () => {
  const { t } = useTranslation();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const { setHasCompletedOnboarding } = useOnboarding();

  const scrollViewRef = useRef<ScrollView>(null);
  const [emailInputY, setEmailInputY] = useState(0);
  const [passwordInputY, setPasswordInputY] = useState(0);

  const clearFormError = () => setFormError(null);

  const scrollToInput = (inputY: number, padding = 100) => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(0, inputY - padding),
      animated: true,
    });
  };

  const handleLogin = async () => {
    logger.log('🔐 [LoginScreen] Starting email login process...');
    logger.log('🔐 [LoginScreen] Email:', email);
    logger.log('🔐 [LoginScreen] Password length:', password.length);

    setFormError(null);

    if (!email || !password) {
      logger.log('❌ [LoginScreen] Missing credentials');
      Alert.alert(t('common.error'), t('auth.login.missingCredentials'));
      return;
    }

    if (!isValidEmailFormat(email)) {
      setFormError(t('auth.login.invalidEmailFormat'));
      return;
    }

    setLoading(true);
    try {
      logger.log('🔐 [LoginScreen] Calling signIn function...');
      await signIn(email, password);
      logger.log('✅ [LoginScreen] signIn completed successfully');
      logger.log('🔐 [LoginScreen] Authentication successful, letting AuthGuard handle navigation...');
    } catch (error: any) {
      logger.error('❌ [LoginScreen] Login error:', error);
      const message = typeof error?.message === 'string' ? error.message : String(error ?? '');

      // Invalid credentials (wrong password or no account): show inline, no modal
      const lower = message.toLowerCase();
      if (
        message.includes('Invalid login credentials') ||
        (lower.includes('invalid') && lower.includes('credential'))
      ) {
        setFormError(t('auth.login.invalidCredentials'));
        return;
      }

      // Email format from server (edge case): show inline
      if (message.includes('invalid format') || message.includes('validate email')) {
        setFormError(t('auth.login.invalidEmailFormat'));
        return;
      }

      // Other errors: keep modal for rare cases
      Alert.alert(t('auth.login.loginFailed'), message || t('auth.login.loginFailedMessage', 'Failed to sign in. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const navigateToSignUp = () => {
    router.push('/signup');
  };

  const navigateToResetPassword = () => {
    router.push('/reset-password');
  };

  const resetOnboardingForTesting = async () => {
    try {
      await AsyncStorage.setItem('@worddex_onboarding_completed', 'false');
      await AsyncStorage.removeItem('@signin_prompt_dismissed');
      await AsyncStorage.removeItem('@walkthrough_completed');
      await AsyncStorage.removeItem('@walkthrough_skipped');
      await AsyncStorage.removeItem('@walkthrough_started');
      await AsyncStorage.removeItem('@worddex_guest_mode');
      await setHasCompletedOnboarding(false);
      router.replace('/onboarding');
    } catch (e) {
      logger.error('Reset onboarding failed:', e);
      Alert.alert('Error', 'Could not reset. Try again.');
    }
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
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
      <View style={styles.form}>
        <Text style={styles.title}>{t('auth.login.title')}</Text>
        
        <View style={styles.newUserContainer}>
          <Text style={styles.newUserText}>{t('auth.login.newUser')}</Text>
          <TouchableOpacity 
            style={styles.signUpButton} 
            onPress={navigateToSignUp}
          >
            <Text style={styles.signUpButtonText}>{t('auth.login.createAccount')}</Text>
          </TouchableOpacity>
        </View>
        
        {/* Social sign-in first (Google prominent, then Apple) */}
        <SocialAuth mode="login" />
        
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('common.or')}</Text>
          <View style={styles.dividerLine} />
        </View>
        
        {!showEmailForm ? (
          <TouchableOpacity
            style={styles.emailButton}
            onPress={() => setShowEmailForm(true)}
          >
            <Text style={styles.emailButtonText}>{t('auth.login.signInWithEmail')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View onLayout={(e) => setEmailInputY(e.nativeEvent.layout.y)}>
              <TextInput
                style={[styles.input, formError ? styles.inputError : null]}
                placeholder={t('auth.login.emailPlaceholder')}
                placeholderTextColor="#A0A0A0"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (formError) clearFormError();
                }}
                onFocus={() => {
                  clearFormError();
                  scrollToInput(emailInputY);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
            <View onLayout={(e) => setPasswordInputY(e.nativeEvent.layout.y)}>
              <TextInput
                style={[styles.input, formError ? styles.inputError : null]}
                placeholder={t('auth.login.passwordPlaceholder')}
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (formError) clearFormError();
                }}
                onFocus={() => {
                  clearFormError();
                  scrollToInput(passwordInputY);
                }}
                secureTextEntry
                autoComplete="password"
              />
            </View>
            {formError ? (
              <Text style={styles.formError}>{formError}</Text>
            ) : null}
            <TouchableOpacity 
              style={styles.button}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('auth.login.loginButton')}</Text>
              )}
            </TouchableOpacity>
            <View style={styles.links}>
              <TouchableOpacity onPress={navigateToResetPassword}>
                <Text style={styles.link}>{t('auth.login.forgotPassword')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        
        {__DEV__ && (
          <View style={styles.links}>
            <TouchableOpacity onPress={resetOnboardingForTesting} style={styles.testLink}>
              <Text style={styles.testLinkText}>Test: New user flow (onboarding → guest)</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </PokedexLayout>
  );
};

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  form: {
    padding: 20,
  },
  title: {
    fontFamily: FONTS.sansBold,
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
    fontFamily: FONTS.sans,
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
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontWeight: 'bold',
  },
  input: {
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: COLORS.darkSurface,
    color: COLORS.text,
  },
  inputError: {
    borderColor: '#dc3545',
    backgroundColor: 'rgba(220, 53, 69, 0.08)',
  },
  formError: {
    fontFamily: FONTS.sans,
    color: '#f08a8a',
    fontSize: 13,
    marginTop: -8,
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  links: {
    marginTop: 20,
    alignItems: 'center',
  },
  link: {
    fontFamily: FONTS.sans,
    color: COLORS.lightGray,
    fontSize: 14,
    marginVertical: 5,
  },
  testLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  testLinkText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
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
    fontFamily: FONTS.sans,
    marginHorizontal: 10,
    color: COLORS.text,
  },
  emailButton: {
    backgroundColor: COLORS.darkSurface,
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginVertical: 8,
  },
  emailButtonText: {
    fontFamily: FONTS.sansMedium,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LoginScreen; 