import React, { useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import SocialAuth from '../components/SocialAuth';
import PokedexLayout from '../components/shared/PokedexLayout';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';

const SignupScreen = () => {
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);

  const navigateToLogin = () => {
    router.push('/login');
  };

  return (
    <PokedexLayout>
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
          <Text style={styles.title}>{t('auth.signup.title')}</Text>
          
          <Text style={styles.subtitle}>
            {t('auth.signup.subtitle')}
          </Text>
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.signup.signupWith')}</Text>
            <View style={styles.dividerLine} />
          </View>
          
          <SocialAuth mode="signup" />
          
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
    paddingBottom: 40,
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
    color: COLORS.text,
  },
  subtitle: {
    fontFamily: FONTS.sans,
    textAlign: 'center',
    marginBottom: 30,
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
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
  loginButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  loginButtonText: {
    fontFamily: FONTS.sansMedium,
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default SignupScreen;
