/**
 * HighlightButtonLongPressTooltipModal
 *
 * Instructional modal shown when the user taps the info icon next to the highlight button
 * (outside of walkthrough mode). Reminds that long-pressing scans the whole page.
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { setHighlightButtonLongPressTooltipDontShowAgain } from '../../services/highlightButtonLongPressTooltipService';

interface HighlightButtonLongPressTooltipModalProps {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
  /** Called when user taps "Continue to highlight" - dismiss and enter highlight mode */
  onContinueToHighlight?: () => void;
}

export default function HighlightButtonLongPressTooltipModal({
  visible,
  onClose,
  onProceed,
  onContinueToHighlight,
}: HighlightButtonLongPressTooltipModalProps) {
  const { t } = useTranslation();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (visible) setDontShowAgain(false);
  }, [visible]);

  const handleGotIt = async () => {
    if (dontShowAgain) {
      await setHighlightButtonLongPressTooltipDontShowAgain(true);
    }
    onClose();
    if (Platform.OS === 'android') {
      setTimeout(onProceed, 280);
    } else {
      onProceed();
    }
  };

  const handleContinueToHighlight = async () => {
    if (dontShowAgain) {
      await setHighlightButtonLongPressTooltipDontShowAgain(true);
    }
    onClose();
    if (Platform.OS === 'android') {
      setTimeout(() => onContinueToHighlight?.(), 280);
    } else {
      onContinueToHighlight?.();
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
      onDismiss={Platform.OS === 'ios' ? () => { onClose(); onProceed(); } : undefined}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{t('imageHighlighter.longPressTooltip.title')}</Text>
          <Text style={styles.body}>{t('imageHighlighter.longPressTooltip.body')}</Text>
          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <MaterialCommunityIcons name="marker" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{t('imageHighlighter.longPressTooltip.tapBullet')}</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="timer-outline" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{t('imageHighlighter.longPressTooltip.longPressBullet')}</Text>
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
              {t('imageHighlighter.longPressTooltip.dontShowAgain')}
            </Text>
          </TouchableOpacity>
          <View style={styles.buttonRow}>
            {onContinueToHighlight != null && (
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={handleContinueToHighlight}
              >
                <Text style={[styles.buttonText, styles.buttonSecondaryText]}>
                  {t('imageHighlighter.longPressTooltip.continueToHighlight')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.button} onPress={handleGotIt}>
              <Text style={styles.buttonText}>{t('imageHighlighter.longPressTooltip.gotIt')}</Text>
            </TouchableOpacity>
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  buttonSecondaryText: {
    color: COLORS.primary,
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
