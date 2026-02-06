import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '../../context/SubscriptionContext';
import { useOCRCounter } from '../../context/OCRCounterContext';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { Ionicons } from '@expo/vector-icons';
import { PRODUCT_IDS } from '../../constants/config';

const SubscriptionTestButton: React.FC = () => {
  const { t } = useTranslation();
  const { 
    subscription, 
    isLoading, 
    error, 
    purchaseSubscription, 
    restorePurchases 
  } = useSubscription();
  
  const { ocrCount, maxOCRScans, remainingScans, canPerformOCR } = useOCRCounter();

  const handleTestPurchase = async () => {
    Alert.alert(
      t('subscription.test.purchaseTitle'),
      t('subscription.test.purchaseMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('subscription.test.purchase'), 
          style: 'default', 
          onPress: async () => {
            const success = await purchaseSubscription(PRODUCT_IDS.PREMIUM_MONTHLY);
            if (success) {
              Alert.alert(t('common.success'), t('subscription.test.premiumActivated'));
            }
          }
        }
      ]
    );
  };

  const handleTestRestore = async () => {
    const success = await restorePurchases();
    if (success) {
      Alert.alert(t('subscription.test.restored'), t('subscription.test.restoredMessage'));
    } else {
      Alert.alert(t('subscription.test.noPurchaseFound'), t('subscription.test.noPurchaseMessage'));
    }
  };

  const isPremium = subscription.plan === 'PREMIUM' && subscription.isActive;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Subscription Test</Text>
      
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Ionicons 
            name={isPremium ? "diamond" : "star-outline"} 
            size={20} 
            color={isPremium ? COLORS.premium : COLORS.primary} 
          />
          <Text style={styles.statusText}>
            Current Plan: {subscription.plan}
          </Text>
        </View>
        
        <View style={styles.statusRow}>
          <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
          <Text style={styles.statusText}>
            OCR Usage: {ocrCount}/{maxOCRScans} ({remainingScans} remaining)
          </Text>
        </View>
        
        <View style={styles.statusRow}>
          <Ionicons 
            name={canPerformOCR ? "checkmark-circle" : "close-circle"} 
            size={20} 
            color={canPerformOCR ? COLORS.success : COLORS.error} 
          />
          <Text style={[styles.statusText, !canPerformOCR && styles.limitText]}>
            {canPerformOCR ? 'Can perform OCR' : 'OCR limit reached'}
          </Text>
        </View>
      </View>

      {!isPremium && (
        <TouchableOpacity 
          style={styles.purchaseButton} 
          onPress={handleTestPurchase}
          disabled={isLoading}
        >
          <Ionicons name="diamond" size={16} color="white" />
          <Text style={styles.buttonText}>
            {isLoading ? 'Processing...' : 'Test Premium Purchase'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity 
        style={[styles.restoreButton, isPremium && styles.premiumButton]} 
        onPress={handleTestRestore}
        disabled={isLoading}
      >
        <Ionicons name="refresh" size={16} color={isPremium ? COLORS.premium : COLORS.primary} />
        <Text style={[styles.restoreText, isPremium && styles.premiumText]}>
          Test Restore Purchase
        </Text>
      </TouchableOpacity>

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      <Text style={styles.devNote}>
        📱 Development Mode: Simulated purchases for testing
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    margin: 16,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: COLORS.darkSurface,
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontFamily: FONTS.sans,
    color: COLORS.text,
    fontSize: 14,
  },
  limitText: {
    color: COLORS.error,
  },
  purchaseButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    gap: 8,
  },
  restoreButton: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginBottom: 8,
    gap: 8,
  },
  premiumButton: {
    borderColor: COLORS.premium,
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  restoreText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  premiumText: {
    fontFamily: FONTS.sans,
    color: COLORS.premium,
  },
  errorText: {
    fontFamily: FONTS.sans,
    color: COLORS.error,
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 8,
  },
  devNote: {
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default SubscriptionTestButton; 