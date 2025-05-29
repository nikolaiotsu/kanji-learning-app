import React, { ReactNode, useRef, useEffect, useMemo, memo } from 'react';
import { 
  View, 
  StyleSheet, 
  ViewStyle,
  SafeAreaView,
  StatusBar,
  Image,
  ImageSourcePropType,
  ImageStyle,
  Animated
} from 'react-native';
import { COLORS } from '../../constants/colors';

interface PokedexLayoutProps {
  children: ReactNode;
  style?: ViewStyle;
  screenStyle?: ViewStyle;
  showLights?: boolean;
  variant?: 'main' | 'flashcards';
  logoSource?: ImageSourcePropType;
  logoStyle?: ImageStyle;
  triggerLightAnimation?: boolean;
}

export default memo(function PokedexLayout({
  children,
  style,
  screenStyle,
  showLights = true,
  variant = 'main',
  logoSource,
  logoStyle,
  triggerLightAnimation = false,
}: PokedexLayoutProps) {
  // Animation values - create them with useMemo to avoid recreating on rerenders
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

  // --- DEBUG LOGS START ---
  console.log('[PokedexLayout] Props received:', { 
    showLights, 
    variant, 
    logoSource: !!logoSource, 
    logoStyle, 
    triggerLightAnimation 
  });
  if (logoSource) {
    console.log('[PokedexLayout] logoSource value:', logoSource);
  }
  // --- DEBUG LOGS END ---

  const topSectionVariantStyle = variant === 'flashcards' ? styles.flashcardsTopSection : {};
  const screenVariantStyle = variant === 'flashcards' ? styles.flashcardsScreen : {};

  // Determine light colors based on variant
  const mainLightBaseColor = variant === 'flashcards' ? COLORS.pokedexAmber : '#F22E27';
  const mainLightInnerColor = variant === 'flashcards' ? COLORS.pokedexAmberGlow : '#F22E27';
  const mainLightPulseColor = variant === 'flashcards' ? COLORS.pokedexAmberPulse : '#F22E27';

  const smallLightColors = variant === 'flashcards' ? 
    [COLORS.lightGray, COLORS.mediumSurface, COLORS.pokedexYellow, COLORS.pokedexGreen] :
    ['#DDAD43', '#01A84F', '#4FC3F7'];
  
  const flashcardsControlIconSize = 18;

  // Animation effect for light-up sequence
  useEffect(() => {
    // Create the animation sequence only when triggerLightAnimation becomes true
    if (triggerLightAnimation) {
      // Create a new animation sequence each time rather than reusing
      const sequence = Animated.sequence([
        // Main light flash
        Animated.timing(mainLightAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        // Stagger the small lights
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
          )
        ])
      ]);
      
      // Start the sequence
      sequence.start();
    }
  }, [triggerLightAnimation, mainLightAnim, smallLightsAnim]);

  // Pre-compute animated styles to avoid creating new ones during render
  const mainLightAnimatedStyle = {
    shadowColor: variant === 'flashcards' ? '#FFA500' : '#F22E27',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Animated.multiply(mainLightAnim, variant === 'flashcards' ? 1.5 : 1.2),
    shadowRadius: mainLightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, variant === 'flashcards' ? 25 : 20]
    }),
    opacity: Animated.add(0.6, Animated.multiply(mainLightAnim, variant === 'flashcards' ? 0.4 : 0.3))
  };

  // Create a simpler way to render the small lights without interpolation
  const renderSmallLight = (color: string, index: number) => {
    // Use golden glow for the blue light (index 2) to make it more visible
    const glowColor = variant === 'flashcards' ? '#FFA500' : 
                     (index === 2 ? '#FFD700' : color);
    
    const animStyle = {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: Animated.multiply(smallLightsAnim[index], variant === 'flashcards' ? 1.5 : 1.2),
      shadowRadius: smallLightsAnim[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, variant === 'flashcards' ? 15 : 12]
      }),
      opacity: Animated.add(0.6, Animated.multiply(smallLightsAnim[index], variant === 'flashcards' ? 0.4 : 0.3))
    };
    
    return (
      <Animated.View 
        key={index}
        style={[
          variant === 'flashcards' ? styles.flashcardsSmallLight : styles.smallLight,
          { backgroundColor: color },
          animStyle
        ]}
      >
        {variant !== 'flashcards' && (
          <View style={styles.smallLightReflection} />
        )}
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, style]}>
      <StatusBar backgroundColor={COLORS.background} barStyle="light-content" />
      
      {showLights && (
        <View style={[styles.topSection, topSectionVariantStyle]}>
          {variant === 'flashcards' ? (
            <>
              {/* Flashcards Variant: Thin oval lights */}
              <Animated.View 
                style={[
                  styles.flashcardsMainStatusBar,
                  mainLightAnimatedStyle
                ]}
              >
                <View style={[styles.flashcardsMainStatusBar_Inner, { backgroundColor: mainLightInnerColor }]} />
                <View style={[styles.flashcardsMainStatusBar_Reflection, { backgroundColor: mainLightPulseColor }]} />
              </Animated.View>
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
            <Image
              source={logoSource}
              style={[styles.logoImage, logoStyle]}
              resizeMode="contain"
              fadeDuration={0}
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
      
      {/* Right border detail */}
      <View style={styles.rightBorderDetail} />
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    // Remove shading effects
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.pokedexBlack,
    position: 'relative',
    zIndex: 1,
  },
  flashcardsTopSection: {
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 1,
    elevation: 2,
  },
  // Main page - circular light
  mainLight: {
    width: 45,
    height: 45,
    borderRadius: 22.5, // Changed to make it circular
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    elevation: 5,
    position: 'relative',
    borderColor: '#000000',
    // Add inset shadow effect
    shadowColor: '#000000',
    shadowOffset: { width: 2, height: 2 },
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
    shadowOffset: { width: 1, height: 1 },
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
  leftSideDecoration: {
    position: 'absolute',
    left: 0,
    top: '30%',
    width: 18,
    height: 80,
    backgroundColor: COLORS.pokedexBlack,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  leftSideCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#555',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 10,
  },
  leftSideLine: {
    width: 10,
    height: 30,
    borderRadius: 5,
    backgroundColor: '#444',
    borderWidth: 1,
    borderColor: '#333',
  },
  rightBorderDetail: {
    position: 'absolute',
    right: 0,
    top: '60%',
    width: 8,
    height: 40,
    backgroundColor: COLORS.pokedexBlack,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    zIndex: 10,
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
    overflow: 'hidden',
    marginRight: 15,
    // Add futuristic glow
    shadowColor: COLORS.pokedexAmberGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
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
    shadowColor: COLORS.pokedexAmberGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 2,
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