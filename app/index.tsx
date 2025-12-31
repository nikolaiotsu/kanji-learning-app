import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import KanjiScanner from './components/camera/KanjiScanner';
import { COLORS } from './constants/colors';
import PokedexLayout from './components/shared/PokedexLayout';
import { Asset } from 'expo-asset';
import { useFocusEffect } from 'expo-router';

import { logger } from './utils/logger';
// 1. Import the logo image
const worddexLogo = require('../assets/images/worddexlogo.png'); // Adjusted path

export default function App() {
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(false);
  // Logo is always visible - simplified from complex content-ready sync
  const [logoVisible, setLogoVisible] = useState(true);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  
  // Track if screen is focused - hide PokedexLayout header when navigating away
  // This prevents the lights/logo from lingering during screen transitions
  const [isScreenFocused, setIsScreenFocused] = useState(true);

  // Callback to trigger the light animation
  const handleCardSwipe = useCallback(() => {
    // Just set the trigger to true and let the useEffect handle the reset
    setTriggerLightAnimation(true);
  }, []);

  // Callback for content readiness (used by KanjiScanner for other purposes)
  const handleContentReady = useCallback((isReady: boolean) => {
    logger.log('🖼️ [AppIndex] handleContentReady called with isReady:', isReady);
    // Logo visibility is no longer controlled by content readiness
    // It stays visible permanently after initial fade-in
  }, []);

  // Reset animation trigger after it's been activated
  useEffect(() => {
    if (triggerLightAnimation) {
      const timer = setTimeout(() => {
        setTriggerLightAnimation(false);
      }, 1500); // Allow more time for the animation sequence
      
      return () => clearTimeout(timer);
    }
  }, [triggerLightAnimation]);

  // Preload logo so it renders offline in development too
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const asset = Asset.fromModule(worddexLogo);
        if (!asset.downloaded) {
          await asset.downloadAsync();
        }
        if (isMounted) {
          setLogoUri(asset.localUri || asset.uri);
        }
      } catch {
        // Fallback to require-based source if preloading fails
        if (isMounted) setLogoUri(null);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Track screen focus to hide PokedexLayout header during navigation transitions
  // This is the industry standard approach: hide UI elements when screen loses focus
  useFocusEffect(
    useCallback(() => {
      // Screen gained focus - show the header
      logger.log('[AppIndex] Screen focused - showing PokedexLayout header');
      setIsScreenFocused(true);
      
      return () => {
        // Screen losing focus - hide the header IMMEDIATELY
        // This prevents the lights/logo from lingering during transition
        logger.log('[AppIndex] Screen blurred - hiding PokedexLayout header');
        setIsScreenFocused(false);
      };
    }, [])
  );

  return (
    // 2. Pass it to the logoSource prop and add logoStyle - synchronized with content readiness
    // showLights is controlled by isScreenFocused to hide header during navigation transitions
    <PokedexLayout 
      logoSource={logoUri ? { uri: logoUri } : worddexLogo}
      logoVisible={logoVisible && isScreenFocused}
      showLights={isScreenFocused}
      logoStyle={{ 
        width: 80, // Increased width from 100
        height: 65, // Increased height from 30
        right: 20,  // Restore balanced positioning (same as left padding of topSection)
        top: 0 // top position remains the same as default, can be adjusted if needed
      }}
      triggerLightAnimation={triggerLightAnimation}
    >
      <View
        style={styles.container}
        onLayout={(event) => {
          // const { x, y, width, height } = event.nativeEvent.layout;
          // logger.log(`[AppIndexRootView] onLayout: x:${x}, y:${y}, width:${width}, height:${height}`);
        }}
      >
        <KanjiScanner onCardSwipe={handleCardSwipe} onContentReady={handleContentReady} />
      </View>
    </PokedexLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Remove all shading effects
  },
});
