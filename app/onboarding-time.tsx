import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useOnboardingLayout } from './hooks/useOnboardingLayout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useOnboardingProgress } from './context/OnboardingProgressContext';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import LoadingVideoScreen from './components/LoadingVideoScreen';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';

const TIME_OPTIONS = [
  { id: '5', timeKey: 'onboarding.time5Min', labelKey: 'onboarding.timeCasual' },
  { id: '10', timeKey: 'onboarding.time10Min', labelKey: 'onboarding.timeRegular' },
  { id: '15', timeKey: 'onboarding.time15Min', labelKey: 'onboarding.timeSerious' },
  { id: '20', timeKey: 'onboarding.time20Min', labelKey: 'onboarding.timeIntense' },
];

export default function OnboardingTimeScreen() {
  const { t } = useTranslation();
  const { paddingHorizontal, contentPaddingTop } = useOnboardingLayout();
  const { height } = useWindowDimensions();
  const { setOnboardingStep } = useOnboardingProgress();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Responsive sizing for small screens (iPhone SE has ~667pt height)
  const isSmallScreen = height < 700;

  useEffect(() => {
    setOnboardingStep('onboarding-time');
  }, [setOnboardingStep]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('light-content');
    }
  }, []);

  const handleContinue = () => {
    router.push('/onboarding-faster');
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
          <View style={[styles.videoSection, { marginBottom: isSmallScreen ? 20 : 32 }]}>
            <LoadingVideoScreen compact />
          </View>
          <View style={[styles.textBlock, { marginBottom: isSmallScreen ? 20 : 32 }]}>
            <Text style={[styles.title, isSmallScreen && { fontSize: 23, marginBottom: 16 }]}>{t('onboarding.timeTitle')}</Text>
            {TIME_OPTIONS.map((option) => {
              const isSelected = selectedId === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.optionButton, isSelected && styles.optionButtonSelected, isSmallScreen && { paddingVertical: 10, marginBottom: 8 }]}
                  onPress={() => setSelectedId(option.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.optionTime, isSelected && styles.optionTimeSelected, isSmallScreen && { fontSize: 17 }]}>
                    {t(option.timeKey)}
                  </Text>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected, isSmallScreen && { fontSize: 17 }]}>
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.button, !selectedId && styles.buttonDisabled, isSmallScreen && { height: 56 }]}
            onPress={handleContinue}
            activeOpacity={0.8}
            disabled={!selectedId}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>{t('onboarding.timeCta')}</Text>
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
  videoSection: {
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignSelf: 'stretch',
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 27,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'left',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  optionButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '22',
  },
  optionTime: {
    fontFamily: FONTS.sansMedium,
    fontSize: 20,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionTimeSelected: {
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.primary,
    fontWeight: '600',
  },
  optionLabel: {
    fontFamily: FONTS.sans,
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  optionLabelSelected: {
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.primary,
    fontWeight: '600',
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
  buttonDisabled: {
    opacity: 0.5,
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
