import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/colors';

interface TexturedBackgroundProps {
  style?: ViewStyle;
  variant?: 'gradient' | 'subtle' | 'modern' | 'radial' | 'default';
  children?: React.ReactNode;
}

export default function TexturedBackground({ 
  style, 
  variant = 'modern', 
  children 
}: TexturedBackgroundProps) {
  
  const getBackgroundLayers = () => {
    switch (variant) {
      case 'gradient':
        return (
          <>
            {/* Deep navy base with gradient */}
            <LinearGradient
              colors={['#0F172A', '#1E293B', '#0F172A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Blue accent gradient */}
            <LinearGradient
              colors={['rgba(59, 130, 246, 0.15)', 'rgba(30, 64, 175, 0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientLayer1}
            />
            {/* Subtle depth layer */}
            <View style={styles.textureOverlay} />
          </>
        );
      
      case 'subtle':
        return (
          <>
            <LinearGradient
              colors={['#0F172A', '#1E3A5F', '#0F172A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Subtle blue tint */}
            <LinearGradient
              colors={['rgba(59, 130, 246, 0.08)', 'transparent', 'rgba(59, 130, 246, 0.05)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.subtlePattern1}
            />
            <View style={styles.noiseOverlay} />
          </>
        );
      
      case 'modern':
        return (
          <>
            {/* Rich deep blue base */}
            <LinearGradient
              colors={['#0A1628', '#0F2847', '#0A1628']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Vibrant blue accent from top */}
            <LinearGradient
              colors={['rgba(59, 130, 246, 0.2)', 'rgba(37, 99, 235, 0.1)', 'transparent']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 0.6 }}
              style={styles.modernLayer1}
            />
            {/* Bottom ambient glow */}
            <LinearGradient
              colors={['transparent', 'rgba(30, 58, 138, 0.15)', 'rgba(15, 23, 42, 0.8)']}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.modernLayer2}
            />
            {/* Subtle center spotlight */}
            <LinearGradient
              colors={['rgba(96, 165, 250, 0.08)', 'transparent']}
              start={{ x: 0.5, y: 0.3 }}
              end={{ x: 0.5, y: 0.7 }}
              style={styles.modernGlow}
            />
          </>
        );
      
      case 'radial':
        return (
          <>
            {/* Dark base */}
            <View style={[styles.baseLayer, { backgroundColor: '#0A1628' }]} />
            {/* Radial blue center glow */}
            <LinearGradient
              colors={['rgba(59, 130, 246, 0.25)', 'rgba(37, 99, 235, 0.15)', 'transparent']}
              start={{ x: 0.5, y: 0.3 }}
              end={{ x: 0.5, y: 0.8 }}
              style={styles.radialCenter}
            />
            {/* Edge vignette */}
            <LinearGradient
              colors={['transparent', 'rgba(10, 22, 40, 0.6)']}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.radialOuter}
            />
          </>
        );
      
      default:
        return (
          <View style={[styles.baseLayer, { backgroundColor: COLORS.background }]} />
        );
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
  },
  gradientLayer2: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.5,
  },
  textureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    opacity: 0.8,
  },
  
  // Subtle variant patterns
  subtlePattern1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  subtlePattern2: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  noiseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.008)',
    opacity: 0.9,
  },
  
  // Modern variant layers
  modernLayer1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  modernLayer2: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  modernAccent: {
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
    height: '20%',
  },
  modernGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  
  // Radial variant layers
  radialCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  radialMid: {
    position: 'absolute',
    top: '5%',
    left: '10%',
    width: '80%',
    height: '80%',
    borderRadius: 1000,
    opacity: 0.3,
  },
  radialOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
