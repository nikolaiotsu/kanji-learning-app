import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  Platform,
  Modal,
  FlatList,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useOnboardingLayout } from './hooks/useOnboardingLayout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from './context/OnboardingContext';
import { useOnboardingProgress } from './context/OnboardingProgressContext';
import { useSettings, AVAILABLE_LANGUAGES, DETECTABLE_LANGUAGES } from './context/SettingsContext';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import { Ionicons } from '@expo/vector-icons';
import LoadingVideoScreen from './components/LoadingVideoScreen';
import OnboardingProgressBar from './components/shared/OnboardingProgressBar';

const SPEAK_LANGUAGE_DATA = Object.entries(AVAILABLE_LANGUAGES).map(([code, name]) => ({ code, name }));
const LEARN_LANGUAGE_DATA = Object.entries(DETECTABLE_LANGUAGES).map(([code, name]) => ({ code, name }));

export default function OnboardingLanguageScreen() {
  const { t } = useTranslation();
  const { paddingHorizontal, contentPaddingTop } = useOnboardingLayout();
  const { height } = useWindowDimensions();
  const { setHasCompletedOnboarding } = useOnboarding();
  const { setOnboardingStep } = useOnboardingProgress();

  // Responsive sizing for small screens (iPhone SE has ~667pt height)
  const isSmallScreen = height < 700;

  useEffect(() => {
    setOnboardingStep('onboarding-language');
  }, [setOnboardingStep]);
  const { targetLanguage, setTargetLanguage, forcedDetectionLanguage, setForcedDetectionLanguage } = useSettings();
  const [showSpeakPicker, setShowSpeakPicker] = useState(false);
  const [showLearnPicker, setShowLearnPicker] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('light-content');
    }
  }, []);

  const selectedSpeakName =
    t(`languageNames.${targetLanguage}`, {
      defaultValue: AVAILABLE_LANGUAGES[targetLanguage as keyof typeof AVAILABLE_LANGUAGES] ?? 'English',
    }) as string;
  const selectedLearnName =
    t(`languageNames.${forcedDetectionLanguage}`, {
      defaultValue: DETECTABLE_LANGUAGES[forcedDetectionLanguage as keyof typeof DETECTABLE_LANGUAGES] ?? 'Japanese',
    }) as string;

  const handleSelectSpeakLanguage = async (langCode: string) => {
    await setTargetLanguage(langCode);
    setShowSpeakPicker(false);
  };

  const handleSelectLearnLanguage = async (langCode: string) => {
    await setForcedDetectionLanguage(langCode);
    setShowLearnPicker(false);
  };

  const handleContinue = () => {
    router.push('/onboarding-why');
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
            <Text style={[styles.title, isSmallScreen && { fontSize: 23, marginBottom: 10 }]}>{t('onboarding.languageTitle1')}</Text>
            <TouchableOpacity
              style={[styles.languageButton, isSmallScreen && { paddingVertical: 12 }]}
              onPress={() => setShowSpeakPicker(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.languageButtonText, isSmallScreen && { fontSize: 18 }]}>{selectedSpeakName}</Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.title, styles.titleWithSpacing, isSmallScreen && { fontSize: 23, marginTop: 16, marginBottom: 10 }]}>{t('onboarding.languageTitle2')}</Text>
            <TouchableOpacity
              style={[styles.languageButton, isSmallScreen && { paddingVertical: 12 }]}
              onPress={() => setShowLearnPicker(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.languageButtonText, isSmallScreen && { fontSize: 18 }]}>{selectedLearnName}</Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.button, isSmallScreen && { height: 56 }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>{t('onboarding.languageContinue')}</Text>
              <Ionicons name="chevron-forward" size={22} color={COLORS.text} style={styles.buttonArrow} />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={showSpeakPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSpeakPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSpeakPicker(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('onboarding.selectLanguageSpeak')}</Text>
              <TouchableOpacity onPress={() => setShowSpeakPicker(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={SPEAK_LANGUAGE_DATA}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    targetLanguage === item.code && styles.selectedLanguageItem,
                  ]}
                  onPress={() => handleSelectSpeakLanguage(item.code)}
                >
                  <Text
                    style={[
                      styles.languageText,
                      targetLanguage === item.code && styles.selectedLanguageText,
                    ]}
                  >
                    {t(`languageNames.${item.code}`, { defaultValue: item.name }) as string}
                  </Text>
                  {targetLanguage === item.code && (
                    <Ionicons name="checkmark" size={22} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showLearnPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLearnPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLearnPicker(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('onboarding.selectLanguageLearn')}</Text>
              <TouchableOpacity onPress={() => setShowLearnPicker(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={LEARN_LANGUAGE_DATA}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    forcedDetectionLanguage === item.code && styles.selectedLanguageItem,
                  ]}
                  onPress={() => handleSelectLearnLanguage(item.code)}
                >
                  <Text
                    style={[
                      styles.languageText,
                      forcedDetectionLanguage === item.code && styles.selectedLanguageText,
                    ]}
                  >
                    {t(`languageNames.${item.code}`, { defaultValue: item.name }) as string}
                  </Text>
                  {forcedDetectionLanguage === item.code && (
                    <Ionicons name="checkmark" size={22} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  titleWithSpacing: {
    marginTop: 24,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  languageButtonText: {
    fontFamily: FONTS.sansMedium,
    fontSize: 20,
    color: COLORS.text,
    fontWeight: '500',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectedLanguageItem: {
    backgroundColor: COLORS.primary + '33',
  },
  languageText: {
    fontFamily: FONTS.sans,
    fontSize: 20,
    color: COLORS.text,
  },
  selectedLanguageText: {
    fontFamily: FONTS.sansSemiBold,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
