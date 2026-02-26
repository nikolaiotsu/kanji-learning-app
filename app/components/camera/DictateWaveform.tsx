import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  SharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/colors';

const BAR_WIDTH = 4;
const BAR_GAP = 3;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 28;
const VOLUME_MIN = -2;
const VOLUME_MAX = 10;

/** Per-bar scale multipliers for natural equalizer look (slightly different heights) */
const BAR_MULTIPLIERS = [0.5, 0.75, 1, 0.85, 0.6];

export interface DictateWaveformProps {
  /** Shared value from useDictateSpeechRecognition; range -2 to 10 */
  volume: SharedValue<number>;
}

export default function DictateWaveform({ volume }: DictateWaveformProps) {
  return (
    <View style={styles.container}>
      {BAR_MULTIPLIERS.map((multiplier, index) => (
        <WaveformBar key={index} volume={volume} multiplier={multiplier} />
      ))}
    </View>
  );
}

interface WaveformBarProps {
  volume: SharedValue<number>;
  multiplier: number;
}

function WaveformBar({ volume, multiplier }: WaveformBarProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const raw = volume.value;
    const normalized = interpolate(
      raw,
      [VOLUME_MIN, VOLUME_MAX],
      [0, 1],
      'clamp'
    );
    const effectiveNormalized = normalized * multiplier;
    const height = MIN_HEIGHT + effectiveNormalized * (MAX_HEIGHT - MIN_HEIGHT);
    return {
      height: withTiming(height, { duration: 80 }),
    };
  }, [multiplier]);

  return (
    <View style={styles.barWrapper}>
      <Animated.View style={[styles.bar, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MAX_HEIGHT + 4,
    gap: BAR_GAP,
  },
  barWrapper: {
    width: BAR_WIDTH,
    height: MAX_HEIGHT + 4,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: BAR_WIDTH,
    minHeight: MIN_HEIGHT,
    borderRadius: 2,
    backgroundColor: COLORS.error,
  },
});
