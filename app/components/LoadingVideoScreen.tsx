import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Animated, Easing } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';

const loadingVideoSource = require('../../assets/loading.mp4');

type LoadingVideoScreenProps = {
  message?: string;
  compact?: boolean;
  showMessage?: boolean;
};

const FLOAT_DISTANCE = 6;
const FLOAT_DURATION = 1200;

export default function LoadingVideoScreen({
  message,
  compact = false,
  showMessage = true,
}: LoadingVideoScreenProps) {
  const [hasError, setHasError] = useState(false);
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: FLOAT_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: FLOAT_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -FLOAT_DISTANCE],
  });

  const displayMessage = showMessage && !compact ? (message ?? 'Loading...') : undefined;

  const videoOrSpinner = hasError ? (
    <View style={styles.videoClip}>
      <View style={styles.fallbackInner}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    </View>
  ) : (
    <View style={styles.videoClip}>
      <Video
        source={loadingVideoSource}
        style={styles.video}
        isLooping
        isMuted
        shouldPlay
        resizeMode={ResizeMode.CONTAIN}
        onError={() => setHasError(true)}
      />
    </View>
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Animated.View style={[styles.videoWrap, { transform: [{ translateY }] }]}>
        {videoOrSpinner}
      </Animated.View>
      {displayMessage != null && <Text style={styles.loadingText}>{displayMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerCompact: {
    flex: 0,
  },
  videoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoClip: {
    width: 64,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
  },
  video: {
    width: 64,
    height: 64,
  },
  fallbackInner: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: FONTS.sans,
    marginTop: 10,
    fontSize: 16,
    color: COLORS.text,
  },
});
