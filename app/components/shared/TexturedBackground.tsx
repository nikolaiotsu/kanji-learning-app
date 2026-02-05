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
              colors={[COLORS.screenBackground, COLORS.surface, COLORS.screenBackground]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Blue accent gradient */}
            <LinearGradient
              colors={[COLORS.blueTint.accent, COLORS.blueTintMidStrong, 'transparent']}
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
              colors={[COLORS.screenBackground, COLORS.surface, COLORS.screenBackground]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Subtle blue tint */}
            <LinearGradient
              colors={[COLORS.blueTint.medium, 'transparent', COLORS.blueTint.subtle]}
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
              colors={[COLORS.background, COLORS.screenBackground, COLORS.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Vibrant blue accent from top */}
            <LinearGradient
              colors={[COLORS.blueTint.strong, COLORS.blueTintMid, 'transparent']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 0.6 }}
              style={styles.modernLayer1}
            />
            {/* Bottom ambient glow */}
            <LinearGradient
              colors={['transparent', COLORS.blueTintEnd, 'rgba(15, 23, 42, 0.8)']}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.modernLayer2}
            />
            {/* Subtle center spotlight */}
            <LinearGradient
              colors={[COLORS.blueTint.medium, 'transparent']}
              start={{ x: 0.5, y: 0.3 }}
              end={{ x: 0.5, y: 0.7 }}
              style={styles.modernGlow}
            />
            {/* Vignette for depth */}
            <LinearGradient
              colors={[
                'rgba(0, 0, 0, 0.12)',
                'transparent',
                'transparent',
                'rgba(0, 0, 0, 0.15)',
              ]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Subtle grain texture */}
            <View style={styles.grainOverlay} />
          </>
        );
      
      case 'radial':
        return (
          <>
            {/* Dark base */}
            <View style={[styles.baseLayer, { backgroundColor: COLORS.background }]} />
            {/* Radial blue center glow */}
            <LinearGradient
              colors={[COLORS.depth.glowBlue, COLORS.depth.glowBlueSoft, 'transparent']}
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
            {/* Base liquid gradient - same base as PokedexLayout for consistent blue/navy */}
            <LinearGradient
              colors={[
                COLORS.background,
                COLORS.backgroundLift,
                COLORS.backgroundLift2,
                COLORS.backgroundLift3,
                COLORS.background,
                COLORS.backgroundLift,
                COLORS.backgroundLift2,
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.baseLayer}
            />
            {/* Top-left very subtle blue pool - same blueTint as layout */}
            <LinearGradient
              colors={[
                COLORS.blueTint.medium,
                COLORS.blueTint.medium,
                COLORS.blueTintMid,
                COLORS.blueTintEnd,
                COLORS.blueTint.veryFaint,
                'transparent',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 0.6 }}
              style={styles.liquidPool1}
            />
            {/* Bottom-right complementary blue accent - same palette */}
            <LinearGradient
              colors={[
                'transparent',
                'transparent',
                COLORS.blueTint.veryFaint,
                COLORS.blueTint.veryFaint,
                COLORS.blueTintEnd,
                COLORS.blueTintMid,
                COLORS.blueTintMid,
                COLORS.blueTint.faint,
                COLORS.blueTint.faint,
                COLORS.blueTintMid,
                COLORS.blueTintMid,
                COLORS.blueTintEnd,
                COLORS.blueTint.veryFaint,
                'transparent',
              ]}
              start={{ x: 0.2, y: 0.3 }}
              end={{ x: 1, y: 1 }}
              style={styles.liquidPool2}
            />
            {/* Center subtle ambient glow - same blue tints */}
            <LinearGradient
              colors={[
                'transparent',
                COLORS.blueTint.subtle,
                COLORS.blueTint.subtle,
                COLORS.blueTint.faint,
                'transparent',
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
            {/* Vignette effect for depth around edges */}
            <LinearGradient
              colors={[
                'transparent',
                'transparent',
                'rgba(0, 0, 0, 0.08)',
                'rgba(0, 0, 0, 0.15)',
              ]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.vignetteTop}
            />
            <LinearGradient
              colors={[
                'rgba(0, 0, 0, 0.18)',
                'rgba(0, 0, 0, 0.10)',
                'transparent',
                'transparent',
              ]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.vignetteBottom}
            />
            {/* Subtle noise/grain texture overlay for tactile feel */}
            <View style={styles.grainOverlay} />
          </>
        );
      
      default:
        return (
          <View style={[styles.baseLayer, { backgroundColor: COLORS.background }]} />
        );
    }
  };

  return (
    <View style={[styles.container, styles.solidBackground, style]}>
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
  // Solid background matching splash screen (same as COLORS.background)
  solidBackground: {
    backgroundColor: COLORS.background,
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
  // Vignette effects for depth
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '25%',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
  },
  // Grain texture overlay - increased for more tactile feel
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
