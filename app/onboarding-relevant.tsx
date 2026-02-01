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
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useOnboardingVideo } from './context/OnboardingVideosContext';
import { useEvent } from 'expo';
import { useOnboarding } from './context/OnboardingContext';
import { COLORS } from './constants/colors';
import LoadingVideoScreen from './components/LoadingVideoScreen';

const guygettingburiedVideoSource = require('../assets/guygettingburied.mp4');

export default function OnboardingRelevantScreen() {
  const { t } = useTranslation();
  const { setHasCompletedOnboarding } = useOnboarding();
  const [hasError, setHasError] = useState(false);

  const preloadedPlayer = useOnboardingVideo('guygettingburied');
  const localPlayer = useVideoPlayer(guygettingburiedVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const player = preloadedPlayer ?? localPlayer;

  useEffect(() => {
    if (preloadedPlayer) preloadedPlayer.play();
  }, [preloadedPlayer]);

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
    router.push('/onboarding-educational');
  };

  return (
    <View style={styles.fullScreen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.textBlock}>
            <View style={styles.titleRow}>
              <View style={styles.titleLogoWrap}>
                <LoadingVideoScreen compact />
              </View>
              <Text style={styles.titleText}>{t('onboarding.relevantTitleSuffix')}</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.subtitle}>
                {t('onboarding.relevantBullet')}
              </Text>
            </View>
          </View>
          <View style={styles.arrowContainer}>
            <View style={styles.arrowStem} />
            <View style={styles.arrowHead} />
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
            <Text style={styles.buttonText}>{t('onboarding.relevantCta')}</Text>
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
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  textBlock: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleLogoWrap: {
    marginRight: 10,
  },
  titleText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
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
    flex: 1,
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 26,
    opacity: 0.9,
  },
  arrowContainer: {
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  arrowStem: {
    width: 2,
    height: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.primary,
    marginTop: 1,
  },
  videoSection: {
    marginBottom: 32,
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
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    alignSelf: 'stretch',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
