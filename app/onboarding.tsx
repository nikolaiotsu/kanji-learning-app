import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, StatusBar, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useOnboardingLayout } from './hooks/useOnboardingLayout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useOnboarding } from './context/OnboardingContext';
import { useOnboardingProgress } from './context/OnboardingProgressContext';
import { useOnboardingVideo } from './context/OnboardingVideosContext';
import { COLORS } from './constants/colors';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';
import { FONTS } from './constants/typography';
import LoadingVideoScreen from './components/LoadingVideoScreen';

const heroshotVideoSource = require('../assets/heroshot.mp4');

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
  const [hasError, setHasError] = useState(false);

  const preloadedPlayer = useOnboardingVideo('heroshot');
  const localPlayer = useVideoPlayer(heroshotVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const player = preloadedPlayer ?? localPlayer;

  useEffect(() => {
    setOnboardingStep('onboarding');
  }, [setOnboardingStep]);

  useEffect(() => {
    player.play();
    return () => {
      try {
        player.pause();
      } catch {
        // Native player may already be disposed when leaving onboarding; ignore
      }
    };
  }, [player]);

  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (status === 'error') setHasError(true);
  }, [status]);

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
            { paddingHorizontal, paddingTop: contentPaddingTop, paddingBottom: 48 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loadingVideoSection}>
            <LoadingVideoScreen compact usePreloaded={false} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>
            <View style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.subtitle}>{t('onboarding.welcomeSubtitle2')}</Text>
            </View>
          </View>
          <View style={styles.heroVideoSection}>
            {(hasError || status === 'error') ? (
              <View style={styles.videoClip}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : (
              <View style={styles.videoClip}>
                <VideoView
                  style={styles.video}
                  player={player}
                  nativeControls={false}
                  contentFit="contain"
                  allowsFullscreen={false}
                  allowsPictureInPicture={false}
                />
              </View>
            )}
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
  loadingVideoSection: {
    marginBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroVideoSection: {
    marginBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoClip: {
    width: 200,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: 200,
    height: 200,
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
    flexShrink: 0,
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
    flexShrink: 0,
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
