/**
 * ReviewPromptModal Component
 * 
 * Displays a review prompt to encourage users to rate the app on the App Store/Play Store.
 * 
 * SETUP INSTRUCTIONS:
 * -------------------
 * Before publishing, update the iOS App Store ID in handleRateApp():
 * 
 * 1. Go to App Store Connect (https://appstoreconnect.apple.com)
 * 2. Select your app
 * 3. Find your App ID in the "App Information" section (e.g., 1234567890)
 * 4. Replace 'YOUR_APP_ID' with your actual ID in the appStoreUrl (line ~64)
 *    Example: 'https://apps.apple.com/app/id1234567890'
 * 
 * BEHAVIOR:
 * ---------
 * - iOS/Android (Production): Shows native in-app review dialog via expo-store-review
 * - iOS/Android (Development/Fallback): Opens App Store/Play Store directly via URL
 * - Users who click "Rate" will never see this prompt again (tracked via AsyncStorage)
 * 
 * NOTE: The native review prompt only works in production builds from the App Store/Play Store.
 * In TestFlight or development builds, it may fall back to opening the store URL.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as StoreReview from 'expo-store-review';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { recordReviewAction, getReviewPromptState } from '../../services/reviewPromptService';
import { logger } from '../../utils/logger';

interface ReviewPromptModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ReviewPromptModal({ visible, onClose }: ReviewPromptModalProps) {
  const { t } = useTranslation();
  const [selectedStars, setSelectedStars] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState(false);

  // Safety check: If modal becomes visible, verify user hasn't already reviewed
  useEffect(() => {
    if (visible) {
      const checkReviewStatus = async () => {
        const state = await getReviewPromptState();
        if (state.hasReviewed) {
          logger.log('Review prompt modal: User has already reviewed, auto-closing modal');
          onClose();
        }
      };
      checkReviewStatus();
    }
  }, [visible, onClose]);

  const handleStarPress = (starIndex: number) => {
    setSelectedStars(starIndex);
  };

  const handleRateApp = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      // Record that user chose to rate
      await recordReviewAction('rate');

      // Check if the device supports in-app review
      if (await StoreReview.hasAction()) {
        // Request the in-app review (native prompt - iOS/Android)
        await StoreReview.requestReview();
        logger.log('Review prompt: Requested in-app review');
      } else {
        // Fallback: Open the App Store page directly
        // TODO: Replace 'YOUR_APP_ID' with actual App Store ID from App Store Connect
        const appStoreUrl = Platform.select({
          ios: 'https://apps.apple.com/app/idYOUR_APP_ID', // Replace with actual App Store ID (e.g., id1234567890)
          android: 'https://play.google.com/store/apps/details?id=com.bluve01.kanjilearningapp',
        });
        
        if (appStoreUrl) {
          logger.log('Review prompt: Opening App Store URL:', appStoreUrl);
          
          // Check if the URL can be opened
          const canOpen = await Linking.canOpenURL(appStoreUrl);
          if (canOpen) {
            await Linking.openURL(appStoreUrl);
            logger.log('Review prompt: Successfully opened App Store');
          } else {
            logger.error('Review prompt: Cannot open App Store URL');
            Alert.alert(
              t('common.error'),
              'Unable to open the App Store. Please visit the App Store manually to leave a review.'
            );
          }
        } else {
          logger.error('Review prompt: No App Store URL configured');
        }
      }
      
      onClose();
    } catch (error) {
      logger.error('Error requesting review:', error);
      // Show user-friendly error message
      Alert.alert(
        t('common.error'),
        'Unable to open the review page. Please try again later.'
      );
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaybeLater = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      await recordReviewAction('later');
      logger.log('Review prompt: User chose "Maybe Later"');
      onClose();
    } catch (error) {
      logger.error('Error recording "Maybe Later" action:', error);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNoThanks = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      await recordReviewAction('no-thanks');
      logger.log('Review prompt: User chose "No Thanks"');
      onClose();
    } catch (error) {
      logger.error('Error recording "No Thanks" action:', error);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Title */}
          <Text style={styles.title}>{t('reviewPrompt.title')}</Text>

          {/* Star Rating Display */}
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => handleStarPress(star)}
                disabled={isProcessing}
                style={styles.starButton}
              >
                <Ionicons
                  name={star <= selectedStars ? 'star' : 'star-outline'}
                  size={40}
                  color={star <= selectedStars ? COLORS.secondary : COLORS.darkGray}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Message */}
          <Text style={styles.message}>{t('reviewPrompt.message')}</Text>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            {/* Rate Button - Primary */}
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleRateApp}
              disabled={isProcessing}
            >
              <Text style={styles.primaryButtonText}>
                {t('reviewPrompt.rateButton')}
              </Text>
            </TouchableOpacity>

            {/* Secondary Buttons Row */}
            <View style={styles.secondaryButtonsRow}>
              {/* Maybe Later */}
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleMaybeLater}
                disabled={isProcessing}
              >
                <Text style={styles.secondaryButtonText}>
                  {t('reviewPrompt.laterButton')}
                </Text>
              </TouchableOpacity>

              {/* No Thanks */}
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleNoThanks}
                disabled={isProcessing}
              >
                <Text style={styles.secondaryButtonText}>
                  {t('reviewPrompt.noThanksButton')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  message: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  buttonsContainer: {
    width: '100%',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  secondaryButton: {
    backgroundColor: COLORS.mediumSurface,
    flex: 1,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});

