import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import KanjiScanner from './components/camera/KanjiScanner';
import { COLORS } from './constants/colors';
import PokedexLayout from './components/shared/PokedexLayout';
import { Asset } from 'expo-asset';

import { logger } from './utils/logger';
// 1. Import the logo image
const worddexLogo = require('../assets/images/worddexlogo.png'); // Adjusted path

export default function App() {
  // Use a counter instead of boolean so each swipe creates a new trigger value
  // This allows the animation to restart immediately even if previous animation is still running
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(0);
  // Logo is always visible - simplified from complex content-ready sync
  const [logoVisible, setLogoVisible] = useState(true);
  const [logoUri, setLogoUri] = useState<string | null>(null);

  // Callback to trigger the light animation
  const handleCardSwipe = useCallback(() => {
    // Increment the counter to create a new trigger value
    // This ensures the animation starts immediately and cancels any running animation
    setTriggerLightAnimation(prev => prev + 1);
  }, []);

  // Callback for content readiness (used by KanjiScanner for other purposes)
  const handleContentReady = useCallback((isReady: boolean) => {
    logger.log('🖼️ [AppIndex] handleContentReady called with isReady:', isReady);
    // Logo visibility is no longer controlled by content readiness
    // It stays visible permanently after initial fade-in
  }, []);

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

  // Header is always visible - settings screen covers it with its own opaque background
  // This ensures instant visibility when navigating back (no delay)

  return (
    <PokedexLayout 
      logoSource={logoUri ? { uri: logoUri } : worddexLogo}
      logoVisible={logoVisible}
      showLights={true}
      logoStyle={{ 
        width: 80,
        height: 65,
        right: 20,
        top: 0
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
