import React, { useLayoutEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useBadge } from './context/BadgeContext';
import FloatingBadgeImage from './components/shared/FloatingBadgeImage';
import BadgeDetailModal from './components/shared/BadgeDetailModal';
import type { Badge } from './services/badgeService';
import { COLORS } from './constants/colors';

const GOLD_COLOR = COLORS.pokedexAmberGlow;
const GOLD_GLOW_COLOR = '#FBBF24';
const BADGES_PER_ROW = 3;
const BADGE_GAP = 16;

function BadgeHeaderIcon() {
  return (
    <View style={styles.headerIconWrapper}>
      <View style={styles.headerMedalFrame}>
        <View style={styles.headerMedalContainer}>
          <Ionicons name="medal-outline" size={28} color={GOLD_COLOR} />
        </View>
      </View>
    </View>
  );
}

const TOP_STRIP_HEIGHT = 0;
const BOTTOM_STRIP_HEIGHT = 32;
const CORNER_ACCENT_INSET = 16;
const CORNER_ACCENT_SIZE = 12;
const FRAME_PADDING = 16;
const INNER_BORDER_RADIUS = 16;
const INNER_BORDER_WIDTH = 2;

function BadgeDisplayArea({
  onBadgePress,
}: {
  onBadgePress: (badge: Badge) => void;
}) {
  const { earnedBadges, pendingBadge } = useBadge();
  const badgesToShow = useMemo(() => {
    const earned = earnedBadges
      .map((ub) => ub.badge)
      .filter((b): b is NonNullable<typeof b> => !!b);
    const list = pendingBadge && !earned.some((b) => b.id === pendingBadge.id)
      ? [pendingBadge, ...earned]
      : earned;
    // Sort by threshold ascending so grid shows: row1 = 1, 3, 10; row2 = 25, 50, 100; row3 = 250
    return [...list].sort((a, b) => a.threshold - b.threshold);
  }, [earnedBadges, pendingBadge]);

  return (
    <View style={styles.badgeDisplayOuter}>
      <View style={styles.badgeDisplayInner}>
        <LinearGradient
          colors={[
            'rgba(59, 130, 246, 0.02)',
            'transparent',
            'rgba(15, 23, 42, 0.3)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.cornerAccent, styles.cornerTopLeft]} />
        <View style={[styles.cornerAccent, styles.cornerTopRight]} />
        <View style={[styles.cornerAccent, styles.cornerBottomLeft]} />
        <View style={[styles.cornerAccent, styles.cornerBottomRight]} />
        <FlatList
          data={badgesToShow}
          keyExtractor={(item) => item.id}
          numColumns={BADGES_PER_ROW}
          contentContainerStyle={styles.badgeGridContent}
          columnWrapperStyle={styles.badgeGridRow}
          renderItem={({ item }) => (
            <View style={styles.badgeCell}>
              <TouchableOpacity
                onPress={() => onBadgePress(item)}
                activeOpacity={0.8}
                style={styles.badgeTouchable}
              >
                <FloatingBadgeImage badge={item} size="small" withBackground />
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </View>
  );
}

export default function BadgesScreen() {
  const navigation = useNavigation();
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <BadgeHeaderIcon />,
    });
  }, [navigation]);

  const handleBadgePress = (badge: Badge) => {
    setSelectedBadge(badge);
    setDetailModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.content}>
        <BadgeDisplayArea onBadgePress={handleBadgePress} />
        {/* Rendered outside overflow:hidden so overlay can cover full screen */}
        <BadgeDetailModal
          visible={detailModalVisible}
          badge={selectedBadge}
          onDismiss={() => {
            setDetailModalVisible(false);
            setSelectedBadge(null);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  headerMedalFrame: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerMedalContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GOLD_GLOW_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingTop: TOP_STRIP_HEIGHT + FRAME_PADDING,
    paddingBottom: BOTTOM_STRIP_HEIGHT + FRAME_PADDING,
    paddingHorizontal: FRAME_PADDING,
  },
  badgeDisplayOuter: {
    flex: 1,
    position: 'relative',
  },
  badgeDisplayInner: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: INNER_BORDER_RADIUS,
    borderWidth: INNER_BORDER_WIDTH,
    borderColor: COLORS.appleLiquidGrey,
    overflow: 'hidden',
  },
  badgeGridContent: {
    padding: BADGE_GAP,
    paddingBottom: BOTTOM_STRIP_HEIGHT + BADGE_GAP,
  },
  badgeGridRow: {
    justifyContent: 'flex-start',
    marginBottom: BADGE_GAP,
  },
  badgeCell: {
    width: '33.33%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  badgeTouchable: {
    alignItems: 'center',
  },
  cornerAccent: {
    position: 'absolute',
    width: CORNER_ACCENT_SIZE,
    height: CORNER_ACCENT_SIZE,
    borderColor: 'rgba(251, 191, 36, 0.85)',
    borderWidth: 1,
    borderRadius: CORNER_ACCENT_SIZE / 2,
    zIndex: 10,
    elevation: 10,
  },
  cornerTopLeft: {
    top: CORNER_ACCENT_INSET,
    left: CORNER_ACCENT_INSET,
  },
  cornerTopRight: {
    top: CORNER_ACCENT_INSET,
    right: CORNER_ACCENT_INSET,
  },
  cornerBottomLeft: {
    bottom: CORNER_ACCENT_INSET,
    left: CORNER_ACCENT_INSET,
  },
  cornerBottomRight: {
    bottom: CORNER_ACCENT_INSET,
    right: CORNER_ACCENT_INSET,
  },
});
