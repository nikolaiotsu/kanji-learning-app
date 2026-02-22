/**
 * CollectionsButtonInstructionModal
 *
 * Instructional modal shown when the user presses the collections button for the first time.
 * Explains deck selection, long press to focus, and swipe to delete.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { setCollectionsButtonInstructionsDontShowAgain } from '../../services/collectionsButtonInstructionService';

interface CollectionsButtonInstructionModalProps {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
}

export default function CollectionsButtonInstructionModal({
  visible,
  onClose,
  onProceed,
}: CollectionsButtonInstructionModalProps) {
  const { t } = useTranslation();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (visible) setDontShowAgain(false);
  }, [visible]);

  const handleGotIt = async () => {
    if (dontShowAgain) {
      await setCollectionsButtonInstructionsDontShowAgain(true);
    }
    onClose();
    // Only open deck selector AFTER this modal has fully dismissed to avoid invisible overlay bug.
    // onDismiss (iOS) fires when modal is gone. Android has no onDismiss, so use setTimeout fallback.
    if (Platform.OS === 'android') {
      setTimeout(onProceed, 500);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        handleGotIt();
      }}
      onDismiss={Platform.OS === 'ios' ? onProceed : undefined}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{t('review.collectionsInstruction.title')}</Text>

          <Text style={styles.body}>{t('review.collectionsInstruction.body')}</Text>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <Ionicons name="hand-left" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{t('review.collectionsInstruction.longPressBullet')}</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="chevron-back" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{t('review.collectionsInstruction.swipeBullet')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setDontShowAgain(!dontShowAgain)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, dontShowAgain && styles.checkboxSelected]}>
              {dontShowAgain && <Ionicons name="checkmark" size={14} color={COLORS.text} />}
            </View>
            <Text style={styles.checkboxLabel}>
              {t('review.collectionsInstruction.dontShowAgain')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleGotIt}>
            <Text style={styles.buttonText}>{t('review.collectionsInstruction.gotIt')}</Text>
          </TouchableOpacity>
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
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 16,
  },
  bullets: {
    marginBottom: 20,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bulletIcon: {
    marginRight: 10,
  },
  bulletText: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.textSecondary,
    flex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
  },
  checkboxLabel: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
