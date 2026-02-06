import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/colors';

/**
 * Custom header background that matches TexturedBackground liquid variant
 * Used to ensure header area has the same shading as the content below
 */
export default function HeaderTexturedBackground() {
  return (
    <View style={styles.container}>
      {/* Solid base - matches liquid variant */}
      <View style={[styles.baseLayer, { backgroundColor: COLORS.background }]} />
      {/* Single subtle diagonal gradient for depth - minimal stops */}
      <LinearGradient
        colors={[
          'rgba(59, 130, 246, 0.025)',
          'transparent',
          'rgba(30, 64, 175, 0.02)',
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.baseLayer}
      />
      {/* Single top-to-bottom shading - very soft, 3 stops only */}
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0.03)',
          'transparent',
          'rgba(0, 0, 0, 0.04)',
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.baseLayer}
      />
      {/* Subtle grain texture overlay */}
      <View style={styles.grainOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  baseLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  grainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(128, 128, 128, 0.04)',
    opacity: 1,
  },
});
