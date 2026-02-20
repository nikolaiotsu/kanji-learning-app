import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useOnboardingLayout } from './hooks/useOnboardingLayout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Video, ResizeMode } from 'expo-av';
import { useOnboardingProgress } from './context/OnboardingProgressContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';

const guytypingVideoSource = require('../assets/guytyping1.mp4');

export default function OnboardingFasterScreen() {
  const { t } = useTranslation();
  const { paddingHorizontal, contentPaddingTop } = useOnboardingLayout();
  const { height } = useWindowDimensions();
  const { setOnboardingStep } = useOnboardingProgress();
  const [hasError, setHasError] = useState(false);

  // Responsive sizing for small screens (iPhone SE has ~667pt height)
  const isSmallScreen = height < 700;
  const videoWidth = isSmallScreen ? 150 : 200;
  const videoHeight = isSmallScreen ? 200 : 267;
  const sectionMargin = isSmallScreen ? 20 : 32;

  useEffect(() => {
    setOnboardingStep('onboarding-faster');
  }, [setOnboardingStep]);

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
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal, paddingTop: contentPaddingTop, paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.textBlock, { marginBottom: isSmallScreen ? 16 : 24 }]}>
            <Text style={[styles.titleText, isSmallScreen && { fontSize: 23, marginBottom: 16 }]}>{t('onboarding.fastTitle')}</Text>
            <View style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={[styles.subtitle, isSmallScreen && { fontSize: 17, lineHeight: 26 }]}>
                {t('onboarding.fastBullet')}
              </Text>
            </View>
          </View>
          <View style={[styles.videoSection, { marginBottom: sectionMargin }]}>
            {hasError ? (
              <View style={[styles.videoClip, { width: videoWidth, height: videoHeight }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : (
              <View style={[styles.videoClip, { width: videoWidth, height: videoHeight }]}>
                <Video
                  source={guytypingVideoSource}
                  style={{ width: videoWidth, height: videoHeight }}
                  isLooping
                  isMuted
                  shouldPlay
                  resizeMode={ResizeMode.CONTAIN}
                  onError={() => setHasError(true)}
                />
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[styles.button, isSmallScreen && { height: 56 }]}
            onPress={handleCTA}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>{t('onboarding.fastCta')}</Text>
              <Ionicons name="chevron-forward" size={22} color={COLORS.text} style={styles.buttonArrow} />
            </View>
          </TouchableOpacity>
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
  textBlock: {
    alignSelf: 'stretch',
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
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoClip: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
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
