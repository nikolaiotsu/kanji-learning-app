import React, { ReactNode, useRef, useEffect, useMemo, memo } from 'react';
import { 
  View, 
  StyleSheet, 
  ViewStyle,
  StatusBar,
  Image,
  ImageSourcePropType,
  ImageStyle,
  Animated
} from 'react-native';
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
  logoAnimationKey?: number; // Increment to restart logo animation
  triggerLightAnimation?: boolean;
  textureVariant?: 'gradient' | 'subtle' | 'modern' | 'radial' | 'default';
  // Progressive loading props
  loadingProgress?: number; // 0-4 indicating how many lights should be on
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
  logoAnimationKey = 0,
  triggerLightAnimation = false,
  textureVariant = 'default',
  loadingProgress = 0,
  isProcessing = false,
  processingFailed = false,
}: PokedexLayoutProps) {
  const insets = useSafeAreaInsets();
  
  // Safe area insets handling

  // Animation values - create them with useMemo to avoid recreating on rerenders
  const animationValues = useMemo(() => {
    return {
      mainLightAnim: new Animated.Value(0),
      smallLightsAnim: [
        new Animated.Value(0),
        new Animated.Value(0),
        new Animated.Value(0),
        new Animated.Value(0)
      ],
      logoOpacityAnim: new Animated.Value(0)
    };
  }, []);
  
  const { mainLightAnim, smallLightsAnim, logoOpacityAnim } = animationValues;

  // Ref to keep track of the currently running animation sequence so we can
  // stop it prematurely when a new trigger is received
  const animationSequenceRef = useRef<Animated.CompositeAnimation | null>(null);

  // Component configuration loaded

  const topSectionVariantStyle = variant === 'flashcards' ? styles.flashcardsTopSection : {};
  const screenVariantStyle = variant === 'flashcards' ? styles.flashcardsScreen : {};

  // Determine light colors based on variant
  const mainLightBaseColor = variant === 'flashcards' ? COLORS.pokedexAmber : '#F22E27';
  const mainLightInnerColor = variant === 'flashcards' ? COLORS.pokedexAmberGlow : '#F22E27';
  const mainLightPulseColor = variant === 'flashcards' ? COLORS.pokedexAmberPulse : '#F22E27';

  const smallLightColors = variant === 'flashcards' ? 
    [COLORS.lightGray, COLORS.pokedexPurple, COLORS.pokedexYellow, COLORS.pokedexGreen] :
    ['#DDAD43', '#01A84F', '#4FC3F7'];
  
  const flashcardsControlIconSize = 18;

  // NOTE: Removed createBrightGlow function - it was causing glows to not render properly
  // Now using natural light colors for glows, same as main screen (which works perfectly)

  // Animation effect for light-up sequence
  useEffect(() => {
    if (triggerLightAnimation) {
      /*
       * Stop any animation that might still be running from the previous
       * trigger so that we can "restart" the light effect in sync with the
       * latest card swipe.
       */
      if (animationSequenceRef.current) {
        animationSequenceRef.current.stop();
      }

      // Ensure all animated values are reset to their initial state before
      // we kick off a fresh sequence.
      mainLightAnim.stopAnimation();
      mainLightAnim.setValue(0);
      smallLightsAnim.forEach(anim => {
        anim.stopAnimation();
        anim.setValue(0);
      });

      // Build a brand-new animation sequence for this trigger.
      const sequence = Animated.sequence([
        // Main light flash
        Animated.timing(mainLightAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        // Stagger the small lights so they illuminate one after another
        Animated.stagger(150,
          smallLightsAnim.map(anim =>
            Animated.timing(anim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
            })
          )
        ),
        // Fade everything back to normal
        Animated.parallel([
          Animated.timing(mainLightAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: false,
          }),
          ...smallLightsAnim.map(anim =>
            Animated.timing(anim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: false,
            })
          ),
        ]),
      ]);

      // Keep a ref so we can cancel it next time if needed
      animationSequenceRef.current = sequence;

      // Start the sequence and clear the ref once it finishes cleanly
      sequence.start(() => {
        animationSequenceRef.current = null;
      });
    }
  }, [triggerLightAnimation, mainLightAnim, smallLightsAnim]);

  // Logo elegant fade-in animation - synchronized with content visibility
  // Restarts whenever logoAnimationKey changes (e.g., when returning from navigation)
  useEffect(() => {
    if (logoSource && logoVisible) {
      // Start invisible
      logoOpacityAnim.setValue(0);
      
      // Elegant fade-in synchronized with card transitions (300ms to match card animations)
      Animated.timing(logoOpacityAnim, {
        toValue: 1,
        duration: 300, // Match card animation duration for synchronization
        useNativeDriver: true,
      }).start();
    } else {
      // Hide logo when no source provided or not visible
      logoOpacityAnim.setValue(0);
    }
  }, [logoSource, logoVisible, logoAnimationKey, logoOpacityAnim]);

  // Progressive loading animation effect
  useEffect(() => {
    logger.log('🔥 [PokedexLayout] Progressive loading effect triggered:', { isProcessing, loadingProgress });
    
    if (isProcessing) {
      logger.log('🟠 [PokedexLayout] Starting main light animation (toValue: 1)');
      // Turn on main light when processing starts
      Animated.timing(mainLightAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start(() => {
        logger.log('🟠 [PokedexLayout] Main light animation completed');
      });

      // Turn on lights progressively based on loadingProgress
      // Only animate the specific light for the current checkpoint to avoid re-animating previous lights
      const currentLightIndex = loadingProgress - 1; // Convert 1-based checkpoint to 0-based index
      
      if (currentLightIndex >= 0 && currentLightIndex < smallLightsAnim.length) {
        logger.log(`💡 [PokedexLayout] Checkpoint ${loadingProgress}: Animating light ${currentLightIndex}`);
        
        // Animate only the current light for this checkpoint
        Animated.timing(smallLightsAnim[currentLightIndex], {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }).start(() => {
          logger.log(`💡 [PokedexLayout] Light ${currentLightIndex} animation completed`);
        });
        
        // Ensure all previous lights are also on (without re-animating)
        for (let i = 0; i < currentLightIndex; i++) {
          smallLightsAnim[i].setValue(1);
          logger.log(`🔛 [PokedexLayout] Light ${i} set to on (previous checkpoint)`);
        }
        
        // Ensure all future lights are off (but don't turn off lights from higher completed checkpoints)
        for (let i = currentLightIndex + 1; i < smallLightsAnim.length; i++) {
          // Only turn off lights that weren't already turned on by a higher checkpoint
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
      // Processing complete - fade out all lights
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

  // Pre-compute animated styles to avoid creating new ones during render
  const mainLightAnimatedStyle = {
    shadowColor: variant === 'flashcards' ? mainLightBaseColor : '#F22E27', // Use natural colors, not overly bright ones
    shadowOffset: { width: 0, height: 0 },
    // Try both iOS and Android shadow approaches
    shadowOpacity: Animated.multiply(mainLightAnim, variant === 'flashcards' ? 0.9 : 0.8),
    shadowRadius: mainLightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, variant === 'flashcards' ? 25 : 20] // Reduced radius for better compatibility
    }),
    elevation: mainLightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, variant === 'flashcards' ? 20 : 15] // Android elevation for glow effect
    }),
    opacity: Animated.add(0.6, Animated.multiply(mainLightAnim, variant === 'flashcards' ? 0.4 : 0.3))
  };
  
  // DEBUG: Log the current animation values
  logger.log('🎨 [PokedexLayout] Animation values:', {
    variant,
    isProcessing,
    loadingProgress,
    mainLightBaseColor,
    shadowColor: variant === 'flashcards' ? mainLightBaseColor : '#F22E27'
  });

  // Create a simpler way to render the small lights without interpolation
  const renderSmallLight = (color: string, index: number) => {
    // Override color to red if processing failed
    const lightColor = processingFailed ? '#FF0000' : color;
    
    // Use natural light color for glow, not overly bright colors
    const glowColor = processingFailed ? '#FF0000' : color;
    
    // Boost opacity for darker colors like purple to match visibility of lighter colors
    const isDarkColor = lightColor === COLORS.pokedexPurple || lightColor === COLORS.mediumSurface;
    const opacityMultiplier = isDarkColor ? 1.8 : 1.0; // Increased from 1.3 to 1.8 to better match yellow brightness
    
    const animStyle = {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      // Try both iOS and Android shadow approaches
      shadowOpacity: Animated.multiply(smallLightsAnim[index], variant === 'flashcards' ? 0.9 : 0.8),
      shadowRadius: smallLightsAnim[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, variant === 'flashcards' ? 15 : 12] // Reduced radius for better compatibility
      }),
      elevation: smallLightsAnim[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, variant === 'flashcards' ? 15 : 10] // Android elevation for glow effect
      }),
      // Higher opacity to make animation more visible
      opacity: Animated.add(0.7, Animated.multiply(smallLightsAnim[index], 0.3))
    };
    
    return (
      <View key={index} style={styles.smallLightContainer}>
        {/* Multiple glow layers for natural effect */}
        {/* Outermost glow - largest and most transparent */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              width: variant === 'flashcards' ? 50 : 40,
              height: variant === 'flashcards' ? 25 : 40, 
              borderRadius: variant === 'flashcards' ? 12 : 20,
              backgroundColor: glowColor,
              opacity: Animated.multiply(smallLightsAnim[index], 0.06 * opacityMultiplier),
              top: variant === 'flashcards' ? -8 : -10,
              left: variant === 'flashcards' ? -13 : -11,
              zIndex: 3,
            }
          ]}
        />
        {/* Middle glow layer */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              width: variant === 'flashcards' ? 40 : 32,
              height: variant === 'flashcards' ? 18 : 32, 
              borderRadius: variant === 'flashcards' ? 9 : 16,
              backgroundColor: glowColor,
              opacity: Animated.multiply(smallLightsAnim[index], 0.10 * opacityMultiplier),
              top: variant === 'flashcards' ? -5 : -7,
              left: variant === 'flashcards' ? -8 : -7,
              zIndex: 4,
            }
          ]}
        />
        {/* Inner glow layer - smallest and slightly more visible */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              width: variant === 'flashcards' ? 32 : 26,
              height: variant === 'flashcards' ? 14 : 26, 
              borderRadius: variant === 'flashcards' ? 7 : 13,
              backgroundColor: glowColor,
              opacity: Animated.multiply(smallLightsAnim[index], 0.15 * opacityMultiplier),
              top: variant === 'flashcards' ? -3 : -4,
              left: variant === 'flashcards' ? -4 : -4,
              zIndex: 5,
            }
          ]}
        />
        {/* Main light element */}
        <Animated.View 
          style={[
            variant === 'flashcards' ? styles.flashcardsSmallLight : styles.smallLight,
            { backgroundColor: lightColor },
            animStyle,
            { zIndex: 10 }
          ]}
        >
          {variant !== 'flashcards' && (
            <View style={styles.smallLightReflection} />
          )}
        </Animated.View>
      </View>
    );
  };

  return (
    <TexturedBackground variant={textureVariant} style={styles.container}>
      <SafeAreaView style={[styles.safeArea, style]}>
        <StatusBar backgroundColor={COLORS.background} barStyle="light-content" />
        
        {showLights && (
          <View style={[styles.topSection, topSectionVariantStyle]}>
            {variant === 'flashcards' ? (
              <>
                {/* Flashcards Variant: Main light with outer glow */}
                <View style={{ position: 'relative', marginRight: 10 }}>
                  {/* Outer glow layers for main light - multiple layers for natural effect */}
                  {/* Outermost glow - largest and most transparent */}
                  <Animated.View 
                    style={[
                      {
                        position: 'absolute',
                        width: 140,
                        height: 50,
                        borderRadius: 25,
                        backgroundColor: mainLightBaseColor,
                        opacity: Animated.multiply(mainLightAnim, 0.08),
                        top: -15,
                        left: -20,
                        zIndex: 3,
                      }
                    ]}
                  />
                  {/* Middle glow layer */}
                  <Animated.View 
                    style={[
                      {
                        position: 'absolute',
                        width: 120,
                        height: 35,
                        borderRadius: 17,
                        backgroundColor: mainLightBaseColor,
                        opacity: Animated.multiply(mainLightAnim, 0.12),
                        top: -7,
                        left: -10,
                        zIndex: 4,
                      }
                    ]}
                  />
                  {/* Inner glow layer - smallest and slightly more visible */}
                  <Animated.View 
                    style={[
                      {
                        position: 'absolute',
                        width: 110,
                        height: 25,
                        borderRadius: 12,
                        backgroundColor: mainLightBaseColor,
                        opacity: Animated.multiply(mainLightAnim, 0.15),
                        top: -2,
                        left: -5,
                        zIndex: 5,
                      }
                    ]}
                  />
                  {/* Main light element */}
                  <Animated.View 
                    style={[
                      styles.flashcardsMainStatusBar,
                      mainLightAnimatedStyle,
                      { zIndex: 10 }
                    ]}
                  >
                    <View style={[styles.flashcardsMainStatusBar_Inner, { backgroundColor: mainLightInnerColor }]} />
                    <View style={[styles.flashcardsMainStatusBar_Reflection, { backgroundColor: mainLightPulseColor }]} />
                  </Animated.View>
                </View>
                <View style={styles.flashcardsSmallLightContainer}>
                  {smallLightColors.map((color, index) => renderSmallLight(color, index))}
                </View>
              </>
            ) : (
              <>
                {/* Main Variant: Simple bulbous light with animation */}
                <Animated.View 
                  style={[
                    styles.mainLight, 
                    { 
                      backgroundColor: mainLightBaseColor,
                    },
                    mainLightAnimatedStyle
                  ]}
                >
                  <View style={[styles.mainLightHighlight, { backgroundColor: `${mainLightBaseColor}60` }]} />
                  <View style={styles.mainLightReflection} />
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
            {/* Logo - positioned absolutely within topSection */}
            {logoSource && (
              <Animated.Image
                source={logoSource}
                style={[
                  styles.logoImage, 
                  logoStyle,
                  { opacity: logoOpacityAnim }
                ]}
                resizeMode="contain"
              />
            )}
          </View>
        )}
        {/* Main "screen" area */}
        <View style={[styles.screen, screenStyle, screenVariantStyle]}>
          {/* Screen inset decorations */}
          <View style={styles.screenCorner} />
          <View style={[styles.screenCorner, styles.screenCornerTopRight]} />
          <View style={[styles.screenCorner, styles.screenCornerBottomLeft]} />
          <View style={[styles.screenCorner, styles.screenCornerBottomRight]} />
          
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
    // Remove shading effects
  },
  safeArea: {
    flex: 1,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.pokedexBlack,
    position: 'relative',
    zIndex: 10, // Increased z-index to ensure shadows aren't covered
  },
  flashcardsTopSection: {
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 1,
    elevation: 10, // Increased elevation to ensure shadows aren't covered
  },
  // Main page - circular light
  mainLight: {
    width: 45,
    height: 45,
    borderRadius: 22.5, // Changed to make it circular
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    elevation: 5,
    position: 'relative',
    borderColor: '#000000',
    // Add inset shadow effect
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  mainLightRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19, // Changed to make it circular
    borderWidth: 2,
    opacity: 0.7,
  },
  mainLightInner: {
    width: 30,
    height: 30,
    borderRadius: 15, // Changed to make it circular
    borderWidth: 1,
    elevation: 3,
  },
  mainLightReflection: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF90',
    top: 6,
    left: 6,
    opacity: 0.8,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
  pulseIndicator: {
    position: 'absolute',
    width: 8,
    height: 8, 
    borderRadius: 4, // Changed to make it circular
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
    height: 18, // Changed from 8 to 18 to make it circular
    borderRadius: 9, // Changed to make it circular
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#000000',
    elevation: 3,
    // Add depth shadow effect
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.screenBackground,
    padding: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    borderStyle: 'solid',
  },
  flashcardsScreen: {
    backgroundColor: '#1A1A1A',
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
    backgroundColor: '#00000080',
    marginBottom: 3,
    borderRadius: 1,
  },
  screenCorner: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 15,
    height: 15,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 5,
  },
  screenCornerTopRight: {
    left: undefined,
    right: 5,
    borderLeftWidth: 0,
    borderRightWidth: 3,
  },
  screenCornerBottomLeft: {
    top: undefined,
    bottom: 5,
    borderTopWidth: 0,
    borderBottomWidth: 3,
  },
  screenCornerBottomRight: {
    top: undefined,
    left: undefined,
    bottom: 5,
    right: 5,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 3,
    borderBottomWidth: 3,
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
    backgroundColor: '#FFFFFF90',
    top: 4,
    left: 6,
    borderWidth: 0.5,
    borderColor: '#FFFFFF60',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
  },
  flashcardsMainStatusBar: {
    height: 20,
    width: 100,
    backgroundColor: COLORS.pokedexAmberDark,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: COLORS.pokedexBlack,
    justifyContent: 'center',
    position: 'relative',
    // REMOVED overflow: 'hidden' - it was clipping the shadows!
    // REMOVED marginRight: 15 - moved to wrapper
    zIndex: 15, // Ensure this light and its shadow are on top
    // Removed base shadow - will be completely controlled by animation
  },
  flashcardsMainStatusBar_Inner: {
    height: '70%',
    width: '50%',
    borderRadius: 2,
    position: 'absolute',
    left: '5%',
  },
  flashcardsMainStatusBar_Reflection: {
    position: 'absolute',
    width: '80%',
    height: 4,
    borderRadius: 2,
    top: 3,
    left: '10%',
    opacity: 0.7,
  },
  flashcardsSmallLightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Changed from flashcardsSmallSquareLight to thin oval lights
  flashcardsSmallLight: {
    width: 24,
    height: 8,
    borderRadius: 4, // More rounded for thin oval shape
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: COLORS.pokedexBlack,
    // Removed base shadow - will be completely controlled by animation
    elevation: 15, // Increased elevation to ensure shadows are visible
    zIndex: 15, // Ensure these lights and their shadows are on top
  },
  logoImage: {
    position: 'absolute',
    top: 10,
    right: 20,
    width: 100,
    height: 30,
    zIndex: 5,
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
  smallLightReflection: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF90',
    top: 1,
    left: 1,
    opacity: 0.7,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
  },
}); 