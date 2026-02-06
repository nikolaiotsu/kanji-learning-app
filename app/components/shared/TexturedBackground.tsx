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
            {/* Horizontal shading: top-to-bottom, soft blend */}
            <LinearGradient
              colors={[
                'rgba(0, 0, 0, 0.06)',
                'transparent',
                'rgba(0, 0, 0, 0.06)',
              ]}
              locations={[0, 0.5, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.horizontalShading}
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
            {/* Solid base - no gradient banding possible */}
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
              style={styles.horizontalShading}
            />
            {/* Subtle grain texture overlay for tactile feel - helps mask any remaining banding */}
            <View style={styles.grainOverlay} />
          </>
        );
      
      default:
        return (
          <>
            <View style={[styles.baseLayer, { backgroundColor: COLORS.background }]} />
            {/* Horizontal shading: top-to-bottom, soft blend */}
            <LinearGradient
              colors={[
                'rgba(0, 0, 0, 0.07)',
                'transparent',
                'rgba(0, 0, 0, 0.07)',
              ]}
              locations={[0, 0.5, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.horizontalShading}
            />
          </>
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
  horizontalShading: {
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
