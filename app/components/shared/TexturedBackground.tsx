import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/colors';

interface TexturedBackgroundProps {
  style?: ViewStyle;
  variant?: 'gradient' | 'subtle' | 'modern' | 'radial' | 'liquid' | 'default';
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
      
      case 'liquid':
        return (
          <>
            {/* Base liquid gradient - ultra-smooth transitions with many color stops */}
            <LinearGradient
              colors={[
                '#0A1628', // Deep navy base
                '#0B1729', // Slightly lighter
                '#0D1A2F', // Gentle lift
                '#0C182B', // Subtle return
                '#0A1628', // Back to base
                '#0B1729', // Gentle wave
                '#0D1A2F'  // Soft finish
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Top-left very subtle blue pool - flows down and right */}
            <LinearGradient
              colors={[
                'rgba(59, 130, 246, 0.06)',  // Very subtle start
                'rgba(59, 130, 246, 0.04)',  // Gentle fade
                'rgba(37, 99, 235, 0.03)',   // Softer
                'rgba(30, 64, 175, 0.02)',   // Even softer
                'rgba(30, 64, 175, 0.01)',   // Barely visible
                'transparent'                  // Fade out
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 0.6 }}
              style={styles.liquidPool1}
            />
            {/* Bottom-right complementary blue accent - ultra-gradual transition */}
            <LinearGradient
              colors={[
                'transparent',                 // Start completely invisible
                'transparent',                 // Stay invisible longer
                'rgba(30, 64, 175, 0.002)',   // Barely perceptible
                'rgba(30, 64, 175, 0.003)',   // Still very subtle
                'rgba(30, 64, 175, 0.004)',   // Gentle increase
                'rgba(37, 99, 235, 0.005)',   // Slightly more visible
                'rgba(37, 99, 235, 0.006)',   // Continue gradual
                'rgba(59, 130, 246, 0.007)',   // Gentle peak
                'rgba(59, 130, 246, 0.008)',   // Slight increase
                'rgba(37, 99, 235, 0.006)',   // Gentle decrease
                'rgba(37, 99, 235, 0.005)',   // Continue fading
                'rgba(30, 64, 175, 0.003)',   // Softer
                'rgba(30, 64, 175, 0.002)',   // Very soft
                'transparent'                  // Fade out completely
              ]}
              start={{ x: 0.2, y: 0.3 }}
              end={{ x: 1, y: 1 }}
              style={styles.liquidPool2}
            />
            {/* Center subtle ambient glow - very gentle */}
            <LinearGradient
              colors={[
                'transparent',
                'rgba(96, 165, 250, 0.03)',   // Very subtle
                'rgba(59, 130, 246, 0.025)',  // Gentle
                'rgba(37, 99, 235, 0.02)',    // Softer
                'transparent'
              ]}
              start={{ x: 0.4, y: 0.3 }}
              end={{ x: 0.8, y: 0.7 }}
              style={styles.liquidGlow}
            />
            {/* Soft ambient overlay for depth - ultra-gradual transitions */}
            <LinearGradient
              colors={[
                'rgba(15, 23, 42, 0.06)',     // Subtle top
                'rgba(15, 23, 42, 0.05)',     // Gentle fade
                'rgba(15, 23, 42, 0.04)',     // Continue fading
                'rgba(15, 23, 42, 0.03)',     // More transparent
                'rgba(15, 23, 42, 0.02)',     // Almost clear
                'transparent',                 // Clear middle
                'rgba(10, 22, 40, 0.01)',     // Very subtle bottom start
                'rgba(10, 22, 40, 0.02)',     // Gentle increase
                'rgba(10, 22, 40, 0.03)',     // Continue
                'rgba(13, 26, 47, 0.04)',     // Slight increase
                'rgba(13, 26, 47, 0.05)',     // Gentle peak
                'rgba(13, 26, 47, 0.04)',     // Soft decrease
                'rgba(10, 22, 40, 0.03)'      // Gentle finish
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.liquidOverlay}
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
  
  // Liquid variant layers
  liquidPool1: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '60%',
    height: '50%',
  },
  liquidPool2: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '65%',
    height: '55%',
  },
  liquidGlow: {
    position: 'absolute',
    top: '20%',
    right: 0,
    width: '40%',
    height: '40%',
  },
  liquidOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
