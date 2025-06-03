import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../../constants/colors';

interface TexturedBackgroundProps {
  style?: ViewStyle;
  variant?: 'gradient' | 'subtle' | 'modern' | 'radial' | 'default';
  children?: React.ReactNode;
}

export default function TexturedBackground({ 
  style, 
  variant = 'gradient', 
  children 
}: TexturedBackgroundProps) {
  
  const getBackgroundLayers = () => {
    switch (variant) {
      case 'gradient':
        return (
          <>
            {/* Base layer */}
            <View style={[styles.baseLayer, { backgroundColor: '#006ad6' }]} />
            {/* Gradient simulation with multiple layers */}
            <View style={[styles.gradientLayer1, { backgroundColor: '#004ba0' }]} />
            <View style={[styles.gradientLayer2, { backgroundColor: '#003875' }]} />
            {/* Subtle texture overlay */}
            <View style={styles.textureOverlay} />
          </>
        );
      
      case 'subtle':
        return (
          <>
            <View style={[styles.baseLayer, { backgroundColor: '#006ad6' }]} />
            <View style={styles.subtlePattern1} />
            <View style={styles.subtlePattern2} />
            <View style={styles.noiseOverlay} />
          </>
        );
      
      case 'modern':
        return (
          <>
            <View style={[styles.baseLayer, { backgroundColor: '#006ad6' }]} />
            <View style={styles.modernLayer1} />
            <View style={styles.modernLayer2} />
            <View style={styles.modernAccent} />
            <View style={styles.modernGlow} />
          </>
        );
      
      case 'radial':
        return (
          <>
            <View style={[styles.baseLayer, { backgroundColor: '#004080' }]} />
            <View style={styles.radialCenter} />
            <View style={styles.radialMid} />
            <View style={styles.radialOuter} />
          </>
        );
      
      default:
        return <View style={[styles.baseLayer, { backgroundColor: COLORS.background }]} />;
    }
  };

  return (
    <View style={[styles.container, style]}>
      {getBackgroundLayers()}
      {children && <View style={styles.contentLayer}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  baseLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentLayer: {
    flex: 1,
    zIndex: 10,
  },
  
  // Gradient variant layers
  gradientLayer1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.7,
    transform: [{ skewY: '2deg' }],
  },
  gradientLayer2: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.5,
    transform: [{ skewY: '-1deg' }],
  },
  textureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    opacity: 0.8,
  },
  
  // Subtle variant patterns
  subtlePattern1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0074e6',
    opacity: 0.3,
    transform: [{ rotate: '45deg' }, { scaleX: 2 }],
  },
  subtlePattern2: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0074e6',
    opacity: 0.2,
    transform: [{ rotate: '-45deg' }, { scaleY: 1.5 }],
  },
  noiseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    opacity: 0.9,
  },
  
  // Modern variant layers
  modernLayer1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: '#0074e6',
    opacity: 0.4,
    transform: [{ skewX: '1deg' }],
  },
  modernLayer2: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#005bb8',
    opacity: 0.6,
    transform: [{ skewX: '-0.5deg' }],
  },
  modernAccent: {
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
    height: '20%',
    backgroundColor: '#0080ff',
    opacity: 0.15,
    transform: [{ skewY: '0.5deg' }],
  },
  modernGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 128, 255, 0.05)',
    opacity: 0.8,
  },
  
  // Radial variant layers
  radialCenter: {
    position: 'absolute',
    top: '10%',
    left: '20%',
    width: '60%',
    height: '60%',
    backgroundColor: '#0080ff',
    borderRadius: 1000,
    opacity: 0.4,
  },
  radialMid: {
    position: 'absolute',
    top: '5%',
    left: '10%',
    width: '80%',
    height: '80%',
    backgroundColor: '#006ad6',
    borderRadius: 1000,
    opacity: 0.3,
  },
  radialOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#004080',
    opacity: 0.2,
  },
}); 