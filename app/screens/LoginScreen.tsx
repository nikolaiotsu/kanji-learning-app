import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from '../context/OnboardingContext';
import { getPendingWalkthrough, PENDING_WALKTHROUGH_KEY } from '../hooks/useWalkthrough';
import { router } from 'expo-router';
import SocialAuth from '../components/SocialAuth';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import PokedexLayout from '../components/shared/PokedexLayout';

import { logger } from '../utils/logger';

const worddexLogo = require('../../assets/images/worddexlogo.png');

const LoginScreen = () => {
  const { t } = useTranslation();
  const { setHasCompletedOnboarding } = useOnboarding();
  const scrollViewRef = useRef<ScrollView>(null);
  const [isPostOnboardingFlow, setIsPostOnboardingFlow] = useState(false);

  useEffect(() => {
    getPendingWalkthrough().then(setIsPostOnboardingFlow);
  }, []);

  const navigateToSignUp = () => {
    router.push('/signup');
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
        <Text style={styles.title}>{t(isPostOnboardingFlow ? 'auth.login.titlePostOnboarding' : 'auth.login.title')}</Text>
        
        <View style={styles.newUserContainer}>
          <Text style={styles.newUserText}>{t('auth.login.newUser')}</Text>
          <TouchableOpacity 
            style={styles.signUpButton} 
            onPress={navigateToSignUp}
          >
            <Text style={styles.signUpButtonText}>{t('auth.login.createAccount')}</Text>
          </TouchableOpacity>
        </View>
        
        <SocialAuth mode="login" />
        
        {__DEV__ && (
          <View style={styles.links}>
            <TouchableOpacity onPress={resetOnboardingForTesting} style={styles.testLink}>
              <Text style={styles.testLinkText}>Test: New user flow (onboarding → sign-in → walkthrough)</Text>
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
  links: {
    marginTop: 20,
    alignItems: 'center',
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
});

export default LoginScreen;
