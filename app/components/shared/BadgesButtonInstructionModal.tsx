/**
 * BadgesButtonInstructionModal
 *
 * Instructional modal shown when the user presses the badges button for the first time.
 * Explains achievement badges and WordDex mastery.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { setBadgesButtonInstructionsDontShowAgain } from '../../services/badgesButtonInstructionService';

interface BadgesButtonInstructionModalProps {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
}

export default function BadgesButtonInstructionModal({
  visible,
  onClose,
  onProceed,
}: BadgesButtonInstructionModalProps) {
  const { t } = useTranslation();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (visible) setDontShowAgain(false);
  }, [visible]);

  const handleNice = async () => {
    if (dontShowAgain) {
      await setBadgesButtonInstructionsDontShowAgain(true);
    }
    onClose();
    onProceed();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        handleNice();
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{t('badges.instruction.title')}</Text>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <Ionicons name="medal" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{t('badges.instruction.collectBullet')}</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="star" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{t('badges.instruction.masterBullet')}</Text>
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
              {t('badges.instruction.dontShowAgain')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleNice}>
            <Text style={styles.buttonText}>{t('badges.instruction.nice')}</Text>
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
  bullets: {
    marginBottom: 20,
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
