import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import FloatingBadgeImage from './FloatingBadgeImage';
import type { Badge } from '../../services/badgeService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FADE_DURATION = 200;

interface BadgeDetailModalProps {
  visible: boolean;
  badge: Badge | null;
  onDismiss: () => void;
}

/**
 * Badge detail overlay using Animated.View instead of native Modal.
 * This avoids the native Modal's flash-on-unmount issue (e.g. briefly
 * showing the language selection modal or other content when dismissing).
 */
export default function BadgeDetailModal({
  visible,
  badge,
  onDismiss,
}: BadgeDetailModalProps) {
  const { t } = useTranslation();
  const [shouldRender, setShouldRender] = useState(false);
  const [displayedBadge, setDisplayedBadge] = useState<Badge | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && badge) {
      setDisplayedBadge(badge);
      setShouldRender(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start();
    } else if (shouldRender) {
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

  const { badgeType, threshold, name, description } = displayedBadge;
  const title = t(`badgeCelebration.badgeName.${badgeType}_${threshold}`, { defaultValue: name });
  const subtext = t(`badgeCelebration.description.${badgeType}_${threshold}`, { defaultValue: description });

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
          pointerEvents: visible ? 'auto' : 'none',
        },
      ]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <View style={styles.modalCard} pointerEvents="auto">
        <View style={styles.badgeContainer}>
          <FloatingBadgeImage badge={displayedBadge} size="large" withBackground />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtext}>{subtext}</Text>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          activeOpacity={0.8}
        >
          <Text style={styles.dismissButtonText}>{t('badges.detail.gotIt')}</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
    elevation: 9999,
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
    fontFamily: FONTS.sansSemiBold,
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  subtext: {
    fontFamily: FONTS.sans,
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
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
