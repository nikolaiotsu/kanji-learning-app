import React, { useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, StatusBar, Platform, ScrollView } from 'react-native';
import { useOnboardingLayout } from './hooks/useOnboardingLayout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding } from './context/OnboardingContext';
import { useOnboardingProgress } from './context/OnboardingProgressContext';
import { COLORS } from './constants/colors';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';
import { FONTS } from './constants/typography';
import LoadingVideoScreen from './components/LoadingVideoScreen';

/**
 * Full-screen onboarding welcome screen.
 * Covers the entire screen (including status bar and any app chrome) for a focused
 * first-run experience. Best practice: single dedicated route, full-screen takeover,
 * one primary CTA, and completion persisted via OnboardingContext.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { paddingHorizontal, contentPaddingTop } = useOnboardingLayout();
  const { setHasCompletedOnboarding } = useOnboarding();
  const { setOnboardingStep, hideProgressBar } = useOnboardingProgress();

  useEffect(() => {
    setOnboardingStep('onboarding');
  }, [setOnboardingStep]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('light-content');
    }
  }, []);

  const handleGetStarted = () => {
    router.push('/onboarding-language');
  };

  const handleSignIn = async () => {
    hideProgressBar();
    await setHasCompletedOnboarding(true);
    router.replace('/login');
  };

  return (
    <View style={styles.fullScreen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <OnboardingProgressBar />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal, paddingTop: contentPaddingTop, paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.videoSection}>
            <LoadingVideoScreen compact usePreloaded={false} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>
            <View style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.subtitle}>{t('onboarding.welcomeSubtitle2')}</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.subtitle}>{t('onboarding.welcomeSubtitle1')}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={handleGetStarted}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>{t('onboarding.getStarted')}</Text>
              <Ionicons name="chevron-forward" size={22} color={COLORS.text} style={styles.buttonArrow} />
            </View>
          </TouchableOpacity>
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('onboarding.alreadyHaveAccount')}{' '}
              <Text style={styles.signInLink} onPress={handleSignIn}>
                {t('onboarding.signIn')}
              </Text>
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  videoSection: {
    marginBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignSelf: 'stretch',
    marginBottom: 40,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 31,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'left',
    marginBottom: 28,
    letterSpacing: -0.5,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 10,
    marginRight: 14,
  },
  subtitle: {
    fontFamily: FONTS.sans,
    flex: 1,
    fontSize: 20,
    color: COLORS.text,
    lineHeight: 30,
    opacity: 0.9,
  },
  button: {
    backgroundColor: COLORS.primary,
    height: 65,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '600',
  },
  buttonArrow: {
    marginLeft: 8,
  },
  footer: {
    marginTop: 28,
    alignSelf: 'stretch',
  },
  footerText: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'left',
  },
  signInLink: {
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
