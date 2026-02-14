import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useContentPadding } from './hooks/useContentPadding';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useOnboardingVideo } from './context/OnboardingVideosContext';
import { useEvent } from 'expo';
import { useOnboardingProgress } from './context/OnboardingProgressContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';

const guytypingVideoSource = require('../assets/guytyping1.mp4');

export default function OnboardingFasterScreen() {
  const { t } = useTranslation();
  const { paddingHorizontal } = useContentPadding();
  const { setOnboardingStep } = useOnboardingProgress();
  const [hasError, setHasError] = useState(false);

  const preloadedPlayer = useOnboardingVideo('guytyping');
  const localPlayer = useVideoPlayer(guytypingVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const player = preloadedPlayer ?? localPlayer;

  useEffect(() => {
    setOnboardingStep('onboarding-faster');
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

  const handleCTA = () => {
    router.push('/onboarding-relevant');
  };

  return (
    <View style={styles.fullScreen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <OnboardingProgressBar />
        <View style={[styles.content, { paddingHorizontal }]}>
          <View style={styles.textBlock}>
            <Text style={styles.titleText}>{t('onboarding.fastTitle')}</Text>
            <View style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.subtitle}>
                {t('onboarding.fastBullet')}
              </Text>
            </View>
          </View>
          <View style={styles.videoSection}>
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
            onPress={handleCTA}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>{t('onboarding.fastCta')}</Text>
              <Ionicons name="chevron-forward" size={22} color={COLORS.text} style={styles.buttonArrow} />
            </View>
          </TouchableOpacity>
        </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  textBlock: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  titleText: {
    fontFamily: FONTS.sansBold,
    fontSize: 27,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    textAlign: 'left',
    lineHeight: 30,
    opacity: 0.9,
  },
  videoSection: {
    marginBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoClip: {
    width: 200,
    height: 267,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: 200,
    height: 267,
  },
  button: {
    backgroundColor: COLORS.primary,
    height: 65,
    paddingHorizontal: 32,
    borderRadius: 12,
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
});
