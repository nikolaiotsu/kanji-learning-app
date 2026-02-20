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
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Video, ResizeMode } from 'expo-av';
import { useOnboarding } from './context/OnboardingContext';
import { useOnboardingProgress } from './context/OnboardingProgressContext';
import { useAuth } from './context/AuthContext';
import { useTransitionLoading } from './context/TransitionLoadingContext';
import { resetWalkthrough } from './hooks/useWalkthrough';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import LoadingVideoScreen from './components/LoadingVideoScreen';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';

const guyflyingVideoSource = require('../assets/guyflying.mp4');

/** Breakpoint below which we use phone layout: loading video above title. iPad keeps side-by-side. */
const PHONE_MAX_WIDTH = 767;

export default function OnboardingEducationalScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const isPhoneOrNarrow = width <= PHONE_MAX_WIDTH;
  const { paddingHorizontal, contentPaddingTop } = useOnboardingLayout();
  const { setHasCompletedOnboarding } = useOnboarding();
  const { setOnboardingStep } = useOnboardingProgress();

  const [hasError, setHasError] = useState(false);

  // Responsive sizing for small screens (iPhone SE has ~667pt height)
  const isSmallScreen = height < 700;
  const videoWidth = isSmallScreen ? 150 : 200;
  const videoHeight = isSmallScreen ? 200 : 267;
  const sectionMargin = isSmallScreen ? 20 : 32;

  useEffect(() => {
    setOnboardingStep('onboarding-educational');
  }, [setOnboardingStep]);
  const { setGuestMode } = useAuth();

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('light-content');
    }
  }, []);

  const { setShowTransitionLoading } = useTransitionLoading();

  const handleCTA = async () => {
    setShowTransitionLoading(true);
    await resetWalkthrough();
    await setHasCompletedOnboarding(true);
    // Set guest mode so user can save cards locally during walkthrough
    // Must await to ensure state is updated before navigation
    await setGuestMode(true);
    // Reset the entire stack so user cannot swipe back to onboarding screens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reset routes type varies by expo-router version
    navigation.reset({ index: 0, routes: [{ name: 'index', params: { walkthrough: 'true' } }] } as any);
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
            {isPhoneOrNarrow ? (
              <>
                <View style={[styles.phoneVideoAbove, { marginBottom: isSmallScreen ? 12 : 16 }]}>
                  <LoadingVideoScreen compact />
                </View>
                <Text
                  style={[styles.titleText, styles.titleTextCentered, isSmallScreen && { fontSize: 23, marginBottom: 16 }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {t('onboarding.empoweringTitle')}
                </Text>
              </>
            ) : (
              <View style={styles.titleRow}>
                <Text
                  style={[styles.titleText, isSmallScreen && { fontSize: 23 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >{t('onboarding.empoweringTitle')}</Text>
                <View style={styles.titleLogoWrap}>
                  <LoadingVideoScreen compact />
                </View>
              </View>
            )}
            <View style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={[styles.subtitle, isSmallScreen && { fontSize: 17, lineHeight: 26 }]}>
                {t('onboarding.empoweringBullet1')}
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
                  source={guyflyingVideoSource}
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
              <Text style={styles.buttonText}>{t('onboarding.empoweringCta')}</Text>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'stretch',
  },
  titleText: {
    fontFamily: FONTS.sansBold,
    fontSize: 27,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
    marginRight: 10,
    // No flex: 1 — keep only the width needed so the loading animation stays beside the title
    // on all screen sizes (e.g. iPad Mini). With flex: 1 the title container expanded and created a large gap.
  },
  titleTextCentered: {
    textAlign: 'center',
    marginRight: 0,
    marginBottom: 20,
  },
  phoneVideoAbove: {
    alignSelf: 'center',
  },
  titleLogoWrap: {
    flexShrink: 0,
    marginTop: -30,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
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
