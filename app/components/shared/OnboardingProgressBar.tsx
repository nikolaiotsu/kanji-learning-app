import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboardingProgress } from '../../context/OnboardingProgressContext';
import { COLORS } from '../../constants/colors';

const PROGRESS_BAR_HEIGHT = 3;
const ANIMATION_DURATION = 200;
const PADDING_BELOW_SAFE_AREA = 8;

/** Use when bar is inside app layout (e.g. PokedexLayout). Single place to adjust if header/layout changes. */
export const ONBOARDING_PROGRESS_BAR_APP_TOP_OFFSET = 16;

/**
 * Minimum paddingTop for content below the progress bar.
 * = PADDING_BELOW_SAFE_AREA + PROGRESS_BAR_HEIGHT + gap (8px).
 * Use in onboarding screens to prevent loading animation from overlapping the bar on small screens.
 */
export const ONBOARDING_PROGRESS_BAR_RESERVED_TOP = PADDING_BELOW_SAFE_AREA + PROGRESS_BAR_HEIGHT + 8;

type OnboardingProgressBarProps = {
  /**
   * When set, use this value as `top` (e.g. app view where container is already below safe area).
   * When undefined, use safe area insets so the bar sits below status bar/notch (onboarding).
   * Lets callers adapt to device/layout (e.g. pass different values per screen or from layout constants).
   */
  topOffset?: number;
};

export default function OnboardingProgressBar({ topOffset }: OnboardingProgressBarProps = {}) {
  const insets = useSafeAreaInsets();
  const { progress, isProgressBarVisible } = useOnboardingProgress();
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const top = topOffset !== undefined ? topOffset : insets.top + PADDING_BELOW_SAFE_AREA;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: ANIMATION_DURATION,
      useNativeDriver: false,
    }).start();
  }, [progress, animatedWidth]);

  if (!isProgressBarVisible) {
    return null;
  }

  const fillWidth = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.container, styles.elevated, { top }]} pointerEvents="none">
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: fillWidth },
          ]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    // top set dynamically via useSafeAreaInsets() so bar sits below status bar / notch
  },
  // Ensure progress bar appears above absolutely positioned headers (e.g. flashcards screen)
  elevated: {
    zIndex: 1200,
    elevation: 1200,
  },
  track: {
    height: PROGRESS_BAR_HEIGHT,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
});
