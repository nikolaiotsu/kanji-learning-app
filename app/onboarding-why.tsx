import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { COLORS } from './constants/colors';
import { FONTS } from './constants/typography';
import LoadingVideoScreen from './components/LoadingVideoScreen';

const REASON_OPTIONS = [
  { id: 'work', emoji: '💼', labelKey: 'onboarding.whyWork' },
  { id: 'travel', emoji: '✈️', labelKey: 'onboarding.whyTravel' },
  { id: 'people', emoji: '❤️', labelKey: 'onboarding.whyPeople' },
];

export default function OnboardingWhyScreen() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('light-content');
    }
  }, []);

  const toggleOption = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContinue = () => {
    router.push('/onboarding-faster');
  };

  return (
    <View style={styles.fullScreen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.videoSection}>
            <LoadingVideoScreen compact />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title}>{t('onboarding.whyTitle')}</Text>
            {REASON_OPTIONS.map((option) => {
              const isSelected = selected.has(option.id);
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                  onPress={() => toggleOption(option.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.optionEmoji}>{option.emoji}</Text>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{t('onboarding.whyCta')}</Text>
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
  videoSection: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignSelf: 'stretch',
    marginBottom: 32,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'left',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
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
  optionEmoji: {
    fontSize: 22,
    marginRight: 12,
  },
  optionLabel: {
    fontFamily: FONTS.sansMedium,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionLabelSelected: {
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.primary,
    fontWeight: '600',
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
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
