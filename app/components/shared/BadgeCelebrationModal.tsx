import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import FloatingBadgeImage from './FloatingBadgeImage';
import type { Badge } from '../../services/badgeService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FADE_DURATION = 250;

interface BadgeCelebrationModalProps {
  visible: boolean;
  badge: Badge | null;
  onDismiss: () => void;
}

/**
 * Badge celebration overlay using Animated.View instead of native Modal.
 * This avoids the native Modal's flash-on-unmount issue.
 */
export default function BadgeCelebrationModal({
  visible,
  badge,
  onDismiss,
}: BadgeCelebrationModalProps) {
  const { t } = useTranslation();
  const [shouldRender, setShouldRender] = useState(false);
  const [displayedBadge, setDisplayedBadge] = useState<Badge | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && badge) {
      // Show: set state, then fade in
      setDisplayedBadge(badge);
      setShouldRender(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start();
    } else if (shouldRender) {
      // Hide: fade out, then clear state
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
        setDisplayedBadge(null);
      });
    }
  }, [visible, badge]);

  if (!shouldRender || !displayedBadge) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
          // Block touches only when visible; when fading out, touches pass through
          pointerEvents: visible ? 'auto' : 'none',
        },
      ]}
    >
      <View style={styles.modalContent}>
        <Text style={styles.title}>{t('badgeCelebration.title')}</Text>

        <View style={styles.badgeImageContainer}>
          <FloatingBadgeImage badge={displayedBadge} size="large" withBackground />
        </View>

        <Text style={styles.badgeName}>
          {t(`badgeCelebration.badgeName.${displayedBadge.badgeType}_${displayedBadge.threshold}`, { defaultValue: displayedBadge.name })}
        </Text>
        <Text style={styles.description}>
          {t(`badgeCelebration.description.${displayedBadge.badgeType}_${displayedBadge.threshold}`, { defaultValue: displayedBadge.description })}
        </Text>

        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          activeOpacity={0.8}
        >
          <Text style={styles.dismissButtonText}>{t('common.dismiss')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
    elevation: 9999,
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  badgeImageContainer: {
    marginBottom: 16,
  },
  badgeName: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  dismissButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  dismissButtonText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
