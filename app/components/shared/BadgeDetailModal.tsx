import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { COLORS } from '../../constants/colors';
import FloatingBadgeImage from './FloatingBadgeImage';
import type { Badge } from '../../services/badgeService';

function getBadgeDisplayText(badge: Badge): { title: string; subtext: string } {
  if (badge.badgeType === 'cards_created' && badge.threshold === 1) {
    return {
      title: 'Flashcard Creation Badge 1',
      subtext: 'Given to the collector who has collected one flashcard.',
    };
  }
  return {
    title: badge.name,
    subtext: badge.description,
  };
}

interface BadgeDetailModalProps {
  visible: boolean;
  badge: Badge | null;
  onDismiss: () => void;
}

export default function BadgeDetailModal({
  visible,
  badge,
  onDismiss,
}: BadgeDetailModalProps) {
  if (!badge) return null;

  const { title, subtext } = getBadgeDisplayText(badge);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={styles.modalCard} pointerEvents="box-only">
          <View style={styles.badgeContainer}>
            <FloatingBadgeImage badge={badge} size="large" withBackground />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtext}>{subtext}</Text>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: COLORS.mediumSurface,
    alignItems: 'center',
  },
  badgeContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  subtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  dismissButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  dismissButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
