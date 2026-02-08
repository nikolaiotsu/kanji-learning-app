import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';

type SignInPromptProps = {
  visible: boolean;
  onDismiss: () => void;
  onContinueAsGuest: () => void;
};

const SIGNIN_PROMPT_DISMISSED_KEY = '@signin_prompt_dismissed';

export async function setSignInPromptDismissed(dismissed: boolean): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  if (dismissed) {
    await AsyncStorage.setItem(SIGNIN_PROMPT_DISMISSED_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(SIGNIN_PROMPT_DISMISSED_KEY);
  }
}

export async function getSignInPromptDismissed(): Promise<boolean> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const value = await AsyncStorage.getItem(SIGNIN_PROMPT_DISMISSED_KEY);
  return value === 'true';
}

export default function SignInPrompt({
  visible,
  onDismiss,
  onContinueAsGuest,
}: SignInPromptProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const handleSignUp = () => {
    onDismiss();
    router.push('/signup');
  };

  const handleContinueAsGuest = async () => {
    onContinueAsGuest();
    await setSignInPromptDismissed(true);
    onDismiss();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { maxWidth: Math.min(width - 32, 360) }]}>
          <Text style={styles.title}>
            {t('signInPrompt.title', 'Create an Account')}
          </Text>
          <Text style={styles.subtitle}>
            {t('signInPrompt.subtitle', 'Sign up to sync your cards across devices and never lose your progress.')}
          </Text>
          <View style={styles.bullets}>
            <Text style={styles.bulletText}>
              {t('signInPrompt.benefit1', '• Sync cards across all your devices')}
            </Text>
            <Text style={styles.bulletText}>
              {t('signInPrompt.benefit2', '• Backup your collection in the cloud')}
            </Text>
            <Text style={styles.bulletText}>
              {t('signInPrompt.benefit3', '• Pick up where you left off anytime')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSignUp}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {t('signInPrompt.signUp', 'Sign Up')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleContinueAsGuest}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              {t('signInPrompt.continueAsGuest', 'Continue as Guest')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
  },
  title: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  bullets: {
    marginBottom: 20,
  },
  bulletText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.textSecondary,
  },
});
