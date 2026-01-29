import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, FlatList, TextInput, ActivityIndicator, Animated, Pressable, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { useSettings, AVAILABLE_LANGUAGES, DETECTABLE_LANGUAGES } from './context/SettingsContext';
import { useFlashcardCounter } from './context/FlashcardCounterContext';
import { useSwipeCounter } from './context/SwipeCounterContext';
import { useOCRCounter } from './context/OCRCounterContext';
import { useSubscription } from './context/SubscriptionContext';
import { supabase } from './services/supabaseClient';
import { useRouter } from 'expo-router';
import { COLORS } from './constants/colors';
import { PRODUCT_IDS, PRODUCT_DETAILS } from './constants/config';
import PokedexLayout from './components/shared/PokedexLayout';
import { resetReviewPromptState, resetLifetimeCount, getReviewStatus } from './services/reviewPromptService';
import { resetWalkthrough } from './hooks/useWalkthrough';
import { hasEnergyBarsRemaining } from './utils/walkthroughEnergyCheck';

import { logger } from './utils/logger';
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, signOut, deleteAccount } = useAuth();
  const { 
    targetLanguage, 
    setTargetLanguage, 
    forcedDetectionLanguage, 
    setForcedDetectionLanguage,
    swapLanguages,
    availableLanguages,
    detectableLanguages 
  } = useSettings();
  const { resetFlashcardCount } = useFlashcardCounter();
  const { resetSwipeCounts } = useSwipeCounter();
  const { resetOCRCount } = useOCRCounter();
  const { 
    subscription, 
    setTestingSubscriptionPlan, 
    getMaxFlashcards,
    purchaseSubscription,
    restorePurchases,
    isLoading: isSubscriptionLoading,
    availableProducts
  } = useSubscription();
  
  const router = useRouter();
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showDetectionSelector, setShowDetectionSelector] = useState(false);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const longPressProgress = useRef(new Animated.Value(0)).current;
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Function to handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      logger.error('Error signing out:', error);
      Alert.alert(t('common.error'), t('settings.signOutError'));
    }
  };

  // Function to swap languages
  const handleSwapLanguages = async () => {
    try {
      await swapLanguages();
    } catch (error) {
      logger.error('Error swapping languages:', error);
      const errorMessage = error instanceof Error ? error.message : t('settings.swapLanguagesError');
      Alert.alert(t('settings.cannotSwapLanguages'), errorMessage, [{ text: t('common.ok') }]);
    }
  };

  // Function to show language selector modal
  const handleShowLanguageSelector = () => {
    setShowLanguageSelector(true);
  };

  // Function to show detection language selector modal
  const handleShowDetectionSelector = () => {
    setShowDetectionSelector(true);
  };

  // Function to select a language
  const handleSelectLanguage = async (langCode: string) => {
    try {
      await setTargetLanguage(langCode);
      setShowLanguageSelector(false);
    } catch (error) {
      logger.error('Error setting language:', error);
      const errorMessage = error instanceof Error ? error.message : t('settings.setLanguageError');
      Alert.alert(t('settings.invalidLanguageSelection'), errorMessage);
    }
  };

  // Function to select a detection language
  const handleSelectDetectionLanguage = async (langCode: string) => {
    try {
      await setForcedDetectionLanguage(langCode);
      setShowDetectionSelector(false);
    } catch (error) {
      logger.log('Error setting detection language:', error);
      const errorMessage = error instanceof Error ? error.message : t('settings.setDetectionLanguageError');
      Alert.alert(t('settings.invalidLanguageSelection'), errorMessage);
    }
  };

  // Get language data for the flat list
  const languageData = Object.entries(availableLanguages).map(([code, name]) => ({
    code,
    name
  }));

  // Get detection language data for the flat list
  const detectionLanguageData = Object.entries(detectableLanguages).map(([code, name]) => ({
    code,
    name
  }));

  // Function to handle flashcard count reset for testing
  const handleResetFlashcardCount = async () => {
    Alert.alert(
      'Reset Daily Limits',
      'This will reset your daily flashcard count, OCR scan count, and API usage limits (translate & wordscope) to 0. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Reset flashcard count
              await resetFlashcardCount();
              
              // Reset OCR count
              await resetOCRCount();
              
              // Reset API usage in database (translate_api_calls and wordscope_api_calls)
              // Only update if row exists - if no row exists, there's nothing to reset anyway
              const today = new Date().toISOString().split('T')[0];
              const { error } = await supabase
                .from('user_daily_usage')
                .update({
                  translate_api_calls: 0,
                  wordscope_api_calls: 0,
                  ocr_scans_performed: 0
                })
                .eq('usage_date', today);
              
              if (error) {
                logger.error('Error resetting API usage limits:', error);
                // If error is "no rows found" (PGRST116), that's fine - no usage to reset
                if (error.code !== 'PGRST116') {
                  logger.warn('Non-critical error resetting API limits - may not affect functionality:', error.message);
                }
              }
              
              Alert.alert('Success', 'All daily limits have been reset to 0.');
            } catch (error) {
              logger.error('Error resetting daily limits:', error);
              Alert.alert('Error', 'Failed to reset some limits. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Function to handle review prompt reset for testing
  const handleResetReviewPrompt = async () => {
    try {
      // Get current status before reset
      const status = await getReviewStatus();
      
      Alert.alert(
        'Reset Review Prompt',
        `Current Status:\n` +
        `• Lifetime Cards: ${status.lifetimeCount}\n` +
        `• Has Reviewed: ${status.hasReviewed ? 'Yes' : 'No'}\n` +
        `${status.reviewedAt ? `• Reviewed At: ${new Date(status.reviewedAt).toLocaleDateString()}\n` : ''}` +
        `\nThis will reset both the lifetime flashcard count and review prompt state, allowing you to test the prompt again after saving 10 cards.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              await resetLifetimeCount();
              await resetReviewPromptState();
              Alert.alert('Success', 'Review prompt state has been reset. The prompt will show after you save 10 flashcards.');
              logger.log('Review prompt state reset via settings');
            }
          }
        ]
      );
    } catch (error) {
      logger.error('Error resetting review prompt:', error);
      Alert.alert('Error', 'Failed to reset review prompt state. Please try again.');
    }
  };

  // Function to replay walkthrough
  const handleReplayWalkthrough = async () => {
    try {
      // Check if user has energy bars before starting walkthrough
      const hasEnergy = await hasEnergyBarsRemaining(subscription.plan);
      
      if (!hasEnergy) {
        Alert.alert(
          t('walkthrough.noEnergyTitle'),
          t('walkthrough.noEnergyMessage')
        );
        return;
      }
      
      await resetWalkthrough();
      router.replace('/');
    } catch (error) {
      logger.error('Error resetting walkthrough:', error);
      Alert.alert('Error', 'Failed to reset walkthrough. Please try again.');
    }
  };

  // Function to show delete account warning
  const handleShowDeleteWarning = () => {
    setShowDeleteWarning(true);
  };

  // Function to proceed to confirmation step
  const handleProceedToConfirm = () => {
    setShowDeleteWarning(false);
    setShowDeleteConfirm(true);
    setDeleteConfirmText('');
  };

  // Function to handle account deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      Alert.alert(
        t('settings.deleteAccountError'),
        'Please type DELETE to confirm'
      );
      return;
    }

    setIsDeletingAccount(true);

    try {
      const result = await deleteAccount();
      
      if (result.success) {
        setShowDeleteConfirm(false);
        Alert.alert(
          t('settings.deleteAccountSuccess'),
          t('settings.deleteAccountSuccessMessage'),
          [
            {
              text: t('common.ok'),
              onPress: () => {
                router.replace('/');
              }
            }
          ]
        );
      } else {
        setIsDeletingAccount(false);
        Alert.alert(
          t('settings.deleteAccountError'),
          result.error || t('settings.deleteAccountErrorMessage')
        );
      }
    } catch (error) {
      setIsDeletingAccount(false);
      logger.error('Error deleting account:', error);
      Alert.alert(
        t('settings.deleteAccountError'),
        t('settings.deleteAccountErrorMessage')
      );
    }
  };

  // Function to cancel delete account flow
  const handleCancelDelete = () => {
    setShowDeleteWarning(false);
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
  };

  // Function to open privacy policy
  const handleOpenPrivacyPolicy = async () => {
    const privacyPolicyUrl = 'https://rapid-inch-201.notion.site/WordDex-Privacy-Policy-2bcb8594739e80f7814ffea26df1c3a9';
    
    try {
      const supported = await Linking.canOpenURL(privacyPolicyUrl);
      if (supported) {
        await Linking.openURL(privacyPolicyUrl);
      } else {
        Alert.alert(t('common.error'), 'Cannot open privacy policy URL');
      }
    } catch (error) {
      logger.error('Error opening privacy policy:', error);
      Alert.alert(t('common.error'), 'Failed to open privacy policy');
    }
  };

  // Function to handle premium purchase
  const handlePurchase = async (productId: string) => {
    if (isPurchasing || isSubscriptionLoading) {
      return;
    }

    try {
      setIsPurchasing(true);
      logger.log('Initiating purchase for:', productId);
      
      const success = await purchaseSubscription(productId);
      
      if (success) {
        Alert.alert(
          'Success!',
          'Premium subscription activated! Enjoy unlimited flashcards and features.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Purchase Failed',
          'Unable to complete the purchase. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      logger.error('Error purchasing subscription:', error);
      Alert.alert(
        'Error',
        'An error occurred while processing your purchase. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  // Function to restore purchases
  const handleRestorePurchases = async () => {
    if (isPurchasing || isSubscriptionLoading) {
      return;
    }

    try {
      setIsPurchasing(true);
      logger.log('Attempting to restore purchases...');
      
      const success = await restorePurchases();
      
      if (success) {
        Alert.alert(
          'Restored!',
          'Your premium subscription has been restored successfully.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We couldn\'t find any previous purchases to restore. If you believe this is an error, please contact support.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      logger.error('Error restoring purchases:', error);
      Alert.alert(
        'Error',
        'An error occurred while restoring purchases. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  // Long press handlers for delete account button
  const handleDeletePressIn = () => {
    setIsLongPressing(true);
    
    // Animate the progress bar
    Animated.timing(longPressProgress, {
      toValue: 1,
      duration: 1500, // 1.5 seconds long press
      useNativeDriver: false,
    }).start();

    // Set timer to trigger action after long press
    longPressTimer.current = setTimeout(() => {
      handleShowDeleteWarning();
      handleDeletePressOut();
    }, 1500);
  };

  const handleDeletePressOut = () => {
    setIsLongPressing(false);
    
    // Clear timer if released early
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Reset animation
    Animated.timing(longPressProgress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  return (
    <PokedexLayout showLights={false}>
      <ScrollView>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
          
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleShowDetectionSelector}
          >
            <Ionicons name="scan-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>{t('settings.forceWordDexDetect')}</Text>
              <Text style={styles.settingDescription}>
                {detectableLanguages[forcedDetectionLanguage as keyof typeof detectableLanguages]} {t('settings.tapToChange')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleShowLanguageSelector}
          >
            <Ionicons name="language-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>{t('settings.translateTo')}</Text>
              <Text style={styles.settingDescription}>
                {availableLanguages[targetLanguage as keyof typeof availableLanguages]} {t('settings.tapToChange')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Language Swap Button */}
          <View style={styles.swapButtonContainer}>
            <TouchableOpacity
              style={styles.swapButton}
              onPress={handleSwapLanguages}
            >
              <Ionicons name="swap-vertical" size={20} color="#000" />
              <Text style={styles.swapButtonText}>{t('settings.swapLanguages')}</Text>
            </TouchableOpacity>
          </View>

          {/* Replay Walkthrough Button */}
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleReplayWalkthrough}
          >
            <Ionicons name="help-circle-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>{t('settings.showAppWalkthrough')}</Text>
              <Text style={styles.settingDescription}>
                {t('settings.showAppWalkthroughDescription')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.darkGray} />
          </TouchableOpacity>

          {/* Reset Cards Remembered Counter Button */}
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => {
              Alert.alert(
                t('settings.resetSwipeCounterTitle'),
                t('settings.resetSwipeCounterMessage'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  { 
                    text: t('settings.resetSwipeCounterConfirm'), 
                    style: 'destructive',
                    onPress: async () => {
                      await resetSwipeCounts();
                      Alert.alert(t('common.success'), t('settings.resetSwipeCounterSuccess'));
                    }
                  }
                ]
              );
            }}
          >
            <Ionicons name="refresh-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>{t('settings.resetSwipeCounter')}</Text>
              <Text style={styles.settingDescription}>
                {t('settings.resetSwipeCounterDescription')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.subscription')}</Text>
          
          {subscription.plan === 'PREMIUM' ? (
            // Premium user - show current status
            <View style={styles.settingItem}>
              <Ionicons 
                name="diamond" 
                size={24} 
                color={COLORS.premium} 
                style={styles.settingIcon} 
              />
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>
                  {t('settings.premiumPlan')}
                </Text>
                <Text style={styles.settingDescription}>
                  {t('settings.premiumPlanDescription')}
                </Text>
              </View>
              <View style={[styles.counterBadge, { backgroundColor: COLORS.premium }]}>
                <Ionicons name="diamond" size={16} color="white" />
              </View>
            </View>
          ) : (
            // Free user - show upgrade options
            <View>
              <View style={styles.upgradeHeader}>
                <Ionicons name="star-outline" size={28} color={COLORS.primary} />
                <View style={styles.upgradeHeaderText}>
                  <Text style={styles.upgradeTitle}>Unlock Premium</Text>
                  <Text style={styles.upgradeSubtitle}>{t('settings.premiumPlanDescription')}</Text>
                </View>
              </View>

              {/* Monthly Subscription Button */}
              <TouchableOpacity
                style={[
                  styles.purchaseButton,
                  (isPurchasing || isSubscriptionLoading) && styles.purchaseButtonDisabled
                ]}
                onPress={() => handlePurchase(PRODUCT_IDS.PREMIUM_MONTHLY)}
                disabled={isPurchasing || isSubscriptionLoading}
              >
                {isPurchasing || isSubscriptionLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <View style={styles.purchaseButtonContent}>
                      <View style={styles.purchaseButtonLeft}>
                        <Ionicons name="diamond" size={20} color="white" style={{ marginRight: 8 }} />
                        <Text style={styles.purchaseButtonTitle}>Premium Monthly</Text>
                      </View>
                      <Text style={styles.purchaseButtonPrice}>{PRODUCT_DETAILS[PRODUCT_IDS.PREMIUM_MONTHLY].priceUSD}/mo</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>

              {/* Yearly Subscription Button */}
              <TouchableOpacity
                style={[
                  styles.purchaseButton,
                  (isPurchasing || isSubscriptionLoading) && styles.purchaseButtonDisabled
                ]}
                onPress={() => handlePurchase(PRODUCT_IDS.PREMIUM_YEARLY)}
                disabled={isPurchasing || isSubscriptionLoading}
              >
                {isPurchasing || isSubscriptionLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <View style={styles.purchaseButtonContent}>
                      <View style={styles.purchaseButtonLeft}>
                        <Ionicons name="diamond" size={20} color="white" style={{ marginRight: 8 }} />
                        <View>
                          <Text style={styles.purchaseButtonTitle}>Premium Yearly</Text>
                          <Text style={styles.purchaseButtonSavings}>Save 17%!</Text>
                        </View>
                      </View>
                      <Text style={styles.purchaseButtonPrice}>{PRODUCT_DETAILS[PRODUCT_IDS.PREMIUM_YEARLY].priceUSD}/yr</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>

              {/* Restore Purchases Link */}
              <TouchableOpacity
                style={styles.restoreButtonContainer}
                onPress={handleRestorePurchases}
                disabled={isPurchasing || isSubscriptionLoading}
              >
                <Text style={[
                  styles.restoreButtonText,
                  (isPurchasing || isSubscriptionLoading) && styles.restoreButtonTextDisabled
                ]}>
                  Restore Purchases
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
          {user ? (
            <>
              <View style={styles.profileInfo}>
                <Text style={styles.emailText}>{user.email}</Text>
              </View>
              
              <TouchableOpacity
                style={styles.settingItem}
                onPress={handleOpenPrivacyPolicy}
              >
                <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingLabel}>{t('settings.privacyPolicy')}</Text>
                  <Text style={styles.settingDescription}>
                    {t('settings.viewPrivacyPolicy')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.darkGray} />
              </TouchableOpacity>

              <Pressable
                style={styles.settingItem}
                onPressIn={handleDeletePressIn}
                onPressOut={handleDeletePressOut}
              >
                <Ionicons name="trash-outline" size={24} color={COLORS.danger} style={styles.settingIcon} />
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingLabel, { color: COLORS.danger }]}>{t('settings.deleteAccount')}</Text>
                  <Text style={styles.longPressHint}>{t('settings.deleteAccountHoldToConfirm')}</Text>
                </View>
                <View style={styles.longPressProgressContainer}>
                  <Animated.View 
                    style={[
                      styles.longPressProgressBar,
                      {
                        width: longPressProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        })
                      }
                    ]}
                  />
                </View>
              </Pressable>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => router.push('/login')}
              >
                <Ionicons name="log-in-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingLabel}>{t('settings.signIn')}</Text>
                  <Text style={styles.settingDescription}>
                    {t('settings.signInDescription')}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.settingItem}
                onPress={handleOpenPrivacyPolicy}
              >
                <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingLabel}>{t('settings.privacyPolicy')}</Text>
                  <Text style={styles.settingDescription}>
                    {t('settings.viewPrivacyPolicy')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.darkGray} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Testing Section - Only shown in development */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧪 Beta Testing</Text>
          
          <View style={styles.testingButtonContainer}>
            <TouchableOpacity
              style={[
                styles.testingButton, 
                subscription.plan === 'FREE' ? styles.activeTestingButton : styles.inactiveTestingButton
              ]}
              onPress={() => setTestingSubscriptionPlan('FREE')}
            >
              <Text style={[
                styles.testingButtonText,
                subscription.plan === 'FREE' ? styles.activeTestingButtonText : styles.inactiveTestingButtonText
              ]}>
                Switch to FREE (5 cards/day)
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.testingButton, 
                subscription.plan === 'PREMIUM' ? styles.activeTestingButton : styles.inactiveTestingButton
              ]}
              onPress={() => setTestingSubscriptionPlan('PREMIUM')}
            >
              <Text style={[
                styles.testingButtonText,
                subscription.plan === 'PREMIUM' ? styles.activeTestingButtonText : styles.inactiveTestingButtonText
              ]}>
                Switch to PREMIUM (Unlimited)
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Reset Buttons */}
          <View style={styles.resetButtonContainer}>
            <TouchableOpacity
              style={styles.resetCountButton}
              onPress={handleResetFlashcardCount}
            >
              <Ionicons name="refresh" size={16} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.resetCountButtonText}>
                Reset Daily Limits
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.resetCountButton, { backgroundColor: COLORS.secondary }]}
              onPress={handleResetReviewPrompt}
            >
              <Ionicons name="star-outline" size={16} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.resetCountButtonText}>
                Reset Review Prompt
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.resetCountButton, { backgroundColor: COLORS.mediumSurface }]}
              onPress={async () => {
                try {
                  await resetSwipeCounts();
                  Alert.alert(t('common.success') ?? 'Done', 'Streak counter reset to 0.');
                } catch (e) {
                  logger.error('Error resetting streak counter:', e);
                  Alert.alert(t('common.error') ?? 'Error', 'Could not reset streak counter.');
                }
              }}
            >
              <Ionicons name="flame-outline" size={16} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.resetCountButtonText}>
                Reset Streak Counter
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Usage Statistics section removed - internal metrics only */}

        {user && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={24} color="white" style={styles.settingIcon} />
              <View style={styles.settingTextContainer}>
                <Text style={styles.signOutButtonText}>{t('settings.signOut')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Language selector modal */}
      <Modal
        visible={showLanguageSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLanguageSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.selectTargetLanguage')}</Text>
              <TouchableOpacity onPress={() => setShowLanguageSelector(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={languageData}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    targetLanguage === item.code && styles.selectedLanguageItem
                  ]}
                  onPress={() => handleSelectLanguage(item.code)}
                >
                  <Text 
                    style={[
                      styles.languageText,
                      targetLanguage === item.code && styles.selectedLanguageText
                    ]}
                  >
                    {item.name}
                  </Text>
                  {targetLanguage === item.code && (
                    <Ionicons name="checkmark" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowLanguageSelector(false)}
            >
              <Text style={styles.closeButtonText}>{t('settings.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Detection language selector modal */}
      <Modal
        visible={showDetectionSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDetectionSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.forceDetection')}</Text>
              <TouchableOpacity onPress={() => setShowDetectionSelector(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={detectionLanguageData}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    forcedDetectionLanguage === item.code && styles.selectedLanguageItem
                  ]}
                  onPress={() => handleSelectDetectionLanguage(item.code)}
                >
                  <Text 
                    style={[
                      styles.languageText,
                      forcedDetectionLanguage === item.code && styles.selectedLanguageText
                    ]}
                  >
                    {item.name}
                  </Text>
                  {forcedDetectionLanguage === item.code && (
                    <Ionicons name="checkmark" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowDetectionSelector(false)}
            >
              <Text style={styles.closeButtonText}>{t('settings.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Warning Modal */}
      <Modal
        visible={showDeleteWarning}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteModalHeader}>
              <Ionicons name="warning" size={48} color={COLORS.danger} />
              <Text style={styles.deleteModalTitle}>{t('settings.deleteAccountTitle')}</Text>
            </View>
            
            <Text style={styles.deleteModalWarning}>{t('settings.deleteAccountWarning')}</Text>
            <Text style={styles.deleteModalItems}>{t('settings.deleteAccountWarningItems')}</Text>
            
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={handleCancelDelete}
              >
                <Text style={styles.deleteCancelButtonText}>{t('settings.deleteAccountCancelButton')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={handleProceedToConfirm}
              >
                <Text style={styles.deleteConfirmButtonText}>{t('common.continue')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelDelete}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={handleCancelDelete}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <ScrollView 
                contentContainerStyle={styles.deleteModalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.deleteModalContent}>
                  <View style={styles.deleteModalHeader}>
                    <Ionicons name="alert-circle" size={48} color={COLORS.danger} />
                    <Text style={styles.deleteModalTitle}>{t('settings.deleteAccountConfirmTitle')}</Text>
                  </View>
                  
                  <Text style={styles.deleteModalWarning}>{t('settings.deleteAccountConfirmMessage')}</Text>
                  
                  <Text style={styles.deleteModalTypeText}>{t('settings.deleteAccountTypeDelete')}</Text>
                  <TextInput
                    style={styles.deleteConfirmInput}
                    placeholder={t('settings.deleteAccountTypePlaceholder')}
                    placeholderTextColor={COLORS.darkGray}
                    value={deleteConfirmText}
                    onChangeText={setDeleteConfirmText}
                    autoCapitalize="characters"
                    editable={!isDeletingAccount}
                  />
                  
                  <View style={styles.deleteModalButtons}>
                    <TouchableOpacity
                      style={styles.deleteCancelButton}
                      onPress={handleCancelDelete}
                      disabled={isDeletingAccount}
                    >
                      <Text style={styles.deleteCancelButtonText}>{t('settings.deleteAccountCancelButton')}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[
                        styles.deleteFinalButton,
                        (isDeletingAccount || deleteConfirmText !== 'DELETE') && styles.deleteButtonDisabled
                      ]}
                      onPress={handleDeleteAccount}
                      disabled={isDeletingAccount || deleteConfirmText !== 'DELETE'}
                    >
                      {isDeletingAccount ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text style={styles.deleteFinalButtonText}>{t('settings.deleteAccountConfirmButton')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </PokedexLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  section: {
    marginTop: 24,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  settingIcon: {
    marginRight: 16,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: 14,
    color: COLORS.darkGray,
  },
  profileInfo: {
    padding: 16,
  },
  emailText: {
    fontSize: 16,
    color: COLORS.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 10,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.darkGray,
    marginBottom: 16,
    lineHeight: 20,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  selectedLanguageItem: {
    backgroundColor: COLORS.primary + '33', // Semi-transparent primary color
  },
  languageText: {
    fontSize: 16,
    color: COLORS.text,
  },
  selectedLanguageText: {
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.text,
    fontWeight: '500',
  },
  resetButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.darkSurface,
  },
  swapButtonContainer: {
    alignItems: 'flex-start',
    paddingVertical: 20,
    marginHorizontal: 14,
    justifyContent: 'center',
  },
  swapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  swapButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  counterBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  testingButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  testingButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  activeTestingButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  inactiveTestingButton: {
    backgroundColor: 'transparent',
    borderColor: COLORS.darkGray,
  },
  testingButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTestingButtonText: {
    color: '#000',
  },
  inactiveTestingButtonText: {
    color: COLORS.darkGray,
  },
  resetButtonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  resetCountButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  resetCountButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  testingInstructions: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 12,
    lineHeight: 20,
  },
  deleteModalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  deleteModalContent: {
    width: 340,
    maxWidth: '85%',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 16,
    padding: 24,
  },
  deleteModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  deleteModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 12,
    textAlign: 'center',
  },
  deleteModalWarning: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  deleteModalItems: {
    fontSize: 14,
    color: COLORS.darkGray,
    marginBottom: 24,
    lineHeight: 22,
    paddingLeft: 8,
  },
  deleteModalTypeText: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8,
    fontWeight: '600',
  },
  deleteConfirmInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 2,
    borderColor: COLORS.danger,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteCancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.darkGray,
  },
  deleteCancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteConfirmButton: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  deleteConfirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteFinalButton: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  deleteFinalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButtonDisabled: {
    backgroundColor: COLORS.darkGray,
    opacity: 0.5,
  },
  longPressHint: {
    fontSize: 12,
    color: COLORS.darkGray,
    marginTop: 2,
  },
  longPressProgressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    overflow: 'hidden',
  },
  longPressProgressBar: {
    height: '100%',
    backgroundColor: COLORS.danger,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  upgradeHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  upgradeSubtitle: {
    fontSize: 14,
    color: COLORS.darkGray,
  },
  purchaseButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 60,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  purchaseButtonDisabled: {
    backgroundColor: '#A0A0A0',
    opacity: 0.7,
  },
  purchaseButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  purchaseButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  purchaseButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  purchaseButtonSavings: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    opacity: 0.9,
    marginTop: 2,
  },
  purchaseButtonPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  restoreButtonContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingBottom: 20,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  restoreButtonTextDisabled: {
    color: COLORS.darkGray,
    opacity: 0.5,
  },
}); 