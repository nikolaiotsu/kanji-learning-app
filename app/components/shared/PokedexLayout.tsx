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
  textureVariant?: 'gradient' | 'subtle' | 'modern' | 'radial' | 'liquid' | 'default';
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
  triggerLightAnimation = 0,
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
    [COLORS.lightGray, COLORS.pokedexPurple, COLORS.pokedexYellow, COLORS.pokedexGreen] :
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

      // Start new animation sequence immediately
      const sequence = Animated.sequence([
        Animated.timing(mainLightAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.stagger(150,
          smallLightsAnim.map(anim =>
            Animated.timing(anim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
            })
          )
        ),
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

      const currentLightIndex = loadingProgress - 1;
      
      if (currentLightIndex >= 0 && currentLightIndex < smallLightsAnim.length) {
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
  const mainLightAnimatedStyle = {
    shadowColor: mainLightBaseColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Animated.multiply(mainLightAnim, variant === 'flashcards' ? 0.85 : 0.5),
    shadowRadius: mainLightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, variant === 'flashcards' ? 26 : 14]
    }),
    elevation: mainLightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, variant === 'flashcards' ? 20 : 10]
    }),
    opacity: Animated.add(variant === 'flashcards' ? 0.5 : 0.6, Animated.multiply(mainLightAnim, variant === 'flashcards' ? 0.5 : 0.3))
  };
  
  logger.log('🎨 [PokedexLayout] Animation values:', {
    variant,
    isProcessing,
    loadingProgress,
    mainLightBaseColor,
    shadowColor: mainLightBaseColor
  });

  // Render small lights with modern styling
  const renderSmallLight = (color: string, index: number) => {
    const lightColor = processingFailed ? '#EF4444' : color;
    const glowColor = processingFailed ? '#EF4444' : color;
    
    const isDarkColor = lightColor === COLORS.pokedexPurple || lightColor === COLORS.mediumSurface;
    const opacityMultiplier = isDarkColor ? 1.8 : 1.0;
    
    const animStyle = {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: Animated.multiply(smallLightsAnim[index], variant === 'flashcards' ? 0.85 : 0.5),
      shadowRadius: smallLightsAnim[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, variant === 'flashcards' ? 18 : 10]
      }),
      elevation: smallLightsAnim[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, variant === 'flashcards' ? 16 : 8]
      }),
      opacity: Animated.add(variant === 'flashcards' ? 0.5 : 0.7, Animated.multiply(smallLightsAnim[index], variant === 'flashcards' ? 0.5 : 0.3))
    };

    const glowOuterOpacity = Animated.multiply(smallLightsAnim[index], (variant === 'flashcards' ? 0.07 : 0.03) * opacityMultiplier);
    const glowInnerOpacity = Animated.multiply(smallLightsAnim[index], (variant === 'flashcards' ? 0.18 : 0.08) * opacityMultiplier);
    
    return (
      <View key={index} style={styles.smallLightContainer}>
        {/* Outer glow (premium: single soft layer) */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              width: variant === 'flashcards' ? 50 : 40,
              height: variant === 'flashcards' ? 25 : 40, 
              borderRadius: variant === 'flashcards' ? 12 : 20,
              backgroundColor: glowColor,
              opacity: glowOuterOpacity,
              top: variant === 'flashcards' ? -8 : -10,
              left: variant === 'flashcards' ? -13 : -11,
              zIndex: 3,
            }
          ]}
        />
        {/* Inner glow */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              width: variant === 'flashcards' ? 32 : 26,
              height: variant === 'flashcards' ? 14 : 26, 
              borderRadius: variant === 'flashcards' ? 7 : 13,
              backgroundColor: glowColor,
              opacity: glowInnerOpacity,
              top: variant === 'flashcards' ? -3 : -4,
              left: variant === 'flashcards' ? -4 : -4,
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
          {/* Liquid gradient overlay for top bar - flows down and right */}
          <LinearGradient
            colors={[
              '#0A1628',  // Base
              '#0B1729',  // Subtle lift
              '#0D1A2F',  // Gentle increase
              '#0C182B',  // Soft return
              '#0A1628'   // Back to base
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Very subtle blue accent in top bar - flows down and right */}
          <LinearGradient
            colors={[
              'rgba(59, 130, 246, 0.04)',   // Very subtle start
              'rgba(59, 130, 246, 0.025)',  // Gentle fade
              'transparent',                 // Clear middle
              'rgba(30, 64, 175, 0.02)',    // Subtle end
              'rgba(30, 64, 175, 0.015)'     // Soft finish
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.8 }}
            style={styles.topBarAccent}
          />
          
          {variant === 'flashcards' ? (
            <>
              {/* Flashcards Variant: Main light with outer glow */}
              <View style={{ position: 'relative', marginRight: 10 }}>
                {/* Glow layers (premium: 2 layers, softer) */}
                <Animated.View 
                  style={[
                    {
                      position: 'absolute',
                      width: 140,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: mainLightBaseColor,
                      opacity: Animated.multiply(mainLightAnim, 0.10),
                      top: -15,
                      left: -20,
                      zIndex: 3,
                    }
                  ]}
                />
                <Animated.View 
                  style={[
                    {
                      position: 'absolute',
                      width: 110,
                      height: 25,
                      borderRadius: 12,
                      backgroundColor: mainLightBaseColor,
                      opacity: Animated.multiply(mainLightAnim, 0.18),
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
                  <LinearGradient
                    colors={[COLORS.pokedexAmberGlow, COLORS.pokedexAmberDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={[styles.flashcardsMainStatusBar_Reflection, { backgroundColor: mainLightPulseColor }]} />
                </Animated.View>
              </View>
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
        {/* Main screen area */}
        <View style={[styles.screen, screenStyle, screenVariantStyle]}>
          {/* Liquid gradient background for screen - smooth transitions with blue hints */}
          <LinearGradient
            colors={
              variant === 'flashcards'
                ? [
                    'rgba(15, 23, 42, 0.65)',  // Base dark
                    'rgba(15, 23, 42, 0.68)',  // Slight lift
                    'rgba(13, 26, 47, 0.70)',  // Gentle blue hint
                    'rgba(10, 22, 40, 0.67)',  // Soft return
                    'rgba(13, 26, 47, 0.69)',  // Blue hint again
                    'rgba(15, 23, 42, 0.66)'   // Back to base
                  ]
                : [
                    'rgba(15, 23, 42, 0.55)',  // Base dark
                    'rgba(15, 23, 42, 0.58)',  // Slight lift
                    'rgba(13, 26, 47, 0.60)',  // Gentle blue hint
                    'rgba(10, 22, 40, 0.57)',  // Soft return
                    'rgba(13, 26, 47, 0.59)',  // Blue hint again
                    'rgba(15, 23, 42, 0.56)'   // Back to base
                  ]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Very subtle blue liquid glow - flows up and left (complementary to background) */}
          <LinearGradient
            colors={[
              'rgba(59, 130, 246, 0.03)',   // Very subtle start
              'rgba(59, 130, 246, 0.02)',   // Gentle fade
              'transparent',                 // Clear middle
              'rgba(37, 99, 235, 0.015)',   // Subtle return
              'rgba(30, 64, 175, 0.02)',    // Soft finish
              'rgba(30, 64, 175, 0.015)'    // Gentle end
            ]}
            start={{ x: 0.3, y: 0.3 }}
            end={{ x: 0.9, y: 0.9 }}
            style={styles.screenInnerGlow}
          />
          {/* Modern corner accents */}
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
  },
  safeArea: {
    flex: 1,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
    zIndex: 100,
    elevation: 20,
    overflow: 'hidden',
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
    paddingTop: 16,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 20,
    zIndex: 100,
  },
  // Main page - circular light with modern styling
  mainLight: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    elevation: 5,
    position: 'relative',
    overflow: 'hidden',
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
    borderTopColor: 'rgba(0, 0, 0, 0.25)',
    borderLeftColor: 'rgba(0, 0, 0, 0.15)',
    borderRightColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    borderWidth: 0,
    elevation: 3,
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
    borderTopColor: 'rgba(0, 0, 0, 0.22)',
    borderLeftColor: 'rgba(0, 0, 0, 0.12)',
    borderRightColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  smallLightInnerShadowFlashcards: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.18)',
    borderLeftColor: 'rgba(0, 0, 0, 0.10)',
    borderRightColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  screen: {
    flex: 1,
    padding: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
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
  flashcardsMainStatusBar: {
    height: 20,
    width: 100,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    zIndex: 15,
  },
  flashcardsMainStatusBar_Inner: {
    height: '70%',
    width: '50%',
    borderRadius: 4,
    position: 'absolute',
    left: '5%',
  },
  flashcardsMainStatusBar_Reflection: {
    position: 'absolute',
    width: '80%',
    height: 3,
    borderRadius: 1.5,
    top: 3,
    left: '10%',
    opacity: 0.35,
  },
  flashcardsSmallLightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flashcardsSmallLight: {
    width: 24,
    height: 8,
    borderRadius: 4,
    borderWidth: 0,
    elevation: 15,
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
