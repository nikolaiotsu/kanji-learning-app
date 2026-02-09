import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useOnboardingProgress } from '../../context/OnboardingProgressContext';
import { COLORS } from '../../constants/colors';
const PROGRESS_BAR_HEIGHT = 3;
const ANIMATION_DURATION = 200;

export default function OnboardingProgressBar() {
  const { progress, isProgressBarVisible } = useOnboardingProgress();
  const animatedWidth = useRef(new Animated.Value(0)).current;

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
    <View style={[styles.container, styles.elevated]} pointerEvents="none">
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
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
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
