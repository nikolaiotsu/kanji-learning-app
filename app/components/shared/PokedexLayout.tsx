import React, { ReactNode, useRef, useEffect, useMemo, memo } from 'react';
import { 
  View, 
  StyleSheet, 
  ViewStyle,
  StatusBar,
  Image,
  ImageSourcePropType,
  ImageStyle,
  Animated,
  Easing
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import TexturedBackground from './TexturedBackground';

import { logger } from '../../utils/logger';

interface PokedexLayoutProps {
  children: ReactNode;
  style?: ViewStyle;
  screenStyle?: ViewStyle;
  showLights?: boolean;
  variant?: 'main' | 'flashcards';
  logoSource?: ImageSourcePropType;
  logoStyle?: ImageStyle;
  logoVisible?: boolean; // Control when logo should be visible/animated
  triggerLightAnimation?: number;
  /** Scale for peak light intensity when lights animate (e.g. on swipe). 0-1; default 1. Use <1 on collections to tone down. */
  lightPeakScale?: number;
  /** When true, main (yellow) light uses same size as the three small lights (e.g. on Your Collections screen). */
  compactLights?: boolean;
  textureVariant?: 'gradient' | 'subtle' | 'modern' | 'radial' | 'liquid' | 'default';
  // Progressive loading props
  loadingProgress?: number; // 0-4 indicating checkpoint (3 small lights for flashcards)
  isProcessing?: boolean; // Whether processing is currently active
  processingFailed?: boolean; // Whether processing failed (for red lights)
}

export default memo(function PokedexLayout({
  children,
  style,
  screenStyle,
  showLights = true,
  variant = 'main',
  logoSource,
  logoStyle,
  logoVisible = true,
  triggerLightAnimation = 0,
  lightPeakScale = 1,
  compactLights = false,
  textureVariant = 'liquid',
  loadingProgress = 0,
  isProcessing = false,
  processingFailed = false,
}: PokedexLayoutProps) {
  const insets = useSafeAreaInsets();
  
  // Safe area insets handling

  // Animation values for lights (not for logo - logo is static)
  const animationValues = useMemo(() => {
    return {
      mainLightAnim: new Animated.Value(0),
      smallLightsAnim: [
        new Animated.Value(0),
        new Animated.Value(0),
        new Animated.Value(0)
      ]
    };
  }, []);
  
  const { mainLightAnim, smallLightsAnim } = animationValues;

  // Ref to keep track of the currently running animation sequence so we can
  // stop it prematurely when a new trigger is received
  const animationSequenceRef = useRef<Animated.CompositeAnimation | null>(null);

  // Component configuration loaded

  const topSectionVariantStyle = variant === 'flashcards' ? styles.flashcardsTopSection : {};
  const screenVariantStyle = variant === 'flashcards' ? styles.flashcardsScreen : {};

  // Modernized light colors
  const mainLightBaseColor = variant === 'flashcards' ? COLORS.pokedexAmber : '#EF4444';
  const mainLightInnerColor = variant === 'flashcards' ? COLORS.pokedexAmberGlow : '#F87171';
  const mainLightPulseColor = variant === 'flashcards' ? COLORS.pokedexAmberPulse : '#FCA5A5';

  const smallLightColors = variant === 'flashcards' ?
    [COLORS.lightGray, COLORS.pokedexPurple, COLORS.pokedexGreen] : // No yellow light
    ['#D4A34A', '#16A34A', '#38BDF8']; // Refined yellow, green, light blue
  
  const flashcardsControlIconSize = 18;

  // Animation effect for light-up sequence
  // triggerLightAnimation is now a counter that increments on each swipe
  // This allows the animation to restart immediately and cancel any running animation
  useEffect(() => {
    // Only trigger if counter is greater than 0 (i.e., a swipe has occurred)
    if (triggerLightAnimation > 0) {
      // Stop any currently running animation sequence
      if (animationSequenceRef.current) {
        animationSequenceRef.current.stop();
        animationSequenceRef.current = null;
      }

      // Stop all individual animations and reset them to start position
      mainLightAnim.stopAnimation();
      mainLightAnim.setValue(0);
      smallLightsAnim.forEach(anim => {
        anim.stopAnimation();
        anim.setValue(0);
      });

      // Start new animation sequence immediately (same pattern for main and rectangle; easing for smooth brightening)
      const ease = Easing.bezier(0.4, 0, 0.2, 1);
      const sequence = Animated.sequence([
        Animated.timing(mainLightAnim, {
          toValue: 1,
          duration: 300,
          easing: ease,
          useNativeDriver: false,
        }),
        Animated.stagger(150,
          smallLightsAnim.map(anim =>
            Animated.timing(anim, {
              toValue: 1,
              duration: 200,
              easing: ease,
              useNativeDriver: false,
            })
          )
        ),
        Animated.parallel([
          Animated.timing(mainLightAnim, {
            toValue: 0,
            duration: 500,
            easing: ease,
            useNativeDriver: false,
          }),
          ...smallLightsAnim.map(anim =>
            Animated.timing(anim, {
              toValue: 0,
              duration: 500,
              easing: ease,
              useNativeDriver: false,
            })
          ),
        ]),
      ]);

      animationSequenceRef.current = sequence;

      sequence.start(() => {
        animationSequenceRef.current = null;
      });
    }
  }, [triggerLightAnimation, mainLightAnim, smallLightsAnim]);

  // Progressive loading animation effect
  useEffect(() => {
    logger.log('🔥 [PokedexLayout] Progressive loading effect triggered:', { isProcessing, loadingProgress });
    
    if (isProcessing) {
      logger.log('🟠 [PokedexLayout] Starting main light animation (toValue: 1)');
      Animated.timing(mainLightAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start(() => {
        logger.log('🟠 [PokedexLayout] Main light animation completed');
      });

      const currentLightIndex = Math.min(loadingProgress - 1, smallLightsAnim.length - 1);
      
      if (currentLightIndex >= 0) {
        logger.log(`💡 [PokedexLayout] Checkpoint ${loadingProgress}: Animating light ${currentLightIndex}`);
        
        Animated.timing(smallLightsAnim[currentLightIndex], {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }).start(() => {
          logger.log(`💡 [PokedexLayout] Light ${currentLightIndex} animation completed`);
        });
        
        for (let i = 0; i < currentLightIndex; i++) {
          smallLightsAnim[i].setValue(1);
          logger.log(`🔛 [PokedexLayout] Light ${i} set to on (previous checkpoint)`);
        }
        
        for (let i = currentLightIndex + 1; i < smallLightsAnim.length; i++) {
          const currentValue = (smallLightsAnim[i] as any)._value || 0;
          if (currentValue === 0) {
            smallLightsAnim[i].setValue(0);
            logger.log(`⚫ [PokedexLayout] Light ${i} set to off (future checkpoint)`);
          } else {
            logger.log(`✅ [PokedexLayout] Light ${i} staying on (from higher checkpoint)`);
          }
        }
      }
    } else {
      logger.log('⚪ [PokedexLayout] Fading out all lights');
      Animated.parallel([
        Animated.timing(mainLightAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
        ...smallLightsAnim.map(anim =>
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          })
        ),
      ]).start(() => {
        logger.log('⚪ [PokedexLayout] All lights faded out');
      });
    }
  }, [isProcessing, loadingProgress, mainLightAnim, smallLightsAnim]);

  // Pre-compute animated styles (pronounced on flashcards only; subtle on main/collections)
  const flashPeak = lightPeakScale;
  const mainShadowOpacity = variant === 'flashcards' ? 0.4 * flashPeak : 0.5;
  const mainShadowRadius = variant === 'flashcards' ? 12 * flashPeak : 14;
  const mainElevation = variant === 'flashcards' ? 10 * flashPeak : 10;
  const mainOpacityAdd = variant === 'flashcards' ? 0.2 * flashPeak : 0.3;
  const mainLightAnimatedStyle = {
    shadowColor: mainLightBaseColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Animated.multiply(mainLightAnim, mainShadowOpacity),
    shadowRadius: mainLightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, mainShadowRadius]
    }),
    elevation: mainLightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, mainElevation]
    }),
    opacity: Animated.add(variant === 'flashcards' ? 0.5 : 0.6, Animated.multiply(mainLightAnim, mainOpacityAdd))
  };
  
  logger.log('🎨 [PokedexLayout] Animation values:', {
    variant,
    isProcessing,
    loadingProgress,
    mainLightBaseColor,
    shadowColor: mainLightBaseColor
  });

  // Render small lights with modern styling
  const smallShadowOpacity = variant === 'flashcards' ? 0.4 * flashPeak : 0.5;
  const smallShadowRadius = variant === 'flashcards' ? 10 * flashPeak : 10;
  const smallElevation = variant === 'flashcards' ? 8 * flashPeak : 8;
  const smallOpacityAdd = variant === 'flashcards' ? 0.2 * flashPeak : 0.3;
  const glowOuterMult = variant === 'flashcards' ? 0.03 * flashPeak : 0.03;
  const glowInnerMult = variant === 'flashcards' ? 0.06 * flashPeak : 0.08;

  const renderSmallLight = (color: string, index: number) => {
    const lightColor = processingFailed ? '#EF4444' : color;
    const glowColor = processingFailed ? '#EF4444' : color;
    
    const isDarkColor = lightColor === COLORS.pokedexPurple || lightColor === COLORS.mediumSurface;
    const opacityMultiplier = isDarkColor ? 1.8 : 1.0;
    
    const animStyle = {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: Animated.multiply(smallLightsAnim[index], smallShadowOpacity),
      shadowRadius: smallLightsAnim[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, smallShadowRadius]
      }),
      elevation: smallLightsAnim[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, smallElevation]
      }),
      opacity: Animated.add(variant === 'flashcards' ? 0.5 : 0.7, Animated.multiply(smallLightsAnim[index], smallOpacityAdd))
    };

    const glowOuterOpacity = Animated.multiply(smallLightsAnim[index], glowOuterMult * opacityMultiplier);
    const glowInnerOpacity = Animated.multiply(smallLightsAnim[index], glowInnerMult * opacityMultiplier);
    
    return (
      <View key={index} style={styles.smallLightContainer}>
        {/* Outer glow (premium: single soft layer); same circular shape for both variants */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: glowColor,
              opacity: glowOuterOpacity,
              top: -10,
              left: -11,
              zIndex: 3,
            }
          ]}
        />
        {/* Inner glow */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: glowColor,
              opacity: glowInnerOpacity,
              top: -4,
              left: -4,
              zIndex: 5,
            }
          ]}
        />
        <Animated.View 
          style={[
            variant === 'flashcards' ? styles.flashcardsSmallLight : styles.smallLight,
            { backgroundColor: lightColor },
            animStyle,
          ]}
        >
          <View style={variant === 'flashcards' ? styles.smallLightInnerShadowFlashcards : styles.smallLightInnerShadow} />
        </Animated.View>
      </View>
    );
  };

  return (
    <TexturedBackground variant={textureVariant} style={styles.container}>
      <SafeAreaView style={[styles.safeArea, style]}>
        <StatusBar backgroundColor={COLORS.background} barStyle="light-content" />
        
        {/* Conditionally render topSection based on showLights prop.
            Settings screen sets showLights=false (default) to not show the header. */}
        {showLights && (
        <View style={[
          styles.topSection, 
          topSectionVariantStyle
        ]}>
          {/* Transparent - TexturedBackground shows through for consistent blue */}
          
          {variant === 'flashcards' ? (
            <>
              {/* Flashcards Variant: Circular main light (same shape as main screen; compact = same size as small lights) */}
              <Animated.View 
                style={[
                  styles.mainLight,
                  compactLights && styles.mainLightCompact,
                  mainLightAnimatedStyle,
                  { zIndex: 10 }
                ]}
              >
                <LinearGradient
                  colors={[mainLightBaseColor, mainLightInnerColor]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: compactLights ? 9 : 22.5 }]}
                />
                <View style={[styles.mainLightInnerShadow, compactLights && styles.mainLightInnerShadowCompact]} />
              </Animated.View>
              <View style={styles.flashcardsSmallLightContainer}>
                {smallLightColors.map((color, index) => renderSmallLight(color, index))}
              </View>
            </>
          ) : (
            <>
              {/* Main Variant: Circular light with gradient */}
              <Animated.View 
                style={[
                  styles.mainLight, 
                  mainLightAnimatedStyle,
                ]}
              >
                <LinearGradient
                  colors={['#EF4444', '#DC2626', '#B91C1C', '#7F1D1D']}
                  locations={[0, 0.3, 0.6, 1]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 22.5 }]}
                />
                <View style={styles.mainLightInnerShadow} />
              </Animated.View>
              <View style={styles.smallLights}>
                {smallLightColors.map((color, index) => (
                  <View key={index} style={styles.smallLightContainer}>
                    {renderSmallLight(color, index)}
                  </View>
                ))}
              </View>
            </>
          )}
          {/* Logo */}
          {logoSource && (
            <Image
              source={logoSource}
              style={[
                styles.logoImage, 
                logoStyle,
                { opacity: 1 }
              ]}
              resizeMode="contain"
            />
          )}
        </View>
        )}
        {/* Main screen area - transparent so TexturedBackground shows through consistently */}
        <View style={[styles.screen, screenStyle, screenVariantStyle]}>
          {/* Modern corner accents */}
          <View style={styles.screenCorner} />
          <View style={[styles.screenCorner, styles.screenCornerTopRight]} />
          <View style={[styles.screenCorner, styles.screenCornerBottomLeft]} />
          <View style={[styles.screenCorner, styles.screenCornerBottomRight]} />
          {/* Grey line just above bottom black edge (mirrors top: grey then black for 3D bevel) */}
          <View style={styles.screenBottomGreyBevel} />
          {children}
        </View>
        
      </SafeAreaView>
    </TexturedBackground>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
    // Bottom border for depth separation
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.25)',
    position: 'relative',
    zIndex: 100,
    elevation: 20,
    overflow: 'hidden',
    // Shadow for depth separation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  topBarAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  flashcardsTopSection: {
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    // Enhanced shadow for more depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 22,
    zIndex: 100,
  },
  // Main page - circular light with modern styling
  mainLight: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    // Subtle dark border for depth
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.30)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  mainLightCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 6,
    borderWidth: 1,
  },
  mainLightRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    opacity: 0.7,
  },
  mainLightInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    elevation: 3,
  },
  mainLightInnerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22.5,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.35)',
    borderLeftColor: 'rgba(0, 0, 0, 0.22)',
    borderRightColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  mainLightInnerShadowCompact: {
    borderRadius: 9,
    borderWidth: 2,
  },
  pulseIndicator: {
    position: 'absolute',
    width: 8,
    height: 8, 
    borderRadius: 4,
    bottom: 5,
    right: 5,
    borderWidth: 1,
  },
  smallLights: {
    flexDirection: 'row',
    marginLeft: 10,
    alignItems: 'center',
  },
  smallLight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    // Subtle dark border for depth
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.25)',
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  smallLightInnerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.32)',
    borderLeftColor: 'rgba(0, 0, 0, 0.18)',
    borderRightColor: 'rgba(255, 255, 255, 0.10)',
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
  },
  smallLightInnerShadowFlashcards: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.32)',
    borderLeftColor: 'rgba(0, 0, 0, 0.18)',
    borderRightColor: 'rgba(255, 255, 255, 0.10)',
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
  },
  screen: {
    flex: 1,
    padding: 10,
    borderRadius: 16,
    backgroundColor: COLORS.screenBackground, // Solid color needed for efficient shadow; matches textured background
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 0,
    // Grey bevel at top; bottom has grey line + black edge for 3D (mirrors top)
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftColor: 'rgba(0, 0, 0, 0.15)',
    borderBottomColor: 'rgba(0, 0, 0, 0.20)',
    borderRightColor: 'rgba(0, 0, 0, 0.15)',
    overflow: 'hidden',
  },
  /** Grey line at bottom, just above screen's black border; same 1px border as top for equal thickness */
  screenBottomGreyBevel: {
    position: 'absolute',
    bottom: 1,
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 1,
  },
  screenInnerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  flashcardsScreen: {
    padding: 4,
  },
  cornerDecoration: {
    position: 'absolute',
    right: 20,
    top: 10,
    alignItems: 'flex-end',
  },
  decorativeLine: {
    width: 20,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 3,
    borderRadius: 1,
  },
  screenCorner: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 15,
    height: 15,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: COLORS.appleLiquidGrey,
    zIndex: 5,
    borderRadius: 2,
  },
  screenCornerTopRight: {
    left: undefined,
    right: 5,
    borderLeftWidth: 0,
    borderRightWidth: 2,
  },
  screenCornerBottomLeft: {
    top: undefined,
    bottom: 5,
    borderTopWidth: 0,
    borderBottomWidth: 2,
  },
  screenCornerBottomRight: {
    top: undefined,
    left: undefined,
    bottom: 5,
    right: 5,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  speakerGrill: {
    position: 'absolute',
    bottom: 40,
    right: 35,
    width: 20,
    height: 20,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  speakerLine: {
    width: 20,
    height: 2,
    backgroundColor: COLORS.pokedexBlack,
    borderRadius: 1,
  },
  diagonalLine: {
    position: 'absolute',
    width: 50,
    height: 3,
    backgroundColor: COLORS.pokedexBlack,
    transform: [{ rotate: '45deg' }],
    bottom: 80,
    right: -10,
    zIndex: 10,
  },
  smallLightContainer: {
    position: 'relative',
    marginHorizontal: 5,
  },
  lightReflection: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    top: 4,
    left: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  flashcardsSmallLightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** Same circular shape as main screen small lights. */
  flashcardsSmallLight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    // Subtle dark border for depth
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.25)',
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  logoImage: {
    position: 'absolute',
    top: 10,
    right: 20,
    width: 100,
    height: 30,
    zIndex: 200,
  },
  mainLightHighlight: {
    position: 'absolute',
    width: 35,
    height: 35,
    borderRadius: 17.5,
    top: 4,
    left: 4,
    opacity: 0.6,
  },
});
