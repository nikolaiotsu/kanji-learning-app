import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Animated, Easing } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { COLORS } from '../constants/colors';
import { useLoadingVideoPlayer } from '../context/LoadingVideoContext';

/**
 * Place your custom loading video at: assets/loading.mp4
 * It will play looped and muted while the app initializes (or during Claude API processing).
 * If the video fails to load, the spinner is shown as fallback.
 *
 * @param message - Optional text below the video (e.g. "Examining text specimen...")
 */
const loadingVideoSource = require('../../assets/loading.mp4');

type LoadingVideoScreenProps = {
  /** Optional message shown below the video (e.g. processing step text) */
  message?: string;
};

const FLOAT_DISTANCE = 6;
const FLOAT_DURATION = 1200;

export default function LoadingVideoScreen({ message }: LoadingVideoScreenProps) {
  const [hasError, setHasError] = useState(false);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const preloadedPlayer = useLoadingVideoPlayer();
  const localPlayer = useVideoPlayer(loadingVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const player = preloadedPlayer ?? localPlayer;

  // When using preloaded player, start playback on mount (it was only created, not played)
  useEffect(() => {
    if (preloadedPlayer) {
      preloadedPlayer.play();
    }
  }, [preloadedPlayer]);

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

  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (status === 'error') setHasError(true);
  }, [status]);

  const displayMessage = message ?? 'Loading...';

  // Same layout for both video and fallback: rounded clip, float, same size
  const videoOrSpinner = (hasError || status === 'error') ? (
    <View style={styles.videoClip}>
      <View style={styles.fallbackInner}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    </View>
  ) : (
    <View style={styles.videoClip}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        contentFit="contain"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.videoWrap, { transform: [{ translateY }] }]}>
        {videoOrSpinner}
      </Animated.View>
      <Text style={styles.loadingText}>{displayMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: 10,
    fontSize: 16,
    color: COLORS.text,
  },
});
